import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { manifestSchema } from './schema.js'
import { resolveConfig } from './resolve.js'
import { validateSpec, type ValidationContext } from './index.js'

const yaml = `
manifest: 1
name: chem-labs
blueprint: fixture-node@1
runtime:
  port: 3000
  health: /healthz
resources:
  cpu: 0.5
  memory: 512Mi
  pids: 256
  disk: 2Gi
env:
  - { name: COURSE_CODE, value: CHEM_121 }
  - { name: LOG_LEVEL, value: info }
environments:
  staging:    { resources: { memory: 256Mi } }
  production: { resources: { memory: 1Gi }, env: [{ name: LOG_LEVEL, value: warn }] }
`

const spec = manifestSchema.parse(parse(yaml))

/** What Task 6's descriptor supplies. Deliberately different from the spec's values
 *  so a test cannot pass by reading the wrong layer. */
const DEFAULTS = { cpu: 0.25, memory: '128Mi', pids: 64, disk: '1Gi' }

describe('environment override resolution (§7)', () => {
  it('leaves an environment with no overrides untouched', () => {
    const resolved = resolveConfig(spec, 'sandbox', DEFAULTS)
    expect(resolved.resources.memory).toBe('512Mi')
    expect(resolved.resources.cpu).toBe(0.5)
    expect(resolved.env).toEqual([
      { name: 'COURSE_CODE', value: 'CHEM_121' },
      { name: 'LOG_LEVEL', value: 'info' },
    ])
  })

  it('overrides only the resource fields the override names', () => {
    const resolved = resolveConfig(spec, 'staging', DEFAULTS)
    expect(resolved.resources.memory).toBe('256Mi')
    expect(resolved.resources.cpu).toBe(0.5) // from the spec, untouched
    expect(resolved.resources.pids).toBe(256) // from the spec, untouched
  })

  // The layer that is easiest to get wrong: §7 says resource defaults are
  // "inherited from blueprint", and Task 2 leaves every resource field optional
  // precisely so this layer has something to fill in.
  it('falls back to the blueprint defaults for fields the spec omits', () => {
    const sparse = manifestSchema.parse({
      manifest: 1,
      name: 'chem-labs',
      blueprint: 'fixture-node@1',
      runtime: { port: 3000 },
      resources: { memory: '512Mi' },
    })
    const resolved = resolveConfig(sparse, 'sandbox', DEFAULTS)
    expect(resolved.resources).toEqual({
      cpu: 0.25, // blueprint
      memory: '512Mi', // spec
      pids: 64, // blueprint
      disk: '1Gi', // blueprint
    })
  })

  it('lets an environment override beat both the spec and the blueprint', () => {
    const resolved = resolveConfig(spec, 'production', DEFAULTS)
    expect(resolved.resources.memory).toBe('1Gi')
  })

  it('replaces an env var by name and keeps the rest', () => {
    const resolved = resolveConfig(spec, 'production', DEFAULTS)
    expect(resolved.env).toEqual([
      { name: 'COURSE_CODE', value: 'CHEM_121' },
      { name: 'LOG_LEVEL', value: 'warn' },
    ])
  })

  it('appends an env var the base spec does not declare', () => {
    const withNew = manifestSchema.parse({
      ...parse(yaml),
      environments: { staging: { env: [{ name: 'STAGING_ONLY', value: 'yes' }] } },
    })
    const resolved = resolveConfig(withNew, 'staging', DEFAULTS)
    expect(resolved.env.map((e) => e.name)).toEqual([
      'COURSE_CODE',
      'LOG_LEVEL',
      'STAGING_ONLY',
    ])
  })

  it('does not mutate the spec it was given', () => {
    const before = JSON.stringify(spec)
    resolveConfig(spec, 'production', DEFAULTS)
    expect(JSON.stringify(spec)).toBe(before)
  })

  it('carries the fields an override may never change straight through', () => {
    const staging = resolveConfig(spec, 'staging', DEFAULTS)
    const production = resolveConfig(spec, 'production', DEFAULTS)
    expect(staging.port).toBe(production.port)
    expect(staging.health).toBe(production.health)
    expect(staging.services).toEqual(production.services)
    expect(staging.egressAllow).toEqual(production.egressAllow)
  })
})

/**
 * THE `ai` BLOCK A RELEASE FREEZES — and the shape `deployRelease` reads to mint a key.
 *
 * P4b's Task 9 reads `resolved.ai.models` and `resolved.ai.budget.project_monthly_usd`
 * from here, and every test in `releases.test.ts` builds its resolved config BY HAND.
 * So nothing else would notice this function renaming the budget — to the camelCase the
 * plan first proposed, say — while every deploy minted a key with no budget: P3 Session
 * 5's shape, a value the tests construct correctly and the running system derives
 * wrongly. §13 freezes resolved configs as JSON, so the snake_case is also what every
 * release since P4a Task 10 already holds (P4b pre-flight 63).
 */
describe('the ai block a release freezes (§13; P4b Task 9 mints from it)', () => {
  const ctx: ValidationContext = {
    projectSlug: 'chem-labs',
    attributeWhitelist: ['ubcEduCwlPuid', 'mail'],
    serviceCatalogue: ['mongo', 'qdrant'],
    modelCatalogue: [
      { name: 'default-chat', maxClassification: 'internal' },
      { name: 'default-embed', maxClassification: 'internal' },
    ],
    unclassifiedModels: [],
    aiEnabled: true,
    quota: { maxCpu: 2, maxMemoryMi: 2048, maxServices: 3, aiMonthlyUsd: 40 },
  }
  // No budget written: §7 as amended fills it with the quota at validation.
  const aiYaml = `${yaml}ai:\n  models: [default-chat, default-embed]\n`

  function validated() {
    const result = validateSpec(aiYaml, ctx)
    if (!result.valid)
      throw new Error(`expected a valid spec: ${JSON.stringify(result.errors)}`)
    return result.spec
  }

  it('carries the models and the SNAKE_CASE budget into every environment, an omitted budget filled from the quota', () => {
    const validatedSpec = validated()
    for (const kind of ['sandbox', 'staging', 'production'] as const) {
      expect(resolveConfig(validatedSpec, kind, DEFAULTS).ai, kind).toEqual({
        models: ['default-chat', 'default-embed'],
        budget: { project_monthly_usd: 40, per_user_monthly_usd: 0 },
      })
    }
  })

  it('is a COPY — editing the spec afterwards cannot change what a release froze', () => {
    const validatedSpec = validated()
    const resolved = resolveConfig(validatedSpec, 'staging', DEFAULTS)
    validatedSpec.ai.models.push('default-chat-onprem')
    validatedSpec.ai.budget.project_monthly_usd = 1
    expect(resolved.ai.models).toEqual(['default-chat', 'default-embed'])
    expect(resolved.ai.budget.project_monthly_usd).toBe(40)
  })
})
