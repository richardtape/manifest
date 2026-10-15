import { readFile } from 'node:fs/promises'
import type { Schemas } from '@manifest/contract'
import { describe, expect, it } from 'vitest'
import {
  createKeys,
  grantedChange,
  IAM_MOVES,
  iamAnswerBody,
  movesFromSentence,
  PIA_MOVES,
  piaAnswerBody,
  prefilledAttributes,
  submissionBody,
} from './transitions.js'

/**
 * THE LAUNCH RECORDS' ALLOWED MOVES, HELD TO THE DOCUMENT'S OWN SENTENCE (Decision 9) — and THE BODY
 * each move sends, exactly what `recordIamRegistration` requires (C1): a client that re-derives a
 * platform rule must implement THE rule, and a test says when it stops.
 */
const IAM_SENTENCE =
  'The state this record should now be in: the state it is in, or one step on from it — `draft` to `submitted`; `submitted` to `active` or `change_requested`; `active` to `change_requested` or `expired`; `change_requested` to `submitted` or `expired`; `expired` to `submitted`. Any other move is refused `409 LAUNCH_TRANSITION_INVALID`. A new record starts at `draft`, so a first write into `active` is refused exactly as a later one is. A registration with the Manifest team (`sent`) is not recorded here: the team submits it (`submitIamRegistration`) or hands it back (`returnIamRegistration`).'
const PIA_SENTENCE =
  'The state this record should now be in: the state it is in, or one step on from it — `draft` to `submitted`; `submitted` to `approved`, or back to `draft` when the Privacy Office refuses it; `approved` to `draft`. Any other move is refused `409 LAUNCH_TRANSITION_INVALID`. A new record starts at `draft`. An assessment with the Manifest team (`sent`) is not recorded here: the team submits it (`submitPrivacyAssessment`) or hands it back (`returnPrivacyAssessment`).'

const sorted = (moves: Record<string, readonly string[]>) =>
  Object.fromEntries(Object.entries(moves).map(([k, v]) => [k, [...v].sort()]))

describe('movesFromSentence — its own cases, so a parse failure is told apart from a rule change', () => {
  it('reads the registration’s sentence as its five arrows', () => {
    expect(movesFromSentence(IAM_SENTENCE)).toEqual({
      draft: ['submitted'],
      submitted: ['active', 'change_requested'],
      active: ['change_requested', 'expired'],
      change_requested: ['expired', 'submitted'],
      expired: ['submitted'],
    })
  })

  it('reads “`submitted` to `approved`, or back to `draft` when the Privacy Office refuses it” as two arrows', () => {
    expect(movesFromSentence(PIA_SENTENCE)).toEqual({
      draft: ['submitted'],
      submitted: ['approved', 'draft'],
      approved: ['draft'],
    })
  })

  it('takes no code or operation name for a state — `409 LAUNCH_TRANSITION_INVALID`, (`submitIamRegistration`)', () => {
    expect(
      movesFromSentence(
        'One step on — `draft` to `submitted`, refused `409 LAUNCH_TRANSITION_INVALID` otherwise; `sent` to nothing here (`submitIamRegistration`).',
      ),
    ).toEqual({ draft: ['submitted'] })
  })

  it('reads “the state it is in, or one step on” as no arrow — staying is allowed, and is not a move', () => {
    const moves = movesFromSentence(
      'The state it is in, or one step on from it — `draft` to `submitted`.',
    )
    expect(moves).toEqual({ draft: ['submitted'] })
    expect(moves.draft).not.toContain('draft')
  })
})

describe('the moves offered are the document’s', () => {
  it('IAM_MOVES and PIA_MOVES equal the arrows the published request schemas state', async () => {
    const document = JSON.parse(
      await readFile(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
    ) as {
      components: {
        schemas: Record<string, { properties: { state: { description: string } } }>
      }
    }
    const said = (schema: string) =>
      document.components.schemas[schema]!.properties.state.description
    // `sent` is named by the sentence only to say it is not recorded here: the table adds it, empty.
    expect(sorted(IAM_MOVES)).toEqual({
      ...movesFromSentence(said('RecordIamRegistrationRequest')),
      sent: [],
    })
    expect(sorted(PIA_MOVES)).toEqual({
      ...movesFromSentence(said('RecordPrivacyAssessmentRequest')),
      sent: [],
    })
  })
})

// ─── The bodies (C1) ────────────────────────────────────────────────────────────────────────────

const ENTITY = {
  entityId: 'https://manifest.internal/sp/stats-sim/staging',
  acsUrl: 'https://stats-sim.staging.manifest.internal/auth/ubcshib/callback',
  sloUrl: 'https://stats-sim.staging.manifest.internal/auth/logout',
}
const PACKAGE_CERT = {
  pem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
  fingerprint: 'AB:CD:EF:01',
  expiresAt: '2027-10-01T00:00:00.000Z',
}
const attribute = (name: string, unused = false) => ({
  name,
  oid: `urn:oid:1.3.6.1.4.1.60.1.${name.length}`,
  purpose: `What ${name} is for.`,
  usedAt: unused ? [] : [{ path: 'src/app.ts', line: 12 }],
  justification: `Read at src/app.ts:12.`,
  unused,
})

/** A registration of the contract's shape; each case changes what its story needs. */
function registration(
  over: Partial<Schemas['IamRegistration']> = {},
): Schemas['IamRegistration'] {
  return {
    id: '66666666-0000-4000-8000-000000000001',
    projectId: '66666666-0000-4000-8000-000000000000',
    environment: 'staging',
    ...ENTITY,
    certFingerprint: null,
    certExpiresAt: null,
    registeredAttributes: [],
    requestedAttributes: null,
    registeredAt: null,
    state: 'submitted',
    changeRequestedFrom: null,
    externalTicketRef: 'IAM-2026-0511',
    sentFrom: null,
    sentAt: '2026-10-10T17:00:00.000Z',
    sentBy: { id: '66666666-0000-4000-8000-0000000000aa', displayName: 'Sam Park' },
    submittedAt: '2026-10-11T19:00:00.000Z',
    submittedBy: {
      id: '12121212-1212-4212-8212-121212121212',
      displayName: 'Operator One',
    },
    package: {
      environment: 'staging',
      generatedAt: '2026-10-10T16:30:00.000Z',
      fromCommit: 'a'.repeat(40),
      ...ENTITY,
      certificate: PACKAGE_CERT,
      attributes: [attribute('ubcEduCwlPuid'), attribute('mail'), attribute('givenName')],
      usedAtTruncated: false,
      contacts: { technical: [], support: [] },
      privacyAssessmentReference: 'PIA-2026-0160',
      metadataXml: '<EntityDescriptor/>',
      warnings: [],
    },
    createdAt: '2026-10-10T17:00:00.000Z',
    updatedAt: '2026-10-11T19:00:00.000Z',
    ...over,
  }
}

function item(over: Partial<Schemas['QueueItem']> = {}): Schemas['QueueItem'] {
  return {
    kind: 'iam-registration',
    project: {
      id: '66666666-0000-4000-8000-000000000000',
      slug: 'stats-sim',
      name: 'Stats simulator',
    },
    subjectId: '66666666-0000-4000-8000-000000000001',
    environment: 'staging',
    requestedBy: { id: '66666666-0000-4000-8000-0000000000aa', displayName: 'Sam Park' },
    since: '2026-10-11T19:00:00.000Z',
    summary: 'Its staging registration is with UBC IAM.',
    note: null,
    ...over,
  }
}

/** A live production registration whose change the team filed with UBC (lang-202-journal's story). */
const LIVE = registration({
  environment: 'production',
  entityId: 'https://manifest.internal/sp/lang-202-journal/production',
  acsUrl: 'https://lang-202-journal.manifest.internal/auth/ubcshib/callback',
  sloUrl: 'https://lang-202-journal.manifest.internal/auth/logout',
  certFingerprint: '11:22:33:44',
  certExpiresAt: '2027-03-01T00:00:00.000Z',
  registeredAttributes: ['givenName', 'mail', 'ubcEduCwlPuid'],
  requestedAttributes: ['ubcEduCwlPuid', 'mail', 'givenName', 'sn'],
  registeredAt: '2026-09-05T18:00:00.000Z',
  state: 'change_requested',
  changeRequestedFrom: 'active',
  externalTicketRef: 'IAM-2026-0590',
})
const LIVE_ITEM = item({
  kind: 'iam-change-request',
  environment: 'production',
  project: {
    id: '66666666-0000-4000-8000-000000000000',
    slug: 'lang-202-journal',
    name: 'Language 202 journal',
  },
})

describe('iamAnswerBody — exactly what the operation requires, from the record and the queue item', () => {
  it('stats-sim’s staging item recording active: every required field, staging named, the package’s certificate', () => {
    const record = registration()
    expect(
      iamAnswerBody(record, item(), {
        state: 'active',
        ticket: 'IAM-2026-0511',
        registeredAttributes: prefilledAttributes(record),
      }),
    ).toStrictEqual({
      environment: 'staging',
      ...ENTITY,
      registeredAttributes: ['ubcEduCwlPuid', 'mail', 'givenName'],
      state: 'active',
      externalTicketRef: 'IAM-2026-0511',
      certFingerprint: 'AB:CD:EF:01',
      certExpiresAt: '2027-10-01T00:00:00.000Z',
    })
  })

  it('pre-fills what UBC registered from the record’s requested attributes, then its package’s', () => {
    expect(prefilledAttributes(LIVE)).toEqual([
      'ubcEduCwlPuid',
      'mail',
      'givenName',
      'sn',
    ])
    expect(prefilledAttributes(registration())).toEqual([
      'ubcEduCwlPuid',
      'mail',
      'givenName',
    ])
    expect(
      prefilledAttributes(
        registration({ package: null, registeredAttributes: ['mail'] }),
      ),
    ).toEqual(['mail'])
  })

  it('UBC’s questions (submitted → change_requested) send the record’s registered attributes unchanged', () => {
    const record = registration({
      environment: 'production',
      registeredAttributes: ['mail', 'ubcEduCwlPuid'],
      registeredAt: '2026-09-01T18:00:00.000Z',
      certFingerprint: '99:88',
      certExpiresAt: '2027-01-01T00:00:00.000Z',
    })
    const body = iamAnswerBody(record, item({ environment: 'production' }), {
      state: 'change_requested',
      ticket: 'IAM-2026-0700',
      // What the form holds is not what is sent for a move that does not reach `active`.
      registeredAttributes: ['sn'],
    })
    expect(body.registeredAttributes).toEqual(['mail', 'ubcEduCwlPuid'])
    expect(body).not.toHaveProperty('requestedAttributes')
    // The upsert writes the certificate AS SENT: a body without it would erase what is on record.
    expect([body.certFingerprint, body.certExpiresAt]).toEqual([
      '99:88',
      '2027-01-01T00:00:00.000Z',
    ])
  })

  it('a record UBC never registered sends what was asked for when its own list is empty (the schema’s minItems: 1)', () => {
    const body = iamAnswerBody(registration(), item(), {
      state: 'change_requested',
      ticket: 'IAM-2026-0511',
    })
    expect(body.registeredAttributes).toEqual(['ubcEduCwlPuid', 'mail', 'givenName'])
  })

  it('active → change_requested names what it asks for: requestedAttributes', () => {
    const active = registration({
      environment: 'production',
      state: 'active',
      registeredAttributes: ['mail'],
      registeredAt: '2026-09-01T18:00:00.000Z',
    })
    const body = iamAnswerBody(active, item({ environment: 'production' }), {
      state: 'change_requested',
      ticket: 'IAM-2026-0701',
      requestedAttributes: ['mail', 'sn'],
    })
    expect(body.requestedAttributes).toEqual(['mail', 'sn'])
    expect(body.registeredAttributes).toEqual(['mail'])
  })

  it('a production item sends environment: production — never omitted (omitted means production)', () => {
    const body = iamAnswerBody(
      registration({ environment: 'production' }),
      item({ environment: 'production' }),
      {
        state: 'active',
        ticket: 'IAM-1',
      },
    )
    expect(body.environment).toBe('production')
  })

  it('sends no empty ticket (an empty string is a value the schema checks) and trims a pasted one', () => {
    expect(
      iamAnswerBody(registration({ externalTicketRef: null }), item(), {
        state: 'active',
        ticket: '  ',
      }),
    ).not.toHaveProperty('externalTicketRef')
    expect(
      iamAnswerBody(registration(), item(), { state: 'active', ticket: ' IAM-9 ' })
        .externalTicketRef,
    ).toBe('IAM-9')
  })
})

describe('grantedChange — a change UBC IAM granted is ONE decision in TWO writes (A20)', () => {
  it('submitted with the registered attributes unchanged, then active with the granted set — each a whole body', () => {
    const granted = ['ubcEduCwlPuid', 'mail', 'givenName', 'sn']
    const [first, second] = grantedChange(LIVE, LIVE_ITEM, 'IAM-2026-0590', granted)
    const same = {
      environment: 'production',
      entityId: LIVE.entityId,
      acsUrl: LIVE.acsUrl,
      sloUrl: LIVE.sloUrl,
      externalTicketRef: 'IAM-2026-0590',
      certFingerprint: '11:22:33:44',
      certExpiresAt: '2027-03-01T00:00:00.000Z',
    }
    expect(first).toStrictEqual({
      ...same,
      state: 'submitted',
      registeredAttributes: ['givenName', 'mail', 'ubcEduCwlPuid'],
    })
    expect(second).toStrictEqual({
      ...same,
      state: 'active',
      registeredAttributes: granted,
    })
  })
})

describe('submissionBody — the team’s step', () => {
  it('names the day it went and UBC’s reference, trimmed', () => {
    expect(
      submissionBody({ ticket: ' IAM-2026-0631 ', sentOn: '2026-10-15' }),
    ).toStrictEqual({
      sentAt: '2026-10-15',
      reference: 'IAM-2026-0631',
    })
  })
})

describe('piaAnswerBody', () => {
  it('sends the state, the reference and the reviewer — the upsert writes the reviewer as sent', () => {
    expect(
      piaAnswerBody({
        state: 'approved',
        ticket: ' PIA-2026-0118 ',
        reviewer: 'J. Ortiz',
      }),
    ).toStrictEqual({
      state: 'approved',
      externalTicketRef: 'PIA-2026-0118',
      reviewer: 'J. Ortiz',
    })
    expect(piaAnswerBody({ state: 'draft', ticket: '', reviewer: '' })).toStrictEqual({
      state: 'draft',
    })
  })
})

describe('createKeys — one key per operator action, held until an answer arrives (Review Focus 2)', () => {
  const make = () => {
    let n = 0
    return createKeys(() => `key-${++n}`)
  }

  it('reuses the key after no answer, or a 5xx — either may have been recorded', () => {
    const keys = make()
    expect(keys.keyFor('submit')).toBe('key-1')
    keys.answered('submit', new TypeError('fetch failed'))
    expect(keys.keyFor('submit')).toBe('key-1')
    keys.answered('submit', { status: 503, code: 'UNAVAILABLE' })
    expect(keys.keyFor('submit')).toBe('key-1')
  })

  it('makes a new key once an answer arrived — a success, or a refusal that recorded nothing', () => {
    const keys = make()
    keys.keyFor('submit')
    keys.answered('submit')
    expect(keys.keyFor('submit')).toBe('key-2')
    keys.answered('submit', { status: 409, code: 'LAUNCH_TRANSITION_INVALID' })
    expect(keys.keyFor('submit')).toBe('key-3')
  })

  it('keeps each action’s key its own — a hand-back is not a retry of a submission', () => {
    const keys = make()
    expect(keys.keyFor('submit')).toBe('key-1')
    expect(keys.keyFor('hand-back')).toBe('key-2')
    expect(keys.keyFor('submit')).toBe('key-1')
  })
})
