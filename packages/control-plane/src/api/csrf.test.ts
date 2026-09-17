import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { resetDatabase } from '../db/testing.js'
import { buildServer } from './server.js'
import { loginAs, testDeps } from './testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

/**
 * §20's "CSRF protection on every state-changing route", as an Origin check (P5a
 * Decision 15). The sibling origin is not hypothetical: a deployed app at
 * `<slug>.staging.manifest.internal` is SAME-SITE with the console, so a SameSite=Lax
 * session cookie rides along on a form it submits.
 */
const APP_ORIGIN = 'https://proof-app.staging.manifest.internal'

async function server() {
  const deps = await testDeps()
  const app = await buildServer(deps)
  const cookies = await loginAs(deps, 'bio_prof')
  const create = (headers: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: { slug: `csrf-${randomUUID().slice(0, 6)}`, blueprint: 'fixture-node@1' },
      cookies,
      headers: { 'idempotency-key': randomUUID(), ...headers },
    })
  return { deps, app, cookies, create }
}

describe('CSRF by Origin (§20, P5a Task 4)', () => {
  it('accepts a mutation carrying a session from the console’s own origin', async () => {
    const { deps, app, create } = await server()
    expect((await create({ origin: deps.config.sp.origin })).statusCode).toBe(201)
    await app.close()
  })

  it('refuses the same mutation from a sibling app’s origin, and changes nothing', async () => {
    const { app, cookies, create } = await server()
    const res = await create({ origin: APP_ORIGIN })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: { code: 'CSRF_ORIGIN_REFUSED' } })
    const list = await app.inject({ method: 'GET', url: '/v1/projects', cookies })
    expect(list.json()).toEqual([])
    await app.close()
  })

  it('refuses a mutation carrying a session and NO Origin at all', async () => {
    const { app, create } = await server()
    const res = await create({})
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('CSRF_ORIGIN_REFUSED')
    await app.close()
  })

  it('refuses before it asks for an Idempotency-Key, so a form learns nothing about headers', async () => {
    const { app, cookies } = await server()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: { slug: 'csrf-nokey', blueprint: 'fixture-node@1' },
      cookies,
      headers: { origin: APP_ORIGIN },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('CSRF_ORIGIN_REFUSED')
    await app.close()
  })

  it('answers a mutation with no session 401, not 403 — there is no cookie to forge with', async () => {
    const { app } = await server()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: { slug: 'csrf-anon', blueprint: 'fixture-node@1' },
      headers: { 'idempotency-key': randomUUID(), origin: APP_ORIGIN },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('signs out from the console’s origin, clearing the session cookie', async () => {
    // The positive control for the refusal below: without it, a sign-out that never
    // cleared anything would make "leaves the session cookie alone" pass by itself.
    const { deps, app, cookies } = await server()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies,
      headers: { origin: deps.config.sp.origin },
    })
    expect(res.statusCode).toBe(204)
    expect(res.cookies.find((c) => c.name === 'manifest_session')?.value).toBe('')
    await app.close()
  })

  it('refuses a sign-out from a sibling origin, and leaves the session cookie alone', async () => {
    const { app, cookies } = await server()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies,
      headers: { origin: APP_ORIGIN },
    })
    expect(res.statusCode).toBe(403)
    expect(res.cookies.find((c) => c.name === 'manifest_session')).toBeUndefined()
    await app.close()
  })

  it('does not ask the SAML callback for an origin — its credential is the assertion', async () => {
    const { app, cookies } = await server()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/saml/callback',
      cookies,
      payload: {},
      headers: { origin: 'https://idp.manifest.internal' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('REQUEST_INVALID')
    await app.close()
  })
})
