import { INSTANCE_ALIAS_PREFIX } from '../runtime/index.js'
import {
  buildRoute,
  withRateLimitExemption,
  type CaddyClient,
  type CaddyRoute,
  type HealthPolicy,
  type RouteUpstream,
} from './caddy.js'
import {
  type EnvironmentKind,
  listenerFor,
  type Listener,
  routeIdFor,
} from './hostnames.js'

export interface RoutingDeps {
  caddy: CaddyClient
  /**
   * Listener -> Caddy server name. `srv0` internal and `srv1` public on this laptop
   * since P6a (R3); both were `srv0` until then, and this comment said so.
   */
  servers: Record<Listener, string>
}

export interface RouteSpec {
  hostname: string
  kind: EnvironmentKind
  /**
   * The set the hostname reaches — every instance, each by its own alias (A1 Task 2). Each
   * answer is served back naming the one that gave it; see `INSTANCE_HEADER`.
   */
  upstreams: readonly RouteUpstream[]
  /** `appHealthPolicy(healthPath)` for an app; `'none'` for no checks (`buildRoute`). */
  health: HealthPolicy | 'none'
}

/**
 * Applies a route, IN PLACE where one exists.
 *
 * P4c. This used to delete by `@id` and then PUT at index 0, which leaves a window
 * with no route for the hostname — and the edge's wildcard answers `200` in that
 * window, so the gap is invisible to any check that reads a status (P4b finding
 * 193). Measured 2026-09-15: 4 wildcard answers in 320 requests across 20
 * delete-then-insert moves, and 0 in 330 across 20 in-place PATCHes.
 *
 * THE READ IS NOT ADVISORY. `putRoute` inserts at index 0 unconditionally, so a
 * swallowed failure here leaves TWO routes matching one host with the older one
 * shadowed — the same defect the delete used to carry, one call earlier.
 */
export async function applyRoute(deps: RoutingDeps, spec: RouteSpec): Promise<void> {
  const routeId = routeIdFor(spec.hostname)
  await placeRoute(deps, spec.kind, buildRoute({ ...spec, routeId }))
}

/**
 * Puts `route` on the listener `kind` belongs to, IN PLACE where the edge already holds one by its
 * `@id` — `applyRoute`'s placement, shared with the switched-off page below (Task 11), so a
 * switched-off name is on the right listener and never passes through the wildcard on its way.
 */
async function placeRoute(
  deps: RoutingDeps,
  kind: EnvironmentKind,
  route: CaddyRoute,
): Promise<void> {
  const server = deps.servers[listenerFor(kind)]
  const routeId = route['@id']
  const existing = await deps.caddy.getRoute(routeId)
  if (existing === undefined) {
    await deps.caddy.putRoute(server, route)
    return
  }
  /**
   * **AN IN-PLACE MOVE KEEPS THE LISTENER THE ROUTE ALREADY HAS** — `patchRoute` addresses
   * it by `@id` and names no server. So a route on the wrong listener (the listener names
   * changed in configuration, or an older platform put it there) would stay there on every
   * redeploy, and for a production route that is §12's split failing OPEN, silently (P6a
   * Task 19, control (e)). The wildcard window of delete-then-put is the price of the
   * correction, and a correction is not a routine move.
   */
  const onServer = (await deps.caddy.getRoutes(server)).some((r) => r['@id'] === routeId)
  if (onServer) {
    await deps.caddy.patchRoute(routeId, route)
    return
  }
  console.error(
    `[routing] ${routeId} was not on ${server}, where a ${kind} route belongs — moving it there`,
  )
  await deps.caddy.deleteRoute(server, routeId)
  await deps.caddy.putRoute(server, route)
}

/**
 * §11's switched-off page (the front-end enablement plan's Task 11, Decision 29), as the edge
 * answers it for a name whose app its owner switched off. No script, no style and no link — a
 * sentence — and `no-store`, because a `410` is heuristically cacheable and a restored app must
 * not stay hidden behind a browser's copy of this.
 */
export const SWITCHED_OFF_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Switched off</title></head>' +
  '<body><h1>Switched off</h1><p>This app has been switched off by its owner.</p></body></html>\n'

/**
 * Points `hostname` at the switched-off page: `410 Gone`, under the hostname's OWN route `@id`, so
 * the next deploy after a restore replaces it in place (`applyRoute`) and the name never falls
 * through to the wildcard's `manifest OK` or to another app. It dials NO upstream, so
 * `servingRoute` answers `undefined` for it and a retire's `INSTANCE_SERVING` guard no longer
 * holds the instance that served — which is the order an archive relies on.
 *
 * Its caller is the Docker driver's `switchOff`.
 */
export async function applySwitchedOffRoute(
  deps: RoutingDeps,
  hostname: string,
  kind: EnvironmentKind,
): Promise<void> {
  await placeRoute(deps, kind, {
    '@id': routeIdFor(hostname),
    match: [{ host: [hostname] }],
    handle: [
      {
        handler: 'static_response',
        status_code: 410,
        headers: {
          'Content-Type': ['text/html; charset=utf-8'],
          'Cache-Control': ['no-store'],
          'Strict-Transport-Security': ['max-age=31536000; includeSubDomains'],
          'X-Content-Type-Options': ['nosniff'],
          'Referrer-Policy': ['strict-origin-when-cross-origin'],
          'Content-Security-Policy': ["default-src 'none'; frame-ancestors 'self'"],
        },
        body: SWITCHED_OFF_PAGE,
      },
    ],
    terminal: true,
  })
}

export async function removeRoute(
  deps: RoutingDeps,
  hostname: string,
  kind: EnvironmentKind,
): Promise<void> {
  await deps.caddy.deleteRoute(deps.servers[listenerFor(kind)], routeIdFor(hostname))
}

/**
 * ONE ADDRESS PAST `hostname`'s PER-IP RATE LIMIT, or nobody (`null`) — the load rehearsal plan's Task 3, Decision 5. The
 * route is read AS THE EDGE HOLDS IT and PATCHed in place by its `@id` with only the rate limit's `match` changed
 * (`withRateLimitExemption`), so the set it dials, its health policy and its headers are exactly what serves now — never
 * the Route records' idea of them, and never a member dropped because its container was not found. The switched-off page
 * has no rate limit and is left exactly as it is. Answers what it found; nothing is swallowed — a PATCH the edge refuses
 * is thrown.
 *
 * Caddy's rate-limit counters SURVIVE the PATCH (`[M4]` T3/T4): a client already limited stays limited, and the exempt
 * address — never counted while exempt — starts at zero once cleared.
 *
 * Its caller is the Docker driver's `setRateLimitExemption`, which validates the address first.
 */
export async function setRouteRateLimitExemption(
  deps: RoutingDeps,
  hostname: string,
  address: string | null,
): Promise<'set' | 'switched-off' | 'absent'> {
  const routeId = routeIdFor(hostname)
  const route = await deps.caddy.getRoute(routeId)
  if (route === undefined) return 'absent'
  const next = withRateLimitExemption(route, address)
  if (JSON.stringify(next) === JSON.stringify(route)) {
    // Nothing to skip (the switched-off page), or nothing to change (asked twice): no PATCH, no reload of the edge.
    return route.handle.some((h) => (h as { handler?: string }).handler === 'rate_limit')
      ? 'set'
      : 'switched-off'
  }
  await deps.caddy.patchRoute(routeId, next)
  return 'set'
}

/**
 * Takes ONE member out of `hostname`'s route (A1 Task 4): the route PATCHed in place with
 * every other member — and everything else about it — exactly as the edge held it, or
 * REMOVED when the member was its last. A route that does not dial it (never routed, routed
 * away, the switched-off page, no route at all) is left EXACTLY as it is.
 *
 * `isMember` decides by DIAL ADDRESS, so the caller can match a container's alias or, before
 * P4c, its name. Nothing is swallowed: a change the edge refuses is thrown to the caller,
 * which has not yet removed the container. Answers what it did.
 *
 * Its caller is the Docker driver's `destroyInstance`.
 */
export async function withdrawUpstream(
  deps: RoutingDeps,
  hostname: string,
  kind: EnvironmentKind,
  isMember: (dial: string) => boolean,
): Promise<'withdrawn' | 'removed' | 'absent'> {
  const routeId = routeIdFor(hostname)
  const route = await deps.caddy.getRoute(routeId)
  if (route === undefined) return 'absent'
  const dials = upstreamsOf(route)
  if (!dials.some(isMember)) return 'absent'
  const remaining = dials.filter((dial) => !isMember(dial))
  if (remaining.length === 0) {
    await removeRoute(deps, hostname, kind)
    return 'removed'
  }
  const narrowed: CaddyRoute = {
    ...route,
    handle: route.handle.map((handler) => {
      const proxy = handler as { handler?: string; upstreams?: { dial?: string }[] }
      return proxy.handler === 'reverse_proxy'
        ? {
            ...proxy,
            upstreams: (proxy.upstreams ?? []).filter(
              (u) => u.dial === undefined || !isMember(u.dial),
            ),
          }
        : handler
    }),
  }
  await deps.caddy.patchRoute(routeId, narrowed)
  return 'withdrawn'
}

/**
 * EVERY address a route dials, in the route's order — empty for a route that proxies nowhere
 * (the switched-off page).
 *
 * Every one, never the first (A1 Task 2): this was `upstreamOf`, which read `upstreams[0]`, so
 * `upstreamsInUse` — the retire guard's input — could not see a set's second member.
 */
export function upstreamsOf(route: CaddyRoute): string[] {
  for (const handler of route.handle) {
    const proxy = handler as { handler?: string; upstreams?: { dial?: string }[] }
    if (proxy.handler === 'reverse_proxy')
      return (proxy.upstreams ?? []).flatMap((u) =>
        u.dial === undefined ? [] : [u.dial],
      )
  }
  return []
}

/**
 * The instances a route dials, read off each dial's own alias — `mf-i-<instanceId>:<port>` —
 * which is where the edge reads the `X-Manifest-Instance` it serves (A1 Task 2), so the two
 * cannot disagree. It reads a P4c route (the id written into the header, the dial its alias)
 * the same way.
 *
 * A dial that is not an alias names no instance and is left out: a route written before P4c
 * dials a CONTAINER NAME, a real state on a running machine until that app's next deploy —
 * not an error, and never a container name passed off as an instance id.
 */
export function instanceIdsOf(route: CaddyRoute): string[] {
  return upstreamsOf(route).flatMap((dial) => {
    const colon = dial.lastIndexOf(':')
    const host = colon === -1 ? dial : dial.slice(0, colon)
    return host.startsWith(INSTANCE_ALIAS_PREFIX)
      ? [host.slice(INSTANCE_ALIAS_PREFIX.length)]
      : []
  })
}

export interface ServingRoute {
  route: CaddyRoute
  /** Every address the route dials, in its order. Never empty. */
  upstreams: string[]
  /** The instances those dials name (`instanceIdsOf`) — empty for a route from before P4c. */
  instanceIds: string[]
}

/**
 * What this hostname reaches, as the edge's OWN CONFIGURATION has it.
 *
 * Not from the wire, deliberately (Decision 8): a wire check cannot tell "nothing is
 * routed" from "the app is slow to answer", and Decision 12 turns that difference
 * into retiring nothing versus retiring the live app.
 *
 * `undefined` means nothing this platform can name serves the hostname — either no
 * route by that `@id`, or a route that proxies nowhere (the switched-off page). A route
 * this platform wrote dials at least one upstream — the set's every member since A1 —
 * so treating one that dials none as "nothing served" is what a rollback wants.
 */
export async function servingRoute(
  deps: RoutingDeps,
  hostname: string,
): Promise<ServingRoute | undefined> {
  const route = await deps.caddy.getRoute(routeIdFor(hostname))
  if (route === undefined) return undefined
  const upstreams = upstreamsOf(route)
  if (upstreams.length === 0) return undefined
  return { route, upstreams, instanceIds: instanceIdsOf(route) }
}

/**
 * Puts back what served before a move — or removes the route, if nothing did.
 *
 * The route JSON is replayed exactly as the edge had it, rather than rebuilt from a
 * spec: rebuilding would need the previous instance's port and hostname, which is a
 * second producer of a value we are already holding (§11's naming lesson).
 *
 * Called by `ensureInstances` when the edge cannot be shown to reach every new instance
 * (P4c Task 4, Decision 7; A1 Task 4).
 */
export async function restoreRouteTo(
  deps: RoutingDeps,
  previous: ServingRoute | undefined,
  hostname: string,
  kind: EnvironmentKind,
): Promise<void> {
  if (previous === undefined) {
    await removeRoute(deps, hostname, kind)
    return
  }
  const routeId = routeIdFor(hostname)
  // The route can have been removed under us between the failed move and the
  // rollback — `pnpm test:docker` restarts the edge, which drops every runtime
  // route — and a PATCH would then 404 on the one path that must not fail.
  const existing = await deps.caddy.getRoute(routeId)
  if (existing === undefined) {
    await deps.caddy.putRoute(deps.servers[listenerFor(kind)], previous.route)
  } else {
    await deps.caddy.patchRoute(routeId, previous.route)
  }
}

/**
 * How many requests the edge is holding against one upstream.
 *
 * `undefined` when the edge does not list the address at all, which is NOT the same
 * fact as none. Measured 2026-09-15 (Task 1, M1): Caddy keeps counting an upstream
 * whose route has moved away for as long as its in-flight request lasts — 4,000 ms,
 * `num_requests: 1` — and unlists the address only once that request finishes. So
 * unlisted means idle on THIS edge, and the driver says so in one named constant
 * rather than this function guessing on its behalf.
 *
 * Called by the Docker driver's drain (Task 5).
 */
export async function inFlightTo(
  deps: RoutingDeps,
  upstream: string,
): Promise<number | undefined> {
  const found = (await deps.caddy.upstreams()).find((u) => u.address === upstream)
  return found?.num_requests
}

/**
 * Every upstream any route dials, across every listener — every member of every set.
 *
 * `retireInstance` refuses an instance whose address is in here (Decision 11) — the
 * second guard behind the control plane's own selection of what to retire. It reads
 * EVERY route rather than the one hostname, so a container from before P4c, which
 * carries no hostname label to select it by, is protected by the same line.
 *
 * Called by the Docker driver's `retireInstance` (Task 5).
 */
export async function upstreamsInUse(deps: RoutingDeps): Promise<Set<string>> {
  const found = new Set<string>()
  // THE `new Set` IS STILL RIGHT, BUT ITS REASON MOVED IN P6a (R3). It was written when
  // both listeners were `srv0` on the laptop (§21's divergence 2), so it existed to stop
  // the SAME server being read twice. The two names are now genuinely different — `srv0`
  // internal, `srv1` public — so this loop does two reads rather than one, and the Set is
  // what keeps a deployment that ever collapses them back to one name counted once.
  // Do not delete it as dead deduplication: it is load-bearing in both configurations.
  for (const server of new Set(Object.values(deps.servers))) {
    for (const route of await deps.caddy.getRoutes(server)) {
      for (const upstream of upstreamsOf(route)) found.add(upstream)
    }
  }
  return found
}
