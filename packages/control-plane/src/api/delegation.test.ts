import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { LightMyRequestResponse } from 'fastify'
import { afterAll, describe, expect, it } from 'vitest'
import { idempotencyKeys, pendingActions, projectMembers, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import type { TestUserPuid } from '../identity/testing.js'
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

/**
 * The four helpers below are AT FILE SCOPE, not inside the confirm block that wrote them.
 *
 * Task 8's queue tests need `refusedOnce` to have a question to read, and a
 * `describe('the queue (§26)')` nested inside `describe('confirming a pending action')`
 * would be a lie about what that block contains. Hoisted rather than copied: a helper
 * copied twice drifts twice, and `confirmed`'s assertions are the whole of sitting 5's F1.
 */

/** The whole loop's first half: the agent asks, and is refused. */
async function refusedOnce(
  ctx: TestProject,
  puid: TestUserPuid = 'bio_student',
): Promise<{
  ask: () => Promise<LightMyRequestResponse>
  plaintext: string
  pendingId: string
}> {
  // A token minted the way a REAL one is — WITHOUT the privileged capability, which
  // Task 4's mint route refuses. Sitting 4's F1: every other test here writes one
  // holding `members:manage` straight to the store, which is the right thing for
  // "however it was minted" and is not the state any token that exists is in. A
  // confirmation must let this one through, so the GRANT is what lets it past and not
  // the token's own set.
  const plaintext = await tokenHolding(ctx, ['project:read'])
  const ask = (): Promise<LightMyRequestResponse> =>
    ctx.app.inject({
      ...addMemberRequest(ctx.projectId, plaintext),
      payload: { puid, role: 'collaborator' },
    })
  const refused = await ask()
  expect(refusal(refused)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
  return { ask, plaintext, pendingId: refused.json().error.pendingAction.id }
}

function resolve(
  ctx: TestProject,
  pendingId: string,
  how: 'confirm' | 'reject',
  cookies: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return ctx.app.inject({
    method: 'POST',
    url: `/v1/pending-actions/${pendingId}/${how}`,
    cookies,
    headers: mutationHeaders(ctx.deps),
    ...(payload === undefined ? {} : { payload }),
  })
}

/**
 * A confirmation that IS one, asserted at the point it is used as a precondition.
 *
 * **MEASURED BEFORE THE ROUTE EXISTED**, and it is sitting 4's F1 in this sitting's own
 * tests: with `resolve` unchecked, *does not let a DIFFERENT request through* and *does
 * not let a SECOND token through* were both GREEN against a `404 ROUTE_NOT_FOUND` — the
 * confirmation never happened, so the request that followed was refused for the
 * ordinary reason and the assertion below it proved nothing. A precondition that is not
 * asserted is not a precondition.
 */
async function confirmed(ctx: TestProject, pendingId: string): Promise<void> {
  // STEPPED UP since P6a sitting 6's F12: confirming one of D24's privileged four is
  // doing it by proxy, so §20 holds it to the same freshness as doing it directly.
  // REJECTING is deliberately not guarded, which is why `rejected` below is unchanged —
  // and that difference is asserted in `pending-actions.test.ts` rather than implied here.
  const res = await resolve(ctx, pendingId, 'confirm', ctx.ownerSteppedUp)
  expect(refusal(res)).toEqual({ status: 200, code: undefined })
  expect(res.json().state).toBe('confirmed')
}

async function memberPuids(ctx: TestProject): Promise<string[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.projectId}/members`,
    cookies: ctx.ownerCookies,
  })
  return (res.json() as { puid: string }[]).map((m) => m.puid)
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
      // STEPPED UP, because `members:manage` is §20-guarded since P6a Task 9 — and this
      // test's subject is that a SESSION records no PendingAction, not what it takes to
      // reach the handler. The step-up refusal would have satisfied "no rows" for the
      // wrong reason.
      const owner = await sessionFor(ctx, 'bio_prof', 'owner', { steppedUp: true })
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

/**
 * D24's loop closing (P5b Task 7, Decision 6).
 *
 * *"Requesting one of those produces a `PendingAction` that a human resolves in an
 * interactive session."* Confirming does not replay the request server-side — it grants a
 * ONE-SHOT RETRY of that exact request, so the action executes through its normal route
 * with its normal validation, and the one-shot property is the whole security argument: a
 * confirmed action that can be replayed for ever is a privileged capability with extra
 * steps.
 *
 * **THE RETRY REUSES THE SAME `Idempotency-Key`** (sitting 1's `[M5]`), because D23.6's
 * own error hint tells a client to reuse a key across retries of an action. Sitting 4
 * made that possible by catching the refusal OUTSIDE `app.idempotent`, so the refusal
 * stores no record and the retry reaches the handler.
 *
 * **"EXACTLY ONCE" DESCRIBES THE ACTION, NOT THE ANSWER.** The confirmed retry's `201`
 * *is* stored under that key, so replaying the key returns it for ever without reaching
 * the handler or any capability check. That is not an escalation — the action was
 * authorized once and the response is identical — and it is asserted separately below,
 * because it is a different statement from the one-shot rule. A SECOND ATTEMPT AT THE
 * ACTION is a new request with a fresh key, and that is where the one-shot rule bites.
 */
describe('confirming a pending action (D24, Decision 6)', () => {
  it('lets the agent’s retry through exactly once', async () => {
    await withProjectServer(async (ctx) => {
      // `bio_student` has to have signed in, or `addMember` answers 400
      // MEMBER_USER_NOT_FOUND *after* the authorization check and the confirmed retry
      // never reaches the row it is meant to write (sitting 4's F2).
      await sessionFor(ctx, 'bio_student')
      const { ask, plaintext, pendingId } = await refusedOnce(ctx)

      const confirmed = await resolve(ctx, pendingId, 'confirm', ctx.ownerSteppedUp)
      expect(refusal(confirmed)).toEqual({ status: 200, code: undefined })
      expect(confirmed.json().state).toBe('confirmed')
      expect(confirmed.json().consumedAt).toBeNull()

      // THE SAME KEY, which is what D23.6's hint tells a client to send.
      const retry = await ask()
      expect(refusal(retry)).toEqual({ status: 201, code: undefined })
      expect(await memberPuids(ctx)).toContain('bio_student')
      expect((await pendingById(ctx.db, pendingId))?.consumedAt).not.toBeNull()

      // ONCE. A second ATTEMPT at the action is a new request — a fresh key — and it is
      // a NEW question, not the old one: the grant was spent.
      const again = await ctx.app.inject({
        ...addMemberRequest(ctx.projectId, plaintext, 'm'.repeat(12)),
        payload: { puid: 'bio_student', role: 'collaborator' },
      })
      expect(refusal(again)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
      expect(again.json().error.pendingAction.id).not.toBe(pendingId)
    })
  })

  it('replays the confirmed retry’s ANSWER for the same key, and runs nothing again', async () => {
    /**
     * **THE SECOND-ORDER PROPERTY, ASSERTED RATHER THAN LEFT TO BE DISCOVERED**
     * (sitting 1's `[M5]` §3, sitting 4's F10). The confirmed retry's `201` is stored
     * under its `Idempotency-Key`, so repeating that key answers `201` for ever with no
     * capability check and no handler. "Exactly once" is a statement about the ACTION.
     *
     * Measured by deleting every member row between the two calls: the replay still
     * answers `201` and the rows stay deleted, which is the proof the handler did not
     * run. A reader who assumes otherwise mis-reads `consumed_at`.
     */
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'bio_student')
      const { ask, pendingId } = await refusedOnce(ctx)
      await confirmed(ctx, pendingId)
      const retry = await ask()
      expect(retry.statusCode).toBe(201)

      await ctx.db
        .delete(projectMembers)
        .where(eq(projectMembers.projectId, ctx.projectId))
      const replayed = await ask()
      expect(replayed.statusCode).toBe(201)
      expect(replayed.json()).toEqual(retry.json())
      // Nothing ran: the answer came out of the idempotency record.
      expect(
        await ctx.db
          .select()
          .from(projectMembers)
          .where(eq(projectMembers.projectId, ctx.projectId)),
      ).toEqual([])
    })
  })

  it('does not let a DIFFERENT request through on a confirmation', async () => {
    // The confirmation is for the request a human READ, not for the capability. Matching
    // on `action` instead of the fingerprint would make one confirmation a standing
    // grant of `members:manage`.
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'bio_student')
      const { plaintext, pendingId } = await refusedOnce(ctx)
      await confirmed(ctx, pendingId)

      const different = await ctx.app.inject({
        ...addMemberRequest(ctx.projectId, plaintext, 'j'.repeat(12)),
        payload: { puid: 'unrelated_user', role: 'owner' },
      })
      expect(refusal(different)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
      expect(different.json().error.pendingAction.id).not.toBe(pendingId)
      expect(await memberPuids(ctx)).not.toContain('unrelated_user')
    })
  })

  it('does not let a SECOND token through on another token’s confirmation', async () => {
    // A confirmation grants ONE credential a retry (sitting 4's decision on the reuse
    // lookup). A match on the fingerprint alone would let any token holding the same
    // question spend somebody else's answer.
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'bio_student')
      const { pendingId } = await refusedOnce(ctx)
      await confirmed(ctx, pendingId)

      const second = await tokenHolding(ctx, ['project:read'])
      const res = await ctx.app.inject({
        ...addMemberRequest(ctx.projectId, second, 's'.repeat(12)),
        payload: { puid: 'bio_student', role: 'collaborator' },
      })
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
      expect(res.json().error.pendingAction.id).not.toBe(pendingId)
      expect(await memberPuids(ctx)).not.toContain('bio_student')
    })
  })

  it('refuses a rejected action’s retry, and says it was rejected', async () => {
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'bio_student')
      const { ask, pendingId } = await refusedOnce(ctx)
      const rejected = await resolve(ctx, pendingId, 'reject', ctx.ownerCookies, {
        reason: 'not this term',
      })
      expect(refusal(rejected)).toEqual({ status: 200, code: undefined })
      expect(rejected.json().state).toBe('rejected')
      expect(rejected.json().reason).toBe('not this term')

      const retry = await ask()
      expect(refusal(retry)).toEqual({ status: 403, code: 'TOKEN_ACTION_REJECTED' })
      // The agent is told WHY, so it can correct itself rather than retrying for ever
      // (D23.7) — and no second question is asked on the person's behalf.
      expect(retry.json().error.pendingAction.reason).toBe('not this term')
      expect(retry.json().error.pendingAction.id).toBe(pendingId)
      expect(await memberPuids(ctx)).not.toContain('bio_student')
    })
  })

  it('cannot be confirmed by a token, only in an interactive session', async () => {
    // THE ENTIRE POINT OF D24. If a token could confirm its own pending action the
    // mechanism would be a loop with no human in it.
    await withProjectServer(async (ctx) => {
      const { plaintext, pendingId } = await refusedOnce(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/pending-actions/${pendingId}/confirm`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': KEY },
      })
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
      expect((await pendingById(ctx.db, pendingId))?.state).toBe('pending')
    })
  })

  it('cannot be confirmed by someone who lacks the capability themselves', async () => {
    await withProjectServer(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx)
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator')
      const res = await resolve(ctx, pendingId, 'confirm', collaborator)
      expect(refusal(res)).toEqual({ status: 403, code: 'FORBIDDEN' })
      expect((await pendingById(ctx.db, pendingId))?.state).toBe('pending')
    })
  })

  it('cannot be confirmed twice', async () => {
    await withProjectServer(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx)
      expect(
        (await resolve(ctx, pendingId, 'confirm', ctx.ownerSteppedUp)).statusCode,
      ).toBe(200)
      const twice = await resolve(ctx, pendingId, 'confirm', ctx.ownerSteppedUp)
      expect(refusal(twice)).toEqual({ status: 409, code: 'PENDING_ACTION_RESOLVED' })
      // Nor rejected after the fact: a resolved question has one answer.
      const then = await resolve(ctx, pendingId, 'reject', ctx.ownerCookies, {
        reason: 'changed my mind',
      })
      expect(refusal(then)).toEqual({ status: 409, code: 'PENDING_ACTION_RESOLVED' })
    })
  })

  it('cannot be confirmed once the question has expired', async () => {
    /**
     * Task 10 builds the sweeper that moves an expired row to `expired`; until it does —
     * and, afterwards, in the window between a row expiring and the sweep noticing — a
     * stale question is still `pending`. `resolutionFor` will not match an expired row, so
     * without the route's own check a person would be told "confirmed" for an answer that
     * can never be spent. The row is aged here rather than waited out: twenty-four hours
     * is `PENDING_ACTION_TTL_MS`.
     */
    await withProjectServer(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx)
      await ctx.db
        .update(pendingActions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(pendingActions.id, pendingId))

      const res = await resolve(ctx, pendingId, 'confirm', ctx.ownerSteppedUp)
      expect(refusal(res)).toEqual({ status: 409, code: 'PENDING_ACTION_RESOLVED' })
      expect((await pendingById(ctx.db, pendingId))?.state).toBe('pending')
    })
  })

  it('leaves the confirmation usable when the RETRY’s handler fails', async () => {
    /**
     * `consumed_at` is stamped AFTER the handler resolves, never before. A handler that
     * throws — a transient failure the agent did not cause — must not burn the human's
     * decision, or a person has to be asked again for something they already answered.
     *
     * `platform_admin` is the one of §16's four that `withProjectServer` never signs in,
     * so `addMember` answers `400 MEMBER_USER_NOT_FOUND` — after the authorization check,
     * which is exactly the shape wanted here.
     */
    await withProjectServer(async (ctx) => {
      const { ask, pendingId } = await refusedOnce(ctx, 'platform_admin')
      await confirmed(ctx, pendingId)

      const failed = await ask()
      expect(refusal(failed)).toEqual({ status: 400, code: 'MEMBER_USER_NOT_FOUND' })
      expect((await pendingById(ctx.db, pendingId))?.consumedAt).toBeNull()

      // The reason it failed goes away, and the SAME confirmation still spends.
      await sessionFor(ctx, 'platform_admin')
      const succeeded = await ask()
      expect(refusal(succeeded)).toEqual({ status: 201, code: undefined })
      expect((await pendingById(ctx.db, pendingId))?.consumedAt).not.toBeNull()
    })
  })
})

/**
 * §26's queue, as a read (P5b Task 8).
 *
 * *"The primary screen is the queue ... Not the fleet list."* P5c builds the screen; these
 * two reads are what it will be built on, and they are also how an agent polls for its own
 * answer instead of guessing when to retry.
 *
 * **THE TWO CREDENTIAL CLASSES SEE DIFFERENT SETS, and that is the rule rather than an
 * accident.** Anyone who may read the project reads the project's queue — it is a screen
 * about the project. A TOKEN reads only the questions IT asked: a token's authority is its
 * own (§3, Task 5), and one agent enumerating another agent's requests is a read nothing
 * in D24 grants it. The same rule, stated once, decides both routes.
 */
describe('the queue (§26)', () => {
  it('lists a project’s pending actions, newest first, with how long each has waited', async () => {
    await withProjectServer(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx)
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/pending-actions`,
        cookies: owner,
      })
      expect(refusal(res)).toEqual({ status: 200, code: undefined })
      const [first] = res.json()
      expect(first.id).toBe(pendingId)
      expect(first.action).toBe('members:manage')
      // §26: "how long it has waited" is the queue's headline number, so it is in the
      // representation rather than computed by each client from createdAt.
      expect(typeof first.waitingSeconds).toBe('number')
      expect(first.summary).toContain('member')
    })
  })

  it('puts the NEWEST question first', async () => {
    // Asserted with two rows, because a one-row list is ordered correctly by every
    // ordering there is — including none. The two differ in their body, so the reuse
    // lookup gives each its own row rather than handing back the first.
    await withProjectServer(async (ctx) => {
      const { pendingId: older } = await refusedOnce(ctx, 'bio_student')
      const { pendingId: newer } = await refusedOnce(ctx, 'platform_admin')
      expect(newer).not.toBe(older)
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/pending-actions`,
        cookies: ctx.ownerCookies,
      })
      expect((res.json() as { id: string }[]).map((row) => row.id)).toEqual([
        newer,
        older,
      ])
    })
  })

  it('lets a COLLABORATOR read the queue, because it is a screen about the project', async () => {
    // `project:read`, not `members:manage`. Answering the question needs the capability
    // (Task 7); seeing that it was asked does not, and a queue only owners can see is a
    // queue nobody watches.
    await withProjectServer(async (ctx) => {
      await refusedOnce(ctx)
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/pending-actions`,
        cookies: collaborator,
      })
      expect(refusal(res)).toEqual({ status: 200, code: undefined })
      expect(res.json()).toHaveLength(1)
    })
  })

  it('lets the TOKEN read its own pending action, so an agent can poll for the answer', async () => {
    await withProjectServer(async (ctx) => {
      const { plaintext, pendingId } = await refusedOnce(ctx)
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/pending-actions/${pendingId}`,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(refusal(res)).toEqual({ status: 200, code: undefined })
      expect(res.json().state).toBe('pending')
    })
  })

  it('shows the token only ITS OWN questions in the project’s queue', async () => {
    // A token's authority is its own. Two agents on one project must not read each
    // other's requests, and the list is where that would leak in bulk.
    await withProjectServer(async (ctx) => {
      const { pendingId: mine } = await refusedOnce(ctx, 'bio_student')
      const { plaintext: theirs } = await refusedOnce(ctx, 'platform_admin')
      const asOwner = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/pending-actions`,
        cookies: ctx.ownerCookies,
      })
      expect(asOwner.json()).toHaveLength(2)

      const asToken = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/pending-actions`,
        headers: { authorization: `Bearer ${theirs}` },
      })
      expect(refusal(asToken)).toEqual({ status: 200, code: undefined })
      const ids = (asToken.json() as { id: string }[]).map((row) => row.id)
      expect(ids).toHaveLength(1)
      expect(ids).not.toContain(mine)
    })
  })

  it('hides ANOTHER token’s pending action from a token', async () => {
    // 404, not 403 — the same answer a stranger gets, for the same reason: a refusal
    // that confirms the row exists turns the id space into an enumeration oracle.
    await withProjectServer(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx, 'bio_student')
      const { plaintext: other } = await refusedOnce(ctx, 'platform_admin')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/pending-actions/${pendingId}`,
        headers: { authorization: `Bearer ${other}` },
      })
      expect(refusal(res)).toEqual({ status: 404, code: 'NOT_FOUND' })
    })
  })

  it('hides a pending action from a stranger', async () => {
    await withProjectServer(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx)
      const stranger = await sessionFor(ctx, 'unrelated_user')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/pending-actions/${pendingId}`,
        cookies: stranger,
      })
      expect(refusal(res)).toEqual({ status: 404, code: 'NOT_FOUND' })
    })
  })

  it('never carries the refused request’s body', async () => {
    // The row exists to be read on a screen (§14, §26). `bio_student` is the PUID the
    // refused `addMember` body named, and it appears nowhere in the answer.
    await withProjectServer(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx)
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/pending-actions/${pendingId}`,
        cookies: ctx.ownerCookies,
      })
      expect(refusal(res)).toEqual({ status: 200, code: undefined })
      expect(JSON.stringify(res.json())).not.toContain('bio_student')
    })
  })
})

/**
 * Removing a member (§13) — and the claim Task 6 made about every route written after it.
 *
 * P5a's *What this plan does not build* named this route once: *"Removing a member — a
 * privileged action with nowhere to put a pending action until P5b."* The place has
 * existed since Task 6, so the route is small. **Its real deliverable is the last test in
 * this block**: `DELETE /v1/projects/{projectId}/members/{userId}` is the FIRST privileged
 * route added after D24's rule was made central, it calls `assertCapability` like every
 * other route and does nothing else about tokens — and if "centrally, not per-route" is
 * true, it is already enforced here. If it is not, that test is what says so.
 */
describe('removing a member (§13, and Task 6’s claim)', () => {
  async function userIdOf(ctx: TestProject, puid: TestUserPuid): Promise<string> {
    const [row] = await ctx.db.select().from(users).where(eq(users.ubcCwlPuid, puid))
    if (row === undefined) throw new Error(`'${puid}' has never signed in`)
    return row.id
  }

  it('lets an owner remove a collaborator', async () => {
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'bio_student', 'collaborator')
      expect(await memberPuids(ctx)).toContain('bio_student')

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/projects/${ctx.projectId}/members/${await userIdOf(ctx, 'bio_student')}`,
        cookies: ctx.ownerSteppedUp,
        headers: mutationHeaders(ctx.deps),
      })
      expect(refusal(res)).toEqual({ status: 200, code: undefined })
      // THE ANSWER'S SHAPE, not merely its status: the body is the members as they now
      // are, and the person asked about is not among them.
      expect((res.json() as { puid: string }[]).map((m) => m.puid)).toEqual(['bio_prof'])
      expect(await memberPuids(ctx)).not.toContain('bio_student')
    })
  })

  it('is idempotent: removing somebody who is not a member answers the same way', async () => {
    // DELETE is idempotent, and the caller holds `members:manage` — they can already
    // read the membership, so a 404 would hide nothing and would turn the second click
    // of a console button into an error for an action that achieved its goal. The
    // asymmetry with `DELETE /v1/tokens/{tokenId}`, which DOES answer 404, is deliberate:
    // there the 404 hides which token ids exist from somebody who may not see them.
    await withProjectServer(async (ctx) => {
      // Signed in, so the user row exists — but never added to the project.
      await sessionFor(ctx, 'bio_student')
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/projects/${ctx.projectId}/members/${await userIdOf(ctx, 'bio_student')}`,
        cookies: ctx.ownerSteppedUp,
        headers: mutationHeaders(ctx.deps),
      })
      expect(refusal(res)).toEqual({ status: 200, code: undefined })
      expect((res.json() as { puid: string }[]).map((m) => m.puid)).toEqual(['bio_prof'])
    })
  })

  it('refuses the LAST owner’s removal, so a project cannot be orphaned', async () => {
    await withProjectServer(async (ctx) => {
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/projects/${ctx.projectId}/members/${ctx.userId}`,
        cookies: ctx.ownerSteppedUp,
        headers: mutationHeaders(ctx.deps),
      })
      expect(refusal(res)).toEqual({ status: 409, code: 'PROJECT_LAST_OWNER' })
      expect(await memberPuids(ctx)).toContain('bio_prof')
    })
  })

  it('lets an owner go once somebody else owns the project', async () => {
    // The guard is about the LAST owner, not about owners. Without this case the rule
    // above is satisfied by a route that refuses every owner's removal.
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'bio_student', 'owner')
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/projects/${ctx.projectId}/members/${ctx.userId}`,
        cookies: ctx.ownerSteppedUp,
        headers: mutationHeaders(ctx.deps),
      })
      expect(refusal(res)).toEqual({ status: 200, code: undefined })
      expect((res.json() as { puid: string }[]).map((m) => m.puid)).toEqual([
        'bio_student',
      ])
    })
  })

  /**
   * THE POINT OF THIS TASK. This route was written after Task 6 and knows nothing about
   * delegated tokens: it calls `assertCapability(..., 'members:manage')` like every other
   * route and does nothing else. If D24's rule is genuinely central it is already
   * enforced here — and if it is not, this is the test that says so.
   *
   * **The CODE, not the status.** `403 FORBIDDEN` and `403 TOKEN_ACTION_PENDING` are both
   * `403`, and a status-only assertion here would pass against a route on which D24's
   * loop cannot start at all. That confusion has bitten five sittings running.
   */
  it('is refused to a token with a PendingAction, WITHOUT the route doing anything', async () => {
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'bio_student', 'collaborator')
      const plaintext = await tokenHolding(ctx, ['members:manage'])
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/projects/${ctx.projectId}/members/${await userIdOf(ctx, 'bio_student')}`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': KEY },
      })
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
      expect(res.json().error.pendingAction.action).toBe('members:manage')
      // And it did not happen.
      expect(await memberPuids(ctx)).toContain('bio_student')
    })
  })

  it('lets the confirmed retry of a REMOVAL through, exactly once', async () => {
    // The whole loop, on a route that was written after it. `refusedOnce` drives the
    // `addMember` half; this is the half D24's sentence is actually about — an agent
    // asking to take something away.
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'bio_student', 'collaborator')
      const plaintext = await tokenHolding(ctx, ['project:read'])
      const url = `/v1/projects/${ctx.projectId}/members/${await userIdOf(ctx, 'bio_student')}`
      const ask = (): Promise<LightMyRequestResponse> =>
        ctx.app.inject({
          method: 'DELETE',
          url,
          headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': KEY },
        })

      const refused = await ask()
      expect(refusal(refused)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
      await confirmed(ctx, refused.json().error.pendingAction.id)

      const retry = await ask()
      expect(refusal(retry)).toEqual({ status: 200, code: undefined })
      expect(await memberPuids(ctx)).not.toContain('bio_student')
    })
  })
})

/**
 * §20's STEP-UP, WHERE D24's LOOP MEETS IT (P6a sitting 6, F12; Rich, 2026-09-20).
 *
 * The two tests below are a PAIR and neither means anything alone. Confirming is guarded
 * because authorizing an agent to do one of D24's privileged four is doing it by proxy —
 * `answerable()` already requires the person to hold that capability themselves, so a
 * stolen session that could confirm would be exactly §20's *"a stolen admin session must
 * not be sufficient"*. Rejecting is NOT guarded, because it grants nothing and stops an
 * agent, and a person putting out a fire should not be sent on a round trip first.
 *
 * **A test that only asserted the refusal would be satisfied by a route that refuses
 * everything** (P5c sitting 9, F16), and a test that only asserted the rejection would be
 * satisfied by a platform with no guard at all.
 */
describe('§20’s step-up meets D24’s loop', () => {
  it('refuses a CONFIRM from a session that has not re-proved itself', async () => {
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'bio_student')
      const { pendingId } = await refusedOnce(ctx)
      const res = await resolve(ctx, pendingId, 'confirm', ctx.ownerCookies)
      expect(refusal(res)).toEqual({ status: 403, code: 'STEP_UP_REQUIRED' })
      // AND THE QUESTION IS UNTOUCHED — a refusal that half-happened is worse than either.
      expect((await pendingById(ctx.db, pendingId))?.state).toBe('pending')
    })
  })

  it('lets the SAME person confirm once they have stepped up — the positive control', async () => {
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'bio_student')
      const { pendingId } = await refusedOnce(ctx)
      const res = await resolve(ctx, pendingId, 'confirm', ctx.ownerSteppedUp)
      expect(refusal(res)).toEqual({ status: 200, code: undefined })
      expect(res.json().state).toBe('confirmed')
    })
  })

  it('lets an ORDINARY session reject — the safe direction stays free', async () => {
    await withProjectServer(async (ctx) => {
      await sessionFor(ctx, 'bio_student')
      const { pendingId } = await refusedOnce(ctx)
      const res = await resolve(ctx, pendingId, 'reject', ctx.ownerCookies, {
        reason: 'not something an agent should be doing',
      })
      expect(refusal(res)).toEqual({ status: 200, code: undefined })
      expect(res.json().state).toBe('rejected')
    })
  })
})
