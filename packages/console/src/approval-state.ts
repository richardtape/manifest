import type { Schemas } from '@manifest/contract'

/**
 * THE APPROVALS SCREEN'S THREE DECISIONS, AS PURE FUNCTIONS (the D5 plan's Task 14, on P6b
 * sitting 7's F11, F12 and F15). There is no DOM test tier (P5c decided it, with its cost
 * stated), so each behaviour a person could be confused by is a function the screen calls,
 * tested in the `packages` project — and the screen is clicked.
 */

/**
 * F11: ONCE THIS SCREEN HAS RECORDED A DECISION, THE BUTTONS WAIT FOR A NEW PREVIEW. A second
 * press on the same preview would be refused by nobody — a release can be approved, rejected
 * and approved again (§13 keeps the history) — so a live button after a decision records a
 * second decision on a diff the person already decided on, by accident.
 */
export function canDecide(s: {
  preview: { id: string } | undefined
  decidedWithPreview: string | undefined
  busy: boolean
}): boolean {
  return s.preview !== undefined && !s.busy && s.decidedWithPreview !== s.preview.id
}

/** Where F12's draft lives — per release, so two tabs on two releases keep two reasons. */
export const REASON_KEY_PREFIX = 'manifest.approval-reason:'

/**
 * F12: A REJECTION REASON TYPED BEFORE A STEP-UP SURVIVES THE ROUND TRIP. The step-up is a
 * full-page SAML round trip that returns to `pathname + search`, so React's state is gone when
 * the person comes back. The draft is kept in `sessionStorage` by release — **never in the
 * URL**, which is logged by the edge and carried through the IdP, and a reason can name a
 * person or a ticket.
 *
 * **STORAGE CAN THROW** — a private window, blocked site data — and then the draft is simply
 * not kept: the screen works as it did before F12, and nothing throws into a render.
 */
export function reasonDraft(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
  releaseId: string,
): { read(): string; write(v: string): void; clear(): void } {
  const key = `${REASON_KEY_PREFIX}${releaseId}`
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
        // Not kept — see above. The typed text is still in the input.
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

/**
 * F15: LINK TO THE CANDIDATE'S APPROVAL ONLY WHEN ONE IS REQUIRED, OR EXISTS. A self-serve
 * release (D9: launched, nothing sensitive changed since the last approved release) needs no
 * administrator, and *"See this release's approval"* sent a person to a page for a decision
 * nobody will make.
 *
 * Read from the checklist alone, which is the platform's one derivation (`productionApprovalFor`
 * behind both the view and the gate): a launched app's `admin-approval` is `met` self-serve
 * exactly when it is `met`, not `reescalated`, compared with a baseline (`baselineReleaseId`
 * set) and no sensitive field changed. Every other state wants the link — a first launch, a
 * re-escalation, a rejection (a decision exists), an approval that covers a sensitive change,
 * and a launch release covered by its own approval (no baseline: `baselineReleaseId` null).
 *
 * **What this cannot see, named:** an administrator who decided on a self-serve release anyway
 * (nothing refuses it). The checklist reads self-serve, the gate does not consult the decision,
 * and the link is not offered; the record is still read at `/releases/<id>/approval`.
 */
export function approvalLinkWanted(r: Schemas['LaunchReadiness']): boolean {
  if (r.candidateReleaseId === null) return false
  if (!r.launched || r.reescalated) return true
  const item = r.items.find((i) => i.id === 'admin-approval')
  const selfServe =
    item?.state === 'met' &&
    r.baselineReleaseId !== null &&
    r.sensitiveFields.length === 0
  return !selfServe
}
