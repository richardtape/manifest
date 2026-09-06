import { parse as parseYaml } from 'yaml'
import type { ManifestError } from '../errors/index.js'
import { manifestSchema, type ManifestSpec } from './schema.js'
import { toManifestErrors, SPEC_CODES } from './errors.js'
import { checkPolicy, type ValidationContext } from './policy.js'

export type { ManifestSpec, Classification } from './schema.js'
export type { ValidationContext } from './policy.js'
export { CLASSIFICATION_RANK, SLUG, AUTH_PATH, manifestSchema } from './schema.js'
export { toMebibytes, POLICY_CODES } from './policy.js'
export { SPEC_CODES } from './errors.js'

export type ValidationResult =
  { valid: true; spec: ManifestSpec } | { valid: false; errors: ManifestError[] }

export function validateSpec(yamlText: string, ctx: ValidationContext): ValidationResult {
  let raw: unknown
  try {
    raw = parseYaml(yamlText)
  } catch (cause) {
    return {
      valid: false,
      errors: [
        {
          code: SPEC_CODES.YAML_PARSE_FAILED,
          path: '',
          message:
            cause instanceof Error ? cause.message : 'manifest.yaml is not valid YAML',
          hint: 'Check indentation and quoting. Every value must be valid YAML before Manifest can read it.',
        },
      ],
    }
  }

  const parsed = manifestSchema.safeParse(raw)
  if (!parsed.success)
    return { valid: false, errors: toManifestErrors(parsed.error.issues) }

  const policyErrors = checkPolicy(parsed.data, ctx)
  if (policyErrors.length > 0) return { valid: false, errors: policyErrors }

  return { valid: true, spec: parsed.data }
}
