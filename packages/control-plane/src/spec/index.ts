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
export {
  DESCRIBED_PATHS,
  describeDiff,
  isSensitiveDiff,
  SENSITIVE_FIELDS,
} from './diff.js'
export { resolveConfig } from './resolve.js'
export {
  INJECTED_FILE_PATHS,
  INJECTION_CONTRACT_VERSION,
  MANIFEST_IDP_PATHS,
  INJECTION_VARIABLES,
  InjectionError,
  RESERVED_ENV_NAMES,
  renderInjection,
} from './injection.js'
export type {
  InjectedService,
  InjectedSpEntity,
  InjectionContext,
  InjectionVariable,
} from './injection.js'
export type {
  ResolvedConfig,
  ResolvedEnvVar,
  ResourceDefaults,
  EnvironmentKind,
} from './resolve.js'
export type { SensitiveField, SpecChange } from './diff.js'

export type ValidationResult =
  { valid: true; spec: ManifestSpec } | { valid: false; errors: ManifestError[] }

/**
 * Whether `manifest.yaml` declares any model — `false` for anything that does not
 * parse, which then fails validation on its own errors before any model is checked.
 *
 * Exists so the ROUTE can decide whether to read the catalogue at all (§7 as amended on
 * 2026-09-14): an app that declares no model validates and deploys as normal, so a
 * gateway outage — or a catalogue that cannot be read — must not refuse it. It answers
 * one yes-or-no question and produces nothing; `validateSpec` is still the one parse
 * whose result is stored.
 */
export function declaresModels(yamlText: string): boolean {
  let raw: unknown
  try {
    raw = parseYaml(yamlText)
  } catch {
    return false
  }
  const parsed = manifestSchema.safeParse(raw)
  return parsed.success && parsed.data.ai.models.length > 0
}

/**
 * §7 as amended on 2026-09-14 (Rich): an OMITTED project AI budget, on a manifest that
 * declares a model, is the project's AI quota. Filled HERE, before policy, so the quota
 * check reads the filled value and the stored spec — and every release frozen from it
 * — carries a concrete number rather than an absence a later reader must interpret.
 * A budget WRITTEN as 0 is left alone, and policy refuses it.
 *
 * Nothing tells the faculty member a default was applied, in Phase 1: the stored spec
 * and `GET /projects/:id/spec` show the number, and a validation notice is P5's.
 */
function withDefaultedAiBudget(spec: ManifestSpec, ctx: ValidationContext): ManifestSpec {
  if (spec.ai.models.length === 0) return spec
  if (spec.ai.budget.project_monthly_usd !== undefined) return spec
  return {
    ...spec,
    ai: {
      ...spec.ai,
      budget: { ...spec.ai.budget, project_monthly_usd: ctx.quota.aiMonthlyUsd },
    },
  }
}

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

  const spec = withDefaultedAiBudget(parsed.data, ctx)
  const policyErrors = checkPolicy(spec, ctx)
  if (policyErrors.length > 0) return { valid: false, errors: policyErrors }

  return { valid: true, spec }
}
