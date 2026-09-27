import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { events, idempotencyKeys } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { revokeToken } from '../tokens/index.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  mutationHeaders,
  projectBody,
  refusal,
  sessionFor,
  withProjectServer,
} from './testing.js'

afterAll(resetDatabase)

/**
 * D24: a token is *"minted by the user in an interactive session, scoped to a project and
 * a capability set, with an expiry."* Three routes, and the two rules that make minting
 * safe: a token may never hold one of `PRIVILEGED`, and the plaintext is returned exactly
 * once (Decision 11).
 */
describe('minting a delegated token (D24, Task 4)', () => {
  it('returns the plaintext exactly once, and never again', async () => {
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const minted = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/tokens`,
        cookies: owner,
        headers: mutationHeaders(ctx.deps),
        payload: {
          name: 'ci',
          capabilities: ['project:read', 'build:create'],
          expiresInDays: 30,
        },
      })
      expect(minted.statusCode).toBe(201)
      const body = minted.json()
      expect(body.secret).toMatch(/^mft_[0-9a-f]{32}_/)

      const listed = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/tokens`,
        cookies: owner,
      })
      const one = listed.json().find((t: { id: string }) => t.id === body.token.id)
      expect(one).toBeDefined()
      // The read schema HAS NO `secret` FIELD (Decision 11) — not an empty one.
      expect('secret' in one).toBe(false)
      expect(JSON.stringify(listed.json())).not.toContain(body.secret)
    })
  })

  it('names the person who minted it, never their PUID (the authoring API plan’s Task 12)', async () => {
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const minted = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/tokens`,
        cookies: owner,
        headers: mutationHeaders(ctx.deps),
        payload: { name: 'ci', capabilities: ['project:read'], expiresInDays: 30 },
      })
      expect(minted.statusCode, minted.body).toBe(201)
      const said = await ctx.deps.db
        .select({ message: events.humanMessage })
        .from(events)
        .where(and(eq(events.projectId, ctx.projectId), eq(events.type, 'token.minted')))
      expect(said).toHaveLength(1)
      expect(said[0]!.message).toMatch(
        /^Bio Prof created a delegated token, 'ci', which can /,
      )
      expect(said[0]!.message).not.toContain('bio_prof')
    })
  })

  it('says whether a token has EXPIRED, and a revocation is not an expiry', async () => {
    // Task 10's token half. §20 asks for a list a person can review, and one that showed
    // `expiresAt` alone would make every reviewer compare timestamps by hand — so the
    // platform computes it, the way `LaunchReadiness` is computed rather than stored
    // (P5a Task 15).
    //
    // The revoked token is the discriminating case. `expired` and `revokedAt` are two
    // different facts about why a credential stopped working — one is a clock, the other
    // is a person — and a client that showed "expired" for a revocation would tell an
    // operator the wrong story about their own project.
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const mint = (name: string, expiresAt: Date) =>
        mintTestToken(ctx.db, {
          userId: ctx.userId,
          projectId: ctx.projectId,
          capabilities: ['project:read'],
          name,
          expiresAt,
        })
      const day = new Date(Date.now() + 86_400_000)
      const dead = await mint('dead', new Date(Date.now() - 1000))
      const live = await mint('live', day)
      const revoked = await mint('revoked', day)
      expect(await revokeToken(ctx.db, revoked.row.id, ctx.userId)).toBe(true)

      const listed = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/tokens`,
        cookies: owner,
      })
      expect(listed.statusCode).toBe(200)
      const byId = new Map<string, { expired: boolean; revokedAt: string | null }>(
        listed.json().map((t: { id: string }) => [t.id, t]),
      )

      expect(byId.get(dead.row.id)?.expired).toBe(true)
      expect(byId.get(live.row.id)?.expired).toBe(false)
      expect(byId.get(revoked.row.id)).toMatchObject({ expired: false })
      expect(byId.get(revoked.row.id)?.revokedAt).not.toBeNull()
    })
  })

  it('refuses to mint a token holding a privileged capability', async () => {
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      for (const capability of [
        'members:manage',
        'release:promote',
        'quota:set',
        'secret:read',
      ]) {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/tokens`,
          cookies: owner,
          headers: mutationHeaders(ctx.deps),
          payload: {
            name: 'bad',
            capabilities: ['project:read', capability],
            expiresInDays: 30,
          },
        })
        expect(res.statusCode).toBe(400)
        expect(res.json().error.code).toBe('TOKEN_CAPABILITY_FORBIDDEN')
        // D23.7: the message must name WHICH capability, or an agent cannot correct itself.
        expect(res.json().error.message).toContain(capability)
      }
    })
  })

  it('refuses a capability the minter does not hold themselves', async () => {
    // A collaborator cannot mint a token that deletes if they cannot delete. Otherwise a
    // token is a privilege-escalation primitive rather than a delegation of one.
    await withProjectServer(async (ctx) => {
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator')
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/tokens`,
        cookies: collaborator,
        headers: mutationHeaders(ctx.deps),
        payload: {
          name: 'x',
          capabilities: ['project:delete'],
          expiresInDays: 30,
        },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })
  })

  it('revokes a token, and a stranger cannot', async () => {
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const minted = (
        await ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/tokens`,
          cookies: owner,
          headers: mutationHeaders(ctx.deps),
          payload: {
            name: 'ci',
            capabilities: ['project:read'],
            expiresInDays: 30,
          },
        })
      ).json()

      const stranger = await sessionFor(ctx, 'bio_student')
      const refused = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/tokens/${minted.token.id}`,
        cookies: stranger,
        headers: mutationHeaders(ctx.deps),
      })
      expect(refused.statusCode).toBe(404)
      expect(refused.json().error.code).toBe('NOT_FOUND')

      const revoked = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/tokens/${minted.token.id}`,
        cookies: owner,
        headers: mutationHeaders(ctx.deps),
      })
      expect(revoked.statusCode).toBe(200)
      expect(revoked.json().revokedAt).not.toBeNull()
    })
  })

  it('bounds the expiry, and says what the bound is', async () => {
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/tokens`,
        cookies: owner,
        headers: mutationHeaders(ctx.deps),
        payload: {
          name: 'forever',
          capabilities: ['project:read'],
          expiresInDays: 4000,
        },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('REQUEST_INVALID')
      expect(res.json().error.message).toContain('expiresInDays')
    })
  })
})

/**
 * A DELEGATED TOKEN'S SECRET IS KEPT IN NO IDEMPOTENCY RECORD (the authoring API plan's Task 12,
 * its sitting 5's F4, Rich's option (a)). The record keeps the token WITHOUT its secret, and a
 * retry with the same key answers 409 TOKEN_ALREADY_MINTED naming the token — so D24's "shown
 * exactly once" is true, and a client that lost the answer revokes and mints again rather than
 * getting a second token. Every other route still replays (D23.6).
 */
describe('a replayed mint (Task 12, Step 5)', () => {
  const MINT = { name: 'claude-code', capabilities: ['project:read'], expiresInDays: 1 }
  const TOKENS_ROUTE = 'POST /v1/projects/:projectId/tokens'

  it('is 409 TOKEN_ALREADY_MINTED naming the token — ONE token exists, and NO record holds its secret', async () => {
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const headers = mutationHeaders(ctx.deps)
      const mint = () =>
        ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/tokens`,
          cookies: owner,
          headers,
          payload: MINT,
        })
      const first = await mint()
      expect(first.statusCode, first.body).toBe(201)
      const { token, secret } = first.json() as { token: { id: string }; secret: string }
      // The positive control: the FIRST answer carries the secret.
      expect(secret).toMatch(/^mft_[0-9a-f]{32}_/)

      const again = await mint()
      expect(refusal(again)).toEqual({ status: 409, code: 'TOKEN_ALREADY_MINTED' })
      expect(again.json().error.message).toContain(token.id)
      expect(again.json().error.message).toContain("'claude-code'")
      expect(again.body).not.toContain(secret)

      const listed = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/tokens`,
        cookies: owner,
      })
      expect(listed.json().map((t: { id: string }) => t.id)).toEqual([token.id])

      const records = await ctx.deps.db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.route, TOKENS_ROUTE))
      expect(records).toHaveLength(1)
      expect((records[0]!.responseBody as { token: { id: string } }).token.id).toBe(
        token.id,
      )
      expect(JSON.stringify(records)).not.toContain(secret)
      expect('secret' in (records[0]!.responseBody as object)).toBe(false)
    })
  })

  it('checks the fingerprint FIRST: the same key with a different body is still IDEMPOTENCY_KEY_REUSED', async () => {
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const headers = mutationHeaders(ctx.deps)
      const url = `/v1/projects/${ctx.projectId}/tokens`
      const first = await ctx.app.inject({
        method: 'POST',
        url,
        cookies: owner,
        headers,
        payload: MINT,
      })
      expect(first.statusCode, first.body).toBe(201)
      const other = await ctx.app.inject({
        method: 'POST',
        url,
        cookies: owner,
        headers,
        payload: { ...MINT, name: 'another' },
      })
      expect(refusal(other)).toEqual({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })
    })
  })

  it('leaves every OTHER route replaying: createProject twice with one key is 201 and the same project', async () => {
    await withProjectServer(async (ctx) => {
      const owner = await sessionFor(ctx, 'bio_prof', 'owner')
      const headers = mutationHeaders(ctx.deps)
      const create = () =>
        ctx.app.inject({
          method: 'POST',
          url: '/v1/projects',
          cookies: owner,
          headers,
          payload: projectBody('replay-app'),
        })
      const first = await create()
      expect(first.statusCode, first.body).toBe(201)
      const again = await create()
      expect(again.statusCode, again.body).toBe(201)
      expect(again.json().id).toBe(first.json().id)
    })
  })
})
