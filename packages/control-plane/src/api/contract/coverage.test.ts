import { describe, expect, it } from 'vitest'
import { ROUTE_DEFINITIONS } from '../routes/index.js'
import { buildServer } from '../server.js'
import { testDeps } from '../testing.js'
import { fastifyPath } from './route.js'

/**
 * `/v1` routes still registered the old way (P5a Task 6). EACH TASK THAT CONVERTS ONE
 * REMOVES IT, and Task 14 deletes this list. The test is red for a route missing from
 * both, AND for a listed route that is already converted or gone — so the list cannot
 * quietly outlive what it describes.
 */
const UNCONVERTED = [
  'POST /v1/projects',
  'POST /v1/projects/:projectId/builds',
  'GET /v1/builds/:buildId',
  'GET /v1/builds/:buildId/logs',
  'POST /v1/projects/:projectId/releases',
  'POST /v1/environments/:environmentId/deploy',
  'GET /v1/environments/:environmentId/incidents',
]

/** Documented, never defined: the stream upgrades, and defineRoute answers JSON (Task 12). */
const DOCUMENTED_ONLY = ['GET /v1/projects/:projectId/events']

describe('every /v1 route is a definition (P5a Task 6)', () => {
  it('defines every /v1 route except the ones still listed — and lists nothing stale', async () => {
    const app = await buildServer(await testDeps())
    const defined = new Set(
      ROUTE_DEFINITIONS.map((r) => `${r.method} ${fastifyPath(r.path)}`),
    )
    const v1 = app.registeredRoutes
      .filter((r) => r.url.startsWith('/v1/'))
      .map((r) => `${r.method} ${r.url}`)
    expect(
      v1.filter(
        (r) =>
          !defined.has(r) && !UNCONVERTED.includes(r) && !DOCUMENTED_ONLY.includes(r),
      ),
    ).toEqual([])
    expect(UNCONVERTED.filter((r) => defined.has(r) || !v1.includes(r))).toEqual([])
    await app.close()
  })
})
