import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRoute, createCaddyClient } from './caddy.js'

let server: Server | undefined
afterEach(() => server?.close())

type Seen = {
  method: string
  path: string
  headers: Record<string, string | string[] | undefined>
}

function fakeAdmin(): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = []
  server = createServer((req, res) => {
    seen.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('[]')
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
    upstream: 'mf-chem-labs-staging-abcdef12-app:3000',
    routeId: 'mf-chem-labs-staging-manifest-internal',
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
    expect(proxy.upstreams[0]!.dial).toBe('mf-chem-labs-staging-abcdef12-app:3000')
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
    ])
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
      buildRoute({ hostname: 'a.b', upstream: 'c:1', routeId: 'r1' }),
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
      buildRoute({ hostname: 'a.b', upstream: 'c:1', routeId: 'r1' }),
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
})
