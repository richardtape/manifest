import { useRef, useState } from 'react'
import { ManifestApiError, type Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { href } from '../router'
import { Field, Instant, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * §13's APPROVAL — the screen an administrator decides on, and the screen an owner reads
 * the decision on (P6a Task 18).
 *
 * **WHAT A PERSON CAN READ BEFORE DECIDING, AND WHAT THEY CANNOT — MEASURED, AND THE REASON
 * THIS SCREEN IS LAID OUT AS IT IS.** §13 calls the record *"the exact diff shown at decision
 * time"*. The API computes that diff — the changes since the last approved release, the
 * AI-written summary and the reviewer's verdict — INSIDE `POST …/approve` and `…/reject`
 * (`buildDiffSnapshot` has exactly one caller, `decide()` in `api/routes/releases.ts`), and
 * `GET …/approval` answers `404` until somebody has decided. **So no client can show the
 * diff before the decision**: it is computed at decision time and shown after it. That is
 * D22's question answering *"not quite"* for the first time — not an operation no client
 * calls, but one no client can make (P6a sitting 10). This screen does not invent the
 * missing half: it shows what the API does expose before a decision — the release's digest,
 * its scan and the production configuration the diff is computed FROM — says plainly that
 * the diff arrives with the decision, and renders the stored snapshot the moment it exists.
 *
 * **EVERYTHING HERE IS READ, NOTHING IS RECOMPUTED.** A client-side diff against an earlier
 * release would be a second `describeDiff`, and the one thing worse than no preview is a
 * preview that disagrees with the record.
 */
export function Approval({
  api,
  releaseId,
  isAdmin,
}: {
  api: Api
  releaseId: string
  isAdmin: boolean
}) {
  const release = useAsync(() => api.getRelease(releaseId), [releaseId])
  // `404` IS A STATE HERE, NOT A REFUSAL — *nobody has decided* — but ONLY once the release
  // itself has been read: a release this person may not see answers the same `NOT_FOUND`
  // (the enumeration-oracle rule), and the panel below renders only when `release` did.
  const decision = useAsync(async () => {
    try {
      return await api.getApproval(releaseId)
    } catch (e) {
      if (e instanceof ManifestApiError && e.code === 'NOT_FOUND') return null
      throw e
    }
  }, [releaseId])

  return (
    <>
      <Panel title="Release for production">
        <Refusal error={release.error} />
        {release.value !== undefined && <ReleaseFacts release={release.value} />}
      </Panel>
      {release.value !== undefined && (
        <Panel title="Decision">
          <Refusal error={decision.error} />
          {decision.value === null && (
            <p>Nobody has approved or rejected this release yet.</p>
          )}
          {decision.value !== undefined && decision.value !== null && (
            <DecisionRecord approval={decision.value} />
          )}
          {isAdmin && (
            <Decide api={api} releaseId={releaseId} onDecided={decision.reload} />
          )}
        </Panel>
      )}
    </>
  )
}

/** Truncated for reading, whole on hover — a digest is compared, not read. */
function Digest({ value }: { value: string }) {
  return <code title={value}>{value.length > 19 ? `${value.slice(0, 19)}…` : value}</code>
}

function ReleaseFacts({ release }: { release: Schemas['Release'] }) {
  const production = release.config.production
  return (
    <>
      <Field label="Release">
        <code>{release.id}</code> made <Instant at={release.createdAt} /> ·{' '}
        <a {...href(`/projects/${release.projectId}`)}>back to the project</a>
      </Field>
      <Field label="Image digest">
        {/* §13: THE BINDING. What an approval covers, and what the deploy verifies before
            anything starts. */}
        <Digest value={release.imageDigest} />
      </Field>
      <Field label="Scan">
        {release.scan === null ? (
          'not recorded — this build predates scanning'
        ) : (
          <>
            {release.scan.fixable.critical} critical and {release.scan.fixable.high} high
            with a published fix; {release.scan.unfixable.critical} critical and{' '}
            {release.scan.unfixable.high} high without one
            {release.scan.stale && ' — against a STALE vulnerability database'}
          </>
        )}
      </Field>
      <p className="hint">
        What this release would run in production — the configuration the recorded diff is
        computed from:
      </p>
      <Field label="Services">
        {production.services.length === 0
          ? 'none'
          : production.services.map((s) => `${s.type}@${s.version}`).join(', ')}
      </Field>
      <Field label="Sign-in">
        {production.auth.provider === 'none'
          ? 'nobody signs in'
          : `CWL, asking for ${[...production.auth.attributes].sort().join(', ')}`}
      </Field>
      <Field label="Resources">
        {production.resources.cpu} CPU, {production.resources.memory} memory,{' '}
        {production.resources.disk} disk, {production.resources.pids} processes
      </Field>
      <Field label="Egress">
        {production.egressAllow.length === 0 ? 'none' : production.egressAllow.join(', ')}
      </Field>
      <Field label="Classification">{production.classification}</Field>
    </>
  )
}

/**
 * THE RECORD, IN THE ORDER A PERSON DECIDES ON IT: the digest it binds, what the model said
 * changed, what did change, what the release asks for, and the reviewer's verdict.
 */
function DecisionRecord({ approval }: { approval: Schemas['Approval'] }) {
  const { diff } = approval
  return (
    <>
      <Field label="Decision">
        <Pill tone={approval.decision === 'approved' ? 'good' : 'bad'}>
          {approval.decision}
        </Pill>{' '}
        <Instant at={approval.decidedAt} /> by <code>{approval.decidedBy}</code>
      </Field>
      {approval.reason !== null && <Field label="Reason">{approval.reason}</Field>}
      <Field label="Binds">
        <Digest value={approval.imageDigest} />
      </Field>
      <Field label="Summary">
        <Summary diff={diff} />
        {/* D33's coverage limit, stated where the summary is read (P6b Task 8, R4(d)). */}
        {diff.coverage !== null && <p className="hint">{diff.coverage}</p>}
      </Field>
      <Field label="Compared with">
        {diff.baselineReleaseId === null ? (
          'no earlier approved release'
        ) : (
          <a {...href(`/releases/${diff.baselineReleaseId}/approval`)}>
            <code>{diff.baselineReleaseId.slice(0, 8)}</code>, the last approved release
          </a>
        )}
      </Field>
      <Field label="Sensitive fields">
        {diff.sensitiveFields.length === 0
          ? 'none changed'
          : diff.sensitiveFields.join(', ')}
      </Field>
      {/*
       * R4(d)'s deterministic half: one line per changed field, in the platform's words and
       * present whether or not the model answered — the security reading is not the model's.
       */}
      {diff.security.length > 0 && (
        <Field label="Security notes">
          <ul>
            {diff.security.map((s) => (
              <li key={s.field}>
                <code>{s.field}</code>: {s.note}
              </li>
            ))}
          </ul>
        </Field>
      )}
      <Field label="Changes">
        {diff.changes.length === 0 ? (
          'none recorded'
        ) : (
          <ul>
            {diff.changes.map((c) => (
              <li key={c.path}>
                <code>{c.path}</code>: {c.from} → {c.to} — {c.summary}
              </li>
            ))}
          </ul>
        )}
      </Field>
      <Field label="Services">
        {diff.services.length === 0 ? 'none' : diff.services.join(', ')}
      </Field>
      <Field label="Attributes">
        {diff.attributes.length === 0 ? 'none' : diff.attributes.join(', ')}
      </Field>
      <Field label="Resources">
        {Object.entries(diff.resources)
          .map(([k, v]) => `${k} ${v ?? 'unset'}`)
          .join(', ')}
      </Field>
      <Field label="Code review">
        <Review review={diff.review} />
      </Field>
    </>
  )
}

/**
 * **NEVER A BLANK SPACE** (the plan's Step 1). An empty summary reads as *nothing changed*,
 * which is the opposite of what an unreachable model means. Each of the three sources has
 * its own sentence, keyed on `summarySource` rather than on `summary` being null — the
 * source is the platform's statement of WHY, and the null alone does not say.
 */
function Summary({ diff }: { diff: Schemas['Approval']['diff'] }) {
  if (diff.summarySource === 'llm' && diff.summary !== null) return <>{diff.summary}</>
  // P6b Task 8: the platform's fixed sentence for an empty diff, which no model wrote — NOT
  // the "could not be produced" fallback below, which would send a person looking for an outage.
  if (diff.summarySource === 'no-changes')
    return <em>Nothing in manifest.yaml changed since the last approved release.</em>
  if (diff.summarySource === 'no-previous-release')
    return (
      <em>
        A first launch: there is no earlier approved release to compare with, so there is
        nothing to summarise.
      </em>
    )
  return (
    <em>
      A summary could not be produced — the language model could not be reached when this
      was decided. The changes below are the record (§13); a summary is never what an
      approval rests on.
    </em>
  )
}

/**
 * R4(b): **THE VERDICT IS SHOWN EVEN WHEN NOTHING REVIEWED ANYTHING.** A seam nobody can see
 * is a seam nobody will build on, and an administrator approving code that nothing reviewed
 * should be told so. `detail` is the platform's own sentence (`describeVerdict`), so the
 * console adds a pill and nothing else.
 */
function Review({ review }: { review: Schemas['Approval']['diff']['review'] }) {
  return (
    <>
      <Pill tone={review.state === 'clean' ? 'good' : 'plain'}>
        {review.state === 'not_performed' ? 'not performed' : review.state}
      </Pill>{' '}
      {review.detail} <span className="hint">Reviewer: {review.reviewer}.</span>
    </>
  )
}

/**
 * APPROVE OR REJECT. Both are behind §20's step-up: a session that has not re-proved itself
 * in the last ten minutes is refused `403 STEP_UP_REQUIRED`, and `<Refusal>` renders that as
 * the link that does it, returning here. A refused request stores nothing (D23.6), so the
 * same key is safe to reuse when the person presses again after stepping up.
 */
function Decide({
  api,
  releaseId,
  onDecided,
}: {
  api: Api
  releaseId: string
  onDecided: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(undefined)
  const approveKey = useRef<string | undefined>(undefined)
  const rejectKey = useRef<string | undefined>(undefined)

  async function decide(kind: 'approve' | 'reject') {
    setBusy(true)
    setError(undefined)
    try {
      if (kind === 'approve') {
        approveKey.current ??= api.newKey()
        await api.approveRelease(
          releaseId,
          reason === '' ? {} : { reason },
          approveKey.current,
        )
        approveKey.current = undefined
      } else {
        rejectKey.current ??= api.newKey()
        // THE REASON IS REQUIRED, AND THE PLATFORM SAYS SO — `400 REQUEST_INVALID` from the
        // schema and the CHECK behind it. Not restated here as a disabled button: a rule the
        // console enforces too is a rule with two copies.
        await api.rejectRelease(releaseId, { reason }, rejectKey.current)
        rejectKey.current = undefined
      }
      setReason('')
      onDecided()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="record-form">
      <h3>Decide</h3>
      <p className="hint">
        The diff against the last approved release, its summary and the reviewer’s verdict
        are computed and stored <strong>at the moment you decide</strong> (§13) — the API
        offers no preview of them, so they appear above once you have. Read the release’s
        production configuration first. An approval binds the digest above: a rebuild
        needs a new one.
      </p>
      <Field label="Reason">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="required to reject; recorded either way"
        />
      </Field>
      <button type="button" disabled={busy} onClick={() => void decide('approve')}>
        Approve for production
      </button>{' '}
      <button type="button" disabled={busy} onClick={() => void decide('reject')}>
        Reject
      </button>
      <Refusal error={error} />
    </div>
  )
}
