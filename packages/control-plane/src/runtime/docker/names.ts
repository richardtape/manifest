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

/**
 * The volume holding §8's placed files, mounted at /manifest.
 *
 * A VOLUME rather than the container's own filesystem, because §12's hardening
 * sets `ReadonlyRootfs` and the daemon refuses to write into a read-only rootfs
 * — measured 2026-09-08: `container rootfs is marked read-only`. A volume path
 * on the same container is accepted, and the contents survive into the next
 * container that mounts it, which matters because the app reads its certificate
 * at STARTUP and so the file has to exist before the process does.
 */
export function filesVolume(instance: string): string {
  return `${appContainer(instance)}-files`
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

/**
 * What the EDGE dials to reach ONE instance: `mf-i-<instanceId>`, 41 characters.
 *
 * A dial address is a DNS label, and a label is at most 63 octets. A container name
 * carries the slug, the environment, the release AND the instance (§11), which for a
 * 39-character slug is 72 — and a 72-character name does not resolve: measured
 * 2026-09-15 from inside the edge, `curl: (6) Could not resolve host …
 * (Misformatted domain name)`, with `getent hosts` giving no answer, while a
 * 17-character name answered 200. So the name cannot be the dial address.
 *
 * The alias is bounded, unambiguous — Docker resolves it only on the app's own
 * network, so a 200 at this address is THIS instance's 200 by construction — and it
 * is what `servingInstance` maps back to a container (Task 5).
 */
export const INSTANCE_ALIAS_PREFIX = 'mf-i-'

export function instanceAlias(instanceId: string): string {
  return `${INSTANCE_ALIAS_PREFIX}${instanceId}`
}
