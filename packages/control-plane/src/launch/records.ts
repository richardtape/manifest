import { eq } from 'drizzle-orm'
import { iamRegistrations, privacyAssessments, type Db } from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import {
  iamTransition,
  piaTransition,
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
 * `launch/`'s OTHER refusal — a record whose fields cannot be accepted, as distinct from
 * a state it cannot reach. A 400 rather than a 409: nothing about the record's state is
 * in conflict, the request itself is wrong. Same reasoning as `LaunchTransitionError`
 * about where it lives and why the code is a constructor argument.
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
  entityId: string
  acsUrl: string
  sloUrl: string
  registeredAttributes: string[]
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

export async function getIamRegistration(
  db: Db,
  projectId: string,
): Promise<IamRegistrationRow | undefined> {
  const [row] = await db
    .select()
    .from(iamRegistrations)
    .where(eq(iamRegistrations.projectId, projectId))
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

  const existing = await getIamRegistration(db, input.projectId)
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

  const [row] = await db
    .insert(iamRegistrations)
    .values({
      projectId: input.projectId,
      entityId: input.entityId,
      acsUrl: input.acsUrl,
      sloUrl: input.sloUrl,
      registeredAttributes: input.registeredAttributes,
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
      target: iamRegistrations.projectId,
      set: {
        entityId: input.entityId,
        acsUrl: input.acsUrl,
        sloUrl: input.sloUrl,
        registeredAttributes: input.registeredAttributes,
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
        entityId: row!.entityId,
        externalTicketRef: row!.externalTicketRef ?? null,
        attributeCount: input.registeredAttributes.length,
      },
      humanMessage:
        `${input.actor.puid} recorded this app's UBC IAM registration as ${state}` +
        `${row!.externalTicketRef === null ? '' : ` (ticket ${row!.externalTicketRef})`}.`,
    },
    makeRedactor([]),
  )
  return row!
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

  const [row] = await db
    .insert(privacyAssessments)
    .values({
      projectId: input.projectId,
      state,
      approvedAt,
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
        `${input.actor.puid} recorded this app's privacy assessment as ${state}` +
        `${row!.externalTicketRef === null ? '' : ` (ticket ${row!.externalTicketRef})`}.`,
    },
    makeRedactor([]),
  )
  return row!
}
