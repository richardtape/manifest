import { fixtures } from '@manifest/mock'
import type { Schemas } from '@manifest/contract'
import { describe, expect, it } from 'vitest'
import {
  assessmentActions,
  dayInWords,
  fleetStateWords,
  queueHeadline,
  queueKindWords,
  queueLink,
  registrationActions,
  sentLine,
  signOffAction,
  sinceWords,
  vancouverDay,
  waitedDays,
} from './launch-records-state.js'

/**
 * THE LAUNCH RECORDS, THE SIGN-OFF REQUEST AND THE QUEUE, AS THE CONSOLE DECIDES WHAT TO SHOW
 * (the launch path plan's Task 13). No DOM tier (P5c Decision 7): each decision a screen makes
 * is a function here, and the screens are clicked.
 */

const at = (iso: string) => new Date(iso)

describe('waits are counted in Vancouver days, never as now − since', () => {
  it('names a day in Vancouver, where a submission is stamped at noon', () => {
    // A same-day submission is stamped NOON in Vancouver (the platform's `vancouverNoon`), which
    // is 19:00Z — up to twelve hours ahead of now. Its day is still today.
    expect(vancouverDay('2026-10-01T19:00:00.000Z')).toBe('2026-10-01')
    // 03:00Z on the 2nd is still the evening of the 1st in Vancouver.
    expect(vancouverDay('2026-10-02T03:00:00.000Z')).toBe('2026-10-01')
    expect(dayInWords('2026-10-01T19:00:00.000Z')).toBe('1 October 2026')
  })

  it('counts whole days between the two Vancouver days, so a noon stamp from today is 0 days', () => {
    expect(waitedDays('2026-10-01T19:00:00.000Z', at('2026-10-01T16:00:00.000Z'))).toBe(0)
    expect(waitedDays('2026-10-01T19:00:00.000Z', at('2026-10-13T16:00:00.000Z'))).toBe(
      12,
    )
    expect(waitedDays('2026-09-30T19:00:00.000Z', at('2026-10-01T08:00:00.000Z'))).toBe(1)
  })

  it('says when it was sent and how long it has waited', () => {
    expect(sentLine('2026-10-01T19:00:00.000Z', at('2026-10-13T16:00:00.000Z'))).toBe(
      'Sent on 1 October 2026 — waiting 12 days',
    )
    expect(sentLine('2026-10-01T19:00:00.000Z', at('2026-10-02T16:00:00.000Z'))).toBe(
      'Sent on 1 October 2026 — waiting 1 day',
    )
    expect(sentLine('2026-10-01T19:00:00.000Z', at('2026-10-01T16:00:00.000Z'))).toBe(
      'Sent on 1 October 2026 — waiting since today',
    )
  })

  it('reads a checklist item’s since as a wait while unmet, and as a date once met', () => {
    const now = at('2026-10-13T16:00:00.000Z')
    expect(sinceWords({ state: 'unmet', since: '2026-10-01T19:00:00.000Z' }, now)).toBe(
      'waiting since 1 October 2026 (12 days)',
    )
    expect(sinceWords({ state: 'met', since: '2026-09-15T00:00:00.000Z' }, now)).toBe(
      'met since 14 September 2026',
    )
    // Nothing to say — and the positive half above says the function does say something.
    expect(sinceWords({ state: 'unmet', since: null }, now)).toBe('')
  })
})

const registration = (
  over: Partial<Schemas['IamRegistration']>,
): Schemas['IamRegistration'] => ({ ...fixtures.STAGING_REGISTRATION, ...over })
const assessment = (
  over: Partial<Schemas['PrivacyAssessment']>,
): Schemas['PrivacyAssessment'] => ({ ...fixtures.PRIVACY_ASSESSMENT, ...over })

describe('what the owner may do with each record', () => {
  it('drafts a registration nobody has started, and sends one that is drafted', () => {
    expect(registrationActions(null)).toMatchObject({ draft: 'first', send: false })
    const drafted = registration({ state: 'draft', submittedAt: null, submittedBy: null })
    expect(drafted.package).not.toBeNull()
    expect(registrationActions(drafted)).toMatchObject({ draft: 'again', send: true })
    // A row an administrator recorded in draft with no package: there is nothing to send yet.
    expect(registrationActions({ ...drafted, package: null })).toMatchObject({
      draft: 'first',
      send: false,
    })
  })

  it('waits while UBC IAM holds it, and is done once it is registered', () => {
    expect(registrationActions(registration({ state: 'submitted' }))).toMatchObject({
      draft: null,
      send: false,
      waiting: true,
    })
    expect(registrationActions(registration({ state: 'active' }))).toMatchObject({
      draft: null,
      send: false,
      waiting: false,
    })
  })

  it('tells the two change requests apart by whose move it is', () => {
    // UBC came back with questions on a request the owner sent: drafting again is the owner's.
    const asked = registrationActions(
      registration({ state: 'change_requested', changeRequestedFrom: 'submitted' }),
    )
    expect(asked).toMatchObject({ draft: 'again', send: true, waiting: false })
    expect(asked.status).toMatch(/UBC IAM asked for changes/)
    // An administrator filed a change to a live registration: UBC holds it.
    const filed = registrationActions(
      registration({ state: 'change_requested', changeRequestedFrom: 'active' }),
    )
    expect(filed).toMatchObject({ draft: null, send: false, waiting: true })
    expect(filed.status).toMatch(/administrator/)
  })

  it('drafts a lapsed registration again', () => {
    expect(registrationActions(registration({ state: 'expired' }))).toMatchObject({
      draft: 'again',
      send: true,
    })
  })

  it('drafts and sends the assessment, then waits for the Privacy Office', () => {
    expect(assessmentActions(null)).toMatchObject({ draft: 'first', send: false })
    const drafted = assessment({ state: 'draft', submittedAt: null, submittedBy: null })
    expect(drafted.draft).not.toBeNull()
    expect(assessmentActions(drafted)).toMatchObject({ draft: 'again', send: true })
    expect(assessmentActions(assessment({ state: 'submitted' }))).toMatchObject({
      draft: null,
      send: false,
      waiting: true,
    })
    expect(assessmentActions(assessment({ state: 'approved' }))).toMatchObject({
      draft: null,
      send: false,
      waiting: false,
    })
  })
})

const readiness = (
  approval: Partial<Schemas['LaunchReadinessItem']>,
  over: Partial<Schemas['LaunchReadiness']> = {},
): Schemas['LaunchReadiness'] => ({
  ...fixtures.LAUNCH_READINESS,
  ...over,
  items: fixtures.LAUNCH_READINESS.items.map((i) =>
    i.id === 'admin-approval' ? { ...i, ...approval } : i,
  ),
})

describe('asking an administrator to sign the release off', () => {
  it('is offered while the release serving staging waits for a decision nobody asked for', () => {
    expect(signOffAction(readiness({ state: 'unmet', since: null }), null)).toBe('ask')
    // Approved and then rebuilt: the approval no longer covers it, so asking is the errand.
    expect(signOffAction(readiness({ state: 'unmet', since: null }), 'approved')).toBe(
      'ask',
    )
  })

  it('is not offered once somebody has asked, once it is met, after a rejection, or with nothing serving staging', () => {
    expect(
      signOffAction(
        readiness({ state: 'unmet', since: '2026-10-01T19:00:00.000Z' }),
        null,
      ),
    ).toBe('asked')
    expect(signOffAction(readiness({ state: 'met', since: null }), 'approved')).toBe(null)
    expect(signOffAction(readiness({ state: 'unmet', since: null }), 'rejected')).toBe(
      null,
    )
    expect(
      signOffAction(
        readiness({ state: 'unmet', since: null }, { candidateReleaseId: null }),
        null,
      ),
    ).toBe(null)
  })
})

const queueItem = (over: Partial<Schemas['QueueItem']>): Schemas['QueueItem'] => ({
  kind: 'privacy-assessment',
  project: { id: fixtures.PROJECT_ID, slug: 'mock-app', name: 'Mock course app' },
  subjectId: '99999999-9999-4999-8999-999999999992',
  environment: null,
  requestedBy: { id: fixtures.USER_ID, displayName: 'Instructor One' },
  since: '2026-09-18T19:00:00.000Z',
  summary: 'sent to the Privacy Office',
  note: null,
  ...over,
})

describe('the administrators’ queue', () => {
  it('headlines the oldest wait, in days, and says when nothing waits', () => {
    const now = at('2026-10-01T16:00:00.000Z')
    expect(
      queueHeadline(
        {
          items: [queueItem({})],
          oldestSince: '2026-09-18T19:00:00.000Z',
          truncated: false,
        },
        now,
      ),
    ).toBe('The oldest has waited 13 days.')
    expect(queueHeadline({ items: [], oldestSince: null, truncated: false }, now)).toBe(
      'Nothing is waiting on an administrator.',
    )
    expect(
      queueHeadline(
        {
          items: [queueItem({})],
          oldestSince: '2026-10-01T19:00:00.000Z',
          truncated: false,
        },
        now,
      ),
    ).toBe('The oldest arrived today.')
  })

  it('links a sign-off request to its release’s approval, and a record to the project’s launch records', () => {
    expect(
      queueLink(queueItem({ kind: 'release-approval', subjectId: fixtures.RELEASE_ID })),
    ).toBe(`/releases/${fixtures.RELEASE_ID}/approval`)
    for (const kind of [
      'iam-registration',
      'iam-change-request',
      'privacy-assessment',
    ] as const)
      expect(queueLink(queueItem({ kind })), kind).toBe(
        `/projects/${fixtures.PROJECT_ID}/records`,
      )
  })

  it('names each kind in words, with the environment of a registration', () => {
    expect(queueKindWords(queueItem({ kind: 'release-approval' }))).toBe(
      'Sign-off requested',
    )
    expect(
      queueKindWords(queueItem({ kind: 'iam-registration', environment: 'staging' })),
    ).toBe('Staging registration with UBC IAM')
    expect(
      queueKindWords(
        queueItem({ kind: 'iam-change-request', environment: 'production' }),
      ),
    ).toBe('Production change request with UBC IAM')
    expect(queueKindWords(queueItem({ kind: 'privacy-assessment' }))).toBe(
      'Privacy assessment with the Privacy Office',
    )
  })
})

describe('the fleet', () => {
  it('says an archived project is switched off, not broken', () => {
    const [active] = fixtures.FLEET
    expect(fleetStateWords(active!)).toBe('on')
    expect(
      fleetStateWords({
        ...active!,
        state: 'archived',
        archivedAt: '2026-09-25T19:00:00.000Z',
      }),
    ).toBe('switched off on 25 September 2026')
  })
})
