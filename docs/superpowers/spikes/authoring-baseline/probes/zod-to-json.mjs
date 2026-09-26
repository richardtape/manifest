// Usage, from the repository root, after `pnpm add --offline zod@3.25.76 zod-to-json-schema@3.25.2`
// into "$SCRATCH/zjs" (a throwaway package — see the record for why zod is named):
//   node docs/superpowers/spikes/authoring-baseline/probes/zod-to-json.mjs "$SCRATCH/zjs"
// The authoring API plan's Task 1, Step 4 ([M7]): emit manifest.yaml's JSON Schema from the SHIPPED
// v3 schema (spec/schema.ts, unchanged) and ask four questions — its size; how runtime.build, the
// reserved hooks and the env entry's refine come out; whether defaults are present — then a fifth
// the plan did not ask: does Ajv, over the emitted schema, agree with zod on a small corpus?
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const zjs = process.argv[2]
if (!zjs) throw new Error('usage: zod-to-json.mjs <scratch package holding zod-to-json-schema>')
const { zodToJsonSchema } = await import(pathToFileURL(join(zjs, 'node_modules/zod-to-json-schema/dist/esm/index.js')).href)
const { manifestSchema } = await import(pathToFileURL('packages/control-plane/src/spec/schema.ts').href)
const { parse } = await import(pathToFileURL('packages/control-plane/node_modules/yaml/dist/index.js').href)
const { default: Ajv } = await import(pathToFileURL('packages/mock/node_modules/ajv/dist/ajv.js').href)

for (const target of ['jsonSchema7', 'jsonSchema2019-09', 'openApi3']) {
  const js = zodToJsonSchema(manifestSchema, { target, $refStrategy: 'none' })
  console.log(`== target ${target}: ${JSON.stringify(js).length} bytes, $schema ${js.$schema ?? '(none)'}`)
}
const js = zodToJsonSchema(manifestSchema, { target: 'jsonSchema7', $refStrategy: 'none' })
const p = js.properties
console.log('top-level keys:', Object.keys(p).join(','))
console.log('top-level required:', JSON.stringify(js.required), ' additionalProperties:', JSON.stringify(js.additionalProperties))
console.log('runtime.build:', JSON.stringify(p.runtime.properties.build), ' runtime.required:', JSON.stringify(p.runtime.required))
for (const k of ['integrations', 'jobs', 'checks']) console.log(`${k}:`, JSON.stringify(p[k]))
console.log('env item:', JSON.stringify(p.env.items))
const defaults = []
JSON.stringify(js, (k, v) => { if (k === 'default') defaults.push(JSON.stringify(v)); return v })
console.log(`defaults present: ${defaults.length} —`, defaults.join(' '))

// Does the emitted schema say what zod says? Ajv (draft-07) against zod's safeParse, per document.
const ajv = new Ajv({ strict: false, allErrors: true })
const check = ajv.compile(js)
const proof = parse(readFileSync('blueprints/node-ts-mongo/starters/proof-app/manifest.yaml', 'utf8'))
const skeleton = { manifest: 1, name: 'board-local', blueprint: 'node-ts-mongo@1', runtime: { port: 3000, health: '/healthz' } }
const corpus = [
  ['the proof-app starter', proof],
  ['the bare skeleton seed', skeleton],
  ['an unknown top-level key', { ...skeleton, colour: 'red' }],
  ['runtime.build declared', { ...skeleton, runtime: { ...skeleton.runtime, build: 'npm run x' } }],
  ['a bad name', { ...skeleton, name: 'Board' }],
  ['a reserved hook used', { ...skeleton, jobs: [{ name: 'x' }] }],
  ['env: a value AND secret: true (the refine)', { ...skeleton, env: [{ name: 'SIS_API_KEY', value: 'x', secret: true }] }],
  ['env: neither value nor secret (the refine)', { ...skeleton, env: [{ name: 'SIS_API_KEY' }] }],
  ['env: secret: true alone', { ...skeleton, env: [{ name: 'SIS_API_KEY', secret: true }] }],
]
for (const [label, doc] of corpus) {
  const zod = manifestSchema.safeParse(doc).success
  const json = check(doc)
  console.log(`${zod === json ? 'agree   ' : 'DISAGREE'} zod=${zod ? 'valid  ' : 'invalid'} ajv=${json ? 'valid  ' : 'invalid'}  ${label}`)
}
