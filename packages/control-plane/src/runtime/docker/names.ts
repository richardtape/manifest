/**
 * Every Docker object this driver creates carries this prefix, and nothing without
 * it is ever removed. P1's constraint, restated as code: `manifest-*` is the
 * platform's, `mf-*` is per-app and ours, and everything else on the developer's
 * machine is somebody else's.
 */
import type { InstanceSpec } from '../driver.js'

export const MF_PREFIX = 'mf-'

/**
 * NOT redefined here, for the reason `routing/hostnames.ts` gives at Task 13: a
 * literal second copy of this union is a second thing to keep in step with
 * `InstanceSpec`, and the drift would be silent. Four modules import this one
 * (Tasks 4, 5 and 6), so it is the copy that would do the damage.
 */
export type EnvironmentKind = InstanceSpec['environmentKind']

/**
 * The Docker name is the interface's deterministic name with our prefix on it.
 * Re-deriving it from (slug, kind, release) here would create a SECOND derivation
 * that has to agree with `instanceName` forever, and the contract's "the second
 * call returns the same handle" would then depend on two functions staying in
 * step rather than on one function being deterministic.
 */
export function appContainer(instance: string): string {
  return `${MF_PREFIX}${instance}-app`
}

/** A service outlives releases (D3), so its name carries no release id. */
export function serviceContainer(service: string): string {
  return `${MF_PREFIX}${service}`
}

export function serviceVolume(service: string): string {
  return `${serviceContainer(service)}-data`
}

export function appNetwork(slug: string, kind: EnvironmentKind): string {
  return `${MF_PREFIX}${slug}-${kind}-net`
}

export function egressContainer(slug: string, kind: EnvironmentKind): string {
  return `${MF_PREFIX}${slug}-${kind}-egress`
}

export function isManifestOwned(name: string): boolean {
  return name.startsWith(MF_PREFIX)
}
