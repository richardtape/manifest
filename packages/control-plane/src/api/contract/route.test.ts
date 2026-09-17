import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import { randomUUID } from 'node:crypto'
import { resetDatabase } from '../../db/testing.js'
import { buildServer } from '../server.js'
import { loginAs, mutationHeaders, testDeps } from '../testing.js'
import { defineRoute, NO_BODY, NO_QUERY, registerRoutes } from './route.js'
import { representation, request } from './schemas.js'

afterEach(resetDatabase)

// Synthetic routes, registered only in this file's servers — they prove the helper, not a
// resource. Ids are prefixed so they can never collide with a real component.
const Probe = representation(
  'ZzRouteTestProbe',
  z.object({ id: z.uuid(), name: z.string() }),
)
const ProbeBody = request(
  'ZzRouteTestProbeBody',
  z.strictObject({ name: z.string().min(1) }),
)

let answer: unknown = undefined
const probeGet = defineRoute({
  operationId: 'zzProbeGet',
  method: 'GET',
  path: '/v1/zz-probe/{probeId}',
  tag: 'zz',
  summary: 'probe',
  description: 'probe',
  params: z.strictObject({ probeId: z.uuid() }),
  query: NO_QUERY,
  body: NO_BODY,
  success: { status: 200, description: 'probe', schema: Probe },
  errors: [],
  handler: async ({ params }) => {
    // A TYPE-LEVEL CONTROL, checked by `tsc` rather than Vitest (which strips types). Were
    // `params` to widen to `any`, this read would stop being an error, and an unused
    // `@ts-expect-error` IS one — so typecheck goes red by itself (P5a Task 1, [M1g]).
    // @ts-expect-error — params are typed from the schema
    const _undeclared = params.probeID
    return (answer ?? { id: params.probeId, name: 'probe', handle: 'mf-leak' }) as never
  },
})
const probePost = defineRoute({
  operationId: 'zzProbePost',
  method: 'POST',
  path: '/v1/zz-probe',
  tag: 'zz',
  summary: 'probe',
  description: 'probe',
  params: z.strictObject({}),
  query: NO_QUERY,
  body: ProbeBody,
  success: { status: 201, description: 'probe', schema: Probe },
  errors: [],
  handler: async ({ body }) => ({ id: randomUUID(), name: body.name }),
})

async function server() {
  const deps = await testDeps()
  const app = await buildServer(deps)
  registerRoutes(app, deps, [probeGet, probePost])
  const cookies = await loginAs(deps, 'bio_prof')
  return { deps, app, cookies }
}

describe('defineRoute (P5a Task 6)', () => {
  it('strips every field the representation does not name', async () => {
    answer = undefined
    const { app, cookies } = await server()
    const res = await app.inject({
      method: 'GET',
      url: `/v1/zz-probe/${randomUUID()}`,
      cookies,
    })
    expect(res.statusCode).toBe(200)
    expect(Object.keys(res.json()).sort()).toEqual(['id', 'name'])
    await app.close()
  })

  it('refuses a malformed path parameter as REQUEST_INVALID, naming it', async () => {
    const { app, cookies } = await server()
    const res = await app.inject({
      method: 'GET',
      url: '/v1/zz-probe/not-a-uuid',
      cookies,
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('REQUEST_INVALID')
    expect(res.json().error.message).toContain('params.probeId')
    await app.close()
  })

  it('refuses a body field the request does not name', async () => {
    const { deps, app, cookies } = await server()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/zz-probe',
      cookies,
      headers: mutationHeaders(deps),
      payload: { name: 'x', nmae: 'typo' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain('nmae')
    await app.close()
  })

  it('answers 401 before it looks at a malformed request from nobody', async () => {
    const { app } = await server()
    const res = await app.inject({ method: 'GET', url: '/v1/zz-probe/not-a-uuid' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('turns a handler that answers the wrong shape into a 500, and tells the operator which operation and field — never the value', async () => {
    // A value that cannot appear in the log BY CHANCE. The plan's `name: 42` and
    // `not.toContain('42')` failed 15% of runs on the logged URL's random UUID alone
    // (measured over 100,000), and every run once the throw's stack position contains 42.
    answer = { id: randomUUID(), name: { leaked: 'hunter2-probe-value' } }
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { app, cookies } = await server()
    const res = await app.inject({
      method: 'GET',
      url: `/v1/zz-probe/${randomUUID()}`,
      cookies,
    })
    expect(res.statusCode).toBe(500)
    expect(res.json().error.code).toBe('INTERNAL')
    const logged = errors.mock.calls.flat().join('\n')
    expect(logged).toContain('zzProbeGet')
    expect(logged).toContain('name')
    expect(logged).not.toContain('hunter2')
    errors.mockRestore()
    answer = undefined
    await app.close()
  })

  it('replays a mutation’s SHAPED body for the same Idempotency-Key', async () => {
    const { deps, app, cookies } = await server()
    const headers = mutationHeaders(deps)
    const first = await app.inject({
      method: 'POST',
      url: '/v1/zz-probe',
      cookies,
      headers,
      payload: { name: 'x' },
    })
    const again = await app.inject({
      method: 'POST',
      url: '/v1/zz-probe',
      cookies,
      headers,
      payload: { name: 'x' },
    })
    expect(first.statusCode).toBe(201)
    expect(again.json()).toEqual(first.json())
    await app.close()
  })
})
