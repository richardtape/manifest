import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ManifestApiError, type Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { signIn } from '../auth'
import { itemKey, kindWords, type QueueItem } from '../queue-state'
import { Refusal } from '../refusal'
import {
  Choice,
  FactList,
  MachineValue,
  ObservedAction,
  RawChip,
  Tags,
  type ChoiceOption,
} from '../system'
import { ageWords, dayInWords, dayOfDate, vancouverToday } from '../time'
import {
  createKeys,
  grantedChange,
  IAM_MOVES,
  iamAnswerBody,
  PIA_MOVES,
  piaAnswerBody,
  prefilledAttributes,
  submissionBody,
  type IamAnswer,
  type IamMove,
  type PiaMove,
} from '../transitions'
import { ItemHead } from './item-head'

type Registration = Schemas['IamRegistration']
type Assessment = Schemas['PrivacyAssessment']

/** The record a queue item is about, with which of the two kinds it is. */
export type Found =
  { kind: 'iam'; record: Registration } | { kind: 'pia'; record: Assessment }

/** The Manifest team's three kinds: a record its owner SENT to the team, to submit to UBC or hand back. */
const TEAM_KINDS: ReadonlySet<QueueItem['kind']> = new Set([
  'iam-registration-to-submit',
  'iam-change-to-file',
  'privacy-assessment-to-submit',
])
const PIA_KINDS: ReadonlySet<QueueItem['kind']> = new Set([
  'privacy-assessment-to-submit',
  'privacy-assessment',
])

/** Whether this pane draws a queue item: every kind but a release's sign-off. */
export const isRecordKind = (kind: QueueItem['kind']): boolean =>
  kind !== 'release-approval'

/**
 * The record an item names, from the project's launch records: the assessment, or the registration of
 * the item's environment (production's when it names none, as the platform reads an absent one) — and
 * only when it IS the item's subject.
 */
export function recordOf(
  records: Schemas['LaunchRecords'],
  item: QueueItem,
): Found | null {
  if (!isRecordKind(item.kind)) return null
  if (PIA_KINDS.has(item.kind)) {
    const a = records.privacyAssessment
    return a === null || a.id !== item.subjectId ? null : { kind: 'pia', record: a }
  }
  const r =
    item.environment === 'staging' ? records.stagingRegistration : records.iamRegistration
  return r === null || r.id !== item.subjectId ? null : { kind: 'iam', record: r }
}

/** Whether the record is still where its item said: with the team (`sent`), or with UBC. */
function stillWaiting(found: Found, item: QueueItem): boolean {
  if (TEAM_KINDS.has(item.kind)) return found.record.state === 'sent'
  if (found.kind === 'pia') return found.record.state === 'submitted'
  return found.record.state === 'submitted' || found.record.state === 'change_requested'
}

/** A change the team filed against a live registration, now with UBC IAM. */
const changeWithUbc = (found: Found): boolean =>
  found.kind === 'iam' &&
  found.record.state === 'change_requested' &&
  found.record.changeRequestedFrom === 'active'

/** The grant (A20): the `submitted` arrow out of a change with UBC IAM, carried on to `active`. */
const isGrant = (found: Found, move: string): boolean =>
  changeWithUbc(found) && move === 'submitted'

function iamWords(r: Registration, to: IamMove): { title: string; note: string } {
  switch (to) {
    case 'submitted':
      if (r.state === 'change_requested' && r.changeRequestedFrom === 'active')
        return {
          title: 'Active — UBC IAM answered the change',
          note: 'Recorded in two steps: with UBC IAM, then active, at what UBC IAM registered. The registration stays in force between them.',
        }
      if (r.state === 'change_requested')
        return {
          title: 'Back with UBC IAM',
          note: 'Its owner answered UBC IAM’s questions.',
        }
      return {
        title: 'With UBC IAM',
        note: 'Submitted; UBC IAM’s answer is recorded here when it comes.',
      }
    case 'active':
      return {
        title: 'Active — UBC IAM registered it',
        note: 'Exactly the attributes the ticket lists.',
      }
    case 'change_requested':
      return r.state === 'active'
        ? { title: 'A change filed with UBC IAM', note: 'It names what it asks for.' }
        : {
            title: 'UBC IAM asked its owner for changes',
            note: 'Its owner answers them and sends it again.',
          }
    case 'expired':
      return { title: 'Expired', note: 'The registration lapsed.' }
    case 'draft':
      return { title: 'Draft', note: 'Back to its owner.' }
  }
}

function piaWords(
  from: Assessment['state'],
  to: PiaMove,
): { title: string; note: string } {
  switch (to) {
    case 'approved':
      return {
        title: 'Approved by the Privacy Office',
        note: 'With its reviewer and the PIA number.',
      }
    case 'draft':
      return from === 'submitted'
        ? {
            title: 'Refused — back to its owner as a draft',
            note: 'Its owner drafts it again and sends it.',
          }
        : { title: 'Back to a draft', note: 'Its owner drafts it again and sends it.' }
    case 'submitted':
      return {
        title: 'With the Privacy Office',
        note: 'Submitted; the Office’s answer is recorded here when it comes.',
      }
  }
}

/** THE ANSWER FORM'S OPTIONS: exactly the platform's moves from where the record is (Decision 9). */
export function answerOptions(found: Found): ChoiceOption[] {
  if (found.kind === 'pia')
    return PIA_MOVES[found.record.state].map((to) => ({
      value: to,
      ...piaWords(found.record.state, to),
    }))
  const r = found.record
  return IAM_MOVES[r.state].map((to) => ({ value: to, ...iamWords(r, to) }))
}

/** What the pane's form holds. Every field is text, as an input holds it. */
export interface RecordForm {
  /** UBC's reference: the team's new one for a submission; the record's own, pre-filled, for an answer. */
  ticket: string
  /** The day the team sent it, `YYYY-MM-DD`; today in Vancouver at first. */
  sentOn: string
  /** The arrow chosen. */
  move: string
  /** What UBC IAM registered, comma-separated — for an answer reaching `active`. */
  registered: string
  /** What a change asks for, comma-separated — for `active → change_requested`. */
  requested: string
  fingerprint: string
  /** `YYYY-MM-DD`. */
  expires: string
  reviewer: string
}

const BLANK: RecordForm = {
  ticket: '',
  sentOn: '',
  move: '',
  registered: '',
  requested: '',
  fingerprint: '',
  expires: '',
  reviewer: '',
}

const certOf = (r: Registration) => ({
  fingerprint: r.certFingerprint ?? r.package?.certificate.fingerprint ?? '',
  expires: (r.certExpiresAt ?? r.package?.certificate.expiresAt ?? '').slice(0, 10),
})

/** The form as a record first fills it. `ticket` keeps what was typed across a re-read. */
export function formOf(found: Found, now: Date, ticket?: string): RecordForm {
  const r = found.record
  const team = r.state === 'sent'
  const iam = found.kind === 'iam' ? found.record : null
  const cert = iam === null ? { fingerprint: '', expires: '' } : certOf(iam)
  return {
    ticket: ticket ?? (team ? '' : (r.externalTicketRef ?? '')),
    sentOn: vancouverToday(now),
    move: answerOptions(found)[0]?.value ?? '',
    registered: iam === null ? '' : prefilledAttributes(iam).join(', '),
    requested: iam?.requestedAttributes?.join(', ') ?? '',
    fingerprint: cert.fingerprint,
    expires: cert.expires,
    reviewer: found.kind === 'pia' ? (found.record.reviewer ?? '') : '',
  }
}

/** A comma- or space-separated list, as typed: each name once, in the order written. */
export function listOf(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((s) => s !== ''))]
}

/**
 * THE FORM AS AN ANSWER for `iamAnswerBody`: the lists as typed; the certificate as the form holds it —
 * an expiry left as pre-filled is sent as the record's own instant, never re-written as a midnight.
 */
export function iamAnswerOf(r: Registration, form: RecordForm): IamAnswer {
  const requested = listOf(form.requested)
  const fingerprint = form.fingerprint.trim()
  const expires = form.expires.trim()
  return {
    state: form.move as IamMove,
    ticket: form.ticket,
    registeredAttributes: listOf(form.registered),
    ...(requested.length === 0 ? {} : { requestedAttributes: requested }),
    ...(fingerprint === '' ? {} : { certFingerprint: fingerprint }),
    ...(expires === '' || expires === certOf(r).expires
      ? {}
      : { certExpiresAt: `${expires}T00:00:00.000Z` }),
  }
}

// ─── The platform's own sentences (`launch/records.ts`; the demo fleet's copies) ────────────────

const ticketWords = (ref: string | null | undefined) =>
  ref === null || ref === undefined || ref.trim() === '' ? '' : ` (ticket ${ref.trim()})`

function submitSentence(me: string, found: Found, day: string, ref: string): string {
  const ticket = ref.trim() === '' ? '…' : ref.trim()
  if (found.kind === 'pia')
    return `${me} recorded that the Manifest team submitted this app's privacy assessment to the UBC Privacy Office on ${day} (ticket ${ticket}).`
  const env = found.record.environment
  return found.record.sentFrom === 'active' ||
    found.record.changeRequestedFrom === 'active'
    ? `${me} recorded that the Manifest team filed a change request for this app's ${env} registration with UBC IAM on ${day} (ticket ${ticket}).`
    : `${me} recorded that the Manifest team submitted this app's ${env} registration to UBC IAM on ${day} (ticket ${ticket}).`
}

const handBackSentence = (me: string, found: Found) =>
  found.kind === 'pia'
    ? `${me} handed this app's privacy assessment back to its owner, unsubmitted.`
    : `${me} handed this app's ${found.record.environment} registration back to its owner, unsubmitted.`

const recordSentence = (me: string, found: Found, state: string, ref: string | null) =>
  found.kind === 'pia'
    ? `${me} recorded this app's privacy assessment as ${state}${ticketWords(ref)}.`
    : `${me} recorded this app's ${found.record.environment} UBC IAM registration as ${state}${ticketWords(ref)}.`

// ─── Drawing ───────────────────────────────────────────────────────────────────────────────────

function sec(title: string | null, children: ReactNode) {
  return (
    <section className="mfa-sec">
      {title === null ? null : <h3 className="mfa-sec__title">{title}</h3>}
      {children}
    </section>
  )
}
const para = (body: ReactNode) => <p className="mfa-sec__body">{body}</p>

function result(kind: 'steady' | 'neutral', title: string, lines: ReactNode[]) {
  return (
    <div className={`mfa-result mfa-result--${kind}`} role="status">
      <p className="mfa-result__title">{title}</p>
      {lines.map((line, i) => (
        <p key={i} className="mfa-result__body">
          {line}
        </p>
      ))}
    </div>
  )
}

function field(id: string, label: string, input: ReactNode) {
  return (
    <div className="mfa-field">
      <label htmlFor={id}>{label}</label>
      {input}
    </div>
  )
}

function stateLabel(found: Found): string {
  const r = found.record
  switch (r.state) {
    case 'draft':
      return 'Draft'
    case 'sent':
      return 'With the Manifest team'
    case 'submitted':
      return found.kind === 'iam' ? 'With UBC IAM' : 'With the Privacy Office'
    case 'active':
      return 'Active'
    case 'approved':
      return 'Approved'
    case 'change_requested':
      return found.kind === 'iam' && found.record.changeRequestedFrom === 'active'
        ? 'Change with UBC IAM'
        : 'Back with its owner'
    case 'expired':
      return 'Expired'
  }
}

/** A list as tags, an attribute the record does not yet register marked `+`. */
const asked = (list: readonly string[], registered: readonly string[]) => (
  <Tags items={list.map((x) => (registered.includes(x) ? x : { text: x, add: true }))} />
)

/** What is on record — every machine fact, the state in the platform's own enum. */
function recordFacts(found: Found) {
  const r = found.record
  const submitted =
    r.submittedAt === null
      ? 'Not yet'
      : `${dayInWords(r.submittedAt)}${r.submittedBy === null ? '' : `, recorded by ${r.submittedBy.displayName}`}`
  if (found.kind === 'pia') {
    const a = found.record
    return (
      <FactList
        rows={[
          { label: 'State', value: <RawChip raw={a.state} label={stateLabel(found)} /> },
          {
            label: 'PIA number',
            value: a.externalTicketRef ?? 'None yet',
            mono: a.externalTicketRef !== null,
          },
          { label: 'Reviewer', value: a.reviewer ?? 'None yet' },
          { label: 'Submitted', value: submitted },
          a.approvedAt !== null && { label: 'Approved', value: dayInWords(a.approvedAt) },
        ]}
      />
    )
  }
  const g = found.record
  return (
    <FactList
      rows={[
        { label: 'State', value: <RawChip raw={g.state} label={stateLabel(found)} /> },
        { label: 'Entity ID', value: g.entityId, mono: true },
        { label: 'ACS URL', value: g.acsUrl, mono: true },
        {
          label: 'Registered',
          value:
            g.registeredAttributes.length === 0 ? (
              'Nothing yet'
            ) : (
              <Tags items={g.registeredAttributes} />
            ),
        },
        g.requestedAttributes !== null && {
          label: 'Requested',
          value: asked(g.requestedAttributes, g.registeredAttributes),
        },
        g.certFingerprint !== null && {
          label: 'Certificate',
          value: (
            <span>
              <MachineValue value={g.certFingerprint} label="certificate fingerprint" />
              {g.certExpiresAt === null
                ? ''
                : ` · expires ${dayInWords(g.certExpiresAt)}`}
            </span>
          ),
        },
        {
          label: 'UBC IAM ticket',
          value: g.externalTicketRef ?? 'None yet',
          mono: g.externalTicketRef !== null,
        },
        { label: 'Submitted', value: submitted },
      ]}
    />
  )
}

/** What the owner sent for a registration: the package Manifest drafted, as it was sent. */
function packageSent(r: Registration, change: boolean) {
  const pkg = r.package
  const attributes =
    pkg === null ? null : (
      <ul className="mfa-attrs">
        {pkg.attributes.map((a) => (
          <li key={a.name}>
            <code className="mfa-mono">{a.name}</code>
            {` — ${a.purpose}`}
            <span className="mfa-attrs__oid">{` · ${a.oid}`}</span>
            {a.unused ? (
              <span className="mfa-flag">{' · never read by the code'}</span>
            ) : (
              <span className="mfa-attrs__used">
                {` · read at ${a.usedAt.map((u) => `${u.path}:${u.line}`).join(', ')}`}
              </span>
            )}
          </li>
        ))}
      </ul>
    )
  return (
    <FactList
      rows={[
        { label: 'Entity ID', value: r.entityId, mono: true },
        { label: 'ACS URL', value: r.acsUrl, mono: true },
        { label: 'SLO URL', value: r.sloUrl, mono: true },
        pkg !== null && {
          label: 'Certificate',
          value: (
            <span>
              <MachineValue
                value={pkg.certificate.fingerprint}
                label="certificate fingerprint"
                full
              />
              {` · expires ${dayInWords(pkg.certificate.expiresAt)}`}
            </span>
          ),
        },
        change && {
          label: 'Registered',
          value:
            r.registeredAttributes.length === 0 ? (
              'Nothing yet'
            ) : (
              <Tags items={r.registeredAttributes} />
            ),
        },
        change &&
          r.requestedAttributes !== null && {
            label: 'Asks for',
            value: asked(r.requestedAttributes, r.registeredAttributes),
          },
        change &&
          r.externalTicketRef !== null && {
            label: 'Live under',
            value: r.externalTicketRef,
            mono: true,
          },
        attributes !== null && { label: 'Attributes', value: attributes },
        pkg !== null &&
          pkg.usedAtTruncated && {
            label: 'Read',
            value:
              'Manifest read only part of the app’s code: a line elsewhere is not shown.',
          },
        pkg?.privacyAssessmentReference != null && {
          label: 'PIA number',
          value: pkg.privacyAssessmentReference,
          mono: true,
        },
      ]}
    />
  )
}

/** What the owner sent for an assessment: the six sections, every gap with their answer by its id. */
function assessmentSent(a: Assessment) {
  if (a.draft === null) return para('Manifest has no draft of it on record.')
  const answers = new Map((a.gapAnswers ?? []).map((x) => [x.gapId, x.answer]))
  return (
    <>
      {a.draft.sections.map((s) => (
        <div key={s.id} className="mfa-teamsec">
          <h4 className="mfa-teamsec__title">{s.title}</h4>
          <FactList rows={s.facts.map((f) => ({ label: f.label, value: f.value }))} />
          {s.gaps.map((g) => (
            <div key={g.id} className="mfa-gap">
              <p className="mfa-gap__q">
                <code className="mfa-mono">{g.id}</code> {g.text}
              </p>
              {answers.has(g.id) ? (
                <blockquote className="mfa-quote">{answers.get(g.id)}</blockquote>
              ) : (
                <p className="mfa-flag">No answer was sent for this gap.</p>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

/** What one of this pane's acts recorded: the answer the platform gave. */
export interface Done {
  action: 'submit' | 'hand-back' | 'record'
  record: Registration | Assessment
  /** A change UBC IAM granted, recorded in its two steps. */
  grant?: boolean
}

export interface RecordPaneViewProps {
  item: QueueItem
  me: Schemas['Me']
  now: Date
  /** The project's launch records, as last read; null until read. */
  records: Schemas['LaunchRecords'] | null
  readError?: unknown
  form: RecordForm
  /** The action whose request is in flight — every action is disabled meanwhile. */
  busy: string | null
  done: Done | null
  /** An act refused, or unanswered. */
  error?: unknown
  previewIndex: number
  /** A grant whose first write was recorded and whose second was not. */
  grantHalf?: boolean
  onForm?: (patch: Partial<RecordForm>) => void
  onSubmit?: () => void
  onHandBack?: () => void
  onRecord?: () => void
  onPreviewIndex?: (index: number) => void
}

/**
 * THE TEAM'S STEP AND UBC'S ANSWER, DRAWN (the design's §3.6 and §3.7): a record its owner sent to the
 * team — what they sent, then submit it to UBC with UBC's reference and the day it went, or hand it back
 * with no reason kept; a record with UBC — what is on record, then UBC's answer along only the moves the
 * platform allows, the attributes and certificate editable only where the answer reaches `active`.
 */
export function RecordPaneView(props: RecordPaneViewProps) {
  const { item, records, now, form } = props
  const head = <ItemHead item={item} now={now} />
  if (records === null)
    return (
      <>
        {head}
        <Refusal error={props.readError} />
        {props.readError === undefined ? sec(null, para('Reading the record…')) : null}
      </>
    )
  const found = recordOf(records, item)
  if (found === null)
    return (
      <>
        {head}
        {sec(null, para('Manifest no longer has this record for the app.'))}
      </>
    )
  const r = found.record
  const me = props.me.displayName
  const owner = r.sentBy?.displayName ?? item.requestedBy?.displayName ?? 'Its owner'
  const busy = props.busy !== null

  if (props.done !== null) {
    const d = props.done
    const after: Found =
      found.kind === 'iam'
        ? { kind: 'iam', record: d.record as Registration }
        : { kind: 'pia', record: d.record as Assessment }
    let said: ReactNode
    if (d.action === 'submit') {
      const day = d.record.submittedAt === null ? null : dayInWords(d.record.submittedAt)
      const filed = after.kind === 'iam' && after.record.state === 'change_requested'
      said = result(
        'steady',
        found.kind === 'pia'
          ? 'Submitted to the Privacy Office'
          : filed
            ? 'Filed with UBC IAM'
            : 'Submitted to UBC IAM',
        [
          `It waits on UBC${day === null ? '' : ` from ${day}`}; its answer is recorded here when it comes.`,
          `${owner} reads “${submitSentence(me, after, day ?? 'today', d.record.externalTicketRef ?? '')}”`,
        ],
      )
    } else if (d.action === 'hand-back')
      said = result('neutral', `Handed back to ${owner}`, [
        <>
          {`It is back with ${owner}, unsubmitted (`}
          <code className="mfa-mono">{d.record.state}</code>
          {`). ${owner} reads “${handBackSentence(me, found)}” — tell them why yourself.`}
        </>,
      ])
    else
      said = result('steady', `Recorded as ${d.record.state}`, [
        ...(d.grant === true ? ['In two steps: with UBC IAM, then active.'] : []),
        `${owner} reads “${recordSentence(me, after, d.record.state, d.record.externalTicketRef)}”`,
      ])
    return (
      <>
        {head}
        {sec('Where it is', said)}
        {sec('What is recorded', recordFacts(after))}
      </>
    )
  }

  if (!stillWaiting(found, item))
    return (
      <>
        {head}
        {sec(null, para('This is no longer waiting on us.'))}
        {sec('What is recorded', recordFacts(found))}
      </>
    )

  const id = item.subjectId
  const ticket = form.ticket.trim()

  // ── The team's step ──
  if (TEAM_KINDS.has(item.kind)) {
    const change = found.kind === 'iam' && found.record.sentFrom === 'active'
    const pia = found.kind === 'pia'
    const today = vancouverToday(now)
    const future = form.sentOn > today
    const to = pia ? 'the Privacy Office' : 'UBC IAM'
    const sentBy = r.sentBy?.displayName ?? owner
    const sent =
      found.kind === 'pia'
        ? assessmentSent(found.record)
        : packageSent(found.record, change)
    const warnings =
      found.kind === 'pia'
        ? (found.record.draft?.warnings ?? [])
        : (found.record.package?.warnings ?? [])
    return (
      <>
        {head}
        {sec(
          change ? `The change ${sentBy} asked for` : `What ${sentBy} sent`,
          <>
            {para(
              `Sent to the Manifest team${r.sentAt === null ? '' : ` ${ageWords(r.sentAt, now)} ago`}${
                change
                  ? ', a change to the live registration. UBC IAM’s registration stands until it answers.'
                  : '.'
              }`,
            )}
            {sent}
            {warnings.length === 0 ? null : (
              <p className="mfa-flag">{warnings.join(' ')}</p>
            )}
          </>,
        )}
        {sec(
          change ? 'File it, or hand it back' : 'Submit it, or hand it back',
          <>
            <Refusal error={props.error} />
            <ObservedAction
              id={`team-${id}`}
              owner={owner}
              canRecord={false}
              admissionLead="Manifest doesn’t keep a reason for a hand-back. "
              admission={`Tell ${owner} why yourself.`}
              previews={[
                {
                  label: change ? 'If you file it' : 'If you submit it',
                  type: pia
                    ? 'privacy_assessment.submitted'
                    : 'iam_registration.submitted',
                  lead: submitSentence(
                    me,
                    found,
                    form.sentOn === '' ? '…' : dayOfDate(form.sentOn),
                    form.ticket,
                  ),
                },
                {
                  label: 'If you hand it back',
                  type: pia ? 'privacy_assessment.returned' : 'iam_registration.returned',
                  lead: handBackSentence(me, found),
                },
              ]}
              previewIndex={props.previewIndex}
              onPreviewIndex={(i) => props.onPreviewIndex?.(i)}
              actions={[
                {
                  label: change ? 'File the change request' : `Submit to ${to}`,
                  kind: 'primary',
                  disabled: busy || ticket === '' || future || form.sentOn === '',
                  onClick: () => props.onSubmit?.(),
                },
                {
                  label: 'Hand it back',
                  kind: 'secondary',
                  disabled: busy,
                  onClick: () => props.onHandBack?.(),
                },
              ]}
              note={
                future
                  ? 'It cannot have gone after today.'
                  : form.sentOn === ''
                    ? 'Say the day it went to UBC.'
                    : ticket === ''
                      ? `Submitting needs ${pia ? 'the PIA number' : 'UBC IAM’s ticket'}, pasted in.`
                      : null
              }
            >
              <div className="mfa-row2">
                {field(
                  `ticket-${id}`,
                  pia ? 'The PIA number' : 'UBC IAM’s ticket',
                  <input
                    id={`ticket-${id}`}
                    value={form.ticket}
                    placeholder={pia ? 'PIA-2026-0000' : 'IAM-2026-0000'}
                    onChange={(e) => props.onForm?.({ ticket: e.target.value })}
                  />,
                )}
                {field(
                  `sent-${id}`,
                  `Sent to ${to} on`,
                  <input
                    id={`sent-${id}`}
                    type="date"
                    value={form.sentOn}
                    max={today}
                    onChange={(e) => props.onForm?.({ sentOn: e.target.value })}
                  />,
                )}
              </div>
            </ObservedAction>
          </>,
        )}
      </>
    )
  }

  // ── UBC's answer ──
  const iam = found.kind === 'iam' ? found.record : null
  const move = form.move
  const grant = isGrant(found, move)
  const reaching = iam !== null && (move === 'active' || grant)
  const asking = iam !== null && iam.state === 'active' && move === 'change_requested'
  const noneRegistered = reaching && listOf(form.registered).length === 0
  const finalState = grant ? 'active' : move
  const ref = ticket === '' ? r.externalTicketRef : ticket
  return (
    <>
      {head}
      {sec('What is recorded', recordFacts(found))}
      {sec(
        iam !== null ? 'Record UBC IAM’s answer' : 'Record the Privacy Office’s answer',
        <>
          {para(
            <>
              {'Only the moves the platform allows from '}
              <code className="mfa-mono">{r.state}</code>
              {' are offered.'}
            </>,
          )}
          {changeWithUbc(found)
            ? para(
                'A change UBC IAM granted is recorded in two steps: with UBC IAM, then active.',
              )
            : null}
          <Choice
            name={`move-${id}`}
            label={iam !== null ? 'UBC IAM’s answer' : 'The Privacy Office’s answer'}
            value={move}
            options={answerOptions(found)}
            onChange={(v) => props.onForm?.({ move: v })}
          />
          <div className="mfa-row2">
            {field(
              `ticket-${id}`,
              iam !== null ? 'UBC IAM’s ticket' : 'The PIA number',
              <input
                id={`ticket-${id}`}
                value={form.ticket}
                onChange={(e) => props.onForm?.({ ticket: e.target.value })}
              />,
            )}
            {iam === null
              ? field(
                  `reviewer-${id}`,
                  'Reviewer',
                  <input
                    id={`reviewer-${id}`}
                    value={form.reviewer}
                    onChange={(e) => props.onForm?.({ reviewer: e.target.value })}
                  />,
                )
              : null}
            {reaching
              ? field(
                  `registered-${id}`,
                  'Registered by UBC IAM',
                  <input
                    id={`registered-${id}`}
                    className="mfa-mono"
                    value={form.registered}
                    onChange={(e) => props.onForm?.({ registered: e.target.value })}
                  />,
                )
              : null}
            {asking
              ? field(
                  `requested-${id}`,
                  'Asks for',
                  <input
                    id={`requested-${id}`}
                    className="mfa-mono"
                    value={form.requested}
                    onChange={(e) => props.onForm?.({ requested: e.target.value })}
                  />,
                )
              : null}
            {iam !== null && move === 'active'
              ? field(
                  `fp-${id}`,
                  'Certificate fingerprint',
                  <input
                    id={`fp-${id}`}
                    className="mfa-mono"
                    value={form.fingerprint}
                    onChange={(e) => props.onForm?.({ fingerprint: e.target.value })}
                  />,
                )
              : null}
            {iam !== null && move === 'active'
              ? field(
                  `exp-${id}`,
                  'Certificate expires',
                  <input
                    id={`exp-${id}`}
                    type="date"
                    value={form.expires}
                    onChange={(e) => props.onForm?.({ expires: e.target.value })}
                  />,
                )
              : null}
          </div>
        </>,
      )}
      {sec(
        'Record it',
        <>
          <Refusal error={props.error} />
          {props.grantHalf === true
            ? para(
                'UBC IAM’s answer was recorded in part: the registration is with UBC IAM (submitted), and active was not recorded. Record UBC IAM’s answer again to finish — the first step is not repeated.',
              )
            : null}
          <ObservedAction
            id={`record-${id}`}
            owner={owner}
            canRecord={false}
            admissionLead="No reason is asked. "
            admission="Recording UBC’s answer is an administrator’s own duty, and the event names you."
            previews={[
              {
                label: 'Record it',
                type:
                  iam !== null
                    ? 'iam_registration.recorded'
                    : 'privacy_assessment.recorded',
                lead: recordSentence(me, found, finalState, ref),
                ...(grant
                  ? {
                      after: `Before it: “${recordSentence(me, found, 'submitted', ref)}”`,
                    }
                  : {}),
              },
            ]}
            actions={[
              {
                label: 'Record it',
                kind: 'primary',
                disabled: busy || ticket === '' || noneRegistered || move === '',
                onClick: () => props.onRecord?.(),
              },
            ]}
            note={
              ticket === ''
                ? 'A record needs the ticket reference, pasted in.'
                : noneRegistered
                  ? 'UBC IAM registers at least one attribute: list what the ticket lists.'
                  : null
            }
          />
        </>,
      )}
    </>
  )
}

export interface RecordPaneProps {
  api: Api
  me: Schemas['Me']
  item: QueueItem
  now: Date
  /** The queue's last read no longer lists it (Review Focus 4): the record is read again. */
  left: boolean
  /** An act recorded: the queue reads again, so the item moves to its band now, not in a minute. */
  onDecided?: () => void
}

/**
 * THE TEAM'S STEP AND UBC'S ANSWER: the project's launch records read on entry and after every act; each
 * act sent under ONE key per operator action, held until an answer arrives (`createKeys`), every action
 * disabled while one is in flight; a refusal shown and the record re-read; a granted change as its two
 * writes, a failed second leaving the record at `submitted` with the answer offered again.
 */
export function RecordPane(props: RecordPaneProps) {
  const { api, item } = props
  const projectId = item.project.id
  const [records, setRecords] = useState<Schemas['LaunchRecords'] | null>(null)
  const [readError, setReadError] = useState<unknown>(undefined)
  const [form, setForm] = useState<RecordForm | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [error, setError] = useState<unknown>(undefined)
  const [grantHalf, setGrantHalf] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [keys] = useState(() => createKeys(api.newKey))
  const formState = useRef<string | null>(null)

  const read = useCallback(
    (live: () => boolean = () => true) =>
      api.getLaunchRecords(projectId).then(
        (held) => {
          if (!live()) return
          setRecords(held)
          setReadError(undefined)
          const found = recordOf(held, item)
          // The form follows the record: a new state (a grant's first step recorded) re-fills it, the
          // ticket typed kept.
          const state = found === null ? null : found.record.state
          if (found !== null && state !== formState.current) {
            setForm((f) => formOf(found, new Date(), f?.ticket))
            formState.current = state
          }
        },
        (e: unknown) => live() && setReadError(e),
      ),
    [api, projectId, item],
  )

  useEffect(() => {
    let live = true
    void read(() => live)
    return () => {
      live = false
    }
  }, [read])

  // It left the queue while open: someone else may have acted, so what is on record is read again — the
  // pane stays on its subject and says what became of it (Review Focus 4).
  const left = props.left
  useEffect(() => {
    if (!left) return
    let live = true
    void read(() => live)
    return () => {
      live = false
    }
  }, [left, read])

  /** One act under the key its action holds; the key is given up only once an answer arrives. */
  async function send<T>(action: string, call: (key: string) => Promise<T>): Promise<T> {
    const key = keys.keyFor(action)
    setBusy(action)
    try {
      const answer = await call(key)
      keys.answered(action)
      return answer
    } catch (e) {
      keys.answered(action, e)
      throw e
    } finally {
      setBusy(null)
    }
  }

  const refused = (e: unknown) => {
    setError(e)
    // A refusal says the record is not where this pane drew it: read what is there.
    if (e instanceof ManifestApiError) void read()
  }
  const recorded = (d: Done) => {
    setError(undefined)
    setGrantHalf(false)
    setDone(d)
    void read()
    props.onDecided?.()
  }

  const found = records === null ? null : recordOf(records, item)
  const env = item.environment ?? 'production'

  const onSubmit = () => {
    if (found === null || form === null) return
    const body = submissionBody(form)
    setError(undefined)
    const call = (key: string) =>
      found.kind === 'pia'
        ? api.submitPrivacyAssessment(projectId, body, key)
        : api.submitIamRegistration(projectId, env, body, key)
    send<Registration | Assessment>('submit', call).then(
      (record) => recorded({ action: 'submit', record }),
      refused,
    )
  }

  const onHandBack = () => {
    if (found === null) return
    setError(undefined)
    const call = (key: string) =>
      found.kind === 'pia'
        ? api.returnPrivacyAssessment(projectId, key)
        : api.returnIamRegistration(projectId, env, key)
    send<Registration | Assessment>('hand-back', call).then(
      (record) => recorded({ action: 'hand-back', record }),
      refused,
    )
  }

  const onRecord = async () => {
    if (found === null || form === null) return
    setError(undefined)
    if (found.kind === 'pia') {
      const body = piaAnswerBody({
        state: form.move as PiaMove,
        ticket: form.ticket,
        reviewer: form.reviewer,
      })
      send(`record:${form.move}`, (key) =>
        api.recordPrivacyAssessment(projectId, body, key),
      ).then((record) => recorded({ action: 'record', record }), refused)
      return
    }
    const r = found.record
    if (isGrant(found, form.move)) {
      // A20: ONE decision, TWO writes, each on its own key. The second's action is the same as a plain
      // `active` answer's, so a retry from the form after it failed unanswered reuses its key.
      const [first, second] = grantedChange(r, item, form.ticket, listOf(form.registered))
      try {
        await send('record:submitted', (key) =>
          api.recordIamRegistration(projectId, first, key),
        )
      } catch (e) {
        refused(e)
        return
      }
      try {
        const record = await send('record:active', (key) =>
          api.recordIamRegistration(projectId, second, key),
        )
        recorded({ action: 'record', record, grant: true })
      } catch (e) {
        setGrantHalf(true)
        setError(e)
        void read()
      }
      return
    }
    const body = iamAnswerBody(r, item, iamAnswerOf(r, form))
    send(`record:${form.move}`, (key) =>
      api.recordIamRegistration(projectId, body, key),
    ).then((record) => recorded({ action: 'record', record }), refused)
  }

  // Until the record is read the form is empty; a record not found draws no form at all.
  return (
    <RecordPaneView
      item={item}
      me={props.me}
      now={props.now}
      records={records}
      readError={readError}
      form={form ?? BLANK}
      busy={busy}
      done={done}
      error={error}
      previewIndex={previewIndex}
      grantHalf={grantHalf}
      onForm={(patch) => setForm((f) => (f === null ? f : { ...f, ...patch }))}
      onSubmit={onSubmit}
      onHandBack={onHandBack}
      onRecord={() => void onRecord()}
      onPreviewIndex={setPreviewIndex}
    />
  )
}

// ─── `/projects/<id>/records` — the team's emailed link (`mail/team.ts`) ─────────────────────────

/** A project's items that are about its launch records, in the queue's order. */
export function recordItemsOf(queue: Schemas['Queue'], projectId: string): QueueItem[] {
  return queue.items.filter((i) => i.project.id === projectId && isRecordKind(i.kind))
}

/** Every record the project has, in UBC's order: the assessment, staging's registration, production's. */
export function recordsOf(records: Schemas['LaunchRecords']): Found[] {
  const found: Found[] = []
  if (records.privacyAssessment !== null)
    found.push({ kind: 'pia', record: records.privacyAssessment })
  if (records.stagingRegistration !== null)
    found.push({ kind: 'iam', record: records.stagingRegistration })
  if (records.iamRegistration !== null)
    found.push({ kind: 'iam', record: records.iamRegistration })
  return found
}

const titleOf = (found: Found) =>
  found.kind === 'pia'
    ? 'The privacy assessment'
    : `The ${found.record.environment} registration`

/**
 * A PROJECT'S LAUNCH RECORDS — where the email to the Manifest team links (`${origin}/projects/<id>/records`):
 * each record waiting on an administrator in its pane, the team's step or UBC's answer, and the others
 * as what is on record. Read once on entry; each pane reads its own record again after it acts.
 */
export function RecordsScreen({
  api,
  me,
  projectId,
}: {
  api: Api
  me: Schemas['Me']
  projectId: string
}) {
  const [read, setRead] = useState<{
    project: Schemas['Project']
    queue: Schemas['Queue']
    records: Schemas['LaunchRecords']
    at: Date
  } | null>(null)
  const [error, setError] = useState<unknown>(undefined)

  useEffect(() => {
    let live = true
    Promise.all([
      api.getProject(projectId),
      api.listQueue(),
      api.getLaunchRecords(projectId),
    ]).then(
      ([project, queue, records]) =>
        live && setRead({ project, queue, records, at: new Date() }),
      (e: unknown) => {
        if (!live) return
        if (
          e instanceof ManifestApiError &&
          e.status === 401 &&
          e.code === 'UNAUTHENTICATED'
        )
          signIn(window.location.pathname + window.location.search)
        else setError(e)
      },
    )
    return () => {
      live = false
    }
  }, [api, projectId])

  if (read === null)
    return error === undefined ? (
      <p className="mfa-sec__body">Reading the launch records…</p>
    ) : (
      <Refusal error={error} />
    )
  const items = recordItemsOf(read.queue, projectId)
  const waiting = new Set(items.map((i) => i.subjectId))
  return (
    <>
      <h1 className="mfa-h1">
        {'Launch records · '}
        <span className="mfa-mono">{read.project.slug}</span>
      </h1>
      {items.length === 0
        ? para('Nothing of this app’s launch records is waiting on an administrator.')
        : null}
      {items.map((item) => (
        <section
          key={itemKey(item)}
          className="mfa-pane"
          aria-label={kindWords(item.kind)}
        >
          <RecordPane api={api} me={me} item={item} now={read.at} left={false} />
        </section>
      ))}
      {recordsOf(read.records)
        .filter((f) => !waiting.has(f.record.id))
        .map((f) => (
          <Fragment key={f.record.id}>{sec(titleOf(f), recordFacts(f))}</Fragment>
        ))}
    </>
  )
}
