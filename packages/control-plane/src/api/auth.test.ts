import { describe, expect, it } from 'vitest'
import { buildServer } from './server.js'
import { testDeps } from './testing.js'

describe('auth routes', () => {
  it('logs in a seeded test user and returns them from /auth/me', async () => {
    const app = await buildServer(await testDeps({ devAuth: true }))
    const login = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { puid: 'bio_prof' },
    })
    expect(login.statusCode).toBe(200)
    const cookie = login.cookies.find((c) => c.name === 'manifest_session')
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax')

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { manifest_session: cookie!.value },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ puid: 'bio_prof', role: 'member' })
    await app.close()
  })

  it('refuses /auth/me without a session', async () => {
    const app = await buildServer(await testDeps({ devAuth: true }))
    const me = await app.inject({ method: 'GET', url: '/auth/me' })
    expect(me.statusCode).toBe(401)
    expect(me.json().error.code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('refuses a tampered session cookie', async () => {
    const app = await buildServer(await testDeps({ devAuth: true }))
    const login = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { puid: 'bio_prof' },
    })
    const value = login.cookies.find((c) => c.name === 'manifest_session')!.value
    const tampered = `${value.slice(0, -4)}AAAA`
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { manifest_session: tampered },
    })
    expect(me.statusCode).toBe(401)
    await app.close()
  })

  // The route is absent, not forbidden. A 403 would confirm the shim is compiled in.
  it('does not register the dev-login route when dev auth is off', async () => {
    const app = await buildServer(await testDeps({ devAuth: false }))
    const login = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { puid: 'bio_prof' },
    })
    expect(login.statusCode).toBe(404)
    await app.close()
  })

  // Same hole, different door: a malformed body reached the client as 500
  // INTERNAL, which tells a program nothing it can act on (D23.7).
  it('answers 400, not 500, for a body that is the wrong shape', async () => {
    const app = await buildServer(await testDeps({ devAuth: true }))
    const login = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { puid: 42 },
    })
    expect(login.statusCode).toBe(400)
    expect(login.json().error.code).toBe('REQUEST_INVALID')
    await app.close()
  })

  it('refuses a PUID that is not a seeded test user', async () => {
    const app = await buildServer(await testDeps({ devAuth: true }))
    const login = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { puid: 'someone-i-invented' },
    })
    expect(login.statusCode).toBe(409)
    expect(login.json().error.code).toBe('DEV_AUTH_UNKNOWN_USER')
    await app.close()
  })
})
