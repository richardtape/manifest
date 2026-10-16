import type { Schemas } from '@manifest/contract'

/**
 * §24'S LOAD REHEARSAL ON THE LAUNCH CHECKLIST, AS PURE FUNCTIONS (the load rehearsal plan's Task 7). There is no DOM
 * test tier (P5c Decision 7), so what the button offers and what a run's result says are decided here and tested in
 * the `packages` project — and the screen is clicked. `launch-records-state.ts` is the precedent.
 */

/**
 * WHAT THE CHECKLIST OFFERS: the run, only where the checklist has a `load-rehearsal` item — a large course's app or a
 * public one, which the platform decides (a class app's checklist has none, and the platform refuses it `409
 * LOAD_REHEARSAL_NOT_NEEDED`) — *again* once the item is met. An affordance, never a control: the platform decides who
 * may run it (the owner, a collaborator, an administrator — and never a delegated token).
 */
export function loadRehearsalOffer(
  readiness: Pick<Schemas['LaunchReadiness'], 'items'>,
): 'run' | 'again' | null {
  const item = readiness.items.find((i) => i.id === 'load-rehearsal')
  if (item === undefined) return null
  return item.state === 'met' ? 'again' : 'run'
}

/** How long to wait before reading a run again — the platform's `pollAfterSeconds`; null once it has ended. */
export function pollDelayMs(
  run: Pick<Schemas['LoadRehearsal'], 'state' | 'pollAfterSeconds'>,
): number | null {
  if (run.state !== 'running') return null
  return (run.pollAfterSeconds ?? 10) * 1_000
}

/** A share as the platform's judge writes it: one decimal, rounded DOWN, so 98.99% never reads as 99%. */
const percent = (ratio: number): string =>
  `${String(Math.floor(ratio * 1000 + 1e-9) / 10)}%`
/** Milliseconds as seconds, to two decimals at most — the judge's own. */
const seconds = (ms: number): string => String(Math.round(ms / 10) / 100)

/**
 * A RUN IN WORDS: *"Passed: 100% answered, p95 0.01 s"*, or the reason it did not — the first rule it broke, with its
 * number, in the platform's own words — or that it is still running. **A `teardown_failed` run is said NOT to count**,
 * whatever its own judgement: staging was not given back, and the checklist's item stays unmet.
 */
export function loadRehearsalWords(run: Schemas['LoadRehearsal']): string {
  const reason = run.evidence?.reason ?? 'no reason was recorded'
  switch (run.state) {
    case 'running':
      return run.granted === null
        ? 'Running — staging is being given production’s shape.'
        : `Running — ${run.granted.count} instances at production’s size are taking the arrival.`
    case 'passed':
      return run.evidence?.answeredRatio === undefined || run.evidence.p95Ms === undefined
        ? `Passed: ${reason}`
        : `Passed: ${percent(run.evidence.answeredRatio)} answered, p95 ${seconds(run.evidence.p95Ms)} s`
    case 'failed':
      return `Did not pass: ${reason}`
    case 'teardown_failed':
      return `Does not count: staging could not be given back its own shape afterwards — ${reason}`
    case 'abandoned':
      return `Not finished: ${reason}`
  }
}
