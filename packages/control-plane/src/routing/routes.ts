import {
  buildRoute,
  INSTANCE_HEADER,
  type CaddyClient,
  type CaddyRoute,
} from './caddy.js'
import {
  type EnvironmentKind,
  listenerFor,
  type Listener,
  routeIdFor,
} from './hostnames.js'

export interface RoutingDeps {
  caddy: CaddyClient
  /** Listener -> Caddy server name. Both are `srv0` on the laptop (§21). */
  servers: Record<Listener, string>
}

export interface RouteSpec {
  hostname: string
  upstream: string
  kind: EnvironmentKind
  /** Whose route this is. Served back on every response; see `INSTANCE_HEADER`. */
  instanceId: string
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
  const server = deps.servers[listenerFor(spec.kind)]
  const routeId = routeIdFor(spec.hostname)
  const route = buildRoute({ ...spec, routeId })
  const existing = await deps.caddy.getRoute(routeId)
  if (existing === undefined) await deps.caddy.putRoute(server, route)
  else await deps.caddy.patchRoute(routeId, route)
}

export async function removeRoute(
  deps: RoutingDeps,
  hostname: string,
  kind: EnvironmentKind,
): Promise<void> {
  await deps.caddy.deleteRoute(deps.servers[listenerFor(kind)], routeIdFor(hostname))
}

/** The address a route dials, or `undefined` for a route that proxies nowhere. */
export function upstreamOf(route: CaddyRoute): string | undefined {
  for (const handler of route.handle) {
    const proxy = handler as { handler?: string; upstreams?: { dial?: string }[] }
    if (proxy.handler === 'reverse_proxy') return proxy.upstreams?.[0]?.dial
  }
  return undefined
}

/**
 * The instance a route names, read back off the header it sets.
 *
 * `undefined` for a route written before P4c, which is a real state on a running
 * machine until that app's next deploy — not an error.
 */
export function instanceIdOf(route: CaddyRoute): string | undefined {
  for (const handler of route.handle) {
    const headers = handler as {
      handler?: string
      response?: { set?: Record<string, string[]> }
    }
    if (headers.handler === 'headers') {
      return headers.response?.set?.[INSTANCE_HEADER]?.[0]
    }
  }
  return undefined
}

export interface ServingRoute {
  route: CaddyRoute
  upstream: string
  instanceId: string | undefined
}

/**
 * What this hostname reaches, as the edge's OWN CONFIGURATION has it.
 *
 * Not from the wire, deliberately (Decision 8): a wire check cannot tell "nothing is
 * routed" from "the app is slow to answer", and Decision 12 turns that difference
 * into retiring nothing versus retiring the live app.
 *
 * `undefined` means nothing this platform can name serves the hostname — either no
 * route by that `@id`, or a route that proxies nowhere. A route this platform wrote
 * always dials exactly one upstream, so the second case is a route we did not write
 * and cannot restore; treating it as "nothing served" is what a rollback wants.
 */
export async function servingRoute(
  deps: RoutingDeps,
  hostname: string,
): Promise<ServingRoute | undefined> {
  const route = await deps.caddy.getRoute(routeIdFor(hostname))
  if (route === undefined) return undefined
  const upstream = upstreamOf(route)
  if (upstream === undefined) return undefined
  // `instanceId` is a UNION with undefined rather than an optional property, so a
  // route written before P4c reads as `undefined` here without tripping
  // exactOptionalPropertyTypes — and the absence is a fact the caller must see.
  return { route, upstream, instanceId: instanceIdOf(route) }
}

/**
 * Puts back what served before a move — or removes the route, if nothing did.
 *
 * The route JSON is replayed exactly as the edge had it, rather than rebuilt from a
 * spec: rebuilding would need the previous instance's port and hostname, which is a
 * second producer of a value we are already holding (§11's naming lesson).
 *
 * Called by `ensureInstance` when the edge cannot be shown to reach the new instance
 * (Task 4, Decision 7) and by boot recovery (Task 9).
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
 * Every upstream any route dials, across every listener.
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
  // Both listeners are `srv0` on the laptop (§21), so the server names are deduped
  // before they are read — otherwise every route would be counted twice, which is
  // harmless for a Set and wasteful on every retire.
  for (const server of new Set(Object.values(deps.servers))) {
    for (const route of await deps.caddy.getRoutes(server)) {
      const upstream = upstreamOf(route)
      if (upstream !== undefined) found.add(upstream)
    }
  }
  return found
}
