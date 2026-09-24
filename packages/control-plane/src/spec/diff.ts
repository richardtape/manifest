import type { ManifestSpec } from './schema.js'
import { toMebibytes } from './policy.js'
import type { ResolvedConfig } from './resolve.js'

/**
 * The seven fields of §7, and only these, re-escalate a release to approval (D9).
 * Adding an eighth is a design change, not a code change — see §7 before touching this.
 */
export const SENSITIVE_FIELDS = [
  'services',
  'auth.attributes',
  'egress.allow',
  'resources',
  'data.classification',
  'ai.models',
  'blueprint',
] as const

export type SensitiveField = (typeof SENSITIVE_FIELDS)[number]

/**
 * R4(d): what each of §7's seven fields MEANS for security and privacy when it changes — the
 * deterministic half of the approval summary's security dimension (P6b Decision 13), present
 * when the model is down. A `Record<SensitiveField, …>` so an eighth field is a `tsc` error
 * here rather than a change nobody explains to an administrator.
 *
 * *(Rich answered P6b's Question 3 on 2026-09-22: a PIA never returns to `draft`
 * automatically. These sentences are therefore how an administrator learns that a PIA may
 * need the Privacy Office again, and the decision is theirs.)*
 */
export const SECURITY_NOTES: Record<SensitiveField, string> = {
  services:
    'A service stores data somewhere new — the PIA’s “where it is stored” (§9) may no longer be accurate.',
  'auth.attributes':
    'The app receives different personal information about every person who signs in. In production it must stay within what UBC IAM registered (§7, §9), and it is an input to the PIA.',
  'egress.allow':
    'The app may send data to a host it could not reach before. Default-deny egress is §20’s containment for unreviewed code, and this widens it. An input to the PIA’s “where it flows”.',
  resources:
    'More CPU, memory, processes or disk: cost and blast radius rather than data.',
  'data.classification':
    'The app now claims a different class of data, which bounds the models it may use (D17) and is an input to the PIA.',
  'ai.models':
    'A model change can move personal information to a different jurisdiction, which invalidates an approved PIA (§7, §9) — the administrator decides whether the PIA must be reviewed again.',
  blueprint:
    'Under D13 the blueprint is the build definition: a change replaces the Dockerfile, base image and knowledge pack beneath the app.',
}

/**
 * The note for each field that changed, in `SENSITIVE_FIELDS` order whatever order it was
 * handed — two approvals of the same change record the same list. **Callers:** P6b Task 8's
 * `buildDiffSnapshot`, which stores them on the approval and hands them to the summary.
 */
export function securityNotesFor(
  fields: readonly SensitiveField[],
): { field: SensitiveField; note: string }[] {
  return SENSITIVE_FIELDS.filter((f) => fields.includes(f)).map((field) => ({
    field,
    note: SECURITY_NOTES[field],
  }))
}

/**
 * A serialisation that ignores the ORDER OF AN OBJECT'S KEYS, at every depth. The route
 * compares the previous spec as Postgres's jsonb hands it back — keys by length, then
 * bytes, `{name, type, version}` — with one zod has just parsed in schema order,
 * `{type, version, name}`, and a plain `JSON.stringify` called every re-validation of a
 * manifest declaring a service a sensitive change (P5a sitting 6, measured through the
 * route). Array order is kept: the callers sort what should not depend on it.
 *
 * **EXPORTED FOR `releases/preview.ts`'s `sameFacts`** (P6b Task 9): a stored preview's facts
 * come back from jsonb in Postgres's key order, and one serialisation that already ignores it
 * is better than a second that might not.
 */
export const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  )

/** Order-insensitive comparison — reordering a list is not a change of intent. */
const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  stable([...a].sort()) === stable([...b].sort())

/**
 * The same rule for a list of objects: compare as an unordered multiset by sorting
 * the serialised entries. `services` was originally compared with a plain
 * JSON.stringify, so swapping two service declarations escalated a release to
 * approval while changing nothing — the very "reordering is not a change of
 * intent" the line above states.
 */
const sameObjectSet = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  stable(a.map(stable).sort()) === stable(b.map(stable).sort())

/**
 * What §7's seven sensitive fields ARE, for one side of a comparison (P6b Task 3, Decision 5).
 *
 * ONE SHAPE, SO THERE IS ONE RULE. The re-escalation compares two releases' FROZEN production
 * configs, and the validate route compares two raw specs; before P6b the rule read
 * `ManifestSpec` directly, and a second copy for releases would have been two statements of
 * one rule, which drift (ORIENTATION §9). Two adapters below build this view instead.
 */
export interface SensitiveView {
  services: readonly { type: string; version: string; name: string }[]
  attributes: readonly string[]
  egress: readonly string[]
  /**
   * What the environment RUNS with where known; a raw spec leaves a dimension `undefined`
   * where the blueprint supplies it. `| undefined` explicitly, because
   * `exactOptionalPropertyTypes` would otherwise refuse the spec adapter's fold.
   */
  resources: {
    cpu?: number | undefined
    memory?: string | undefined
    pids?: number | undefined
    disk?: string | undefined
  }
  classification: string
  models: readonly string[]
  /** §7's `blueprint` — the MANIFEST's reference (P6b *Read this first* 4). */
  blueprint: string
}

/**
 * `resources` is sensitive on INCREASE only (§7). A faculty member trimming memory
 * should not wait on an approval; one quietly tripling it should.
 */
function resourcesIncreased(
  before: SensitiveView['resources'],
  after: SensitiveView['resources'],
): boolean {
  const mib = (q: string | undefined) => (q === undefined ? undefined : toMebibytes(q))

  return (
    dimensionRose(before.cpu, after.cpu) ||
    dimensionRose(mib(before.memory), mib(after.memory)) ||
    dimensionRose(mib(before.disk), mib(after.disk)) ||
    dimensionRose(before.pids, after.pids)
  )
}

/**
 * One resource dimension, with the absent case handled honestly.
 *
 * An absent field does not mean zero — §7 says the value is "inherited from the
 * blueprint", and Task 16 resolves it as a third layer this function cannot see.
 * So dropping a declared `cpu: 0.5` can RAISE the effective ceiling, and the
 * original `?? 0` read it as a decrease to zero and waved it through. Where the
 * direction cannot be known, escalate: a needless approval costs a click, a
 * missed one is an unreviewed production change (D9).
 */
function dimensionRose(before: number | undefined, after: number | undefined): boolean {
  if (before === undefined) return after !== undefined && after > 0
  if (after === undefined) return true
  return after > before
}

/**
 * §7's rule, once: which sensitive fields differ between two views, in `SENSITIVE_FIELDS`
 * order. Its callers are `isSensitiveDiff` (the validate route's report) and
 * `releases/approval.ts`'s `sensitiveChangeOf` (D9.2's re-escalation).
 */
export function sensitiveFieldsBetween(
  before: SensitiveView,
  after: SensitiveView,
): SensitiveField[] {
  const fields: SensitiveField[] = []

  if (!sameObjectSet(before.services, after.services)) fields.push('services')

  // Both directions matter: in production auth.attributes must remain a subset of
  // what UBC IAM registered, so a removal is still a change worth seeing (D16, §9).
  if (!sameSet(before.attributes, after.attributes)) fields.push('auth.attributes')

  if (!sameSet(before.egress, after.egress)) fields.push('egress.allow')

  if (resourcesIncreased(before.resources, after.resources)) fields.push('resources')

  if (before.classification !== after.classification) fields.push('data.classification')

  // A model change can move personal information to a different jurisdiction, which
  // invalidates an approved PIA — data.classification catches a change to the claim,
  // not to where the data actually goes (§7).
  if (!sameSet(before.models, after.models)) fields.push('ai.models')

  // Under D13 the blueprint IS the build definition, so a major bump changes the
  // Dockerfile, base image and knowledge pack beneath the app. The WHOLE reference
  // is compared, not just the major: `node-ts-mongo@2` -> `python-fastapi@2`
  // replaces every one of those layers while leaving the major digit alone, and
  // comparing only the digit let that through the gate unreviewed. The schema pins
  // the reference as `name@major` and nothing finer, so two references differ
  // exactly when the name or the major does — §7's "(major version)" is a
  // description of the reference, not an instruction to ignore its name.
  if (before.blueprint !== after.blueprint) fields.push('blueprint')

  return fields
}

/**
 * PRODUCTION'S view of a raw spec (Decision 5): §7 lets `environments.production` override
 * `resources`, and a gate on production that cannot see that override is not a gate on
 * production (P6b `[M3]`: 512Mi → 8Gi through the override reported no change). No
 * blueprint defaults here — a raw spec has none, and `dimensionRose` already escalates
 * where the direction cannot be known.
 *
 * Folded one dimension at a time, with `??`, rather than by spreading the override: a
 * spread of an object holding an explicit `undefined` would erase the top-level value,
 * which `resolveConfig`'s `defined()` exists to prevent on the release side.
 */
export function sensitiveViewOfSpec(spec: ManifestSpec): SensitiveView {
  const top = spec.resources
  const override = spec.environments.production?.resources
  return {
    services: spec.services,
    attributes: spec.auth.attributes,
    egress: spec.egress.allow,
    resources: {
      cpu: override?.cpu ?? top.cpu,
      memory: override?.memory ?? top.memory,
      pids: override?.pids ?? top.pids,
      disk: override?.disk ?? top.disk,
    },
    classification: spec.data.classification,
    models: spec.ai.models,
    blueprint: spec.blueprint,
  }
}

/**
 * A release's view: its FROZEN production config — blueprint defaults, the top level and the
 * production override already resolved (§13) — and the manifest's `blueprint:`, which
 * `ResolvedConfig` does not carry. `describeDiff`'s own fallbacks for a release frozen before
 * `auth` or `ai` existed (P4b pre-flight 64) — the SAME constants, not copies of them.
 */
export function sensitiveViewOfRelease(
  production: ResolvedConfig,
  blueprint: string,
): SensitiveView {
  const auth = (production.auth as ResolvedConfig['auth'] | undefined) ?? NO_AUTH
  const ai = (production.ai as ResolvedConfig['ai'] | undefined) ?? NO_AI
  return {
    services: production.services,
    attributes: auth.attributes,
    egress: production.egressAllow,
    resources: production.resources,
    classification: production.classification,
    models: ai.models,
    blueprint,
  }
}

/**
 * The validate route's report (§7, D9): which of the seven fields two raw specs differ in, as
 * PRODUCTION would run them. The signature is unchanged since P2; the body is the one rule
 * over the spec adapter since P6b Task 3.
 */
export function isSensitiveDiff(
  before: ManifestSpec,
  after: ManifestSpec,
): { sensitive: boolean; fields: string[] } {
  const fields = sensitiveFieldsBetween(
    sensitiveViewOfSpec(before),
    sensitiveViewOfSpec(after),
  )
  return { sensitive: fields.length > 0, fields }
}

/** One change between two frozen configs, in the form §14's Incident shows it. */
export interface SpecChange {
  /** Where, in manifest.yaml's own vocabulary — the file an agent would edit. */
  path: string
  from: string
  to: string
  /** One clause a faculty member can read. */
  summary: string
}

/**
 * Every leaf of a `ResolvedConfig`, and the manifest.yaml path `describeDiff` reports
 * it under — or null for the one leaf two releases of ONE environment cannot differ
 * in. `diff.test.ts` reads the leaves off a real resolved config and compares them with
 * these keys, so a field added to `ResolvedConfig` without a description here is a red
 * test rather than an Incident that says nothing changed when something did.
 */
export const DESCRIBED_PATHS = {
  environmentKind: null,
  port: 'runtime.port',
  health: 'runtime.health',
  'resources.cpu': 'resources.cpu',
  'resources.memory': 'resources.memory',
  'resources.pids': 'resources.pids',
  'resources.disk': 'resources.disk',
  env: 'env',
  services: 'services',
  egressAllow: 'egress.allow',
  classification: 'data.classification',
  'auth.provider': 'auth.provider',
  'auth.attributes': 'auth.attributes',
  'auth.callback': 'auth.callback',
  'auth.logout': 'auth.logout',
  'ai.models': 'ai.models',
  'ai.budget.project_monthly_usd': 'ai.budget.project_monthly_usd',
  'ai.budget.per_user_monthly_usd': 'ai.budget.per_user_monthly_usd',
} as const satisfies Record<string, string | null>

/**
 * What a release frozen before `ResolvedConfig.auth` (P4a Task 9) or `.ai` (Task 10)
 * existed ran with: no sign-on and no models (pre-flight 64). The schema's defaults.
 */
const NO_AUTH: ResolvedConfig['auth'] = {
  provider: 'none',
  attributes: [],
  callback: '/auth/ubcshib/callback',
  logout: '/auth/logout',
}
const NO_AI: ResolvedConfig['ai'] = { models: [], budget: { per_user_monthly_usd: 0 } }

const listOrNone = (items: readonly string[]): string =>
  items.length === 0 ? 'none' : items.join(', ')
const sortedStrings = (items: readonly string[]): string[] => [...items].sort()
const article = (noun: string): string => (/^[aeiou]/i.test(noun) ? 'an' : 'a')
const dollars = (value: number | undefined): string =>
  value === undefined ? 'no budget' : `$${value}`
/** Clauses joined, or a fallback for a difference no clause names (a duplicate). */
const clauses = (parts: readonly string[], fallback: string): string =>
  parts.length === 0 ? fallback : parts.join('; ')

function serviceNoun(type: string): string {
  if (type === 'mongo') return 'mongo database'
  if (type === 'qdrant') return 'qdrant vector store'
  return `${type} service`
}

function servicesChange(
  before: ResolvedConfig['services'],
  after: ResolvedConfig['services'],
): SpecChange | undefined {
  if (sameObjectSet(before, after)) return undefined
  const byName = (list: ResolvedConfig['services']) =>
    new Map(list.map((service) => [service.name, service]))
  const label = (list: ResolvedConfig['services']) =>
    listOrNone(
      [...list]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => `${s.type} ${s.version} (${s.name})`),
    )
  const was = byName(before)
  const now = byName(after)
  const parts: string[] = []
  for (const name of sortedStrings([...now.keys()])) {
    const service = now.get(name)!
    const old = was.get(name)
    const noun = serviceNoun(service.type)
    if (old === undefined) parts.push(`added ${article(noun)} ${noun} called ${name}`)
    else if (old.type !== service.type) {
      parts.push(
        `replaced the ${serviceNoun(old.type)} called ${name} with ${article(noun)} ${noun}`,
      )
    } else if (old.version !== service.version) {
      parts.push(
        `changed the ${noun} called ${name} from version ${old.version} to ${service.version}`,
      )
    }
  }
  for (const name of sortedStrings([...was.keys()])) {
    if (!now.has(name))
      parts.push(`removed the ${serviceNoun(was.get(name)!.type)} called ${name}`)
  }
  return {
    path: 'services',
    from: label(before),
    to: label(after),
    summary: clauses(parts, 'changed the declared services'),
  }
}

/** A list compared as a set: reordering it is not a change of intent. */
function setChange(
  path: string,
  before: readonly string[],
  after: readonly string[],
  added: (item: string) => string,
  removed: (item: string) => string,
): SpecChange | undefined {
  if (sameSet(before, after)) return undefined
  const parts = [
    ...sortedStrings(after.filter((item) => !before.includes(item))).map(added),
    ...sortedStrings(before.filter((item) => !after.includes(item))).map(removed),
  ]
  return {
    path,
    from: listOrNone(sortedStrings(before)),
    to: listOrNone(sortedStrings(after)),
    summary: clauses(parts, `changed ${path}`),
  }
}

/**
 * Environment variables, by NAME. A value is never printed: §7 keeps secrets out of
 * manifest.yaml, but a plain value can still be a URL carrying a token, and this text
 * goes into an Incident an agent reads.
 */
function envChange(
  before: ResolvedConfig['env'],
  after: ResolvedConfig['env'],
): SpecChange | undefined {
  const identity = (entry: ResolvedConfig['env'][number]) =>
    JSON.stringify([entry.name, entry.value ?? null, entry.secret ?? false])
  if (sameSet(before.map(identity), after.map(identity))) return undefined
  const was = new Map(before.map((entry) => [entry.name, identity(entry)]))
  const now = new Map(after.map((entry) => [entry.name, identity(entry)]))
  const names = (map: Map<string, string>) => sortedStrings([...map.keys()])
  const parts = [
    ...names(now)
      .filter((name) => !was.has(name))
      .map((name) => `added ${name}`),
    ...names(was)
      .filter((name) => !now.has(name))
      .map((name) => `removed ${name}`),
    ...names(now)
      .filter((name) => was.has(name) && was.get(name) !== now.get(name))
      .map((name) => `changed the value of ${name}`),
  ]
  return {
    path: 'env',
    from: listOrNone(names(was)),
    to: listOrNone(names(now)),
    summary: clauses(parts, 'changed the environment variables'),
  }
}

/** A resource limit, compared by MAGNITUDE — `1024Mi` is `1Gi`, not a change. */
function limitChange<T extends number | string>(
  path: string,
  label: string,
  before: T,
  after: T,
  magnitude: (value: T) => number,
): SpecChange | undefined {
  if (magnitude(before) === magnitude(after)) return undefined
  const direction = magnitude(after) > magnitude(before) ? 'raised' : 'lowered'
  return {
    path,
    from: String(before),
    to: String(after),
    summary: `${direction} the ${label} limit from ${before} to ${after}`,
  }
}

function valueChange(
  path: string,
  before: string | number | undefined,
  after: string | number | undefined,
  summary: string,
): SpecChange | undefined {
  if (before === after) return undefined
  return { path, from: String(before ?? 'none'), to: String(after ?? 'none'), summary }
}

/**
 * §14's "the diff since the last healthy release", as readable changes (P4b Task 13).
 *
 * NOT `isSensitiveDiff`. That one answers "does this need an approval?" with seven
 * field names (D9); this answers "what changed since the app last worked?" for every
 * field an app runs with. They share the ordering-insensitive helpers above, because
 * reordering a list is not a change of intent in either question.
 *
 * Over the FROZEN `ResolvedConfig` for one environment, never `app_specs.parsed`: a
 * release is what §13 froze, and reading the spec back would be the second source of
 * truth P4a deleted (P4b sitting 1, divergence 4).
 */
export function describeDiff(
  before: ResolvedConfig,
  after: ResolvedConfig,
): SpecChange[] {
  // `as … | undefined`: the type says both are always there, and a release frozen
  // before they existed says otherwise (pre-flight 64).
  const authWas = (before.auth as ResolvedConfig['auth'] | undefined) ?? NO_AUTH
  const authNow = (after.auth as ResolvedConfig['auth'] | undefined) ?? NO_AUTH
  const aiWas = (before.ai as ResolvedConfig['ai'] | undefined) ?? NO_AI
  const aiNow = (after.ai as ResolvedConfig['ai'] | undefined) ?? NO_AI
  const same = <T>(value: T): number => Number(value)

  const changes = [
    servicesChange(before.services, after.services),
    valueChange(
      'runtime.port',
      before.port,
      after.port,
      `the app now listens on port ${after.port} instead of ${before.port}`,
    ),
    valueChange(
      'runtime.health',
      before.health,
      after.health,
      `the health check path changed from ${before.health} to ${after.health}`,
    ),
    limitChange('resources.cpu', 'CPU', before.resources.cpu, after.resources.cpu, same),
    limitChange(
      'resources.memory',
      'memory',
      before.resources.memory,
      after.resources.memory,
      toMebibytes,
    ),
    limitChange(
      'resources.pids',
      'process',
      before.resources.pids,
      after.resources.pids,
      same,
    ),
    limitChange(
      'resources.disk',
      'disk',
      before.resources.disk,
      after.resources.disk,
      toMebibytes,
    ),
    envChange(before.env, after.env),
    setChange(
      'egress.allow',
      before.egressAllow,
      after.egressAllow,
      (host) => `now allows ${host}`,
      (host) => `no longer allows ${host}`,
    ),
    valueChange(
      'data.classification',
      before.classification,
      after.classification,
      `now declares ${after.classification} data instead of ${before.classification}`,
    ),
    valueChange(
      'auth.provider',
      authWas.provider,
      authNow.provider,
      `sign-on changed from ${authWas.provider} to ${authNow.provider}`,
    ),
    setChange(
      'auth.attributes',
      authWas.attributes,
      authNow.attributes,
      (attribute) => `now requests the ${attribute} attribute`,
      (attribute) => `no longer requests the ${attribute} attribute`,
    ),
    valueChange(
      'auth.callback',
      authWas.callback,
      authNow.callback,
      `the sign-on callback path changed from ${authWas.callback} to ${authNow.callback}`,
    ),
    valueChange(
      'auth.logout',
      authWas.logout,
      authNow.logout,
      `the sign-out path changed from ${authWas.logout} to ${authNow.logout}`,
    ),
    setChange(
      'ai.models',
      aiWas.models,
      aiNow.models,
      (model) => `now uses ${model}`,
      (model) => `no longer uses ${model}`,
    ),
    valueChange(
      'ai.budget.project_monthly_usd',
      aiWas.budget.project_monthly_usd,
      aiNow.budget.project_monthly_usd,
      `changed the project's monthly AI budget from ${dollars(aiWas.budget.project_monthly_usd)} ` +
        `to ${dollars(aiNow.budget.project_monthly_usd)}`,
    ),
    valueChange(
      'ai.budget.per_user_monthly_usd',
      aiWas.budget.per_user_monthly_usd,
      aiNow.budget.per_user_monthly_usd,
      `changed the per-user monthly AI budget from ${dollars(aiWas.budget.per_user_monthly_usd)} ` +
        `to ${dollars(aiNow.budget.per_user_monthly_usd)}`,
    ),
  ]
  return changes.filter((change): change is SpecChange => change !== undefined)
}
