import { and, asc, desc, eq } from 'drizzle-orm'
import type { BlueprintRegistry } from '../blueprints/index.js'
import type { Config } from '../config.js'
import {
  appSpecs,
  environments,
  iamRegistrations,
  privacyAssessments,
  projectMembers,
  projects,
  users,
  type Db,
} from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import { personName, repositoryOf } from '../projects/index.js'
import { SourceError, type RepoRef, type SourceDriver } from '../source/index.js'
import { declaredData, type ManifestSpec } from '../spec/index.js'
import { deriveSpEntity, type Contact, type SsoCertificates } from '../sso/index.js'
import { candidateFor } from './candidate.js'
import type { ModelCatalogue, ModelEntry } from '../ai/index.js'
import type { Driver } from '../runtime/index.js'
import { assembleAssessment, readAssessmentDraft } from './assessment.js'
import { assemblePackage, readPackage, SEARCH_BOUND } from './package.js'
import {
  iamTransition,
  piaTransition,
  refuseSubmission,
  SUBMIT_ARROWS,
  type IamState,
  type PiaState,
} from './transitions.js'
import { findAttributeUses } from './usage.js'

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
  /**
   * WHERE A CHANGE REQUEST CAME FROM (Task 12; Spec action 10, Rich's (a)): `submitted` — UBC came back
   * to the owner with questions — or `active` — this administrator filed one with UBC. Set by the
   * move INTO `change_requested` (the only arrows into it are from those two), kept by a record that
   * stays there, cleared by any move out. The database's CHECK refuses a row that disagrees.
   */
  const changeRequestedFrom: 'submitted' | 'active' | null =
    state !== 'change_requested'
      ? null
      : from === 'submitted' || from === 'active'
        ? from
        : (existing?.changeRequestedFrom ?? null)

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
      changeRequestedFrom,
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
        changeRequestedFrom,
        recordedBy: input.actor.id,
        // KEPT WHEN NOT GIVEN (the whole-branch review's M2): since Task 9 the owner writes it too, at
        // "I've sent it", and an administrator recording UBC's answer without one must not erase it —
        // for an assessment, the PIA number the staging gate reads.
        externalTicketRef: input.externalTicketRef ?? existing?.externalTicketRef ?? null,
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
        // KEPT WHEN NOT GIVEN (the whole-branch review's M2): since Task 9 the owner writes it too, at
        // "I've sent it", and an administrator recording UBC's answer without one must not erase it —
        // for an assessment, the PIA number the staging gate reads.
        externalTicketRef: input.externalTicketRef ?? existing?.externalTicketRef ?? null,
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
  /**
   * The `generatedAt` of the draft the person sent, as they read it (Task 10's review, I3). When the
   * draft has been made again since, the submission is refused rather than recording a draft they never
   * saw. Absent, the draft on the record is taken as the one sent.
   */
  draftGeneratedAt?: string | undefined
}

/** When a stored draft was generated — a registration's package or (Task 11) the assessment's draft. */
function draftedAtOf(draft: unknown): string | undefined {
  const at = (draft as { generatedAt?: unknown } | null)?.generatedAt
  return typeof at === 'string' ? at : undefined
}

/**
 * THE DRAFT SENT IS THE DRAFT HELD (Task 10's whole-branch review, I3): `launch:draft` is mintable and a
 * collaborator holds it, so the draft can be made again between a person reading it and saying they sent
 * it — and the record would then keep a document they never saw. Compared as instants.
 */
function assertDraftRead(what: string, stored: unknown, read: string | undefined): void {
  if (read === undefined) return
  const held = draftedAtOf(stored)
  if (held !== undefined && Date.parse(held) === Date.parse(read)) return
  throw new LaunchRecordError(
    'LAUNCH_DRAFT_CHANGED',
    `${what} was drafted again (${held ?? 'at an unknown time'}) after the draft you read (${read}): what Manifest holds is not what you sent, so nothing was recorded`,
    'Read the current draft. If it is what you sent, say so again with its generatedAt; if you sent the earlier one, send the current draft instead and say so.',
  )
}

/**
 * WHEN A PERSON MAY SAY THEY SENT IT: on a day that has happened, and not before the draft they
 * sent existed — the package IS what is sent. Both bounds are days in Vancouver, compared as
 * `YYYY-MM-DD` strings, which order as dates.
 */
function sentDay(sentAt: string | undefined, draftedAt: Date): string {
  const today = vancouverDay(new Date())
  const day = sentAt ?? today
  // A DAY THAT EXISTS (the whole-branch review's I2): `2026-02-30` would roll over to March 2, and
  // compare as a string on the wrong side of the draft's day. The route's schema refuses it first;
  // this is the module's own refusal, for any other caller.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || vancouverDay(vancouverNoon(day)) !== day)
    throw new LaunchRecordError(
      'LAUNCH_SENT_AT_INVALID',
      `sentAt ${day} is not a day: give it as YYYY-MM-DD`,
      'Give the day you sent it, as YYYY-MM-DD — or leave it out for today.',
    )
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
 *  3. **In UBC's order** (Spec action 9, Rich's *"Gate each step"*): EITHER registration only once the
 *     privacy assessment is approved AND carries its reference, the PIA number UBC IAM asks for
 *     (`409 LAUNCH_PIA_NOT_APPROVED` — §9: *"neither of an app's registrations is sent until the
 *     assessment is approved"*, so production's checks it too, and staging recorded `active` by an
 *     administrator cannot carry it past; the whole-branch review's I3); production's only once
 *     staging's is `active` as well (`409 LAUNCH_STAGING_NOT_REGISTERED` — *"tested"* is the owner's
 *     judgement, not measured).
 *  4. **On a day that can be true** (`400 LAUNCH_SENT_AT_INVALID`).
 *
 * **ONE TRANSACTION, AND WHAT IT DECIDES BY IS HELD** (the whole-branch review's I1): the record
 * `FOR UPDATE`, the assessment and staging's registration `FOR SHARE`. An administrator's record —
 * one upsert, one row lock — then lands wholly before this reads or wholly after it commits: never a
 * second *"I've sent it"* over a submission they recorded in the meantime, never a submission
 * through a gate that closed while it was being read. The locks are taken registration → assessment
 * → staging, and no writer holds two, so they cannot deadlock.
 *
 * The caller is `submitIamRegistration`'s route, in a person's own session (`launch:submit`,
 * person-only).
 */
export async function submitIamRegistration(
  db: Db,
  bus: EventBus,
  input: SubmitInput & { environment: RegistrationEnvironment },
): Promise<IamRegistrationRow> {
  const { row, day } = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(iamRegistrations)
      .where(
        and(
          eq(iamRegistrations.projectId, input.projectId),
          eq(iamRegistrations.environmentKind, input.environment),
        ),
      )
      .for('update')
    const sent = readPackage(existing?.generatedPackage)
    if (existing === undefined || sent === null)
      throw noDraft(`this app's ${input.environment} registration`)
    if (!SUBMIT_ARROWS.iam.has(existing.state))
      refuseSubmission('an IAM registration', existing.state, SUBMIT_ARROWS.iam)

    const [pia] = await tx
      .select()
      .from(privacyAssessments)
      .where(eq(privacyAssessments.projectId, input.projectId))
      .for('share')
    if (pia?.state !== 'approved' || pia.externalTicketRef === null)
      throw new LaunchRecordError(
        'LAUNCH_PIA_NOT_APPROVED',
        pia?.state === 'approved'
          ? `the privacy assessment is approved but carries no reference: UBC IAM asks for the PIA number, so the ${input.environment} registration waits for it`
          : `the privacy assessment is ${pia === undefined ? 'not yet recorded' : `'${pia.state}'`}: UBC's order is the assessment first, and neither registration is sent until it is approved`,
        pia?.state === 'approved'
          ? 'Ask an administrator to record the assessment’s PIA number, then send the registration and say so again.'
          : 'Send the privacy assessment first; once an administrator records it approved, with its PIA number, send the registration.',
      )
    if (input.environment === 'production') {
      const [staging] = await tx
        .select()
        .from(iamRegistrations)
        .where(
          and(
            eq(iamRegistrations.projectId, input.projectId),
            eq(iamRegistrations.environmentKind, 'staging'),
          ),
        )
        .for('share')
      if (staging?.state !== 'active')
        throw new LaunchRecordError(
          'LAUNCH_STAGING_NOT_REGISTERED',
          `the staging registration is ${staging === undefined ? 'not yet recorded' : `'${staging.state}'`}: UBC's order is staging first, and the production registration is sent once staging is registered and tested`,
          'Send the staging registration first; once an administrator records it active and the app is tested at staging, send production’s.',
        )
    }
    assertDraftRead(
      `this app's ${input.environment} registration`,
      existing.generatedPackage,
      input.draftGeneratedAt,
    )
    // WHAT UBC IAM ASKS FOR IS IN WHAT IS SENT (§9: the request *"is sent only once the privacy
    // assessment is approved, and its package carries the assessment's reference"*; Task 10's review,
    // I2): a package drafted in week one, before the Privacy Office answered, carries no PIA number —
    // and one drafted before the number changed carries the old one.
    if (sent.privacyAssessmentReference !== pia.externalTicketRef)
      throw new LaunchRecordError(
        'LAUNCH_DRAFT_STALE',
        sent.privacyAssessmentReference === null
          ? `the draft of this app's ${input.environment} registration was made before the privacy assessment was approved, so it does not carry the PIA number UBC IAM asks for (${pia.externalTicketRef})`
          : `the draft of this app's ${input.environment} registration carries PIA number ${sent.privacyAssessmentReference}, and the approved assessment's is ${pia.externalTicketRef}`,
        'Draft it again — the new draft carries the PIA number — send that one, then say it was sent.',
      )

    // THE DRAFT THAT WAS SENT is the newest (the whole-branch review's M4): after a re-draft the
    // row's `created_at` is the FIRST draft's day, and the package carries its own.
    const day = sentDay(input.sentAt, new Date(sent.generatedAt))
    const [row] = await tx
      .update(iamRegistrations)
      .set({
        state: 'submitted',
        // Out of `change_requested`, when it was there (Task 12): the origin goes with the state.
        changeRequestedFrom: null,
        submittedAt: vancouverNoon(day),
        submittedBy: input.actor.id,
        ...(input.reference === undefined ? {} : { externalTicketRef: input.reference }),
        updatedAt: new Date(),
      })
      .where(eq(iamRegistrations.id, existing.id))
      .returning()
    return { row: row!, day }
  })

  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `iam-registration:${row.id}`,
      type: 'iam_registration.submitted',
      machineDetail: {
        environment: input.environment,
        sentAt: day,
        externalTicketRef: row.externalTicketRef ?? null,
      },
      humanMessage:
        `${await personName(db, input.actor.id)} said this app's ${input.environment} registration was sent to UBC IAM on ${vancouverDayInWords(vancouverNoon(day))}` +
        `${row.externalTicketRef === null ? '' : ` (ticket ${row.externalTicketRef})`}.`,
    },
    makeRedactor([]),
  )
  return row
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
  // The registration's rule (the whole-branch review's I1): the record held while it is decided.
  const { row, day } = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(privacyAssessments)
      .where(eq(privacyAssessments.projectId, input.projectId))
      .for('update')
    const sent = readAssessmentDraft(existing?.generatedDraft)
    if (existing === undefined || sent === null)
      throw noDraft("this app's privacy assessment")
    if (!SUBMIT_ARROWS.pia.has(existing.state))
      refuseSubmission('a privacy assessment', existing.state, SUBMIT_ARROWS.pia)
    assertDraftRead(
      "this app's privacy assessment",
      existing.generatedDraft,
      input.draftGeneratedAt,
    )

    // THE DRAFT THAT WAS SENT is the newest (Task 10's review, M4; Task 11): after a re-draft the
    // row's `created_at` is the FIRST draft's day, and the draft carries its own.
    const day = sentDay(input.sentAt, new Date(sent.generatedAt))
    const [row] = await tx
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
    return { row: row!, day }
  })

  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `privacy-assessment:${row.id}`,
      type: 'privacy_assessment.submitted',
      machineDetail: { sentAt: day, externalTicketRef: row.externalTicketRef ?? null },
      humanMessage:
        `${await personName(db, input.actor.id)} said this app's privacy assessment was sent to the UBC Privacy Office on ${vancouverDayInWords(vancouverNoon(day))}` +
        `${row.externalTicketRef === null ? '' : ` (ticket ${row.externalTicketRef})`}.`,
    },
    makeRedactor([]),
  )
  return row
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

/**
 * A REGISTRATION ONCE SENT IS KEPT AS IT WAS SENT (Decision 9): drafted again only after UBC asked
 * for changes or the registration lapsed, where a new request is the point.
 */
const DRAFTABLE: ReadonlySet<IamState> = new Set(['draft', 'change_requested', 'expired'])

const alreadySent = (environment: RegistrationEnvironment, state: IamState) =>
  new LaunchRecordError(
    'LAUNCH_RECORD_SUBMITTED',
    `the ${environment} registration is '${state}': what was sent to UBC IAM is kept as it was sent, and Manifest drafts it again only once UBC asks for changes or the registration lapses`,
    'To change what UBC IAM was sent, ask UBC IAM; once an administrator records that it asked for changes, draft it again.',
  )

/** Extensions an app's own code and served pages are written in (Decision 14, `[M9]`). */
const SEARCHED = /\.(js|mjs|ts|html)$/

/**
 * THE TREE THE ATTRIBUTE SEARCH READS — Decision 14's caller half: the text files of the commit,
 * except the blueprint's own `auth/` bridge (it reads every attribute by design, so it would justify
 * all of them), at most `SEARCH_BOUND` — and `truncated` whenever a file it would have read was not,
 * so the package never claims to have looked where it did not.
 */
async function searchableTree(
  source: SourceDriver,
  repo: RepoRef,
  commit: string,
  bridge: ReadonlySet<string>,
): Promise<{ files: { path: string; text: string }[]; truncated: boolean }> {
  const tree = await source.listTree(repo, commit)
  let truncated = tree.truncated
  let bytes = 0
  const files: { path: string; text: string }[] = []
  for (const entry of tree.entries) {
    if (entry.type !== 'file' || entry.binary === true || !SEARCHED.test(entry.path))
      continue
    if (bridge.has(entry.path)) continue
    if (files.length === SEARCH_BOUND.files) {
      truncated = true
      break
    }
    // A file past what is left of the bound is skipped, not the rest: a smaller one may still fit.
    if (bytes + (entry.size ?? 0) > SEARCH_BOUND.bytes) {
      truncated = true
      continue
    }
    try {
      const file = await source.readText(repo, commit, entry.path)
      files.push({ path: entry.path, text: file.content })
      bytes += file.size
    } catch (error) {
      // Not UTF-8, or past the read limit: not searched, and the package says so.
      if (
        error instanceof SourceError &&
        (error.code === 'SOURCE_FILE_NOT_TEXT' || error.code === 'SOURCE_FILE_TOO_LARGE')
      ) {
        truncated = true
        continue
      }
      throw error
    }
  }
  return { files, truncated }
}

/**
 * THE NEWEST VALID MANIFEST, and the commit it was validated at — what a draft is drawn from while
 * nothing serves staging. Every project is created with a validated manifest, and an invalid one never
 * replaces it as the newest VALID — so none at all is a platform defect: a `500` and an operator line,
 * never a guess.
 */
async function newestValidSpec(
  db: Db,
  projectId: string,
  what: string,
): Promise<{ spec: ManifestSpec; commit: string }> {
  const [newest] = await db
    .select({ parsed: appSpecs.parsed, commitSha: appSpecs.commitSha })
    .from(appSpecs)
    .where(and(eq(appSpecs.projectId, projectId), eq(appSpecs.valid, true)))
    .orderBy(desc(appSpecs.createdAt), desc(appSpecs.id))
    .limit(1)
  if (newest === undefined)
    throw new Error(`project ${projectId} has no valid manifest to draft ${what} from`)
  return { spec: newest.parsed as ManifestSpec, commit: newest.commitSha }
}

/**
 * WHAT A REGISTRATION IS DRAWN FROM (Task 10's Interfaces): **production's from the launch
 * candidate** — the release serving staging, healthy, its frozen production `auth` and its build's
 * commit — because production's registration must describe what a launch would run; with nothing
 * serving staging, from the newest valid manifest, and the package says so. **Staging's from the
 * newest valid manifest**: staging is where the app is still changing.
 */
async function drawnFrom(
  db: Db,
  projectId: string,
  environment: RegistrationEnvironment,
): Promise<{ auth: ManifestSpec['auth']; commit: string; warnings: string[] }> {
  if (environment === 'production') {
    const candidate = await candidateFor(db, projectId)
    if (candidate !== undefined)
      return { auth: candidate.auth, commit: candidate.build.commitSha, warnings: [] }
  }
  const newest = await newestValidSpec(db, projectId, 'a registration')
  return {
    auth: newest.spec.auth,
    commit: newest.commit,
    warnings:
      environment === 'production'
        ? [
            'Nothing is serving staging yet, so this is drawn from the newest valid manifest. Production’s registration should describe the release you will launch: once it serves staging, draft this again.',
          ]
        : [],
  }
}

/**
 * WHAT THE PRIVACY ASSESSMENT IS DRAWN FROM (Task 11): production's rule — a PIA is per production app
 * (C4) — so the launch candidate's manifest, the one its release was made from, and its build's commit;
 * with nothing serving staging, the newest valid manifest, and the draft says so. `specCommit` is the
 * commit THAT MANIFEST was validated at — where its YAML is read for what it writes (the whole-branch
 * review's M2: a release made before 2026-09-23 could pair one commit's build with another's spec).
 */
async function assessedFrom(
  db: Db,
  projectId: string,
): Promise<{
  spec: ManifestSpec
  commit: string
  specCommit: string
  warnings: string[]
}> {
  const candidate = await candidateFor(db, projectId)
  if (candidate !== undefined) {
    const [made] = await db
      .select({ parsed: appSpecs.parsed, commitSha: appSpecs.commitSha })
      .from(appSpecs)
      .where(eq(appSpecs.id, candidate.release.appSpecId))
    if (made !== undefined)
      return {
        spec: made.parsed as ManifestSpec,
        commit: candidate.build.commitSha,
        specCommit: made.commitSha,
        warnings: [],
      }
  }
  const newest = await newestValidSpec(db, projectId, 'a privacy assessment')
  return {
    ...newest,
    specCommit: newest.commit,
    warnings: [
      'Nothing is serving staging yet, so this is drawn from the newest valid manifest. The assessment should describe the release you will launch: once it serves staging, draft this again.',
    ],
  }
}

/** A project's members with their role — owners first, then collaborators, each by name. */
export async function membersOf(
  db: Db,
  projectId: string,
): Promise<{ name: string; email: string; role: 'owner' | 'collaborator' }[]> {
  const members = await db
    .select({ name: users.displayName, email: users.email, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.displayName))
  return [
    ...members.filter((m) => m.role === 'owner'),
    ...members.filter((m) => m.role !== 'owner'),
  ]
}

/**
 * THE PLATFORM'S CONTACTS (Decision 15): `MANIFEST_LAUNCH_CONTACTS` when set, or else the oldest
 * administrator — and none when there is neither, which a draft then says.
 */
export async function platformContacts(
  db: Db,
  configured: readonly Contact[] | null,
): Promise<Contact[]> {
  if (configured !== null) return configured.map((c) => ({ ...c }))
  const [admin] = await db
    .select({ name: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.role, 'admin'))
    .orderBy(asc(users.createdAt))
    .limit(1)
  return admin === undefined ? [] : [admin]
}

/**
 * THE CONTACTS (§9: *"technical and privacy contacts from the project owner and platform admins"*;
 * Decision 15): the project's owners, then its collaborators, as technical contacts; the platform's
 * as support.
 */
async function contactsFor(
  db: Db,
  projectId: string,
  configured: readonly Contact[] | null,
): Promise<{ technical: Contact[]; support: Contact[] }> {
  const technical = (await membersOf(db, projectId)).map(({ name, email }) => ({
    name,
    email,
  }))
  return { technical, support: await platformContacts(db, configured) }
}

export interface DraftDeps {
  db: Db
  bus: EventBus
  config: Pick<Config, 'idp' | 'launchContacts'>
  source: SourceDriver
  sso: SsoCertificates
  blueprints: Pick<BlueprintRegistry, 'skeleton'>
}

/**
 * D19'S DRAFT OF ONE ENVIRONMENT'S REGISTRATION (§9 as Spec action 4 applied it; the launch path
 * plan's Task 10, Decisions 9, 11–15). The package is GENERATED and STORED on the record — a draft
 * mints the environment's keypair on first use, and a read that minted a key would be a side effect —
 * and a submission sends exactly what is stored. In this order:
 *
 *  1. **A record UBC holds is not drafted again** (`409 LAUNCH_RECORD_SUBMITTED`, before anything is
 *     read or minted): `submitted` or `active`.
 *  2. **What it is drawn from** (`drawnFrom`), refused `409 LAUNCH_NOT_CWL` for an app that signs
 *     nobody in with CWL — or asks for no attribute, which no registration may (§9's fail-open list).
 *  3. The entity (`deriveSpEntity`, D15, at the environment row's hostname, as a deploy registers it),
 *     the environment's certificate (the public half, D20), where the app reads each attribute, the
 *     contacts and the PIA number — the assessment's reference once it is approved.
 *  4. **Written under the record's row lock**, as a submission takes it (Task 9's I1): a submission
 *     that landed meanwhile refuses the draft (`LAUNCH_RECORD_SUBMITTED`); one that waits finds this
 *     draft, and is refused `LAUNCH_DRAFT_CHANGED` if it names the draft read before it. A record not yet registered takes the package's entity, ACS and SLO; **one UBC has
 *     registered keeps what UBC registered** — the checklist and the build read those columns as
 *     UBC's, and only the package is new.
 *  5. `iam_registration.drafted`, after the commit, naming no attribute (as `recorded` does).
 *
 * The caller is `draftIamRegistration`'s route — a person, or an agent on their token (`launch:draft`
 * is mintable: a draft sends nothing and decides nothing).
 */
export async function draftIamRegistration(
  deps: DraftDeps,
  input: {
    projectId: string
    environment: RegistrationEnvironment
    actor: { id: string }
  },
): Promise<IamRegistrationRow> {
  const { db } = deps
  const existing = await getIamRegistration(db, input.projectId, input.environment)
  if (existing !== undefined && !DRAFTABLE.has(existing.state))
    throw alreadySent(input.environment, existing.state)

  const [project] = await db
    .select({ id: projects.id, slug: projects.slug, blueprintRef: projects.blueprintRef })
    .from(projects)
    .where(eq(projects.id, input.projectId))
  if (project === undefined) throw new Error(`no project ${input.projectId}`)
  const drawn = await drawnFrom(db, input.projectId, input.environment)
  if (drawn.auth.provider !== 'cwl')
    throw new LaunchRecordError(
      'LAUNCH_NOT_CWL',
      `this app does not sign people in with CWL (auth.provider is '${drawn.auth.provider}'), so there is nothing to register with UBC IAM`,
      'An app that signs nobody in waits for no registration. To sign people in, set auth.provider: cwl and the attributes it needs in manifest.yaml, then draft again.',
    )
  if (drawn.auth.attributes.length === 0)
    throw new LaunchRecordError(
      'LAUNCH_NOT_CWL',
      'this app signs people in with CWL but asks for no attribute — a registration with no attribute list would release every attribute UBC holds, so Manifest drafts none',
      'List the attributes the app needs in auth.attributes, validate the manifest, then draft again.',
    )

  const [environmentRow] = await db
    .select({ hostname: environments.hostname })
    .from(environments)
    .where(
      and(
        eq(environments.projectId, input.projectId),
        eq(environments.kind, input.environment),
      ),
    )
  if (environmentRow === undefined)
    throw new Error(`project ${project.slug} has no ${input.environment} environment`)
  const entity = deriveSpEntity({
    slug: project.slug,
    environmentKind: input.environment,
    hostname: environmentRow.hostname,
    entityBase: deps.config.idp.spEntityBase,
    auth: drawn.auth,
  })
  const certificate = await deps.sso.spCertificate(db, {
    projectId: project.id,
    environmentKind: input.environment,
    slug: project.slug,
    entityId: entity.entityId,
  })
  const bridge = new Set(
    Object.keys(deps.blueprints.skeleton(project.blueprintRef) ?? {}).filter((path) =>
      path.startsWith('auth/'),
    ),
  )
  const repo = await repositoryOf(deps, project)
  const tree = await searchableTree(deps.source, repo, drawn.commit, bridge)
  const pia = await getPrivacyAssessment(db, input.projectId)
  const generated = assemblePackage({
    environment: input.environment,
    generatedAt: new Date(),
    fromCommit: drawn.commit,
    entity,
    certificate,
    uses: findAttributeUses(tree.files, entity.attributes),
    usedAtTruncated: tree.truncated,
    contacts: await contactsFor(db, input.projectId, deps.config.launchContacts),
    privacyAssessmentReference:
      pia?.state === 'approved' ? (pia.externalTicketRef ?? null) : null,
    warnings: drawn.warnings,
  })

  const row = await db.transaction(async (tx) => {
    const held = async () =>
      (
        await tx
          .select()
          .from(iamRegistrations)
          .where(
            and(
              eq(iamRegistrations.projectId, input.projectId),
              eq(iamRegistrations.environmentKind, input.environment),
            ),
          )
          .for('update')
      )[0]
    let current = await held()
    if (current === undefined) {
      const [inserted] = await tx
        .insert(iamRegistrations)
        .values({
          projectId: input.projectId,
          environmentKind: input.environment,
          entityId: generated.entityId,
          acsUrl: generated.acsUrl,
          sloUrl: generated.sloUrl,
          state: 'draft',
          generatedPackage: generated,
          recordedBy: input.actor.id,
        })
        .onConflictDoNothing({
          target: [iamRegistrations.projectId, iamRegistrations.environmentKind],
        })
        .returning()
      if (inserted !== undefined) return inserted
      // A first draft raced this one in: theirs is the record, and this one replaces its package.
      current = await held()
      if (current === undefined)
        throw new Error('the registration vanished while drafting')
    }
    if (!DRAFTABLE.has(current.state)) throw alreadySent(input.environment, current.state)
    const [updated] = await tx
      .update(iamRegistrations)
      .set({
        generatedPackage: generated,
        ...(current.registeredAt === null
          ? {
              entityId: generated.entityId,
              acsUrl: generated.acsUrl,
              sloUrl: generated.sloUrl,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(iamRegistrations.id, current.id))
      .returning()
    return updated!
  })

  const unused = generated.attributes.filter((a) => a.unused).length
  await publishEvent(
    db,
    deps.bus,
    {
      projectId: input.projectId,
      subject: `iam-registration:${row.id}`,
      type: 'iam_registration.drafted',
      machineDetail: {
        environment: input.environment,
        entityId: generated.entityId,
        fromCommit: generated.fromCommit,
        attributeCount: generated.attributes.length,
        unusedCount: unused,
      },
      humanMessage:
        `${await personName(db, input.actor.id)} drafted this app's ${input.environment} registration for UBC IAM, asking for ${generated.attributes.length} attribute(s)` +
        (unused === 0 ? '.' : `, ${unused} of them not read by the app.`),
    },
    makeRedactor([]),
  )
  return row
}

/**
 * AN ASSESSMENT ONCE SENT IS KEPT AS IT WAS SENT (Decision 9's rule, for the Privacy Office): drafted
 * again only from `draft` — which is also where a refused assessment returns — never while it is
 * `submitted` or `approved`.
 */
const assessmentAlreadySent = (state: PiaState) =>
  new LaunchRecordError(
    'LAUNCH_RECORD_SUBMITTED',
    `the privacy assessment is '${state}': what was sent to the Privacy Office is kept as it was sent, and Manifest drafts it again only once the Office sends it back`,
    'To change what the Privacy Office was sent, ask the Office; once an administrator records it back in draft, draft it again.',
  )

export interface AssessmentDraftDeps {
  db: Db
  bus: EventBus
  config: Pick<Config, 'launchContacts' | 'github'>
  source: SourceDriver
  catalogue: ModelCatalogue
  driver: Pick<Driver, 'name'>
}

/**
 * D19'S DRAFT OF THE PRIVACY ASSESSMENT (§9 as Spec action 4 applied it; the launch path plan's Task 11,
 * Decision 16): §9's six rows, generated from what Manifest holds and STORED on the record — the
 * registration's shape, so what is sent is what was read (`draftGeneratedAt`) and its day is the
 * draft's. In this order:
 *
 *  1. **A record the Privacy Office holds is not drafted again** (`409 LAUNCH_RECORD_SUBMITTED`, before
 *     anything is read): `submitted` or `approved`.
 *  2. **What it is drawn from** (`assessedFrom`): the launch candidate's manifest, else the newest valid
 *     with a warning — and that commit's `manifest.yaml`, for whether it WRITES `data.retention_days`.
 *  3. The members, the platform's contacts, the catalogue (read only when the app declares a model, as
 *     validation reads it; a disabled one is said in the draft), the runtime driver and where the code
 *     is kept.
 *  4. **Written under the record's row lock**, as a submission takes it: a submission that landed
 *     meanwhile refuses the draft; one that waits finds this draft, and is refused
 *     `LAUNCH_DRAFT_CHANGED` if it names the draft read before it.
 *  5. `privacy_assessment.drafted`, after the commit, carrying counts — never the draft's text.
 *
 * The caller is `draftPrivacyAssessment`'s route — a person, or an agent on their token (`launch:draft`
 * is mintable: a draft sends nothing and decides nothing).
 */
export async function draftPrivacyAssessment(
  deps: AssessmentDraftDeps,
  input: { projectId: string; actor: { id: string } },
): Promise<PrivacyAssessmentRow> {
  const { db } = deps
  const existing = await getPrivacyAssessment(db, input.projectId)
  if (existing !== undefined && existing.state !== 'draft')
    throw assessmentAlreadySent(existing.state)

  const [project] = await db
    .select({ id: projects.id, slug: projects.slug, name: projects.name })
    .from(projects)
    .where(eq(projects.id, input.projectId))
  if (project === undefined) throw new Error(`no project ${input.projectId}`)
  const drawn = await assessedFrom(db, input.projectId)
  const repo = await repositoryOf(deps, project)
  // The YAML validation read, the way it read it (`api/spec-validation.ts`): only it says whether the
  // owner WROTE a value the schema would otherwise default.
  const manifest =
    (await deps.source.readFile(repo, drawn.specCommit, 'manifest.yaml')) ?? ''
  const catalogue: readonly ModelEntry[] | null =
    drawn.spec.ai.models.length === 0
      ? []
      : deps.catalogue.enabled
        ? (await deps.catalogue.get()).models
        : null
  const generated = assembleAssessment({
    generatedAt: new Date(),
    fromCommit: drawn.commit,
    spec: drawn.spec,
    declared: declaredData(manifest),
    project: { slug: project.slug, name: project.name },
    members: await membersOf(db, input.projectId),
    platformContacts: await platformContacts(db, deps.config.launchContacts),
    catalogue,
    runtime: deps.driver.name,
    repository:
      repo.provider === 'github'
        ? { provider: 'github', organisation: deps.config.github.org }
        : { provider: 'local' },
    warnings: drawn.warnings,
  })

  const row = await db.transaction(async (tx) => {
    const held = async () =>
      (
        await tx
          .select()
          .from(privacyAssessments)
          .where(eq(privacyAssessments.projectId, input.projectId))
          .for('update')
      )[0]
    let current = await held()
    if (current === undefined) {
      const [inserted] = await tx
        .insert(privacyAssessments)
        .values({
          projectId: input.projectId,
          state: 'draft',
          generatedDraft: generated,
          recordedBy: input.actor.id,
        })
        .onConflictDoNothing({ target: privacyAssessments.projectId })
        .returning()
      if (inserted !== undefined) return inserted
      // A first draft raced this one in: theirs is the record, and this one replaces its draft.
      current = await held()
      if (current === undefined) throw new Error('the assessment vanished while drafting')
    }
    if (current.state !== 'draft') throw assessmentAlreadySent(current.state)
    const [updated] = await tx
      .update(privacyAssessments)
      .set({ generatedDraft: generated, updatedAt: new Date() })
      .where(eq(privacyAssessments.id, current.id))
      .returning()
    return updated!
  })

  const gapCount = generated.sections.reduce((n, s) => n + s.gaps.length, 0)
  await publishEvent(
    db,
    deps.bus,
    {
      projectId: input.projectId,
      subject: `privacy-assessment:${row.id}`,
      type: 'privacy_assessment.drafted',
      machineDetail: { fromCommit: generated.fromCommit, gapCount },
      humanMessage: `${await personName(db, input.actor.id)} drafted this app's privacy assessment for the Privacy Office, with ${gapCount} gap(s) for the owner to fill.`,
    },
    makeRedactor([]),
  )
  return row
}
