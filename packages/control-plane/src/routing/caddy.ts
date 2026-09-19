import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

export interface CaddyRoute {
  '@id': string
  match: { host: string[] }[]
  handle: unknown[]
  terminal: boolean
}

/**
 * The edge's answer to "which instance served this?".
 *
 * Set by the ROUTE, on every response, and by nothing else. A status cannot tell one
 * instance from another — or from the edge's own wildcard, which answers 200 for any
 * path on any hostname in the zone that holds no route (P4b finding 193, measured
 * again 2026-09-15). This header is what `waitForIdentity` reads to decide that a
 * move actually happened, and what the acceptance classifies every response by.
 */
export const INSTANCE_HEADER = 'X-Manifest-Instance'

/** One upstream as Caddy's reverse-proxy pool reports it. The drain's signal. */
export interface UpstreamStatus {
  /** The dial address, exactly as the route spells it: `mf-i-<instanceId>:<port>`. */
  address: string
  /** How many requests the edge is holding against this address right now. */
  num_requests: number
  fails: number
}

/**
 * §20: "Application code is untrusted, so baseline protections live where an app
 * cannot remove them. Caddy applies, ON EVERY ROUTE: security headers, per-app and
 * per-IP rate limits, request body size caps."
 *
 * A Caddyfile's site block does NOT apply to a route inserted through the admin
 * API, so a route whose handler chain is `reverse_proxy` alone gets none of them —
 * and every app this driver deploys arrives that way. The protections are part of
 * the chain, ahead of the proxy, for exactly that reason.
 */
export function buildRoute(input: {
  hostname: string
  upstream: string
  routeId: string
  /**
   * The instance this route reaches, served back on every response as
   * `X-Manifest-Instance`. REQUIRED: a route with no identity is a route a deploy
   * cannot confirm it moved, and an optional field would default to exactly that
   * for whichever caller forgot it.
   */
  instanceId: string
  /** Requests per minute, per client IP. §20's "per-app and per-IP rate limits". */
  rateLimit?: number
  /** §20's "request body size caps". */
  maxBodyBytes?: number
}): CaddyRoute {
  return {
    '@id': input.routeId,
    match: [{ host: [input.hostname] }],
    handle: [
      { handler: 'request_body', max_size: input.maxBodyBytes ?? 10_485_760 },
      {
        handler: 'rate_limit',
        rate_limits: {
          [input.routeId]: {
            match: [{ remote_ip: { ranges: ['0.0.0.0/0', '::/0'] } }],
            key: '{http.request.remote.host}',
            window: '1m',
            max_events: input.rateLimit ?? 600,
          },
        },
      },
      {
        handler: 'headers',
        response: {
          set: {
            'Strict-Transport-Security': ['max-age=31536000; includeSubDomains'],
            'X-Content-Type-Options': ['nosniff'],
            'Referrer-Policy': ['strict-origin-when-cross-origin'],
            'Content-Security-Policy': ["frame-ancestors 'self'"],
            [INSTANCE_HEADER]: [input.instanceId],
          },
          /**
           * DEFERRED, and that is what makes every header above a protection rather
           * than a suggestion.
           *
           * Caddy applies an undeferred `set` before the upstream is dialled, so an
           * app that writes the same header ADDS its value beside the edge's rather
           * than being overwritten. Measured 2026-09-15 (Task 1, M2): with
           * `deferred` absent, an app serving its own `X-Manifest-Instance: forged`
           * produced both values and a client's `headers.get()` returned
           * `"edge-value, forged"` — so a deploy could be told the instance it
           * started is serving when it is not, and §20's four headers could be
           * doubled by the app they exist to constrain. With it, the response
           * carries the edge's value alone.
           */
          deferred: true,
        },
      },
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: input.upstream }],
        /**
         * EVERY admin-API change reloads the edge's whole config, and a reload closes
         * every WebSocket the old config proxied with `1001 Going Away`. Without this,
         * ONE app's deploy — anywhere on the platform — disconnects every WebSocket
         * every OTHER app is holding, which sits badly beside P4c's "a redeploy
         * interrupts nobody".
         *
         * Measured 2026-09-18 (P5c Task 1, M8), in both directions, against a runtime
         * route shaped exactly as this function shapes one:
         *
         *   without this field: CLOSED code=1001, 2 ms after an unrelated route was
         *                       inserted
         *   with it:            SURVIVED 17971 ms after the same insert, still open
         *
         * The console's own site has carried `stream_close_delay 1h` since P5a for
         * this reason; this is the same value for the routes `routing/` writes, so
         * an app's stream and the console's stream outlive a reload by the same hour.
         * Caddy's JSON durations are NANOSECONDS — `"1h"` is a different type the
         * admin API refuses, so it is spelled out here.
         *
         * What the hour costs: a stream opened on an old config keeps the OLD handler,
         * and so the old upstream, alive for up to that long. That is bounded in
         * practice by the instance itself — §11's retire has a drain bound, and once
         * the old container is gone the held connection breaks anyway. It is recorded
         * as the trade rather than hidden: §8's question was about this value.
         */
        stream_close_delay: 3_600_000_000_000,
      },
    ],
    // terminal:true stops the wildcard behind this route from also matching.
    terminal: true,
  }
}

export interface CaddyClient {
  listServers(): Promise<Record<string, unknown>>
  getRoutes(server: string): Promise<CaddyRoute[]>
  /** One route by `@id`, or `undefined` when the edge holds none. */
  getRoute(routeId: string): Promise<CaddyRoute | undefined>
  putRoute(server: string, route: CaddyRoute): Promise<void>
  /** Replaces a route that EXISTS, in place — no window with no route (Decision 5). */
  patchRoute(routeId: string, route: CaddyRoute): Promise<void>
  deleteRoute(server: string, routeId: string): Promise<void>
  /** Caddy's own per-upstream in-flight counts. The drain reads this (Decision 9). */
  upstreams(): Promise<UpstreamStatus[]>
}

interface AdminResponse {
  status: number
  body: string
}

/**
 * `node:http`, NOT `fetch`, and this is not a style preference.
 *
 * Caddy's admin API runs a CSRF check on every non-GET request: a client that
 * sends an `Origin` header must send one the admin listener allows. `admin
 * 0.0.0.0:2019` binds a wildcard host, for which Caddy's allowed-origin list is
 * EMPTY — so a request with an Origin header of any value is refused, and only a
 * request with **no Origin header at all** is served.
 *
 * Node's `fetch` (undici) appends `Origin` to every non-GET request per the Fetch
 * spec, and outside a browser its value is the empty string. There is no supported
 * way to remove it. Measured 2026-09-06 against this platform's Caddy 2.11.4:
 *
 *   curl -X PUT (no Origin)            -> 200
 *   curl -X PUT -H 'Origin;'           -> 403 "not allowed to access from origin ''"
 *   node fetch PUT                     -> 403 "not allowed to access from origin ''"
 *   curl -X PUT -H 'Origin: http://127.0.0.1:7119' -> 403
 *
 * So this is not a test-only problem: with `fetch`, `applyRoute` 403s at runtime
 * and NO app this driver deploys is ever reachable. `node:http` sends exactly the
 * headers it is given, which is what curl and `scripts/verify.sh` already do.
 * Loosening Caddy's `origins` instead would weaken a CSRF control on the platform's
 * highest-leverage component to work around a client library.
 */
function adminRequest(
  adminUrl: string,
  method: string,
  path: string,
  body?: string,
): Promise<AdminResponse> {
  const target = new URL(path, adminUrl)
  const transport = target.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const req = transport(
      target,
      {
        method,
        // No `Origin`. See the note above — adding one makes every write 403.
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' } }),
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (text += chunk))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }))
      },
    )
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

export function createCaddyClient(adminUrl: string): CaddyClient {
  const call = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<AdminResponse> => {
    const response = await adminRequest(
      adminUrl,
      method,
      path,
      body === undefined ? undefined : JSON.stringify(body),
    )
    // 404 is not a failure here: Caddy answers it for `DELETE /id/<unknown>`
    // (measured: `{"error":"unknown object ID ..."}`), and removing a route that
    // is already gone is the desired end state, not an error.
    if ((response.status < 200 || response.status >= 300) && response.status !== 404) {
      throw new Error(
        `caddy admin ${method} ${path} failed (${response.status}): ${response.body}`,
      )
    }
    return response
  }

  return {
    async listServers() {
      const response = await call('GET', '/config/apps/http/servers')
      return JSON.parse(response.body) as Record<string, unknown>
    },
    async getRoutes(server) {
      const response = await call('GET', `/config/apps/http/servers/${server}/routes`)
      if (response.status === 404) return []
      return (JSON.parse(response.body) as CaddyRoute[] | null) ?? []
    },
    async getRoute(routeId) {
      const response = await call('GET', `/id/${routeId}`)
      // 404 is tolerated inside `call` because removing an absent route is the
      // desired end state; here it is the ANSWER, so it is read rather than parsed.
      if (response.status === 404) return undefined
      return JSON.parse(response.body) as CaddyRoute
    },
    async putRoute(server, route) {
      // PUT INSERTS at index 0. POST APPENDS, and an appended route lands behind
      // the wildcard whose terminal:true swallows it — success from the API, an
      // unreachable app in the browser. This is the single most expensive
      // one-character mistake available in this file.
      await call('PUT', `/config/apps/http/servers/${server}/routes/0`, route)
    },
    async patchRoute(routeId, route) {
      /**
       * A 404 here means the route went away between the read and the write. `call`
       * tolerates 404 for the delete's sake, so this is the one place that must not:
       * a swallowed one leaves the hostname pointing at the OLD instance while the
       * deploy reports success — a redeploy that silently did nothing.
       */
      const response = await call('PATCH', `/id/${routeId}`, route)
      if (response.status === 404) {
        throw new Error(
          `caddy admin PATCH /id/${routeId}: the route vanished between the read and the write`,
        )
      }
    },
    async deleteRoute(_server, routeId) {
      // By @id. Index-based removal is correct exactly once, and two concurrent
      // removals race on an array that shifted underneath them.
      await call('DELETE', `/id/${routeId}`)
    },
    async upstreams() {
      const response = await call('GET', '/reverse_proxy/upstreams')
      // `null`, not `[]`, is what Caddy answers when it holds no upstreams at all —
      // the same shape `getRoutes` guards against, and `null.find` inside a drain
      // would read as a crash rather than as "nothing is in flight".
      return (JSON.parse(response.body) as UpstreamStatus[] | null) ?? []
    },
  }
}
