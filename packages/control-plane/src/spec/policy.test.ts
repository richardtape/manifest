import { describe, expect, it } from 'vitest'
import { validateSpec, type ValidationContext } from './index.js'

const ctx: ValidationContext = {
  projectSlug: 'chem-lab-scheduler',
  attributeWhitelist: [
    'ubcEduCwlPuid',
    'mail',
    'givenName',
    'sn',
    'eduPersonAffiliation',
  ],
  serviceCatalogue: ['mongo', 'qdrant'],
  modelCatalogue: [
    { name: 'default-chat-onprem', maxClassification: 'confidential' },
    { name: 'default-chat', maxClassification: 'internal' },
    { name: 'default-embed', maxClassification: 'internal' },
  ],
  unclassifiedModels: [],
  aiEnabled: true,
  quota: { maxCpu: 2, maxMemoryMi: 2048, maxServices: 3, aiMonthlyUsd: 100 },
}

const yaml = (extra = '') => `
manifest: 1
name: chem-lab-scheduler
blueprint: node-ts-mongo@2
runtime:
  port: 3000
${extra}`

function errorCodes(text: string, c: ValidationContext = ctx) {
  const r = validateSpec(text, c)
  return r.valid ? [] : r.errors.map((e) => e.code)
}

/**
 * The four quota checks all raise SPEC_QUOTA_EXCEEDED, so a test asserting only
 * the code cannot tell which of them fired — and three of the four turned out to
 * have no coverage at all behind one that did. Assert the path.
 */
function errorPaths(text: string, c: ValidationContext = ctx) {
  const r = validateSpec(text, c)
  return r.valid ? [] : r.errors.map((e) => e.path)
}

/** The validated spec's project AI budget, or a failure naming the codes. */
function validatedBudget(text: string, c: ValidationContext = ctx) {
  const r = validateSpec(text, c)
  if (!r.valid)
    throw new Error(`expected a valid spec, got ${r.errors.map((e) => e.code)}`)
  return r.spec.ai.budget.project_monthly_usd
}

describe('policy validation (§7)', () => {
  it('accepts a valid spec', () => {
    const r = validateSpec(yaml(), ctx)
    expect(r.valid).toBe(true)
  })

  it('rejects a name that differs from the project slug', () => {
    expect(errorCodes(yaml(), { ...ctx, projectSlug: 'something-else' })).toContain(
      'SPEC_NAME_SLUG_MISMATCH',
    )
  })

  it('rejects a service type outside the catalogue', () => {
    const text = yaml(`services:\n  - { type: postgres, version: "16", name: db }`)
    expect(errorCodes(text)).toContain('SPEC_SERVICE_TYPE_UNKNOWN')
  })

  it('rejects an attribute outside the whitelist, including uid', () => {
    const text = yaml(`auth:\n  provider: cwl\n  attributes: [uid]`)
    expect(errorCodes(text)).toContain('SPEC_ATTRIBUTE_NOT_WHITELISTED')
  })

  it('rejects a model outside the catalogue', () => {
    const text = yaml(`ai:\n  models: [gpt-9-turbo]`)
    expect(errorCodes(text)).toContain('SPEC_MODEL_UNKNOWN')
  })

  it('rejects an off-premise model for confidential data (D17)', () => {
    const text = yaml(
      `ai:\n  models: [default-chat]\ndata:\n  classification: confidential`,
    )
    expect(errorCodes(text)).toContain('SPEC_MODEL_CLASSIFICATION_TOO_LOW')
  })

  it('accepts an on-premise model for confidential data (D17)', () => {
    const text = yaml(
      `ai:\n  models: [default-chat-onprem]\n  budget:\n    project_monthly_usd: 10\ndata:\n  classification: confidential`,
    )
    expect(errorCodes(text)).toEqual([])
  })

  it('rejects CPU above the quota, on its own', () => {
    const text = yaml(`resources:\n  cpu: 8`)
    expect(errorCodes(text)).toContain('SPEC_QUOTA_EXCEEDED')
    expect(errorPaths(text)).toContain('resources.cpu')
  })

  it('rejects memory above the quota, on its own', () => {
    const text = yaml(`resources:\n  memory: 8Gi`)
    expect(errorCodes(text)).toContain('SPEC_QUOTA_EXCEEDED')
    expect(errorPaths(text)).toContain('resources.memory')
  })

  it('rejects an AI budget above the quota, on its own', () => {
    const text = yaml(`ai:\n  budget:\n    project_monthly_usd: 500`)
    expect(errorCodes(text)).toContain('SPEC_QUOTA_EXCEEDED')
    expect(errorPaths(text)).toContain('ai.budget.project_monthly_usd')
  })

  it('reports every quota dimension that is over, not just the first', () => {
    const text = yaml(
      `resources:\n  cpu: 8\n  memory: 8Gi\n` +
        `ai:\n  budget:\n    project_monthly_usd: 500\n` +
        `services:\n` +
        `  - { type: mongo, version: "7", name: a }\n` +
        `  - { type: mongo, version: "7", name: b }\n` +
        `  - { type: mongo, version: "7", name: c }\n` +
        `  - { type: mongo, version: "7", name: d }`,
    )
    expect(errorPaths(text).sort()).toEqual([
      'ai.budget.project_monthly_usd',
      'resources.cpu',
      'resources.memory',
      'services',
    ])
  })

  it('rejects more services than the quota allows', () => {
    const text = yaml(
      `services:\n` +
        `  - { type: mongo, version: "7", name: a }\n` +
        `  - { type: mongo, version: "7", name: b }\n` +
        `  - { type: mongo, version: "7", name: c }\n` +
        `  - { type: mongo, version: "7", name: d }`,
    )
    expect(errorCodes(text)).toContain('SPEC_QUOTA_EXCEEDED')
    expect(errorPaths(text)).toContain('services')
  })

  it('rejects attributes not registered with UBC IAM, for a production release (§9)', () => {
    const text = yaml(`auth:\n  provider: cwl\n  attributes: [ubcEduCwlPuid, sn]`)
    const codes = errorCodes(text, { ...ctx, registeredAttributes: ['ubcEduCwlPuid'] })
    expect(codes).toContain('SPEC_ATTRIBUTE_NOT_REGISTERED')
  })

  /**
   * §8's names are the platform's. `renderInjection` applies them AFTER the
   * app's own, so a declared one is silently inert — right for security (§12
   * makes application code untrusted input) and wrong for the person who wrote
   * it. This is where they are told.
   */
  it('rejects an env variable whose name collides with a platform one', () => {
    const text = yaml(`env:\n  - { name: PORT, value: '9000' }`)
    expect(errorCodes(text)).toContain('SPEC_ENV_NAME_RESERVED')
    expect(errorPaths(text)).toContain('env.0.name')
    const r = validateSpec(text, ctx)
    expect(r.valid).toBe(false)
    if (r.valid) return
    // The MESSAGE names the variable: "a reserved name" sends the reader back to
    // count list entries.
    expect(r.errors[0]?.message).toContain('PORT is set by the platform')
  })

  it('rejects a reserved name introduced by an environment override too', () => {
    const text = yaml(
      `environments:\n  staging:\n    env: [{ name: MONGODB_DB_NAME, value: mine }]`,
    )
    expect(errorCodes(text)).toContain('SPEC_ENV_NAME_RESERVED')
    expect(errorPaths(text)).toContain('environments.staging.env.0.name')
  })

  it('leaves an app’s own variables alone', () => {
    const text = yaml(`env:\n  - { name: COURSE_CODE, value: CHEM_121 }`)
    expect(errorCodes(text)).not.toContain('SPEC_ENV_NAME_RESERVED')
  })

  it('reports malformed YAML as an error rather than throwing', () => {
    const r = validateSpec('name: [unclosed', ctx)
    expect(r.valid).toBe(false)
    if (r.valid) return
    expect(r.errors[0]?.code).toBe('SPEC_YAML_PARSE_FAILED')
  })
})

describe('a control plane with AI switched off (P4b sitting 4, finding 38)', () => {
  const off: ValidationContext = { ...ctx, aiEnabled: false, modelCatalogue: [] }

  it('refuses declared models with SPEC_AI_DISABLED, and NOT as unknown models', () => {
    // The failure this code exists to replace: an empty catalogue reports each model
    // as SPEC_MODEL_UNKNOWN with "Available models: " — blaming the manifest for a
    // platform setting.
    const text = yaml(
      `ai:\n  models: [default-chat, default-embed]\n  budget:\n    project_monthly_usd: 10`,
    )
    expect(errorCodes(text, off)).toEqual(['SPEC_AI_DISABLED'])
    expect(errorPaths(text, off)).toEqual(['ai.models'])
  })

  it('names the platform setting in its hint', () => {
    const r = validateSpec(
      yaml(`ai:\n  models: [default-chat]\n  budget:\n    project_monthly_usd: 10`),
      off,
    )
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors[0]!.hint).toMatch(/MANIFEST_AI_ENABLED=0/)
  })

  it('leaves a spec with no models alone', () => {
    expect(validateSpec(yaml(), off).valid).toBe(true)
  })
})

describe('the project AI budget (P4b Task 7; §7 as amended 2026-09-14)', () => {
  it('fills an OMITTED budget with the project’s AI quota, on a manifest that declares a model', () => {
    // Rich's call. It was refused — SPEC_AI_BUDGET_REQUIRED — because `.default(0)`
    // made an omitted budget parse exactly like a written 0. The filled number is in
    // the VALIDATED spec, so the stored spec and every release frozen from it carry it.
    expect(validatedBudget(yaml(`ai:\n  models: [default-chat]`))).toBe(100)
  })

  it('still refuses a zero that is WRITTEN OUT — which LiteLLM reads as no budget at all', () => {
    // LiteLLM refuses every request against a max_budget of 0, so an app that declared
    // a model would deploy healthy and be told on its first question that its budget
    // was exhausted.
    const text = yaml(
      `ai:\n  models: [default-chat]\n  budget:\n    project_monthly_usd: 0\n    per_user_monthly_usd: 0`,
    )
    expect(errorCodes(text)).toEqual(['SPEC_AI_BUDGET_REQUIRED'])
    expect(errorPaths(text)).toEqual(['ai.budget.project_monthly_usd'])
  })

  it('refuses an omitted budget when the quota it defaults to is itself $0, and says to ask for one', () => {
    const noQuota: ValidationContext = {
      ...ctx,
      quota: { ...ctx.quota, aiMonthlyUsd: 0 },
    }
    const r = validateSpec(yaml(`ai:\n  models: [default-chat]`), noQuota)
    expect(r.valid).toBe(false)
    if (r.valid) return
    expect(r.errors.map((e) => e.code)).toEqual(['SPEC_AI_BUDGET_REQUIRED'])
    expect(r.errors[0]!.hint).toMatch(/administrator/)
  })

  it('keeps a written budget as written', () => {
    expect(
      validatedBudget(
        yaml(`ai:\n  models: [default-chat]\n  budget:\n    project_monthly_usd: 10`),
      ),
    ).toBe(10)
  })

  it('invents no budget for an app that declares no model', () => {
    // §7 defaults a budget for a manifest that DECLARES a model. An app with none is
    // never minted a key, so there is nothing for a number to mean.
    expect(validatedBudget(yaml())).toBeUndefined()
  })

  it('with AI switched off, an omitted budget is filled and only SPEC_AI_DISABLED fires', () => {
    const off: ValidationContext = { ...ctx, aiEnabled: false, modelCatalogue: [] }
    expect(errorCodes(yaml(`ai:\n  models: [default-chat]`), off)).toEqual([
      'SPEC_AI_DISABLED',
    ])
    // A written 0 is wrong either way, and both are reported.
    expect(
      errorCodes(
        yaml(`ai:\n  models: [default-chat]\n  budget:\n    project_monthly_usd: 0`),
        off,
      ),
    ).toEqual(['SPEC_AI_DISABLED', 'SPEC_AI_BUDGET_REQUIRED'])
  })
})

describe('an unclassified catalogue entry refuses only itself (§7 as amended 2026-09-14)', () => {
  // The catalogue as `ai/catalogue.ts` now reports it with `default-chat`'s
  // classification missing: excluded from the entries, and named.
  const withUnclassified: ValidationContext = {
    ...ctx,
    modelCatalogue: ctx.modelCatalogue.filter((m) => m.name !== 'default-chat'),
    unclassifiedModels: ['default-chat'],
  }
  const budgeted = (models: string) =>
    yaml(`ai:\n  models: [${models}]\n  budget:\n    project_monthly_usd: 10`)

  it('refuses a manifest that declares it with SPEC_MODEL_UNCLASSIFIED — not as an unknown model', () => {
    // Reported as unknown, an administrator's typo would read as the faculty member's.
    const r = validateSpec(budgeted('default-embed, default-chat'), withUnclassified)
    expect(r.valid).toBe(false)
    if (r.valid) return
    expect(r.errors.map((e) => e.code)).toEqual(['SPEC_MODEL_UNCLASSIFIED'])
    expect(r.errors[0]!.path).toBe('ai.models.1')
    expect(r.errors[0]!.hint).toMatch(/administrator/)
  })

  it('validates a manifest that declares another model, and one that declares none', () => {
    expect(errorCodes(budgeted('default-embed'), withUnclassified)).toEqual([])
    expect(validateSpec(yaml(), withUnclassified).valid).toBe(true)
  })
})
