import { isScalar, parseDocument } from 'yaml'
import type { BlueprintRegistry } from './registry.js'

export class SeedError extends Error {
  constructor(
    readonly code: 'SEED_BLUEPRINT_UNKNOWN' | 'SEED_STARTER_UNKNOWN',
    message: string,
  ) {
    super(message)
    this.name = 'SeedError'
  }
}

/**
 * A project's FIRST COMMIT (§25 *What this changes in the control plane*): the blueprint's
 * skeleton, with the chosen starter laid over it — the starter wins where both carry a file,
 * because the starter is the app and the skeleton is the base it replaces parts of.
 *
 * `manifest.yaml`'s `name` is set to the project's slug, because §7 refuses a manifest whose
 * name is not its project's (SPEC_NAME_SLUG_MISMATCH). The slug is spliced into the author's
 * own text at the `name` value, byte for byte: a starter's manifest explains itself to the
 * reviewer who reads it for IAM registration, and re-stringifying the document keeps its
 * comments but refolds long lines and re-pads flow sequences (P5a Task 1, [M4c+]). A slug is
 * a plain scalar by §7's rule, so it needs no quoting.
 *
 * Without a starter: the skeleton and the minimal manifest creation has always seeded.
 */
export function renderProjectSeed(
  registry: BlueprintRegistry,
  input: { blueprintRef: string; slug: string; starter?: string },
): Record<string, string> {
  const descriptor = registry.resolve(input.blueprintRef)
  const skeleton = registry.skeleton(input.blueprintRef)
  if (descriptor === undefined || skeleton === undefined) {
    throw new SeedError('SEED_BLUEPRINT_UNKNOWN', `no blueprint '${input.blueprintRef}'`)
  }
  if (input.starter === undefined) {
    return {
      ...skeleton,
      'manifest.yaml': [
        'manifest: 1',
        `name: ${input.slug}`,
        `blueprint: ${input.blueprintRef}`,
        'runtime:',
        `  port: ${descriptor.runtime.default_port}`,
        `  health: ${descriptor.runtime.health_path}`,
        '',
      ].join('\n'),
    }
  }
  const starter = registry.starter(input.blueprintRef, input.starter)
  if (starter === undefined) {
    throw new SeedError(
      'SEED_STARTER_UNKNOWN',
      `blueprint '${input.blueprintRef}' offers no starter '${input.starter}'`,
    )
  }
  // The registry refused, at load, a starter with no manifest.yaml that passes §7.
  const source = starter.files['manifest.yaml']!
  const name = parseDocument(source).get('name', true)
  if (!isScalar(name) || !name.range) {
    throw new SeedError(
      'SEED_STARTER_UNKNOWN',
      `starter '${input.starter}' has no top-level scalar name in manifest.yaml`,
    )
  }
  const manifest =
    source.slice(0, name.range[0]) + input.slug + source.slice(name.range[1])
  return { ...skeleton, ...starter.files, 'manifest.yaml': manifest }
}
