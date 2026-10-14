export type {
  CaddyClient,
  CaddyRoute,
  HealthPolicy,
  RouteUpstream,
  UpstreamStatus,
} from './caddy.js'
export {
  appHealthPolicy,
  buildRoute,
  createCaddyClient,
  INSTANCE_HEADER,
  PROBE_HEADER,
} from './caddy.js'
export type { EnvironmentKind, Listener } from './hostnames.js'
export { listenerFor, routeIdFor } from './hostnames.js'
export type { RouteSpec, RoutingDeps, ServingRoute } from './routes.js'
export {
  applyRoute,
  applySwitchedOffRoute,
  inFlightTo,
  instanceIdsOf,
  removeRoute,
  restoreRouteTo,
  servingRoute,
  SWITCHED_OFF_PAGE,
  upstreamsOf,
  upstreamsInUse,
} from './routes.js'
export type { IdentityProbeResult, ReadinessResult } from './readiness.js'
export {
  edgeIdentityProbe,
  edgeProbe,
  waitForIdentities,
  waitForReady,
} from './readiness.js'
