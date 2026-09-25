// probes/structured.mjs — `node structured.mjs [n] [changes]` from the repository root. [M15]
// addendum (Rich, 2026-09-24): the approval summary as STRUCTURED OUTPUT.
//
// SINCE THE D5 PLAN'S TASK 13 (2026-09-25) IT DRIVES THE SHIPPED FUNCTION, not a copy of it:
// `summariseChanges` is imported from `packages/control-plane/src/releases/summary.ts` (Node 24
// strips its types; its one runtime import, `zod/v4`, resolves from beside it), so the request —
// the prompt, the JSON facts, `z.toJSONSchema(exposureSchema(changes))`, `max_tokens` — and every
// check on the answer are exactly what the control plane runs. The client is a thin stand-in for
// `ai/client.ts` (LiteLLM's admin transport, its 10 s timeout) that also keeps the raw answer.
//
// `changes` is 2 (leg A: an egress host added, `sn` removed — what F9's invented verdicts were
// about) or 3 (leg A plus a `resources` change, so the enum and the count are not always two).
// The first version of this probe, with a hand-written schema, is in git history (sitting 1).
import { readFileSync } from 'node:fs'
import { summariseChanges } from '../../../../../packages/control-plane/src/releases/summary.ts'

const N = Number(process.argv[2] ?? 10)
const COUNT = Number(process.argv[3] ?? 3)
const diff = readFileSync('packages/control-plane/src/spec/diff.ts', 'utf8')
const note = (f) =>
  eval(diff.match(new RegExp(`'?${f.replace('.', '\\.')}'?:\\s*\\n?\\s*('(?:[^'\\\\]|\\\\.)*')`))[1])
const HOST = 'leg-a-m15.example.org'
const FIVE = ['eduPersonAffiliation', 'givenName', 'mail', 'sn', 'ubcEduCwlPuid']
const ALL = [
  { path: 'egress.allow', from: 'none', to: HOST, summary: `now allows ${HOST}` },
  {
    path: 'auth.attributes',
    from: FIVE.join(', '),
    to: FIVE.filter((a) => a !== 'sn').join(', '),
    summary: 'no longer requests the sn attribute',
  },
  { path: 'resources.memory', from: '256Mi', to: '512Mi', summary: 'raised the memory limit from 256Mi to 512Mi' },
]
const changes = ALL.slice(0, COUNT)
const field = (path) => (path.startsWith('resources.') ? 'resources' : path)
// `securityNotesFor` order is SENSITIVE_FIELDS order; the model is handed them as the route would.
const security = [...new Set(changes.map((c) => field(c.path)))].map((f) => ({ field: f, note: note(f) }))
const context = {
  security,
  review: { state: 'not_performed', reviewer: 'none', detail: 'No code reviewer is configured.' },
  coverage: 'COVERAGE — never sent to the model.',
}
const KEY = readFileSync('.env', 'utf8').match(/^LITELLM_MASTER_KEY=(.*)$/m)[1].replace(/^["']|["']$/g, '')
let raw = ''
const client = {
  get: () => Promise.reject(new Error('never')),
  post: async (path, body) => {
    const r = await fetch(`http://127.0.0.1:7106${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(`LiteLLM ${r.status}: ${JSON.stringify(j).slice(0, 200)}`)
    raw = j.choices?.[0]?.message?.content ?? ''
    return j
  },
}
const console_error = console.error
const tally = { llm: 0, withheld: 0, unavailable: 0, notJson: 0, schema: 0, once: 0, decision: 0 }
const times = []
for (let i = 1; i <= N; i++) {
  raw = ''
  const operator = []
  console.error = (m) => operator.push(m)
  const t0 = Date.now()
  const s = await summariseChanges(client, changes, context)
  times.push(Date.now() - t0)
  console.error = console_error
  tally[s.summarySource] = (tally[s.summarySource] ?? 0) + 1
  const why = s.summaryWithheldBecause ?? ''
  if (/not JSON/.test(why)) tally.notJson++
  else if (/exactly once/.test(why)) tally.once++
  else if (/did not match the schema/.test(why)) tally.schema++
  else if (/decision/.test(why)) tally.decision++
  console.log(
    `[${i}] ${s.summarySource} ${times.at(-1)}ms` +
      (s.summarySource === 'llm'
        ? ` ${JSON.stringify(s.exposures)}`
        : ` because=${JSON.stringify(why)} operator=${JSON.stringify(operator)} raw=${JSON.stringify(raw.slice(0, 300))}`),
  )
}
const sorted = [...times].sort((a, b) => a - b)
console.log(
  `${COUNT} changes, ${N} runs: llm ${tally.llm}, withheld ${tally.withheld} (not JSON ${tally.notJson}, schema ${tally.schema}, ` +
    `not once each ${tally.once}, a decision word ${tally.decision}), unavailable ${tally.unavailable}; ` +
    `ms min ${sorted[0]} median ${sorted[Math.floor(N / 2)]} max ${sorted.at(-1)}`,
)
