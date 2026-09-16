import { describe, expect, it } from 'vitest'
import { buildRoute, type CaddyClient, type CaddyRoute } from './caddy.js'
import {
  applyRoute,
  inFlightTo,
  restoreRouteTo,
  servingRoute,
  upstreamsInUse,
} from './routes.js'

const SERVERS = { internal: 'srv0', public: 'srv0' } as const
const HOST = 'app.staging.manifest.internal'
const ROUTE_ID = 'mf-app-staging-manifest-internal'

const spec = {
  hostname: HOST,
  upstream: 'mf-i-00000000-0000-4000-8000-000000000002:8080',
  kind: 'staging' as const,
  instanceId: '00000000-0000-4000-8000-000000000002',
}

/** What the edge already holds for the hostname: the FIRST instance. */
const existingRoute = buildRoute({
  hostname: HOST,
  upstream: 'mf-i-00000000-0000-4000-8000-000000000001:8080',
  routeId: ROUTE_ID,
  instanceId: '00000000-0000-4000-8000-000000000001',
})

function fakeCaddy(overrides: Partial<CaddyClient> = {}): {
  client: CaddyClient
  calls: string[]
  puts: CaddyRoute[]
  patches: CaddyRoute[]
} {
  const calls: string[] = []
  const puts: CaddyRoute[] = []
  const patches: CaddyRoute[] = []
  const client: CaddyClient = {
    listServers: async () => ({}),
    getRoutes: async () => [],
    getRoute: async () => undefined,
    putRoute: async (_server, route) => {
      calls.push('put')
      puts.push(route)
    },
    patchRoute: async (routeId, route) => {
      calls.push(`patch ${routeId}`)
      patches.push(route)
    },
    deleteRoute: async (_server, routeId) => {
      calls.push(`delete ${routeId}`)
    },
    upstreams: async () => [],
    ...overrides,
  }
  return { client, calls, puts, patches }
}

describe('applyRoute (§12, S1, P4c)', () => {
  it('moves an existing route IN PLACE — one PATCH, and never a delete', async () => {
    const { client, calls, patches } = fakeCaddy({ getRoute: async () => existingRoute })
    await applyRoute({ caddy: client, servers: SERVERS }, spec)
    // Delete-then-insert leaves a gap the edge's wildcard answers with a 200 —
    // measured 2026-09-15: 4 of 320 requests across 20 moves, and 0 of 330 across
    // 20 in-place PATCHes. A status-only check cannot see the difference.
    expect(calls).toEqual([`patch ${ROUTE_ID}`])
    const proxy = patches[0]!.handle.at(-1) as { upstreams: { dial: string }[] }
    expect(proxy.upstreams[0]!.dial).toBe(spec.upstream)
  })

  it('creates a route that does not exist yet with PUT at index 0', async () => {
    const { client, calls, puts } = fakeCaddy({ getRoute: async () => undefined })
    await applyRoute({ caddy: client, servers: SERVERS }, spec)
    expect(calls).toEqual(['put'])
    expect(puts[0]!['@id']).toBe(ROUTE_ID)
  })

  /**
   * The read is not advisory. `putRoute` inserts at index 0 unconditionally, so a
   * swallowed failure on the read leaves TWO routes matching one host, the older one
   * shadowed — which is the defect the delete-then-put version used to carry, moved
   * one call earlier. Measured 2026-09-08 on the delete: "applying twice leaves ONE
   * route" failed once in five Docker-tier runs and passed on the retry.
   */
  it('refuses to write anything when the edge cannot be read', async () => {
    const { client, calls } = fakeCaddy({
      getRoute: async () => {
        throw new Error('caddy admin GET /id/x failed (502): upstream gone')
      },
    })
    await expect(applyRoute({ caddy: client, servers: SERVERS }, spec)).rejects.toThrow(
      /502/,
    )
    expect(calls).toEqual([])
  })
})

describe('what the edge is doing now (P4c)', () => {
  it('reports what a hostname reaches: the upstream and the instance', async () => {
    const { client } = fakeCaddy({ getRoute: async () => existingRoute })
    const serving = await servingRoute({ caddy: client, servers: SERVERS }, HOST)
    expect(serving?.upstream).toBe('mf-i-00000000-0000-4000-8000-000000000001:8080')
    expect(serving?.instanceId).toBe('00000000-0000-4000-8000-000000000001')
    expect(serving?.route['@id']).toBe(ROUTE_ID)
  })

  it('reports a hostname with no route as undefined — nothing this platform named serves it', async () => {
    const { client } = fakeCaddy({ getRoute: async () => undefined })
    expect(await servingRoute({ caddy: client, servers: SERVERS }, HOST)).toBeUndefined()
  })

  it('counts what is in flight to one upstream', async () => {
    const { client } = fakeCaddy({
      upstreams: async () => [
        { address: 'mf-i-one:8080', num_requests: 3, fails: 0 },
        { address: 'mf-i-two:8080', num_requests: 0, fails: 0 },
      ],
    })
    const deps = { caddy: client, servers: SERVERS }
    expect(await inFlightTo(deps, 'mf-i-one:8080')).toBe(3)
    expect(await inFlightTo(deps, 'mf-i-two:8080')).toBe(0)
  })

  it('says so when the edge no longer lists an upstream at all', async () => {
    // `undefined`, never 0: "the edge is not counting this address" and "nothing is
    // in flight" are different facts. Task 1's M1 measured which one a moved route
    // produces — Caddy keeps counting until the held request ends and only then
    // unlists the address — and `UNLISTED_UPSTREAM_IS_IDLE` is the driver's reading
    // of it. Collapsing the two here would take that decision away from the driver.
    const { client } = fakeCaddy({ upstreams: async () => [] })
    expect(
      await inFlightTo({ caddy: client, servers: SERVERS }, 'mf-i-gone:3000'),
    ).toBeUndefined()
  })

  // Task 5's `retireInstance` refuses anything in this set — the second guard behind
  // the control plane's own selection (Decision 11). It reads EVERY route, so a
  // container from before P4c, which carries no hostname label, is covered by the
  // same line.
  it('lists every upstream any route dials, across both listeners, once each', async () => {
    const other = buildRoute({
      hostname: 'other.staging.manifest.internal',
      upstream: 'mf-i-other:3000',
      routeId: 'mf-other-staging-manifest-internal',
      instanceId: 'other',
    })
    const { client } = fakeCaddy({ getRoutes: async () => [existingRoute, other] })
    expect(await upstreamsInUse({ caddy: client, servers: SERVERS })).toEqual(
      new Set(['mf-i-00000000-0000-4000-8000-000000000001:8080', 'mf-i-other:3000']),
    )
  })
})

describe('restoreRouteTo (P4c) — a move that could not be confirmed', () => {
  it('puts the previous route back, exactly as the edge had it', async () => {
    const { client, calls, patches } = fakeCaddy({ getRoute: async () => existingRoute })
    await restoreRouteTo(
      { caddy: client, servers: SERVERS },
      {
        route: existingRoute,
        upstream: 'mf-i-00000000-0000-4000-8000-000000000001:8080',
        instanceId: '00000000-0000-4000-8000-000000000001',
      },
      HOST,
      'staging',
    )
    expect(calls).toEqual([`patch ${ROUTE_ID}`])
    expect(patches[0]).toEqual(existingRoute)
  })

  // Nothing served this hostname before the move, so putting back "what served" means
  // removing the route. Leaving the new one in place would hand the hostname to an
  // instance the edge could not be shown to reach.
  it('removes the route when nothing served the hostname before', async () => {
    const { client, calls } = fakeCaddy()
    await restoreRouteTo({ caddy: client, servers: SERVERS }, undefined, HOST, 'staging')
    expect(calls).toEqual([`delete ${ROUTE_ID}`])
  })

  // The route may have been removed under us between the failed move and the
  // rollback — by `pnpm test:docker` restarting the edge, or by a concurrent
  // destroy. Putting it back is then a PUT, not a PATCH that would 404.
  it('PUTS the previous route back when the edge no longer holds one', async () => {
    const { client, calls, puts } = fakeCaddy({ getRoute: async () => undefined })
    await restoreRouteTo(
      { caddy: client, servers: SERVERS },
      {
        route: existingRoute,
        upstream: 'mf-i-00000000-0000-4000-8000-000000000001:8080',
        instanceId: '00000000-0000-4000-8000-000000000001',
      },
      HOST,
      'staging',
    )
    expect(calls).toEqual(['put'])
    expect(puts[0]).toEqual(existingRoute)
  })
})
