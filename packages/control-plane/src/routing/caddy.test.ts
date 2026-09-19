import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRoute, createCaddyClient, INSTANCE_HEADER } from './caddy.js'

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
    upstream: 'mf-i-a1a1a1a1-0000-4000-8000-000000000001:3000',
    routeId: 'mf-chem-labs-staging-manifest-internal',
    instanceId: 'a1a1a1a1-0000-4000-8000-000000000001',
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
      response: { set: Record<string, string[]>; deferred?: boolean }
    }
    expect(headers.response.set[INSTANCE_HEADER]).toEqual([
      'a1a1a1a1-0000-4000-8000-000000000001',
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

describe('the Caddy admin client', () => {
  // PUT INSERTS at index 0; POST APPENDS, which lands the route BEHIND the wildcard
  // whose terminal:true then swallows it — the admin API reports success and the
  // app is unreachable. S7 found it, S1 hit it again.
  it('uses PUT on routes/0, never POST', async () => {
    const { url, seen } = await fakeAdmin()
    await createCaddyClient(url).putRoute(
      'srv0',
      buildRoute({ hostname: 'a.b', upstream: 'c:1', routeId: 'r1', instanceId: 'i1' }),
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
      buildRoute({ hostname: 'a.b', upstream: 'c:1', routeId: 'r1', instanceId: 'i1' }),
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
        buildRoute({ hostname: 'a.b', upstream: 'c:1', routeId: 'r1', instanceId: 'i1' }),
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
      upstream: 'mf-i-two:3000',
      routeId: 'r1',
      instanceId: 'two',
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
