import { useRef, useState } from 'react'
import { ManifestApiError, type Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { href } from '../router'
import { Field, Instant, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * §13's APPROVAL — the screen an administrator decides on, and the screen an owner reads
 * the decision on (P6a Task 18; the preview, P6b Task 10).
 *
 * **THE PREVIEW COMES FIRST, AND IT IS THE RECORD** (Rich, 2026-09-22). An administrator
 * opening this page gets a STORED preview — the diff against the last approved release, the
 * security notes, the reviewer's verdict and the model's summary — taken once and kept. The
 * decision NAMES it, and the platform records exactly its diff. Its id rides in the URL
 * (`?preview=`), so the step-up round trip, which returns to `pathname + search`, comes back
 * to the SAME preview, re-read from the store rather than a fresh one the model wrote
 * differently. P6a's version of this screen said, in its own words, that no client could
 * show the diff before the decision; P6b Task 9's operation is what made it possible.
 *
 * **EVERYTHING HERE IS READ, NOTHING IS RECOMPUTED.** A client-side diff would be a second
 * `describeDiff`, and the one thing worse than no preview is a preview that disagrees with the
 * record. The preview and the record render through ONE component, `DiffView`, so they cannot
 * read differently either.
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
  const preview = usePreview(api, releaseId, isAdmin)

  return (
    <>
      <Panel title="Release for production">
        <Refusal error={release.error} />
        {release.value !== undefined && <ReleaseFacts release={release.value} />}
      </Panel>
      {release.value !== undefined && isAdmin && (
        <Panel title="Preview — what your decision will record">
          <Refusal error={preview.error} />
          {preview.value !== undefined && <PreviewHeader preview={preview.value} />}
          {preview.value !== undefined && <DiffView diff={preview.value.diff} />}
          <Decide
            api={api}
            releaseId={releaseId}
            preview={preview.value}
            onNewPreview={preview.takeNew}
            onDecided={decision.reload}
          />
        </Panel>
      )}
      {release.value !== undefined && (
        <Panel title="Decision">
          <Refusal error={decision.error} />
          {decision.value === null && (
            <p>Nobody has approved or rejected this release yet.</p>
          )}
          {decision.value !== undefined && decision.value !== null && (
            <DecisionRecord approval={decision.value} />
          )}
        </Panel>
      )}
    </>
  )
}

/** The preview's id in the URL — what the step-up link carries back (P6b Read this first 23). */
const PREVIEW_PARAM = 'preview'

function previewInUrl(): string | null {
  return new URLSearchParams(window.location.search).get(PREVIEW_PARAM)
}

/**
 * `replaceState`, not `pushState`: the preview is this page's state, not a place to go back
 * to — and the router listens for `popstate` only, so this changes the URL without a render.
 */
function putPreviewInUrl(id: string | null): void {
  const search = new URLSearchParams(window.location.search)
  if (id === null) search.delete(PREVIEW_PARAM)
  else search.set(PREVIEW_PARAM, id)
  const query = search.toString()
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + (query === '' ? '' : `?${query}`),
  )
}

/**
 * THE ADMINISTRATOR'S PREVIEW (P6b Task 10, Step 2.1). With `?preview=<id>`, RE-READ it — the
 * round trip back from the step-up lands here. With none, or when the read answers `404`
 * (another release's id, or one that is gone), TAKE one and put its id in the URL.
 *
 * **ONE TAKE IN FLIGHT PER RELEASE, SHARED** — because React's `StrictMode` runs this effect
 * twice in development, and the platform's idempotency store is read-then-insert: two POSTs
 * with one key, concurrently, are two previews, and the URL could end up naming the one that
 * is not on the screen. Both runs await the same promise instead. *Take a new preview* drops
 * it, deliberately.
 */
function usePreview(api: Api, releaseId: string, isAdmin: boolean) {
  const taking = useRef<
    { releaseId: string; promise: Promise<Schemas['ApprovalPreview']> } | undefined
  >(undefined)
  const state = useAsync(async () => {
    if (!isAdmin) return undefined
    const named = previewInUrl()
    if (named !== null) {
      try {
        return await api.getApprovalPreview(releaseId, named)
      } catch (e) {
        if (!(e instanceof ManifestApiError && e.code === 'NOT_FOUND')) throw e
      }
    }
    if (taking.current?.releaseId !== releaseId)
      taking.current = {
        releaseId,
        promise: api.createApprovalPreview(releaseId, api.newKey()),
      }
    const current = taking.current
    try {
      const taken = await current.promise
      putPreviewInUrl(taken.id)
      return taken
    } catch (e) {
      // A refused take is not kept: the next attempt asks again.
      if (taking.current === current) taking.current = undefined
      throw e
    }
  }, [releaseId, isAdmin])
  const takeNew = () => {
    taking.current = undefined
    putPreviewInUrl(null)
    state.reload()
  }
  return { ...state, takeNew }
}

function PreviewHeader({ preview }: { preview: Schemas['ApprovalPreview'] }) {
  return (
    <Field label="Taken">
      <Instant at={preview.createdAt} /> by {preview.createdByName}; valid until{' '}
      <Instant at={preview.expiresAt} /> · binds <Digest value={preview.imageDigest} />
    </Field>
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

/** THE RECORD: who decided, what, and why — then the diff they read, through `DiffView`. */
function DecisionRecord({ approval }: { approval: Schemas['Approval'] }) {
  return (
    <>
      <Field label="Decision">
        <Pill tone={approval.decision === 'approved' ? 'good' : 'bad'}>
          {approval.decision}
        </Pill>{' '}
        <Instant at={approval.decidedAt} /> by {approval.decidedByName}
      </Field>
      {approval.reason !== null && <Field label="Reason">{approval.reason}</Field>}
      <Field label="Binds">
        <Digest value={approval.imageDigest} />
      </Field>
      <DiffView diff={approval.diff} />
    </>
  )
}

/**
 * THE DIFF, IN THE ORDER A PERSON DECIDES ON IT: what the model said changed, what it was
 * compared with, which sensitive fields moved and what each means, what did change, what the
 * release asks for, and the reviewer's verdict. **ONE COMPONENT FOR THE PREVIEW AND THE
 * RECORD** (P6b Task 10): the record's diff IS the preview's, and two renderers could make
 * them look different while both looked right.
 */
function DiffView({ diff }: { diff: Schemas['ApprovalDiff'] }) {
  return (
    <>
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
function Summary({ diff }: { diff: Schemas['ApprovalDiff'] }) {
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
      preview was taken. The changes below are the record (§13); a summary is never what
      an approval rests on.
    </em>
  )
}

/**
 * R4(b): **THE VERDICT IS SHOWN EVEN WHEN NOTHING REVIEWED ANYTHING.** A seam nobody can see
 * is a seam nobody will build on, and an administrator approving code that nothing reviewed
 * should be told so. `detail` is the platform's own sentence (`describeVerdict`), so the
 * console adds a pill and nothing else.
 */
function Review({ review }: { review: Schemas['ApprovalDiff']['review'] }) {
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
 * APPROVE OR REJECT, NAMING THE PREVIEW ABOVE. Both are behind §20's step-up: a session that
 * has not re-proved itself in the last ten minutes is refused `403 STEP_UP_REQUIRED`, and
 * `<Refusal>` renders that as the link that does it, returning to `pathname + search` — the
 * preview's id included, so the person comes back to what they read. A refused request stores
 * nothing (D23.6), so the same key is safe to reuse when the person presses again.
 *
 * **A STALE OR EXPIRED PREVIEW IS NEVER RETRIED BY ITSELF.** Its refusal is shown with *Take a
 * new preview*, and the person must read what changed before deciding again: a console that
 * re-previewed and re-sent in one click would record a diff nobody read, which is the thing
 * the preview exists to prevent.
 */
function Decide({
  api,
  releaseId,
  preview,
  onNewPreview,
  onDecided,
}: {
  api: Api
  releaseId: string
  preview: Schemas['ApprovalPreview'] | undefined
  onNewPreview: () => void
  onDecided: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(undefined)
  const approveKey = useRef<string | undefined>(undefined)
  const rejectKey = useRef<string | undefined>(undefined)

  async function decide(kind: 'approve' | 'reject') {
    if (preview === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      if (kind === 'approve') {
        approveKey.current ??= api.newKey()
        await api.approveRelease(
          releaseId,
          { previewId: preview.id, ...(reason === '' ? {} : { reason }) },
          approveKey.current,
        )
        approveKey.current = undefined
      } else {
        rejectKey.current ??= api.newKey()
        // THE REASON IS REQUIRED, AND THE PLATFORM SAYS SO — `400 REQUEST_INVALID` from the
        // schema and the CHECK behind it. Not restated here as a disabled button: a rule the
        // console enforces too is a rule with two copies.
        await api.rejectRelease(
          releaseId,
          { reason, previewId: preview.id },
          rejectKey.current,
        )
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

  const outdated =
    error instanceof ManifestApiError &&
    (error.code === 'APPROVAL_PREVIEW_STALE' || error.code === 'APPROVAL_PREVIEW_EXPIRED')

  return (
    <div className="record-form">
      <h3>Decide</h3>
      <p className="hint">
        Read the preview above: it is exactly what your decision will record. An approval
        binds the digest it names — a rebuild needs a new one.
      </p>
      <Field label="Reason">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="required to reject; recorded either way"
        />
      </Field>
      <button
        type="button"
        disabled={busy || preview === undefined}
        onClick={() => void decide('approve')}
      >
        Approve for production
      </button>{' '}
      <button
        type="button"
        disabled={busy || preview === undefined}
        onClick={() => void decide('reject')}
      >
        Reject
      </button>
      <Refusal error={error} />
      {outdated && (
        <p>
          <button
            type="button"
            onClick={() => {
              setError(undefined)
              approveKey.current = undefined
              rejectKey.current = undefined
              onNewPreview()
            }}
          >
            Take a new preview
          </button>{' '}
          <span className="hint">then read it before deciding again.</span>
        </p>
      )}
    </div>
  )
}
