// probes/normalise.mjs — [M11] addendum 2. Task 4's schemas.ts, as corrected: OpenAPI 3.0's
// `nullable: true` beside NO `type` (GitHub writes it next to anyOf/oneOf) is rewritten at LOAD
// to a `{ type: 'null' }` branch, so the committed file stays GitHub's text verbatim. Plus
// ajv-formats, without which every format is ignored. Run from packages/mock (Ajv resolves there).
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFileSync } from 'node:fs'
const g = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let rewritten = 0
const normalise = (n) => {
  if (Array.isArray(n)) return n.map(normalise)
  if (!n || typeof n !== 'object') return n
  const out = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, normalise(v)]))
  if (out.nullable === true && out.type === undefined) {
    const list = out.anyOf ? 'anyOf' : out.oneOf ? 'oneOf' : null
    if (list === null) throw new Error('nullable without type and without anyOf/oneOf — extend the normaliser')
    delete out.nullable; out[list] = [...out[list], { type: 'null' }]; rewritten++
  }
  return out
}
const components = normalise(g.components)
const warnings = []
const ajv = new Ajv({ strict: false, allErrors: true, logger: { log() {}, warn: (m) => warnings.push(m), error: console.error } })
addFormats(ajv)
ajv.addSchema({ $id: 'gh', components })
let ok = 0
for (const name of Object.keys(g.roots)) {
  const ref = g.roots[name].$ref
  const target = ref ? { $ref: 'gh' + ref } : JSON.parse(JSON.stringify(g.roots[name]).replaceAll('"#/components/', '"gh#/components/'))
  try { ajv.compile(target); ok++ } catch (e) { console.log('FAILED', name, e.message.slice(0, 160)) }
}
console.log(`rewritten ${rewritten} sites; compiled ${ok} of ${Object.keys(g.roots).length} roots; format warnings ${warnings.length}`)
const acct = ajv.compile({ $ref: 'gh#/components/schemas/installation/properties/account' })
console.log('installation.account accepts null:', acct(null), '| accepts 42:', acct(42))
const pushed = ajv.compile({ $ref: 'gh#/components/schemas/webhook-push/properties/repository/properties/pushed_at' })
console.log('push repository.pushed_at accepts null:', pushed(null), '| 1790000000:', pushed(1790000000), '| "2026-09-24T20:00:00Z":', pushed('2026-09-24T20:00:00Z'), '| "yesterday":', pushed('yesterday'))
const uri = ajv.compile({ $ref: 'gh#/components/schemas/simple-user/properties/html_url' })
console.log('formats live: simple-user.html_url accepts "not a uri":', uri('not a uri'), '| "https://github.com/x":', uri('https://github.com/x'))
