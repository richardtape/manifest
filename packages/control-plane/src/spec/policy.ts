import type { ManifestError } from '../errors/index.js'
import { CLASSIFICATION_RANK, type Classification, type ManifestSpec } from './schema.js'
import { RESERVED_ENV_NAMES } from './injection.js'

export interface ValidationContext {
  projectSlug: string
  attributeWhitelist: readonly string[]
  serviceCatalogue: readonly string[]
  modelCatalogue: readonly { name: string; maxClassification: Classification }[]
  /**
   * False when the control plane runs with `MANIFEST_AI_ENABLED=0` (P4b sitting 4,
   * finding 38). REQUIRED rather than defaulted: with AI off the catalogue is not
   * EMPTY, it is ABSENT, and an empty `modelCatalogue` alone would refuse every
   * declared model as SPEC_MODEL_UNKNOWN — a platform setting reported as a mistake
   * in the faculty member's manifest.
   */
  aiEnabled: boolean
  /**
   * Catalogue entries with no valid `max_classification` (`CatalogueSnapshot`). §7 as
   * amended on 2026-09-14: a declared model on this list is refused ON ITS OWN, with
   * SPEC_MODEL_UNCLASSIFIED, and nothing else is. Required for the reason `aiEnabled`
   * is: without it the model would be reported as SPEC_MODEL_UNKNOWN, blaming the
   * manifest for an administrator's configuration.
   */
  unclassifiedModels: readonly string[]
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
  MODEL_UNCLASSIFIED: 'SPEC_MODEL_UNCLASSIFIED',
  MODEL_CLASSIFICATION_TOO_LOW: 'SPEC_MODEL_CLASSIFICATION_TOO_LOW',
  AI_DISABLED: 'SPEC_AI_DISABLED',
  AI_BUDGET_REQUIRED: 'SPEC_AI_BUDGET_REQUIRED',
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
  if (!ctx.aiEnabled && spec.ai.models.length > 0) {
    // ONE error, at the list, and no per-model check: with no catalogue there is
    // nothing to check a model against, and "unknown model" for each would be false.
    errors.push({
      code: POLICY_CODES.AI_DISABLED,
      path: 'ai.models',
      message:
        'this Manifest platform is not offering AI models, so ai.models cannot be honoured',
      hint:
        'AI is switched off on this control plane (MANIFEST_AI_ENABLED=0). That is a ' +
        'platform setting, not a mistake in manifest.yaml: remove ai.models to deploy ' +
        'without AI, or ask an administrator to switch it on.',
    })
  }
  // With AI off there is no catalogue to check a model against; the error above
  // says so once, at the list.
  const checkedModels = ctx.aiEnabled ? spec.ai.models : []
  checkedModels.forEach((model, i) => {
    // BEFORE the lookup: an unclassified entry is not in `modelCatalogue` at all, and
    // would otherwise read as unknown — an operator's typo reported as the faculty
    // member's mistake.
    if (ctx.unclassifiedModels.includes(model)) {
      errors.push({
        code: POLICY_CODES.MODEL_UNCLASSIFIED,
        path: `ai.models.${i}`,
        message: `"${model}" has no data classification on this platform, so no app may use it`,
        hint:
          'This is the platform’s configuration, not a mistake in manifest.yaml: every ' +
          'model must be approved for a data classification before any app may use it ' +
          '(D17). Ask an administrator to classify it, or choose another model.',
      })
      return
    }
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

  // LiteLLM refuses every request from a user whose max_budget is 0 (P4b Task 7), so an
  // app that declared a model with a $0 budget would deploy healthy and have its first
  // question refused as over budget. §7 as amended on 2026-09-14: an OMITTED budget is
  // not that — `validateSpec` fills it with the project's AI quota before this runs —
  // so what reaches here as 0 was written as 0, or the quota itself is 0. Checked with
  // AI switched off too: the manifest is wrong either way.
  const projectBudget = spec.ai.budget.project_monthly_usd
  if (spec.ai.models.length > 0 && (projectBudget === undefined || projectBudget <= 0)) {
    errors.push({
      code: POLICY_CODES.AI_BUDGET_REQUIRED,
      path: 'ai.budget.project_monthly_usd',
      message: 'ai.models declares a model and the project AI budget is $0',
      hint:
        'A budget of 0 refuses every request, so the app would start healthy and fail ' +
        'its first question. Set ai.budget.project_monthly_usd to the most this app may ' +
        'spend on AI in a month, or leave it out to use the project’s AI quota — and if ' +
        'that quota is $0, ask an administrator to raise it.',
    })
  }

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

  if ((projectBudget ?? 0) > ctx.quota.aiMonthlyUsd) {
    errors.push({
      code: POLICY_CODES.QUOTA_EXCEEDED,
      path: 'ai.budget.project_monthly_usd',
      message: `requested $${spec.ai.budget.project_monthly_usd}/month, quota is $${ctx.quota.aiMonthlyUsd}`,
      hint: 'Lower the budget, or ask an administrator to raise the project quota.',
    })
  }

  return errors
}
