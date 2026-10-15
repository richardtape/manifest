import { ManifestApiError, type Schemas } from '@manifest/contract'
import { stepUpUrl } from './auth'
import { dayInWords } from './time'

/**
 * THE RELEASE APPROVAL PANE'S STATES, AS A PURE REDUCER (§26, §13; the design's §3.5). An approval
 * binds an image digest to an administrator's decision on a STORED preview: the preview is taken on a
 * click, never on opening (opening an item must call no model and leave no row attributed to anyone),
 * and every way the decision can go wrong — twice, after a lost answer, through the step-up, on a
 * preview that went stale, under another administrator — is a transition here, tested in Node.
 */
export type Verb = 'approve' | 'reject'

export type ApprovalPane =
  /** The facts are read; no preview yet. */
  | { at: 'reading' }
  | { at: 'previewing' }
  | { at: 'previewed'; preview: Schemas['ApprovalPreview'] }
  /** A decision in flight under `key` — the `Idempotency-Key` of this one operator action. */
  | { at: 'deciding'; preview: Schemas['ApprovalPreview']; verb: Verb; key: string }
  /** `403 STEP_UP_REQUIRED`: leaving for a fresh sign-in that comes back to this preview (`to`). */
  | { at: 'stepping-up'; preview: Schemas['ApprovalPreview']; to: string }
  | { at: 'decided'; approval: Schemas['Approval']; byYou: boolean }
  /** It left the queue while open: decided by someone else (`approval`), or no longer asked (null). */
  | { at: 'gone-elsewhere'; approval: Schemas['Approval'] | null }
  /**
   * Refused, or no answer. `message` says what is still true; `error` is shown by `<Refusal>`.
   * `retry` is set only when the decision MAY have been recorded — no answer, or a `5xx` — and is
   * then sent again under the SAME key, so the platform replays it rather than recording a second.
   */
  | {
      at: 'refused'
      preview: Schemas['ApprovalPreview'] | null
      code: string
      message: string
      error: unknown
      retry: { verb: Verb; key: string } | null
    }

export type PaneEvent =
  /** The operator asked for a preview (or a new one). */
  | { type: 'take-preview' }
  /** A preview was taken, or read back by its id after the step-up's return. */
  | { type: 'previewed'; preview: Schemas['ApprovalPreview'] }
  /** The operator pressed Approve or Reject; `key` is a FRESH key, used unless a retry holds one. */
  | { type: 'decide'; verb: Verb; key: string }
  | { type: 'decided'; approval: Schemas['Approval'] }
  /** A call failed: a refusal, or no answer at all. */
  | { type: 'failed'; error: unknown }
  /** The queue's re-read or the stream says it left: `getApproval`'s answer. */
  | { type: 'gone'; approval: Schemas['Approval'] | null }

export const STALE_WORDS =
  'Something moved since you read the preview. Nothing was recorded, and the release is untouched. Take a new one.'
export const EXPIRED_WORDS =
  'The preview is more than 30 minutes old. Nothing was recorded. Take a new one.'
const NO_ANSWER_WORDS =
  'Manifest didn’t answer, so whether it was recorded isn’t known. Trying again sends the same decision under the same key: it is recorded once.'

/** The refused state for a failed call: what it means, and whether the same key may be sent again. */
function refusedBy(
  error: unknown,
  preview: Schemas['ApprovalPreview'] | null,
  sent: { verb: Verb; key: string } | null,
  nothingRecorded: string,
): ApprovalPane {
  const answered = error instanceof ManifestApiError && error.status < 500
  const code = error instanceof ManifestApiError ? error.code : 'NO_ANSWER'
  if (!answered)
    return {
      at: 'refused',
      preview,
      code,
      message: sent === null ? nothingRecorded : NO_ANSWER_WORDS,
      error,
      retry: sent,
    }
  const message =
    code === 'APPROVAL_PREVIEW_STALE'
      ? STALE_WORDS
      : code === 'APPROVAL_PREVIEW_EXPIRED'
        ? EXPIRED_WORDS
        : nothingRecorded
  return { at: 'refused', preview, code, message, error, retry: null }
}

/**
 * THE ONE TRANSITION FUNCTION. Anything not listed leaves the pane as it is (the same object):
 * a second press while one is in flight, a preview's late answer, a decision on a stale preview —
 * and, above all, a "gone" read over the operator's OWN decision, in flight or made.
 */
export function paneAfter(pane: ApprovalPane, event: PaneEvent): ApprovalPane {
  switch (event.type) {
    case 'take-preview':
      return pane.at === 'reading' || pane.at === 'previewed' || pane.at === 'refused'
        ? { at: 'previewing' }
        : pane
    case 'previewed':
      return pane.at === 'reading' || pane.at === 'previewing'
        ? { at: 'previewed', preview: event.preview }
        : pane
    case 'decide':
      if (pane.at === 'previewed')
        return { at: 'deciding', preview: pane.preview, verb: event.verb, key: event.key }
      // After no answer the same action is sent under the key already sent (D23.6); a different
      // action is a different decision, with its own. A stale, expired or refused preview is never
      // decided on again: the only way on is a new preview, taken by the operator.
      if (pane.at === 'refused' && pane.retry !== null && pane.preview !== null)
        return {
          at: 'deciding',
          preview: pane.preview,
          verb: event.verb,
          key: event.verb === pane.retry.verb ? pane.retry.key : event.key,
        }
      return pane
    case 'decided':
      return pane.at === 'deciding'
        ? { at: 'decided', approval: event.approval, byYou: true }
        : pane
    case 'failed':
      if (pane.at === 'deciding') {
        if (
          event.error instanceof ManifestApiError &&
          event.error.code === 'STEP_UP_REQUIRED'
        )
          return {
            at: 'stepping-up',
            preview: pane.preview,
            to: stepUpUrl(pane.preview.releaseId, pane.preview.id),
          }
        return refusedBy(
          event.error,
          pane.preview,
          { verb: pane.verb, key: pane.key },
          'Nothing was recorded.',
        )
      }
      if (pane.at === 'previewing' || pane.at === 'reading')
        return refusedBy(
          event.error,
          null,
          null,
          'No preview was taken, and nothing was recorded.',
        )
      return pane
    case 'gone':
      return pane.at === 'deciding' || pane.at === 'stepping-up' || pane.at === 'decided'
        ? pane
        : { at: 'gone-elsewhere', approval: event.approval }
  }
}

/** What became of a release that left the queue while its pane was open. */
export function goneWords(approval: Schemas['Approval'] | null): string {
  if (approval === null) return 'This is no longer waiting on us.'
  const did = approval.decision === 'approved' ? 'approved' : 'rejected'
  return `${approval.decidedByName} ${did} this on ${dayInWords(approval.decidedAt)}.`
}

/**
 * Where the reason typed into the pane is kept across the step-up's full-page round trip: by release
 * AND preview, so two tabs on two releases keep two reasons and a new preview starts clean.
 */
export function draftReasonKey(releaseId: string, previewId: string): string {
  return `manifest.admin.approval-reason:${releaseId}:${previewId}`
}

/**
 * THE REASON SURVIVES THE ROUND TRIP — the reference console's `reasonDraft` (P6b F12). The draft
 * lives in `sessionStorage`, **never in the URL**, which the edge logs and the IdP carries, and a
 * reason can name a person or a ticket. **STORAGE CAN THROW** — a private window, blocked site data —
 * and then the draft is simply not kept: the pane works, and nothing throws into a render.
 */
export function reasonDraft(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
  key: string,
): { read(): string; write(v: string): void; clear(): void } {
  return {
    read() {
      try {
        return storage?.getItem(key) ?? ''
      } catch {
        return ''
      }
    },
    write(v) {
      try {
        if (v === '') storage?.removeItem(key)
        else storage?.setItem(key, v)
      } catch {
        // Not kept — see above. The typed text is still in the field.
      }
    },
    clear() {
      try {
        storage?.removeItem(key)
      } catch {
        // Nothing was kept, so there is nothing to clear.
      }
    },
  }
}
