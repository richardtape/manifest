import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { delegatedTokens, type Db } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { addMember } from '../projects/index.js'
import { TOUCH_INTERVAL_MS, tokenById } from '../tokens/index.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  projectBody,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

afterAll(resetDatabase)

/**
 * D23.4: *"an interactive session cookie for browsers, a scoped delegated token for
 * agents."* One `onRequest` hook turns either into an `Actor`, and no route reads a
 * cookie or a header — which is what makes D24's central refusal possible at all
 * (Task 6).
 */

/** A `project:read` token on `ctx`'s own project, which most of these need. */
async function readOnlyToken(ctx: TestProject): Promise<string> {
  const { plaintext } = await mintTestToken(ctx.db, {
    userId: ctx.userId,
    projectId: ctx.projectId,
    capabilities: ['project:read'],
  })
  return plaintext
}

/**
 * A bearer header for each way a token can be unacceptable. Local to this file: every
 * one of these is a property of this test rather than a fixture anything else needs.
 */
async function bearerFor(
  db: Db,
  input: { userId: string; projectId: string; kind: string },
): Promise<string> {
  if (input.kind === 'malformed') return 'Bearer not-a-token'
  const { plaintext, row } = await mintTestToken(db, {
    userId: input.userId,
    projectId: input.projectId,
    capabilities: ['project:read'],
    ...(input.kind === 'expired' ? { expiresAt: new Date(Date.now() - 1000) } : {}),
  })
  if (input.kind === 'revoked') {
    await db
      .update(delegatedTokens)
      .set({ revokedAt: new Date() })
      .where(eq(delegatedTokens.id, row.id))
  }
  if (input.kind === 'unknown') {
    // A WELL-FORMED token naming a row that is not there: only the id is swapped, so the
    // refusal cannot be coming from the shape.
    return `Bearer ${plaintext.replace(
      row.id.replaceAll('-', ''),
      randomUUID().replaceAll('-', ''),
    )}`
  }
  if (input.kind === 'wrong-secret') {
    // The id kept and one character of the secret changed, so the lookup SUCCEEDS and
    // only the compare can refuse it.
    const last = plaintext.slice(-1)
    return `Bearer ${plaintext.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`
  }
  return `Bearer ${plaintext}`
}

describe('the two credential classes (D24, D23.4)', () => {
  it('lets a token read the project it is scoped to', async () => {
    await withProjectServer(async (ctx) => {
      const plaintext = await readOnlyToken(ctx)
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().id).toBe(ctx.projectId)
    })
  })

  it('answers 404 for a project the token is not scoped to', async () => {
    // The STRANGER's answer, not FORBIDDEN (Decision 3): a token must not be an
    // enumeration oracle any more than a stranger is.
    await withProjectServer(async (ctx) => {
      // THE MINTER IS A MEMBER OF BOTH, so the only thing that can refuse this is the
      // TOKEN's scope. Without this line a 404 would be the minter's own membership and
      // the test would pass with no scoping implemented at all.
      await addMember(ctx.db, ctx.otherProjectId, ctx.userId, 'collaborator')
      const plaintext = await readOnlyToken(ctx)
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.otherProjectId}`,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(refusal(res)).toEqual({ status: 404, code: 'NOT_FOUND' })
    })
  })

  it('refuses a capability the token was not minted with', async () => {
    // The MINTER holds build:create — they own the project — so the refusal is the
    // token's capability set and not the person's role.
    await withProjectServer(async (ctx) => {
      const plaintext = await readOnlyToken(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/builds`,
        headers: {
          authorization: `Bearer ${plaintext}`,
          'idempotency-key': 'k'.repeat(12),
        },
        payload: { commitSha: ctx.commitSha },
      })
      expect(refusal(res)).toEqual({ status: 403, code: 'FORBIDDEN' })
    })
  })

  it.each([
    ['a revoked token', 'revoked'],
    ['an expired token', 'expired'],
    ['an unknown id', 'unknown'],
    ['a wrong secret', 'wrong-secret'],
    ['a malformed value', 'malformed'],
  ])('answers 401 UNAUTHENTICATED for %s', async (_name, kind) => {
    // ONE answer for all five. A caller that could tell "no such token" from "wrong
    // secret" could enumerate which ids exist, and one that could tell "revoked" from
    // "expired" learns the state of a credential it does not hold.
    await withProjectServer(async (ctx) => {
      const header = await bearerFor(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        kind,
      })
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        headers: { authorization: header },
      })
      expect(refusal(res)).toEqual({ status: 401, code: 'UNAUTHENTICATED' })
    })
  })

  it('does not require an Origin on a token mutation, and still does on a session one', async () => {
    // CSRF is a BROWSER attack. A bearer token is not sent automatically by a browser,
    // so demanding an Origin of it would be cargo cult — and would lock out every agent.
    // The session half is the positive control: without it, a CSRF check that had
    // stopped working entirely would pass the first assertion.
    await withProjectServer(async (ctx) => {
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read', 'build:create'],
      })
      const byToken = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/builds`,
        headers: {
          authorization: `Bearer ${plaintext}`,
          'idempotency-key': 'k'.repeat(12),
        },
        payload: { commitSha: ctx.commitSha },
      })
      expect(byToken.statusCode).toBe(202)

      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const bySession = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/builds`,
        cookies: owner,
        headers: { 'idempotency-key': 'j'.repeat(12) }, // NO origin
        payload: { commitSha: ctx.commitSha },
      })
      expect(refusal(bySession)).toEqual({ status: 403, code: 'CSRF_ORIGIN_REFUSED' })
    })
  })

  it('refuses a request carrying BOTH a cookie and a bearer token', async () => {
    // Two credentials is ambiguous, and an ambiguity resolved silently is the shape
    // every confused-deputy bug has. Refuse it and say so.
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const plaintext = await readOnlyToken(ctx)
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        cookies: owner,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(refusal(res)).toEqual({ status: 400, code: 'CREDENTIAL_AMBIGUOUS' })
    })
  })

  it('refuses a token the creation of a project — §24’s audience is human-only (D29)', async () => {
    // Decision 12a/13: `audience` is stated at creation and nowhere else, so refusing
    // creation to a token is what keeps §24's question human-only. Asserted, not inferred.
    await withProjectServer(async (ctx) => {
      const plaintext = await readOnlyToken(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: {
          authorization: `Bearer ${plaintext}`,
          'idempotency-key': 'k'.repeat(12),
        },
        payload: projectBody('another-app'),
      })
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
    })
  })

  it('refuses a token the fleet — §26 is an interactive read', async () => {
    // Decision 4. The token's MINTER is a platform administrator here, so this is the
    // credential class being refused and not the person's role.
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'platform_admin')
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/v1/fleet',
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
    })
  })

  it('refuses a token the minting of another token — one leaked credential is not a factory', async () => {
    await withProjectServer(async (ctx) => {
      const plaintext = await readOnlyToken(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/tokens`,
        headers: {
          authorization: `Bearer ${plaintext}`,
          'idempotency-key': 'k'.repeat(12),
        },
        payload: { name: 'child', capabilities: ['project:read'], expiresInDays: 30 },
      })
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
    })
  })

  it('answers a token exactly its own project from GET /v1/projects', async () => {
    // Decision 12, and `[M1]`'s finding: `listProjectsFor` selects by the MINTER's
    // memberships and the route calls no assertCapability, so nothing Task 6 does can
    // scope it. The minter is deliberately a member of both projects, and the session's
    // own answer is read first — so "one project" is the scope working rather than the
    // fixture being thin or the read being broken for everybody.
    await withProjectServer(async (ctx) => {
      await addMember(ctx.db, ctx.otherProjectId, ctx.userId, 'collaborator')
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const mine = await ctx.app.inject({
        method: 'GET',
        url: '/v1/projects',
        cookies: owner,
      })
      expect(
        mine
          .json()
          .map((p: { id: string }) => p.id)
          .sort(),
      ).toEqual([ctx.projectId, ctx.otherProjectId].sort())

      const plaintext = await readOnlyToken(ctx)
      const byToken = await ctx.app.inject({
        method: 'GET',
        url: '/v1/projects',
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(byToken.statusCode).toBe(200)
      expect(byToken.json().map((p: { id: string }) => p.id)).toEqual([ctx.projectId])
    })
  })

  it('does not ask a token-bearing stream upgrade for an Origin, and still asks a session one', async () => {
    // `[M7]`: `routes/events.ts` applies `assertSameOrigin` to EVERY upgrade. It is
    // already conditional on the COOKIE — `carriesSession` — so a token needs no Origin,
    // and this asserts that rather than reading it. 426 means the origin check let it
    // through and authorization then ran; `app.inject` cannot complete a handshake.
    await withProjectServer(async (ctx) => {
      const plaintext = await readOnlyToken(ctx)
      const byToken = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/events`,
        headers: { authorization: `Bearer ${plaintext}`, upgrade: 'websocket' },
      })
      expect(refusal(byToken)).toEqual({ status: 426, code: 'EVENTS_UPGRADE_REQUIRED' })

      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const bySession = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/events`,
        cookies: owner,
        headers: { upgrade: 'websocket' },
      })
      expect(refusal(bySession)).toEqual({ status: 403, code: 'CSRF_ORIGIN_REFUSED' })
    })
  })

  it('records last use, and not again inside the interval', async () => {
    await withProjectServer(async (ctx) => {
      const { plaintext, row } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      expect(row.lastUsedAt).toBeNull()
      const read = () =>
        ctx.app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.projectId}`,
          headers: { authorization: `Bearer ${plaintext}` },
        })
      await read()
      const stamped = (await tokenById(ctx.db, row.id))?.lastUsedAt
      expect(stamped).not.toBeNull()

      // And the SECOND request inside the interval does NOT write again, which is the
      // decision Task 5 had to make rather than inherit (sitting 2, F8): stamping on
      // every authenticated request is one UPDATE per request, the exact cost Decision 9
      // rejected a database-backed rate limiter for.
      await read()
      expect((await tokenById(ctx.db, row.id))?.lastUsedAt).toEqual(stamped)

      // AND IT MOVES ONCE THE STAMP IS STALE. This half is the robust one, and it is
      // here because running the control for the half above showed it turning red on a
      // THREE-MILLISECOND difference: two requests landing in the same millisecond would
      // make that assertion unable to fail. Backdating past the interval is a difference
      // no clock resolution can swallow, so "stamps" and "does not re-stamp" are both
      // pinned rather than one of them being pinned on a good day.
      await ctx.db
        .update(delegatedTokens)
        .set({ lastUsedAt: new Date(Date.now() - TOUCH_INTERVAL_MS - 60_000) })
        .where(eq(delegatedTokens.id, row.id))
      await read()
      const moved = (await tokenById(ctx.db, row.id))?.lastUsedAt
      expect(moved!.getTime()).toBeGreaterThan(Date.now() - TOUCH_INTERVAL_MS)
    })
  })
})
