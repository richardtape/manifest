import { useRef, useState } from 'react'
import { ManifestApiError, type Schemas, type StreamFrame } from '@manifest/contract'
import type { Api } from '../api'
import { approvalLinkWanted } from '../approval-state'
import { dayInWords, signOffAction } from '../launch-records-state'
import { href } from '../router'
import { instanceFrameCount } from './deploy'
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
 * **EVERY ACTION BUT THE REHEARSAL IS AN ADMINISTRATOR'S, AND HIDING IT FROM EVERYONE ELSE IS
 * AN AFFORDANCE, NEVER A CONTROL** — the Fleet link's rule (`app.tsx`). The two records need
 * `launch:record` in an interactive session (P6a Decision 4) and the platform refuses anybody
 * else `403`; an owner reading this panel is told who acts by each item's `owner`. **The
 * rehearsal is EVERYONE's who can read this panel** since the launch path plan's Task 6b: the
 * owner, a collaborator and an administrator all hold `launch:rehearse`, and a stranger is
 * refused the project before this screen renders.
 */
export function Launch({
  api,
  projectId,
  isAdmin,
  frames,
  launchedAt,
}: {
  api: Api
  projectId: string
  isAdmin: boolean
  /** The screen's one stream, so the checklist is re-read when a deploy changes it. */
  frames: StreamFrame[]
  /**
   * WHEN it launched, from the project (P6b Task 6) — for the date only. WHETHER it has
   * launched is the checklist's own `launched`, which is re-read on every deploy frame; the
   * project is read once, so it can lag the launch that just happened, and then the date is
   * simply not shown.
   */
  launchedAt: string | null | undefined
}) {
  // D23.2, AS THE DEPLOY PANEL ABOVE DOES IT: re-read when a frame says it changed. The
  // candidate is "the release serving staging", which only a deploy can change — and until
  // P6a sitting 11 this panel read the checklist ONCE, so a person who deployed to staging
  // on this screen was told "nothing is serving staging yet" directly beneath a staging
  // environment reading `healthy`. Found by clicking; every gate was green through it.
  const instanceFrames = instanceFrameCount(frames)
  const readiness = useAsync(
    () => api.getLaunchReadiness(projectId),
    [projectId, instanceFrames],
  )
  // THE CANDIDATE'S NEWEST DECISION — read only to know whether it was REJECTED, which is final
  // for that release and so the one unmet state where asking for sign-off is no errand at all.
  // `404` is "nobody has decided", and it is not an error here.
  const candidate = readiness.value?.candidateReleaseId ?? null
  const decision = useAsync(async () => {
    if (candidate === null) return null
    try {
      return (await api.getApproval(candidate)).decision
    } catch (error) {
      if (error instanceof ManifestApiError && error.status === 404) return null
      throw error
    }
  }, [candidate, instanceFrames])
  return (
    <Panel title="Request production">
      <Refusal error={readiness.error} />
      {/*
        THE APPROVAL READ'S OWN FAILURE IS SHOWN (the whole-branch review's finding 17): `404` is "nobody
        has decided" and handled above; anything else would otherwise hide *Ask an administrator to sign
        this off* with nothing saying why.
      */}
      <Refusal error={decision.error} />
      {readiness.value !== undefined && (
        <Checklist
          readiness={readiness.value}
          launchedAt={launchedAt}
          actions={{
            ...approvalAction(
              readiness.value,
              isAdmin,
              <AskForSignOff
                api={api}
                readiness={readiness.value}
                decision={decision.value}
                onAsked={readiness.reload}
              />,
            ),
            ...rehearsalAction({
              api,
              projectId,
              readiness: readiness.value,
              onChanged: readiness.reload,
            }),
            ...recordsActions(projectId, isAdmin),
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
 * - **`rehearsal` is `rehearsalAction`'s**, because since the launch path plan's Task 6b it is
 *   not an administrator's alone either: it is anybody's who can read this checklist.
 */
function recordsActions(
  projectId: string,
  isAdmin: boolean,
): Partial<Record<LaunchItemId, React.ReactNode>> {
  const records = href(`/projects/${projectId}/records`)
  // THE OWNER'S ERRAND SINCE THE LAUNCH PATH PLAN'S TASKS 9–11: Manifest drafts each record and the
  // owner sends it and says so — on the same screen where an administrator records UBC's answer.
  return isAdmin
    ? {
        'iam-registration': <a {...records}>Record what UBC IAM said</a>,
        'privacy-assessment': <a {...records}>Record what the Privacy Office said</a>,
      }
    : {
        // NEUTRAL, because what the owner may do depends on the record, not the item: a draft to
        // send, a record with UBC to wait on, or one registered (found clicking — *"Draft it"* beside
        // a registration that is met).
        'iam-registration': <a {...records}>Open the launch records</a>,
        'privacy-assessment': <a {...records}>Open the launch records</a>,
      }
}

/**
 * D21's rehearsal, for EVERYONE who can read this checklist (the launch path plan's Task 6b): the
 * owner, a collaborator and an administrator hold `launch:rehearse`. An affordance like the rest —
 * the platform refuses a delegated token, and a launched app has no `rehearsal` item to act on.
 * Since Task 6c it needs a step-up, which `RunRehearsal`'s `<Refusal>` offers as a link.
 */
function rehearsalAction({
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
  const rehearsal = readiness.items.find((i) => i.id === 'rehearsal')
  return rehearsal === undefined
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
      }
}

/**
 * THE CANDIDATE'S APPROVAL SCREEN (P6a Task 18), linked from `admin-approval` for EVERYONE
 * who can read this checklist — an administrator decides there, and an owner reads what was
 * decided and why (`getApproval` is `project:read`). No candidate, no link: there is no
 * release to approve until something serves staging, and the item's own `why` says so.
 *
 * **AND NO LINK FOR A SELF-SERVE RELEASE** (P6b sitting 7's F15; the D5 plan's Task 14):
 * *"See this release's approval"* sent a person to a page for a decision nobody will make.
 * `approvalLinkWanted` reads it from the checklist's own facts.
 */
function approvalAction(
  readiness: Schemas['LaunchReadiness'],
  isAdmin: boolean,
  ask: React.ReactNode,
): Partial<Record<LaunchItemId, React.ReactNode>> {
  if (readiness.candidateReleaseId === null || !approvalLinkWanted(readiness)) return {}
  return {
    'admin-approval': (
      <>
        <a {...href(`/releases/${readiness.candidateReleaseId}/approval`)}>
          {isAdmin ? 'Review this release' : 'See this release’s approval'}
        </a>
        {ask}
      </>
    ),
  }
}

/**
 * *ASK AN ADMINISTRATOR TO SIGN THIS OFF* (FE-25; the launch path plan's Tasks 12 and 13; the review's
 * M6 — until this, nothing told an owner or an agent that asking was theirs to do). Offered by
 * `signOffAction` — while the item is unmet, something serves staging, nobody has asked and the
 * release was not rejected — to everyone who can read this checklist: the owner, a collaborator and
 * an administrator hold `approval:request`, and the platform refuses anybody else.
 *
 * **THE NOTE IS FOR ADMINISTRATORS ALONE**: it is shown in their queue and never answered back, so
 * the form says so rather than letting a person think their colleagues will read it.
 */
function AskForSignOff({
  api,
  readiness,
  decision,
  onAsked,
}: {
  api: Api
  readiness: Schemas['LaunchReadiness']
  decision: 'approved' | 'rejected' | null | undefined
  onAsked: () => void
}) {
  const [note, setNote] = useState('')
  // THE ANSWER'S OWN WORD THAT IT TOOK — the checklist is re-read as well, and says who asked.
  const [asked, setAsked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(undefined)
  const attemptKey = useRef<string | undefined>(undefined)
  // Until the decision is read, offer nothing: a button that appears and then vanishes after a
  // rejection is read would be pressed in between.
  if (decision === undefined) return null
  const offer = signOffAction(readiness, decision)
  if (offer !== 'ask') return null
  const releaseId = readiness.candidateReleaseId!

  async function ask() {
    setBusy(true)
    setError(undefined)
    attemptKey.current ??= api.newKey()
    try {
      const request = await api.requestApproval(
        releaseId,
        note.trim() === '' ? {} : { note: note.trim() },
        attemptKey.current,
      )
      attemptKey.current = undefined
      setAsked(request.createdAt)
      onAsked()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ask">
      <label>
        A note for the administrators{' '}
        <span className="hint">(optional — only administrators see it)</span>
        <br />
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <br />
      <button type="button" disabled={busy} onClick={() => void ask()}>
        {busy ? 'asking…' : 'Ask an administrator to sign this off'}
      </button>{' '}
      {asked !== null && (
        <span className="ok">
          Asked — it waits in the administrators’ queue, asked on {dayInWords(asked)}.
        </span>
      )}
      <Refusal error={error} />
    </div>
  )
}

function Checklist({
  readiness,
  launchedAt,
  actions,
}: {
  readiness: Schemas['LaunchReadiness']
  launchedAt: string | null | undefined
  actions: Partial<Record<LaunchItemId, React.ReactNode>>
}) {
  return (
    <>
      {/*
        WHICH OF D9's TWO CLAUSES THIS IS (P6b Task 6). Before a launch, the first launch's
        checklist; after it, a release goes to production with no administrator unless it
        changes a sensitive field — and then the fields are named, because they are what the
        administrator will be asked about.
      */}
      <Field label="Launched">
        {readiness.launched ? (
          <>
            <Pill tone="good">yes</Pill>
            {launchedAt ? (
              <>
                {' '}
                <Instant at={launchedAt} />
              </>
            ) : null}{' '}
            <span className="hint">
              — releases go to production without an administrator unless they change a
              sensitive field (D9)
            </span>
          </>
        ) : (
          <span className="hint">
            not yet — a first launch needs every blocking item below (D9)
          </span>
        )}
      </Field>
      {readiness.sensitiveFields.length > 0 && (
        <Field label="Sensitive fields changed">
          {readiness.sensitiveFields.map((f) => (
            <code key={f}>{f} </code>
          ))}
          <span className="hint">since the last approved release</span>
        </Field>
      )}
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
        {readiness.launched && (
          <>
            {' '}
            Once launched, a sensitive change is refused{' '}
            <code>409 RELEASE_REESCALATED</code> until an administrator approves it, and a
            release that is not the one serving staging{' '}
            <code>409 RELEASE_NOT_STAGED</code>.
          </>
        )}
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
          deploying the candidate to its production hostname, completing one CWL sign-in
          and taking it down again — a few seconds
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
