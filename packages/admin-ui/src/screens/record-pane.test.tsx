import { ManifestApiError, type Schemas } from '@manifest/contract'
import { createMockServer, fixtures } from '@manifest/mock'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi } from '../api.js'
import type { QueueItem } from '../queue-state.js'
import { dayInWords, vancouverToday } from '../time.js'
import { IAM_MOVES, iamAnswerBody, PIA_MOVES } from '../transitions.js'
import {
  answerOptions,
  formOf,
  iamAnswerOf,
  recordItemsOf,
  recordOf,
  recordsOf,
  RecordPaneView,
  type RecordPaneViewProps,
} from './record-pane.js'

/**
 * THE TEAM'S STEP AND UBC'S ANSWER, DRAWN FROM THE DEMO FLEET'S OWN ANSWERS — each item's queue entry and
 * its project's launch records read through the console's own client (every object the contract's shape,
 * checked on the way out by the mock), then the pane drawn in each state it has.
 */
type Server = ReturnType<typeof createMockServer>
let server: Server
let now: Date
let queue: Schemas['Queue']
const items = new Map<string, QueueItem>()
const records = new Map<string, Schemas['LaunchRecords']>()

beforeAll(async () => {
  server = createMockServer({ scanSilenceMs: 50, role: 'admin', fleet: 'demo' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const api = createApi({ origin: `http://127.0.0.1:${port}`, session: 'mock-session' })
  queue = await api.listQueue()
  for (const item of queue.items) {
    if (item.kind === 'release-approval') continue
    items.set(item.project.slug, item)
    records.set(item.project.slug, await api.getLaunchRecords(item.project.id))
  }
  // After the mock was made: its ages are its creation less each age (approval-pane.test.tsx's note).
  now = new Date()
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const itemOf = (slug: string) => {
  const item = items.get(slug)
  expect(item, slug).toBeDefined()
  return item!
}

function propsOf(
  slug: string,
  over: Partial<RecordPaneViewProps> = {},
): RecordPaneViewProps {
  const item = itemOf(slug)
  const held = records.get(slug)!
  return {
    item,
    me: fixtures.OPERATOR_ME,
    now,
    records: held,
    form: formOf(recordOf(held, item)!, now),
    busy: null,
    done: null,
    previewIndex: 0,
    ...over,
  }
}

const render = (slug: string, over: Partial<RecordPaneViewProps> = {}) =>
  renderToStaticMarkup(<RecordPaneView {...propsOf(slug, over)} />)

/**
 * React escapes `&`, `<`, `>`, `"` and `'` in text — and the platform's sentences say *"this app's"* with a
 * straight apostrophe — so markup is compared escaped, and a sentence is read as the page's text.
 */
const esc = (t: string) =>
  t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** A button as `ObservedAction` draws it, enabled or not — the whole tag, so a class or label drift is red. */
const button = (label: string, kind: string, disabled: boolean) =>
  `<button class="mf-btn mf-btn--${kind} mf-btn--sm" type="button"${disabled ? ' disabled=""' : ''}>${label}</button>`

describe('a registration with the Manifest team — phys-101-labs’ production registration', () => {
  it('shows its package: every attribute’s name, OID, purpose and where it is read, an unread one marked', () => {
    const pkg = recordOf(records.get('phys-101-labs')!, itemOf('phys-101-labs'))
    expect(pkg?.kind).toBe('iam')
    const registration = pkg!.record as Schemas['IamRegistration']
    expect(registration.state).toBe('sent')
    const html = render('phys-101-labs')
    for (const a of registration.package!.attributes) {
      expect(html).toContain(`<code class="mfa-mono">${a.name}</code>`)
      expect(html).toContain(esc(a.oid))
      expect(html).toContain(esc(a.purpose))
      for (const u of a.usedAt) expect(html).toContain(`${u.path}:${u.line}`)
    }
    const unread = registration.package!.attributes.filter((a) => a.unused)
    expect(unread.map((a) => a.name)).toEqual(['sn'])
    expect(html).toContain('<span class="mfa-flag"> · never read by the code</span>')
  })

  it('shows the certificate’s fingerprint, whole, and its expiry — and the package’s warnings', () => {
    const registration = recordOf(records.get('phys-101-labs')!, itemOf('phys-101-labs'))!
      .record as Schemas['IamRegistration']
    const html = render('phys-101-labs')
    expect(html).toContain(registration.package!.certificate.fingerprint)
    expect(html).toContain('expires ')
    expect(registration.package!.warnings.length).toBeGreaterThan(0)
    for (const w of registration.package!.warnings) expect(text(html)).toContain(w)
  })

  it('Submit needs UBC IAM’s ticket: disabled without one, said in the note', () => {
    const html = render('phys-101-labs')
    expect(html).toContain(button('Submit to UBC IAM', 'primary', true))
    expect(html).toContain('Submitting needs UBC IAM’s ticket, pasted in.')
    const ready = (p: RecordPaneViewProps) => ({
      form: { ...p.form, ticket: 'IAM-2026-0631' },
    })
    const html2 = render('phys-101-labs', ready(propsOf('phys-101-labs')))
    expect(html2).toContain(button('Submit to UBC IAM', 'primary', false))
  })

  it('offers today in Vancouver as the day it went, and refuses a day after today in the form', () => {
    const today = vancouverToday(now)
    const html = render('phys-101-labs')
    // React writes an input's `value` after its other attributes: read the one date input's tag.
    const input = /<input id="sent-[^"]+"[^>]*>/.exec(html)?.[0] ?? ''
    expect(input).toContain('type="date"')
    expect(input).toContain(`value="${today}"`)
    expect(input).toContain(`max="${today}"`)
    const p = propsOf('phys-101-labs')
    const tomorrow = new Date(Date.parse(`${today}T20:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10)
    const late = render('phys-101-labs', {
      form: { ...p.form, ticket: 'IAM-2026-0631', sentOn: tomorrow },
    })
    expect(late).toContain(button('Submit to UBC IAM', 'primary', true))
    expect(late).toContain('It cannot have gone after today.')
  })

  it('hands it back with no reason collected — Jordan Lee is told why by the operator, not by Manifest', () => {
    const html = render('phys-101-labs')
    expect(html).toContain(
      '<div class="mfa-admit"><strong>Manifest doesn’t keep a reason for a hand-back. </strong>Tell Jordan Lee why yourself.</div>',
    )
    expect(html).not.toContain('<textarea')
    expect(html).toContain(button('Hand it back', 'secondary', false))
  })

  it('says what Jordan Lee will read, in the platform’s words', () => {
    const p = propsOf('phys-101-labs')
    const html = render('phys-101-labs', {
      form: { ...p.form, ticket: 'IAM-2026-0631' },
    })
    expect(text(html)).toContain(
      `Operator One recorded that the Manifest team submitted this app's production registration to UBC IAM on `,
    )
    expect(text(html)).toContain('(ticket IAM-2026-0631).')
    const back = render('phys-101-labs', { previewIndex: 1 })
    expect(text(back)).toContain(
      `Operator One handed this app's production registration back to its owner, unsubmitted.`,
    )
  })

  it('disables every action while one is in flight', () => {
    const p = propsOf('phys-101-labs')
    const html = render('phys-101-labs', {
      form: { ...p.form, ticket: 'IAM-2026-0631' },
      busy: 'submit',
    })
    expect(html).toContain(button('Submit to UBC IAM', 'primary', true))
    expect(html).toContain(button('Hand it back', 'secondary', true))
  })

  it('a submission recorded: says it waits on UBC, and what Jordan Lee reads', () => {
    const held = recordOf(records.get('phys-101-labs')!, itemOf('phys-101-labs'))!
      .record as Schemas['IamRegistration']
    const html = render('phys-101-labs', {
      done: {
        action: 'submit',
        record: {
          ...held,
          state: 'submitted',
          sentFrom: null,
          externalTicketRef: 'IAM-2026-0631',
          submittedAt: `${vancouverToday(now)}T19:00:00.000Z`,
        },
      },
    })
    expect(html).toContain('<p class="mfa-result__title">Submitted to UBC IAM</p>')
    expect(text(html)).toContain(
      'Jordan Lee reads “Operator One recorded that the Manifest team',
    )
    expect(html).not.toContain(button('Hand it back', 'secondary', false))
  })

  it('a hand-back recorded: back with its owner, unsubmitted — tell them why yourself', () => {
    const held = recordOf(records.get('phys-101-labs')!, itemOf('phys-101-labs'))!
      .record as Schemas['IamRegistration']
    const html = render('phys-101-labs', {
      done: { action: 'hand-back', record: { ...held, state: 'draft', sentFrom: null } },
    })
    expect(html).toContain('<p class="mfa-result__title">Handed back to Jordan Lee</p>')
    expect(html).toContain('tell them why yourself')
  })
})

describe('a change to a live registration with the team — math-oh-queue’s', () => {
  it('is filed, not submitted, with what UBC registered beside what the change asks for', () => {
    const r = recordOf(records.get('math-oh-queue')!, itemOf('math-oh-queue'))!
      .record as Schemas['IamRegistration']
    expect([r.state, r.sentFrom]).toEqual(['sent', 'active'])
    const p = propsOf('math-oh-queue')
    const html = render('math-oh-queue', { form: { ...p.form, ticket: 'IAM-2026-0640' } })
    expect(html).toContain(button('File the change request', 'primary', false))
    expect(html).not.toContain('Submit to UBC IAM')
    expect(html).toContain('<dt>Registered</dt>')
    expect(html).toContain('<dt>Asks for</dt>')
    expect(html).toContain('<span class="mfa-tag mfa-tag--add">+ sn</span>')
    expect(text(html)).toContain(
      `Operator One recorded that the Manifest team filed a change request for this app's production registration with UBC IAM on `,
    )
  })
})

describe('an assessment with the team — rubric-helper’s', () => {
  it('shows the six sections and every gap with the owner’s answer, by its id', () => {
    const a = recordOf(records.get('rubric-helper')!, itemOf('rubric-helper'))!
      .record as Schemas['PrivacyAssessment']
    expect(a.state).toBe('sent')
    const html = render('rubric-helper')
    expect(a.draft!.sections).toHaveLength(6)
    for (const s of a.draft!.sections) {
      expect(html).toContain(`<h4 class="mfa-teamsec__title">${esc(s.title)}</h4>`)
      for (const g of s.gaps) {
        const answer = a.gapAnswers!.find((x) => x.gapId === g.id)!.answer
        expect(html).toContain(`<code class="mfa-mono">${g.id}</code>`)
        expect(html).toContain(
          `<blockquote class="mfa-quote">${esc(answer)}</blockquote>`,
        )
      }
    }
    expect(html).toContain(button('Submit to the Privacy Office', 'primary', true))
    expect(html).toContain('Submitting needs the PIA number, pasted in.')
  })
})

describe('UBC’s answer — the form offers exactly the platform’s moves', () => {
  it('stats-sim’s staging registration with UBC IAM: IAM_MOVES.submitted, the record’s facts shown', () => {
    const found = recordOf(records.get('stats-sim')!, itemOf('stats-sim'))!
    expect(found.record.state).toBe('submitted')
    expect(answerOptions(found).map((o) => o.value)).toEqual([...IAM_MOVES.submitted])
    const html = render('stats-sim')
    expect(html).toContain('Active — UBC IAM registered it')
    expect(html).toContain('UBC IAM asked its owner for changes')
    expect(html).toContain('<code>submitted</code>')
    expect(html).toContain('IAM-2026-0511')
    expect(html).toContain((found.record as Schemas['IamRegistration']).entityId)
  })

  it('makes the attributes and the certificate editable only for active', () => {
    const p = propsOf('stats-sim')
    expect(p.form.move).toBe('active')
    expect(render('stats-sim')).toContain('Registered by UBC IAM')
    expect(render('stats-sim')).toContain('Certificate fingerprint')
    const asked = render('stats-sim', { form: { ...p.form, move: 'change_requested' } })
    expect(asked).not.toContain('Registered by UBC IAM')
    expect(asked).not.toContain('Certificate fingerprint')
  })

  it('sends what the form holds as exactly iamAnswerBody’s body — pre-filled from the record', () => {
    const item = itemOf('stats-sim')
    const found = recordOf(records.get('stats-sim')!, item)!
    const r = found.record as Schemas['IamRegistration']
    const form = formOf(found, now)
    expect(iamAnswerBody(r, item, iamAnswerOf(r, form))).toStrictEqual({
      environment: 'staging',
      entityId: r.entityId,
      acsUrl: r.acsUrl,
      sloUrl: r.sloUrl,
      registeredAttributes: r.package!.attributes.map((a) => a.name),
      state: 'active',
      externalTicketRef: 'IAM-2026-0511',
      certFingerprint: r.package!.certificate.fingerprint,
      certExpiresAt: r.package!.certificate.expiresAt,
    })
    // An expiry changed in the form is that day IN VANCOUVER, as the facts and Health read it back —
    // never midnight UTC, the evening before there (the whole-branch review's I1).
    const changed = iamAnswerOf(r, { ...form, expires: '2028-01-31' })
    expect(changed.certExpiresAt).toBe('2028-01-31T20:00:00.000Z')
    expect(dayInWords(changed.certExpiresAt!)).toBe('January 31, 2028')
  })

  it('fills the expiry with the day Vancouver reads, so an expiry left alone sends the record’s own instant', () => {
    const item = itemOf('stats-sim')
    const found = recordOf(records.get('stats-sim')!, item)!
    const r = found.record as Schemas['IamRegistration']
    // 03:00 UTC on February 1 is the evening of January 31 in Vancouver: the facts say January 31.
    const late: Schemas['IamRegistration'] = {
      ...r,
      certFingerprint: 'AA:BB',
      certExpiresAt: '2028-02-01T03:00:00.000Z',
    }
    const form = formOf({ ...found, record: late } as typeof found, now)
    expect(form.expires).toBe('2028-01-31')
    expect(iamAnswerOf(late, form)).not.toHaveProperty('certExpiresAt')
    expect(iamAnswerBody(late, item, iamAnswerOf(late, form)).certExpiresAt).toBe(
      '2028-02-01T03:00:00.000Z',
    )
  })

  it('lang-202-journal’s change with UBC IAM: the grant said as two steps, attributes editable', () => {
    const found = recordOf(records.get('lang-202-journal')!, itemOf('lang-202-journal'))!
    expect(answerOptions(found).map((o) => o.value)).toEqual([
      ...IAM_MOVES.change_requested,
    ])
    const html = render('lang-202-journal')
    expect(html).toContain(
      'A change UBC IAM granted is recorded in two steps: with UBC IAM, then active.',
    )
    expect(html).toContain('Registered by UBC IAM')
  })

  it('field-notes’ assessment with the Privacy Office: PIA_MOVES.submitted, and a reviewer', () => {
    const found = recordOf(records.get('field-notes')!, itemOf('field-notes'))!
    expect(answerOptions(found).map((o) => o.value)).toEqual([...PIA_MOVES.submitted])
    const html = render('field-notes')
    expect(html).toContain('Approved by the Privacy Office')
    expect(html).toContain('Refused — back to its owner as a draft')
    expect(html).toContain('Reviewer')
    expect(html).toContain(button('Record it', 'primary', false))
  })

  it('Record it needs the ticket reference', () => {
    const p = propsOf('stats-sim')
    const html = render('stats-sim', { form: { ...p.form, ticket: ' ' } })
    expect(html).toContain(button('Record it', 'primary', true))
    expect(html).toContain('A record needs the ticket reference, pasted in.')
  })

  it('a refusal arriving anyway is shown by <Refusal>, its code first', () => {
    const error = new ManifestApiError(
      409,
      {
        error: {
          code: 'LAUNCH_TRANSITION_INVALID',
          message: 'an IAM registration cannot go from submitted to expired',
          requestId: 'req-1',
        },
      },
      'recordIamRegistration',
    )
    const html = render('stats-sim', { error })
    expect(html).toContain('<code class="refusal__code">LAUNCH_TRANSITION_INVALID</code>')
    expect(text(html)).toContain(
      'an IAM registration cannot go from submitted to expired',
    )
  })

  it('a grant whose second write failed: said, at submitted, with the answer offered again', () => {
    const live = recordOf(records.get('lang-202-journal')!, itemOf('lang-202-journal'))!
      .record as Schemas['IamRegistration']
    const held = records.get('lang-202-journal')!
    const half = { ...held, iamRegistration: { ...live, state: 'submitted' as const } }
    const found = recordOf(half, itemOf('lang-202-journal'))!
    const html = render('lang-202-journal', {
      records: half,
      form: formOf(found, now),
      grantHalf: true,
    })
    expect(html).toContain('with UBC IAM (submitted), and active was not recorded')
    expect(html).toContain('Record UBC IAM’s answer')
    expect(answerOptions(found).map((o) => o.value)).toEqual([...IAM_MOVES.submitted])
  })

  it('a record recorded: says the state and what its owner reads', () => {
    const r = recordOf(records.get('stats-sim')!, itemOf('stats-sim'))!
      .record as Schemas['IamRegistration']
    const html = render('stats-sim', {
      done: { action: 'record', record: { ...r, state: 'active' } },
    })
    expect(html).toContain('<p class="mfa-result__title">Recorded as active</p>')
    expect(text(html)).toContain(
      `reads “Operator One recorded this app's staging UBC IAM registration as active (ticket IAM-2026-0511).”`,
    )
  })

  it('a record no longer where the item said: no longer waiting on us, its facts shown, nothing offered', () => {
    const r = recordOf(records.get('stats-sim')!, itemOf('stats-sim'))!
      .record as Schemas['IamRegistration']
    const held = records.get('stats-sim')!
    const html = render('stats-sim', {
      records: { ...held, stagingRegistration: { ...r, state: 'active' } },
    })
    expect(html).toContain('This is no longer waiting on us.')
    expect(html).not.toContain('Record it')
  })
})

describe('a record that is not there', () => {
  it('says so — never “Reading…” for ever, never a form for another record', () => {
    const held = records.get('stats-sim')!
    const html = render('stats-sim', { records: { ...held, stagingRegistration: null } })
    expect(html).toContain('Manifest no longer has this record for the app.')
    expect(html).not.toContain('Reading the record')
    expect(html).not.toContain('Record it')
  })

  it('says it is reading until the records arrive', () => {
    expect(render('stats-sim', { records: null })).toContain('Reading the record…')
  })
})

describe('/projects/<id>/records — the team’s emailed link', () => {
  it('finds the project’s items about its records, and no release’s sign-off', () => {
    const phys = itemOf('phys-101-labs')
    expect(recordItemsOf(queue, phys.project.id).map((i) => i.kind)).toEqual([
      'iam-registration-to-submit',
    ])
    const rr = queue.items.find((i) => i.project.slug === 'reading-responses')!
    expect(rr.kind).toBe('release-approval')
    expect(recordItemsOf(queue, rr.project.id)).toEqual([])
  })

  it('lists every record the project has, in UBC’s order: the assessment, staging, production', () => {
    const found = recordsOf(records.get('phys-101-labs')!)
    expect(found.map((f) => (f.kind === 'pia' ? 'pia' : f.record.environment))).toEqual([
      'pia',
      'staging',
      'production',
    ])
  })
})
