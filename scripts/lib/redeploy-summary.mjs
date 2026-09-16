// node scripts/lib/redeploy-summary.mjs [--bad | --drained <phase>] <loop.ndjson> <markers.ndjson> [asks.log]
//
// One line per phase — a `<phase>-start` / `<phase>-end` marker pair — counting each
// class of response from the phase's start until TAIL_MS (default 5000) after its end,
// because the window that matters ends when the app is serving again, not when the
// deploy call returns. `--bad` prints one number: responses that were neither `app`
// nor `reset`, which is what the acceptance asserts is zero.
//
// WITH THE ASKER'S LOG, each line also says whether a question was IN FLIGHT when the
// route moved (P4c Task 11, sitting 7 finding 61). The move is read off the health
// loop's identity header: the first response inside the window that names a different
// instance from the one serving before it. A question in flight across that move is
// one the PREVIOUS instance answered and that ended after that response came back —
// the previous instance cannot have been chosen for a request that started after the
// move, so its answer could only arrive after the move if the drain let it finish.
// `--drained <phase>` prints how many of those were answered 200, which is what the
// acceptance asserts is at least one: a run whose student happened to be between
// questions at the move proves nothing about a drain.
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const badOnly = argv[0] === '--bad'
const drainedPhase = argv[0] === '--drained' ? argv[1] : undefined
const [loopPath, markPath, asksPath] = badOnly
  ? argv.slice(1)
  : drainedPhase !== undefined
    ? argv.slice(2)
    : argv
const read = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

// asks.log: `<t0> <t1> <http code> <X-Manifest-Instance or -> [<AI error code>]`
const asks =
  asksPath === undefined
    ? []
    : readFileSync(asksPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [t0, t1, code, instance, aiCode] = line.split(' ')
          return {
            t0: Number(t0),
            t1: Number(t1),
            code,
            instance: instance === '-' ? null : instance,
            aiCode: aiCode ?? '',
          }
        })

const rows = read(loopPath)
const marks = read(markPath)
const at = (name) => marks.find((m) => m.name === name)?.t
const tail = Number(process.env.TAIL_MS ?? 5000)
let bad = 0
let drainedPrinted = false

for (const phase of [...new Set(marks.map((m) => m.name.replace(/-(start|end)$/, '')))]) {
  const start = at(`${phase}-start`)
  const end = at(`${phase}-end`)
  if (start === undefined || end === undefined) continue
  const window = rows.filter((r) => r.t >= start && r.t <= end + tail)
  const counts = {}
  for (const r of window) counts[r.cls] = (counts[r.cls] ?? 0) + 1
  const wrong = window.filter((r) => r.cls !== 'app' && r.cls !== 'reset')
  bad += wrong.length

  // WHERE THE ROUTE MOVED, bracketed by the last answer from the instance that served
  // before the phase and the first from any other. No move — a failed release — is null.
  const previous = rows.filter((r) => r.t < start && r.instance).at(-1)?.instance ?? null
  const firstNew = window.find((r) => r.instance && r.instance !== previous)
  const lastOld =
    firstNew === undefined
      ? undefined
      : rows.filter((r) => r.t < firstNew.t && r.instance === previous).at(-1)
  const movedBy = firstNew === undefined ? undefined : firstNew.t + firstNew.ms
  const acrossMove =
    movedBy === undefined || previous === null
      ? []
      : asks.filter((a) => a.instance === previous && a.t1 > movedBy)
  const drained = acrossMove.filter((a) => a.code === '200').length
  if (drainedPhase === phase) {
    console.log(drained)
    drainedPrinted = true
  }

  if (!badOnly && drainedPhase === undefined) {
    const line = {
      phase,
      deployMs: end - start,
      requests: window.length,
      counts,
      instancesSeen: [...new Set(window.map((r) => r.instance).filter(Boolean))],
      firstWrongAtMs: wrong[0] === undefined ? null : wrong[0].t - start,
      lastWrongEndedMs:
        wrong.length === 0 ? null : wrong.at(-1).t + wrong.at(-1).ms - start,
    }
    if (asksPath !== undefined) {
      const overlapping = asks.filter((a) => a.t0 < end + tail && a.t1 > start)
      line.routeMovedMs =
        firstNew === undefined
          ? null
          : [lastOld === undefined ? null : lastOld.t - start, movedBy - start]
      line.questions = {
        inWindow: overlapping.length,
        notAnswered200: overlapping.filter((a) => a.code !== '200').length,
        inFlightAcrossMove: acrossMove.length,
        drainedAndAnswered200: drained,
        // [started, ended] relative to the phase start, so a reader can see the straddle.
        acrossMoveMs: acrossMove.map((a) => [a.t0 - start, a.t1 - start, a.code]),
      }
    }
    console.log(JSON.stringify(line))
  }
}
if (badOnly) console.log(bad)
// A phase with no markers drained nothing — say 0, never nothing, so the caller's
// numeric comparison fails as an assertion rather than as a shell syntax error.
if (drainedPhase !== undefined && !drainedPrinted) console.log(0)
