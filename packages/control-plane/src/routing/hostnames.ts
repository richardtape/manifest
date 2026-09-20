// NOT redefined here. A second copy of this union is a second thing to keep in
// step with `InstanceSpec`, and the drift would be silent.
import type { InstanceSpec } from '../runtime/index.js'

export type EnvironmentKind = InstanceSpec['environmentKind']
export type Listener = 'internal' | 'public'

/**
 * §12: "The staging-is-UBC-only requirement is met by listener assignment, not IP
 * allowlisting: a misconfigured allowlist leaks quietly, whereas a route bound to
 * the wrong listener is simply unreachable."
 *
 * THIS IS ENFORCED ON THE LAPTOP SINCE P6a (R3), AND IT WAS NOT BEFORE. Until then
 * both server names defaulted to the same Caddy server, so the distinction was
 * modelled and recorded rather than enforced — §21's honest divergence 2, and this
 * comment said so. The edge now runs two servers in one container, `srv0` on :443
 * (internal) and `srv1` on :8443 (public), and a production route on the internal
 * one is reachable by nobody: `routing/listener-split.docker.test.ts` is what
 * watches that, and it is the first test here that could ever have failed for it.
 *
 * It is still TWO SETTINGS and not a derivation, so UBC infrastructure binds staging
 * to an internal-only listener by configuration and not by a code change.
 */
export function listenerFor(kind: EnvironmentKind): Listener {
  return kind === 'production' ? 'public' : 'internal'
}

/** Caddy's `@id` namespace is flat, so the id carries the whole hostname. */
export function routeIdFor(hostname: string): string {
  return `mf-${hostname.replace(/\./g, '-')}`
}
