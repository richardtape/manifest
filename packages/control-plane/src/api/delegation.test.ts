import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { idempotencyKeys, pendingActions } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { addMember, assertCapability, CAPABILITIES } from '../projects/index.js'
import { TokenCapabilityRefusedError } from '../projects/index.js'
import { pendingById } from '../tokens/index.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  mutationHeaders,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

afterAll(resetDatabase)

/**
 * D24's central refusal (P5b Task 6).
 *
 * *"Manifest refuses those four centrally, at the authorization layer, not per-route, so
 * a new privileged route cannot accidentally omit it. Requesting one of them creates a
 * pending action a human confirms."*
 *
 * The rule lives in `assertCapability`, which every project-scoped route already goes
 * through; the RECORDING lives in `api/contract/route.ts`'s wrapper, which is the only
 * layer holding the request that was refused. Neither can do the other's half — that is
 * Decision 5, and it is the one design commitment in this plan that is expensive to
 * reverse.
 *
 * **Two routes bypass the wrapper and are named exceptions, not oversights** (`[M1]`,
 * `[M7]`): `GET /v1/projects` and `POST /v1/projects` never call `assertCapability` at
 * all — Task 5 scopes the first in the route and refuses the second outright — and the
 * event stream is registered with `app.route` directly, outside `ROUTE_DEFINITIONS`. The
 * stream's only capability is `project:read`, which is never privileged, so the refusal
 * cannot be thrown there; `route.ts`'s own comment states that assumption where it
 * matters, and `errors.ts` fails closed if it is ever broken.
 */

const KEY = 'k'.repeat(12)

/** A token holding exactly what the test names, written straight to the store. */
async function tokenHolding(
  ctx: TestProject,
  capabilities: string[],
  projectId = ctx.projectId,
): Promise<string> {
  const { plaintext } = await mintTestToken(ctx.db, {
    userId: ctx.userId,
    projectId,
    capabilities,
  })
  return plaintext
}

function addMemberRequest(
  projectId: string,
  plaintext: string,
  key = KEY,
): {
  method: 'POST'
  url: string
  headers: Record<string, string>
  payload: Record<string, unknown>
} {
  return {
    method: 'POST',
    url: `/v1/projects/${projectId}/members`,
    headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': key },
    payload: { puid: 'bio_student', role: 'collaborator' },
  }
}

describe('D24’s central refusal', () => {
  it('refuses a privileged action to a token and records a PendingAction', async () => {
    await withProjectServer(async (ctx) => {
      /**
       * **`bio_student` MUST EXIST FIRST, or half of this test cannot fail.** Measured
       * before the rule was written: `addMember` answers `400 MEMBER_USER_NOT_FOUND` for
       * a PUID that has never signed in, and that refusal comes after the authorization
       * check — so with no central rule at all the request was `400`, not the `201` the
       * plan's Step 2 predicted, and *"the member was NOT added"* held for a reason that
       * has nothing to do with D24. With the person signed in once, the unprotected
       * answer is `201` and the member IS added, which is the vulnerability this task
       * closes.
       */
      await sessionFor(ctx, 'bio_student')
      // The token holds `members:manage` DIRECTLY IN THE DATABASE, bypassing Task 4's
      // mint-time refusal. That is deliberate: this test proves the CENTRAL rule holds
      // even for a token that should not exist, which is exactly what "regardless of how
      // it was minted" means in D24. The mint route's refusal is defence in depth.
      const plaintext = await tokenHolding(ctx, ['project:read', 'members:manage'])
      const res = await ctx.app.inject(addMemberRequest(ctx.projectId, plaintext))

      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
      const pending = res.json().error.pendingAction
      expect(pending.action).toBe('members:manage')
      expect(pending.state).toBe('pending')
      expect(pending.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(pending.projectId).toBe(ctx.projectId)

      // The member was NOT added. A refusal that half-happened is worse than either.
      const members = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/members`,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(members.statusCode).toBe(200)
      expect(members.json().some((m: { puid: string }) => m.puid === 'bio_student')).toBe(
        false,
      )
    })
  })

  it('opens the loop for a token minted WITHOUT the capability — which is every real token', async () => {
    /**
     * **THE CASE EVERY OTHER TEST HERE MISSES, AND THE ONLY ONE A REAL TOKEN IS IN.**
     *
     * Task 4's mint route refuses a privileged capability, so no token that exists
     * outside a fixture can hold `members:manage`. The tests above all write one straight
     * to the store — which is right, because D24 says "however it was minted" — but it
     * means they exercise the branch a real token never reaches.
     *
     * Measured as a control: with the privileged rule moved AFTER the token's own
     * capability set, every one of the thirty-one tests in this file, `credential.test.ts`
     * and `tokens.test.ts` stays green, and this request answers `403 FORBIDDEN` instead.
     * That is not a weakened refusal — it is a DEAD END. The agent is told "no" with
     * nothing to wait on, no pending action is ever written, and D24's loop cannot start
     * for any token the platform can actually mint. This assertion is the only thing that
     * sees it.
     */
    await withProjectServer(async (ctx) => {
      const plaintext = await tokenHolding(ctx, ['project:read'])
      const res = await ctx.app.inject(addMemberRequest(ctx.projectId, plaintext))

      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
      expect(res.json().error.pendingAction.action).toBe('members:manage')
    })
  })

  it('records the request’s fingerprint and no more', async () => {
    await withProjectServer(async (ctx) => {
      const plaintext = await tokenHolding(ctx, ['members:manage'])
      const res = await ctx.app.inject(addMemberRequest(ctx.projectId, plaintext))

      const stored = await pendingById(ctx.db, res.json().error.pendingAction.id)
      expect(stored?.payload.method).toBe('POST')
      expect(stored?.payload.path).toBe(`/v1/projects/${ctx.projectId}/members`)
      expect(stored?.payload.bodySha256).toMatch(/^[0-9a-f]{64}$/)
      // The BODY IS NOT STORED (the column's own comment): a refused request can carry
      // anything, and a person reads this row in a queue (§26).
      expect(JSON.stringify(stored?.payload)).not.toContain('bio_student')
      expect(stored?.payload.summary).toContain('member')
    })
  })

  it('refuses a production promotion to a token, before the launch gate', async () => {
    await withProjectServer(async (ctx) => {
      const plaintext = await tokenHolding(ctx, ['release:deploy', 'release:promote'])
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/environments/${ctx.productionEnvironmentId}/deploy`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': KEY },
        // A release id that names NOTHING, deliberately: the capability check runs
        // before the release is resolved, so this asserts the ORDER as well as the
        // refusal. With the token branch removed the answer is the launch gate's 409,
        // not a 404 — which is what makes this a control rather than a coincidence.
        payload: { releaseId: randomUUID() },
      })
      // TOKEN_ACTION_PENDING, not RELEASE_PRODUCTION_GATE_UNAVAILABLE: who may ask is
      // settled before whether the project is ready.
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
      expect(res.json().error.pendingAction.action).toBe('release:promote')
    })
  })

  it('deploys to STAGING on the same token — release:deploy is not privileged', async () => {
    // The other half of the pair: D24 forbids the promotion and permits the deploy, and
    // one capability covering both would make the rule unstatable (`[M2]`). Without this
    // the third test above is satisfied by a token branch that refuses everything.
    await withProjectServer(async (ctx) => {
      const plaintext = await tokenHolding(ctx, ['release:deploy', 'release:promote'])
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/environments/${ctx.stagingEnvironmentId}/deploy`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': KEY },
        payload: { releaseId: randomUUID() },
      })
      // Past the authorization layer, and refused by the RELEASE — which is the whole
      // point: this token was allowed to ask.
      expect(refusal(res)).toEqual({ status: 409, code: 'RELEASE_NOT_FOUND' })
    })
  })

  it('does not record a second PendingAction for an identical retry', async () => {
    // An agent in a retry loop must not fill a human's queue with one question.
    await withProjectServer(async (ctx) => {
      const plaintext = await tokenHolding(ctx, ['members:manage'])
      const first = await ctx.app.inject(addMemberRequest(ctx.projectId, plaintext))
      const second = await ctx.app.inject(addMemberRequest(ctx.projectId, plaintext))

      expect(second.json().error.pendingAction.id).toBe(
        first.json().error.pendingAction.id,
      )
      const rows = await ctx.db
        .select()
        .from(pendingActions)
        .where(eq(pendingActions.projectId, ctx.projectId))
      expect(rows).toHaveLength(1)
    })
  })

  it('records a SECOND PendingAction for a different request', async () => {
    // The other direction of the reuse lookup: two questions are two queue items. A
    // reuse that matched on the token alone would collapse them into one, and the test
    // above cannot see that.
    await withProjectServer(async (ctx) => {
      const plaintext = await tokenHolding(ctx, ['members:manage'])
      const first = await ctx.app.inject(addMemberRequest(ctx.projectId, plaintext))
      const second = await ctx.app.inject({
        ...addMemberRequest(ctx.projectId, plaintext, 'j'.repeat(12)),
        payload: { puid: 'unrelated_user', role: 'owner' },
      })
      expect(second.json().error.pendingAction.id).not.toBe(
        first.json().error.pendingAction.id,
      )
    })
  })

  it('stores NO idempotency record for a refusal, so a confirmed retry can reach the handler', async () => {
    /**
     * **THE CONTROL FOR CORRECTION 1**, and the one assertion that can see the mistake.
     *
     * `app.idempotent` is `replayOrStore`, which stores whatever its handler RESOLVES
     * with and, on a repeated key, answers from the store without calling it again. If
     * the refusal were caught INSIDE that wrapper — the natural reading of Decision 5 —
     * the 403 would be cached under `(key, userId, route)`, and the confirmed retry that
     * D23.6's own hint tells a client to send WITH THE SAME KEY would replay the cached
     * refusal for ever. `consumed_at` would never be stamped and the agent would loop.
     *
     * Every test above mints a fresh key per request and stays green through that
     * mistake. This one does not: it reads the idempotency table directly, and it also
     * asserts the behaviour a client can see — a second request under the same key with
     * a DIFFERENT body answers the refusal again rather than `409 IDEMPOTENCY_KEY_REUSED`,
     * which is what a stored record would produce.
     */
    await withProjectServer(async (ctx) => {
      const plaintext = await tokenHolding(ctx, ['members:manage'])
      await ctx.app.inject(addMemberRequest(ctx.projectId, plaintext))

      const stored = await ctx.db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.key, KEY), eq(idempotencyKeys.userId, ctx.userId)))
      expect(stored).toEqual([])

      const again = await ctx.app.inject({
        ...addMemberRequest(ctx.projectId, plaintext),
        payload: { puid: 'unrelated_user', role: 'owner' },
      })
      expect(refusal(again)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
    })
  })

  it('answers 404, and records nothing, for a privileged action on another project', async () => {
    /**
     * SCOPE BEFORE THE PRIVILEGED RULE, which is the security property of the ordering.
     *
     * Task 5's *answers 404 for a project the token is not scoped to* cannot see this:
     * it asks for `project:read`, which is never privileged, so reordering the two
     * checks leaves it green. Here the capability IS privileged, so a token that reached
     * the privileged rule first would be told its action is pending — learning that
     * another tenant's project exists, and writing a row into that tenant's queue.
     */
    await withProjectServer(async (ctx) => {
      // The MINTER is a member of both, so the only thing that can refuse this is the
      // TOKEN's scope (the shape sitting 3's control needed).
      await addMember(ctx.db, ctx.otherProjectId, ctx.userId, 'owner')
      const plaintext = await tokenHolding(ctx, ['members:manage'])
      const res = await ctx.app.inject(addMemberRequest(ctx.otherProjectId, plaintext))

      expect(refusal(res)).toEqual({ status: 404, code: 'NOT_FOUND' })
      const rows = await ctx.db.select().from(pendingActions)
      expect(rows).toEqual([])
    })
  })

  it('does not touch a session’s path at all', async () => {
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      await sessionFor(ctx, 'bio_student')
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/members`,
        cookies: owner,
        headers: mutationHeaders(ctx.deps),
        payload: { puid: 'bio_student', role: 'collaborator' },
      })
      expect(res.statusCode).toBe(201)
      const rows = await ctx.db.select().from(pendingActions)
      expect(rows).toEqual([])
    })
  })

  it('enforces the rule for a capability with no route, at the authorization layer', async () => {
    /**
     * Decision 14: `secret:read` and `quota:set` have no route in Phase 1, so this is the
     * only tier that can see them. Asserted directly rather than pretended end to end.
     *
     * `quota:set` is a `Capability` and reaches `assertCapability`. **`secret:read` is
     * not** — sitting 2's `[M8]` deliberately left it out of the union, because a
     * capability nothing grants and nothing checks is the no-caller shape ORIENTATION §9
     * names four times — so it is unreachable BY CONSTRUCTION rather than by a check, and
     * the truthful assertion is that no route can ever ask for it. `privileged.test.ts`
     * holds it against D24's list.
     */
    await withProjectServer(async (ctx) => {
      const actor = {
        credential: 'token' as const,
        userId: ctx.userId,
        tokenId: randomUUID(),
        projectId: ctx.projectId,
        capabilities: new Set(['quota:set'] as const),
        rateLimit: 60,
      }
      await expect(
        assertCapability(ctx.db, actor, ctx.projectId, 'quota:set'),
      ).rejects.toThrow(TokenCapabilityRefusedError)
      expect(CAPABILITIES).not.toContain('secret:read')
    })
  })
})
