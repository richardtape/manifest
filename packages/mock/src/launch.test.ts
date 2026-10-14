import { describe, expect, it } from 'vitest'
import * as f from './fixtures.js'
import { iamItemOf } from './launch.js'

type Registration = (typeof f)['IAM_REGISTRATION']

const base = f.LAUNCH_READINESS.items.find((i) => i.id === 'iam-registration')!
/** Production's registration as UBC registered it, with a change to it asked for — `requestedAttributes`. */
const live = (change: Partial<Registration>): Registration => ({
  ...f.IAM_REGISTRATION,
  requestedAttributes: [
    'eduPersonAffiliation',
    'givenName',
    'mail',
    'sn',
    'ubcEduCwlPuid',
  ],
  ...change,
})

/**
 * F16(b) (Rich, 2026-10-09 11:24; the platform's `launch/readiness.ts` since A1's sitting 2): UBC's registration
 * IN FORCE — recorded `active` once and not lapsed since — is met, and a change asked for, filed, or sent back
 * with UBC's questions does not unregister it. The platform's predicate is `registrationInForce`; its words for
 * a change are `changeRequestOnFile`'s.
 */
describe('the iam-registration item — UBC’s registration in force (F16(b))', () => {
  it('active: met, as the fixture says', () => {
    expect(iamItemOf(f.IAM_REGISTRATION, base)).toEqual(base)
  })

  it('a change with the Manifest team: met, saying where the change is', () => {
    const item = iamItemOf(
      live({ state: 'sent', sentFrom: 'active', sentAt: '2026-09-22T17:15:00.000Z' }),
      base,
    )
    expect(item.state).toBe('met')
    expect(item.why).toBe(
      `${base.why} A change is with the Manifest team since September 22, 2026 (asking for eduPersonAffiliation, givenName, mail, sn, ubcEduCwlPuid); until UBC registers it, releases are checked against what it registered.`,
    )
  })

  it('a change filed with UBC: met, the change request on file', () => {
    const item = iamItemOf(
      live({
        state: 'change_requested',
        changeRequestedFrom: 'active',
        externalTicketRef: 'IAM-CHG-1',
      }),
      base,
    )
    expect(item.state).toBe('met')
    expect(item.why).toContain(
      "A change request is on file ('change_requested' (ticket IAM-CHG-1), asking for eduPersonAffiliation, givenName, mail, sn, ubcEduCwlPuid); until UBC registers it, releases are checked against what it registered.",
    )
  })

  it('UBC’s questions on a change: met, and drafting again is the change’s next step', () => {
    const item = iamItemOf(
      live({ state: 'change_requested', changeRequestedFrom: 'submitted' }),
      base,
    )
    expect(item.state).toBe('met')
    expect(item.why).toContain(
      'UBC IAM asked for changes to the change request (asking for eduPersonAffiliation, givenName, mail, sn, ubcEduCwlPuid): draft it again and send it to the Manifest team (sendIamRegistration);',
    )
  })

  it('NOT in force — lapsed, or never registered — waits for active', () => {
    const lapsed = iamItemOf(
      live({ state: 'expired', registeredAt: null, requestedAttributes: null }),
      base,
    )
    expect(lapsed).toMatchObject({ state: 'unmet' })
    expect(lapsed.why).toContain("must be 'active' before a first production launch")
    const sentFirst = iamItemOf(
      live({
        state: 'sent',
        sentFrom: 'draft',
        sentAt: '2026-09-22T17:15:00.000Z',
        registeredAt: null,
        requestedAttributes: null,
      }),
      base,
    )
    expect(sentFirst).toMatchObject({ state: 'unmet', since: '2026-09-22T17:15:00.000Z' })
    expect(sentFirst.why).toContain(
      'It was sent to the Manifest team on September 22, 2026',
    )
  })
})
