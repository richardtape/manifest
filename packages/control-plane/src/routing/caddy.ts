import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { INSTANCE_ALIAS_PREFIX, instanceAlias } from '../runtime/index.js'

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
 * again 2026-09-15). This header is what `waitForIdentities` reads to decide that a
 * move actually happened, and what the acceptance classifies every response by.
 *
 * Since A1 (Task 2) it names the instance THAT ANSWERED — one member of the set a route
 * dials — read off the upstream the edge chose, never one value written into the route.
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
 * Caddy's JSON durations are NANOSECONDS (see `stream_close_delay` below). One second.
 */
const SECOND_NS = 1_000_000_000

/**
 * The request header every active health check carries, so anything behind a route can tell
 * the edge's probe from a person (A1 Decision 4). Its value is the policy's `probeHeader`.
 */
export const PROBE_HEADER = 'X-Manifest-Probe'

/**
 * How the edge decides that a member of an app's set is unhealthy, and what it does then
 * (A1 Decision 4, the review's I4). A PARAMETER of the route, never a constant inside it: an
 * app's route takes `appHealthPolicy`; A2's waker route — one address for many hostnames,
 * where Caddy's per-address health state would be shared across them all — takes `'none'`.
 *
 * Durations are Caddy's own unit, NANOSECONDS, because the edge receives them as they are
 * here; `[M2]` measured this JSON, not a translation of it.
 */
export interface HealthPolicy {
  /** Caddy's ACTIVE checks: a GET of the app's health path, `200` expected. */
  active: { path: string; interval: number; timeout: number; probeHeader: string }
  /**
   * Caddy's PASSIVE checks, counted off real traffic — the failures the EDGE meets reaching a
   * member (a dial or transport failure; Caddy counts those with no status list, and its own
   * `502` and `504` are exactly those). It has NO status field, and that is the point: a status
   * is what the APP answered — `503` shedding load, `502` or `504` because its own dependency
   * failed — and ejecting a member for it moves its load onto its siblings, or, when the
   * dependency is shared, takes every member out of the edge at once (`[M2]` (c′); A1 sitting 8,
   * the whole-branch review's I1).
   */
  passive: {
    failDuration: number
    maxFails: number
  }
  /**
   * How long a request may be retried on another member after a DIAL failure — Caddy retries
   * nothing else by default, which is the point: a request an app has begun is never sent
   * twice. `[M2]` (c): one member `docker kill`ed mid-loop failed 0 of 391 requests with 3 s,
   * and 3 of 391 without (one after hanging 3,004 ms).
   */
  tryDuration: number
  tryInterval: number
}

/**
 * Decision 4's numbers for an app's route: probe `healthPath` every 5 s (2 s timeout); eject
 * a member after 2 failures the edge meets reaching it within 10 s — never for a status the
 * app answered; retry a dial failure on another member for up to 3 s, every 250 ms.
 *
 * Its caller is the Docker driver (A1 Task 4, which builds every route it applies with it).
 */
export function appHealthPolicy(healthPath: string): HealthPolicy {
  return {
    active: {
      path: healthPath,
      interval: 5 * SECOND_NS,
      timeout: 2 * SECOND_NS,
      probeHeader: 'health',
    },
    passive: { failDuration: 10 * SECOND_NS, maxFails: 2 },
    tryDuration: 3 * SECOND_NS,
    tryInterval: SECOND_NS / 4,
  }
}

/**
 * WHO A ROUTE'S PER-IP RATE LIMIT COUNTS: every address — or, for the length of one load rehearsal, every address
 * but the generator's own (§20; the load rehearsal plan's Decision 5). `[M4]` measured this shape in a throwaway Caddy
 * from the edge's own image (B sitting 1): the zone's OWN `match` given a `not`, no new handler and no subroute — the
 * exempt client sent 1,300 in a minute with no `429`, another was cut at 600. Caddy reads it back `not` first, so
 * compare it parsed. Nobody can widen it with a header: the key is the connection's own address.
 */
function rateLimitMatch(exemptRange: string | null): unknown[] {
  const everyone = { remote_ip: { ranges: ['0.0.0.0/0', '::/0'] } }
  return exemptRange === null
    ? [everyone]
    : [{ ...everyone, not: [{ remote_ip: { ranges: [exemptRange] } }] }]
}

/**
 * ONE ADDRESS AS ITS OWN RANGE — `/32` or `/128` — or `undefined` for anything that is not exactly one address: a
 * range, a name, an empty string. Checked BEFORE anything is written, because Caddy answers a malformed one with its
 * admin API's `500` and keeps the config it had (`[M4]` T7, B sitting 1's F6), which a caller would read as the edge
 * failing rather than as its own mistake.
 */
export function rateLimitExemptRange(address: string): string | undefined {
  const family = isIP(address)
  if (family === 4) return `${address}/32`
  if (family === 6) return `${address}/128`
  return undefined
}

/**
 * `route` with its rate limit skipping `address` — or, given `null`, skipping nobody — and NOTHING ELSE CHANGED: its set,
 * its health policy, its headers, its limit and window are the route's own, as the edge holds it. A route with no
 * `rate_limit` handler (the switched-off page) comes back exactly as it was. Cleared, it is byte for byte the route
 * `buildRoute` writes.
 *
 * Its caller is `setRouteRateLimitExemption` (`routes.ts`), which the Docker driver's `setRateLimitExemption` calls.
 */
export function withRateLimitExemption(
  route: CaddyRoute,
  address: string | null,
): CaddyRoute {
  const range = address === null ? null : rateLimitExemptRange(address)
  if (range === undefined) throw new Error(`'${address}' is not one IP address`)
  return {
    ...route,
    handle: route.handle.map((handler) => {
      const limiter = handler as {
        handler?: string
        rate_limits?: Record<string, Record<string, unknown>>
      }
      if (limiter.handler !== 'rate_limit' || limiter.rate_limits === undefined)
        return handler
      const zones: Record<string, Record<string, unknown>> = {}
      for (const [name, zone] of Object.entries(limiter.rate_limits)) {
        // `match` rewritten in its own place, so a cleared zone's keys are in buildRoute's order.
        const { match: _was, ...rest } = zone
        zones[name] = { match: rateLimitMatch(range), ...rest }
      }
      return { ...limiter, rate_limits: zones }
    }),
  }
}

/** One member of the set a route dials: the address, and the instance that address IS. */
export interface RouteUpstream {
  /** `mf-i-<instanceId>:<port>` — the instance's own network alias (`instanceAlias`). */
  dial: string
  instanceId: string
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
 *
 * **EVERY INSTANCE OF A SET, ONE ROUTE** (A1 Task 2, Decision 4): the route dials each
 * upstream, round robin, so a deploy's identity check sees each new instance within N
 * requests and the load spreads evenly; the health policy is the caller's.
 */
export function buildRoute(input: {
  hostname: string
  routeId: string
  /**
   * The set this route reaches. Each answer is stamped with the instance of the upstream
   * that gave it — read off the dial's alias — so each dial MUST be its instance's own
   * alias, and one that is not is refused here rather than served under the wrong name.
   */
  upstreams: readonly RouteUpstream[]
  /** An app's route: `appHealthPolicy(healthPath)`. `'none'`: no checks and no retry. */
  health: HealthPolicy | 'none'
  /** Requests per minute, per client IP. §20's "per-app and per-IP rate limits". */
  rateLimit?: number
  /** §20's "request body size caps". */
  maxBodyBytes?: number
}): CaddyRoute {
  if (input.upstreams.length === 0)
    throw new Error(
      `a route for ${input.hostname} with no upstream dials nothing — an app's route reaches at least one instance`,
    )
  for (const upstream of input.upstreams) {
    if (!upstream.dial.startsWith(`${instanceAlias(upstream.instanceId)}:`))
      throw new Error(
        `the upstream ${upstream.dial} is not instance ${upstream.instanceId}'s own alias (${instanceAlias(upstream.instanceId)}:<port>): ` +
          `the edge names each answer by the alias it dialled, so this route would answer as somebody else`,
      )
  }
  const health = input.health
  return {
    '@id': input.routeId,
    match: [{ host: [input.hostname] }],
    handle: [
      { handler: 'request_body', max_size: input.maxBodyBytes ?? 10_485_760 },
      {
        handler: 'rate_limit',
        rate_limits: {
          [input.routeId]: {
            match: rateLimitMatch(null),
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
            /**
             * WHICH INSTANCE ANSWERED, NOT WHICH INSTANCE THE ROUTE WAS WRITTEN FOR (A1
             * Decision 4). With a set behind one route, one static value would name one
             * member on every member's answers. Caddy's placeholder is the host of the
             * upstream it chose — `mf-i-<instanceId>` — and the `replace` below takes the
             * alias's prefix off, so the header is EXACTLY the bare instance id. Measured
             * (A1 Task 1, `[M2]` (b), Caddy 2.11.4): one value, the app's own gone; and a
             * response the EDGE makes (every member down: `503` with checks on, `502`
             * without) carries no header at all — the placeholder is empty and Caddy
             * omits it — so "no header" still means "no app answered".
             */
            [INSTANCE_HEADER]: ['{http.reverse_proxy.upstream.host}'],
          },
          replace: {
            [INSTANCE_HEADER]: [
              { search_regexp: `^${INSTANCE_ALIAS_PREFIX}`, replace: '' },
            ],
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
           * carries the edge's value alone. (And it is what lets the placeholder
           * above be read at all: it is filled only once the proxy has chosen.)
           */
          deferred: true,
        },
      },
      {
        handler: 'reverse_proxy',
        upstreams: input.upstreams.map((u) => ({ dial: u.dial })),
        load_balancing: {
          selection_policy: { policy: 'round_robin' },
          ...(health === 'none'
            ? {}
            : { try_duration: health.tryDuration, try_interval: health.tryInterval }),
        },
        ...(health === 'none'
          ? {}
          : {
              health_checks: {
                active: {
                  uri: health.active.path,
                  interval: health.active.interval,
                  timeout: health.active.timeout,
                  expect_status: 200,
                  headers: { [PROBE_HEADER]: [health.active.probeHeader] },
                },
                passive: {
                  fail_duration: health.passive.failDuration,
                  max_fails: health.passive.maxFails,
                },
              },
            }),
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
