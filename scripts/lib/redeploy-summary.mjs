// node scripts/lib/redeploy-summary.mjs [--bad] <loop.ndjson> <markers.ndjson>
//
// One line per phase — a `<phase>-start` / `<phase>-end` marker pair — counting each
// class of response from the phase's start until TAIL_MS (default 5000) after its end,
// because the window that matters ends when the app is serving again, not when the
// deploy call returns. `--bad` prints one number: responses that were neither `app`
// nor `reset`, which is what the acceptance asserts is zero.
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const badOnly = argv[0] === '--bad'
const [loopPath, markPath] = badOnly ? argv.slice(1) : argv
const read = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

const rows = read(loopPath)
const marks = read(markPath)
const at = (name) => marks.find((m) => m.name === name)?.t
const tail = Number(process.env.TAIL_MS ?? 5000)
let bad = 0

for (const phase of [...new Set(marks.map((m) => m.name.replace(/-(start|end)$/, '')))]) {
  const start = at(`${phase}-start`)
  const end = at(`${phase}-end`)
  if (start === undefined || end === undefined) continue
  const window = rows.filter((r) => r.t >= start && r.t <= end + tail)
  const counts = {}
  for (const r of window) counts[r.cls] = (counts[r.cls] ?? 0) + 1
  const wrong = window.filter((r) => r.cls !== 'app' && r.cls !== 'reset')
  bad += wrong.length
  if (!badOnly) {
    console.log(
      JSON.stringify({
        phase,
        deployMs: end - start,
        requests: window.length,
        counts,
        instancesSeen: [...new Set(window.map((r) => r.instance).filter(Boolean))],
        firstWrongAtMs: wrong[0] === undefined ? null : wrong[0].t - start,
        lastWrongEndedMs:
          wrong.length === 0 ? null : wrong.at(-1).t + wrong.at(-1).ms - start,
      }),
    )
  }
}
if (badOnly) console.log(bad)
