import { describe, expect, it } from 'vitest'
import { buildRoute, type CaddyClient, type CaddyRoute } from './caddy.js'
import {
  applyRoute,
  inFlightTo,
  restoreRouteTo,
  servingRoute,
  upstreamsInUse,
} from './routes.js'

/**
 * The laptop's own listener names since P6a (R3): `srv0` on :443 internal, `srv1` on
 * :8443 public. They were BOTH `srv0` until then — §21's honest divergence 2 — so the
 * two-server path through `applyRoute`, `removeRoute` and `upstreamsInUse` had no unit
 * coverage at all, and "a production route goes to the public server" was a claim no
 * test in this repository could have falsified.
 *
 * Every case below about staging is unchanged by that: `listenerFor('staging')` is
 * `internal` whatever `public` says. The cases that MOVED are the ones naming
 * `production`, which is the point.
 */
const SERVERS = { internal: 'srv0', public: 'srv1' } as const
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
  /** Which SERVER each write named, in order. `applyRoute`'s listener choice. */
  servers: string[]
} {
  const calls: string[] = []
  const puts: CaddyRoute[] = []
  const patches: CaddyRoute[] = []
  const servers: string[] = []
  const client: CaddyClient = {
    listServers: async () => ({}),
    getRoutes: async () => [],
    getRoute: async () => undefined,
    // The server name is recorded SEPARATELY from `calls` rather than folded into
    // it: `calls` is what the existing cases assert sequences against, and putting
    // a second fact in the same string would have made every one of them assert two
    // things while claiming to assert one.
    putRoute: async (server, route) => {
      calls.push('put')
      servers.push(server)
      puts.push(route)
    },
    patchRoute: async (routeId, route) => {
      calls.push(`patch ${routeId}`)
      patches.push(route)
    },
    deleteRoute: async (server, routeId) => {
      calls.push(`delete ${routeId}`)
      servers.push(server)
    },
    upstreams: async () => [],
    ...overrides,
  }
  return { client, calls, puts, patches, servers }
}

/** A PRODUCTION hostname — the BARE zone, one label deep (§23, `hostnameFor`). */
const PROD_HOST = 'app.manifest.internal'
const PROD_ROUTE_ID = 'mf-app-manifest-internal'

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

  /**
   * §12'S CLAIM, AS THE ONE PIECE OF PURE LOGIC BEHIND IT: which SERVER a route is
   * written to. `applyRoute` resolves `deps.servers[listenerFor(spec.kind)]`, and
   * until P6a both entries of that map were `srv0` on every machine and in every
   * test — so this assertion was unmakeable and the selection had no unit coverage
   * at all (P6a Task 1, `[M5](c)`).
   *
   * BOTH DIRECTIONS IN ONE TEST, deliberately. A production-only assertion passes
   * on a platform where EVERY route goes to `srv1`, which is the mirror-image
   * misconfiguration and just as broken; the staging line is what refuses it.
   */
  it('writes a production route to the PUBLIC server and a staging route to the internal one', async () => {
    const { client, servers } = fakeCaddy({ getRoute: async () => undefined })
    const deps = { caddy: client, servers: SERVERS }
    await applyRoute(deps, { ...spec, hostname: PROD_HOST, kind: 'production' })
    await applyRoute(deps, spec)
    expect(servers).toEqual(['srv1', 'srv0'])
  })

  /**
   * `restoreRouteTo` resolves the SAME map, and it is the path a failed deploy
   * takes: the route could not be confirmed, so what served before goes back. For a
   * production hostname that PUT must name the public server, or the rollback writes
   * the previous instance's route to a listener nobody reaches — an app that was
   * serving a moment ago, left unreachable by the very thing meant to protect it.
   *
   * The PUT branch, not the PATCH one: `patchRoute` addresses the route by `@id` and
   * names no server at all, so it is only the create-and-restore paths where the
   * listener can be got wrong.
   */
  it('restores a production route to the PUBLIC server when the edge holds none', async () => {
    const previous = buildRoute({
      hostname: PROD_HOST,
      upstream: 'mf-i-prod:8080',
      routeId: PROD_ROUTE_ID,
      instanceId: 'prod',
    })
    const { client, calls, servers } = fakeCaddy({ getRoute: async () => undefined })
    await restoreRouteTo(
      { caddy: client, servers: SERVERS },
      { route: previous, upstream: 'mf-i-prod:8080', instanceId: 'prod' },
      PROD_HOST,
      'production',
    )
    expect(calls).toEqual(['put'])
    expect(servers).toEqual(['srv1'])
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

  /**
   * AND IT MUST READ BOTH SERVERS, WHICH NOTHING HAS EVER EXERCISED. `upstreamsInUse`
   * iterates `new Set(Object.values(deps.servers))`; that Set was written when both
   * names were `srv0`, to stop the SAME server being read twice, so every test of it
   * until now did exactly one read and the two-server branch never ran (P6a Task 1,
   * `[M5](c)`). `retireInstance` refuses an instance whose address is in this set —
   * so a version that read only the internal listener would let a running PRODUCTION
   * app be retired out from under the route serving it.
   *
   * The two servers return DIFFERENT routes, so a result holding both upstreams is
   * the only way both reads can have happened; `read` says so a second way, and in
   * order, because a single Set could also be explained by one read of a fake that
   * ignores its argument.
   */
  it('reads BOTH listeners — a production upstream and a staging one, in one set', async () => {
    const production = buildRoute({
      hostname: PROD_HOST,
      upstream: 'mf-i-prod:8080',
      routeId: PROD_ROUTE_ID,
      instanceId: 'prod',
    })
    const read: string[] = []
    const { client } = fakeCaddy({
      getRoutes: async (server) => {
        read.push(server)
        return server === 'srv1' ? [production] : [existingRoute]
      },
    })
    const found = await upstreamsInUse({ caddy: client, servers: SERVERS })
    expect(read).toEqual(['srv0', 'srv1'])
    expect(found).toEqual(
      new Set(['mf-i-00000000-0000-4000-8000-000000000001:8080', 'mf-i-prod:8080']),
    )
  })

  // And the dedupe is still load-bearing in the OTHER configuration — a deployment
  // that collapses the two names back to one (UBC may; §21's divergence 2 was this
  // machine's shape until P6a) must read that server once, not twice.
  it('still reads a collapsed pair of listeners exactly once', async () => {
    const read: string[] = []
    const { client } = fakeCaddy({
      getRoutes: async (server) => {
        read.push(server)
        return [existingRoute]
      },
    })
    await upstreamsInUse({
      caddy: client,
      servers: { internal: 'only', public: 'only' },
    })
    expect(read).toEqual(['only'])
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
