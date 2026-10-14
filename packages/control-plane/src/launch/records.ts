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
import type { Mailer } from '../mail/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import { personName, repositoryOf } from '../projects/index.js'
import { SourceError, type RepoRef, type SourceDriver } from '../source/index.js'
import { declaredData, type ManifestSpec } from '../spec/index.js'
import { deriveSpEntity, type Contact, type SsoCertificates } from '../sso/index.js'
import { candidateFor } from './candidate.js'
import type { ModelCatalogue, ModelEntry } from '../ai/index.js'
import type { Driver } from '../runtime/index.js'
import {
  assembleAssessment,
  checkGapAnswers,
  readAssessmentDraft,
  type GapAnswer,
} from './assessment.js'
import { assemblePackage, readPackage, SEARCH_BOUND } from './package.js'
import {
  iamReturnTo,
  iamSendableFrom,
  iamTransition,
  LaunchTransitionError,
  PIA_SENDABLE,
  piaTransition,
  refuseRecordAroundTheTeam,
  refuseSend,
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
  // THE MANIFEST TEAM'S STEP IS NOT RECORDED HERE (the FE-46/47/5 plan's Decision 4): into `sent` is the
  // owner's send, out of it the team's submission or hand-back — refused first, naming them.
  refuseRecordAroundTheTeam('the IAM registration', from, input.state, {
    send: 'sendIamRegistration',
    submit: 'submitIamRegistration',
    handBack: 'returnIamRegistration',
  })
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
   *
   * **CLEARED BY A LAPSE** (the launch path plan's sitting 12, F3): a registration that has `expired`
   * is not in force, and neither is one sent to UBC again after it — `expired → submitted` kept the
   * old date, so a launched app's checklist read `met` and production deploys resumed before UBC had
   * registered anything. Only this function moves a registration into `expired`. A change request
   * filed from `active` keeps it, because UBC's registration stands while it is considered.
   */
  const registeredAt =
    state === 'expired'
      ? null
      : state === 'active' && (from !== 'active' || registeredValuesChange)
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
   * §14 and Decision 14. **THE TICKET REFERENCE IS IN THE EVENT, AND WHAT UBC REGISTERED IS A
   * COUNT**: `getLaunchRecords` is where a member reads the list. **And where a change request came
   * from, as the row holds it** (FE-59, A1 sitting 5): without it UBC's questions to the owner and a
   * change an administrator filed with UBC read the same to a client watching the stream.
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
        changeRequestedFrom: row!.changeRequestedFrom ?? null,
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
  // THE READ AND THE WRITE ARE ONE DECISION (the whole-branch review's m5): the row `FOR UPDATE`, so an owner's
  // send landing in between is read, and refused around the team, rather than overwritten by the upsert.
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(privacyAssessments)
      .where(eq(privacyAssessments.projectId, input.projectId))
      .for('update')
    const from: PiaState = existing?.state ?? 'draft'
    refuseRecordAroundTheTeam('the privacy assessment', from, input.state, {
      send: 'sendPrivacyAssessment',
      submit: 'submitPrivacyAssessment',
      handBack: 'returnPrivacyAssessment',
    })
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

    const [written] = await tx
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
          externalTicketRef:
            input.externalTicketRef ?? existing?.externalTicketRef ?? null,
          recordedBy: input.actor.id,
          updatedAt: new Date(),
        },
      })
      .returning()
    return written!
  })

  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `privacy-assessment:${row.id}`,
      type: 'privacy_assessment.recorded',
      machineDetail: {
        state: row.state,
        externalTicketRef: row.externalTicketRef ?? null,
      },
      humanMessage:
        `${await personName(db, input.actor.id)} recorded this app's privacy assessment as ${row.state}` +
        `${row.externalTicketRef === null ? '' : ` (ticket ${row.externalTicketRef})`}.`,
    },
    makeRedactor([]),
  )
  return row
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

/** What a send needs: the database, the bus and the mailer that tells the Manifest team. */
export interface SendDeps {
  db: Db
  bus: EventBus
  mailer: Mailer
}

export interface SendInput {
  projectId: string
  actor: { id: string; puid: string }
  /**
   * The `generatedAt` of the draft the person sent, as they read it (Task 10's review, I3). When the
   * draft has been made again since, the send is refused rather than sending a draft they never saw.
   * Absent, the draft on the record is taken as the one sent.
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
 * collaborator holds it, so the draft can be made again between a person reading it and sending it — and
 * the record would then keep a document they never saw. Compared as instants.
 */
function assertDraftRead(what: string, stored: unknown, read: string | undefined): void {
  if (read === undefined) return
  const held = draftedAtOf(stored)
  if (held !== undefined && Date.parse(held) === Date.parse(read)) return
  throw new LaunchRecordError(
    'LAUNCH_DRAFT_CHANGED',
    `${what} was drafted again (${held ?? 'at an unknown time'}) after the draft you read (${read}): what Manifest holds is not what you read, so nothing was sent`,
    'Read the current draft, then send it, naming its generatedAt.',
  )
}

/**
 * THE DAY THE MANIFEST TEAM SAYS IT SENT SOMETHING TO UBC: a day that has happened, and not before its
 * owner sent it to the team (the FE-46/47/5 plan's Decision 3) — the team cannot have sent what it did not
 * yet hold. Both bounds are days in Vancouver, compared as `YYYY-MM-DD` strings, which order as dates.
 */
function sentDay(
  sentAt: string | undefined,
  notBefore: { at: Date; what: string },
): string {
  const today = vancouverDay(new Date())
  const day = sentAt ?? today
  // A DAY THAT EXISTS (the whole-branch review's I2): `2026-02-30` would roll over to March 2, and
  // compare as a string on the wrong side of the bound. The route's schema refuses it first; this is
  // the module's own refusal, for any other caller.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || vancouverDay(vancouverNoon(day)) !== day)
    throw new LaunchRecordError(
      'LAUNCH_SENT_AT_INVALID',
      `sentAt ${day} is not a day: give it as YYYY-MM-DD`,
      'Give the day it was sent to UBC, as YYYY-MM-DD — or leave it out for today.',
    )
  if (day > today)
    throw new LaunchRecordError(
      'LAUNCH_SENT_AT_INVALID',
      `sentAt ${day} is after today (${today} in Vancouver): say the day it was sent, once it has been`,
      'Send it to UBC first, then record it — with the day it was sent, or no day for today.',
    )
  const earliest = vancouverDay(notBefore.at)
  if (day < earliest)
    throw new LaunchRecordError(
      'LAUNCH_SENT_AT_INVALID',
      `sentAt ${day} is before ${notBefore.what} (${earliest}): it cannot have gone to UBC earlier`,
      `Give the day it was sent to UBC — on or after the day ${notBefore.what}.`,
    )
  return day
}

const noDraft = (what: string) =>
  new LaunchRecordError(
    'LAUNCH_DRAFT_REQUIRED',
    `there is no draft of ${what} to send: Manifest drafts it first, and what is sent is that draft`,
    'Draft it, read the draft, then send it to the Manifest team.',
  )

/** Which record a notice names — the mailer's words for it. */
const NOTICE_RECORD = {
  staging: 'staging-registration',
  production: 'production-registration',
} as const satisfies Record<RegistrationEnvironment, string>

/** The project, as the Manifest team's email names it: its id, slug and name. */
async function projectNamed(
  db: Db,
  projectId: string,
): Promise<{ id: string; slug: string; name: string } | undefined> {
  const [project] = await db
    .select({ id: projects.id, slug: projects.slug, name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
  return project
}

/**
 * THE OWNER SENDS A REGISTRATION TO THE MANIFEST TEAM (§9, Spec actions 3 and 9 as `8def435` amended them;
 * the FE-46/47/5 plan's Task 5, Decisions 2, 3, 5, 6 and 11). The record moves to `sent` — with the team,
 * who submit it to UBC IAM or hand it back — stamped with the moment and the person, and `sent_from` says
 * where it was sent from. UBC's submission (`submitted_at`, `submitted_by`, the reference) is untouched:
 * that is the team's to record. In this order, each refusal before anything is written:
 *
 *  1. **A draft must exist** (`409 LAUNCH_DRAFT_REQUIRED`): the package is what the person sends.
 *  2. **From where a send may go** (`iamSendableFrom`, `409 LAUNCH_TRANSITION_INVALID`): a draft, UBC's
 *     questions to the owner, or a lapse — never twice, never what UBC holds or decided.
 *  3. **In UBC's order** (Spec action 9, Rich's *"Gate each step"*): EITHER registration only once the
 *     privacy assessment is approved AND carries its reference (`409 LAUNCH_PIA_NOT_APPROVED`);
 *     production's only once staging's is `active` as well (`409 LAUNCH_STAGING_NOT_REGISTERED`).
 *  4. **The draft read is the draft held** (`409 LAUNCH_DRAFT_CHANGED`), and it carries the assessment's PIA
 *     number (`409 LAUNCH_DRAFT_STALE`).
 *
 * **ONE TRANSACTION, AND WHAT IT DECIDES BY IS HELD** (the whole-branch review's I1): the record `FOR
 * UPDATE`, the assessment and staging's registration `FOR SHARE`, taken registration → assessment →
 * staging; no writer holds two, so they cannot deadlock. Then `iam_registration.sent`, after the commit,
 * and the team TOLD after the event (`mailer.tellTeam` — in the background, never awaited, never undoing
 * the send). The caller is `sendIamRegistration`'s route, in a person's own session (`launch:submit`,
 * person-only).
 */
export async function sendIamRegistration(
  deps: SendDeps,
  input: SendInput & { environment: RegistrationEnvironment },
): Promise<IamRegistrationRow> {
  const { db, bus, mailer } = deps
  const what = `this app's ${input.environment} registration`
  const row = await db.transaction(async (tx) => {
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
    if (existing === undefined || sent === null) throw noDraft(what)
    const sentFrom = iamSendableFrom(existing)
    if (sentFrom === null)
      refuseSend(
        'an IAM registration',
        existing.state === 'change_requested'
          ? "'change_requested' with a change request the Manifest team filed with UBC IAM"
          : `'${existing.state}'`,
        "'draft', 'expired', 'active' (a change to the live registration), or 'change_requested' once UBC IAM has asked its owner for changes",
      )

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
          ? 'Ask an administrator to record the assessment’s PIA number, then send the registration again.'
          : 'Send the privacy assessment to the Manifest team first; once it is recorded approved, with its PIA number, send the registration.',
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
          'Send the staging registration first; once it is recorded active and the app is tested at staging, send production’s.',
        )
    }
    assertDraftRead(what, existing.generatedPackage, input.draftGeneratedAt)
    // WHAT UBC IAM ASKS FOR IS IN WHAT IS SENT (§9: the request *"is sent only once the privacy
    // assessment is approved, and its package carries the assessment's reference"*; Task 10's review,
    // I2): a package drafted in week one, before the Privacy Office answered, carries no PIA number —
    // and one drafted before the number changed carries the old one.
    if (sent.privacyAssessmentReference !== pia.externalTicketRef)
      throw new LaunchRecordError(
        'LAUNCH_DRAFT_STALE',
        sent.privacyAssessmentReference === null
          ? `the draft of ${what} was made before the privacy assessment was approved, so it does not carry the PIA number UBC IAM asks for (${pia.externalTicketRef})`
          : `the draft of ${what} carries PIA number ${sent.privacyAssessmentReference}, and the approved assessment's is ${pia.externalTicketRef}`,
        'Draft it again — the new draft carries the PIA number — and send that one.',
      )
    // A CHANGE TO THE LIVE REGISTRATION (FE-47; Decision 21) asks UBC for what the package asks — and one
    // that asks for nothing UBC has not registered, at the ACS and SLO it registered, is nothing to file.
    // Any send while UBC's registration is in force is one: from `active`, and from UBC's questions on a
    // change (`change_requested` from `submitted`), whose answer must still ask for it (the review's I1).
    const change = registrationInForce(existing)
    const asked = sent.attributes.map((a) => a.name)
    if (
      change &&
      sameAttributeSet(asked, existing.registeredAttributes) &&
      sent.acsUrl === existing.acsUrl &&
      sent.sloUrl === existing.sloUrl
    )
      throw new LaunchRecordError(
        'LAUNCH_CHANGE_EMPTY',
        `the draft of ${what} asks UBC IAM for exactly what it registered — the same attributes, at the same ACS and SLO — so there is no change to send`,
        'Change auth.attributes, auth.callback or auth.logout in manifest.yaml, validate it, draft the registration again, then send it.',
      )

    const [updated] = await tx
      .update(iamRegistrations)
      .set({
        state: 'sent',
        sentFrom,
        sentAt: new Date(),
        sentBy: input.actor.id,
        // WHAT A CHANGE ASKS FOR is the package's (Decision 21: one statement of one fact); the build's
        // check reads it, so a build that asks for it names the change. What UBC registered is untouched.
        ...(change ? { requestedAttributes: asked } : {}),
        // Out of `change_requested`, when it was there (Task 12): the origin goes with the state, and
        // `sent_from` keeps where it was for the hand-back.
        changeRequestedFrom: null,
        updatedAt: new Date(),
      })
      .where(eq(iamRegistrations.id, existing.id))
      .returning()
    return updated!
  })

  const name = await personName(db, input.actor.id)
  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `iam-registration:${row.id}`,
      type: 'iam_registration.sent',
      // WHAT IT ASKS FOR, as the row has it after the send (FE-60, A1 sitting 5): a change names its
      // attributes, so one detail's wait is told from another's; null for a first registration.
      machineDetail: {
        environment: input.environment,
        sentFrom: row.sentFrom!,
        requestedAttributes: row.requestedAttributes ?? null,
      },
      humanMessage:
        row.sentFrom === 'active'
          ? `${name} asked for a change to this app's ${input.environment} registration, sent to the Manifest team to file with UBC IAM.`
          : `${name} sent this app's ${input.environment} registration to the Manifest team, to submit to UBC IAM.`,
    },
    makeRedactor([]),
  )
  // AFTER THE EVENT, IN THE BACKGROUND — told, never awaited (Decision 11).
  const project = await projectNamed(db, input.projectId)
  if (project !== undefined)
    mailer.tellTeam({
      kind: 'record-sent',
      record: NOTICE_RECORD[input.environment],
      change: row.sentFrom === 'active',
      project,
      by: name,
      at: row.sentAt!,
    })
  return row
}

/**
 * THE SAME FOR THE PRIVACY ASSESSMENT, WITH AN ANSWER TO EVERY GAP (§9; Rich's (ii); Decision 9). It comes
 * first in UBC's order, so nothing gates it but its draft, where it is sent from, the draft read, and the
 * answers (`checkGapAnswers`, `400 LAUNCH_GAP_ANSWERS_INVALID`) — kept on the record in the draft's order,
 * replacing an earlier send's. The caller is `sendPrivacyAssessment`'s route.
 */
export async function sendPrivacyAssessment(
  deps: SendDeps,
  input: SendInput & { answers: readonly GapAnswer[] },
): Promise<PrivacyAssessmentRow> {
  const { db, bus, mailer } = deps
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(privacyAssessments)
      .where(eq(privacyAssessments.projectId, input.projectId))
      .for('update')
    const draft = readAssessmentDraft(existing?.generatedDraft)
    if (existing === undefined || draft === null)
      throw noDraft("this app's privacy assessment")
    if (!PIA_SENDABLE.has(existing.state))
      refuseSend('a privacy assessment', `'${existing.state}'`, "'draft'")
    assertDraftRead(
      "this app's privacy assessment",
      existing.generatedDraft,
      input.draftGeneratedAt,
    )
    const gapAnswers = checkGapAnswers(draft, input.answers)
    const [updated] = await tx
      .update(privacyAssessments)
      .set({
        state: 'sent',
        sentAt: new Date(),
        sentBy: input.actor.id,
        gapAnswers,
        updatedAt: new Date(),
      })
      .where(eq(privacyAssessments.id, existing.id))
      .returning()
    return updated!
  })

  const gapCount = row.gapAnswers?.length ?? 0
  const name = await personName(db, input.actor.id)
  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `privacy-assessment:${row.id}`,
      type: 'privacy_assessment.sent',
      machineDetail: { gapCount },
      humanMessage:
        `${name} sent this app's privacy assessment to the Manifest team` +
        (gapCount === 0
          ? ''
          : gapCount === 1
            ? ', with an answer to its one gap'
            : `, with an answer to each of its ${gapCount} gaps`) +
        ', to submit to the Privacy Office.',
    },
    makeRedactor([]),
  )
  const project = await projectNamed(db, input.projectId)
  if (project !== undefined)
    mailer.tellTeam({
      kind: 'record-sent',
      record: 'privacy-assessment',
      change: false,
      project,
      by: name,
      at: row.sentAt!,
    })
  return row
}

/** What the Manifest team's submission carries: the day it sent the record to UBC, and UBC's reference. */
export interface TeamSubmissionInput {
  projectId: string
  actor: { id: string; puid: string }
  /** The day the team sent it to UBC, `YYYY-MM-DD`; today in Vancouver when absent. */
  sentAt?: string | undefined
  /** UBC's reference: IAM's ticket, or the Privacy Office's PIA number. */
  reference: string
}

/** A record the Manifest team does not hold — its own words, the machines' code. */
const notWithTeam = (what: string, state: string | undefined): LaunchTransitionError =>
  new LaunchTransitionError(
    'LAUNCH_TRANSITION_INVALID',
    `${what} is ${state === undefined ? 'not yet drafted' : `'${state}'`}: the Manifest team submits, or hands back, only what its owner sent it ('sent')`,
  )

/**
 * THE MANIFEST TEAM SUBMITTED A REGISTRATION TO UBC IAM (§9; the FE-46/47/5 plan's Task 5, Decisions 2 and
 * 3) — an administrator's record (`launch:record`): `sent → submitted`, stamped with the day the team sent
 * it (noon in Vancouver; not after today, not before the owner sent it) and UBC's reference, by the
 * administrator. **A change to the live registration** (sent from `active`, Task 7) is FILED as a change
 * request instead: `sent → change_requested` from `active`, the event's `changeRequest` true. **Never refused
 * for UBC's order**: that was held when the owner sent it. In one transaction, the row `FOR UPDATE`;
 * `iam_registration.submitted` after the commit. The caller is `submitIamRegistration`'s route.
 */
export async function recordIamSubmission(
  db: Db,
  bus: EventBus,
  input: TeamSubmissionInput & { environment: RegistrationEnvironment },
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
    if (existing?.state !== 'sent' || existing.sentAt === null)
      throw notWithTeam(`this app's ${input.environment} registration`, existing?.state)
    const day = sentDay(input.sentAt, {
      at: existing.sentAt,
      what: 'the owner sent it to the Manifest team',
    })
    // A CHANGE TO THE LIVE REGISTRATION IS FILED AS A CHANGE REQUEST (FE-47; Decision 21): `change_requested`
    // from `active`, exactly what an administrator's filed change request stamps — what it asks for and what
    // UBC registered (and when) kept. Anything else goes to UBC as a request: `submitted`.
    const filesAChange = existing.sentFrom === 'active'
    const [updated] = await tx
      .update(iamRegistrations)
      .set({
        ...(filesAChange
          ? { state: 'change_requested' as const, changeRequestedFrom: 'active' as const }
          : { state: 'submitted' as const }),
        sentFrom: null,
        submittedAt: vancouverNoon(day),
        submittedBy: input.actor.id,
        externalTicketRef: input.reference,
        updatedAt: new Date(),
      })
      .where(eq(iamRegistrations.id, existing.id))
      .returning()
    return { row: updated!, day }
  })
  const changeRequest = row.state === 'change_requested'

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
        changeRequest,
        // FE-60: what the filed change asks for, as the row keeps it while UBC considers it.
        requestedAttributes: row.requestedAttributes ?? null,
      },
      humanMessage: changeRequest
        ? `${await personName(db, input.actor.id)} recorded that the Manifest team filed a change request for this app's ${input.environment} registration with UBC IAM on ${vancouverDayInWords(vancouverNoon(day))} (ticket ${input.reference}).`
        : `${await personName(db, input.actor.id)} recorded that the Manifest team submitted this app's ${input.environment} registration to UBC IAM on ${vancouverDayInWords(vancouverNoon(day))} (ticket ${input.reference}).`,
    },
    makeRedactor([]),
  )
  return row
}

/** THE SAME FOR THE PRIVACY ASSESSMENT, submitted to the Privacy Office with its PIA number. */
export async function recordAssessmentSubmission(
  db: Db,
  bus: EventBus,
  input: TeamSubmissionInput,
): Promise<PrivacyAssessmentRow> {
  const { row, day } = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(privacyAssessments)
      .where(eq(privacyAssessments.projectId, input.projectId))
      .for('update')
    if (existing?.state !== 'sent' || existing.sentAt === null)
      throw notWithTeam("this app's privacy assessment", existing?.state)
    const day = sentDay(input.sentAt, {
      at: existing.sentAt,
      what: 'the owner sent it to the Manifest team',
    })
    const [updated] = await tx
      .update(privacyAssessments)
      .set({
        state: 'submitted',
        submittedAt: vancouverNoon(day),
        submittedBy: input.actor.id,
        externalTicketRef: input.reference,
        updatedAt: new Date(),
      })
      .where(eq(privacyAssessments.id, existing.id))
      .returning()
    return { row: updated!, day }
  })

  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `privacy-assessment:${row.id}`,
      type: 'privacy_assessment.submitted',
      machineDetail: { sentAt: day, externalTicketRef: row.externalTicketRef ?? null },
      humanMessage: `${await personName(db, input.actor.id)} recorded that the Manifest team submitted this app's privacy assessment to the UBC Privacy Office on ${vancouverDayInWords(vancouverNoon(day))} (ticket ${input.reference}).`,
    },
    makeRedactor([]),
  )
  return row
}

/**
 * THE MANIFEST TEAM HANDS A REGISTRATION BACK TO ITS OWNER, UNSUBMITTED (§9; Rich's (i); Decisions 2 and
 * 5): `sent` returns to the state it was sent from (`iamReturnTo`) — a registration sent from UBC's
 * questions to the owner goes back to them, the owner's move again. The owner's send stays on the record
 * as history; the next send replaces it. **The reason travels outside the record**, as UBC's questions do.
 * The caller is `returnIamRegistration`'s route (`launch:record`).
 */
export async function returnIamRegistration(
  db: Db,
  bus: EventBus,
  input: {
    projectId: string
    environment: RegistrationEnvironment
    actor: { id: string; puid: string }
  },
): Promise<IamRegistrationRow> {
  const row = await db.transaction(async (tx) => {
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
    if (existing?.state !== 'sent' || existing.sentFrom === null)
      throw notWithTeam(`this app's ${input.environment} registration`, existing?.state)
    const [updated] = await tx
      .update(iamRegistrations)
      .set({
        ...iamReturnTo(existing.sentFrom),
        sentFrom: null,
        // A CHANGE HANDED BACK (FE-47): live again, as UBC registered it — nothing is asked of UBC any more.
        ...(existing.sentFrom === 'active' ? { requestedAttributes: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(iamRegistrations.id, existing.id))
      .returning()
    return { updated: updated!, to: existing.sentFrom }
  })

  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `iam-registration:${row.updated.id}`,
      type: 'iam_registration.returned',
      machineDetail: { environment: input.environment, to: row.to },
      humanMessage: `${await personName(db, input.actor.id)} handed this app's ${input.environment} registration back to its owner, unsubmitted.`,
    },
    makeRedactor([]),
  )
  return row.updated
}

/** THE SAME FOR THE PRIVACY ASSESSMENT: back to `draft`, the owner's to send again. */
export async function returnPrivacyAssessment(
  db: Db,
  bus: EventBus,
  input: { projectId: string; actor: { id: string; puid: string } },
): Promise<PrivacyAssessmentRow> {
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(privacyAssessments)
      .where(eq(privacyAssessments.projectId, input.projectId))
      .for('update')
    if (existing?.state !== 'sent')
      throw notWithTeam("this app's privacy assessment", existing?.state)
    const [updated] = await tx
      .update(privacyAssessments)
      .set({ state: 'draft', updatedAt: new Date() })
      .where(eq(privacyAssessments.id, existing.id))
      .returning()
    return updated!
  })

  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `privacy-assessment:${row.id}`,
      type: 'privacy_assessment.returned',
      machineDetail: { to: 'draft' },
      humanMessage: `${await personName(db, input.actor.id)} handed this app's privacy assessment back to its owner, unsubmitted.`,
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
 * A REGISTRATION ONCE SENT IS KEPT AS IT WAS SENT (Decision 9): drafted again only where it may be sent
 * from (`iamSendableFrom` — the FE-46/47/5 plan's Decisions 5 and 21): a draft, UBC's questions to the OWNER,
 * a lapse, or a live registration to change, where a new request is the point. Never while the Manifest team
 * holds it, or what UBC holds — a change request the team filed included.
 */
const draftable = (row: Pick<IamRegistrationRow, 'state' | 'changeRequestedFrom'>) =>
  iamSendableFrom(row) !== null

const alreadySent = (
  environment: RegistrationEnvironment,
  row: Pick<IamRegistrationRow, 'state' | 'changeRequestedFrom'>,
) =>
  row.state === 'sent'
    ? new LaunchRecordError(
        'LAUNCH_RECORD_SUBMITTED',
        `the ${environment} registration is with the Manifest team ('sent'): what its owner sent is kept as it was sent, and Manifest drafts it again only if the team hands it back`,
        'Ask the Manifest team to hand it back if it needs to change, then draft it again.',
      )
    : row.state === 'change_requested'
      ? new LaunchRecordError(
          'LAUNCH_RECORD_SUBMITTED',
          `the ${environment} registration has a change request the Manifest team filed with UBC IAM ('change_requested'): UBC holds it, and Manifest drafts it again only once UBC answers`,
          'Wait for UBC IAM’s answer, which an administrator records.',
        )
      : new LaunchRecordError(
          'LAUNCH_RECORD_SUBMITTED',
          `the ${environment} registration is '${row.state}': what was sent to UBC IAM is kept as it was sent, and Manifest drafts it again only once UBC answers — it asks for changes, or registers it and a change is asked for from the live registration`,
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
 * UBC'S REGISTRATION IS IN FORCE: recorded `active` once (`registered_at`), and not lapsed since — entering
 * `expired` clears `registered_at` (sitting 12's F3). A change asked for, filed, or sent back with UBC's
 * questions does not unregister it. `liveRegistrationItem`'s predicate.
 */
export const registrationInForce = (
  row: Pick<IamRegistrationRow, 'state' | 'registeredAt'>,
) => row.registeredAt !== null && row.state !== 'expired'

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
  /** The record today — one UBC holds in force is a change to the live registration (Task 7). */
  existing: Pick<IamRegistrationRow, 'state' | 'registeredAt'> | undefined,
): Promise<{ auth: ManifestSpec['auth']; commit: string; warnings: string[] }> {
  // A CHANGE TO A LIVE REGISTRATION (FE-47; Decision 21), for either environment, is drawn from the NEWEST
  // VALID MANIFEST, because that is where the change is being made. The release serving staging is not a
  // reliable source of it: once UBC's production registration is in force, a build asking for an attribute
  // UBC has not registered is refused (`assertAttributesRegistered`), so the candidate usually asks for only
  // what UBC already has — but NOT ALWAYS (W2's note, A1 sitting 5): a release built before production's
  // `registered_at` was set was never checked, and the build check never reads `auth.callback` or
  // `auth.logout`, so the candidate can carry part of a change, or a stale one. LIVE is UBC's registration in
  // force, not only `active`: a change UBC sent back with questions (`change_requested` from `submitted`) is
  // drafted again as the change it is (the whole-branch review's I1).
  if (existing !== undefined && registrationInForce(existing)) {
    const newest = await newestValidSpec(db, projectId, 'a change to a registration')
    return {
      auth: newest.spec.auth,
      commit: newest.commit,
      warnings: [
        'A change to a live registration is drawn from the newest valid manifest: that is where the change is being made.',
      ],
    }
  }
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
 *     read or minted): `submitted`, a change request the team filed, or one the Manifest team holds. A LIVE
 *     registration (`active`) is drafted again as a CHANGE (FE-47), from the newest valid manifest.
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
  if (existing !== undefined && !draftable(existing))
    throw alreadySent(input.environment, existing)

  const [project] = await db
    .select({ id: projects.id, slug: projects.slug, blueprintRef: projects.blueprintRef })
    .from(projects)
    .where(eq(projects.id, input.projectId))
  if (project === undefined) throw new Error(`no project ${input.projectId}`)
  const drawn = await drawnFrom(db, input.projectId, input.environment, existing)
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
    if (!draftable(current)) throw alreadySent(input.environment, current)
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
  state === 'sent'
    ? new LaunchRecordError(
        'LAUNCH_RECORD_SUBMITTED',
        "the privacy assessment is with the Manifest team ('sent'): what its owner sent is kept as it was sent, and Manifest drafts it again only if the team hands it back",
        'Ask the Manifest team to hand it back if it needs to change, then draft it again.',
      )
    : new LaunchRecordError(
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
