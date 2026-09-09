import { buildRoute, type CaddyClient } from './caddy.js'
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
}

export async function applyRoute(deps: RoutingDeps, spec: RouteSpec): Promise<void> {
  const server = deps.servers[listenerFor(spec.kind)]
  const routeId = routeIdFor(spec.hostname)
  // Idempotent: replacing means removing first, because a second PUT at index 0
  // would leave two routes matching the same host and the older one shadowed.
  //
  // THE FAILURE IS NOT SWALLOWED. `putRoute` inserts at index 0 unconditionally,
  // so idempotence rests entirely on this delete having happened. A 404 is already
  // tolerated inside the client — removing a route that is not there is the
  // desired end state, not an error — so anything still throwing here is a real
  // failure, and turning it into a silent duplicate is how "applying twice leaves
  // ONE route" becomes two. Measured 2026-09-08: that assertion failed once in
  // five Docker-tier runs and passed on the retry, which is exactly the shape a
  // swallowed error produces.
  await deps.caddy.deleteRoute(server, routeId)
  await deps.caddy.putRoute(server, buildRoute({ ...spec, routeId }))
}

export async function removeRoute(
  deps: RoutingDeps,
  hostname: string,
  kind: EnvironmentKind,
): Promise<void> {
  await deps.caddy.deleteRoute(deps.servers[listenerFor(kind)], routeIdFor(hostname))
}

/**
 * S1: "recreating the Caddy container discards every runtime route", because they
 * live only in the running config. §12 now says the control plane re-applies all
 * routes on edge start. This is that function; Task 19 adds the check that would
 * have caught the original loss.
 */
export async function reapplyAllRoutes(
  deps: RoutingDeps,
  specs: RouteSpec[],
): Promise<void> {
  for (const spec of specs) await applyRoute(deps, spec)
}
