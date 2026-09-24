// probes/f9-triggers.mjs <f9 output> — [M15] addendum: for each answer f9.mjs recorded, WHICH words
// or characters trip Task 13's checkSummary, and what the check would withhold without two of its
// rules (backticks; the word "blocked"). A measurement for Rich's sitting-7 decision, not a design.
import { readFileSync } from 'node:fs'
const lines = readFileSync(process.argv[2], 'utf8').split('\n')
let section = ''
const rows = []
for (const l of lines) {
  const h = l.match(/^=== (.*), \d+ answers ===$/); if (h) { section = h[1]; continue }
  const m = l.match(/^\[(\d+)\] \S+(?:\([a-z]+\))?\s+\([^)]*\) (".*")$/); if (m) rows.push({ section, i: m[1], text: JSON.parse(m[2]) })
}
const DECISION = /\b(verdict|approv\w*|reject\w*|blocked|decid\w*|decision)\b/gi
const MD = /[*`]|^\s{0,3}(#{1,6}\s|[-•]\s)/gm
const withheld = (t, { backticks = true, blocked = true } = {}) => {
  const dec = [...t.matchAll(DECISION)].map((m) => m[0].toLowerCase()).filter((w) => blocked || w !== 'blocked')
  const md = [...t.matchAll(MD)].map((m) => m[0]).filter((c) => backticks || c !== '`')
  return dec.length > 0 || md.length > 0
}
for (const s of [...new Set(rows.map((r) => r.section))]) {
  const rs = rows.filter((r) => r.section === s)
  console.log(`\n=== ${s} (${rs.length} answers) ===`)
  for (const r of rs) {
    const dec = [...new Set([...r.text.matchAll(DECISION)].map((m) => m[0].toLowerCase()))]
    const md = [...new Set([...r.text.matchAll(MD)].map((m) => JSON.stringify(m[0].trim() || m[0])))]
    const invented = /\b(administrator|admin)['’]s verdict|verdict (was|is):\s*[“"]?An administrator sees/i.test(r.text)
    console.log(`[${r.i}] decision words: ${dec.join(',') || '-'} | markdown: ${md.join(',') || '-'} | a verdict ATTRIBUTED to the coverage sentence or to an administrator: ${invented ? 'YES' : 'no'}`)
  }
  const n = (o) => rs.filter((r) => withheld(r.text, o)).length
  console.log(`withheld: as Task 13 writes it ${n()} | without the backtick rule ${n({ backticks: false })} | without "blocked" ${n({ blocked: false })} | without both ${n({ backticks: false, blocked: false })}`)
}
