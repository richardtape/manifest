import { afterAll, describe, expect, it } from 'vitest'
import { resetDatabase } from '../db/testing.js'
import { mutationHeaders, sessionFor, withProjectServer } from './testing.js'

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
