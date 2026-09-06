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
      `ai:\n  models: [default-chat-onprem]\ndata:\n  classification: confidential`,
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

  it('reports malformed YAML as an error rather than throwing', () => {
    const r = validateSpec('name: [unclosed', ctx)
    expect(r.valid).toBe(false)
    if (r.valid) return
    expect(r.errors[0]?.code).toBe('SPEC_YAML_PARSE_FAILED')
  })
})
