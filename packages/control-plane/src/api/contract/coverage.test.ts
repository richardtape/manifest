import { describe, expect, it } from 'vitest'
import { ROUTE_DEFINITIONS } from '../routes/index.js'
import { buildServer } from '../server.js'
import { testDeps } from '../testing.js'
import { fastifyPath } from './route.js'

/** Documented, never defined: the stream upgrades, and defineRoute answers JSON (Task 12). */
const DOCUMENTED_ONLY = ['GET /v1/projects/:projectId/events']

describe('every /v1 route is a definition (P5a Task 6)', () => {
  it('defines every /v1 route but the stream, which is documented and never defined', async () => {
    const app = await buildServer(await testDeps())
    const defined = new Set(
      ROUTE_DEFINITIONS.map((r) => `${r.method} ${fastifyPath(r.path)}`),
    )
    const v1 = app.registeredRoutes
      .filter((r) => r.url.startsWith('/v1/'))
      .map((r) => `${r.method} ${r.url}`)
    expect(v1.filter((r) => !defined.has(r) && !DOCUMENTED_ONLY.includes(r))).toEqual([])
    await app.close()
  })
})
