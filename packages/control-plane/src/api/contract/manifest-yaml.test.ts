import { fileURLToPath } from 'node:url'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  loadBlueprints,
  renderProjectSeed,
  type BlueprintRegistry,
} from '../../blueprints/index.js'
import { manifestSchema } from '../../spec/index.js'
import { manifestYamlSchema, openApiDocument } from './document.js'
import { ROUTE_DEFINITIONS } from '../routes/index.js'

/**
 * THE PUBLISHED `ManifestYaml` AGREES WITH §7'S OWN SCHEMA (the authoring API plan's Task 9,
 * Step 4, and Task 1's `[M7]`). The component is documentation for the file, emitted from the
 * zod schema the platform validates with — and `[M7]` measured the emitter dropping the one
 * cross-field rule silently (7 of 9 cases agreed; the two `env` cases did not). So the rule is
 * restated by hand in `document.ts`, and this holds the result to zod's verdict over a corpus:
 * every starter's manifest, each blueprint's seed, and a mutation per rule, each through
 * `manifestSchema.safeParse` AND Ajv 2020 over the published component, REFUSING ANY
 * DISAGREEMENT. Each case also states the verdict it expects, so agreement cannot be vacuous —
 * a schema that accepted everything would agree with zod on every valid case and be refused
 * on the first invalid one.
 *
 * It checks §7's SCHEMA, never its policy (a slug that matches the project, a model in the
 * catalogue, a quota): those live in `spec/policy.ts`, and the component's description says so.
 */

const BLUEPRINTS_ROOT = fileURLToPath(
  new URL('../../../../../blueprints', import.meta.url),
)

type Manifest = Record<string, unknown>

let registry: BlueprintRegistry
let seeds: [string, Manifest][]
let starters: [string, Manifest][]

beforeAll(async () => {
  registry = await loadBlueprints(BLUEPRINTS_ROOT)
  seeds = registry.list().map((d) => {
    const ref = `${d.blueprint}@${d.major_version}`
    const files = renderProjectSeed(registry, { blueprintRef: ref, slug: 'corpus-app' })
    return [`${ref}'s seed`, parse(files['manifest.yaml']!) as Manifest]
  })
  starters = registry.list().flatMap((d) => {
    const ref = `${d.blueprint}@${d.major_version}`
    return (d.starters ?? []).map((s): [string, Manifest] => {
      const files = renderProjectSeed(registry, {
        blueprintRef: ref,
        slug: 'corpus-app',
        starter: s.name,
      })
      return [`${ref}'s starter ${s.name}`, parse(files['manifest.yaml']!) as Manifest]
    })
  })
})

/** A copy of `base` with `edit` applied — every mutation starts from a valid manifest. */
function mutate(base: Manifest, edit: (m: Manifest) => void): Manifest {
  const copy = structuredClone(base)
  edit(copy)
  return copy
}

const env = (entries: unknown[]) => (m: Manifest) => {
  m.env = entries
}

/** [name, edit, the verdict it should have] — one per rule §7's schema states. */
const MUTATIONS: [string, (m: Manifest) => void, boolean][] = [
  ['an unknown top-level key', (m) => void (m.extra = 1), false],
  [
    'a runtime.build block (D13)',
    (m) => void ((m.runtime as Manifest).build = {}),
    false,
  ],
  ['manifest: 2', (m) => void (m.manifest = 2), false],
  ['a name that is not a slug', (m) => void (m.name = 'Corpus_App'), false],
  ['a blueprint with no major', (m) => void (m.blueprint = 'node-ts-mongo'), false],
  ['port 0', (m) => void ((m.runtime as Manifest).port = 0), false],
  ['port 65536', (m) => void ((m.runtime as Manifest).port = 65536), false],
  [
    'a health URL, not a path',
    (m) => void ((m.runtime as Manifest).health = 'https://x/h'),
    false,
  ],
  ['memory as 512MB', (m) => void (m.resources = { memory: '512MB' }), false],
  ['negative cpu', (m) => void (m.resources = { cpu: -1 }), false],
  [
    'every resource, well formed',
    (m) => void (m.resources = { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' }),
    true,
  ],
  [
    'a service with no version',
    (m) => void (m.services = [{ type: 'mongo', name: 'db' }]),
    false,
  ],
  [
    'a service named in capitals',
    (m) => void (m.services = [{ type: 'mongo', version: '7', name: 'DB' }]),
    false,
  ],
  [
    'a service, well formed',
    (m) => void (m.services = [{ type: 'mongo', version: '7', name: 'db' }]),
    true,
  ],
  ['auth.provider saml', (m) => void (m.auth = { provider: 'saml' }), false],
  [
    'an auth callback URL',
    (m) => void (m.auth = { provider: 'cwl', callback: 'https://x/cb' }),
    false,
  ],
  [
    'cwl with attributes',
    (m) => void (m.auth = { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] }),
    true,
  ],
  // THE RESTATED RULE — the two cases `[M7]` measured the emitter getting wrong, and their neighbours.
  ['an env entry with a value', env([{ name: 'COURSE', value: 'CHEM_121' }]), true],
  ['an env entry that is secret', env([{ name: 'SIS_API_KEY', secret: true }]), true],
  [
    'an env entry with a value AND secret: true',
    env([{ name: 'K', value: 'v', secret: true }]),
    false,
  ],
  ['an env entry with neither', env([{ name: 'K' }]), false],
  [
    'an env entry with a value and secret: false',
    env([{ name: 'K', value: 'v', secret: false }]),
    true,
  ],
  ['an env entry with secret: false alone', env([{ name: 'K', secret: false }]), false],
  ['an env name in lower case', env([{ name: 'course', value: 'x' }]), false],
  [
    'a staging env entry with both',
    (m) =>
      void (m.environments = {
        staging: { env: [{ name: 'K', value: 'v', secret: true }] },
      }),
    false,
  ],
  [
    'a production env entry that is secret',
    (m) => void (m.environments = { production: { env: [{ name: 'K', secret: true }] } }),
    true,
  ],
  ['a sandbox override', (m) => void (m.environments = { sandbox: {} }), false],
  ['a non-empty reserved block', (m) => void (m.integrations = [{}]), false],
  [
    'an unknown classification',
    (m) => void (m.data = { classification: 'secret' }),
    false,
  ],
  [
    'a negative AI budget',
    (m) =>
      void (m.ai = { models: ['default-chat'], budget: { project_monthly_usd: -1 } }),
    false,
  ],
  [
    'a description of 501 characters',
    (m) => void (m.description = 'x'.repeat(501)),
    false,
  ],
  ['egress hostnames', (m) => void (m.egress = { allow: ['api.ubc.ca'] }), true],
]

describe('the published ManifestYaml agrees with §7’s own schema ([M7])', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  const validate = ajv.compile(manifestYamlSchema())

  const agree = (name: string, manifest: Manifest, expected: boolean) => {
    const zod = manifestSchema.safeParse(manifest).success
    const json = validate(manifest) === true
    expect({ name, zod, json }).toEqual({ name, zod: expected, json: expected })
  }

  it('accepts every starter’s manifest and every blueprint’s seed, as zod does', () => {
    expect(seeds.length).toBeGreaterThan(0)
    expect(starters.length).toBeGreaterThan(0)
    for (const [name, manifest] of [...seeds, ...starters]) agree(name, manifest, true)
  })

  it('gives every mutation zod’s verdict — the env rule restated included', () => {
    const [, base] = seeds[0]!
    for (const [name, edit, expected] of MUTATIONS)
      agree(name, mutate(base, edit), expected)
  })

  it('is the component the document publishes, described, with no $schema of its own', () => {
    const doc = openApiDocument(ROUTE_DEFINITIONS) as {
      components: { schemas: Record<string, Record<string, unknown>> }
    }
    const published = doc.components.schemas.ManifestYaml!
    expect(published).toEqual(manifestYamlSchema())
    expect(published.$schema).toBeUndefined()
    expect(published.description).toMatch(/DOCUMENTATION FOR THE FILE/)
  })
})
