import type { ManifestSpec } from './schema.js'
import { toMebibytes } from './policy.js'

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

const stable = (value: unknown): string => JSON.stringify(value)

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
 * `resources` is sensitive on INCREASE only (§7). A faculty member trimming memory
 * should not wait on an approval; one quietly tripling it should.
 */
function resourcesIncreased(before: ManifestSpec, after: ManifestSpec): boolean {
  const mib = (q: string | undefined) => (q === undefined ? undefined : toMebibytes(q))

  return (
    dimensionRose(before.resources.cpu, after.resources.cpu) ||
    dimensionRose(mib(before.resources.memory), mib(after.resources.memory)) ||
    dimensionRose(mib(before.resources.disk), mib(after.resources.disk)) ||
    dimensionRose(before.resources.pids, after.resources.pids)
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

export function isSensitiveDiff(
  before: ManifestSpec,
  after: ManifestSpec,
): { sensitive: boolean; fields: string[] } {
  const fields: string[] = []

  if (!sameObjectSet(before.services, after.services)) fields.push('services')

  // Both directions matter: in production auth.attributes must remain a subset of
  // what UBC IAM registered, so a removal is still a change worth seeing (D16, §9).
  if (!sameSet(before.auth.attributes, after.auth.attributes))
    fields.push('auth.attributes')

  if (!sameSet(before.egress.allow, after.egress.allow)) fields.push('egress.allow')

  if (resourcesIncreased(before, after)) fields.push('resources')

  if (before.data.classification !== after.data.classification)
    fields.push('data.classification')

  // A model change can move personal information to a different jurisdiction, which
  // invalidates an approved PIA — data.classification catches a change to the claim,
  // not to where the data actually goes (§7).
  if (!sameSet(before.ai.models, after.ai.models)) fields.push('ai.models')

  // Under D13 the blueprint IS the build definition, so a major bump changes the
  // Dockerfile, base image and knowledge pack beneath the app. The WHOLE reference
  // is compared, not just the major: `node-ts-mongo@2` -> `python-fastapi@2`
  // replaces every one of those layers while leaving the major digit alone, and
  // comparing only the digit let that through the gate unreviewed. The schema pins
  // the reference as `name@major` and nothing finer, so two references differ
  // exactly when the name or the major does — §7's "(major version)" is a
  // description of the reference, not an instruction to ignore its name.
  if (before.blueprint !== after.blueprint) fields.push('blueprint')

  return { sensitive: fields.length > 0, fields }
}
