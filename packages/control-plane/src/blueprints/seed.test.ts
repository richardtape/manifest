import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { loadBlueprints } from './registry.js'
import { renderProjectSeed } from './seed.js'

const registry = await loadBlueprints(
  fileURLToPath(new URL('../../../../blueprints', import.meta.url)),
)

describe('a project’s first commit (§25, P5a Task 11)', () => {
  it('is the skeleton with the starter laid over it, and the starter wins where both have a file', () => {
    const seed = renderProjectSeed(registry, {
      blueprintRef: 'node-ts-mongo@1',
      slug: 'journey-app',
      starter: 'proof-app',
    })
    const skeleton = registry.skeleton('node-ts-mongo@1')!
    const starter = registry.starter('node-ts-mongo@1', 'proof-app')!
    expect(seed['auth/session.js']).toBe(skeleton['auth/session.js'])
    expect(seed['package-lock.json']).toBe(skeleton['package-lock.json'])
    expect(seed['public/index.html']).toBe(starter.files['public/index.html'])
    // Both carry a server.js; the starter's is the app.
    expect(skeleton['server.js']).toBeDefined()
    expect(seed['server.js']).toBe(starter.files['server.js'])
    expect(Object.keys(seed).sort()).toEqual(
      [...new Set([...Object.keys(skeleton), ...Object.keys(starter.files)])].sort(),
    )
  })

  it('renames the starter’s manifest to the project’s slug and changes nothing else in it', () => {
    const original = registry.starter('node-ts-mongo@1', 'proof-app')!.files[
      'manifest.yaml'
    ]!
    const seeded = renderProjectSeed(registry, {
      blueprintRef: 'node-ts-mongo@1',
      slug: 'journey-app',
      starter: 'proof-app',
    })['manifest.yaml']!
    expect(parse(seeded).name).toBe('journey-app')
    const comments = (t: string) => t.split('\n').filter((l) => l.trim().startsWith('#'))
    expect(comments(seeded)).toEqual(comments(original))
    // BYTE FOR BYTE apart from the name (P5a Task 1, [M4c+]): a re-stringified document keeps
    // every comment and still refolds the description and re-pads the flow sequences, which
    // the comment comparison above cannot see.
    expect(seeded).toBe(original.replace(/^name: .*$/m, 'name: journey-app'))
  })

  it('without a starter, is the skeleton and a minimal manifest named for the project', () => {
    const seed = renderProjectSeed(registry, {
      blueprintRef: 'fixture-node@1',
      slug: 'chem-labs',
    })
    expect(seed['server.js']).toBe(registry.skeleton('fixture-node@1')!['server.js'])
    expect(parse(seed['manifest.yaml']!)).toEqual({
      manifest: 1,
      name: 'chem-labs',
      blueprint: 'fixture-node@1',
      runtime: { port: 3000, health: '/healthz' },
    })
    expect(seed['src/index.js']).toBeUndefined()
  })

  it('refuses an unknown blueprint or starter by name', () => {
    expect(() =>
      renderProjectSeed(registry, { blueprintRef: 'nope@1', slug: 'x-x-x' }),
    ).toThrow(
      expect.objectContaining({
        code: 'SEED_BLUEPRINT_UNKNOWN',
        message: expect.stringContaining('nope@1'),
      }),
    )
    expect(() =>
      renderProjectSeed(registry, {
        blueprintRef: 'node-ts-mongo@1',
        slug: 'x-x-x',
        starter: 'nope',
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'SEED_STARTER_UNKNOWN',
        message: expect.stringContaining("'nope'"),
      }),
    )
  })
})
