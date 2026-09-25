import { createSign, generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { expectGitHubShape } from './schemas.js'
import { startFake, type StartedFake } from './testing.js'

// GitHub's App-JWT rules, against the fake over real HTTP — and GitHub's own schemas for
// every answer that arrives.

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
function jwt(key: string, claims: Record<string, unknown>): string {
  const u = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}`
  return `${u}.${createSign('RSA-SHA256').update(u).sign(key).toString('base64url')}`
}

describe('the fake authenticates a GitHub App the way GitHub does', () => {
  let fake: StartedFake
  beforeEach(async () => {
    fake = await startFake()
  })
  afterEach(async () => {
    await fake.stop()
  })
  const now = () => Math.floor(Date.now() / 1000)
  const appJwt = () =>
    `Bearer ${jwt(fake.appKeyPem, { iss: fake.appId, iat: now() - 60, exp: now() + 540 })}`
  const get = (path: string, auth?: string) =>
    fetch(`${fake.apiUrl}${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        ...(auth ? { authorization: auth } : {}),
      },
    })
  const mint = (body: unknown, auth = appJwt()) =>
    fetch(`${fake.apiUrl}/app/installations/${fake.installationId}/access_tokens`, {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('answers GET /app for a valid JWT, in GitHub’s shape — the positive control', async () => {
    const res = await get('/app', appJwt())
    expect(res.status).toBe(200)
    const body = await res.json()
    expectGitHubShape('GET /app 200', body)
    expect(Object.keys(body.permissions).sort()).toEqual([
      'administration',
      'contents',
      'metadata',
    ])
  })

  it.each([
    ['no Authorization header', undefined],
    ['a JWT signed by another key', 'OTHER_KEY'],
    ['an exp more than ten minutes out', 'FAR'],
    ['an expired JWT', 'EXPIRED'],
    ['another App’s iss', 'OTHER_ISS'],
    ['an installation token where a JWT belongs', 'TOKEN'],
  ])('refuses %s with 401 and a message', async (_label, auth) => {
    const t = now()
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString()
    const header =
      auth === 'FAR'
        ? `Bearer ${jwt(fake.appKeyPem, { iss: fake.appId, iat: t - 60, exp: t + 660 })}`
        : auth === 'EXPIRED'
          ? `Bearer ${jwt(fake.appKeyPem, { iss: fake.appId, iat: t - 700, exp: t - 60 })}`
          : auth === 'OTHER_ISS'
            ? `Bearer ${jwt(fake.appKeyPem, { iss: '999', iat: t - 60, exp: t + 540 })}`
            : auth === 'OTHER_KEY'
              ? `Bearer ${jwt(other, { iss: fake.appId, iat: t - 60, exp: t + 540 })}`
              : auth === 'TOKEN'
                ? `Bearer ${(await (await mint({})).json()).token}`
                : auth
    const res = await get('/app', header)
    expect(res.status).toBe(401)
    expect((await res.json()).message).toMatch(/\S/)
  })

  it('answers GET /orgs/{org}/installation for the App, in GitHub’s shape', async () => {
    const res = await get(`/orgs/${fake.org}/installation`, appJwt())
    expect(res.status).toBe(200)
    const body = await res.json()
    expectGitHubShape('GET /orgs/{org}/installation 200', body)
    expect({ id: body.id, selection: body.repository_selection }).toEqual({
      id: Number(fake.installationId),
      selection: 'all',
    })
  })

  it('mints an installation token scoped to named repositories and permissions', async () => {
    const res = await mint({ permissions: { administration: 'write' } })
    expect(res.status).toBe(201)
    const body = await res.json()
    expectGitHubShape('POST /app/installations/{installation_id}/access_tokens 201', body)
    // GitHub's stateless format since 2026-04-27 (Read this first 4): ghs_<APPID>_<JWT>, NOT 40 characters.
    expect(body.token).toMatch(
      new RegExp(
        `^ghs_${fake.appId}_eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$`,
      ),
    )
    expect(body.token.length).toBeGreaterThan(40)
    expect(Date.parse(body.expires_at) - Date.now()).toBeGreaterThan(59 * 60_000)
    expect(body.permissions).toEqual({ administration: 'write' })
    expect(body.repository_selection).toBe('all')
  })

  it('refuses a token for a permission the App does not hold, and for a repository that does not exist', async () => {
    const wider = await mint({ permissions: { issues: 'write' } })
    expect(wider.status).toBe(422)
    const higher = await mint({ permissions: { metadata: 'write' } })
    expect(higher.status).toBe(422)
    const absent = await mint({ repositories: ['nope'] })
    expect(absent.status).toBe(422)
    expect((await absent.json()).message).toMatch(/does not exist or is not accessible/)
    // …beside a token the same App CAN mint, in the same test.
    expect((await mint({ permissions: { contents: 'read' } })).status).toBe(201)
  })

  it('refuses a token for another installation with 404', async () => {
    const res = await fetch(`${fake.apiUrl}/app/installations/9/access_tokens`, {
      method: 'POST',
      headers: { authorization: appJwt(), 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(404)
  })
})
