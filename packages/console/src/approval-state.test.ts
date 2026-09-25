import { describe, expect, it } from 'vitest'
import type { Schemas } from '@manifest/contract'
import { fixtures } from '@manifest/mock'
import {
  approvalLinkWanted,
  canDecide,
  REASON_KEY_PREFIX,
  reasonDraft,
} from './approval-state'

describe('F11 — canDecide: a decision disarms its buttons until a NEW preview', () => {
  const preview = { id: 'p-1' }
  it('is true with a preview and no decision in this view — the positive control', () => {
    expect(canDecide({ preview, decidedWithPreview: undefined, busy: false })).toBe(true)
  })
  it('is FALSE once a decision was recorded with that preview', () => {
    expect(canDecide({ preview, decidedWithPreview: 'p-1', busy: false })).toBe(false)
  })
  it('is true again with a NEW preview', () => {
    expect(
      canDecide({ preview: { id: 'p-2' }, decidedWithPreview: 'p-1', busy: false }),
    ).toBe(true)
  })
  it('is false while busy, and with no preview at all', () => {
    expect(canDecide({ preview, decidedWithPreview: undefined, busy: true })).toBe(false)
    expect(
      canDecide({ preview: undefined, decidedWithPreview: undefined, busy: false }),
    ).toBe(false)
  })
})

/** A `Storage` stand-in that behaves like the browser's, and records every key it holds. */
function memoryStorage() {
  const held = new Map<string, string>()
  return {
    held,
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
    removeItem: (k: string) => void held.delete(k),
  }
}

/** What a private window, or blocked site data, does to every call. */
const throwing = {
  getItem: () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  },
  setItem: () => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
  },
  removeItem: () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  },
}

describe('F12 — reasonDraft: a rejection reason survives the step-up, in sessionStorage by release', () => {
  it('write then read round-trips under manifest.approval-reason:<releaseId>', () => {
    const storage = memoryStorage()
    const draft = reasonDraft(storage, 'r-1')
    expect(draft.read()).toBe('')
    draft.write('the egress host is not in the ticket')
    expect(storage.held.get('manifest.approval-reason:r-1')).toBe(
      'the egress host is not in the ticket',
    )
    expect(REASON_KEY_PREFIX).toBe('manifest.approval-reason:')
    // A SECOND READER — the screen after the step-up's full-page round trip.
    expect(reasonDraft(storage, 'r-1').read()).toBe(
      'the egress host is not in the ticket',
    )
    // And per RELEASE: another release's screen does not inherit it.
    expect(reasonDraft(storage, 'r-2').read()).toBe('')
  })
  it('clear removes it', () => {
    const storage = memoryStorage()
    const draft = reasonDraft(storage, 'r-1')
    draft.write('x')
    draft.clear()
    expect(storage.held.size).toBe(0)
    expect(draft.read()).toBe('')
  })
  it('a storage that THROWS reads empty and writes nothing, without throwing', () => {
    const draft = reasonDraft(throwing, 'r-1')
    expect(() => draft.write('kept nowhere')).not.toThrow()
    expect(draft.read()).toBe('')
    expect(() => draft.clear()).not.toThrow()
  })
  it('no storage at all behaves the same', () => {
    const draft = reasonDraft(undefined, 'r-1')
    expect(() => draft.write('kept nowhere')).not.toThrow()
    expect(draft.read()).toBe('')
    expect(() => draft.clear()).not.toThrow()
  })
})

/**
 * The mock's checklist is a FIRST LAUNCH (`launched: false`); each case below is that fixture
 * with the fields D9.2 moves, set the way `launch/readiness.ts`'s `releaseApprovalItem` sets
 * them for the state named.
 */
function launched(
  over: Partial<Schemas['LaunchReadiness']>,
  approval: Schemas['LaunchReadiness']['items'][number]['state'],
): Schemas['LaunchReadiness'] {
  return {
    ...fixtures.LAUNCH_READINESS,
    launched: true,
    ...over,
    items: fixtures.LAUNCH_READINESS.items.map((i) =>
      i.id === 'admin-approval' ? { ...i, state: approval } : i,
    ),
  }
}
const BASELINE = '88888888-8888-4888-8888-888888888881'

describe('F15 — approvalLinkWanted: no link to an approval a self-serve release does not need', () => {
  it('true for a first launch', () => {
    expect(fixtures.LAUNCH_READINESS.launched).toBe(false)
    expect(approvalLinkWanted(fixtures.LAUNCH_READINESS)).toBe(true)
  })
  it('true for a launched app whose release re-escalated', () => {
    const r = launched(
      {
        baselineReleaseId: BASELINE,
        sensitiveFields: ['egress.allow'],
        reescalated: true,
      },
      'unmet',
    )
    expect(approvalLinkWanted(r)).toBe(true)
  })
  it('FALSE for a launched app whose admin-approval is met self-serve — F15’s own case', () => {
    // The mock's own self-serve checklist, in the platform's words — and the same state built
    // from the first-launch fixture, so the answer does not rest on one literal.
    expect(approvalLinkWanted(fixtures.SELF_SERVE_READINESS)).toBe(false)
    const r = launched(
      { baselineReleaseId: BASELINE, sensitiveFields: [], reescalated: false },
      'met',
    )
    expect(approvalLinkWanted(r)).toBe(false)
  })
  it('true when a decision exists for the candidate: a rejection, an approved sensitive change, a launch release covered by its own approval', () => {
    // Rejected: unmet, and never re-escalated — an approval cannot fix a rejection (P6b Decision 7).
    expect(
      approvalLinkWanted(
        launched(
          { baselineReleaseId: BASELINE, sensitiveFields: [], reescalated: false },
          'unmet',
        ),
      ),
    ).toBe(true)
    // Approved, covering a sensitive change: met, and the fields named.
    expect(
      approvalLinkWanted(
        launched(
          {
            baselineReleaseId: BASELINE,
            sensitiveFields: ['auth.attributes'],
            reescalated: false,
          },
          'met',
        ),
      ),
    ).toBe(true)
    // The launch release redeployed, covered by its own approval: met, with NO baseline.
    expect(
      approvalLinkWanted(
        launched(
          { baselineReleaseId: null, sensitiveFields: [], reescalated: false },
          'met',
        ),
      ),
    ).toBe(true)
  })
  it('false with no candidate — there is no release to approve', () => {
    expect(
      approvalLinkWanted({ ...fixtures.LAUNCH_READINESS, candidateReleaseId: null }),
    ).toBe(false)
  })
})
