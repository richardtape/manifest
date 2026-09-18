import { afterAll, describe, expect, it } from 'vitest'
import { resetDatabase } from '../db/testing.js'
import { mintTestToken } from '../tokens/testing.js'
import { refusal, sessionFor, withProjectServer } from './testing.js'

afterAll(resetDatabase)

/**
 * §20: *"Delegated tokens carry per-token rate limits and quotas ... the control-plane API
 * needs its own, because a third-party agent is code the platform did not write, running
 * on a machine it does not control."* (P5b Task 9, Decision 9.)
 *
 * **THE LIMIT IS THE TOKEN'S OWN, off its row**, which is what makes `delegated_tokens
 * .rate_limit` a column rather than decoration — one window size shared by every token
 * would make the column unreadable. P5a Task 9's limiter already said in its own comment
 * that this generalises it, and until now `TokenActor.rateLimit` had no reader at all.
 *
 * **It is taken in the ONE `onRequest` hook, after the token is verified**, so every `/v1`
 * route inherits it exactly as D24's refusal does — a route cannot forget it, and nothing
 * a stranger sends can spend a real token's window.
 */
describe('per-token rate limits (§20)', () => {
  it('refuses past the token’s own limit, and says when to retry', async () => {
    await withProjectServer(async ({ app, db, projectId, userId }) => {
      const { plaintext } = await mintTestToken(db, {
        userId,
        projectId,
        capabilities: ['project:read'],
        rateLimit: 3,
      })
      const get = (): Promise<{ statusCode: number; body: string; headers: object }> =>
        app.inject({
          method: 'GET',
          url: `/v1/projects/${projectId}`,
          headers: { authorization: `Bearer ${plaintext}` },
        })
      for (let i = 0; i < 3; i++)
        expect(refusal(await get())).toEqual({ status: 200, code: undefined })
      const refused = await get()
      expect(refusal(refused)).toEqual({ status: 429, code: 'RATE_LIMITED' })
      expect(
        Number((refused.headers as Record<string, string>)['retry-after']),
      ).toBeGreaterThan(0)
    })
  })

  it('limits each token separately', async () => {
    // One busy agent must not lock out another, which a shared window would do.
    await withProjectServer(async ({ app, db, projectId, userId }) => {
      const mint = () =>
        mintTestToken(db, {
          userId,
          projectId,
          capabilities: ['project:read'],
          rateLimit: 2,
        })
      const a = await mint()
      const b = await mint()
      const get = (t: string) =>
        app.inject({
          method: 'GET',
          url: `/v1/projects/${projectId}`,
          headers: { authorization: `Bearer ${t}` },
        })
      await get(a.plaintext)
      await get(a.plaintext)
      expect(refusal(await get(a.plaintext))).toEqual({
        status: 429,
        code: 'RATE_LIMITED',
      })
      expect(refusal(await get(b.plaintext))).toEqual({ status: 200, code: undefined })
    })
  })

  it('does not let an UNKNOWN token spend a real one’s window', async () => {
    /**
     * The limit is taken AFTER the token is verified, and that ordering is the security
     * property: taken before, anybody who can reach the API could exhaust a token's
     * window by sending its id with a wrong secret — a denial of service that needs no
     * credential at all. A bogus token is `401` and costs nothing.
     */
    await withProjectServer(async ({ app, db, projectId, userId }) => {
      const { plaintext, row } = await mintTestToken(db, {
        userId,
        projectId,
        capabilities: ['project:read'],
        rateLimit: 2,
      })
      const forged = `mft_${row.id.replace(/-/g, '')}_${'w'.repeat(43)}`
      for (let i = 0; i < 20; i++) {
        const bad = await app.inject({
          method: 'GET',
          url: `/v1/projects/${projectId}`,
          headers: { authorization: `Bearer ${forged}` },
        })
        expect(refusal(bad)).toEqual({ status: 401, code: 'UNAUTHENTICATED' })
      }
      /**
       * **AND ITS WHOLE WINDOW IS STILL THERE**, which is what makes this test able to
       * fail at all. Asserting one `200` would be green with no limiter anywhere — it is
       * an "is not limited" claim, and those are true of a platform that limits nothing
       * (sitting 5's F1, in this sitting's own tests). Spending the token's two and
       * watching the third refused proves the limiter is running AND that twenty forged
       * requests cost this token nothing.
       */
      const get = () =>
        app.inject({
          method: 'GET',
          url: `/v1/projects/${projectId}`,
          headers: { authorization: `Bearer ${plaintext}` },
        })
      expect(refusal(await get())).toEqual({ status: 200, code: undefined })
      expect(refusal(await get())).toEqual({ status: 200, code: undefined })
      expect(refusal(await get())).toEqual({ status: 429, code: 'RATE_LIMITED' })
    })
  })

  it('does not limit a session, while limiting a token in the same server', async () => {
    /**
     * §20 scopes this control to tokens; a person in a browser is not a third-party agent,
     * and the slug check keeps its own per-user limiter (P5a Task 9).
     *
     * **THE TOKEN HALF IS WHAT GIVES THE SESSION HALF TEETH.** Twenty unrefused session
     * requests are exactly what a platform with no limiter answers, so on its own this
     * asserts nothing. Refusing the token in the same fixture, at the same moment, is the
     * contrast that makes "the session was not limited" a statement about the rule rather
     * than about the absence of one.
     */
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
        rateLimit: 2,
      })
      const url = `/v1/projects/${ctx.projectId}`
      for (let i = 0; i < 20; i++) {
        expect(
          refusal(await ctx.app.inject({ method: 'GET', url, cookies: owner })),
        ).toEqual({ status: 200, code: undefined })
      }
      const asToken = () =>
        ctx.app.inject({
          method: 'GET',
          url,
          headers: { authorization: `Bearer ${plaintext}` },
        })
      await asToken()
      await asToken()
      expect(refusal(await asToken())).toEqual({ status: 429, code: 'RATE_LIMITED' })
    })
  })
})
