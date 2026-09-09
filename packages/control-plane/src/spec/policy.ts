import type { ManifestError } from '../errors/index.js'
import { CLASSIFICATION_RANK, type Classification, type ManifestSpec } from './schema.js'
import { RESERVED_ENV_NAMES } from './injection.js'

export interface ValidationContext {
  projectSlug: string
  attributeWhitelist: readonly string[]
  serviceCatalogue: readonly string[]
  modelCatalogue: readonly { name: string; maxClassification: Classification }[]
  quota: {
    maxCpu: number
    maxMemoryMi: number
    maxServices: number
    aiMonthlyUsd: number
  }
  /** Present only when validating a release bound for production (§9). */
  registeredAttributes?: readonly string[]
}

export const POLICY_CODES = {
  ENV_NAME_RESERVED: 'SPEC_ENV_NAME_RESERVED',
  NAME_SLUG_MISMATCH: 'SPEC_NAME_SLUG_MISMATCH',
  SERVICE_TYPE_UNKNOWN: 'SPEC_SERVICE_TYPE_UNKNOWN',
  ATTRIBUTE_NOT_WHITELISTED: 'SPEC_ATTRIBUTE_NOT_WHITELISTED',
  ATTRIBUTE_NOT_REGISTERED: 'SPEC_ATTRIBUTE_NOT_REGISTERED',
  MODEL_UNKNOWN: 'SPEC_MODEL_UNKNOWN',
  MODEL_CLASSIFICATION_TOO_LOW: 'SPEC_MODEL_CLASSIFICATION_TOO_LOW',
  QUOTA_EXCEEDED: 'SPEC_QUOTA_EXCEEDED',
} as const

/** Converts "512Mi" / "2Gi" / "512" to mebibytes. */
export function toMebibytes(quantity: string): number {
  const m = /^(\d+(?:\.\d+)?)(Mi|Gi)?$/.exec(quantity)
  if (!m) return Number.NaN
  const value = Number(m[1])
  return m[2] === 'Gi' ? value * 1024 : value
}

export function checkPolicy(spec: ManifestSpec, ctx: ValidationContext): ManifestError[] {
  const errors: ManifestError[] = []

  if (spec.name !== ctx.projectSlug) {
    errors.push({
      code: POLICY_CODES.NAME_SLUG_MISMATCH,
      path: 'name',
      message: `name "${spec.name}" does not match the project slug "${ctx.projectSlug}"`,
      hint: 'The name in manifest.yaml must equal the project slug. Rename the project, or correct the file.',
    })
  }

  /**
   * §8's names are the PLATFORM's, and an app that sets one has written a
   * variable that does nothing.
   *
   * `renderInjection` applies the platform's bindings after the app's own and
   * therefore wins, which is the right SECURITY answer — §12 makes application
   * code untrusted input, so a declared `MONGODB_URI` must not be able to point
   * an app at a database of its choosing. It is the wrong answer for the faculty
   * member, who set `PORT` and cannot work out why their app still listens on
   * 3000. This is the read that tells them, at validation, long before a build.
   *
   * Two independent reads of one list, which is the shape the roadmap's lesson
   * asks for — and both read `INJECTION_VARIABLES`, so neither can drift.
   */
  const reserved = (entries: ManifestSpec['env'], path: string) => {
    entries.forEach((entry, i) => {
      if (!RESERVED_ENV_NAMES.has(entry.name)) return
      errors.push({
        code: POLICY_CODES.ENV_NAME_RESERVED,
        path: `${path}.${i}.name`,
        message: `${entry.name} is set by the platform and cannot be declared here`,
        hint:
          `Manifest injects ${entry.name} itself (§8's environment injection contract), ` +
          'and the platform value wins — so this line has no effect. Remove it, or ' +
          'choose another name. The full list is in the blueprint knowledge pack.',
      })
    })
  }
  reserved(spec.env, 'env')
  // The overrides too: §7 lets staging and production add variables, and a
  // reserved name introduced there would be just as inert and just as silent.
  for (const kind of ['staging', 'production'] as const) {
    const override = spec.environments[kind]?.env
    if (override) reserved(override, `environments.${kind}.env`)
  }

  spec.services.forEach((service, i) => {
    if (!ctx.serviceCatalogue.includes(service.type)) {
      errors.push({
        code: POLICY_CODES.SERVICE_TYPE_UNKNOWN,
        path: `services.${i}.type`,
        message: `unknown service type "${service.type}"`,
        hint: `Available service types are: ${ctx.serviceCatalogue.join(', ')}.`,
      })
    }
  })

  spec.auth.attributes.forEach((attr, i) => {
    if (!ctx.attributeWhitelist.includes(attr)) {
      errors.push({
        code: POLICY_CODES.ATTRIBUTE_NOT_WHITELISTED,
        path: `auth.attributes.${i}`,
        message: `"${attr}" is not a releasable UBC attribute`,
        hint:
          `Permitted attributes: ${ctx.attributeWhitelist.join(', ')}. ` +
          'Note that "uid" is not a UBC attribute — the identifier is ubcEduCwlPuid.',
      })
    }
    if (ctx.registeredAttributes && !ctx.registeredAttributes.includes(attr)) {
      errors.push({
        code: POLICY_CODES.ATTRIBUTE_NOT_REGISTERED,
        path: `auth.attributes.${i}`,
        message: `"${attr}" is not registered with UBC IAM for this app`,
        hint:
          'A production release may only request attributes UBC IAM has registered. ' +
          'Raise an IAM change request, or remove the attribute. Failing here at build time ' +
          'is deliberate — the alternative is a broken login on launch day.',
      })
    }
  })

  const appRank = CLASSIFICATION_RANK[spec.data.classification]
  spec.ai.models.forEach((model, i) => {
    const entry = ctx.modelCatalogue.find((m) => m.name === model)
    if (!entry) {
      errors.push({
        code: POLICY_CODES.MODEL_UNKNOWN,
        path: `ai.models.${i}`,
        message: `unknown logical model "${model}"`,
        hint: `Available models: ${ctx.modelCatalogue.map((m) => m.name).join(', ')}. Use logical names, never vendor model IDs.`,
      })
      return
    }
    if (CLASSIFICATION_RANK[entry.maxClassification] < appRank) {
      errors.push({
        code: POLICY_CODES.MODEL_CLASSIFICATION_TOO_LOW,
        path: `ai.models.${i}`,
        message: `"${model}" may not process ${spec.data.classification} data`,
        hint:
          `"${model}" is approved up to ${entry.maxClassification} data and this app declares ` +
          `${spec.data.classification}. Choose an on-premise model, or lower data.classification ` +
          'if it is overstated. A BC public body may not send personal information to a model running outside Canada.',
      })
    }
  })

  const cpu = spec.resources.cpu
  if (cpu !== undefined && cpu > ctx.quota.maxCpu) {
    errors.push({
      code: POLICY_CODES.QUOTA_EXCEEDED,
      path: 'resources.cpu',
      message: `requested ${cpu} CPU, quota is ${ctx.quota.maxCpu}`,
      hint: 'Lower the request, or ask an administrator to raise the project quota.',
    })
  }

  const memory = spec.resources.memory
  if (memory !== undefined && toMebibytes(memory) > ctx.quota.maxMemoryMi) {
    errors.push({
      code: POLICY_CODES.QUOTA_EXCEEDED,
      path: 'resources.memory',
      message: `requested ${memory}, quota is ${ctx.quota.maxMemoryMi}Mi`,
      hint: 'Lower the request, or ask an administrator to raise the project quota.',
    })
  }

  if (spec.services.length > ctx.quota.maxServices) {
    errors.push({
      code: POLICY_CODES.QUOTA_EXCEEDED,
      path: 'services',
      message: `declared ${spec.services.length} services, quota is ${ctx.quota.maxServices}`,
      hint: 'Remove a service, or ask an administrator to raise the project quota.',
    })
  }

  if (spec.ai.budget.project_monthly_usd > ctx.quota.aiMonthlyUsd) {
    errors.push({
      code: POLICY_CODES.QUOTA_EXCEEDED,
      path: 'ai.budget.project_monthly_usd',
      message: `requested $${spec.ai.budget.project_monthly_usd}/month, quota is $${ctx.quota.aiMonthlyUsd}`,
      hint: 'Lower the budget, or ask an administrator to raise the project quota.',
    })
  }

  return errors
}
