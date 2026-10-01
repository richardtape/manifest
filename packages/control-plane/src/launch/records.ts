import { and, eq } from 'drizzle-orm'
import { iamRegistrations, privacyAssessments, users, type Db } from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import { personName } from '../projects/index.js'
import {
  iamTransition,
  piaTransition,
  refuseSubmission,
  SUBMIT_ARROWS,
  type IamState,
  type PiaState,
} from './transitions.js'

/**
 * §9's two external records, which **Manifest tracks and does not produce** (D19, R1):
 * UBC IAM registers a Service Provider and the Privacy Office approves a PIA, both out of
 * band and both on multi-week lead times. P6a records what they said, with the ticket
 * reference pasted in; **P8 generates the submissions** — and §9 says the objects carry
 * submission state *"precisely so that"* the manual and the programmatic case are one
 * state transition with a different driver behind it (D5, D10).
 *
 * There is no `delete` here and no route that moves a record backwards other than along
 * its own arrows. §13's *Integrity of the gate* is a list of holes to close, and *"an
 * administrator can delete the PIA row and start again"* is one of them.
 */

export type IamRegistrationRow = typeof iamRegistrations.$inferSelect
export type PrivacyAssessmentRow = typeof privacyAssessments.$inferSelect

/**
 * WHICH UBC WORLD A REGISTRATION IS FOR (§6, §9; the launch path plan's Task 9). A project has one
 * per environment that signs people in against UBC: staging's, then production's, in UBC's order.
 * Never the sandbox, which registers itself with the Manifest IdP alone.
 */
export type RegistrationEnvironment = 'staging' | 'production'

/**
 * `launch/`'s OTHER refusal — a record whose fields cannot be accepted (`400`), or, since the
 * launch path plan's Task 9, one that cannot be sent yet (`409`: no draft, or UBC's order not
 * met) — as distinct from a move its state machine does not have. The registry states each
 * code's status; `api/errors.ts` reads it. Same reasoning as `LaunchTransitionError` about where
 * it lives and why the code is a constructor argument.
 */
export class LaunchRecordError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message)
    this.name = 'LaunchRecordError'
  }
}

export interface RecordIamInput {
  projectId: string
  /** Which registration — production's when absent, as every record before Task 9 was. */
  environment?: RegistrationEnvironment | undefined
  entityId: string
  acsUrl: string
  sloUrl: string
  registeredAttributes: string[]
  /**
   * What a CHANGE REQUEST asks UBC IAM for (§9, P6b Decision 11). Required when a registration
   * goes from `active` to `change_requested`; carried forward by a later record that omits it;
   * cleared when the record reaches `active`.
   */
  requestedAttributes?: string[] | undefined
  state: IamState
  externalTicketRef?: string | undefined
  certFingerprint?: string | undefined
  certExpiresAt?: Date | undefined
  actor: { id: string; puid: string }
}

export interface RecordPiaInput {
  projectId: string
  state: PiaState
  reviewer?: string | undefined
  externalTicketRef?: string | undefined
  actor: { id: string; puid: string }
}

/**
 * ONE ENVIRONMENT'S REGISTRATION. **The environment is required, never defaulted**: since Task 9 a
 * project may hold two rows, and a reader that meant production's and read "the" row would be
 * answered staging's — so every caller says which, and `tsc` holds them to it.
 */
export async function getIamRegistration(
  db: Db,
  projectId: string,
  environment: RegistrationEnvironment,
): Promise<IamRegistrationRow | undefined> {
  const [row] = await db
    .select()
    .from(iamRegistrations)
    .where(
      and(
        eq(iamRegistrations.projectId, projectId),
        eq(iamRegistrations.environmentKind, environment),
      ),
    )
    .limit(1)
  return row
}

export async function getPrivacyAssessment(
  db: Db,
  projectId: string,
): Promise<PrivacyAssessmentRow | undefined> {
  const [row] = await db
    .select()
    .from(privacyAssessments)
    .where(eq(privacyAssessments.projectId, projectId))
    .limit(1)
  return row
}

export async function recordIamRegistration(
  db: Db,
  bus: EventBus,
  input: RecordIamInput,
): Promise<IamRegistrationRow> {
  /**
   * §9's fail-open field, refused before anything is written — the same refusal
   * `deriveSpEntity` makes and for the same MEASURED reason (S2: SimpleSAMLphp treats an
   * empty attribute list and a missing one identically and releases EVERY attribute). The
   * emptiness here would make Task 13's subset check vacuously true, because every set is
   * a superset of nothing. **The database's CHECK refuses it too**; this is the message,
   * and `records.test.ts` says which of the two each test is exercising.
   */
  if (input.registeredAttributes.length === 0)
    throw new LaunchRecordError(
      'LAUNCH_RECORD_INVALID',
      'registeredAttributes is empty — a registration with no attribute list would make the ' +
        'production subset check vacuously true, because every set is a superset of nothing (§7, §9)',
      'Record exactly the attributes UBC IAM registered, as they appear in the ticket.',
    )

  const environment = input.environment ?? 'production'
  const existing = await getIamRegistration(db, input.projectId, environment)
  /**
   * **THE ARROW IS CHECKED EVEN ON THE FIRST WRITE.** A record created straight into
   * `active` is the same hole as a transition into it, so a new record starts at `draft`
   * and the requested state is reached by transition from there — one code path, and
   * `draft → active` is refused for a first write exactly as it is for a later one.
   *
   * A request that does not MOVE the state is not an arrow and is not asked to be one:
   * re-recording a ticket reference against a `submitted` registration is an ordinary
   * edit, and the machine has no self-arrows (`transitions.test.ts` asserts that).
   */
  const from: IamState = existing?.state ?? 'draft'
  const state = input.state === from ? from : iamTransition(from, input.state)

  /**
   * §9's CHANGE REQUEST (P6b Decision 11): once UBC has registered this SP, what it registered
   * — the attributes, the ACS and the SLO — changes ONLY on a record that says UBC registered
   * something new, which is a record whose resulting state is `active`. Anything else would
   * make this row claim a registration UBC has not made (`[M9]`: filing a change request typed
   * the requested set in as the registered one, and §7's build-time check reads exactly this
   * column). What is merely asked for is `requestedAttributes`.
   *
   * **BEFORE THE FIRST `active` NOTHING HERE APPLIES**: UBC has registered nothing yet, so there
   * is no registration for a record to misstate, and P6a's first registration is unchanged.
   */
  const registeredValuesChange =
    existing === undefined ||
    !sameAttributeSet(input.registeredAttributes, existing.registeredAttributes) ||
    input.acsUrl !== existing.acsUrl ||
    input.sloUrl !== existing.sloUrl
  if (existing?.registeredAt != null) {
    if (input.entityId !== existing.entityId)
      throw new LaunchRecordError(
        'LAUNCH_RECORD_INVALID',
        'the entityID is fixed at registration (§9): a new one is a new registration, not a change',
        'Record the entityID UBC IAM registered.',
      )
    if (state !== 'active' && registeredValuesChange)
      throw new LaunchRecordError(
        'LAUNCH_RECORD_INVALID',
        'what UBC IAM registered changes only when it registers it: record the registration ' +
          "'active' with the new values. A change it has not registered yet is requestedAttributes",
        'Keep registeredAttributes, acsUrl and sloUrl as UBC has them; put what you are asking for in requestedAttributes.',
      )
  }
  if (
    from === 'active' &&
    state === 'change_requested' &&
    (input.requestedAttributes?.length ?? 0) === 0
  )
    throw new LaunchRecordError(
      'LAUNCH_RECORD_INVALID',
      'a change request names what it asks for: requestedAttributes',
      'List every attribute the app will ask for once UBC IAM agrees.',
    )
  // Cleared on `active`: UBC has answered, and what it registered is now the registration.
  const requestedAttributes =
    state === 'active'
      ? null
      : (input.requestedAttributes ?? existing?.requestedAttributes ?? null)
  /**
   * WHEN UBC LAST REGISTERED IT — moved by a record that REACHES `active`, or that changes what
   * an `active` record says UBC registered. **Not by a ticket correction on an `active` record**:
   * nothing new was registered, and a launched app's checklist says *registered since* from it.
   */
  const registeredAt =
    state === 'active' && (from !== 'active' || registeredValuesChange)
      ? new Date()
      : (existing?.registeredAt ?? null)
  /**
   * WHEN THE REQUEST NOW WITH UBC WENT, AND WHO SAID SO (Task 9; `submitted_at`'s column comment).
   * An administrator's record stamps it when it MOVES the registration into `submitted` — the
   * request was sent — and when it FILES A CHANGE REQUEST (`active → change_requested`, a new
   * request to UBC). Nothing else moves it: a ticket correction is no new request, and UBC coming
   * back with questions (`submitted → change_requested`) is UBC's answer to the request already
   * stamped, which is what that record still waits on.
   */
  const sentNow =
    state !== from &&
    (state === 'submitted' || (state === 'change_requested' && from === 'active'))
  const submitted = sentNow
    ? { submittedAt: new Date(), submittedBy: input.actor.id }
    : {
        submittedAt: existing?.submittedAt ?? null,
        submittedBy: existing?.submittedBy ?? null,
      }

  const [row] = await db
    .insert(iamRegistrations)
    .values({
      projectId: input.projectId,
      environmentKind: environment,
      ...submitted,
      entityId: input.entityId,
      acsUrl: input.acsUrl,
      sloUrl: input.sloUrl,
      registeredAttributes: input.registeredAttributes,
      requestedAttributes,
      registeredAt,
      state,
      recordedBy: input.actor.id,
      ...(input.externalTicketRef === undefined
        ? {}
        : { externalTicketRef: input.externalTicketRef }),
      ...(input.certFingerprint === undefined
        ? {}
        : { certFingerprint: input.certFingerprint }),
      ...(input.certExpiresAt === undefined
        ? {}
        : { certExpiresAt: input.certExpiresAt }),
    })
    .onConflictDoUpdate({
      target: [iamRegistrations.projectId, iamRegistrations.environmentKind],
      set: {
        ...submitted,
        entityId: input.entityId,
        acsUrl: input.acsUrl,
        sloUrl: input.sloUrl,
        registeredAttributes: input.registeredAttributes,
        requestedAttributes,
        registeredAt,
        state,
        recordedBy: input.actor.id,
        externalTicketRef: input.externalTicketRef ?? null,
        certFingerprint: input.certFingerprint ?? null,
        certExpiresAt: input.certExpiresAt ?? null,
        updatedAt: new Date(),
      },
    })
    .returning()

  /**
   * §14 and Decision 14. **THE TICKET REFERENCE IS IN THE EVENT AND THE ATTRIBUTES ARE
   * NOT**: a list of requested CWL attributes on a project's public stream is more than
   * the stream needs to carry, and `getLaunchRecords` is where a member reads them.
   */
  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `iam-registration:${row!.id}`,
      type: 'iam_registration.recorded',
      machineDetail: {
        state,
        environment,
        entityId: row!.entityId,
        externalTicketRef: row!.externalTicketRef ?? null,
        attributeCount: input.registeredAttributes.length,
      },
      humanMessage:
        `${await personName(db, input.actor.id)} recorded this app's ${environment} UBC IAM registration as ${state}` +
        `${row!.externalTicketRef === null ? '' : ` (ticket ${row!.externalTicketRef})`}.`,
    },
    makeRedactor([]),
  )
  return row!
}

/** Two attribute lists name the same set — order and repeats are not a change (§9 compares sets). */
function sameAttributeSet(a: readonly string[], b: readonly string[]): boolean {
  const key = (xs: readonly string[]) => [...new Set(xs)].sort().join('\u0000')
  return key(a) === key(b)
}

export async function recordPrivacyAssessment(
  db: Db,
  bus: EventBus,
  input: RecordPiaInput,
): Promise<PrivacyAssessmentRow> {
  const existing = await getPrivacyAssessment(db, input.projectId)
  const from: PiaState = existing?.state ?? 'draft'
  const state = input.state === from ? from : piaTransition(from, input.state)

  /**
   * `approvedAt` is the moment the Privacy Office approved it, so it is set when the
   * record REACHES `approved` and cleared when it leaves — a timestamp that survived a
   * return to `draft` would say an assessment was approved while its state said it was
   * being rewritten, which is the kind of pair §13's gate would then read wrongly.
   */
  const approvedAt = state === 'approved' ? (existing?.approvedAt ?? new Date()) : null
  // The registration's rule (Task 9): an administrator's record that MOVES the assessment into
  // `submitted` says it was sent, now, by them; nothing else moves the stamp.
  const submitted =
    state !== from && state === 'submitted'
      ? { submittedAt: new Date(), submittedBy: input.actor.id }
      : {
          submittedAt: existing?.submittedAt ?? null,
          submittedBy: existing?.submittedBy ?? null,
        }

  const [row] = await db
    .insert(privacyAssessments)
    .values({
      projectId: input.projectId,
      state,
      approvedAt,
      ...submitted,
      recordedBy: input.actor.id,
      ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
      ...(input.externalTicketRef === undefined
        ? {}
        : { externalTicketRef: input.externalTicketRef }),
    })
    .onConflictDoUpdate({
      target: privacyAssessments.projectId,
      set: {
        state,
        approvedAt,
        ...submitted,
        reviewer: input.reviewer ?? null,
        externalTicketRef: input.externalTicketRef ?? null,
        recordedBy: input.actor.id,
        updatedAt: new Date(),
      },
    })
    .returning()

  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `privacy-assessment:${row!.id}`,
      type: 'privacy_assessment.recorded',
      machineDetail: {
        state,
        externalTicketRef: row!.externalTicketRef ?? null,
      },
      humanMessage:
        `${await personName(db, input.actor.id)} recorded this app's privacy assessment as ${state}` +
        `${row!.externalTicketRef === null ? '' : ` (ticket ${row!.externalTicketRef})`}.`,
    },
    makeRedactor([]),
  )
  return row!
}

/**
 * THE DAY A PERSON SAYS THEY SENT SOMETHING, AS AN INSTANT — noon in Vancouver on that day (the
 * launch path plan's Task 9). Noon, so the day is the same day in every zone a client renders it
 * in (the front-end enablement plan's F23: a midnight instant reads as the day before west of UTC).
 * Found by asking what Vancouver's clock reads at 20:00 UTC on that day (noon in PST) and moving
 * by the difference, so the answer is right on either side of a clock change.
 */
export function vancouverNoon(day: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const guess = new Date(Date.UTC(y, m - 1, d, 20, 0, 0))
  const hour = Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Vancouver',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(guess),
  )
  return new Date(guess.getTime() - (hour - 12) * 3_600_000)
}

/** An instant's day in Vancouver, `YYYY-MM-DD`. */
export function vancouverDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(at)
}

/** An instant's day in Vancouver, in words — *"September 29, 2026"* — for a sentence a person reads. */
export function vancouverDayInWords(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'long',
    timeZone: 'America/Vancouver',
  }).format(at)
}

export interface SubmitInput {
  projectId: string
  actor: { id: string; puid: string }
  /** The day it was sent, `YYYY-MM-DD`; today in Vancouver when absent. */
  sentAt?: string | undefined
  /** UBC's reference for the request, when the person has one yet. */
  reference?: string | undefined
}

/**
 * WHEN A PERSON MAY SAY THEY SENT IT: on a day that has happened, and not before the draft they
 * sent existed — the package IS what is sent. Both bounds are days in Vancouver, compared as
 * `YYYY-MM-DD` strings, which order as dates.
 */
function sentDay(sentAt: string | undefined, draftedAt: Date): string {
  const today = vancouverDay(new Date())
  const day = sentAt ?? today
  if (day > today)
    throw new LaunchRecordError(
      'LAUNCH_SENT_AT_INVALID',
      `sentAt ${day} is after today (${today} in Vancouver): say the day it was sent, once it has been`,
      'Send it first, then say so — with the day you sent it, or no day for today.',
    )
  const drafted = vancouverDay(draftedAt)
  if (day < drafted)
    throw new LaunchRecordError(
      'LAUNCH_SENT_AT_INVALID',
      `sentAt ${day} is before the draft was made (${drafted}): what was sent is the draft, so it cannot have gone earlier`,
      'Give the day you sent this draft — on or after the day it was made.',
    )
  return day
}

const noDraft = (what: string) =>
  new LaunchRecordError(
    'LAUNCH_DRAFT_REQUIRED',
    `there is no draft of ${what} to have sent: Manifest drafts it first, and what is sent is that draft`,
    'Draft it, send the draft, then say it was sent.',
  )

/**
 * AN OWNER'S *"I'VE SENT IT"* FOR A REGISTRATION (§9, Spec actions 3 and 9; the launch path plan's
 * Task 9). The record moves to `submitted`, stamped with the day the person names and with them —
 * which is how Manifest can say how long it has waited — and UBC's answer stays an administrator's
 * record (`recordIamRegistration`). In this order, each refusal before anything is written:
 *
 *  1. **A draft must exist** (`409 LAUNCH_DRAFT_REQUIRED`): the package is what the person sends.
 *  2. **Along `SUBMIT_ARROWS`** (`409 LAUNCH_TRANSITION_INVALID`): from a draft, after UBC asked for
 *     changes, or once it lapsed — never from what UBC has decided, never twice.
 *  3. **In UBC's order** (Spec action 9, Rich's *"Gate each step"*): staging's only once the privacy
 *     assessment is approved AND carries its reference, the PIA number UBC IAM asks for
 *     (`409 LAUNCH_PIA_NOT_APPROVED`); production's only once staging's is `active`
 *     (`409 LAUNCH_STAGING_NOT_REGISTERED` — *"tested"* is the owner's judgement, not measured).
 *  4. **On a day that can be true** (`400 LAUNCH_SENT_AT_INVALID`).
 *
 * The caller is `submitIamRegistration`'s route, in a person's own session (`launch:submit`,
 * person-only).
 */
export async function submitIamRegistration(
  db: Db,
  bus: EventBus,
  input: SubmitInput & { environment: RegistrationEnvironment },
): Promise<IamRegistrationRow> {
  const existing = await getIamRegistration(db, input.projectId, input.environment)
  if (existing === undefined || existing.generatedPackage === null)
    throw noDraft(`this app's ${input.environment} registration`)
  if (!SUBMIT_ARROWS.iam.has(existing.state))
    refuseSubmission('an IAM registration', existing.state, SUBMIT_ARROWS.iam)

  if (input.environment === 'staging') {
    const pia = await getPrivacyAssessment(db, input.projectId)
    if (pia?.state !== 'approved' || pia.externalTicketRef === null)
      throw new LaunchRecordError(
        'LAUNCH_PIA_NOT_APPROVED',
        pia?.state === 'approved'
          ? 'the privacy assessment is approved but carries no reference: UBC IAM asks for the PIA number, so the staging registration waits for it'
          : `the privacy assessment is ${pia === undefined ? 'not yet recorded' : `'${pia.state}'`}: UBC's order is the assessment first, and the staging registration is sent once it is approved`,
        'Send the privacy assessment first; once an administrator records it approved, with its PIA number, send the staging registration.',
      )
  } else {
    const staging = await getIamRegistration(db, input.projectId, 'staging')
    if (staging?.state !== 'active')
      throw new LaunchRecordError(
        'LAUNCH_STAGING_NOT_REGISTERED',
        `the staging registration is ${staging === undefined ? 'not yet recorded' : `'${staging.state}'`}: UBC's order is staging first, and the production registration is sent once staging is registered and tested`,
        'Send the staging registration first; once an administrator records it active and the app is tested at staging, send production’s.',
      )
  }

  const day = sentDay(input.sentAt, existing.createdAt)
  const [row] = await db
    .update(iamRegistrations)
    .set({
      state: 'submitted',
      submittedAt: vancouverNoon(day),
      submittedBy: input.actor.id,
      ...(input.reference === undefined ? {} : { externalTicketRef: input.reference }),
      updatedAt: new Date(),
    })
    .where(eq(iamRegistrations.id, existing.id))
    .returning()

  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `iam-registration:${row!.id}`,
      type: 'iam_registration.submitted',
      machineDetail: {
        environment: input.environment,
        sentAt: day,
        externalTicketRef: row!.externalTicketRef ?? null,
      },
      humanMessage:
        `${await personName(db, input.actor.id)} said this app's ${input.environment} registration was sent to UBC IAM on ${vancouverDayInWords(vancouverNoon(day))}` +
        `${row!.externalTicketRef === null ? '' : ` (ticket ${row!.externalTicketRef})`}.`,
    },
    makeRedactor([]),
  )
  return row!
}

/**
 * THE SAME FOR THE PRIVACY ASSESSMENT (Task 9). It comes first in UBC's order, so nothing gates it
 * but its draft and its arrows.
 */
export async function submitPrivacyAssessment(
  db: Db,
  bus: EventBus,
  input: SubmitInput,
): Promise<PrivacyAssessmentRow> {
  const existing = await getPrivacyAssessment(db, input.projectId)
  if (existing === undefined || existing.generatedDraft === null)
    throw noDraft("this app's privacy assessment")
  if (!SUBMIT_ARROWS.pia.has(existing.state))
    refuseSubmission('a privacy assessment', existing.state, SUBMIT_ARROWS.pia)

  const day = sentDay(input.sentAt, existing.createdAt)
  const [row] = await db
    .update(privacyAssessments)
    .set({
      state: 'submitted',
      submittedAt: vancouverNoon(day),
      submittedBy: input.actor.id,
      ...(input.reference === undefined ? {} : { externalTicketRef: input.reference }),
      updatedAt: new Date(),
    })
    .where(eq(privacyAssessments.id, existing.id))
    .returning()

  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `privacy-assessment:${row!.id}`,
      type: 'privacy_assessment.submitted',
      machineDetail: { sentAt: day, externalTicketRef: row!.externalTicketRef ?? null },
      humanMessage:
        `${await personName(db, input.actor.id)} said this app's privacy assessment was sent to the UBC Privacy Office on ${vancouverDayInWords(vancouverNoon(day))}` +
        `${row!.externalTicketRef === null ? '' : ` (ticket ${row!.externalTicketRef})`}.`,
    },
    makeRedactor([]),
  )
  return row!
}

/** Who said a record was sent, by name — what `IamRegistration.submittedBy` and the assessment's answer. */
export async function submitterOf(
  db: Db,
  userId: string | null,
): Promise<{ id: string; displayName: string } | null> {
  if (userId === null) return null
  const [who] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
  return who ?? null
}
