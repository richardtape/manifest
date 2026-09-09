import type { ManifestSpec } from './schema.js'

export type EnvironmentKind = 'sandbox' | 'staging' | 'production'

/**
 * Derived from the schema rather than restated. Under `exactOptionalPropertyTypes`
 * a hand-written `value?: string` is NOT assignable from zod's inferred
 * `value?: string | undefined`, so restating it made `resolve.ts` fail `tsc` while
 * every one of its tests passed — vitest strips types without checking them.
 */
export type ResolvedEnvVar = ManifestSpec['env'][number]

/**
 * One environment's view of a spec: the base document with §7's `environments:`
 * overrides applied. §7 permits overrides of `resources` and `env` only — anything
 * else differing between staging and production would mean the artefact promoted is
 * not the artefact tested (§13).
 */
export interface ResolvedConfig {
  environmentKind: EnvironmentKind
  port: number
  health: string
  resources: { cpu: number; memory: string; pids: number; disk: string }
  env: ResolvedEnvVar[]
  services: ManifestSpec['services']
  egressAllow: string[]
  classification: ManifestSpec['data']['classification']
  /**
   * §7's `auth:` block, carried through unchanged — §7 permits no override of it,
   * so every environment sees the same one.
   *
   * Added by P4a Task 9, which is where the first reader appeared: `deployRelease`
   * registers a Service Provider for an app whose provider is `cwl`, and the
   * resolved config is the only thing it has. Reading the raw spec back out of
   * `app_specs` instead would put a second source of truth next to the one §13
   * FROZE at release time, which is the defect shape P3 paid for seven times in a
   * session. Task 10's injection contract is the second reader.
   */
  auth: ManifestSpec['auth']
}

/** Blueprint-supplied resource floor. §7: "defaults inherited from blueprint". */
export interface ResourceDefaults {
  cpu: number
  memory: string
  pids: number
  disk: string
}

/**
 * Drops absent keys so a spread can never overwrite a set value with undefined.
 *
 * The return type has to say that too. `Partial<T>` still admits `undefined` per
 * key, so spreading it produced `cpu: number | undefined` and the resolved
 * resources would not typecheck — the type undid at compile time exactly what the
 * function does at runtime.
 */
type Present<T> = { [K in keyof T]?: Exclude<T[K], undefined> }

function defined<T extends object>(value: T | undefined): Present<T> {
  if (!value) return {}
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Present<T>
}

export function resolveConfig(
  spec: ManifestSpec,
  kind: EnvironmentKind,
  defaults: ResourceDefaults,
): ResolvedConfig {
  // §7 permits overrides for staging and production only; sandbox always takes the
  // base spec. Task 2's schema has no `sandbox` key, so this narrowing is required
  // for the index to typecheck, not merely defensive.
  const override = kind === 'sandbox' ? undefined : spec.environments[kind]

  const resources: ResolvedConfig['resources'] = {
    ...defaults,
    ...defined(spec.resources),
    ...defined(override?.resources),
  }

  const env: ResolvedEnvVar[] = spec.env.map((entry) => ({ ...entry }))
  for (const entry of override?.env ?? []) {
    const existing = env.findIndex((candidate) => candidate.name === entry.name)
    if (existing >= 0) env[existing] = { ...entry }
    else env.push({ ...entry })
  }

  return {
    environmentKind: kind,
    port: spec.runtime.port,
    health: spec.runtime.health,
    resources,
    env,
    services: spec.services.map((service) => ({ ...service })),
    egressAllow: [...spec.egress.allow],
    classification: spec.data.classification,
    auth: { ...spec.auth, attributes: [...spec.auth.attributes] },
  }
}
