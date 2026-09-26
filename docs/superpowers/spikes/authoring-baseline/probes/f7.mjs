// probes/f7.mjs — `node docs/superpowers/spikes/authoring-baseline/probes/f7.mjs [n] [changes]`
// from the REPOSITORY ROOT (sitting 1's F15). The authoring API plan's Task 2 (F7).
//
// `spikes/d5-baseline/probes/structured.mjs` with a classifier added. It drives the SHIPPED
// `summariseChanges` (`packages/control-plane/src/releases/summary.ts`, types stripped by Node
// 24), so the prompt, the facts, the schema and every check on the answer are exactly what the
// control plane runs. The client is a thin stand-in for `ai/client.ts` (LiteLLM, a 10 s timeout)
// that keeps the raw answer AND the facts the model was handed — so a run says, in its own
// output, whether `added`/`removed` reached the model at all.
//
// The changes carry `added`/`removed` exactly as `describeDiff` produces them for this pair
// (`spec/diff.test.ts` holds that), whether or not the shipped function passes them on: before
// Task 2 it drops them, after it hands them over. One variable changes between the two runs.
//
// THE CLASSIFIER — an `auth.attributes` sentence is a REVERSAL when it says the app receives,
// requests, collects, gains, gets or obtains `sn` and says no negation before it. The plan's
// regex names `sn` only; the model also writes "surname" and "last name", so those are the
// same target here (a ruling in the ledger). EVERY auth.attributes sentence is printed at the
// end, marked, so a person reads each one — a classifier nobody checked is a green control.
import { readFileSync } from 'node:fs'
import { summariseChanges } from '../../../../../packages/control-plane/src/releases/summary.ts'

const N = Number(process.argv[2] ?? 10)
const COUNT = Number(process.argv[3] ?? 2)
const diff = readFileSync('packages/control-plane/src/spec/diff.ts', 'utf8')
const note = (f) =>
  eval(diff.match(new RegExp(`'?${f.replace('.', '\\.')}'?:\\s*\\n?\\s*('(?:[^'\\\\]|\\\\.)*')`))[1])
const HOST = 'leg-a-m15.example.org'
const FIVE = ['eduPersonAffiliation', 'givenName', 'mail', 'sn', 'ubcEduCwlPuid']
const ALL = [
  {
    path: 'egress.allow',
    from: 'none',
    to: HOST,
    summary: `now allows ${HOST}`,
    added: [HOST],
    removed: [],
  },
  {
    path: 'auth.attributes',
    from: FIVE.join(', '),
    to: FIVE.filter((a) => a !== 'sn').join(', '),
    summary: 'no longer requests the sn attribute',
    added: [],
    removed: ['sn'],
  },
  { path: 'resources.memory', from: '256Mi', to: '512Mi', summary: 'raised the memory limit from 256Mi to 512Mi' },
]
const changes = ALL.slice(0, COUNT)
const field = (path) => (path.startsWith('resources.') ? 'resources' : path)
const security = [...new Set(changes.map((c) => field(c.path)))].map((f) => ({ field: f, note: note(f) }))
const context = {
  security,
  review: { state: 'not_performed', reviewer: 'none', detail: 'No code reviewer is configured.' },
  coverage: 'COVERAGE — never sent to the model.',
}
const KEY = readFileSync('.env', 'utf8').match(/^LITELLM_MASTER_KEY=(.*)$/m)[1].replace(/^["']|["']$/g, '')
let raw = ''
let facts = null
const client = {
  get: () => Promise.reject(new Error('never')),
  post: async (path, body) => {
    facts = JSON.parse(body.messages.at(-1).content)
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

const TARGET = String.raw`\b(sn|surnames?|last names?|family names?)\b`
const CLAIMS = new RegExp(
  String.raw`\b(now\s+)?(receiv|request|collect|gain|get|obtain|access|see|read)\w*\b[^.]*` + TARGET,
  'i',
)
const NEGATION = /\b(no longer|stop\w*|remov\w*|drop\w*|without|not|n't|cannot|lose\w*|lost|ceas\w*|exclud\w*|omit\w*|longer)\b/i
function classify(sentence) {
  const at = sentence.search(new RegExp(TARGET, 'i'))
  if (at < 0) return 'no-target'
  if (!CLAIMS.test(sentence)) return 'ok'
  return NEGATION.test(sentence.slice(0, at)) ? 'ok' : 'REVERSAL'
}

const console_error = console.error
const tally = { llm: 0, withheld: 0, unavailable: 0, notJson: 0, schema: 0, once: 0, decision: 0 }
const marks = { ok: 0, REVERSAL: 0, 'no-target': 0 }
const read = []
const times = []
let handed = null
for (let i = 1; i <= N; i++) {
  raw = ''
  const operator = []
  console.error = (m) => operator.push(m)
  const t0 = Date.now()
  const s = await summariseChanges(client, changes, context)
  times.push(Date.now() - t0)
  console.error = console_error
  handed ??= facts
  tally[s.summarySource] = (tally[s.summarySource] ?? 0) + 1
  const why = s.summaryWithheldBecause ?? ''
  if (/not JSON/.test(why)) tally.notJson++
  else if (/exactly once/.test(why)) tally.once++
  else if (/did not match the schema/.test(why)) tally.schema++
  else if (/decision/.test(why)) tally.decision++
  if (s.summarySource === 'llm') {
    const sentence = s.exposures.find((e) => e.path === 'auth.attributes').sentence
    const mark = classify(sentence)
    marks[mark]++
    read.push(`[${i}] ${mark.padEnd(9)} ${sentence}`)
  }
  console.log(
    `[${i}] ${s.summarySource} ${times.at(-1)}ms` +
      (s.summarySource === 'llm'
        ? ` ${JSON.stringify(s.exposures)}`
        : ` because=${JSON.stringify(why)} operator=${JSON.stringify(operator)} raw=${JSON.stringify(raw.slice(0, 300))}`),
  )
}
const sorted = [...times].sort((a, b) => a - b)
console.log(`\nTHE FACTS THE MODEL WAS HANDED (first call): ${JSON.stringify(handed)}`)
console.log(
  `the auth.attributes fact carries added/removed: ${JSON.stringify(
    handed?.changes?.find((c) => c.path === 'auth.attributes') ?? null,
  )}`,
)
console.log('\nEVERY auth.attributes SENTENCE, MARKED — READ EACH ONE:')
for (const line of read) console.log(line)
console.log(
  `\n${COUNT} changes, ${N} runs: kept ${tally.llm}, withheld ${tally.withheld} (not JSON ${tally.notJson}, schema ${tally.schema}, ` +
    `not once each ${tally.once}, a decision word ${tally.decision}), unavailable ${tally.unavailable}; ` +
    `classifier: reversals ${marks.REVERSAL}, ok ${marks.ok}, no sn named ${marks['no-target']}; ` +
    `ms min ${sorted[0]} median ${sorted[Math.floor(N / 2)]} max ${sorted.at(-1)}`,
)
