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
 * On the laptop both listeners are loopback and both server names default to the
 * same Caddy server (§21, honest divergence 2), so this distinction is modelled and
 * recorded rather than enforced locally. It is two settings, not a derivation, so
 * UBC infrastructure enforces it by configuration and not by a code change.
 */
export function listenerFor(kind: EnvironmentKind): Listener {
  return kind === 'production' ? 'public' : 'internal'
}

/** Caddy's `@id` namespace is flat, so the id carries the whole hostname. */
export function routeIdFor(hostname: string): string {
  return `mf-${hostname.replace(/\./g, '-')}`
}
