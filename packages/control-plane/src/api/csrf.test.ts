import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { resetDatabase } from '../db/testing.js'
import { buildServer } from './server.js'
import { loginAs, projectBody, testDeps } from './testing.js'

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
      payload: projectBody(`csrf-${randomUUID().slice(0, 6)}`),
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
      payload: projectBody('csrf-nokey'),
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
      payload: projectBody('csrf-anon'),
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
    // 200 and where to go next since P6b's F10 was fixed (2026-09-24): this session was
    // signed in-process with no IdP handle, so next is the console's home.
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ redirectTo: '/' })
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

  /**
   * TWO ORIGINS, EACH AS SAME-ORIGIN AS THE CONSOLE ALONE WAS (the front-end enablement plan's
   * Task 8, Decision 16; Review Focus 3). A request is judged against the origin it ARRIVED on —
   * its `Host`, which the edge preserves — never against "one of the list": a page on one of
   * Manifest's origins cannot post to the other's API with the other's cookie.
   */
  describe('on the faculty front-end’s origin (Task 8)', () => {
    const CONSOLE = 'https://console.manifest.internal'
    const FRONTEND = 'https://app.manifest.internal'

    it('serves two origins by default, the console’s first', async () => {
      const { deps, app } = await server()
      expect(deps.config.origins).toEqual([CONSOLE, FRONTEND])
      await app.close()
    })

    it('accepts a mutation on app whose Origin is app', async () => {
      const { app, create } = await server()
      const res = await create({ host: 'app.manifest.internal', origin: FRONTEND })
      expect(res.statusCode).toBe(201)
      await app.close()
    })

    it('refuses a mutation on app whose Origin is the console — and one on the console whose Origin is app', async () => {
      const { app, cookies, create } = await server()
      const onApp = await create({ host: 'app.manifest.internal', origin: CONSOLE })
      expect(onApp.statusCode).toBe(403)
      expect(onApp.json()).toMatchObject({ error: { code: 'CSRF_ORIGIN_REFUSED' } })
      const onConsole = await create({
        host: 'console.manifest.internal',
        origin: FRONTEND,
      })
      expect(onConsole.statusCode).toBe(403)
      expect(onConsole.json()).toMatchObject({ error: { code: 'CSRF_ORIGIN_REFUSED' } })
      // Nothing was created by either — and the positive control on each origin is beside
      // this test, so the refusals are the origin's and not the route's.
      const list = await app.inject({ method: 'GET', url: '/v1/projects', cookies })
      expect(list.json()).toEqual([])
      const own = await create({ host: 'console.manifest.internal', origin: CONSOLE })
      expect(own.statusCode).toBe(201)
      await app.close()
    })

    it('judges a request on a host it does not know against the console’s origin — never the request’s own', async () => {
      const { app, create } = await server()
      const res = await create({ host: 'evil.example', origin: 'https://evil.example' })
      expect(res.statusCode).toBe(403)
      expect(res.json()).toMatchObject({ error: { code: 'CSRF_ORIGIN_REFUSED' } })
      await app.close()
    })
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
