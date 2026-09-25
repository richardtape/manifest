import { createSign } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { expectGitHubShape } from './schemas.js'
import { startFake, type StartedFake } from './testing.js'

// An organisation's repositories, as GitHub's REST API serves them to an App's installation
// token — every JSON answer held to GitHub's own `full-repository` schema.

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

describe('the fake serves an organisation’s repositories the way GitHub does', () => {
  let fake: StartedFake
  beforeEach(async () => {
    fake = await startFake()
  })
  afterEach(async () => {
    await fake.stop()
  })

  function appJwt(): string {
    const t = Math.floor(Date.now() / 1000)
    const u = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: fake.appId, iat: t - 60, exp: t + 540 })}`
    return `${u}.${createSign('RSA-SHA256').update(u).sign(fake.appKeyPem).toString('base64url')}`
  }
  async function token(body: Record<string, unknown>): Promise<string> {
    const res = await fetch(
      `${fake.apiUrl}/app/installations/${fake.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${appJwt()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
    expect(res.status).toBe(201)
    return (await res.json()).token
  }
  const admin = () => token({ permissions: { administration: 'write' } })
  const call = (method: string, path: string, auth: string, body?: unknown) =>
    fetch(`${fake.apiUrl}${path}`, {
      method,
      headers: {
        authorization: `token ${auth}`,
        accept: 'application/vnd.github+json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const create = async (
    name: string,
    extra: Record<string, unknown> = { private: true },
  ) => call('POST', `/orgs/${fake.org}/repos`, await admin(), { name, ...extra })

  it('creates { name, private: true } as a private repository, in GitHub’s shape', async () => {
    const res = await create('app-one')
    expect(res.status).toBe(201)
    const body = await res.json()
    expectGitHubShape('POST /orgs/{org}/repos 201', body)
    expect({
      private: body.private,
      visibility: body.visibility,
      full_name: body.full_name,
      default_branch: body.default_branch,
      clone_url: body.clone_url,
    }).toEqual({
      private: true,
      visibility: 'private',
      full_name: `${fake.org}/app-one`,
      default_branch: 'main',
      clone_url: `${fake.gitUrl}/${fake.org}/app-one.git`,
    })
  })

  it('creates a PUBLIC repository when `private` is not sent — GitHub’s own default', async () => {
    const res = await create('app-default', {})
    expect(res.status).toBe(201)
    expect((await res.json()).visibility).toBe('public')
  })

  it('refuses the same name again with 422, naming the field and why', async () => {
    expect((await create('app-one')).status).toBe(201)
    const again = await create('APP-ONE') // GitHub compares names case-insensitively
    expect(again.status).toBe(422)
    const body = await again.json()
    expect(body.message).toBe('Repository creation failed.')
    expect(body.errors).toEqual([
      expect.objectContaining({
        field: 'name',
        message: 'name already exists on this account',
      }),
    ])
  })

  it('creates with ANY token holding administration — even one scoped to another repository — and refuses one without', async () => {
    // GitHub does not confine creation to a token's repositories: a token SCOPED to one
    // existing repository created another (measured 2026-09-24, conformance C7s).
    expect((await create('seed')).status).toBe(201)
    const scoped = await token({
      repositories: ['seed'],
      permissions: { administration: 'write' },
    })
    const byScoped = await call('POST', `/orgs/${fake.org}/repos`, scoped, {
      name: 'other',
      private: true,
    })
    expect(byScoped.status).toBe(201)
    const contents = await token({ permissions: { contents: 'write' } })
    const res = await call('POST', `/orgs/${fake.org}/repos`, contents, {
      name: 'third',
      private: true,
    })
    expect(res.status).toBe(403)
    expect((await res.json()).message).toBe('Resource not accessible by integration')
  })

  it('answers 404 Not Found — never 403 — to a token scoped to A reading B', async () => {
    expect((await create('repo-a')).status).toBe(201)
    expect((await create('repo-b')).status).toBe(201)
    const scopedToA = await token({
      repositories: ['repo-a'],
      permissions: { contents: 'read' },
    })
    const a = await call('GET', `/repos/${fake.org}/repo-a`, scopedToA)
    expect(a.status).toBe(200) // the positive control, with the same token
    expectGitHubShape('GET /repos/{owner}/{repo} 200', await a.json())
    const b = await call('GET', `/repos/${fake.org}/repo-b`, scopedToA)
    expect(b.status).toBe(404)
    expect((await b.json()).message).toBe('Not Found')
  })

  it('PATCHes { private: true } with administration, and refuses it without', async () => {
    expect((await create('pub', { private: false })).status).toBe(201)
    const readOnly = await token({ permissions: { contents: 'read' } })
    const refused = await call('PATCH', `/repos/${fake.org}/pub`, readOnly, {
      private: true,
    })
    expect(refused.status).toBe(403)
    const res = await call('PATCH', `/repos/${fake.org}/pub`, await admin(), {
      private: true,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expectGitHubShape('PATCH /repos/{owner}/{repo} 200', body)
    expect({ private: body.private, visibility: body.visibility }).toEqual({
      private: true,
      visibility: 'private',
    })
  })

  it('DELETEs with 204, after which GET is 404', async () => {
    expect((await create('doomed')).status).toBe(201)
    const auth = await admin()
    expect((await call('GET', `/repos/${fake.org}/doomed`, auth)).status).toBe(200)
    expect((await call('DELETE', `/repos/${fake.org}/doomed`, auth)).status).toBe(204)
    expect((await call('GET', `/repos/${fake.org}/doomed`, auth)).status).toBe(404)
  })

  it('answers a request with no credential 401, and a bad one 401 Bad credentials', async () => {
    expect((await create('app-one')).status).toBe(201)
    const none = await fetch(`${fake.apiUrl}/repos/${fake.org}/app-one`)
    expect(none.status).toBe(401)
    const bad = await call('GET', `/repos/${fake.org}/app-one`, 'ghs_1000001_x.y.z')
    expect(bad.status).toBe(401)
    expect((await bad.json()).message).toBe('Bad credentials')
  })

  it('nests GitHub’s `repository` objects in a token scoped to named repositories', async () => {
    expect((await create('named')).status).toBe(201)
    const res = await fetch(
      `${fake.apiUrl}/app/installations/${fake.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${appJwt()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          repositories: ['named'],
          permissions: { contents: 'write' },
        }),
      },
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expectGitHubShape('POST /app/installations/{installation_id}/access_tokens 201', body)
    expect(body.repository_selection).toBe('selected')
    expect(body.repositories.map((r: { full_name: string }) => r.full_name)).toEqual([
      `${fake.org}/named`,
    ])
  })
})
