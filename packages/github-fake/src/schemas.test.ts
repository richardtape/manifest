import { createSign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { expectGitHubShape, ROOTS, rewrittenSites, SCHEMA_SOURCE } from './schemas.js'
import { startFake } from './testing.js'

// The helper every other test here trusts. If IT passes silently, every "conforms to
// GitHub's schema" in this package means nothing.

describe('GitHub’s schemas, as the fake’s tests read them', () => {
  it('are GitHub’s REST description 1.1.4, verbatim, with ten roots', () => {
    expect(SCHEMA_SOURCE).toBe('github/rest-api-description 1.1.4')
    expect(ROOTS).toHaveLength(10)
  })

  it('rewrites exactly the two nullable-without-type nodes of today’s file ([M11], F4)', () => {
    expect(rewrittenSites).toBe(2)
  })

  it('compiles every root, and each refuses a value that is not an object', () => {
    // Not `{}`: a root with no required keys (`webhook ping`) rightly accepts it.
    for (const root of ROOTS) {
      expect(() => expectGitHubShape(root, 42)).toThrow(/not GitHub's/)
    }
  })

  it('refuses a root it does not know — a typo cannot pass as conforms', () => {
    expect(() => expectGitHubShape('GET /app 201', {})).toThrow(/no root/)
  })

  it('enforces required keys: an installation token without `token` is refused, one with it accepted', () => {
    expect(() =>
      expectGitHubShape('POST /app/installations/{installation_id}/access_tokens 201', {
        expires_at: '2026-09-24T21:00:00Z',
      }),
    ).toThrow(/token/)
    expect(() =>
      expectGitHubShape('POST /app/installations/{installation_id}/access_tokens 201', {
        token: 'ghs_x',
        expires_at: '2026-09-24T21:00:00Z',
      }),
    ).not.toThrow()
  })

  it('enforces FORMATS — without ajv-formats a `uri` is any string ([M11])', async () => {
    const fake = await startFake()
    try {
      const t = Math.floor(Date.now() / 1000)
      const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
      const u = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: fake.appId, iat: t - 60, exp: t + 540 })}`
      const jwt = `${u}.${createSign('RSA-SHA256').update(u).sign(fake.appKeyPem).toString('base64url')}`
      const app = await (
        await fetch(`${fake.apiUrl}/app`, { headers: { authorization: `Bearer ${jwt}` } })
      ).json()
      expect(() => expectGitHubShape('GET /app 200', app)).not.toThrow()
      app.owner.html_url = 'not a uri'
      expect(() => expectGitHubShape('GET /app 200', app)).toThrow(/format/)
      // …and a null IS accepted where GitHub wrote `nullable` beside `anyOf` — the node the
      // normaliser rewrote, which Ajv could not compile at all without it.
      const inst = await (
        await fetch(`${fake.apiUrl}/orgs/${fake.org}/installation`, {
          headers: { authorization: `Bearer ${jwt}` },
        })
      ).json()
      expect(() =>
        expectGitHubShape('GET /orgs/{org}/installation 200', { ...inst, account: null }),
      ).not.toThrow()
      expect(() =>
        expectGitHubShape('GET /orgs/{org}/installation 200', { ...inst, account: 42 }),
      ).toThrow()
    } finally {
      await fake.stop()
    }
  })
})
