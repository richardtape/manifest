import { createSign } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { expectGitHubShape } from './schemas.js'
import { startFake, type StartedFake } from './testing.js'

// BRANCH PROTECTION, BY PLAN (the D5 plan's Task 12, Decision 13) — GitHub's `403` for a free
// organisation's private repository is MEASURED (conformance C13, 2026-09-24); its words are
// golden's. What the protection then refuses — a force-push and a deletion, in GitHub's GH006
// words — is held by the control plane's contract suite, which pushes to it for real.

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
const PROTECT = {
  required_status_checks: null,
  enforce_admins: false,
  required_pull_request_reviews: null,
  restrictions: null,
  allow_force_pushes: false,
  allow_deletions: false,
}
const UPGRADE =
  'Upgrade to GitHub Pro or make this repository public to enable this feature.'

describe('the fake protects main the way GitHub does — by plan (Task 12)', () => {
  let fake: StartedFake | undefined
  afterEach(async () => {
    await fake?.stop()
    fake = undefined
  })

  async function on(plan: 'free' | 'team') {
    const f = await startFake({ plan })
    fake = f
    const jwt = () => {
      const t = Math.floor(Date.now() / 1000)
      const u = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: f.appId, iat: t - 60, exp: t + 540 })}`
      return `${u}.${createSign('RSA-SHA256').update(u).sign(f.appKeyPem).toString('base64url')}`
    }
    const token = async (permissions: Record<string, string>) => {
      const res = await fetch(
        `${f.apiUrl}/app/installations/${f.installationId}/access_tokens`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${jwt()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ permissions }),
        },
      )
      expect(res.status).toBe(201)
      return ((await res.json()) as { token: string }).token
    }
    const call = (method: string, path: string, auth: string, body?: unknown) =>
      fetch(`${f.apiUrl}${path}`, {
        method,
        headers: {
          authorization: `token ${auth}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    const admin = await token({ administration: 'write' })
    const create = async (name: string, isPrivate: boolean) =>
      expect(
        (await call('POST', `/orgs/${f.org}/repos`, admin, { name, private: isPrivate }))
          .status,
      ).toBe(201)
    const protection = (name: string) =>
      `/repos/${f.org}/${name}/branches/main/protection`
    return { f, token, call, admin, create, protection }
  }

  it('team: PUT answers 200 in GitHub’s protected-branch shape and GET reads it back — before it, GET is 404', async () => {
    const { call, admin, create, protection } = await on('team')
    await create('app-one', true)
    const before = await call('GET', protection('app-one'), admin)
    expect(before.status).toBe(404)
    expect(((await before.json()) as { message: string }).message).toBe(
      'Branch not protected',
    )
    const put = await call('PUT', protection('app-one'), admin, PROTECT)
    expect(put.status).toBe(200)
    const body = await put.json()
    expectGitHubShape('PUT /repos/{owner}/{repo}/branches/{branch}/protection 200', body)
    expect(body).toMatchObject({
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
    })
    expect((await call('GET', protection('app-one'), admin)).status).toBe(200)
  })

  it('free: a PRIVATE repository cannot be protected — 403 in GitHub’s measured words — and a PUBLIC one can', async () => {
    const { call, admin, create, protection } = await on('free')
    await create('app-one', true)
    const refused = await call('PUT', protection('app-one'), admin, PROTECT)
    expect(refused.status).toBe(403)
    expect(((await refused.json()) as { message: string }).message).toBe(UPGRADE)
    await create('app-two', false)
    expect((await call('PUT', protection('app-two'), admin, PROTECT)).status).toBe(200)
  })

  it('refuses a token without administration — permission before plan, as everywhere', async () => {
    const { call, token, create, protection } = await on('team')
    await create('app-one', true)
    const contents = await token({ contents: 'write' })
    const res = await call('PUT', protection('app-one'), contents, PROTECT)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { message: string }).message).toBe(
      'Resource not accessible by integration',
    )
  })
})
