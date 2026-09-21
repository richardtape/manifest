import { useRef, useState } from 'react'
import type { Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { href } from '../router'
import {
  Field,
  Instant,
  Panel,
  Pill,
  ReadinessItems,
  Refusal,
  useAsync,
  type LaunchItemId,
} from '../ui'

/**
 * §22 STEP 7 — *ask for production, and see what a first launch still needs* — and since
 * P6a Task 17, **what a person can DO about each item**.
 *
 * THE ASKING IS THE DEPLOY PANEL'S *Deploy to production* BUTTON, and this panel is the same
 * checklist without having to press it. **Both go through `<ReadinessItems>`**: `mapError`
 * parses the refusal's checklist through the same representation `GET …/launch-readiness`
 * answers with, so the two carry identical bytes (P5a sitting 11, finding 1) — and one
 * renderer makes a disagreement between them visible rather than plausible. The actions are
 * attached by item `id` and the refusal passes none, so that property survives them.
 *
 * **`ready` IS READ, NEVER RECOMPUTED.** The obvious `items.every(i => !i.blocking)` is the
 * second source of truth this project has paid for seven times (P3, ORIENTATION §9).
 * `launch/readiness.ts` computes it; this renders it.
 *
 * **EVERY ACTION IS AN ADMINISTRATOR'S, AND HIDING IT FROM EVERYONE ELSE IS AN AFFORDANCE,
 * NEVER A CONTROL** — the Fleet link's rule (`app.tsx`). The two records and the rehearsal
 * need `launch:record` in an interactive session (P6a Decision 4) and the platform refuses
 * anybody else `403`; an owner reading this panel is told who acts by each item's `owner`.
 */
export function Launch({
  api,
  projectId,
  isAdmin,
}: {
  api: Api
  projectId: string
  isAdmin: boolean
}) {
  const readiness = useAsync(() => api.getLaunchReadiness(projectId), [projectId])
  return (
    <Panel title="Request production">
      <Refusal error={readiness.error} />
      {readiness.value !== undefined && (
        <Checklist
          readiness={readiness.value}
          actions={{
            ...approvalAction(readiness.value, isAdmin),
            ...(isAdmin
              ? adminActions({
                  api,
                  projectId,
                  readiness: readiness.value,
                  onChanged: readiness.reload,
                })
              : {}),
          }}
        />
      )}
    </Panel>
  )
}

/**
 * ACTIONS BY ITEM ID (P6a Task 17, Step 2).
 *
 * - **`code-review` HAS NONE, deliberately.** Nothing reviews code (D33), and an action
 *   that led somewhere would imply otherwise.
 * - **`domain` and `scans` have none**: the first is `met` unconditionally in Phase 1, and
 *   the second is changed by building again, which the Builds panel above already does.
 * - **`admin-approval` is `approvalAction`'s** below, because it is not an administrator's
 *   alone: an owner may READ the decision, in the administrator's own words.
 */
function adminActions({
  api,
  projectId,
  readiness,
  onChanged,
}: {
  api: Api
  projectId: string
  readiness: Schemas['LaunchReadiness']
  onChanged: () => void
}): Partial<Record<LaunchItemId, React.ReactNode>> {
  const records = href(`/projects/${projectId}/records`)
  const rehearsal = readiness.items.find((i) => i.id === 'rehearsal')
  return {
    'iam-registration': <a {...records}>Record what UBC IAM said</a>,
    'privacy-assessment': <a {...records}>Record what the Privacy Office said</a>,
    ...(rehearsal === undefined
      ? {}
      : {
          rehearsal: (
            <RunRehearsal
              api={api}
              projectId={projectId}
              again={rehearsal.state === 'met'}
              onDone={onChanged}
            />
          ),
        }),
  }
}

/**
 * THE CANDIDATE'S APPROVAL SCREEN (P6a Task 18), linked from `admin-approval` for EVERYONE
 * who can read this checklist — an administrator decides there, and an owner reads what was
 * decided and why (`getApproval` is `project:read`). No candidate, no link: there is no
 * release to approve until something serves staging, and the item's own `why` says so.
 */
function approvalAction(
  readiness: Schemas['LaunchReadiness'],
  isAdmin: boolean,
): Partial<Record<LaunchItemId, React.ReactNode>> {
  if (readiness.candidateReleaseId === null) return {}
  return {
    'admin-approval': (
      <a {...href(`/releases/${readiness.candidateReleaseId}/approval`)}>
        {isAdmin ? 'Review this release' : 'See this release’s approval'}
      </a>
    ),
  }
}

function Checklist({
  readiness,
  actions,
}: {
  readiness: Schemas['LaunchReadiness']
  actions: Partial<Record<LaunchItemId, React.ReactNode>>
}) {
  return (
    <>
      <Field label="Ready for production">
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
        **TWO REFUSALS, IN THIS ORDER** (P6a Task 15). §20 guards `release:promote`, so a
        session that has not re-proved itself in the last ten minutes never reaches §13's
        gate. Since Task 18 the first refusal carries a link that does the re-proving, so
        the sentence names what the person will see and what to press.
      */}
      <p className="hint">
        Pressing <em>Deploy to production</em> above is refused{' '}
        <code>403 STEP_UP_REQUIRED</code> unless you have confirmed it is you in the last
        ten minutes — the refusal carries the link that does it (§20) — and then{' '}
        <code>409 RELEASE_PRODUCTION_GATE_UNAVAILABLE</code> until every blocking item is
        met, which is the refusal that carries this same checklist.
      </p>
      <ReadinessItems items={readiness.items} actions={actions} />
    </>
  )
}

/**
 * D21's rehearsal, run from its checklist item. **~6 SECONDS against the platform and
 * INSTANT against the mock**, so the pending state is one a developer sees in neither — it
 * is written anyway, because a button that looks idle for six seconds gets pressed twice.
 *
 * **THE ANSWER IS A MEASUREMENT, NOT A TICK**, and it is rendered as one: which listener it
 * ran on, what the sign-in answered, and the attributes the assertion ACTUALLY released
 * beside the ones the registration lists. A screen that rendered `passed` alone would throw
 * away what R2 bought (P6a sitting 9's note on Task 17).
 *
 * `passed: false` IS A `200` (`api.ts`), so the pill is keyed on `passed` and never on
 * having got an answer.
 */
function RunRehearsal({
  api,
  projectId,
  again,
  onDone,
}: {
  api: Api
  projectId: string
  again: boolean
  onDone: () => void
}) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Schemas['Rehearsal'] | undefined>(undefined)
  const [error, setError] = useState<unknown>(undefined)
  // ONE key per press (D23.6), reused only if that same press is retried after a failure —
  // a refused request stores nothing, so the retry is safe and a double-click is one run.
  const attemptKey = useRef<string | undefined>(undefined)

  async function run() {
    setRunning(true)
    setError(undefined)
    attemptKey.current ??= api.newKey()
    try {
      setResult(await api.runRehearsal(projectId, attemptKey.current))
      attemptKey.current = undefined
      onDone()
    } catch (e) {
      setError(e)
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => void run()} disabled={running}>
        {running
          ? 'rehearsing…'
          : again
            ? 'Run the rehearsal again'
            : 'Run the rehearsal'}
      </button>{' '}
      {running && (
        <span className="hint">
          deploying the candidate to its production hostname and completing one CWL
          sign-in — a few seconds
        </span>
      )}
      <Refusal error={error} />
      {result !== undefined && <RehearsalEvidence rehearsal={result} />}
    </>
  )
}

export function RehearsalEvidence({ rehearsal }: { rehearsal: Schemas['Rehearsal'] }) {
  const { evidence } = rehearsal
  return (
    <div className="evidence">
      <Field label="Rehearsal">
        <Pill tone={rehearsal.passed ? 'good' : 'bad'}>
          {rehearsal.passed ? 'passed' : 'did not pass'}
        </Pill>{' '}
        <Instant at={rehearsal.ranAt} />
      </Field>
      <Field label="Where it ran">
        <code>{evidence.hostname}</code> on the <strong>{evidence.listener}</strong>{' '}
        listener
      </Field>
      <Field label="The sign-in">
        {evidence.signInStatus === null
          ? 'produced no assertion'
          : `answered ${evidence.signInStatus} at the registered ACS`}
      </Field>
      <Field label="Attributes released">
        {evidence.attributesReleased.length === 0
          ? 'none'
          : [...evidence.attributesReleased].sort().join(', ')}
      </Field>
      {/*
        BOTH LISTS SORTED, because the reader's job is to compare them. The platform answers
        each in its own order — the assertion's, and the manifest's — and the first live
        rehearsal clicked (P6a sitting 10) rendered five names against the same five in a
        different order, which reads as a mismatch until counted.
      */}
      <Field label="Registration lists">
        {[...rehearsal.attributes].sort().join(', ')}
      </Field>
      <Field label="Entity ID">
        <code>{rehearsal.entityId}</code>
      </Field>
      <p className="hint">{evidence.reason}</p>
    </div>
  )
}
