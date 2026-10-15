import { ManifestApiError, type ErrorCode, type Schemas } from '@manifest/contract'
import { describe, expect, it } from 'vitest'
import {
  draftReasonKey,
  goneWords,
  paneAfter,
  reasonDraft,
  type ApprovalPane,
} from './approval-state.js'
import { stepUpUrl } from './auth.js'

const RELEASE = '6f1c2a40-3b2d-4c5e-9f10-1a2b3c4d5e6f'
const PROJECT = '0b9e8d7c-6a5b-4c3d-8e2f-1a0b9c8d7e6f'
const DIGEST = 'sha256:9b2c1d0e3f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4'

const DIFF: Schemas['ApprovalDiff'] = {
  imageDigest: DIGEST,
  changes: [],
  services: [],
  attributes: [],
  resources: { cpu: null, memory: null, disk: null, pids: null },
  sensitiveFields: [],
  security: [],
  summary: null,
  summarySource: 'unavailable',
  summaryExposures: [],
  review: { state: 'not_performed', detail: 'No reviewer looked at this release.' },
  baselineReleaseId: null,
  coverage: 'Compared: manifest.yaml.',
} as unknown as Schemas['ApprovalDiff']

const preview = (id: string): Schemas['ApprovalPreview'] => ({
  id,
  releaseId: RELEASE,
  projectId: PROJECT,
  createdBy: '12121212-1212-4212-8212-121212121212',
  createdByName: 'Operator One',
  createdAt: '2026-10-15T19:00:00Z',
  expiresAt: '2026-10-15T19:30:00Z',
  imageDigest: DIGEST,
  diff: DIFF,
})
const P1 = preview('7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d')
const P2 = preview('8b7c6d5e-4f3a-4b2c-9d1e-0f2a3b4c5d6e')

const approval = (
  by: string,
  decision: 'approved' | 'rejected' = 'approved',
): Schemas['Approval'] => ({
  id: '9c8d7e6f-5a4b-4c3d-8e2f-1a0b9c8d7e6f',
  releaseId: RELEASE,
  projectId: PROJECT,
  decision,
  decidedBy: '13131313-1313-4313-8313-131313131313',
  decidedByName: by,
  decidedAt: '2026-10-14T20:00:00Z',
  imageDigest: DIGEST,
  reason: decision === 'rejected' ? 'not in the PIA' : null,
  diff: DIFF,
  previewId: P1.id,
})

const refusedWith = (status: number, code: ErrorCode) =>
  new ManifestApiError(
    status,
    { error: { code, message: 'refused', requestId: 'req-1' } },
    'approveRelease',
  )

const after = (pane: ApprovalPane, ...events: Parameters<typeof paneAfter>[1][]) =>
  events.reduce(paneAfter, pane)

const PREVIEWED: ApprovalPane = { at: 'previewed', preview: P1 }

describe('the preview, taken on a click', () => {
  it('reading → previewing → previewed — opening the pane takes nothing', () => {
    const reading: ApprovalPane = { at: 'reading' }
    const previewing = paneAfter(reading, { type: 'take-preview' })
    expect(previewing).toEqual({ at: 'previewing' })
    expect(paneAfter(previewing, { type: 'previewed', preview: P1 })).toEqual(PREVIEWED)
  })
  it('restores previewed straight from reading — the step-up’s return names the preview in the URL', () => {
    expect(paneAfter({ at: 'reading' }, { type: 'previewed', preview: P1 })).toEqual(
      PREVIEWED,
    )
  })
})

/** REVIEW FOCUS 2 — a decision made twice, or retried after a failure. */
describe('one key per decision', () => {
  it('reuses the key on a retry after no answer, and makes a new one only for a new preview', () => {
    const deciding = paneAfter(PREVIEWED, { type: 'decide', verb: 'approve', key: 'k1' })
    expect(deciding).toEqual({ at: 'deciding', preview: P1, verb: 'approve', key: 'k1' })
    const lost = paneAfter(deciding, {
      type: 'failed',
      error: new TypeError('fetch failed'),
    })
    expect(lost).toMatchObject({
      at: 'refused',
      preview: P1,
      retry: { verb: 'approve', key: 'k1' },
    })
    // The retry: the caller offers a fresh key, and the reducer keeps the one already sent.
    expect(paneAfter(lost, { type: 'decide', verb: 'approve', key: 'k2' })).toEqual(
      deciding,
    )
    // A 5xx is no answer either: the platform may have recorded it.
    expect(
      paneAfter(deciding, { type: 'failed', error: refusedWith(503, 'INTERNAL') }),
    ).toMatchObject({ at: 'refused', retry: { verb: 'approve', key: 'k1' } })
    // A new preview is a new decision, with a new key.
    const again = after(
      lost,
      { type: 'take-preview' },
      { type: 'previewed', preview: P2 },
      {
        type: 'decide',
        verb: 'approve',
        key: 'k3',
      },
    )
    expect(again).toEqual({ at: 'deciding', preview: P2, verb: 'approve', key: 'k3' })
  })
  it('a different decision after no answer is a different action, with its own key', () => {
    const lost = after(
      PREVIEWED,
      { type: 'decide', verb: 'approve', key: 'k1' },
      { type: 'failed', error: new TypeError('fetch failed') },
    )
    expect(paneAfter(lost, { type: 'decide', verb: 'reject', key: 'k2' })).toEqual({
      at: 'deciding',
      preview: P1,
      verb: 'reject',
      key: 'k2',
    })
  })
  it('ignores a second press while one is in flight', () => {
    const deciding = paneAfter(PREVIEWED, { type: 'decide', verb: 'approve', key: 'k1' })
    expect(paneAfter(deciding, { type: 'decide', verb: 'approve', key: 'k2' })).toBe(
      deciding,
    )
    expect(paneAfter(deciding, { type: 'take-preview' })).toBe(deciding)
  })
  it('records the decision as made by you', () => {
    const decided = after(
      PREVIEWED,
      { type: 'decide', verb: 'approve', key: 'k1' },
      { type: 'decided', approval: approval('Operator One') },
    )
    expect(decided).toEqual({
      at: 'decided',
      approval: approval('Operator One'),
      byYou: true,
    })
  })
})

/** REVIEW FOCUS 3 — the step-up round trip keeps the operator's place. */
describe('the step-up round trip', () => {
  it('sends the operator to step up and back to this pane and this preview', () => {
    const stepping = after(
      PREVIEWED,
      { type: 'decide', verb: 'approve', key: 'k1' },
      { type: 'failed', error: refusedWith(403, 'STEP_UP_REQUIRED') },
    )
    expect(stepping).toEqual({
      at: 'stepping-up',
      preview: P1,
      to: stepUpUrl(RELEASE, P1.id),
    })
    expect(stepUpUrl(RELEASE, P1.id)).toBe(
      '/auth/step-up?returnTo=' +
        encodeURIComponent('/releases/' + RELEASE + '/approval?preview=' + P1.id),
    )
  })

  it('keeps the reason typed, by release and preview, in sessionStorage — and never throws when storage does', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    const key = draftReasonKey(RELEASE, P1.id)
    expect(key).toContain(RELEASE)
    expect(key).toContain(P1.id)
    expect(draftReasonKey(RELEASE, P2.id)).not.toBe(key)
    reasonDraft(storage, key).write('The class starts on Monday.')
    // …the round trip: a new page, the same session's storage.
    expect(reasonDraft(storage, key).read()).toBe('The class starts on Monday.')
    reasonDraft(storage, key).clear()
    expect(reasonDraft(storage, key).read()).toBe('')
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(() => reasonDraft(throwing, key).write('x')).not.toThrow()
    expect(reasonDraft(throwing, key).read()).toBe('')
    expect(() => reasonDraft(throwing, key).clear()).not.toThrow()
    expect(reasonDraft(undefined, key).read()).toBe('')
  })

  it('says a stale or expired preview, records nothing, and never takes a new one by itself', () => {
    const deciding = paneAfter(PREVIEWED, { type: 'decide', verb: 'approve', key: 'k1' })
    const stale = paneAfter(deciding, {
      type: 'failed',
      error: refusedWith(409, 'APPROVAL_PREVIEW_STALE'),
    })
    expect(stale).toMatchObject({
      at: 'refused',
      code: 'APPROVAL_PREVIEW_STALE',
      message:
        'Something moved since you read the preview. Nothing was recorded, and the release is untouched. Take a new one.',
      retry: null,
    })
    const expired = paneAfter(deciding, {
      type: 'failed',
      error: refusedWith(409, 'APPROVAL_PREVIEW_EXPIRED'),
    })
    expect(expired).toMatchObject({
      at: 'refused',
      code: 'APPROVAL_PREVIEW_EXPIRED',
      message:
        'The preview is more than 30 minutes old. Nothing was recorded. Take a new one.',
      retry: null,
    })
    // Neither can be decided on again: the only way on is the operator taking a new preview.
    expect(paneAfter(stale, { type: 'decide', verb: 'approve', key: 'k2' })).toBe(stale)
    expect(paneAfter(expired, { type: 'decide', verb: 'reject', key: 'k2' })).toBe(
      expired,
    )
    expect(paneAfter(stale, { type: 'take-preview' })).toEqual({ at: 'previewing' })
  })
})

/** REVIEW FOCUS 4 — the queue moves under an open pane. */
describe('decided by someone else', () => {
  it('says who decided and when, read from getApproval — never from a refusal', () => {
    const gone = paneAfter(PREVIEWED, {
      type: 'gone',
      approval: approval('Operator Two'),
    })
    expect(gone).toEqual({ at: 'gone-elsewhere', approval: approval('Operator Two') })
    expect(goneWords(approval('Operator Two'))).toBe(
      'Operator Two approved this on October 14, 2026.',
    )
    expect(goneWords(approval('Operator Two', 'rejected'))).toBe(
      'Operator Two rejected this on October 14, 2026.',
    )
    expect(goneWords(null)).toBe('This is no longer waiting on us.')
    expect(paneAfter({ at: 'reading' }, { type: 'gone', approval: null })).toEqual({
      at: 'gone-elsewhere',
      approval: null,
    })
  })
  it('is not read over your own decision, in flight or made', () => {
    const deciding = paneAfter(PREVIEWED, { type: 'decide', verb: 'approve', key: 'k1' })
    expect(
      paneAfter(deciding, { type: 'gone', approval: approval('Operator One') }),
    ).toBe(deciding)
    const decided = paneAfter(deciding, {
      type: 'decided',
      approval: approval('Operator One'),
    })
    expect(paneAfter(decided, { type: 'gone', approval: approval('Operator One') })).toBe(
      decided,
    )
  })
})

describe('a preview that could not be taken or read', () => {
  it('is refused with nothing to decide on, and taken again only on a click', () => {
    const failed = after(
      { at: 'reading' },
      { type: 'take-preview' },
      {
        type: 'failed',
        error: refusedWith(404, 'NOT_FOUND'),
      },
    )
    expect(failed).toMatchObject({
      at: 'refused',
      preview: null,
      code: 'NOT_FOUND',
      retry: null,
    })
    expect(paneAfter(failed, { type: 'decide', verb: 'approve', key: 'k1' })).toBe(failed)
  })
})
