/**
 * WHAT `make demo-capacity` CONCLUDES FROM WHAT IT SAW (A1 Task 9) — the reading of its request loops and
 * of the set watcher's events, kept apart from the phases that gather them so that each rule can be
 * watched failing in a unit test (`capacity-checks.test.ts`). A demo's check that cannot fail is this
 * project's most-repeated defect; these are the checks whose failure is not otherwise observable without
 * breaking the platform.
 */

/** One line of `scripts/lib/redeploy-loop.mjs`'s output. */
export interface LoopRecord {
  /** When the request started, epoch ms. */
  t: number
  /** How long it took. */
  ms: number
  status: number
  /** `app`, `reset`, `wildcard`, `502-empty`, `status-<n>` or `error-<code>` — the loop's classes. */
  cls: string
  /** The edge's `X-Manifest-Instance` on the answer, or null. */
  instance: string | null
}

/** Every request that was under way at some moment inside `[from, to]` — at either edge too. */
export function overlapping(
  records: readonly LoopRecord[],
  from: number,
  to: number,
): LoopRecord[] {
  return records.filter((r) => r.t <= to && r.t + r.ms >= from)
}

/** The request had started, and had not yet been answered, at `moment`. */
export function inFlightAt(record: LoopRecord, moment: number): boolean {
  return record.t <= moment && moment <= record.t + record.ms
}

/**
 * Every answer that was neither the app nor a reset. A reset is §11's: an edge configuration reload
 * occasionally resets one connection, on any app, and the loop says so as its own class.
 */
export function notTheApp(records: readonly LoopRecord[]): LoopRecord[] {
  return records.filter((r) => r.cls !== 'app' && r.cls !== 'reset')
}

/**
 * WHICH SET EACH ANSWER CAME FROM, as runs: the edge balances across a set, so the instance changes on
 * every answer within one — what must change exactly once in a redeploy is the SET (`['A', 'B']`). An
 * answer from an instance in neither set is named by its id, never folded into a neighbour; an answer
 * with no instance (a reset, the wildcard) says nothing about sets and is skipped — `notTheApp` counts it.
 */
export function setRuns(
  records: readonly LoopRecord[],
  sets: Readonly<Record<string, readonly string[]>>,
): string[] {
  const runs: string[] = []
  for (const record of records) {
    if (record.instance === null) continue
    const label =
      Object.entries(sets).find(([, ids]) => ids.includes(record.instance!))?.[0] ??
      record.instance
    if (runs[runs.length - 1] !== label) runs.push(label)
  }
  return runs
}

/** A deploy's members, by when the platform said it began provisioning each. */
export interface Wave {
  at: number
  ids: string[]
}

/**
 * THE DEPLOYS, FROM THEIR MEMBERS: one deploy provisions its whole set at once (one INSERT, its events
 * within milliseconds), and the watcher's replacements are a minute and more apart — so members whose
 * provisioning began within `gapMs` of a wave's first are that wave.
 */
export function wavesOf(
  starts: readonly { id: string; at: number }[],
  gapMs = 5_000,
): Wave[] {
  const waves: Wave[] = []
  for (const start of [...starts].sort((a, b) => a.at - b.at)) {
    const last = waves[waves.length - 1]
    if (last !== undefined && start.at - last.at <= gapMs) last.ids.push(start.id)
    else waves.push({ at: start.at, ids: [start.id] })
  }
  return waves
}

/** One `instance.exited`, as the demo read it off the stream. */
export interface Exit {
  instanceId: string
  /** The event's `createdAt`, epoch ms — the database's clock, as every other event's. */
  at: number
  attempt: number
  replacement: 'scheduled' | 'stopped'
  nextInSeconds: number | null
}

/** §11's backoff as the watcher builds it: at once, a minute, four minutes — then stopped. */
const BACKOFF_SECONDS = [0, 60, 240] as const
/**
 * HOW LATE A REPLACEMENT MAY START after its wait, and no earlier than the wait allows: the timer starts
 * after the exit is recorded, and the deploy's first event follows once it holds the environment's lock.
 * Both times are the database's clock, so the lower bound needs only rounding.
 */
const EARLY_MS = 1_000
const LATE_MS = 30_000

/**
 * A CRASH LOOP STOPPED AT ITS CAP (Review Focus 7), from the exits and the replacement waves after the
 * person's deploy: the first exit of attempt k said it would be replaced in 0, 60 and 240 seconds, and
 * replacement k began that long after it (never sooner, not much later); exactly three replacements; then
 * an exit, attempt 4, said `stopped`, and nothing started after it.
 */
export function crashLoop(
  exits: readonly Exit[],
  waves: readonly Wave[],
): { ok: boolean; problems: string[]; rows: string[] } {
  const problems: string[] = []
  const rows: string[] = []
  const byTime = [...exits].sort((a, b) => a.at - b.at)
  const origin = byTime[0]?.at ?? 0
  const rel = (t: number) => `+${Math.round((t - origin) / 1000)} s`

  BACKOFF_SECONDS.forEach((seconds, index) => {
    const k = index + 1
    const exit = byTime.find((e) => e.attempt === k && e.replacement === 'scheduled')
    if (exit === undefined) {
      problems.push(`no exit was recorded as attempt ${k}, scheduled`)
      return
    }
    if (exit.nextInSeconds !== seconds)
      problems.push(`exit ${k} said ${exit.nextInSeconds} s, not ${seconds} s`)
    const wave = waves.find((w) => w.at > exit.at)
    if (wave === undefined) {
      problems.push(`no replacement started after exit ${k}`)
      return
    }
    const gap = wave.at - exit.at
    if (gap < seconds * 1000 - EARLY_MS || gap > seconds * 1000 + LATE_MS)
      problems.push(
        `replacement ${k} started ${Math.round(gap / 1000)} s after exit ${k}, which said ${seconds} s`,
      )
    if (waves.indexOf(wave) !== index)
      problems.push(
        `replacement ${k} was deploy ${waves.indexOf(wave) + 1} after the person’s`,
      )
    rows.push(
      `exit ${k} at ${rel(exit.at)} (${exit.instanceId}, scheduled in ${exit.nextInSeconds} s) → replacement ${k} at ${rel(wave.at)}, ${Math.round(gap / 1000)} s later [${wave.ids.join(', ')}]`,
    )
  })

  if (waves.length !== BACKOFF_SECONDS.length)
    problems.push(`${waves.length} replacements, not ${BACKOFF_SECONDS.length}`)
  const stop = byTime.find((e) => e.replacement === 'stopped')
  if (stop === undefined) {
    problems.push('no exit said replacing had stopped')
  } else {
    if (stop.attempt !== BACKOFF_SECONDS.length + 1)
      problems.push(
        `the stopped exit was attempt ${stop.attempt}, not ${BACKOFF_SECONDS.length + 1}`,
      )
    const third = waves[BACKOFF_SECONDS.length - 1]
    if (third === undefined || stop.at < third.at)
      problems.push(
        'replacing was said to have stopped before the third replacement started',
      )
    const after = waves.filter((w) => w.at > stop.at)
    if (after.length > 0)
      problems.push(`${after.length} replacement(s) started after the stop`)
    rows.push(`exit ${stop.attempt} at ${rel(stop.at)} (${stop.instanceId}): stopped`)
  }
  return { ok: problems.length === 0, problems, rows }
}
