import type { Schemas } from '@manifest/contract'

/**
 * THE LAUNCH RECORDS' ALLOWED MOVES (`launch/transitions.ts`), RESTATED SO THE RECORD-ANSWER FORM OFFERS
 * ONLY WHAT THE PLATFORM ALLOWS (Decision 9) — and held to the published sentence by
 * `transitions.test.ts`, so the day the platform's arrows change this table turns red rather than the
 * form wrong. A `409 LAUNCH_TRANSITION_INVALID` arriving anyway is still shown and the record re-read.
 *
 * `sent` has NO arrow: a record with the Manifest team leaves only by its submission or its hand-back,
 * so the record form is never offered for a `sent` record — the team's pane is (M7).
 */
export type IamState = Schemas['IamRegistration']['state']
export type PiaState = Schemas['PrivacyAssessment']['state']
export type IamMove = Schemas['RecordIamRegistrationRequest']['state']
export type PiaMove = Schemas['RecordPrivacyAssessmentRequest']['state']

export const IAM_MOVES: Record<IamState, readonly IamMove[]> = {
  draft: ['submitted'],
  sent: [],
  submitted: ['active', 'change_requested'],
  active: ['change_requested', 'expired'],
  change_requested: ['submitted', 'expired'],
  expired: ['submitted'],
}

export const PIA_MOVES: Record<PiaState, readonly PiaMove[]> = {
  draft: ['submitted'],
  sent: [],
  submitted: ['approved', 'draft'],
  approved: ['draft'],
}

/**
 * The arrows a published `state` description states: *"… — `a` to `b`; `c` to `d` or `e`; …."* — the
 * clauses after the dash, up to the sentence's end. A clause's first backticked state is where it starts
 * and the rest are where it may go (*"`submitted` to `approved`, or back to `draft` when …"* is two). A
 * backticked code or operation name (`409 LAUNCH_TRANSITION_INVALID`, `submitIamRegistration`) is not a
 * state; *"the state it is in, or one step on"* comes before the dash and is no arrow.
 */
export function movesFromSentence(sentence: string): Record<string, string[]> {
  const dash = sentence.indexOf('—')
  const rest = dash === -1 ? sentence : sentence.slice(dash + 1)
  const end = rest.search(/\.(\s|$)/)
  const list = end === -1 ? rest : rest.slice(0, end)
  const moves: Record<string, string[]> = {}
  for (const clause of list.split(';')) {
    if (!/\bto\b/.test(clause)) continue
    const states = [...clause.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1]!)
      .filter((s) => /^[a-z][a-z_]*$/.test(s))
    const [from, ...to] = states
    if (from === undefined || to.length === 0) continue
    moves[from] = [...(moves[from] ?? []), ...to].sort()
  }
  return moves
}

/**
 * WHAT UBC IAM REGISTERED, AS THE FORM FIRST HOLDS IT for an `active` answer: what an outstanding change
 * asks for, else what the drafted package asks for, else what is on record. The operator edits it to
 * what the ticket lists — the record is what UBC registered, never what the app asks for.
 */
export function prefilledAttributes(record: Schemas['IamRegistration']): string[] {
  if (record.requestedAttributes !== null && record.requestedAttributes.length > 0)
    return [...record.requestedAttributes]
  if (record.package !== null && record.package.attributes.length > 0)
    return record.package.attributes.map((a) => a.name)
  return [...record.registeredAttributes]
}

export interface IamAnswer {
  state: IamMove
  ticket: string
  /** What UBC IAM registered, as the form holds it — sent only by a move that reaches `active`. */
  registeredAttributes?: readonly string[]
  /** What a change asks for — sent only by `active → change_requested`. */
  requestedAttributes?: readonly string[]
  certFingerprint?: string
  certExpiresAt?: string
}

const said = (value: string | undefined | null) => {
  const v = value?.trim()
  return v === undefined || v === '' ? undefined : v
}

/**
 * THE BODY A MOVE SENDS (C1) — exactly what `recordIamRegistration` requires, from the record and the
 * queue item, never from the form alone:
 * - `environment` from the queue item, ALWAYS named — absent means production's (`records.ts:170`), so a
 *   staging answer without it writes the wrong registration;
 * - the record's own `entityId`, `acsUrl` and `sloUrl` (the platform upserts them from the body);
 * - `registeredAttributes`: for `active`, what the form holds (pre-filled, editable); for any other move
 *   the record's own, unchanged — once registered, a write that does not reach `active` must repeat
 *   them — or, while UBC has registered nothing and the record's list is empty, what was asked for
 *   (the schema's `minItems: 1`; `registeredAt` stays unset, so no build is checked against it);
 * - `requestedAttributes` for `active → change_requested` only (any other write keeps what is held);
 * - the certificate, ALWAYS: the upsert writes `certFingerprint`/`certExpiresAt` AS SENT
 *   (`records.ts`, `?? null`), so a body without them erases what is on record. For `active`, what the
 *   form holds, else the record's, else the drafted package's certificate; otherwise the record's;
 * - the ticket, trimmed, and absent when empty (the platform keeps the one on record).
 */
export function iamAnswerBody(
  record: Schemas['IamRegistration'],
  item: Schemas['QueueItem'],
  answer: IamAnswer,
): Schemas['RecordIamRegistrationRequest'] {
  const reaching = answer.state === 'active'
  const registered = reaching
    ? (answer.registeredAttributes ?? prefilledAttributes(record))
    : record.registeredAttributes.length > 0
      ? record.registeredAttributes
      : prefilledAttributes(record)
  const requested =
    record.state === 'active' && answer.state === 'change_requested'
      ? (answer.requestedAttributes ?? record.requestedAttributes ?? undefined)
      : undefined
  const fingerprint = reaching
    ? (said(answer.certFingerprint) ??
      record.certFingerprint ??
      record.package?.certificate.fingerprint)
    : (record.certFingerprint ?? undefined)
  const expires = reaching
    ? (said(answer.certExpiresAt) ??
      record.certExpiresAt ??
      record.package?.certificate.expiresAt)
    : (record.certExpiresAt ?? undefined)
  const ticket = said(answer.ticket)
  return {
    environment: item.environment ?? record.environment,
    entityId: record.entityId,
    acsUrl: record.acsUrl,
    sloUrl: record.sloUrl,
    registeredAttributes: [...registered],
    ...(requested === undefined ? {} : { requestedAttributes: [...requested] }),
    state: answer.state,
    ...(ticket === undefined ? {} : { externalTicketRef: ticket }),
    ...(fingerprint === undefined ? {} : { certFingerprint: fingerprint }),
    ...(expires === undefined ? {} : { certExpiresAt: expires }),
  }
}

/**
 * A CHANGE UBC IAM GRANTED (A20) — the two writes, in order, each sent on its own key: `submitted` (the
 * registered attributes unchanged: the live registration stays in force between them) and then `active`
 * with the granted set. There is no arrow from `change_requested` to `active`; the first write re-stamps
 * `submittedAt` NOW (an administrator's record, sitting 3's F2), so between the two the queue reads an
 * `iam-registration` waiting since this minute.
 */
export function grantedChange(
  record: Schemas['IamRegistration'],
  item: Schemas['QueueItem'],
  ticket: string,
  granted: readonly string[],
): [Schemas['RecordIamRegistrationRequest'], Schemas['RecordIamRegistrationRequest']] {
  return [
    iamAnswerBody(record, item, { state: 'submitted', ticket }),
    iamAnswerBody({ ...record, state: 'submitted' }, item, {
      state: 'active',
      ticket,
      registeredAttributes: granted,
    }),
  ]
}

/**
 * THE TEAM'S SUBMISSION: UBC's reference, trimmed, and the day it went — always named (the form offers
 * today in Vancouver and refuses a day after it before the platform does).
 */
export function submissionBody(form: {
  ticket: string
  sentOn: string
}): Schemas['RecordSubmissionRequest'] {
  return { sentAt: form.sentOn, reference: form.ticket.trim() }
}

/** The Privacy Office's answer: the state, its reference and its reviewer — the upsert writes the reviewer as sent. */
export function piaAnswerBody(answer: {
  state: PiaMove
  ticket: string
  reviewer: string
}): Schemas['RecordPrivacyAssessmentRequest'] {
  const ticket = said(answer.ticket)
  const reviewer = said(answer.reviewer)
  return {
    state: answer.state,
    ...(ticket === undefined ? {} : { externalTicketRef: ticket }),
    ...(reviewer === undefined ? {} : { reviewer }),
  }
}

/**
 * ONE `Idempotency-Key` PER OPERATOR ACTION, HELD UNTIL AN ANSWER ARRIVES (D23.6, Review Focus 2). An
 * answer is a success or a refusal below `500` — nothing was recorded, or it was and was answered — and
 * the next press is a new action. No answer (the network dropped it) or a `5xx` MAY have been recorded,
 * so the next press sends the SAME key and the platform replays the first answer rather than recording
 * a second decision.
 */
export function createKeys(newKey: () => string) {
  const held = new Map<string, string>()
  return {
    keyFor(action: string): string {
      let key = held.get(action)
      if (key === undefined) {
        key = newKey()
        held.set(action, key)
      }
      return key
    },
    answered(action: string, error?: unknown): void {
      if (error === undefined) {
        held.delete(action)
        return
      }
      const status = (error as { status?: unknown } | null)?.status
      if (typeof status === 'number' && status < 500) held.delete(action)
    },
  }
}

export type Keys = ReturnType<typeof createKeys>
