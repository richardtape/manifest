import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { manifestSchema } from './schema.js'
import { resolveConfig } from './resolve.js'

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
