// probes/structured.mjs — `node structured.mjs [n] [model]` from the repository root. [M15] addendum
// (Rich, 2026-09-24): the approval summary as STRUCTURED OUTPUT. The same leg-A input as f9.mjs,
// sent as JSON; the model fills a JSON schema built from the diff — one `exposure` sentence per
// change, `path` an ENUM of the diff's own paths — through LiteLLM's OpenAI-style response_format,
// which LiteLLM 1.98.0 turns into Ollama's `format: <schema>`. No verdict and no coverage sentence
// are in the input, and the schema has no slot for either. The security notes are read from source.
import { readFileSync } from 'node:fs'
const N = Number(process.argv[2] ?? 10)
const MODEL = process.argv[3] ?? 'default-chat-onprem'
const diff = readFileSync('packages/control-plane/src/spec/diff.ts', 'utf8')
const note = (f) => eval(diff.match(new RegExp(`'?${f.replace('.', '\\.')}'?:\\s*\\n?\\s*('(?:[^'\\\\]|\\\\.)*')`))[1])
const HOST = 'leg-a-m15.example.org'
const FIVE = ['eduPersonAffiliation', 'givenName', 'mail', 'sn', 'ubcEduCwlPuid']
const changes = [
  { path: 'egress.allow', from: 'none', to: HOST, summary: `now allows ${HOST}` },
  { path: 'auth.attributes', from: FIVE.join(', '), to: FIVE.filter((a) => a !== 'sn').join(', '), summary: 'no longer requests the sn attribute' },
]
const user = JSON.stringify({ changes, securityNotes: changes.map((c) => ({ path: c.path, note: note(c.path) })) }, null, 1)
const system =
  'You explain configuration changes to a platform administrator. For EACH change in the input, write one ' +
  'plain-English sentence saying what that change could expose: personal information, where data can go, or ' +
  'what the app can reach. Use only the facts in the input. Answer with JSON matching the schema.'
const schema = {
  type: 'object', additionalProperties: false, required: ['changes'],
  properties: { changes: { type: 'array', minItems: changes.length, maxItems: changes.length, items: {
    type: 'object', additionalProperties: false, required: ['path', 'exposure'],
    properties: { path: { type: 'string', enum: changes.map((c) => c.path) }, exposure: { type: 'string', minLength: 10, maxLength: 300 } },
  } } },
}
const KEY = readFileSync('.env', 'utf8').match(/^LITELLM_MASTER_KEY=(.*)$/m)[1].replace(/^["']|["']$/g, '')
// Task 13's decision vocabulary, minus "blocked" (F7), plus the recommendation words F7 found missing.
const DECISION = /\b(verdict|approv\w*|reject\w*|decid\w*|decision|recommend\w*)\b/gi
let conform = 0, parsed = 0, withDecision = 0, withTicks = 0
const started = Date.now()
for (let i = 1; i <= N; i++) {
  const t0 = Date.now()
  const r = await fetch('http://127.0.0.1:7106/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: { name: 'change_exposures', strict: true, schema } } }),
  })
  const j = await r.json()
  if (!r.ok) { console.log(`[${i}] LiteLLM ${r.status}`, JSON.stringify(j).slice(0, 300)); continue }
  const text = j.choices[0].message.content ?? ''
  let v; try { v = JSON.parse(text); parsed++ } catch { console.log(`[${i}] NOT JSON (${text.length} chars):`, JSON.stringify(text.slice(0, 200))); continue }
  const items = Array.isArray(v.changes) ? v.changes : []
  const ok = Object.keys(v).length === 1 && items.length === changes.length &&
    items.every((c) => Object.keys(c).sort().join() === 'exposure,path' && changes.some((x) => x.path === c.path) &&
      typeof c.exposure === 'string' && c.exposure.length >= 10 && c.exposure.length <= 300) &&
    new Set(items.map((c) => c.path)).size === changes.length
  if (ok) conform++
  const words = items.flatMap((c) => [...String(c.exposure).matchAll(DECISION)].map((m) => m[0]))
  if (words.length) withDecision++
  if (items.some((c) => /[`*]/.test(String(c.exposure)))) withTicks++
  console.log(`[${i}] ${ok ? 'CONFORMS' : 'SHAPE WRONG'} ${Date.now() - t0}ms decision=[${words.join(',')}] ${JSON.stringify(v)}`)
}
console.log(`${MODEL}: parsed ${parsed}/${N}, conform ${conform}/${N}, a decision word in an exposure ${withDecision}/${N}, backticks or asterisks ${withTicks}/${N}, ${Math.round((Date.now() - started) / N)} ms each`)
