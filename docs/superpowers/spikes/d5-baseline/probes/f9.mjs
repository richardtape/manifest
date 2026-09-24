// probes/f9.mjs — `node f9.mjs [n]` from the repository root. [M15]: P6b's F9 on the real model,
// under the CURRENT prompt and under Task 13's, n answers each (default 10), through LiteLLM with the
// logical name the platform uses. EVERY input is read from the source, not retyped: summary.ts's
// SYSTEM_PROMPT, diff.ts's SECURITY_NOTES and SENSITIVE_FIELDS order, launch/review.ts's
// NullReviewer reason (which describeVerdict returns verbatim for not_performed) and approval.ts's
// COVERAGE_LIMIT. The two change lines are describeDiff's shape for leg A (sn removed; one egress
// host added), built with diff.ts's own setChange wording. The key is read from .env, never printed.
import { readFileSync } from 'node:fs'
const N = Number(process.argv[2] ?? 10)
const src = (p) => readFileSync(`packages/control-plane/src/${p}`, 'utf8')
const lit = (text, re, what) => { const m = text.match(re); if (!m) throw new Error(`could not read ${what}`); return eval(m[1]) }
const CURRENT = lit(src('releases/summary.ts'), /const SYSTEM_PROMPT =\s*([\s\S]*?)\n\n/, 'SYSTEM_PROMPT')
const diff = src('spec/diff.ts')
const note = (f) => lit(diff, new RegExp(`'?${f.replace('.', '\\.')}'?:\\s*\\n?\\s*('(?:[^'\\\\]|\\\\.)*')`), `SECURITY_NOTES[${f}]`)
const FIELDS = lit(diff, /export const SENSITIVE_FIELDS = (\[[\s\S]*?\]) as const/, 'SENSITIVE_FIELDS')
const REASON = lit(src('launch/review.ts'), /reviewer: 'none',\s*reason:\s*([\s\S]*?),\s*\n\s*\}\)/, 'NullReviewer reason')
const COVERAGE = lit(src('releases/approval.ts'), /export const COVERAGE_LIMIT =\s*([\s\S]*?)\n\n/, 'COVERAGE_LIMIT')
if (!CURRENT.includes('State the code reviewer')) throw new Error('SYSTEM_PROMPT read wrongly')
const HOST = 'leg-a-m15.example.org'
const FIVE = ['eduPersonAffiliation', 'givenName', 'mail', 'sn', 'ubcEduCwlPuid']
const changes = [
  `egress.allow: none -> ${HOST} (now allows ${HOST})`,
  `auth.attributes: ${FIVE.join(', ')} -> ${FIVE.filter((a) => a !== 'sn').join(', ')} (no longer requests the sn attribute)`,
]
const notes = FIELDS.filter((f) => f === 'auth.attributes' || f === 'egress.allow').map((f) => `${f}: ${note(f)}`)
const USER_CURRENT = [...changes, '', 'Security notes:', ...notes, '', `Code review: ${REASON}`, '', COVERAGE].join('\n')
const USER_TASK13 = [...changes, '', 'Security notes:', ...notes].join('\n')
const TASK13 =
  "You describe changes to a university web application's configuration for a platform administrator. " +
  'Two sentences at most, in plain English. Say what changed and what each change could expose: personal ' +
  'information, where data can go, what the app can reach. Describe only the changes listed. Do not state ' +
  'or suggest any decision, verdict, approval, rejection or recommendation, and do not say whether anything ' +
  'was reviewed; the administrator reads those separately. Write plain text: no Markdown, no asterisks, ' +
  'no backticks, no headings, no bullet characters.'
function checkSummary(text) { // Task 13's, verbatim
  if (/\b(verdict|approv\w*|reject\w*|blocked|decid\w*|decision)\b/i.test(text)) return 'decision'
  if (/[*`]|^\s{0,3}(#{1,6}\s|[-•]\s)/m.test(text)) return 'markdown'
  return null
}
const KEY = readFileSync('.env', 'utf8').match(/^LITELLM_MASTER_KEY=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '')
if (!KEY) throw new Error('no LITELLM_MASTER_KEY in .env')
async function ask(system, user) {
  const r = await fetch('http://127.0.0.1:7106/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'default-chat-onprem', max_tokens: 200, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`LiteLLM ${r.status}: ${JSON.stringify(j).slice(0, 200)}`)
  return { text: j.choices[0].message.content.trim(), model: j.model }
}
console.log('inputs read from source: SYSTEM_PROMPT', CURRENT.length, 'chars; notes', notes.length, '; reason', REASON.length, '; coverage', COVERAGE.length)
console.log('--- the CURRENT user message:\n' + USER_CURRENT + '\n---')
for (const [label, system, user] of [['CURRENT prompt', CURRENT, USER_CURRENT], ["Task 13's prompt", TASK13, USER_TASK13]]) {
  const tally = { decision: 0, markdown: 0, clean: 0 }
  console.log(`\n=== ${label}, ${N} answers ===`)
  for (let i = 1; i <= N; i++) {
    const { text, model } = await ask(system, user)
    const why = checkSummary(text)
    tally[why ?? 'clean']++
    console.log(`[${i}] ${why === null ? 'KEPT    ' : `WITHHELD(${why})`} (${model}) ${JSON.stringify(text)}`)
  }
  console.log(`${label}: withheld ${tally.decision + tally.markdown} of ${N} (decision ${tally.decision}, markdown ${tally.markdown}), kept ${tally.clean}`)
}
