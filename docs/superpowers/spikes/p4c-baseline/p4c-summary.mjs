// node p4c-summary.mjs <loop.ndjson> <markers.ndjson>   (TAIL_MS extends each window)
import { readFileSync } from 'node:fs'
const [loopPath, markPath] = process.argv.slice(2)
const lines = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const rows = lines(loopPath), marks = lines(markPath)
const at = (n) => marks.find((m) => m.name === n)?.t
const tail = Number(process.env.TAIL_MS ?? 5000)
for (const n of [...new Set(marks.map((m) => m.name.replace(/-(start|end)$/, '')))]) {
  const s = at(`${n}-start`), e = at(`${n}-end`)
  if (s === undefined || e === undefined) continue
  const w = rows.filter((r) => r.t >= s && r.t <= e + tail)
  const counts = {}
  for (const r of w) counts[r.cls] = (counts[r.cls] ?? 0) + 1
  const bad = w.filter((r) => r.cls !== 'app')
  const span = bad.length ? `first at +${bad[0].t - s} ms, last ended +${bad.at(-1).t + bad.at(-1).ms - s} ms` : 'none'
  console.log(`${n}: action took ${e - s} ms; ${w.length} requests in [start, end+${tail} ms]: ${JSON.stringify(counts)}; non-app: ${span}; slowest ${Math.max(0, ...w.map((r) => r.ms))} ms`)
}
