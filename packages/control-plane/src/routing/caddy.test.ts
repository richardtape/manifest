import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appHealthPolicy,
  buildRoute,
  createCaddyClient,
  INSTANCE_HEADER,
  type HealthPolicy,
} from './caddy.js'

let server: Server | undefined
afterEach(() => server?.close())

type Seen = {
  method: string
  path: string
  headers: Record<string, string | string[] | undefined>
  body: string
}

/**
 * The admin API, as much of it as a test needs to choose. `reply` exists because
 * P4c's client READS answers rather than only writing: a 404 from `GET /id/<x>` is
 * the answer "there is no such route", and a 404 from `PATCH /id/<x>` is a failure.
 * One fake that always answers 200 cannot tell those two apart.
 */
function fakeAdmin(
  reply: { status: number; body: string } = { status: 200, body: '[]' },
): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = []
  server = createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => (body += chunk))
    req.on('end', () => {
      seen.push({
        method: req.method ?? '',
        path: req.url ?? '',
        headers: req.headers,
        body,
      })
      res.writeHead(reply.status, { 'content-type': 'application/json' })
      res.end(reply.body)
    })
  })
  return new Promise((resolve) =>
    server!.listen(0, '127.0.0.1', () => {
      const address = server!.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ url: `http://127.0.0.1:${port}`, seen })
    }),
  )
}

describe('the Caddy route shape', () => {
  const route = buildRoute({
    hostname: 'chem-labs.staging.manifest.internal',
    upstreams: [
      {
        dial: 'mf-i-a1a1a1a1-0000-4000-8000-000000000001:3000',
        instanceId: 'a1a1a1a1-0000-4000-8000-000000000001',
      },
    ],
    routeId: 'mf-chem-labs-staging-manifest-internal',
    health: 'none',
  })

  it('matches on the host, proxies to the upstream, and terminates', () => {
    expect(route['@id']).toBe('mf-chem-labs-staging-manifest-internal')
    expect(route.match).toEqual([{ host: ['chem-labs.staging.manifest.internal'] }])
    expect(route.terminal).toBe(true)
    const proxy = route.handle.at(-1) as {
      handler: string
      upstreams: { dial: string }[]
    }
    expect(proxy.handler).toBe('reverse_proxy')
    expect(proxy.upstreams[0]!.dial).toBe(
      'mf-i-a1a1a1a1-0000-4000-8000-000000000001:3000',
    )
  })

  // §20: the edge protections apply ON EVERY ROUTE, and a Caddyfile site block does
  // NOT reach a route inserted through the admin API. Without this assertion every
  // app this driver deploys silently loses "the highest-leverage control in the
  // platform" while the route works perfectly.
  it("puts §20's edge protections AHEAD of the proxy on every route", () => {
    const handlers = route.handle.map((h) => (h as { handler: string }).handler)
    expect(handlers).toEqual(['request_body', 'rate_limit', 'headers', 'reverse_proxy'])
    const headers = route.handle[2] as { response: { set: Record<string, string[]> } }
    expect(Object.keys(headers.response.set).sort()).toEqual([
      'Content-Security-Policy',
      'Referrer-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Manifest-Instance',
    ])
  })

  it('sets X-Manifest-Instance on every response, DEFERRED so an app cannot serve its own', () => {
    const headers = route.handle[2] as {
      response: {
        set: Record<string, string[]>
        replace?: Record<string, { search_regexp: string; replace: string }[]>
        deferred?: boolean
      }
    }
    // FROM THE UPSTREAM THAT ANSWERED, its `mf-i-` alias taken off — exactly the bare
    // instance id (A1 Task 1, [M2] (b)) — never one static value for the route.
    expect(headers.response.set[INSTANCE_HEADER]).toEqual([
      '{http.reverse_proxy.upstream.host}',
    ])
    expect(headers.response.replace?.[INSTANCE_HEADER]).toEqual([
      { search_regexp: '^mf-i-', replace: '' },
    ])
    // Without this the upstream's own copy is ADDED beside the edge's, and a deploy
    // could be told the app it started is serving when it is not (Task 1, M2:
    // `headers.get()` on the client then returns `"edge-value, forged"`).
    expect(headers.response.deferred).toBe(true)
  })

  // §8's four-plan-old question, closed by measurement on 2026-09-18 (P5c Task 1,
  // M8): a runtime route WITHOUT this field had its WebSocket closed `1001` 2 ms
  // after an unrelated route was inserted anywhere on the platform; WITH it the
  // same socket survived the same reload. Every admin-API change reloads the whole
  // config, so without this one app's deploy disconnects every other app's streams.
  it("lets an app's stream outlive the config reload that another app's deploy causes", () => {
    const proxy = route.handle.at(-1) as {
      handler: string
      stream_close_delay?: unknown
    }
    expect(proxy.handler).toBe('reverse_proxy')
    // The VALUE, not merely the presence. Caddy's JSON durations are nanoseconds:
    // a string like "1h" is a different type and the admin API refuses the whole
    // route, so a test asserting only `toBeDefined()` would pass on a route the
    // edge will not accept.
    expect(proxy.stream_close_delay).toBe(3_600_000_000_000)
    expect(typeof proxy.stream_close_delay).toBe('number')
  })
})

/**
 * A1's route (Task 2, Decision 4): EVERY instance of a set behind one route, round robin,
 * health-checked, and each answer naming the instance that gave it. The JSON is the one
 * A1's Task 1 measured in a throwaway Caddy 2.11.4 from the edge's own image
 * (`docs/superpowers/spikes/instances-baseline/`, `[M2]`) — with the route's real rate
 * limit, 600, where the throwaway raised it for its loops.
 */
describe('the Caddy route across N instances (A1 Task 2)', () => {
  const A = 'a1a1a1a1-0000-4000-8000-000000000001'
  const B = 'b2b2b2b2-0000-4000-8000-000000000002'
  const set = [
    { dial: `mf-i-${A}:8080`, instanceId: A },
    { dial: `mf-i-${B}:8080`, instanceId: B },
  ]
  const ROUTE_ID = 'mf-chem-labs-manifest-internal'
  const PROTECTIONS = {
    'Strict-Transport-Security': ['max-age=31536000; includeSubDomains'],
    'X-Content-Type-Options': ['nosniff'],
    'Referrer-Policy': ['strict-origin-when-cross-origin'],
    'Content-Security-Policy': ["frame-ancestors 'self'"],
    'X-Manifest-Instance': ['{http.reverse_proxy.upstream.host}'],
  }
  /** Everything ahead of the proxy: §20's protections and the header, unchanged by the set. */
  const ahead = [
    { handler: 'request_body', max_size: 10_485_760 },
    {
      handler: 'rate_limit',
      rate_limits: {
        [ROUTE_ID]: {
          match: [{ remote_ip: { ranges: ['0.0.0.0/0', '::/0'] } }],
          key: '{http.request.remote.host}',
          window: '1m',
          max_events: 600,
        },
      },
    },
    {
      handler: 'headers',
      response: {
        set: PROTECTIONS,
        replace: { 'X-Manifest-Instance': [{ search_regexp: '^mf-i-', replace: '' }] },
        deferred: true,
      },
    },
  ]

  it('dials every instance, round robin, with an app’s health policy — [M2]’s JSON exactly', () => {
    const route = buildRoute({
      hostname: 'chem-labs.manifest.internal',
      routeId: ROUTE_ID,
      upstreams: set,
      health: appHealthPolicy('/healthz'),
    })
    expect(route).toEqual({
      '@id': ROUTE_ID,
      match: [{ host: ['chem-labs.manifest.internal'] }],
      handle: [
        ...ahead,
        {
          handler: 'reverse_proxy',
          upstreams: [{ dial: `mf-i-${A}:8080` }, { dial: `mf-i-${B}:8080` }],
          load_balancing: {
            selection_policy: { policy: 'round_robin' },
            try_duration: 3_000_000_000,
            try_interval: 250_000_000,
          },
          health_checks: {
            active: {
              uri: '/healthz',
              interval: 5_000_000_000,
              timeout: 2_000_000_000,
              expect_status: 200,
              headers: { 'X-Manifest-Probe': ['health'] },
            },
            passive: {
              fail_duration: 10_000_000_000,
              max_fails: 2,
              unhealthy_status: [502, 504],
            },
          },
          stream_close_delay: 3_600_000_000_000,
        },
      ],
      terminal: true,
    })
  })

  /**
   * NEVER `503` (Decision 4, the review's I4). An app answering `503` is shedding load, and
   * ejecting it moves that load onto its siblings — the cascade the passive policy must not
   * start. `[M2]` (c′): with `503` left out, a member answering `503` to everything stayed in
   * rotation (97 of 292 answers); with it in, the member was ejected after two. The TYPE holds
   * this too (`readonly (502 | 504)[]`); this is the pin on the value the edge receives.
   */
  it('counts dial failures, 502 and 504 against a member — and never 503', () => {
    expect(appHealthPolicy('/healthz').passive.unhealthyStatus).toEqual([502, 504])
    const route = buildRoute({
      hostname: 'chem-labs.manifest.internal',
      routeId: ROUTE_ID,
      upstreams: set,
      health: appHealthPolicy('/healthz'),
    })
    const proxy = route.handle.at(-1) as {
      health_checks: { passive: { unhealthy_status: number[] } }
    }
    expect(proxy.health_checks.passive.unhealthy_status).toEqual([502, 504])
  })

  /**
   * `'none'` IS NOT A WEAKER POLICY, IT IS NO POLICY: no `health_checks` key and no retry.
   * A2's waker is one address for many hostnames, and Caddy keeps health state per dial
   * address across routes — so one app's checks would eject the waker for every other.
   * `try_duration` without health is what `[M2]` (c)'s second run measured, and is left
   * out with it.
   */
  it('with no health policy, writes no health checks and no retry', () => {
    const route = buildRoute({
      hostname: 'chem-labs.manifest.internal',
      routeId: ROUTE_ID,
      upstreams: set,
      health: 'none',
    })
    const proxy = route.handle.at(-1) as Record<string, unknown>
    expect(proxy).not.toHaveProperty('health_checks')
    expect(proxy.load_balancing).toEqual({ selection_policy: { policy: 'round_robin' } })
  })

  /**
   * A SET OF ONE IS TODAY'S ROUTE, except what this task changes: the selection policy, and
   * the header read from the upstream rather than written as one value. A pin of everything
   * else — §20's protections, the rate limit, the body cap, `stream_close_delay` — so a set
   * cannot quietly cost a one-instance app (staging, sandbox, a `solo` production) one of them.
   */
  it('a set of one is today’s route but for the selection policy and the header', () => {
    const route = buildRoute({
      hostname: 'chem-labs.manifest.internal',
      routeId: ROUTE_ID,
      upstreams: [set[0]!],
      health: 'none',
    })
    expect(route).toEqual({
      '@id': ROUTE_ID,
      match: [{ host: ['chem-labs.manifest.internal'] }],
      handle: [
        ...ahead,
        {
          handler: 'reverse_proxy',
          upstreams: [{ dial: `mf-i-${A}:8080` }],
          load_balancing: { selection_policy: { policy: 'round_robin' } },
          stream_close_delay: 3_600_000_000_000,
        },
      ],
      terminal: true,
    })
  })

  /**
   * THE HEADER IS ONLY AS TRUE AS THE DIAL. It is read off the upstream's host, so an
   * upstream that does not dial its instance's own alias would answer with somebody else's
   * name — or a container's — and a deploy's identity check would believe it.
   */
  it('refuses an upstream that does not dial its own instance’s alias', () => {
    expect(() =>
      buildRoute({
        hostname: 'chem-labs.manifest.internal',
        routeId: ROUTE_ID,
        upstreams: [set[0]!, { dial: `mf-i-${A}:8080`, instanceId: B }],
        health: 'none',
      }),
    ).toThrow(new RegExp(`mf-i-${A}:8080.*${B}`))
    expect(() =>
      buildRoute({
        hostname: 'chem-labs.manifest.internal',
        routeId: ROUTE_ID,
        upstreams: [{ dial: 'mf-chem-labs-production-app:8080', instanceId: A }],
        health: 'none',
      }),
    ).toThrow(/mf-chem-labs-production-app:8080/)
  })

  it('refuses a route that dials nothing', () => {
    expect(() =>
      buildRoute({
        hostname: 'chem-labs.manifest.internal',
        routeId: ROUTE_ID,
        upstreams: [],
        health: 'none',
      }),
    ).toThrow(/no upstream/)
  })

  it('an app’s health policy probes its own health path, saying it is a probe', () => {
    const policy: HealthPolicy = appHealthPolicy('/up')
    expect(policy.active).toEqual({
      path: '/up',
      interval: 5_000_000_000,
      timeout: 2_000_000_000,
      probeHeader: 'health',
    })
  })
})

describe('the Caddy admin client', () => {
  // PUT INSERTS at index 0; POST APPENDS, which lands the route BEHIND the wildcard
  // whose terminal:true then swallows it — the admin API reports success and the
  // app is unreachable. S7 found it, S1 hit it again.
  it('uses PUT on routes/0, never POST', async () => {
    const { url, seen } = await fakeAdmin()
    await createCaddyClient(url).putRoute(
      'srv0',
      buildRoute({
        hostname: 'a.b',
        upstreams: [{ dial: 'mf-i-i1:1', instanceId: 'i1' }],
        routeId: 'r1',
        health: 'none',
      }),
    )
    expect(seen[0]!.method).toBe('PUT')
    expect(seen[0]!.path).toBe('/config/apps/http/servers/srv0/routes/0')
  })

  // Caddy's admin API refuses ANY request that carries an Origin header, because
  // `admin 0.0.0.0:2019` binds a wildcard host and its allowed-origin list is
  // consequently empty. Measured 2026-09-06 on Caddy 2.11.4: no header -> 200,
  // `Origin: ''` -> 403, `Origin: http://127.0.0.1:7119` -> 403.
  //
  // Node's `fetch` appends `Origin` to every non-GET request and gives no way to
  // remove it, so a `fetch`-based client 403s on every write — in production, not
  // just in tests, leaving every deployed app unreachable. This is the test that
  // fails if someone swaps `node:http` back for `fetch`.
  it('sends NO Origin header, because Caddy refuses every value of one', async () => {
    const { url, seen } = await fakeAdmin()
    await createCaddyClient(url).putRoute(
      'srv0',
      buildRoute({
        hostname: 'a.b',
        upstreams: [{ dial: 'mf-i-i1:1', instanceId: 'i1' }],
        routeId: 'r1',
        health: 'none',
      }),
    )
    expect(Object.keys(seen[0]!.headers)).not.toContain('origin')
  })

  // Removal by @id, not by index: index-based removal is correct exactly once and
  // races with any concurrent change.
  it('deletes by @id rather than by array index', async () => {
    const { url, seen } = await fakeAdmin()
    await createCaddyClient(url).deleteRoute('srv0', 'r1')
    expect(seen[0]!.method).toBe('DELETE')
    expect(seen[0]!.path).toBe('/id/r1')
  })

  it('reads one route by @id, and reports a missing one as undefined rather than throwing', async () => {
    const present = await fakeAdmin({
      status: 200,
      body: JSON.stringify(
        buildRoute({
          hostname: 'a.b',
          upstreams: [{ dial: 'mf-i-i1:1', instanceId: 'i1' }],
          routeId: 'r1',
          health: 'none',
        }),
      ),
    })
    const found = await createCaddyClient(present.url).getRoute('r1')
    expect(found?.['@id']).toBe('r1')
    expect(present.seen[0]!.method).toBe('GET')
    expect(present.seen[0]!.path).toBe('/id/r1')
    server?.close()

    // Caddy answers 404 `{"error":"unknown object ID ..."}` for an id it does not
    // hold, and `call` tolerates that for the delete's sake. Here it is the ANSWER.
    const absent = await fakeAdmin({ status: 404, body: '{"error":"unknown object ID"}' })
    expect(await createCaddyClient(absent.url).getRoute('r1')).toBeUndefined()
  })

  it('PATCHES a route by @id — and refuses to treat a 404 as success', async () => {
    const ok = await fakeAdmin({ status: 200, body: '' })
    const route = buildRoute({
      hostname: 'a.b',
      upstreams: [{ dial: 'mf-i-two:3000', instanceId: 'two' }],
      routeId: 'r1',
      health: 'none',
    })
    await createCaddyClient(ok.url).patchRoute('r1', route)
    expect(ok.seen[0]!.method).toBe('PATCH')
    expect(ok.seen[0]!.path).toBe('/id/r1')
    expect(JSON.parse(ok.seen[0]!.body)).toEqual(route)
    server?.close()

    // A 404 here means the route went away between the read and the write. A
    // swallowed one leaves the hostname pointing at the OLD instance while the
    // deploy reports success — which is the outage this whole plan removes.
    const { url } = await fakeAdmin({
      status: 404,
      body: '{"error":"unknown object ID"}',
    })
    await expect(createCaddyClient(url).patchRoute('r1', route)).rejects.toThrow(
      /vanished|404/,
    )
  })

  it('reads the edge’s in-flight count per upstream', async () => {
    const { url, seen } = await fakeAdmin({
      status: 200,
      body: '[{"address":"mf-i-x:3000","num_requests":2,"fails":0}]',
    })
    expect(await createCaddyClient(url).upstreams()).toEqual([
      { address: 'mf-i-x:3000', num_requests: 2, fails: 0 },
    ])
    expect(seen[0]!.path).toBe('/reverse_proxy/upstreams')
  })

  // Caddy answers `null` — not `[]` — when it holds no reverse_proxy upstreams at
  // all, and `null.map` is a TypeError inside the drain rather than "nothing is in
  // flight". `getRoutes` already carries the same guard for the same reason.
  it('reads an edge with no upstreams as an empty list, never null', async () => {
    const { url } = await fakeAdmin({ status: 200, body: 'null' })
    expect(await createCaddyClient(url).upstreams()).toEqual([])
  })
})
