import { describe, expect, it } from 'vitest'
import { buildServer } from './server.js'
import { testDeps } from './testing.js'
import { UNVERSIONED } from './unversioned.js'

describe('the /v1 prefix (D23.8)', () => {
  it('serves every route under /v1/ except the five it names, and those five exactly', async () => {
    const app = await buildServer(await testDeps())
    const outside = app.registeredRoutes
      .filter((route) => !route.url.startsWith('/v1/'))
      .map((route) => `${route.method} ${route.url}`)
      .sort()
    expect(outside).toEqual(UNVERSIONED.map((u) => `${u.method} ${u.path}`).sort())
    await app.close()
  })

  it('answers an old, unversioned path with the envelope, and the hint names /v1', async () => {
    const app = await buildServer(await testDeps())
    const res = await app.inject({ method: 'GET', url: '/projects' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } })
    expect(res.json().error.hint).toContain('/v1/')
    await app.close()
  })
})
