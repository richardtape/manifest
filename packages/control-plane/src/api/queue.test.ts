import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { events } from '../db/index.js'
import { ensureTestUser } from '../identity/testing.js'
import { vancouverDayInWords } from '../launch/index.js'
import { withAssessmentDraft } from '../launch/testing.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  loginAs,
  mutationHeaders,
  previewThenDecide,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

/**
 * AN OWNER ASKS FOR SIGN-OFF, AND AN ADMINISTRATOR SEES EVERYTHING WAITING ON THEM (the launch path
 * plan's Task 12; Spec action 5, FE-25) — through the routes: `requestApproval` on the release serving
 * staging, `listQueue` for administrators, and the checklist's `admin-approval` item dated from the
 * request. The derivations themselves are `launch/requests.test.ts`'s and `launch/queue.test.ts`'s.
 */

type Json = Record<string, unknown>
const NOTE = 'Week 3 — students start Monday'

/** A POST that must answer `expected` — a fixture step, which throws rather than asserting. */
async function post(
  ctx: TestProject,
  url: string,
  payload: Json,
  cookies: Record<string, string>,
  expected: number,
): Promise<Json> {
  const res = await ctx.app.inject({
    method: 'POST',
    url,
    payload,
    cookies,
    headers: mutationHeaders(ctx.deps),
  })
  if (res.statusCode !== expected)
    throw new Error(`POST ${url} answered ${res.statusCode}: ${res.body}`)
  return res.json() as Json
}

/** Built, released, and deployed to staging through the routes — the launch candidate. */
async function stage(ctx: TestProject): Promise<string> {
  const build = await post(
    ctx,
    `/v1/projects/${ctx.projectId}/builds`,
    {},
    ctx.ownerCookies,
    202,
  )
  await ctx.deps.builds.idle()
  const release = await post(
    ctx,
    `/v1/projects/${ctx.projectId}/releases`,
    { buildId: build.id },
    ctx.ownerCookies,
    201,
  )
  const staged = await post(
    ctx,
    `/v1/environments/${ctx.stagingEnvironmentId}/deploy`,
    { releaseId: release.id },
    ctx.ownerCookies,
    200,
  )
  if (staged.state !== 'healthy') throw new Error(`staging is ${String(staged.state)}`)
  return release.id as string
}

function ask(
  ctx: TestProject,
  releaseId: string,
  body: Json,
  credentials: { cookies?: Record<string, string>; bearer?: string } = {
    cookies: ctx.ownerCookies,
  },
) {
  return ctx.app.inject({
    method: 'POST',
    url: `/v1/releases/${releaseId}/approval-request`,
    payload: body,
    ...(credentials.cookies === undefined ? {} : { cookies: credentials.cookies }),
    headers: {
      ...mutationHeaders(ctx.deps),
      ...(credentials.bearer === undefined
        ? {}
        : { authorization: `Bearer ${credentials.bearer}` }),
    },
  })
}

interface QueueBody {
  items: {
    kind: string
    project: { id: string; slug: string; name: string; state: string }
    subjectId: string
    environment: string | null
    requestedBy: { id: string; displayName: string } | null
    since: string
    summary: string
    note: string | null
  }[]
  oldestSince: string | null
  truncated: boolean
}

async function queue(
  ctx: TestProject,
  credentials: { cookies?: Record<string, string>; bearer?: string },
) {
  return ctx.app.inject({
    method: 'GET',
    url: '/v1/queue',
    ...(credentials.cookies === undefined ? {} : { cookies: credentials.cookies }),
    ...(credentials.bearer === undefined
      ? {}
      : { headers: { authorization: `Bearer ${credentials.bearer}` } }),
  })
}

/** The administrator's read of the queue, this test's project's items only. */
async function waiting(ctx: TestProject): Promise<QueueBody['items']> {
  const res = await queue(ctx, { cookies: await loginAs(ctx.deps, 'platform_admin') })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as QueueBody).items.filter((i) => i.project.id === ctx.projectId)
}

async function adminApproval(ctx: TestProject) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.projectId}/launch-readiness`,
    cookies: ctx.ownerCookies,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (
    res.json() as {
      items: { id: string; state: string; since: string | null; why: string }[]
    }
  ).items.find((i) => i.id === 'admin-approval')!
}

describe('an owner asks for sign-off (Task 12, FE-25)', () => {
  it('an owner asks for sign-off on the release serving staging; an administrator sees it waiting, with its note', async () => {
    await withProjectServer(async (ctx) => {
      const releaseId = await stage(ctx)
      const res = await ask(ctx, releaseId, { note: NOTE })
      expect(res.statusCode, res.body).toBe(200)
      const asked = res.json() as Json
      expect(asked).toMatchObject({
        releaseId,
        projectId: ctx.projectId,
        requestedBy: { id: ctx.userId, displayName: 'Bio Prof' },
        viaToken: null,
        open: true,
      })
      // THE NOTE IS THE ADMINISTRATORS' ALONE — not even the asker's answer carries it.
      expect(asked).not.toHaveProperty('note')
      expect(res.body).not.toContain('Week 3')

      const admin = await queue(ctx, {
        cookies: await loginAs(ctx.deps, 'platform_admin'),
      })
      expect(admin.statusCode, admin.body).toBe(200)
      const body = admin.json() as QueueBody
      const mine = body.items.filter((i) => i.project.id === ctx.projectId)
      expect(mine).toEqual([
        expect.objectContaining({
          kind: 'release-approval',
          subjectId: releaseId,
          environment: null,
          requestedBy: { id: ctx.userId, displayName: 'Bio Prof' },
          since: asked.createdAt,
          note: NOTE,
          summary:
            'Bio Prof asked for the release serving staging to be approved for the app’s first production launch.',
        }),
      ])
      expect(mine[0]!.project).toMatchObject({ id: ctx.projectId, state: 'active' })
      expect(body.oldestSince).toBe(body.items[0]!.since)
      expect(body.truncated).toBe(false)

      const published = await ctx.db
        .select()
        .from(events)
        .where(
          and(eq(events.projectId, ctx.projectId), eq(events.type, 'approval.requested')),
        )
      expect(published).toHaveLength(1)
      expect(published[0]!.machineDetail).toEqual({
        requestId: asked.id,
        releaseId,
        viaToken: false,
      })
      expect(published[0]!.machineDetail).not.toHaveProperty('note')
      expect(published[0]!.humanMessage).not.toContain('Week 3')
    })
  })

  it('a second ask answers the first request, 200, and the queue holds one item', async () => {
    await withProjectServer(async (ctx) => {
      const releaseId = await stage(ctx)
      const first = await ask(ctx, releaseId, { note: NOTE })
      expect(first.statusCode, first.body).toBe(200)
      const collaborator = await sessionFor(ctx, 'bio_colleague', 'collaborator')
      const second = await ask(
        ctx,
        releaseId,
        { note: 'again' },
        { cookies: collaborator },
      )
      expect(second.statusCode, second.body).toBe(200)
      expect((second.json() as Json).id).toBe((first.json() as Json).id)
      // The first ask's person, and its note, stand.
      expect((second.json() as Json).requestedBy).toMatchObject({
        displayName: 'Bio Prof',
      })
      const items = await waiting(ctx)
      expect(items).toHaveLength(1)
      expect(items[0]!.note).toBe(NOTE)
    })
  })

  it('refuses a release that is not the candidate — RELEASE_NOT_STAGED, with the checklist naming the one that is', async () => {
    await withProjectServer(async (ctx) => {
      const first = await stage(ctx)
      const second = await stage(ctx)
      const res = await ask(ctx, first, {})
      expect(refusal(res)).toEqual({ status: 409, code: 'RELEASE_NOT_STAGED' })
      expect(
        (res.json() as { error: { launchReadiness: { candidateReleaseId: string } } })
          .error.launchReadiness.candidateReleaseId,
      ).toBe(second)
      // THE POSITIVE CONTROL: the candidate itself may be asked about.
      expect((await ask(ctx, second, {})).statusCode).toBe(200)
    })
  })

  it('refuses when no approval is needed — APPROVAL_NOT_NEEDED — and a release an administrator rejected — RELEASE_REJECTED', async () => {
    await withProjectServer(async (ctx) => {
      const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
      const approved = await stage(ctx)
      const decided = await previewThenDecide(
        ctx.app,
        ctx.deps,
        admin,
        approved,
        'approve',
      )
      expect(decided.statusCode, decided.body).toBe(201)
      const notNeeded = await ask(ctx, approved, {})
      expect(refusal(notNeeded)).toEqual({ status: 409, code: 'APPROVAL_NOT_NEEDED' })
      expect(notNeeded.body).toContain('Approved by an administrator on')

      const rejected = await stage(ctx)
      const no = await previewThenDecide(ctx.app, ctx.deps, admin, rejected, 'reject', {
        reason: 'the consent page is missing',
      })
      expect(no.statusCode, no.body).toBe(201)
      const refused = await ask(ctx, rejected, {})
      expect(refusal(refused)).toEqual({ status: 409, code: 'RELEASE_REJECTED' })
      expect(refused.body).toContain('the consent page is missing')
      expect(await waiting(ctx)).toEqual([])
    })
  })

  it('a request closes when the release is approved, and when it stops being the candidate', async () => {
    await withProjectServer(async (ctx) => {
      const first = await stage(ctx)
      expect((await ask(ctx, first, {})).statusCode).toBe(200)
      expect(await waiting(ctx)).toHaveLength(1)
      // ANOTHER RELEASE SERVES STAGING: the request is closed, and the new one is the one to ask about.
      const second = await stage(ctx)
      expect(await waiting(ctx)).toEqual([])
      expect((await adminApproval(ctx)).since).toBeNull()
      expect((await ask(ctx, second, {})).statusCode).toBe(200)
      expect((await waiting(ctx)).map((i) => i.subjectId)).toEqual([second])
      // APPROVED: answered, so nothing waits.
      const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
      const decided = await previewThenDecide(ctx.app, ctx.deps, admin, second, 'approve')
      expect(decided.statusCode, decided.body).toBe(201)
      expect(await waiting(ctx)).toEqual([])
    })
  })

  it('the checklist’s admin-approval item says who asked and when, and waits since then', async () => {
    await withProjectServer(async (ctx) => {
      const releaseId = await stage(ctx)
      const before = await adminApproval(ctx)
      expect(before).toMatchObject({ state: 'unmet', since: null })
      const asked = (await ask(ctx, releaseId, { note: NOTE })).json() as Json
      const after = await adminApproval(ctx)
      expect(after.state).toBe('unmet')
      expect(after.since).toBe(asked.createdAt)
      expect(after.why).toContain(
        `Bio Prof asked an administrator to approve it on ${vancouverDayInWords(new Date(asked.createdAt as string))}.`,
      )
      expect(after.why).not.toContain('Week 3')
    })
  })

  it('an agent on its person’s token may ask — approval:request is mintable — and the queue says an agent asked', async () => {
    await withProjectServer(async (ctx) => {
      const releaseId = await stage(ctx)
      const minted = await post(
        ctx,
        `/v1/projects/${ctx.projectId}/tokens`,
        {
          name: 'launch helper',
          capabilities: ['project:read', 'approval:request'],
          expiresInDays: 1,
        },
        ctx.ownerCookies,
        201,
      )
      // A token without it is refused, by the capability's code.
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      expect(refusal(await ask(ctx, releaseId, {}, { bearer: plaintext }))).toEqual({
        status: 403,
        code: 'FORBIDDEN',
      })
      const res = await ask(ctx, releaseId, {}, { bearer: minted.secret as string })
      expect(res.statusCode, res.body).toBe(200)
      expect((res.json() as Json).viaToken).toEqual({
        id: (minted.token as Json).id,
        name: 'launch helper',
      })
      const items = await waiting(ctx)
      expect(items[0]!.summary).toBe(
        'An agent on Bio Prof’s token asked for the release serving staging to be approved for the app’s first production launch.',
      )
      expect(items[0]!.requestedBy).toMatchObject({ displayName: 'Bio Prof' })
    })
  })

  it('a stranger is answered 404 NOT_FOUND; a release that does not exist too; a note past 500 characters is refused', async () => {
    await withProjectServer(async (ctx) => {
      const releaseId = await stage(ctx)
      const stranger = await loginAs(ctx.deps, 'unrelated_user')
      expect(refusal(await ask(ctx, releaseId, {}, { cookies: stranger }))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
      expect(refusal(await ask(ctx, '00000000-0000-4000-8000-000000000000', {}))).toEqual(
        { status: 404, code: 'NOT_FOUND' },
      )
      expect(refusal(await ask(ctx, releaseId, { note: 'x'.repeat(501) }))).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      expect(await waiting(ctx)).toEqual([])
      // THE POSITIVE CONTROL: 500 characters exactly is a note.
      expect((await ask(ctx, releaseId, { note: 'x'.repeat(500) })).statusCode).toBe(200)
    })
  })

  it('an archived project is refused — PROJECT_ARCHIVED', async () => {
    await withProjectServer(async (ctx) => {
      const releaseId = await stage(ctx)
      const archived = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/archive`,
        cookies: ctx.ownerSteppedUp,
        headers: mutationHeaders(ctx.deps),
      })
      expect(archived.statusCode, archived.body).toBe(200)
      expect(refusal(await ask(ctx, releaseId, {}))).toEqual({
        status: 409,
        code: 'PROJECT_ARCHIVED',
      })
    })
  })
})

describe('the administrators’ queue (Task 12)', () => {
  it('holds submitted registrations and assessments, oldest first, with the environment', async () => {
    await withProjectServer(async (ctx) => {
      const admin = await loginAs(ctx.deps, 'platform_admin')
      // The owner says the assessment was sent two days ago…
      await withAssessmentDraft(ctx.db, {
        projectId: ctx.projectId,
        createdAt: new Date(Date.now() - 5 * 86_400_000),
      })
      const sent = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Vancouver',
      }).format(new Date(Date.now() - 2 * 86_400_000))
      await post(
        ctx,
        `/v1/projects/${ctx.projectId}/launch-records/privacy-assessment/submission`,
        { sentAt: sent, reference: 'PIA-2026-0088' },
        ctx.ownerCookies,
        200,
      )
      // …and an administrator records staging's registration sent today.
      await post(
        ctx,
        `/v1/projects/${ctx.projectId}/launch-records/iam-registration`,
        {
          environment: 'staging',
          entityId: 'https://manifest.internal/sp/fixture/staging',
          acsUrl: 'https://fixture.staging.manifest.internal/auth/ubcshib/callback',
          sloUrl: 'https://fixture.staging.manifest.internal/auth/logout',
          registeredAttributes: ['ubcEduCwlPuid', 'mail'],
          state: 'submitted',
        },
        admin,
        200,
      )
      const items = await waiting(ctx)
      expect(items.map((i) => [i.kind, i.environment])).toEqual([
        ['privacy-assessment', null],
        ['iam-registration', 'staging'],
      ])
      expect(items[0]!.requestedBy).toMatchObject({ displayName: 'Bio Prof' })
      expect(items[1]!.requestedBy).toMatchObject({ displayName: 'Platform Admin' })
      expect(Date.parse(items[0]!.since)).toBeLessThan(Date.parse(items[1]!.since))

      // UBC comes back to the owner with questions: the owner's move — off the queue, and the record says so.
      await post(
        ctx,
        `/v1/projects/${ctx.projectId}/launch-records/iam-registration`,
        {
          environment: 'staging',
          entityId: 'https://manifest.internal/sp/fixture/staging',
          acsUrl: 'https://fixture.staging.manifest.internal/auth/ubcshib/callback',
          sloUrl: 'https://fixture.staging.manifest.internal/auth/logout',
          registeredAttributes: ['ubcEduCwlPuid', 'mail'],
          state: 'change_requested',
        },
        admin,
        200,
      )
      expect((await waiting(ctx)).map((i) => i.kind)).toEqual(['privacy-assessment'])
      const records = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/launch-records`,
        cookies: ctx.ownerCookies,
      })
      expect(
        (records.json() as { stagingRegistration: Json }).stagingRegistration,
      ).toMatchObject({ state: 'change_requested', changeRequestedFrom: 'submitted' })
    })
  })

  it('is refused to an owner — FORBIDDEN — and to a token — TOKEN_CREDENTIAL_REFUSED', async () => {
    await withProjectServer(async (ctx) => {
      expect(refusal(await queue(ctx, { cookies: ctx.ownerCookies }))).toEqual({
        status: 403,
        code: 'FORBIDDEN',
      })
      const owner = await ensureTestUser(ctx.db, 'bio_prof')
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: owner.id,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      expect(refusal(await queue(ctx, { bearer: plaintext }))).toEqual({
        status: 403,
        code: 'TOKEN_CREDENTIAL_REFUSED',
      })
      // THE POSITIVE CONTROL: an administrator's session reads it.
      expect(
        (await queue(ctx, { cookies: await loginAs(ctx.deps, 'platform_admin') }))
          .statusCode,
      ).toBe(200)
    })
  })
})
