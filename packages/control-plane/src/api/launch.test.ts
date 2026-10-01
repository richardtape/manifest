import { randomUUID, X509Certificate } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { events } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { addMember } from '../projects/index.js'
import { writeFiles } from '../source/testing.js'
import {
  vancouverDaysAgo,
  vancouverToday,
  withAssessmentDraft,
  withDraft,
} from '../launch/testing.js'
import { vancouverNoon } from '../launch/index.js'
import { mintTestToken } from '../tokens/testing.js'
import { buildServer, type ServerDeps } from './server.js'
import {
  commitManifest,
  cwlFakes,
  cwlManifest,
  loginAs,
  mutationHeaders,
  projectBody,
  refusal,
  sessionFor,
  testDeps,
  withProjectServer,
  type TestProject,
} from './testing.js'

/**
 * THE THREE CLOCKS' RECORDS THROUGH THE ROUTES (the launch path plan's Task 9; Spec actions 3 and
 * 9): an owner's *"I've sent it"* for a registration per environment and for the privacy
 * assessment, the order UBC works in, and the checklist saying how long each has waited. The
 * DRAFT a submission needs is Task 10's and Task 11's, so these tests write it to the row
 * (`launch/testing.ts`).
 */

type Json = Record<string, unknown>

const IAM_BODY = (ctx: TestProject, environment: 'staging' | 'production') => ({
  entityId: `${ctx.deps.config.idp.spEntityBase}/sp/fixture/${environment}`,
  acsUrl: `https://fixture.${environment}.manifest.internal/auth/ubcshib/callback`,
  sloUrl: `https://fixture.${environment}.manifest.internal/auth/logout`,
  registeredAttributes: ['ubcEduCwlPuid', 'mail'],
})

/** An administrator, in their own session, recording what UBC said. */
async function adminRecords(
  ctx: TestProject,
  kind: 'iam-registration' | 'privacy-assessment',
  payload: Json,
) {
  const admin = await loginAs(ctx.deps, 'platform_admin')
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/launch-records/${kind}`,
    payload,
    cookies: admin,
    headers: mutationHeaders(ctx.deps),
  })
  if (res.statusCode !== 200)
    throw new Error(`recording ${kind} answered ${res.statusCode}: ${res.body}`)
  return res.json() as Json
}

const piaApproved = async (ctx: TestProject) => {
  for (const state of ['submitted', 'approved'] as const)
    await adminRecords(ctx, 'privacy-assessment', {
      state,
      reviewer: 'K. Privacy',
      externalTicketRef: 'PIA-2026-0088',
    })
}

const stagingActive = async (ctx: TestProject) => {
  for (const state of ['submitted', 'active'] as const)
    await adminRecords(ctx, 'iam-registration', {
      ...IAM_BODY(ctx, 'staging'),
      environment: 'staging',
      state,
    })
}

function submit(
  ctx: TestProject,
  what: 'staging' | 'production' | 'privacy-assessment',
  body: Json,
  credentials: { cookies?: Record<string, string>; bearer?: string },
) {
  const url =
    what === 'privacy-assessment'
      ? `/v1/projects/${ctx.projectId}/launch-records/privacy-assessment/submission`
      : `/v1/projects/${ctx.projectId}/launch-records/iam-registration/${what}/submission`
  return ctx.app.inject({
    method: 'POST',
    url,
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

async function readiness(ctx: TestProject) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.projectId}/launch-readiness`,
    cookies: ctx.ownerCookies,
  })
  return res.json() as {
    items: { id: string; state: string; since: string | null; why: string }[]
  }
}

async function records(ctx: TestProject) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.projectId}/launch-records`,
    cookies: ctx.ownerCookies,
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as {
    iamRegistration: Json | null
    stagingRegistration: Json | null
    privacyAssessment: Json | null
  }
}

describe('an owner says “I’ve sent it” (Task 9)', () => {
  it('an owner says the production registration was sent; it waits since that day, and the checklist says so', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await stagingActive(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'production' })
      const today = vancouverToday()
      const res = await submit(
        ctx,
        'production',
        { sentAt: today, reference: 'IAM-2026-0500' },
        { cookies: ctx.ownerCookies },
      )
      expect(res.statusCode, res.body).toBe(200)
      const sentAt = vancouverNoon(today).toISOString()
      expect(res.json()).toMatchObject({
        environment: 'production',
        state: 'submitted',
        submittedAt: sentAt,
        submittedBy: { id: ctx.userId, displayName: 'Bio Prof' },
        externalTicketRef: 'IAM-2026-0500',
      })
      const item = (await readiness(ctx)).items.find((i) => i.id === 'iam-registration')!
      expect(item).toMatchObject({ state: 'unmet', since: sentAt })
      const inWords = new Intl.DateTimeFormat('en-CA', {
        dateStyle: 'long',
        timeZone: 'America/Vancouver',
      }).format(new Date(sentAt))
      expect(item.why).toContain(`sent to UBC IAM on ${inWords}`)
      // ONE READ, BOTH REGISTRATIONS: staging is its own record, beside production's.
      const both = await records(ctx)
      expect(both.iamRegistration).toMatchObject({
        environment: 'production',
        state: 'submitted',
      })
      expect(both.stagingRegistration).toMatchObject({
        environment: 'staging',
        state: 'active',
      })
      expect(both.stagingRegistration?.id).not.toBe(both.iamRegistration?.id)
      expect(both.iamRegistration?.createdAt).toEqual(expect.any(String))
    })
  })

  it('an owner says the privacy assessment was sent; it waits since that day', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const res = await submit(
        ctx,
        'privacy-assessment',
        { reference: 'PIA-2026-0101' },
        { cookies: ctx.ownerCookies },
      )
      expect(res.statusCode, res.body).toBe(200)
      const sentAt = vancouverNoon(vancouverToday()).toISOString()
      expect(res.json()).toMatchObject({
        state: 'submitted',
        submittedAt: sentAt,
        submittedBy: { displayName: 'Bio Prof' },
        externalTicketRef: 'PIA-2026-0101',
      })
      const item = (await readiness(ctx)).items.find(
        (i) => i.id === 'privacy-assessment',
      )!
      expect(item).toMatchObject({ state: 'unmet', since: sentAt })
    })
  })

  it('refuses a submission with no draft — 409 LAUNCH_DRAFT_REQUIRED', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      const refused = await submit(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
      expect(refusal(refused)).toEqual({ status: 409, code: 'LAUNCH_DRAFT_REQUIRED' })
      expect((await records(ctx)).stagingRegistration).toBeNull()
      // THE POSITIVE CONTROL: the same request once the draft exists.
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      const sent = await submit(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
      expect(refusal(sent)).toEqual({ status: 200, code: undefined })
    })
  })

  it('refuses a sentAt in the future, or before the draft — 400 LAUNCH_SENT_AT_INVALID — and one not a date — 400 REQUEST_INVALID', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      const as = { cookies: ctx.ownerCookies }
      expect(
        refusal(await submit(ctx, 'staging', { sentAt: vancouverDaysAgo(-2) }, as)),
      ).toEqual({ status: 400, code: 'LAUNCH_SENT_AT_INVALID' })
      expect(
        refusal(await submit(ctx, 'staging', { sentAt: vancouverDaysAgo(9) }, as)),
      ).toEqual({ status: 400, code: 'LAUNCH_SENT_AT_INVALID' })
      expect(
        refusal(await submit(ctx, 'staging', { sentAt: 'last Tuesday' }, as)),
      ).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      // The whole-branch review's I2: shaped like a day and not one — refused, never rolled over to
      // March 2 (or to a month before the draft).
      for (const impossible of ['2026-02-30', '2026-00-15', '2025-13-01'])
        expect(
          refusal(await submit(ctx, 'staging', { sentAt: impossible }, as)),
          impossible,
        ).toEqual({ status: 400, code: 'REQUEST_INVALID' })
      // Positive control: today.
      expect(
        refusal(await submit(ctx, 'staging', { sentAt: vancouverToday() }, as)),
      ).toEqual({ status: 200, code: undefined })
    })
  })

  it('refuses a token outright — TOKEN_CREDENTIAL_REFUSED, before the project is read — and a collaborator may submit', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      const owner = await ensureTestUser(ctx.db, 'bio_prof')
      // A token row HOLDING `launch:submit` — written directly, since the mint route refuses it.
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: owner.id,
        projectId: ctx.projectId,
        capabilities: ['project:read', 'launch:submit'],
      })
      expect(refusal(await submit(ctx, 'staging', {}, { bearer: plaintext }))).toEqual({
        status: 403,
        code: 'TOKEN_CREDENTIAL_REFUSED',
      })
      expect((await records(ctx)).stagingRegistration).toMatchObject({ state: 'draft' })
      const collaborator = await sessionFor(ctx, 'bio_colleague', 'collaborator')
      const sent = await submit(ctx, 'staging', {}, { cookies: collaborator })
      expect(sent.statusCode, sent.body).toBe(200)
      expect(sent.json()).toMatchObject({ submittedBy: { displayName: 'Bio Colleague' } })
    })
  })

  it('a stranger is answered 404 NOT_FOUND, and learns nothing', async () => {
    await withProjectServer(async (ctx) => {
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      const stranger = await sessionFor(ctx, 'unrelated_user')
      expect(refusal(await submit(ctx, 'staging', {}, { cookies: stranger }))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
    })
  })

  it('UBC’s order — both registrations wait for the assessment, production for staging too — and each refusal names its code', async () => {
    await withProjectServer(async (ctx) => {
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'production' })
      const as = { cookies: ctx.ownerCookies }
      expect(refusal(await submit(ctx, 'staging', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_PIA_NOT_APPROVED',
      })
      // The whole-branch review's I3: "neither of an app's registrations is sent until the assessment
      // is approved" — production's waits for it FIRST, before staging's.
      expect(refusal(await submit(ctx, 'production', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_PIA_NOT_APPROVED',
      })
      await piaApproved(ctx)
      expect(refusal(await submit(ctx, 'production', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_STAGING_NOT_REGISTERED',
      })
      // Task 10's review, I2: these drafts were made before the assessment was approved, so they do
      // not carry the PIA number UBC IAM asks for — drafted again, they do.
      expect(refusal(await submit(ctx, 'staging', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_DRAFT_STALE',
      })
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'production' })
      expect(refusal(await submit(ctx, 'staging', {}, as))).toEqual({
        status: 200,
        code: undefined,
      })
      // Sent is not registered: production still waits.
      expect(refusal(await submit(ctx, 'production', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_STAGING_NOT_REGISTERED',
      })
      await adminRecords(ctx, 'iam-registration', {
        ...IAM_BODY(ctx, 'staging'),
        environment: 'staging',
        state: 'active',
      })
      expect(refusal(await submit(ctx, 'production', {}, as))).toEqual({
        status: 200,
        code: undefined,
      })
    })
  })

  it('refuses a second submission of a submitted record — 409 LAUNCH_TRANSITION_INVALID', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const as = { cookies: ctx.ownerCookies }
      expect(refusal(await submit(ctx, 'privacy-assessment', {}, as)).status).toBe(200)
      expect(refusal(await submit(ctx, 'privacy-assessment', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_TRANSITION_INVALID',
      })
    })
  })
})

describe('UBC’s answers stay an administrator’s record (Task 9)', () => {
  it('an owner cannot record UBC’s answer — 403 FORBIDDEN, and is told an administrator records it', async () => {
    await withProjectServer(async (ctx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/launch-records/iam-registration`,
        payload: { ...IAM_BODY(ctx, 'production'), state: 'submitted' },
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(refusal(res)).toEqual({ status: 403, code: 'FORBIDDEN' })
      // `[M8]`: an owner cannot be granted this by any project owner, so the hint says who can.
      const hint = (res.json() as { error: { hint?: string } }).error.hint
      expect(hint).toMatch(/platform administrator/)
      expect(hint).not.toMatch(/project owner/)
    })
  })

  it('the administrator’s record route is unchanged, defaults to production, and records staging when asked', async () => {
    await withProjectServer(async (ctx) => {
      const production = await adminRecords(ctx, 'iam-registration', {
        ...IAM_BODY(ctx, 'production'),
        state: 'submitted',
        externalTicketRef: 'IAM-1',
      })
      expect(production).toMatchObject({ environment: 'production', state: 'submitted' })
      expect((await records(ctx)).stagingRegistration).toBeNull()
      const staging = await adminRecords(ctx, 'iam-registration', {
        ...IAM_BODY(ctx, 'staging'),
        environment: 'staging',
        state: 'submitted',
        externalTicketRef: 'IAM-2',
      })
      expect(staging).toMatchObject({
        environment: 'staging',
        externalTicketRef: 'IAM-2',
      })
      const both = await records(ctx)
      expect(both.iamRegistration).toMatchObject({ externalTicketRef: 'IAM-1' })
      expect(both.stagingRegistration).toMatchObject({ externalTicketRef: 'IAM-2' })
      // The administrator who recorded the move into `submitted` is who the record names.
      expect(both.iamRegistration?.submittedBy).toMatchObject({
        displayName: 'Platform Admin',
      })
    })
  })
})

/**
 * THE SUBMISSION AND WHAT IT READS ARE ONE DECISION (the whole-branch review's I1). Each was a read,
 * a check, then an UPDATE by id — so a write landing between them was overwritten (a second "I've sent
 * it" moving the day the clock started) or let a submission through a gate that had just closed.
 * DETERMINISTIC, as `api/members.test.ts`'s: a second connection holds the row the submission reads,
 * the submission is sent, and the holder changes the row and COMMITS once the submission is seen
 * waiting on it. Each case's positive control is the earlier tests' same submission, unheld.
 */
describe('a submission and an administrator’s write cannot interleave (the whole-branch review’s I1)', () => {
  it('a registration moved to submitted while the owner’s submission waits is not submitted again — 409 LAUNCH_TRANSITION_INVALID, the first stamp kept', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      const draft = await withDraft(ctx.db, {
        projectId: ctx.projectId,
        environment: 'staging',
      })
      const first = '2026-09-01T19:00:00.000Z'
      let answered: Awaited<ReturnType<typeof submit>> | undefined
      await holdingThen(
        'SELECT 1 FROM iam_registrations WHERE id = $1 FOR UPDATE',
        [draft.id],
        // What an administrator's record of the request does in the window.
        `UPDATE iam_registrations SET state = 'submitted', submitted_at = '${first}' WHERE id = '${draft.id}'`,
        async (lock) => {
          const submitting = submit(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
          await until(
            () => lock.waitedOn('%iam_registrations%'),
            'the submission waiting on the held registration',
          )
          await lock.commit()
          answered = await submitting
        },
      )
      expect(refusal(answered!)).toEqual({
        status: 409,
        code: 'LAUNCH_TRANSITION_INVALID',
      })
      const staging = (await records(ctx)).stagingRegistration
      expect(staging).toMatchObject({ state: 'submitted', submittedAt: first })
      expect(await submittedEvents(ctx)).toBe(0)
    })
  })

  it('an assessment moved back to draft while the staging submission waits refuses it — 409 LAUNCH_PIA_NOT_APPROVED', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      let answered: Awaited<ReturnType<typeof submit>> | undefined
      await holdingThen(
        'SELECT 1 FROM privacy_assessments WHERE project_id = $1 FOR UPDATE',
        [ctx.projectId],
        // An administrator recording the Privacy Office reopening it (`approved → draft`).
        `UPDATE privacy_assessments SET state = 'draft', approved_at = NULL WHERE project_id = '${ctx.projectId}'`,
        async (lock) => {
          const submitting = submit(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
          await until(
            () => lock.waitedOn('%privacy_assessments%'),
            'the submission’s read of the assessment waiting on the held assessment',
          )
          await lock.commit()
          answered = await submitting
        },
      )
      expect(refusal(answered!)).toEqual({ status: 409, code: 'LAUNCH_PIA_NOT_APPROVED' })
      expect((await records(ctx)).stagingRegistration).toMatchObject({ state: 'draft' })
    })
  })
})

describe('an administrator’s record keeps the owner’s reference (the whole-branch review’s M2)', () => {
  it('recording UBC’s answer without a ticket keeps the reference the owner sent; one given replaces it', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const sent = await submit(
        ctx,
        'privacy-assessment',
        { reference: 'PIA-2026-0101' },
        { cookies: ctx.ownerCookies },
      )
      expect(sent.statusCode, sent.body).toBe(200)
      const approved = await adminRecords(ctx, 'privacy-assessment', {
        state: 'approved',
      })
      // Kept — so the staging gate still finds the PIA number the owner gave.
      expect(approved).toMatchObject({
        state: 'approved',
        externalTicketRef: 'PIA-2026-0101',
      })
      const replaced = await adminRecords(ctx, 'privacy-assessment', {
        state: 'approved',
        externalTicketRef: 'PIA-2026-0102',
      })
      expect(replaced).toMatchObject({ externalTicketRef: 'PIA-2026-0102' })
    })
  })
})

/**
 * D19'S REGISTRATION PACKAGE THROUGH THE ROUTE (the launch path plan's Task 10; Spec action 4): a CWL
 * app's owner — or an agent on their token — drafts the staging or production registration, and
 * Manifest generates what UBC IAM receives: the environment's entity and URLs, its own certificate,
 * every attribute with where the app reads it, the contacts and the PIA number. Over `cwlFakes`, for
 * their reason — and since Task 10 its registrar keeps the keypair where the real one does, so the
 * certificate it registers is the environment's own.
 */
interface CwlProject {
  app: Awaited<ReturnType<typeof buildServer>>
  deps: ServerDeps
  ownerCookies: Record<string, string>
  project: {
    id: string
    slug: string
    environments: { id: string; kind: string; hostname: string }[]
  }
  /** The commit the CWL manifest was validated at — the newest valid manifest's. */
  commitSha: string
}

/** The app's own reads, which the search must find exactly: `routes/people.js:3`, `public/app.js:2`. */
const APP_CODE = {
  'routes/people.js': [
    '// Who is signed in: the friendly names the blueprint’s bridge gives the app.',
    'export function whoIs(req) {',
    '  return { id: req.user.user.ubcEduCwlPuid, name: req.user.user.givenName }',
    '}',
    '',
  ].join('\n'),
  'public/app.js': [
    "const me = await (await fetch('/me')).json()",
    "document.title = me.attributes?.mail ?? 'someone'",
    '',
  ].join('\n'),
}

/** A CWL app on `node-ts-mongo@1`, created through the route by its owner (who may build). */
async function withCwlProject(
  attributes: readonly string[],
  fn: (ctx: CwlProject) => Promise<void>,
  options: { deps?: (deps: ServerDeps) => ServerDeps } = {},
): Promise<void> {
  await resetDatabase()
  const base = await testDeps()
  const withFakes: ServerDeps = { ...base, ...cwlFakes(base) }
  const deps = options.deps === undefined ? withFakes : options.deps(withFakes)
  const app = await buildServer(deps)
  try {
    // The oldest administrator is the platform's contact when none is configured.
    await ensureTestUser(deps.db, 'platform_admin')
    const ownerCookies = await loginAs(deps, 'bio_prof')
    const slug = `cwl-${randomUUID().slice(0, 8)}`
    const created = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: projectBody(slug, { blueprint: 'node-ts-mongo@1' }),
      cookies: ownerCookies,
      headers: mutationHeaders(deps),
    })
    if (created.statusCode !== 201)
      throw new Error(
        `creating '${slug}' answered ${created.statusCode}: ${created.body}`,
      )
    const project = created.json() as CwlProject['project']
    await writeFiles(
      deps.source,
      deps.source.repositoryFor(slug),
      APP_CODE,
      'feat: who is signed in',
    )
    const { commitSha } = await commitManifest(
      { app, deps, cookies: ownerCookies, project },
      cwlManifest(slug, attributes),
      'feat: sign in with CWL',
    )
    await fn({ app, deps, ownerCookies, project, commitSha })
  } finally {
    await deps.builds.idle()
    await app.close()
  }
}

const hostOf = (ctx: CwlProject, kind: 'staging' | 'production') =>
  ctx.project.environments.find((e) => e.kind === kind)!.hostname

function draft(
  ctx: CwlProject,
  environment: 'staging' | 'production',
  credentials: { cookies?: Record<string, string>; bearer?: string } = {
    cookies: ctx.ownerCookies,
  },
) {
  return ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/launch-records/iam-registration/${environment}/draft`,
    ...(credentials.cookies === undefined ? {} : { cookies: credentials.cookies }),
    headers: {
      ...mutationHeaders(ctx.deps),
      ...(credentials.bearer === undefined
        ? {}
        : { authorization: `Bearer ${credentials.bearer}` }),
    },
  })
}

/** A POST that must answer `expected` — a fixture step, which throws rather than asserting. */
async function post(
  ctx: CwlProject,
  url: string,
  payload: Record<string, unknown>,
  cookies: Record<string, string>,
  expected = 200,
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

/** The CWL app built, released and deployed to staging — which makes it the launch candidate. */
async function stage(ctx: CwlProject): Promise<void> {
  const started = await post(
    ctx,
    `/v1/projects/${ctx.project.id}/builds`,
    {},
    ctx.ownerCookies,
    202,
  )
  await ctx.deps.builds.idle()
  const release = await post(
    ctx,
    `/v1/projects/${ctx.project.id}/releases`,
    { buildId: started.id },
    ctx.ownerCookies,
    201,
  )
  const staging = ctx.project.environments.find((e) => e.kind === 'staging')!
  const staged = await post(
    ctx,
    `/v1/environments/${staging.id}/deploy`,
    { releaseId: release.id },
    ctx.ownerCookies,
  )
  if (staged.state !== 'healthy') throw new Error(`staging is ${String(staged.state)}`)
}

async function cwlRecords(ctx: CwlProject) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.project.id}/launch-records`,
    cookies: ctx.ownerCookies,
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as {
    iamRegistration: Json | null
    stagingRegistration: Json | null
    privacyAssessment: Json | null
  }
}

async function cwlPiaApproved(ctx: CwlProject): Promise<void> {
  const admin = await loginAs(ctx.deps, 'platform_admin')
  for (const state of ['submitted', 'approved'] as const)
    await post(
      ctx,
      `/v1/projects/${ctx.project.id}/launch-records/privacy-assessment`,
      { state, reviewer: 'K. Privacy', externalTicketRef: 'PIA-2026-0088' },
      admin,
    )
}

/** The owner's *"I've sent it"* for the staging registration, today, with UBC's reference. */
const cwlSubmitStaging = (ctx: CwlProject, body: Json = {}) =>
  ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/launch-records/iam-registration/staging/submission`,
    payload: { reference: 'IAM-2026-0500', ...body },
    cookies: ctx.ownerCookies,
    headers: mutationHeaders(ctx.deps),
  })

/** Every audit row of one type for the project, oldest first. */
const eventsOf = (ctx: CwlProject, type: string) =>
  ctx.deps.db
    .select()
    .from(events)
    .where(and(eq(events.projectId, ctx.project.id), eq(events.type, type)))
    .orderBy(asc(events.createdAt))

interface Pkg {
  environment: string
  generatedAt: string
  fromCommit: string
  entityId: string
  acsUrl: string
  sloUrl: string
  certificate: { pem: string; fingerprint: string; expiresAt: string }
  attributes: {
    name: string
    oid: string
    purpose: string
    usedAt: { path: string; line: number }[]
    justification: string
    unused: boolean
  }[]
  usedAtTruncated: boolean
  contacts: {
    technical: { name: string; email: string }[]
    support: { name: string; email: string }[]
  }
  privacyAssessmentReference: string | null
  metadataXml: string
  warnings: string[]
}
const packageOf = (body: unknown) => (body as { package: Pkg }).package

const NO_PIA_NUMBER =
  'The privacy assessment’s PIA number is not recorded yet, and UBC IAM asks for it. Once an administrator records the assessment approved with its number, draft this again so the package carries it.'
const NO_CANDIDATE =
  'Nothing is serving staging yet, so this is drawn from the newest valid manifest. Production’s registration should describe the release you will launch: once it serves staging, draft this again.'
const PRIVATE_KEY = /-----BEGIN (RSA )?PRIVATE KEY/

describe('D19’s registration package (Task 10)', () => {
  it('drafts the staging package: staging’s entity, the certificate staging registers with, a justification per attribute', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail', 'givenName'], async (ctx) => {
      const res = await draft(ctx, 'staging')
      expect(res.statusCode, res.body).toBe(200)
      const staging = hostOf(ctx, 'staging')
      const entityId = `${ctx.deps.config.idp.spEntityBase}/sp/${ctx.project.slug}/staging`
      const urls = {
        entityId,
        acsUrl: `https://${staging}/auth/ubcshib/callback`,
        sloUrl: `https://${staging}/auth/logout`,
      }
      expect(res.json()).toMatchObject({
        environment: 'staging',
        state: 'draft',
        ...urls,
        // A draft registers nothing: UBC has not answered.
        registeredAttributes: [],
        registeredAt: null,
        submittedAt: null,
      })
      const pkg = packageOf(res.json())
      expect(pkg).toMatchObject({
        environment: 'staging',
        ...urls,
        fromCommit: ctx.commitSha,
        usedAtTruncated: false,
        privacyAssessmentReference: null,
        warnings: [NO_PIA_NUMBER],
        contacts: {
          technical: [{ name: 'Bio Prof', email: 'bio_prof@example.ubc.ca' }],
          support: [{ name: 'Platform Admin', email: 'platform_admin@example.ubc.ca' }],
        },
      })
      // Where the APP reads each one — never the blueprint's own bridge (its auth/attributes.js
      // reads `.ubcEduCwlPuid` itself, and is skipped).
      expect(pkg.attributes.map((a) => [a.name, a.usedAt, a.unused])).toEqual([
        ['ubcEduCwlPuid', [{ path: 'routes/people.js', line: 3 }], false],
        ['mail', [{ path: 'public/app.js', line: 2 }], false],
        ['givenName', [{ path: 'routes/people.js', line: 3 }], false],
      ])
      expect(pkg.attributes[1]!.justification).toMatch(
        /shows it to the person in the browser, in public\/app\.js:2\.$/,
      )
      // Staging's names only: production's entity and hostname appear nowhere in it.
      const whole = JSON.stringify(pkg)
      expect(whole).not.toContain(`/sp/${ctx.project.slug}/production`)
      expect(whole).not.toContain(`//${hostOf(ctx, 'production')}`)
      expect(pkg.metadataXml).toContain(`entityID="${entityId}"`)
      // The certificate is a real one, for this entity, and its fingerprint is its own.
      const cert = new X509Certificate(pkg.certificate.pem)
      expect(cert.fingerprint256).toBe(pkg.certificate.fingerprint)
      expect(cert.subjectAltName).toBe(`URI:${entityId}`)
      // Kept on the record, and announced without the attributes themselves.
      expect(packageOf((await cwlRecords(ctx)).stagingRegistration)).toEqual(pkg)
      const drafted = await eventsOf(ctx, 'iam_registration.drafted')
      expect(drafted.map((e) => e.machineDetail)).toEqual([
        {
          environment: 'staging',
          entityId,
          fromCommit: ctx.commitSha,
          attributeCount: 3,
          unusedCount: 0,
        },
      ])
      expect(drafted[0]!.humanMessage).toBe(
        "Bio Prof drafted this app's staging registration for UBC IAM, asking for 3 attribute(s).",
      )
    })
  })

  it('a package’s certificate is the one the environment registers with', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const drafted = packageOf((await draft(ctx, 'staging')).json()).certificate
      await stage(ctx)
      const registered = await eventsOf(ctx, 'sso.registered')
      const staging = registered.filter(
        (e) => e.subject === `sp:${ctx.project.slug}:staging`,
      )
      expect(staging).toHaveLength(1)
      expect(
        (staging[0]!.machineDetail as { certificateFingerprint: string })
          .certificateFingerprint,
      ).toBe(drafted.fingerprint)
      // Drafted again, the same certificate: the environment's keypair is made once (D20).
      expect(packageOf((await draft(ctx, 'staging')).json()).certificate).toEqual(drafted)
      // And production's is its own — a compromise is contained to one environment.
      const production = packageOf((await draft(ctx, 'production')).json()).certificate
      expect(production.fingerprint).not.toBe(drafted.fingerprint)
    })
  })

  it('an attribute the app never reads is flagged unused, with a warning to remove it before sending', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail', 'sn'], async (ctx) => {
      const pkg = packageOf((await draft(ctx, 'staging')).json())
      expect(pkg.attributes.find((a) => a.name === 'sn')).toMatchObject({
        unused: true,
        usedAt: [],
        justification:
          'The app asks for it and does not read it anywhere Manifest looked — remove it from `auth.attributes` before you send this.',
      })
      expect(pkg.warnings).toContain(
        'The app asks for sn and does not read it anywhere Manifest looked. Remove it from auth.attributes, validate the manifest and draft this again before you send it — UBC IAM asks why an app needs each attribute.',
      )
      // The positive control: what the app reads is not flagged.
      expect(pkg.attributes.find((a) => a.name === 'mail')!.unused).toBe(false)
      expect(
        (await eventsOf(ctx, 'iam_registration.drafted'))[0]!.machineDetail,
      ).toMatchObject({ attributeCount: 3, unusedCount: 1 })
    })
  })

  it('a submitted package is never regenerated — LAUNCH_RECORD_SUBMITTED — and a change_requested one is', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      // The assessment first, so the draft carries its PIA number (Task 10's review, I2).
      await cwlPiaApproved(ctx)
      const drafted = await draft(ctx, 'staging')
      const first = packageOf(drafted.json())
      // As a client sends it: naming the draft it showed the person (Task 10's review, I3).
      const sent = await cwlSubmitStaging(ctx, { draftGeneratedAt: first.generatedAt })
      expect(sent.statusCode, sent.body).toBe(200)
      expect(refusal(await draft(ctx, 'staging'))).toEqual({
        status: 409,
        code: 'LAUNCH_RECORD_SUBMITTED',
      })
      // The package sent is the package kept.
      expect(packageOf((await cwlRecords(ctx)).stagingRegistration)).toEqual(first)

      // UBC registers it — at an ACS path the app has since moved away from — and it is still kept.
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const registered = {
        environment: 'staging',
        entityId: first.entityId,
        acsUrl: `https://${hostOf(ctx, 'staging')}/auth/old/callback`,
        sloUrl: first.sloUrl,
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
      }
      const recordUrl = `/v1/projects/${ctx.project.id}/launch-records/iam-registration`
      await post(ctx, recordUrl, { ...registered, state: 'active' }, admin)
      expect(refusal(await draft(ctx, 'staging'))).toEqual({
        status: 409,
        code: 'LAUNCH_RECORD_SUBMITTED',
      })

      // An administrator files a change request: a new request is the point, so it drafts again.
      await post(
        ctx,
        recordUrl,
        {
          ...registered,
          state: 'change_requested',
          requestedAttributes: ['ubcEduCwlPuid', 'mail'],
        },
        admin,
      )
      const again = await draft(ctx, 'staging')
      expect(again.statusCode, again.body).toBe(200)
      // The record still says what UBC REGISTERED; only the package is new.
      expect(again.json()).toMatchObject({
        state: 'change_requested',
        acsUrl: registered.acsUrl,
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
      })
      const redrafted = packageOf(again.json())
      expect(redrafted.generatedAt > first.generatedAt).toBe(true)
      expect(redrafted.acsUrl).toBe(first.acsUrl)
      // And it still carries the PIA number the assessment was approved with.
      expect(redrafted.privacyAssessmentReference).toBe('PIA-2026-0088')
      expect(redrafted.warnings).not.toContain(NO_PIA_NUMBER)
    })
  })

  it('no answer carries a private key', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const bodies: string[] = []
      await cwlPiaApproved(ctx)
      for (const environment of ['staging', 'production'] as const) {
        const res = await draft(ctx, environment)
        expect(res.statusCode, res.body).toBe(200)
        bodies.push(res.body)
      }
      const sent = await cwlSubmitStaging(ctx)
      expect(sent.statusCode, sent.body).toBe(200)
      bodies.push(sent.body)
      await stage(ctx)
      for (const url of ['launch-records', 'launch-readiness']) {
        const res = await ctx.app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.project.id}/${url}`,
          cookies: ctx.ownerCookies,
        })
        bodies.push(res.body)
      }
      const audit = await ctx.deps.db
        .select()
        .from(events)
        .where(eq(events.projectId, ctx.project.id))
      bodies.push(JSON.stringify(audit))
      // The positive control: the certificates ARE there — the scan is reading the right bodies.
      expect(bodies.join('\n')).toContain('-----BEGIN CERTIFICATE-----')
      for (const body of bodies) expect(body).not.toMatch(PRIVATE_KEY)
    })
  })

  it('refuses an app that registers nothing — LAUNCH_NOT_CWL — and writes nothing', async () => {
    await withProjectServer(async (ctx) => {
      // `fixture-node@1` signs nobody in (`auth.provider: none`).
      for (const environment of ['staging', 'production'] as const) {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/launch-records/iam-registration/${environment}/draft`,
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
        })
        expect(refusal(res)).toEqual({ status: 409, code: 'LAUNCH_NOT_CWL' })
      }
      expect(await records(ctx)).toMatchObject({
        iamRegistration: null,
        stagingRegistration: null,
      })
    })
  })

  it('production is drawn from the launch candidate, and says so when there is none', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const early = packageOf((await draft(ctx, 'production')).json())
      expect(early.warnings).toContain(NO_CANDIDATE)
      expect(early.fromCommit).toBe(ctx.commitSha)
      expect(early.acsUrl).toBe(
        `https://${hostOf(ctx, 'production')}/auth/ubcshib/callback`,
      )

      await stage(ctx)
      // A newer manifest asks for more — but it is not what serves staging.
      const newer = await commitManifest(
        { app: ctx.app, deps: ctx.deps, cookies: ctx.ownerCookies, project: ctx.project },
        cwlManifest(ctx.project.slug, ['ubcEduCwlPuid', 'mail', 'givenName']),
        'feat: greet people by name',
      )
      const production = packageOf((await draft(ctx, 'production')).json())
      expect(production.attributes.map((a) => a.name)).toEqual(['ubcEduCwlPuid', 'mail'])
      expect(production.fromCommit).toBe(ctx.commitSha)
      expect(production.warnings).not.toContain(NO_CANDIDATE)
      // Staging is drawn from the newest valid manifest.
      const staging = packageOf((await draft(ctx, 'staging')).json())
      expect(staging.attributes.map((a) => a.name)).toEqual([
        'ubcEduCwlPuid',
        'mail',
        'givenName',
      ])
      expect(staging.fromCommit).toBe(newer.commitSha)
    })
  })

  it('an agent on its person’s token may draft — launch:draft is mintable — a collaborator may, and a stranger is answered 404', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const minted = await post(
        ctx,
        `/v1/projects/${ctx.project.id}/tokens`,
        {
          name: 'drafting agent',
          capabilities: ['project:read', 'launch:draft'],
          expiresInDays: 1,
        },
        ctx.ownerCookies,
        201,
      )
      const byToken = await draft(ctx, 'staging', { bearer: minted.secret as string })
      expect(byToken.statusCode, byToken.body).toBe(200)
      // A token without it is refused, by the capability's code.
      const owner = await ensureTestUser(ctx.deps.db, 'bio_prof')
      const { plaintext } = await mintTestToken(ctx.deps.db, {
        userId: owner.id,
        projectId: ctx.project.id,
        capabilities: ['project:read'],
      })
      expect(refusal(await draft(ctx, 'staging', { bearer: plaintext }))).toEqual({
        status: 403,
        code: 'FORBIDDEN',
      })
      const colleague = await ensureTestUser(ctx.deps.db, 'bio_colleague')
      await addMember(ctx.deps.db, ctx.project.id, colleague.id, 'collaborator')
      const byCollaborator = await draft(ctx, 'production', {
        cookies: await loginAs(ctx.deps, 'bio_colleague'),
      })
      expect(byCollaborator.statusCode, byCollaborator.body).toBe(200)
      // The collaborators stand beside the owner as technical contacts.
      expect(packageOf(byCollaborator.json()).contacts.technical).toEqual([
        { name: 'Bio Prof', email: 'bio_prof@example.ubc.ca' },
        { name: 'Bio Colleague', email: 'bio_colleague@example.ubc.ca' },
      ])
      const stranger = await loginAs(ctx.deps, 'unrelated_user')
      expect(refusal(await draft(ctx, 'staging', { cookies: stranger }))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
    })
  })

  it('the platform’s contacts are the configured ones when set', async () => {
    await withCwlProject(
      ['ubcEduCwlPuid', 'mail'],
      async (ctx) => {
        const pkg = packageOf((await draft(ctx, 'staging')).json())
        expect(pkg.contacts.support).toEqual([
          { name: 'IAM Desk', email: 'iam.desk@example.ubc.ca' },
          { name: 'Rich T', email: 'rich@example.ubc.ca' },
        ])
        expect(pkg.metadataXml).toContain(
          '<md:EmailAddress>iam.desk@example.ubc.ca</md:EmailAddress>',
        )
      },
      {
        deps: (deps) => ({
          ...deps,
          config: {
            ...deps.config,
            launchContacts: [
              { name: 'IAM Desk', email: 'iam.desk@example.ubc.ca' },
              { name: 'Rich T', email: 'rich@example.ubc.ca' },
            ],
          },
        }),
      },
    )
  })

  it('a re-draft waits for a submission holding the record, and then refuses it — LAUNCH_RECORD_SUBMITTED', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      expect((await draft(ctx, 'staging')).statusCode).toBe(200)
      const record = (await cwlRecords(ctx)).stagingRegistration as { id: string }
      let answered: Awaited<ReturnType<typeof draft>> | undefined
      await holdingThen(
        'SELECT 1 FROM iam_registrations WHERE id = $1 FOR UPDATE',
        [record.id],
        // What an owner's "I've sent it" does in the window.
        `UPDATE iam_registrations SET state = 'submitted', submitted_at = now() WHERE id = '${record.id}'`,
        async (lock) => {
          const drafting = draft(ctx, 'staging')
          await until(
            () => lock.waitedOn('%iam_registrations%'),
            'the re-draft waiting on the held registration',
          )
          await lock.commit()
          answered = await drafting
        },
      )
      expect(refusal(answered!)).toEqual({ status: 409, code: 'LAUNCH_RECORD_SUBMITTED' })
      expect(await eventsOf(ctx, 'iam_registration.drafted')).toHaveLength(1)
    })
  })
})

describe('what is sent is the draft the person read (Task 10’s whole-branch review, I2 and I3)', () => {
  it('a registration drafted before the assessment was approved is not sent — LAUNCH_DRAFT_STALE — until it is drafted again', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      // Week one: drafted before the Privacy Office answered, so without the PIA number.
      const early = packageOf((await draft(ctx, 'staging')).json())
      expect(early.privacyAssessmentReference).toBeNull()
      await cwlPiaApproved(ctx)
      expect(refusal(await cwlSubmitStaging(ctx))).toEqual({
        status: 409,
        code: 'LAUNCH_DRAFT_STALE',
      })
      expect((await cwlRecords(ctx)).stagingRegistration).toMatchObject({
        state: 'draft',
      })
      expect(await eventsOf(ctx, 'iam_registration.submitted')).toHaveLength(0)
      // THE POSITIVE CONTROL: drafted again, it carries the number — and is sent.
      const current = packageOf((await draft(ctx, 'staging')).json())
      expect(current.privacyAssessmentReference).toBe('PIA-2026-0088')
      const sent = await cwlSubmitStaging(ctx)
      expect(sent.statusCode, sent.body).toBe(200)
      expect(packageOf(sent.json()).privacyAssessmentReference).toBe('PIA-2026-0088')
    })
  })

  it('a submission names the draft it sent: one drafted since refuses it — LAUNCH_DRAFT_CHANGED — and the current one is accepted', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      await cwlPiaApproved(ctx)
      // Read on Monday and sent; drafted again on Wednesday by the agent.
      const read = packageOf((await draft(ctx, 'staging')).json())
      const since = packageOf((await draft(ctx, 'staging')).json())
      expect(since.generatedAt > read.generatedAt).toBe(true)
      expect(
        refusal(await cwlSubmitStaging(ctx, { draftGeneratedAt: read.generatedAt })),
      ).toEqual({ status: 409, code: 'LAUNCH_DRAFT_CHANGED' })
      expect((await cwlRecords(ctx)).stagingRegistration).toMatchObject({
        state: 'draft',
      })
      // THE POSITIVE CONTROL: the draft the person read is the one Manifest holds.
      const sent = await cwlSubmitStaging(ctx, { draftGeneratedAt: since.generatedAt })
      expect(sent.statusCode, sent.body).toBe(200)
      expect(packageOf(sent.json()).generatedAt).toBe(since.generatedAt)
    })
  })
})

describe('the day a person may say they sent it is the newest draft’s (Task 10; the whole-branch review’s M4)', () => {
  it('a re-drafted package moves the earliest day it can have been sent to the day it was made', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      // First drafted five days ago, drafted again today.
      await withDraft(ctx.db, {
        projectId: ctx.projectId,
        environment: 'staging',
        createdAt: new Date(Date.now() - 5 * 86_400_000),
        generatedAt: new Date(),
      })
      expect(
        refusal(
          await submit(
            ctx,
            'staging',
            { sentAt: vancouverDaysAgo(3) },
            { cookies: ctx.ownerCookies },
          ),
        ),
      ).toEqual({ status: 400, code: 'LAUNCH_SENT_AT_INVALID' })
      // The positive control: today, the draft's own day, is accepted.
      const sent = await submit(
        ctx,
        'staging',
        { sentAt: vancouverToday() },
        { cookies: ctx.ownerCookies },
      )
      expect(sent.statusCode, sent.body).toBe(200)
    })
  })
})

/** How many `iam_registration.submitted` events the project has, read as the database's owner. */
async function submittedEvents(ctx: TestProject): Promise<number> {
  const admin = new pg.Pool({ connectionString: process.env.MANIFEST_ADMIN_DATABASE_URL })
  try {
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit.events WHERE project_id = $1 AND type = 'iam_registration.submitted'`,
      [ctx.projectId],
    )
    return Number(rows[0]!.n)
  } finally {
    await admin.end()
  }
}

/**
 * A row held by a SECOND connection, as the database's owner, which then CHANGES it and commits —
 * what an administrator's write does in the window (`api/members.test.ts`'s `holding`, which only
 * ever rolls back). `waitedOn`: a statement matching `pattern` waits on this connection's lock.
 */
async function holdingThen(
  statement: string,
  params: unknown[],
  change: string,
  fn: (lock: {
    waitedOn: (pattern: string) => Promise<boolean>
    commit: () => Promise<void>
  }) => Promise<void>,
): Promise<void> {
  const admin = new pg.Pool({ connectionString: process.env.MANIFEST_ADMIN_DATABASE_URL })
  const held = await admin.connect()
  let open = false
  try {
    const { rows } = await held.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    const pid = rows[0]!.pid
    await held.query('BEGIN')
    open = true
    await held.query(statement, params)
    await fn({
      waitedOn: async (pattern) =>
        Number(
          (
            await admin.query<{ n: string }>(
              `SELECT count(*) AS n FROM pg_stat_activity
                WHERE datname = current_database() AND wait_event_type = 'Lock'
                  AND query ILIKE $2 AND $1 = ANY(pg_blocking_pids(pid))`,
              [pid, pattern],
            )
          ).rows[0]!.n,
        ) > 0,
      commit: async () => {
        await held.query(change)
        await held.query('COMMIT')
        open = false
      },
    })
  } finally {
    if (open) await held.query('ROLLBACK')
    held.release()
    await admin.end()
  }
}

/** Polls `condition` until it holds, or fails naming what it waited for. */
async function until(
  condition: () => boolean | Promise<boolean>,
  what: string,
  // Under the test's own 5 s, so a submission that never waits fails HERE, naming what it waited for.
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await condition())) {
    if (Date.now() > deadline)
      throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
