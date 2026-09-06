import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { manifestSchema, type ManifestSpec } from '../spec/index.js'
import { descriptorSchema, checkBlueprintCompatibility, loadBlueprints } from './index.js'

const descriptor = descriptorSchema.parse({
  blueprint: 'fixture-node',
  major_version: 1,
  schema_versions: [1],
  runtime: {
    language: 'typescript',
    base_image:
      'node@sha256:0000000000000000000000000000000000000000000000000000000000000000',
    default_port: 3000,
    health_path: '/healthz',
    run_as_uid: 10001,
  },
  provides: { services: ['mongo'], auth_providers: ['none'], ai: false },
  defaults: { resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' } },
  injection: { contract: 'v1' },
  dockerfile: './Dockerfile.tmpl',
  knowledge_pack: './agents/',
})

const spec = (extra: Record<string, unknown> = {}): ManifestSpec =>
  manifestSchema.parse({
    manifest: 1,
    name: 'fixture-app',
    blueprint: 'fixture-node@1',
    runtime: { port: 3000 },
    ...extra,
  })

describe('blueprint descriptor (§25, D30)', () => {
  it('rejects a base image pinned by tag rather than digest (§12)', () => {
    const bad = {
      ...descriptor,
      runtime: { ...descriptor.runtime, base_image: 'node:22' },
    }
    expect(descriptorSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an unknown key, so a typo is never silently ignored', () => {
    expect(
      descriptorSchema.safeParse({ ...descriptor, knowledgePack: './agents/' }).success,
    ).toBe(false)
  })

  it('refuses a pinned_dependencies RANGE, not just a missing pin (C6, §16)', () => {
    const exact = { ...descriptor, pinned_dependencies: { mongodb: '6.12.0' } }
    expect(descriptorSchema.safeParse(exact).success).toBe(true)
    for (const range of ['^6.12.0', '~6.12.0', '6.x', '>=6.12.0', 'latest']) {
      const r = descriptorSchema.safeParse({
        ...descriptor,
        pinned_dependencies: { mongodb: range },
      })
      expect(r.success, `${range} must be refused`).toBe(false)
    }
  })

  it('refuses a default resource quantity the resolver cannot read', () => {
    const bad = (resources: Record<string, unknown>) =>
      descriptorSchema.safeParse({ ...descriptor, defaults: { resources } }).success
    expect(bad({ cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' })).toBe(true)
    expect(bad({ cpu: 0.5, memory: 'lots', pids: 256, disk: '2Gi' })).toBe(false)
    expect(bad({ cpu: 0.5, memory: '512Mi', pids: 256, disk: 'plenty' })).toBe(false)
  })
})

describe('checkBlueprintCompatibility (§25)', () => {
  it('accepts a compatible spec', () => {
    expect(checkBlueprintCompatibility(spec(), descriptor)).toEqual([])
  })

  it('rejects a service the blueprint cannot bind, listing what it can', () => {
    const errors = checkBlueprintCompatibility(
      spec({ services: [{ type: 'qdrant', version: '1.9', name: 'v' }] }),
      descriptor,
    )
    expect(errors[0]?.code).toBe('BLUEPRINT_SERVICE_UNSUPPORTED')
    expect(errors[0]?.message).toContain('qdrant')
    expect(errors[0]?.hint).toContain('mongo')
  })

  it('rejects an auth provider the blueprint does not support', () => {
    const errors = checkBlueprintCompatibility(
      spec({ auth: { provider: 'cwl', attributes: [] } }),
      descriptor,
    )
    expect(errors[0]?.code).toBe('BLUEPRINT_AUTH_UNSUPPORTED')
  })

  it('rejects AI use when the blueprint does not provide it', () => {
    const errors = checkBlueprintCompatibility(
      spec({ ai: { models: ['default-chat'] } }),
      descriptor,
    )
    expect(errors[0]?.code).toBe('BLUEPRINT_AI_UNSUPPORTED')
  })

  it('rejects a manifest schema version the blueprint does not understand', () => {
    const older = { ...descriptor, schema_versions: [2] }
    const errors = checkBlueprintCompatibility(spec(), older)
    expect(errors[0]?.code).toBe('BLUEPRINT_SCHEMA_VERSION_UNSUPPORTED')
  })
})

describe('blueprint registry', () => {
  it('loads the on-disk catalogue and resolves by name@major', async () => {
    const registry = await loadBlueprints(
      new URL('../../../../blueprints/', import.meta.url).pathname,
    )
    expect(registry.list().length).toBeGreaterThan(0)
    expect(registry.resolve('fixture-node@1')?.blueprint).toBe('fixture-node')
    expect(registry.resolve('fixture-node@9')).toBeUndefined()
    expect(registry.resolve('does-not-exist@1')).toBeUndefined()
  })

  it('pins its base image by digest at the LOCAL registry, so an offline build resolves', async () => {
    // S1: an offline build resolves FROM against the local registry, not the
    // daemon's cache. A Docker Hub reference here builds on this machine today and
    // fails the moment the network is off, which is C1's whole claim.
    const registry = await loadBlueprints(
      new URL('../../../../blueprints/', import.meta.url).pathname,
    )
    const base = registry.resolve('fixture-node@1')?.runtime.base_image ?? ''
    expect(base).toMatch(/^manifest-registry:5000\/base\//)
    expect(base).toMatch(/@sha256:[0-9a-f]{64}$/)
  })

  it("agrees with the skeleton's own package.json about what it installs (C6)", async () => {
    const registry = await loadBlueprints(
      new URL('../../../../blueprints/', import.meta.url).pathname,
    )
    const pinned = registry.resolve('fixture-node@1')?.pinned_dependencies ?? {}
    const pkg = JSON.parse(
      await readFile(
        new URL(
          '../../../../blueprints/fixture-node/skeleton/package.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { dependencies?: Record<string, string> }
    expect(pkg.dependencies).toEqual(pinned)
  })
})
