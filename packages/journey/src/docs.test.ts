import { access, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import * as contract from '@manifest/contract'
import { describe, expect, it } from 'vitest'
import { DOCS_DIR, generateDocs, pathOf } from './docs-write.js'

const DOCUMENT = new URL('../../contract/openapi.json', import.meta.url)

interface Names {
  operations: Set<string>
  codes: Set<string>
  events: Set<string>
  /** manifest.yaml's field paths — `ai.models` is a field, and `ai.key_rotated` an event. */
  fields: Set<string>
}

type Schema = { properties?: Record<string, Schema>; items?: Schema }

function pathsOf(schema: Schema, prefix: string, out: Set<string>): Set<string> {
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    const path = prefix === '' ? name : `${prefix}.${name}`
    out.add(path)
    pathsOf(child, path, out)
    if (child.items !== undefined) pathsOf(child.items, path, out)
  }
  return out
}

async function namesInTheDocument(): Promise<Names> {
  const document = JSON.parse(await readFile(DOCUMENT, 'utf8')) as {
    paths: Record<
      string,
      Record<
        string,
        { operationId?: string; 'x-manifest-event-types'?: { type: string }[] }
      >
    >
    'x-manifest-errors': Record<string, unknown>
    'x-manifest-spec-errors': Record<string, unknown>
    components: { schemas: { ManifestYaml: Schema } }
  }
  const operations = new Set<string>()
  const events = new Set<string>()
  for (const item of Object.values(document.paths))
    for (const op of Object.values(item)) {
      if (typeof op?.operationId === 'string') operations.add(op.operationId)
      for (const e of op?.['x-manifest-event-types'] ?? []) events.add(e.type)
    }
  return {
    operations,
    codes: new Set([
      ...Object.keys(document['x-manifest-errors']),
      ...Object.keys(document['x-manifest-spec-errors']),
    ]),
    events,
    fields: pathsOf(document.components.schemas.ManifestYaml, '', new Set()),
  }
}

/** A page's prose: its fenced code (the inlined examples, which `tsc` checks) removed. */
const prose = (markdown: string): string => markdown.replace(/```[\s\S]*?```/g, '')

/**
 * THE NAMES A PAGE USES, CHECKED AGAINST THE DOCUMENT (Review Focus 5): a guide that names an
 * operation, an error code or an event type the API does not have is red, naming the page and
 * the name. What counts as each is decided by its SHAPE and the document's own vocabulary — a
 * camelCase name led by a verb an operationId begins with; an UPPER_SNAKE name led by a word a
 * code begins with; a dotted name led by a word an event type begins with — so a field name
 * (`baseCommit`), an environment variable (`SIS_API_KEY`) and a file (`manifest.yaml`) are not
 * mistaken for one. The client's own exports are names too (`createManifestClient`).
 */
function unknownNames(markdown: string, names: Names): string[] {
  const verbs = new Set([...names.operations].map((o) => /^[a-z]+/.exec(o)![0]))
  const codeWords = new Set([...names.codes].map((c) => c.split('_')[0]!))
  const eventWords = new Set([...names.events].map((e) => e.split('.')[0]!))
  const clientNames = new Set(Object.keys(contract))
  const unknown: string[] = []
  for (const m of prose(markdown).matchAll(/`([^`\s]+)`/g)) {
    const name = m[1]!
    const lead = /^[a-z]+/.exec(name)?.[0]
    if (/^[a-z]+[A-Z][A-Za-z]*$/.test(name) && lead !== undefined && verbs.has(lead)) {
      if (!names.operations.has(name) && !clientNames.has(name)) unknown.push(name)
    } else if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$|^[A-Z]{4,}$/.test(name)) {
      if (codeWords.has(name.split('_')[0]!) && !names.codes.has(name)) unknown.push(name)
    } else if (
      /^[a-z_]+(\.[a-z_]+)+$/.test(name) &&
      eventWords.has(name.split('.')[0]!) &&
      !names.fields.has(name)
    ) {
      if (!names.events.has(name)) unknown.push(name)
    }
  }
  return [...new Set(unknown)]
}

/** Every relative link's target, `#anchor` cut. */
function relativeLinks(markdown: string): string[] {
  return [...prose(markdown).matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1]!)
    .filter((t) => !/^([a-z]+:|#|\/)/.test(t))
    .map((t) => t.split('#')[0]!)
}

/**
 * Task 9's rule for public text: nothing a reader outside the team cannot resolve — the faculty
 * front-end's findings (`FE-n`) and the spec's actions included.
 */
const INTERNAL =
  /\b(P[1-6][abc]?|sitting|Task \d+|Decision \d+|Rich|Spec action \d+)\b|the D5 plan|\bR[1-9]\b|\bFE-\d+\b/

describe('the guides (Decisions 16 and 19)', () => {
  it('are exactly what `pnpm docs:write` writes — every page, the reference and llms.txt', async () => {
    const generated = await generateDocs()
    expect(generated.size).toBeGreaterThan(10)
    const drifted: string[] = []
    for (const [key, text] of generated) {
      const committed = await readFile(pathOf(key), 'utf8').catch(() => undefined)
      if (committed !== text) drifted.push(key)
    }
    expect(drifted, 'run `pnpm docs:write` and commit what it writes').toEqual([])
  })

  it('name only operations, error codes and event types the API has', async () => {
    const names = await namesInTheDocument()
    const generated = await generateDocs()
    const found: string[] = []
    for (const [key, text] of generated) {
      if (!key.endsWith('.md')) continue
      for (const name of unknownNames(text, names)) found.push(`${key}: ${name}`)
    }
    expect(found).toEqual([])
  })

  it('tell a name the API lacks from a field, a variable and a file (the rule’s own cases)', async () => {
    const names = await namesInTheDocument()
    expect(
      unknownNames(
        'Call `createCommit` with `baseCommit`; a `409 SOURCE_CONFLICT`; set `SIS_API_KEY`; edit `manifest.yaml` and its `ai.models`; watch `build.succeeded`; use `createManifestClient`.',
        names,
      ),
    ).toEqual([])
    expect(
      unknownNames(
        'Call `createCommits`; a `SOURCE_CONFLICTS`; watch `build.finished`; and `deploy`.',
        names,
      ),
    ).toEqual(['createCommits', 'SOURCE_CONFLICTS', 'build.finished'])
  })

  it('link only to files that exist', async () => {
    const generated = await generateDocs()
    const broken: string[] = []
    for (const [key, text] of generated) {
      if (!key.endsWith('.md')) continue
      for (const target of relativeLinks(text)) {
        const file = resolve(dirname(join(DOCS_DIR, key)), target)
        await access(file).catch(() => broken.push(`${key}: ${target}`))
      }
    }
    expect(broken).toEqual([])
  })

  it('never show a front-end’s code handing the person’s session to a client — the page’s own rule', async () => {
    // *Building a front-end* says a front-end's server may use the person's session for `getMe`
    // and nothing else, so no code on that page may build a client from the cookie's VALUE: what
    // acts as the person there is the page's own client, whose cookie the browser sends itself.
    const page = (await generateDocs()).get('frontend.md')!
    expect(page).toBeDefined()
    expect(page.match(/createManifestClient\(\{[^})]*\bsession\b/g) ?? []).toEqual([])
  })

  it('name the capability a token needs for what they show an agent doing with one', async () => {
    // `startAgentSession` asserts `agent:session` and `getInstanceOutput` `output:read`, and no
    // published description names either — so a page showing an agent either must, or a token
    // minted as it says is refused `403 FORBIDDEN` at the first call.
    const generated = await generateDocs()
    const missing = ['frontend.md', 'agents.md'].flatMap((page) =>
      ['agent:session', 'output:read']
        .filter((capability) => !generated.get(page)!.includes(`\`${capability}\``))
        .map((capability) => `${page}: ${capability}`),
    )
    expect(missing).toEqual([])
  })

  it('name no internal artefact a reader outside the team cannot resolve', async () => {
    const generated = await generateDocs()
    const named = [...generated]
      .filter(([key]) => key.endsWith('.md') || key.endsWith('llms.txt'))
      .flatMap(([key, text]) =>
        text
          .split('\n')
          .filter((line) => INTERNAL.test(line))
          .map((line) => `${key}: ${line.slice(0, 120)}`),
      )
    expect(named).toEqual([])
  })
})
