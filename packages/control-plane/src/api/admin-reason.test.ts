import { asc, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { events } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { addMember, TokenCapabilityRefusedError } from '../projects/index.js'
import type { StreamFrame } from '../observability/index.js'
import { fingerprintOf, recordPendingAction } from '../tokens/index.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  loginAs,
  mutationHeaders,
  refusal,
  withProjectServer,
  type TestProject,
} from './testing.js'

afterAll(resetDatabase)

/**
 * AN ADMINISTRATOR ACTING ON ANOTHER PERSON'S PROJECT GIVES A REASON (§26's non-repudiation, as Spec
 * action 1 worded it; the faculty-ready plan's Task 10).
 *
 * A platform administrator who is NOT a member of a project, using an OWNER's capability on it, sends
 * the reason with the request — `Manifest-Admin-Reason` — and is refused `400 ADMIN_REASON_REQUIRED`
 * without one. Their own duties (approving or rejecting a release, recording UBC's answers, setting a
 * quota) need none, nor does an administrator who is a member, nor a read. The reason is part of the
 * request's idempotency fingerprint, asked once at a token's mint, stored on the audit row beside the
 * actor, and shown to the project's people on their event stream — redacted, and at most 500
 * characters.
 *
 * `api/authz-contract.ts` holds the other half: EVERY operation that answers the refusal to an
 * administrator who is not a member is the set the document declares, and that set is `[M5]`'s 24.
 */

const REASON = 'Student reported a broken page'

interface Call {
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'GET'
  url: string
  payload?: Record<string, unknown>
}

async function send(
  ctx: TestProject,
  cookies: Record<string, string>,
  call: Call,
  reason?: string,
  key?: string,
) {
  const headers: Record<string, string> = {
    ...mutationHeaders(ctx.deps),
    ...(key === undefined ? {} : { 'idempotency-key': key }),
    ...(reason === undefined ? {} : { 'manifest-admin-reason': reason }),
  }
  return ctx.app.inject({
    method: call.method,
    url: call.url,
    headers,
    cookies,
    ...(call.payload === undefined ? {} : { payload: call.payload }),
  })
}

/** A built and released `fixture-node@1` app, as its owner made it — what a deploy names. */
async function released(ctx: TestProject): Promise<string> {
  const build = await send(ctx, ctx.ownerCookies, {
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/builds`,
    payload: {},
  })
  expect(build.statusCode, build.body).toBe(202)
  await ctx.deps.builds.idle()
  const release = await send(ctx, ctx.ownerCookies, {
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/releases`,
    payload: { buildId: build.json().id },
  })
  expect(release.statusCode, release.body).toBe(201)
  return release.json().id as string
}

/** Every frame the project's stream carries from now on. */
function watch(ctx: TestProject): StreamFrame[] {
  const frames: StreamFrame[] = []
  ctx.deps.bus.subscribe(ctx.projectId, (frame) => frames.push(frame))
  return frames
}

function eventOf(
  frames: StreamFrame[],
  type: string,
): Extract<StreamFrame, { kind: 'event' }> {
  const found = frames.find((f) => f.kind === 'event' && f.type === type)
  if (found === undefined || found.kind !== 'event')
    throw new Error(
      `no '${type}' frame; saw ${frames.map((f) => (f.kind === 'event' ? f.type : f.kind)).join(', ')}`,
    )
  return found
}

describe('an administrator acting on a project they are not a member of gives a reason', () => {
  /**
   * The rows Review Focus 4 names — a deploy, a commit, a secret, a member change, an archive, a token
   * mint — and the three whose events now name who acted (validate, build, rename beside them). Each
   * is refused WITHOUT the header, by its code, and then answered WITH it: the same administrator, the
   * same request, the header the only difference. The archive is last: it switches the project off.
   */
  it('refuses each change without the reason, by its code, and makes it with one', async () => {
    await withProjectServer(async (ctx) => {
      const releaseId = await released(ctx)
      const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
      // The person the member row adds has signed in once.
      await ensureTestUser(ctx.db, 'bio_colleague')
      const head = await ctx.deps.source.resolveRef(
        ctx.deps.source.repositoryFor(
          (
            await ctx.app.inject({
              method: 'GET',
              url: `/v1/projects/${ctx.projectId}`,
              cookies: ctx.ownerCookies,
            })
          ).json().slug as string,
        ),
        'main',
      )
      const rows: { name: string; call: () => Call; ok: number }[] = [
        {
          name: 'rename',
          call: () => ({
            method: 'PATCH',
            url: `/v1/projects/${ctx.projectId}`,
            payload: { name: 'Renamed by an administrator' },
          }),
          ok: 200,
        },
        {
          name: 'validate',
          call: () => ({
            method: 'POST',
            url: `/v1/projects/${ctx.projectId}/spec`,
            payload: {},
          }),
          ok: 201,
        },
        {
          name: 'commit',
          call: () => ({
            method: 'POST',
            url: `/v1/projects/${ctx.projectId}/commits`,
            payload: {
              baseCommit: head,
              message: 'an administrator fixes a page',
              changes: [{ op: 'write', path: 'admin.txt', content: 'fixed\n' }],
            },
          }),
          ok: 201,
        },
        {
          name: 'secret',
          call: () => ({
            method: 'PUT',
            url: `/v1/environments/${ctx.stagingEnvironmentId}/secrets/ADMIN_KEY`,
            payload: { value: 'a-value-the-admin-set' },
          }),
          ok: 200,
        },
        {
          name: 'build',
          call: () => ({
            method: 'POST',
            url: `/v1/projects/${ctx.projectId}/builds`,
            payload: {},
          }),
          ok: 202,
        },
        {
          name: 'deploy',
          call: () => ({
            method: 'POST',
            url: `/v1/environments/${ctx.stagingEnvironmentId}/deploy`,
            payload: { releaseId },
          }),
          ok: 200,
        },
        {
          name: 'member',
          call: () => ({
            method: 'POST',
            url: `/v1/projects/${ctx.projectId}/members`,
            payload: { puid: 'bio_colleague', role: 'collaborator' },
          }),
          ok: 201,
        },
        {
          name: 'token',
          call: () => ({
            method: 'POST',
            url: `/v1/projects/${ctx.projectId}/tokens`,
            payload: {
              name: 'admin-agent',
              capabilities: ['project:read'],
              expiresInDays: 1,
            },
          }),
          ok: 201,
        },
        {
          name: 'archive',
          call: () => ({
            method: 'POST',
            url: `/v1/projects/${ctx.projectId}/archive`,
            payload: {},
          }),
          ok: 200,
        },
      ]
      for (const row of rows) {
        const without = await send(ctx, admin, row.call())
        expect({ row: row.name, ...refusal(without) }).toEqual({
          row: row.name,
          status: 400,
          code: 'ADMIN_REASON_REQUIRED',
        })
        const withIt = await send(ctx, admin, row.call(), REASON)
        expect({ row: row.name, status: withIt.statusCode }, withIt.body).toEqual({
          row: row.name,
          status: row.ok,
        })
        await ctx.deps.builds.idle()
      }
    })
  }, 60_000)

  it('asks nothing of an administrator who is a member, of the owner, of a read, or of an administrator’s own duty', async () => {
    await withProjectServer(async (ctx) => {
      const rename = (name: string): Call => ({
        method: 'PATCH',
        url: `/v1/projects/${ctx.projectId}`,
        payload: { name },
      })
      const admin = await loginAs(ctx.deps, 'platform_admin')
      // POSITIVE CONTROL, in the same test: the same administrator, not yet a member, IS asked.
      expect(refusal(await send(ctx, admin, rename('Before')))).toEqual({
        status: 400,
        code: 'ADMIN_REASON_REQUIRED',
      })
      // A read is not an action.
      const read = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        cookies: admin,
      })
      expect(read.statusCode, read.body).toBe(200)
      // An administrator's own duty: recording what the Privacy Office said.
      const recorded = await send(ctx, admin, {
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/launch-records/privacy-assessment`,
        payload: { state: 'submitted', externalTicketRef: 'PIA-REASON-1' },
      })
      expect(recorded.statusCode, recorded.body).toBe(200)
      // The owner.
      const byOwner = await send(ctx, ctx.ownerCookies, rename('By the owner'))
      expect(byOwner.statusCode, byOwner.body).toBe(200)
      // An administrator who is a member acts as a member.
      const adminUser = await ensureTestUser(ctx.db, 'platform_admin')
      await addMember(ctx.db, ctx.projectId, adminUser.id, 'collaborator')
      const asMember = await send(ctx, admin, rename('By a member administrator'))
      expect(asMember.statusCode, asMember.body).toBe(200)
    })
  })

  it('holds the reason inside the idempotency fingerprint: a replay with another reason is IDEMPOTENCY_KEY_REUSED', async () => {
    await withProjectServer(async (ctx) => {
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const call: Call = {
        method: 'PATCH',
        url: `/v1/projects/${ctx.projectId}`,
        payload: { name: 'Renamed once' },
      }
      const key = 'admin-reason-replay-0001'
      const first = await send(ctx, admin, call, REASON, key)
      expect(first.statusCode, first.body).toBe(200)
      // The same reason: the first answer, replayed.
      const same = await send(ctx, admin, call, REASON, key)
      expect(same.statusCode, same.body).toBe(200)
      expect(same.json()).toEqual(first.json())
      // Another reason, the same key and body: a different request.
      expect(refusal(await send(ctx, admin, call, 'A different reason', key))).toEqual({
        status: 409,
        code: 'IDEMPOTENCY_KEY_REUSED',
      })
    })
  })

  it('asks once at a token’s mint: the token an administrator minted with a reason acts without being asked', async () => {
    await withProjectServer(async (ctx) => {
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const mint: Call = {
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/tokens`,
        payload: {
          name: 'admin-agent',
          capabilities: ['project:read', 'project:write'],
          expiresInDays: 1,
        },
      }
      expect(refusal(await send(ctx, admin, mint))).toEqual({
        status: 400,
        code: 'ADMIN_REASON_REQUIRED',
      })
      const minted = await send(ctx, admin, mint, REASON)
      expect(minted.statusCode, minted.body).toBe(201)
      const renamed = await ctx.app.inject({
        method: 'PATCH',
        url: `/v1/projects/${ctx.projectId}`,
        headers: {
          'idempotency-key': 'admin-token-rename-01',
          authorization: `Bearer ${minted.json().secret as string}`,
        },
        payload: { name: 'Renamed by the administrator’s agent' },
      })
      expect(renamed.statusCode, renamed.body).toBe(200)
    })
  })

  it('takes a reason of 1 to 500 characters, trimmed — longer or blank is refused, and the hint names the limit', async () => {
    await withProjectServer(async (ctx) => {
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const rename = (name: string): Call => ({
        method: 'PATCH',
        url: `/v1/projects/${ctx.projectId}`,
        payload: { name },
      })
      const long = await send(ctx, admin, rename('Too long'), 'x'.repeat(501))
      expect(refusal(long)).toEqual({ status: 400, code: 'ADMIN_REASON_REQUIRED' })
      expect(long.json().error.hint).toMatch(/500 characters/)
      expect(refusal(await send(ctx, admin, rename('Blank'), '   '))).toEqual({
        status: 400,
        code: 'ADMIN_REASON_REQUIRED',
      })
      const exactly = await send(
        ctx,
        admin,
        rename('Exactly 500'),
        `  ${'y'.repeat(500)}  `,
      )
      expect(exactly.statusCode, exactly.body).toBe(200)
    })
  })

  /**
   * A HEADER CARRIES ONLY LATIN-1, and a person's reason is their own words: a browser's `fetch` and
   * Node's both refuse a header holding `—` or `é`. So a client percent-encodes it as UTF-8
   * (`encodeURIComponent`), and the platform decodes it; plain text arrives unchanged.
   */
  it('decodes a percent-encoded reason, so a person’s own words survive a header', async () => {
    await withProjectServer(async (ctx) => {
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const frames = watch(ctx)
      const said = 'Élève a signalé une page cassée — urgent'
      const renamed = await send(
        ctx,
        admin,
        {
          method: 'PATCH',
          url: `/v1/projects/${ctx.projectId}`,
          payload: { name: 'Renamed in French' },
        },
        encodeURIComponent(said),
      )
      expect(renamed.statusCode, renamed.body).toBe(200)
      const frame = eventOf(frames, 'project.renamed')
      expect(frame.actor).toEqual({
        name: 'Platform Admin',
        asAdministrator: true,
        reason: said,
      })
    })
  })

  /**
   * A QUESTION AN AGENT ASKED is answered with the question's capability (`assertCapability` on the
   * row's action). Adding a person is an owner's, so a non-member administrator gives a reason;
   * setting a quota is the administrator's own duty, so they do not (a ruling of the plan's Task 10).
   */
  it('asks a reason to answer an agent’s question about an owner’s action, and none for a quota', async () => {
    await withProjectServer(async (ctx) => {
      const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
      const { row: token } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      const ask = async (capability: 'members:manage' | 'quota:set') =>
        (
          await recordPendingAction(ctx.db, ctx.deps.bus, {
            error: new TokenCapabilityRefusedError(capability, ctx.projectId, token.id),
            tokenExpiresAt: token.expiresAt,
            fingerprint: fingerprintOf({
              method: 'POST',
              url: `/v1/projects/${ctx.projectId}/members`,
              body: { capability },
              summary: 'Add or change a member',
            }),
          })
        ).id
      const member = await ask('members:manage')
      const confirm = (id: string): Call => ({
        method: 'POST',
        url: `/v1/pending-actions/${id}/confirm`,
        payload: {},
      })
      expect(refusal(await send(ctx, admin, confirm(member)))).toEqual({
        status: 400,
        code: 'ADMIN_REASON_REQUIRED',
      })
      const confirmed = await send(ctx, admin, confirm(member), REASON)
      expect(confirmed.statusCode, confirmed.body).toBe(200)
      const quota = await ask('quota:set')
      const ownDuty = await send(ctx, admin, confirm(quota))
      expect(ownDuty.statusCode, ownDuty.body).toBe(200)
    })
  })
})

describe('the project’s people see who acted, and why', () => {
  it('the owner’s stream shows who acted, as an administrator, and why — on the row too, and on what the deploy publishes later', async () => {
    await withProjectServer(async (ctx) => {
      const releaseId = await released(ctx)
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const frames = watch(ctx)
      const deployed = await send(
        ctx,
        admin,
        {
          method: 'POST',
          url: `/v1/environments/${ctx.stagingEnvironmentId}/deploy`,
          payload: { releaseId },
        },
        REASON,
      )
      expect(deployed.statusCode, deployed.body).toBe(200)
      const frame = eventOf(frames, 'instance.provisioning')
      expect(frame.actor).toEqual({
        name: 'Platform Admin',
        asAdministrator: true,
        reason: REASON,
      })
      expect(frame.humanMessage).toMatch(
        /Platform Admin acted as a platform administrator — reason: 'Student reported a broken page'/,
      )
      const [row] = await ctx.db.select().from(events).where(eq(events.id, frame.id))
      const admins = await ensureTestUser(ctx.db, 'platform_admin')
      expect(row).toMatchObject({
        actorUserId: admins.id,
        actedAsAdmin: true,
        reason: REASON,
      })
      // An event the deploy publishes LATER in the same work still names who started it.
      const later = eventOf(frames, 'instance.healthy')
      expect(later.actor).toEqual(frame.actor)
    })
  })

  it('redacts a secret-shaped reason in the row and on the stream', async () => {
    await withProjectServer(async (ctx) => {
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const frames = watch(ctx)
      const leaked = 'the key sk-abcdefghijklmnopqrstuv1234 was pasted in a page'
      const renamed = await send(
        ctx,
        admin,
        {
          method: 'PATCH',
          url: `/v1/projects/${ctx.projectId}`,
          payload: { name: 'Leak' },
        },
        leaked,
      )
      expect(renamed.statusCode, renamed.body).toBe(200)
      const frame = eventOf(frames, 'project.renamed')
      expect(frame.actor?.reason).toBe('the key [REDACTED] was pasted in a page')
      expect(frame.humanMessage).not.toContain('sk-abcdefghijklmnopqrstuv1234')
      const [row] = await ctx.db.select().from(events).where(eq(events.id, frame.id))
      expect(row?.reason).toBe('the key [REDACTED] was pasted in a page')
    })
  })

  it('POSITIVE CONTROL: the owner’s own deploy names the owner, not as an administrator, with no reason — and the replay agrees', async () => {
    await withProjectServer(async (ctx) => {
      const releaseId = await released(ctx)
      const frames = watch(ctx)
      const deployed = await send(ctx, ctx.ownerCookies, {
        method: 'POST',
        url: `/v1/environments/${ctx.stagingEnvironmentId}/deploy`,
        payload: { releaseId },
      })
      expect(deployed.statusCode, deployed.body).toBe(200)
      const frame = eventOf(frames, 'instance.provisioning')
      expect(frame.actor).toEqual({
        name: 'Bio Prof',
        asAdministrator: false,
        reason: null,
      })
      expect(frame.humanMessage).not.toMatch(/platform administrator/)
      const [row] = await ctx.db.select().from(events).where(eq(events.id, frame.id))
      expect(row).toMatchObject({
        actorUserId: ctx.userId,
        actedAsAdmin: false,
        reason: null,
      })
      // The replay a reconnecting client reads says the same thing as the live frame.
      const { recentFramesFor } = await import('../observability/index.js')
      const replayed = (await recentFramesFor(ctx.db, ctx.projectId, 50)).find(
        (f) => f.id === frame.id,
      )
      expect(replayed).toEqual(frame)
    })
  })
})

describe('deploy, build and validate name who acted', () => {
  it('says who deployed, who started the build and who validated, in the sentence', async () => {
    await withProjectServer(async (ctx) => {
      const frames = watch(ctx)
      const releaseId = await released(ctx)
      const validated = await send(ctx, ctx.ownerCookies, {
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/spec`,
        payload: {},
      })
      expect(validated.statusCode, validated.body).toBe(201)
      const deployed = await send(ctx, ctx.ownerCookies, {
        method: 'POST',
        url: `/v1/environments/${ctx.stagingEnvironmentId}/deploy`,
        payload: { releaseId },
      })
      expect(deployed.statusCode, deployed.body).toBe(200)
      expect(eventOf(frames, 'build.started').humanMessage).toMatch(
        /^Building .+ at commit [0-9a-f]{7}, started by Bio Prof\.$/,
      )
      expect(eventOf(frames, 'spec.validated').humanMessage).toMatch(
        /manifest\.yaml is valid, checked by Bio Prof\.$/,
      )
      expect(eventOf(frames, 'instance.provisioning').humanMessage).toMatch(
        /^Preparing .+ in staging, deployed by Bio Prof\.$/,
      )
    })
  })

  it('names a token’s agent as the person’s agent, by the token’s name', async () => {
    await withProjectServer(async (ctx) => {
      const frames = watch(ctx)
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read', 'build:create'],
        name: 'builder-bot',
      })
      const started = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/builds`,
        headers: {
          'idempotency-key': 'token-build-000001',
          authorization: `Bearer ${plaintext}`,
        },
        payload: {},
      })
      expect(started.statusCode, started.body).toBe(202)
      await ctx.deps.builds.idle()
      const frame = eventOf(frames, 'build.started')
      expect(frame.humanMessage).toMatch(
        /, started by Bio Prof's agent \(token 'builder-bot'\)\.$/,
      )
      expect(frame.actor).toEqual({
        name: 'Bio Prof',
        asAdministrator: false,
        reason: null,
      })
      // The ordered rows agree: nothing here acted as an administrator.
      const rows = await ctx.db
        .select()
        .from(events)
        .where(eq(events.projectId, ctx.projectId))
        .orderBy(asc(events.createdAt))
      expect(rows.some((r) => r.actedAsAdmin)).toBe(false)
    })
  })
})
