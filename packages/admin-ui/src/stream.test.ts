import type { StreamFrame } from '@manifest/contract'
import { describe, expect, it } from 'vitest'
import { askedThrough, decidedAfter, eventsNewestFirst } from './stream.js'

const PROJECT = '00000000-0000-4000-8000-000000000001'
const RELEASE = '6f1c2a40-3b2d-4c5e-9f10-1a2b3c4d5e6f'
const OTHER = '7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d'
const TOKEN = {
  id: '0b9e8d7c-6a5b-4c3d-8e2f-1a0b9c8d7e6f',
  name: 'the agent that builds this app',
}

let n = 0
const asked = (
  releaseId: string,
  at: string,
  token: typeof TOKEN | null,
): StreamFrame => ({
  kind: 'event',
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  projectId: PROJECT,
  subject: `release:${releaseId}`,
  type: 'approval.requested',
  humanMessage:
    'Instructor One asked an administrator to approve this release for production.',
  machineDetail: {
    requestId: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    releaseId,
    viaToken: token !== null,
  },
  createdAt: at,
  actor: { name: 'Instructor One', asAdministrator: false, reason: null, token },
})

const decided = (
  releaseId: string,
  at: string,
  type: 'release.approved' | 'release.approval_rejected',
): StreamFrame => ({
  kind: 'event',
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  projectId: PROJECT,
  subject: `release:${releaseId}`,
  type,
  humanMessage: 'Operator Two approved this release for production.',
  machineDetail: {
    releaseId,
    imageDigest: 'sha256:9b2c1d0e3f4a5b6',
    decision: type === 'release.approved' ? 'approved' : 'rejected',
  },
  createdAt: at,
  actor: { name: 'Operator Two', asAdministrator: false, reason: null, token: null },
})

const READY: StreamFrame = {
  kind: 'control',
  id: 'ready',
  projectId: PROJECT,
  type: 'manifest.stream.ready',
}

/**
 * THROUGH WHICH TOKEN A SIGN-OFF WAS ASKED — read from the project's stream alone (the design's A21):
 * no operation reads an `ApprovalRequest`, `QueueItem` carries no token, and `approval.requested`'s
 * `machineDetail.viaToken` is a boolean. The token's NAME is that event's `actor.token`.
 */
describe('askedThrough', () => {
  it('reads the newest request for the release — a token’s name, or null when asked in a session', () => {
    const viaToken = [
      asked(RELEASE, '2026-10-05T19:00:00Z', null),
      asked(RELEASE, '2026-10-12T15:43:43Z', TOKEN),
      asked(OTHER, '2026-10-13T00:00:00Z', null),
      READY,
    ]
    expect(askedThrough(viaToken, RELEASE)).toEqual({
      token: 'the agent that builds this app',
    })
    const inSession = [
      asked(RELEASE, '2026-10-12T15:43:43Z', TOKEN),
      asked(RELEASE, '2026-10-13T09:00:00Z', null),
    ]
    expect(askedThrough(inSession, RELEASE)).toEqual({ token: null })
  })

  it('takes the newest by its instant, not by where it sits in the replay', () => {
    const frames = [
      asked(RELEASE, '2026-10-12T15:43:43Z', TOKEN),
      asked(RELEASE, '2026-10-01T00:00:00Z', null),
    ]
    expect(askedThrough(frames, RELEASE)).toEqual({
      token: 'the agent that builds this app',
    })
  })

  it('is null when the replay holds no request for the release — then the token is not said, never guessed', () => {
    expect(
      askedThrough([asked(OTHER, '2026-10-12T15:43:43Z', TOKEN), READY], RELEASE),
    ).toBeNull()
    expect(askedThrough([], RELEASE)).toBeNull()
  })
})

/**
 * DECIDED ELSEWHERE, LEARNED FROM THE STREAM (sitting 3's F1): the platform never refuses a second
 * decision on a release whose preview is still current, so another administrator's decision is READ —
 * from the 60-second re-read and from the project's stream — never learned from a refusal.
 */
describe('decidedAfter', () => {
  it('finds a decision on the release made after the request was asked', () => {
    const frames = [
      decided(RELEASE, '2026-10-01T00:00:00Z', 'release.approved'), // an earlier round
      asked(RELEASE, '2026-10-12T15:43:43Z', TOKEN),
      decided(OTHER, '2026-10-13T00:00:00Z', 'release.approved'),
    ]
    expect(decidedAfter(frames, RELEASE, '2026-10-12T15:43:43Z')).toBe(false)
    frames.push(decided(RELEASE, '2026-10-13T08:00:00Z', 'release.approval_rejected'))
    expect(decidedAfter(frames, RELEASE, '2026-10-12T15:43:43Z')).toBe(true)
  })
})

describe('eventsNewestFirst', () => {
  it('lists the events — not the control frame — newest first, at most the number asked', () => {
    const frames = [
      asked(OTHER, '2026-10-01T00:00:00Z', null),
      asked(RELEASE, '2026-10-12T15:43:43Z', TOKEN),
      READY,
      decided(RELEASE, '2026-10-13T08:00:00Z', 'release.approved'),
    ]
    expect(eventsNewestFirst(frames, 2).map((e) => e.createdAt)).toEqual([
      '2026-10-13T08:00:00Z',
      '2026-10-12T15:43:43Z',
    ])
    expect(eventsNewestFirst(frames, 10)).toHaveLength(3)
  })
})
