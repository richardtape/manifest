import { createHash } from 'node:crypto'
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import {
  INJECTION_CONTRACT_VERSION,
  manifestSchema,
  type ManifestSpec,
} from '../spec/index.js'
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

/**
 * §25's real blueprint — the one faculty applications are generated from. §20
 * calls a blueprint "a security multiplier": whatever is in it is replicated
 * into every application, so a defect here is a defect in all of them.
 */
describe('node-ts-mongo@1 (P4a Task 12)', () => {
  const load = () =>
    loadBlueprints(new URL('../../../../blueprints/', import.meta.url).pathname)
  const dirOf = (ref: string) => async () => (await load()).pathOf(ref)!

  it('resolves node-ts-mongo@1 and it supports cwl', async () => {
    const d = (await load()).resolve('node-ts-mongo@1')
    expect(d?.provides.auth_providers).toContain('cwl')
    expect(d?.provides.services).toContain('mongo')
    expect(d?.injection.contract).toBe(INJECTION_CONTRACT_VERSION)
  })

  it('pins every app-side library exactly (C6, D30)', async () => {
    const d = (await load()).resolve('node-ts-mongo@1')!
    expect(d.pinned_dependencies).toMatchObject({
      'passport-ubcshib': '0.1.6',
      passport: '0.7.0',
      express: expect.stringMatching(/^\d+\.\d+\.\d+$/) as unknown as string,
      mongodb: expect.stringMatching(/^\d+\.\d+\.\d+$/) as unknown as string,
    })
  })

  it('agrees with its own skeleton package.json', async () => {
    // The descriptor and the lockfile drifting apart is how §16's drift test
    // ends up asserting against a version nothing installs.
    const d = (await load()).resolve('node-ts-mongo@1')!
    const pkg = JSON.parse(
      await readFile(
        join(await dirOf('node-ts-mongo@1')(), 'skeleton/package.json'),
        'utf8',
      ),
    ) as { dependencies?: Record<string, string> }
    expect(pkg.dependencies).toEqual(d.pinned_dependencies)
  })
})

/** Every `.js` file under a directory, recursively — `ai/` and `auth/` included. */
async function sourcesUnder(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await sourcesUnder(full)))
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

/** The toolkit's chat entry points: every one of them sends a `user` to LiteLLM. */
const CHAT_METHODS = new Set([
  'sendMessage',
  'sendConversation',
  'sendStructuredConversation',
  'streamConversation',
])

/** Whether any object-literal argument of `call` has `key` set to a value `ok` accepts. */
function hasOption(
  call: ts.CallExpression,
  key: string,
  ok: (value: ts.Expression) => boolean,
): boolean {
  return call.arguments.some(
    (arg) =>
      ts.isObjectLiteralExpression(arg) &&
      arg.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
          property.name.text === key &&
          ok(property.initializer),
      ),
  )
}

/**
 * P4b Task 10: the AI half. §20's security multiplier again — S3's two AI findings
 * are both SILENT, so they are closed once, in the blueprint's code, rather than left
 * as knowledge-pack advice. `ai-component.test.ts` runs that code against a gateway;
 * this file holds the descriptor and the SOURCE to it.
 */
describe("node-ts-mongo@1's AI half (P4b Task 10)", () => {
  const BLUEPRINTS = new URL('../../../../blueprints/', import.meta.url).pathname

  it('supports ai, and pins the toolkit to the version §16’s AI-path tier runs', async () => {
    const d = (await loadBlueprints(BLUEPRINTS)).resolve('node-ts-mongo@1')!
    // Flipped from false by P4b. ADDITIVE (P4a Decision 12): it permits more, so no
    // app breaks and it is not a major-version bump.
    expect(d.provides.ai).toBe(true)
    // C6/D30: exact, never a range — a caret would let the contract drift under the
    // test that exists to catch drift. `descriptorSchema` refuses ranges already.
    expect(d.pinned_dependencies).toMatchObject({ 'ubc-genai-toolkit-llm': '0.7.0' })

    // THE OTHER SIDE of a comparison Task 3 could only make one-sidedly, because the
    // blueprint had no AI half then. §16's AI-path tier and `ai-component.test.ts`
    // both run the control plane's devDependency; if it and the blueprint's pin
    // diverge, both assert the behaviour of a version no application installs.
    const installed = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { devDependencies: Record<string, string> }
    expect(installed.devDependencies['ubc-genai-toolkit-llm']).toBe(
      d.pinned_dependencies?.['ubc-genai-toolkit-llm'],
    )
  })

  it('accepts a manifest that declares models — the check the build route runs', async () => {
    // `checkBlueprintCompatibility` is called from `api/routes/delivery.ts`, and until
    // this task it refused `ai.models` for BOTH blueprints (P4b pre-flight 69): no app
    // declaring a model could be built through the route at all.
    const registry = await loadBlueprints(BLUEPRINTS)
    const declaring = (blueprint: string) =>
      manifestSchema.parse({
        manifest: 1,
        name: 'chem-labs',
        blueprint,
        runtime: { port: 3000 },
        services: [{ type: 'mongo', version: '7', name: 'db' }],
        ai: { models: ['default-chat', 'default-embed'] },
      })
    expect(
      checkBlueprintCompatibility(
        declaring('node-ts-mongo@1'),
        registry.resolve('node-ts-mongo@1')!,
      ),
    ).toEqual([])
    // And the flip is per blueprint: P2's fixture still has no AI half.
    expect(
      checkBlueprintCompatibility(
        declaring('fixture-node@1'),
        registry.resolve('fixture-node@1')!,
      ).map((e) => e.code),
    ).toEqual(['BLUEPRINT_AI_UNSUPPORTED'])
  })

  it('every toolkit call in the skeleton carries its obligation: floats and the namespaced user on embed, the namespaced user on chat', async () => {
    /**
     * Read as SOURCE, parsed rather than grepped. S3's finding is that the WRONG call
     * SUCCEEDS — 192 near-zero values instead of 768, no error — so a behavioural test
     * catches the call it happens to make, and this catches the one somebody adds next
     * year, in any file.
     *
     * PARSED, because the plan's regex form (count `.embed(`, count
     * `encoding_format: 'float'`, compare) is satisfied by a COMMENT: one call without
     * the option plus a comment quoting it gives two and two. Measured while writing
     * this. The parse looks at each call's own arguments, so a comment is not a call
     * and an option on the wrong call does not count.
     *
     * A property call only — `.embed(`, `.sendMessage(` — which is how the toolkit is
     * reached. The blueprint's own `embed(texts, puid)` is a plain call and is not the SDK.
     */
    const skeleton = join(BLUEPRINTS, 'node-ts-mongo/skeleton')
    const embeds: string[] = []
    const chats: string[] = []
    const broken: string[] = []
    for (const file of await sourcesUnder(skeleton)) {
      const source = ts.createSourceFile(
        file,
        await readFile(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      )
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name.text
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
          const where = `${relative(skeleton, file)}:${line} .${method}()`
          // S3 Evidence 6: the `user` must be §10's namespaced id, never a PUID or a bare
          // hash of one — so the value must be a call to `endUserId`, written in place.
          const attributed = (v: ts.Expression): boolean =>
            ts.isCallExpression(v) &&
            ts.isIdentifier(v.expression) &&
            v.expression.text === 'endUserId'
          if (method === 'embed') {
            embeds.push(where)
            if (
              !hasOption(
                node,
                'encoding_format',
                (v) => ts.isStringLiteral(v) && v.text === 'float',
              )
            ) {
              broken.push(`${where} without encoding_format: 'float'`)
            }
            // An embedding made for a person is spend on their behalf. `embed(texts)`
            // sent no `user` until P4b sitting 10, and LiteLLM recorded each one with
            // an empty end_user.
            if (!hasOption(node, 'user', attributed)) {
              broken.push(`${where} without user: endUserId(…)`)
            }
          }
          if (CHAT_METHODS.has(method)) {
            chats.push(where)
            if (!hasOption(node, 'user', attributed)) {
              broken.push(`${where} without user: endUserId(…)`)
            }
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    // Both lists non-empty, or a skeleton with no AI component would pass vacuously.
    expect(embeds.length, 'the skeleton makes no embed() call').toBeGreaterThan(0)
    expect(chats.length, 'the skeleton makes no chat call').toBeGreaterThan(0)
    expect(broken).toEqual([])
  })
})

const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))

/** Throwaway copies of the blueprints root, removed after each test. */
const copies: string[] = []
afterEach(async () => {
  await Promise.all(
    copies.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

/** A copy of the blueprints root, so a broken starter never touches the real one. */
async function blueprintsCopy(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mf-blueprints-'))
  copies.push(dir)
  await cp(BLUEPRINTS_ROOT, dir, {
    recursive: true,
    filter: (src) => !src.includes('node_modules'),
  })
  return dir
}

/** Rewrites one file in a copy, refusing a pattern that matches nothing (ORIENTATION §4). */
async function edit(path: string, from: string, to: string): Promise<void> {
  const text = await readFile(path, 'utf8')
  expect(
    text.split(from).length - 1,
    `'${from}' must occur exactly once in ${path}`,
  ).toBe(1)
  await writeFile(path, text.replace(from, to))
}

describe('starters and the knowledge pack, read at load (§25, D25 — P5a Task 10)', () => {
  it('offers node-ts-mongo@1’s proof-app starter, laid over a skeleton that has the auth component', async () => {
    const registry = await loadBlueprints(BLUEPRINTS_ROOT)
    const starter = registry.starter('node-ts-mongo@1', 'proof-app')
    expect(starter?.summary).toContain('CWL sign-in')
    expect(Object.keys(starter!.files)).toEqual(
      expect.arrayContaining(['manifest.yaml', 'server.js', 'public/index.html']),
    )
    expect(Object.keys(registry.skeleton('node-ts-mongo@1')!)).toEqual(
      expect.arrayContaining([
        'server.js',
        'package.json',
        'package-lock.json',
        'auth/session.js',
      ]),
    )
    expect(registry.starter('node-ts-mongo@1', 'no-such-starter')).toBeUndefined()
    expect(registry.starter('fixture-node@1', 'proof-app')).toBeUndefined()
  })

  it('serves the knowledge pack with a digest a client can check', async () => {
    const pack = (await loadBlueprints(BLUEPRINTS_ROOT)).knowledgePack('node-ts-mongo@1')!
    const agents = pack.find((f) => f.path === 'AGENTS.md')!
    expect(agents.mediaType).toBe('text/markdown')
    expect(agents.content).toContain('manifest.yaml')
    expect(agents.sha256).toBe(createHash('sha256').update(agents.content).digest('hex'))
  })

  it('refuses to load a starter whose manifest.yaml is not a valid manifest', async () => {
    const root = await blueprintsCopy()
    await edit(
      join(root, 'node-ts-mongo/starters/proof-app/manifest.yaml'),
      'manifest: 1',
      'manifest: 7',
    )
    await expect(loadBlueprints(root)).rejects.toMatchObject({
      code: 'BLUEPRINT_STARTER_INVALID',
      message: expect.stringContaining('is not a valid manifest: manifest'),
    })
  })

  it('refuses to load a starter the blueprint cannot deliver', async () => {
    // §7's schema accepts any service type, so this refusal is the COMPATIBILITY check's —
    // named by its message, because both refusals share one code.
    const root = await blueprintsCopy()
    await edit(
      join(root, 'node-ts-mongo/starters/proof-app/manifest.yaml'),
      'type: mongo',
      'type: postgres',
    )
    await expect(loadBlueprints(root)).rejects.toMatchObject({
      code: 'BLUEPRINT_STARTER_INVALID',
      message: expect.stringContaining('cannot bind service type "postgres"'),
    })
  })

  it('refuses a starter whose manifest pins a different blueprint from the one offering it', async () => {
    const root = await blueprintsCopy()
    await edit(
      join(root, 'node-ts-mongo/starters/proof-app/manifest.yaml'),
      'blueprint: node-ts-mongo@1',
      'blueprint: fixture-node@1',
    )
    await expect(loadBlueprints(root)).rejects.toMatchObject({
      code: 'BLUEPRINT_STARTER_INVALID',
      message: expect.stringContaining('pins fixture-node@1'),
    })
  })

  /**
   * TWO CASES, one per refusal (P5a sitting 7). A PNG's header is both — `89` is not a
   * UTF-8 lead byte and it carries a NUL — so with it alone either check could be deleted
   * and the test would stay green: measured, the NUL check removed, 25 of 25 passed.
   */
  it.each([
    ['valid UTF-8 carrying a NUL', Buffer.from('GIF89a\u0000\u0000', 'utf8')],
    ['no NUL, but not UTF-8 (Latin-1 é)', Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a])],
  ])('refuses a file in a starter that is not text: %s', async (_, bytes) => {
    const root = await blueprintsCopy()
    await writeFile(join(root, 'node-ts-mongo/starters/proof-app/public/logo.gif'), bytes)
    await expect(loadBlueprints(root)).rejects.toMatchObject({
      code: 'BLUEPRINT_TREE_NOT_TEXT',
      message: expect.stringContaining('public/logo.gif'),
    })
  })

  it('refuses a starter whose path is not ./starters/<its name>/', async () => {
    const root = await blueprintsCopy()
    await edit(
      join(root, 'node-ts-mongo/blueprint.yaml'),
      'path: ./starters/proof-app/',
      'path: ./starters/other/',
    )
    await expect(loadBlueprints(root)).rejects.toMatchObject({
      code: 'BLUEPRINT_STARTER_PATH',
    })
  })
})
