import { readFileSync } from 'node:fs'
import addFormatsModule, { type FormatsPlugin } from 'ajv-formats'
import { Ajv, type ValidateFunction } from 'ajv'

/**
 * TEST SUPPORT: GitHub's OWN schemas, holding the fake to what GitHub says it answers
 * (Decision 7's first mechanism). `../conformance/github-schemas.json` is extracted from
 * GitHub's REST description (`extract-schemas.mjs`) and kept VERBATIM — it is dated evidence
 * of what GitHub said — so what Ajv cannot read is corrected HERE, at load:
 *
 *  - **OpenAPI 3.0's `nullable: true` beside NO `type`.** GitHub writes it next to
 *    `anyOf`/`oneOf` at exactly two sites today (`installation.account` and
 *    `webhook-push.repository.pushed_at`), and Ajv 8.20.0 refuses to COMPILE either:
 *    *"nullable" cannot be used without "type"* (the plan's `[M11]`, F4). Each such node
 *    becomes a `{ type: 'null' }` branch of its list; a node with neither list throws, so a
 *    new shape in a later description is a red test rather than a silent pass.
 *  - **Formats.** Without `ajv-formats`, Ajv warned 838 times and enforced no `uri`,
 *    `date-time` or `int64` at all.
 *
 * `ajv-formats` has no named export, so it takes the one cast (`packages/mock`'s
 * `validate.ts` says why); `Ajv` is the named import, correct under NodeNext.
 */
const addFormats = addFormatsModule as unknown as FormatsPlugin

interface SchemaFile {
  source: string
  roots: Record<string, { $ref?: string }>
  components: { schemas: Record<string, unknown> }
}

/** How many nodes the last `normalise` call rewrote — `schemas.test.ts` pins it at two. */
export let rewrittenSites = 0

export function normalise(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalise)
  if (node === null || typeof node !== 'object') return node
  const out: Record<string, unknown> = Object.fromEntries(
    Object.entries(node).map(([k, v]) => [k, normalise(v)]),
  )
  if (out.nullable === true && out.type === undefined) {
    const list = Array.isArray(out.anyOf)
      ? 'anyOf'
      : Array.isArray(out.oneOf)
        ? 'oneOf'
        : null
    if (list === null) {
      throw new Error(
        'nullable without type and without anyOf/oneOf — extend the normaliser',
      )
    }
    delete out.nullable
    out[list] = [...(out[list] as unknown[]), { type: 'null' }]
    rewrittenSites++
  }
  return out
}

const file = JSON.parse(
  readFileSync(new URL('../conformance/github-schemas.json', import.meta.url), 'utf8'),
) as SchemaFile

rewrittenSites = 0
const components = normalise(file.components)
const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
ajv.addSchema({ $id: 'gh', components })

const compiled = new Map<string, ValidateFunction>()

/** The roots GitHub's description names — an operation's answer or a webhook's payload. */
export const ROOTS: readonly string[] = Object.keys(file.roots)
export const SCHEMA_SOURCE = file.source

/**
 * Throws, listing Ajv's errors, unless `value` is what GitHub's schema for `root` allows.
 * **A root it cannot find throws**, so a typo cannot pass as *conforms*.
 */
export function expectGitHubShape(root: string, value: unknown): void {
  let validate = compiled.get(root)
  if (validate === undefined) {
    const ref = file.roots[root]?.$ref
    if (ref === undefined) throw new Error(`github-schemas.json has no root '${root}'`)
    const name = ref.split('/').pop()!
    if (file.components.schemas[name] === undefined) {
      throw new Error(`cannot resolve '${ref}' for '${root}' in github-schemas.json`)
    }
    validate = ajv.compile({ $ref: `gh#/components/schemas/${name}` })
    compiled.set(root, validate)
  }
  if (!validate(value)) {
    const errors = (validate.errors ?? [])
      .map((e) => `${e.instancePath || '(root)'} ${e.message ?? ''}`)
      .join('\n  ')
    throw new Error(`not GitHub's '${root}' (${file.source}):\n  ${errors}`)
  }
}
