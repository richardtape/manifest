// probes/nullable.mjs — [M11]: does Ajv 8.20.0 honour OpenAPI 3.0's `nullable`, and does it compile
// GitHub's own extracted schemas? Run from packages/mock, where Ajv resolves.
import Ajv from 'ajv'
import { readFileSync } from 'node:fs'
const ajv = new Ajv({ strict: false, allErrors: true })
const v = ajv.compile({ type: 'string', nullable: true })
console.log('ajv', (await import('ajv/package.json', { with: { type: 'json' } })).default.version)
console.log("{type:'string',nullable:true} accepts null:", v(null), '| accepts "x":', v('x'), '| accepts 1:', v(1))
const g = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const ajv2 = new Ajv({ strict: false, allErrors: true })
ajv2.addSchema({ components: g.components }, 'gh')
let compiled = 0
for (const [name, root] of Object.entries(g.roots)) {
  const fixed = JSON.parse(JSON.stringify(root).replaceAll('"#/components/', '"gh#/components/'))
  try { ajv2.compile(fixed); compiled++ } catch (e) { console.log('FAILED to compile', name, e.message.slice(0, 160)) }
}
console.log(`compiled ${compiled} of ${Object.keys(g.roots).length} roots`)
// A negative control on one of them: an installation token with no `token` must be refused.
const tok = ajv2.compile(JSON.parse(JSON.stringify(g.roots['POST /app/installations/{installation_id}/access_tokens 201']).replaceAll('"#/components/', '"gh#/components/')))
console.log('installation-token {token, expires_at} valid:', tok({ token: 'ghs_x', expires_at: '2026-09-24T21:00:00Z' }), '| {expires_at} alone valid:', tok({ expires_at: '2026-09-24T21:00:00Z' }))
