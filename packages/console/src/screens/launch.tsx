import type { Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { Field, Panel, Pill, ReadinessItems, Refusal, useAsync } from '../ui'

/**
 * §22 STEP 7 — *ask for production, and see what a first launch still needs.*
 *
 * THE ASKING IS THE DEPLOY PANEL'S *Deploy to production* BUTTON, which is refused `409
 * RELEASE_PRODUCTION_GATE_UNAVAILABLE` and whose envelope carries this very checklist. This
 * panel is the same answer without having to press it, so a person can read what production
 * needs before they ask. **Both go through `<ReadinessItems>`**: `mapError` parses the
 * refusal's checklist through the same representation `GET …/launch-readiness` answers with,
 * so the two carry identical bytes (P5a sitting 11, finding 1) — and one renderer makes a
 * disagreement between them visible rather than plausible.
 *
 * **`ready` IS READ, NEVER RECOMPUTED.** The obvious `items.every(i => !i.blocking)` is green
 * today and wrong the moment Phase 2 gates on this: §13's readiness is the platform's
 * judgement, and a client that re-derives it is the second source of truth this project has
 * paid for seven times (P3, ORIENTATION §9). `launch/readiness.ts` computes it; this renders
 * it.
 *
 * WHAT IT SAYS ON A PROJECT WITH NOTHING SERVING STAGING: `scans` is the ONE item P5a
 * computes, and with no healthy staging instance it answers `unmet` — *"Nothing is serving in
 * staging yet… Deploy to staging first — production runs exactly what staging ran (§13)."*
 * That is the honest answer and not a fault.
 */
export function Launch({ api, projectId }: { api: Api; projectId: string }) {
  const readiness = useAsync(() => api.getLaunchReadiness(projectId), [projectId])
  return (
    <Panel title="Request production">
      <Refusal error={readiness.error} />
      {readiness.value !== undefined && <Checklist readiness={readiness.value} />}
    </Panel>
  )
}

function Checklist({ readiness }: { readiness: Schemas['LaunchReadiness'] }) {
  return (
    <>
      <Field label="Ready for production">
        {/* THE PLATFORM'S FIELD. `false` throughout Phase 1, honestly (P5a Task 15). */}
        <Pill tone={readiness.ready ? 'good' : 'plain'}>
          {readiness.ready ? 'yes' : 'not yet'}
        </Pill>
      </Field>
      <Field label="Candidate release">
        {/*
          §13: PRODUCTION RUNS EXACTLY WHAT STAGING RAN, so the candidate is whatever is
          serving staging — `null` until something is. It is the release a production deploy
          would promote, and naming it is what makes the checklist actionable rather than a
          list of chores.
        */}
        {readiness.candidateReleaseId === null ? (
          <span className="hint">
            none — nothing is serving staging yet, so there is no release to promote
          </span>
        ) : (
          <code>{readiness.candidateReleaseId}</code>
        )}
      </Field>
      {/*
        **TWO REFUSALS NOW, IN THIS ORDER, SINCE P6a TASK 15** — and this copy said only the
        second until sitting 9 made the first true. §20 guards `release:promote`, so a
        session that has not re-proved itself in the last ten minutes never reaches §13's
        gate and never sees this checklist in a refusal. Task 18 builds the step-up
        navigation that gets past it; until then the button's first answer is the `403`.
      */}
      <p className="hint">
        Pressing <em>Deploy to production</em> above is refused{' '}
        <code>403 STEP_UP_REQUIRED</code> until you have signed in again in the last ten
        minutes (§20) — and then <code>409 RELEASE_PRODUCTION_GATE_UNAVAILABLE</code>{' '}
        until every blocking item is met, which is the refusal that carries this same
        checklist.
      </p>
      <ReadinessItems items={readiness.items} />
    </>
  )
}
