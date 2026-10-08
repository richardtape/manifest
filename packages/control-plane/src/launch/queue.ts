import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import {
  approvalRequests,
  iamRegistrations,
  privacyAssessments,
  projects,
  users,
  type Db,
} from '../db/index.js'
import { nameOrNobody } from '../projects/index.js'
import { openRequestFor, undecidedSince } from './candidate.js'
import { vancouverDayInWords } from './records.js'

/**
 * What an item asks of an administrator — stable, for a client to switch on. **ITS PLACE HERE IS ITS
 * ORDER** among items of the same moment (`listQueue`'s sort): what the Manifest team does next before
 * what waits on UBC (the FE-46/47/5 plan's Decision 16).
 */
export const QUEUE_KINDS = [
  'release-approval',
  'iam-registration-to-submit',
  'iam-change-to-file',
  'privacy-assessment-to-submit',
  'iam-registration',
  'iam-change-request',
  'privacy-assessment',
] as const
export type QueueKind = (typeof QUEUE_KINDS)[number]

/** The most items one read answers; `truncated` says when more wait. */
export const QUEUE_LIMIT = 200

export interface QueueItem {
  kind: QueueKind
  project: { id: string; slug: string; name: string }
  /** The release asked about, or the registration or assessment with UBC. */
  subjectId: string
  /** Which registration, for a registration's item; null for anything else. */
  environment: 'staging' | 'production' | null
  /**
   * Who asked: who asked for sign-off, or who sent the record to the Manifest team — and, for a record
   * with UBC that nobody sent in Manifest, the administrator who recorded it sent. Null when nobody was
   * recorded.
   */
  requestedBy: { id: string; displayName: string } | null
  /** Since when it has waited on an administrator. */
  since: Date
  /** One sentence, a person's words. */
  summary: string
  /** A sign-off request's note — shown here, to administrators, and nowhere else. */
  note: string | null
}

export interface Queue {
  items: QueueItem[]
  /** The age of the oldest item — the queue's headline. Null when nothing waits. */
  oldestSince: Date | null
  truncated: boolean
}

/**
 * §26'S QUEUE — EVERYTHING WAITING ON A PLATFORM ADMINISTRATOR, OLDEST FIRST (Spec action 5; the
 * launch path plan's Task 12, Decision 18). DERIVED from rows that already exist, never materialised
 * (§26: *"every queue item is derived from an entity that already exists"*):
 *
 *  - **`release-approval`** — an OPEN sign-off request (`openRequestFor`): a person asked an
 *    administrator to approve the release serving staging, and nobody has decided since.
 *  - **`iam-registration-to-submit`**, **`privacy-assessment-to-submit`** — a record its owner SENT to
 *    the Manifest team (`sent`; the FE-46/47/5 plan's Task 6, Decision 16): the team submits it to UBC
 *    and records that it has, or hands it back. Since the send, naming the sender.
 *  - **`iam-change-to-file`** — a change to a LIVE registration its owner sent (`sent` from `active`;
 *    Task 7, FE-47): the team files it with UBC IAM as a change request, or hands it back.
 *  - **`iam-registration`** — a registration `submitted` to UBC IAM, staging's or production's: the
 *    administrator records UBC's answer when it comes.
 *  - **`iam-change-request`** — a registration `change_requested` FROM `active`: a change request an
 *    administrator filed with UBC IAM, waiting on UBC since it was filed. One UBC sent back to the
 *    owner (FROM `submitted`) is the owner's move, and not here (Rich's (a), Spec action 10).
 *  - **`privacy-assessment`** — an assessment `submitted` to the Privacy Office.
 *
 * **A RECORD WITH UBC NAMES WHO SENT IT** (`sent_by ?? submitted_by`, Decision 16): the person who asked,
 * not the administrator who recorded the team's submission — and, for one nobody sent in Manifest (an
 * administrator's own `draft → submitted`), that administrator.
 *
 * **ACTIVE PROJECTS ONLY** (the sitting's whole-branch review, I2): an archived project refuses every
 * administrator's write but reading it — `launch:record`, `release:approve` — so its items could not be
 * acted on and would only age, holding `oldestSince` for ever; restored, they return with their true
 * days. A deleted project is a tombstone. Pending actions are not in it: they are the requesting
 * person's own question (§26). Each RECORD select is bounded to the oldest `QUEUE_LIMIT + 1`, which is
 * enough to know the oldest `QUEUE_LIMIT` of all and whether there are more; the sign-off select is
 * bounded by the projects — at most one open request each.
 */
export async function listQueue(db: Db): Promise<Queue> {
  const all = [
    ...(await signOffRequests(db)),
    ...(await recordsWithTheTeam(db)),
    ...(await registrationsWithUbc(db)),
    ...(await assessmentsWithUbc(db)),
  ].sort(
    (a, b) =>
      a.since.getTime() - b.since.getTime() ||
      QUEUE_KINDS.indexOf(a.kind) - QUEUE_KINDS.indexOf(b.kind) ||
      a.subjectId.localeCompare(b.subjectId),
  )
  return {
    items: all.slice(0, QUEUE_LIMIT),
    oldestSince: all[0]?.since ?? null,
    truncated: all.length > QUEUE_LIMIT,
  }
}

type ProjectRow = typeof projects.$inferSelect

const projectOf = (p: ProjectRow): QueueItem['project'] => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
})

/** A person by name — `personName`'s rule for a blank one (the review's M4), never a sentence naming nobody. */
const personOf = (u: { id: string | null; displayName: string | null } | null) =>
  u?.id == null ? null : { id: u.id, displayName: nameOrNobody(u.displayName) }

/** Only an active project's items can be acted on (I2, above). */
const isActive = eq(projects.state, 'active')

const ticket = (ref: string | null) => (ref === null ? '' : ` (ticket ${ref})`)

/** *", asking for ubcEduCwlPuid, mail, sn"* — what a change asks UBC for, in the order it was asked. */
const asking = (attributes: readonly string[] | null) =>
  (attributes ?? []).length === 0 ? '' : `, asking for ${(attributes ?? []).join(', ')}`

/**
 * The open sign-off requests. Undecided requests are found in SQL, then each project's is held to
 * `openRequestFor` — the one statement of "still the candidate", which is the release serving
 * staging NOW, a derivation SQL does not repeat. A project has at most one open request.
 */
async function signOffRequests(db: Db): Promise<QueueItem[]> {
  const undecided = await db
    .selectDistinct({ projectId: approvalRequests.projectId })
    .from(approvalRequests)
    .innerJoin(projects, eq(approvalRequests.projectId, projects.id))
    .where(and(isActive, undecidedSince))
  const open: string[] = []
  for (const { projectId } of undecided) {
    const request = await openRequestFor(db, projectId)
    if (request !== undefined) open.push(request.id)
  }
  if (open.length === 0) return []
  const rows = await db
    .select({
      request: approvalRequests,
      project: projects,
      asker: { id: users.id, displayName: users.displayName },
    })
    .from(approvalRequests)
    .innerJoin(projects, eq(approvalRequests.projectId, projects.id))
    .innerJoin(users, eq(approvalRequests.requestedBy, users.id))
    .where(inArray(approvalRequests.id, open))
  return rows.map(({ request, project, asker }) => {
    const name = nameOrNobody(asker.displayName)
    const who = request.requestedByToken === null ? name : `An agent on ${name}’s token`
    return {
      kind: 'release-approval' as const,
      project: projectOf(project),
      subjectId: request.releaseId,
      environment: null,
      requestedBy: { id: asker.id, displayName: name },
      since: request.createdAt,
      summary:
        project.launchedAt === null
          ? `${who} asked for the release serving staging to be approved for the app’s first production launch.`
          : `${who} asked for the release serving staging to be approved for production.`,
      note: request.note,
    }
  })
}

/**
 * WHAT THE MANIFEST TEAM HOLDS (the FE-46/47/5 plan's Task 6, Decision 16): every record `sent` on an
 * active project, oldest send first — each select bounded as the others. `sent_at` and `sent_by` are set
 * on entering `sent` (a CHECK holds both), so the wait is dated from the send and names the sender.
 */
async function recordsWithTheTeam(db: Db): Promise<QueueItem[]> {
  const registrations = await db
    .select({
      record: iamRegistrations,
      project: projects,
      sender: { id: users.id, displayName: users.displayName },
    })
    .from(iamRegistrations)
    .innerJoin(projects, eq(iamRegistrations.projectId, projects.id))
    .leftJoin(users, eq(iamRegistrations.sentBy, users.id))
    .where(and(isActive, sql`${iamRegistrations.state}::text = 'sent'`))
    .orderBy(asc(iamRegistrations.sentAt), asc(iamRegistrations.id))
    .limit(QUEUE_LIMIT + 1)
  const assessments = await db
    .select({
      record: privacyAssessments,
      project: projects,
      sender: { id: users.id, displayName: users.displayName },
    })
    .from(privacyAssessments)
    .innerJoin(projects, eq(privacyAssessments.projectId, projects.id))
    .leftJoin(users, eq(privacyAssessments.sentBy, users.id))
    .where(and(isActive, sql`${privacyAssessments.state}::text = 'sent'`))
    .orderBy(asc(privacyAssessments.sentAt), asc(privacyAssessments.id))
    .limit(QUEUE_LIMIT + 1)
  const sender = (u: { id: string | null; displayName: string | null } | null) =>
    personOf(u)?.displayName ?? 'Its owner'
  return [
    ...registrations.map(({ record, project, sender: by }) => {
      const since = record.sentAt ?? record.updatedAt
      const day = vancouverDayInWords(since)
      const env = record.environmentKind
      const base = {
        project: projectOf(project),
        subjectId: record.id,
        environment: env,
        requestedBy: personOf(by),
        since,
        note: null,
      }
      // A CHANGE TO THE LIVE REGISTRATION (Task 7): filed with UBC IAM as a change request, not submitted.
      return record.sentFrom === 'active'
        ? {
            ...base,
            kind: 'iam-change-to-file' as const,
            summary: `${sender(by)} asked for a change to the ${env} registration on ${day}${asking(record.requestedAttributes)}: file it with UBC IAM as a change request and record that you have, or hand it back.`,
          }
        : {
            ...base,
            kind: 'iam-registration-to-submit' as const,
            summary: `${sender(by)} sent the ${env} registration to the Manifest team on ${day}: submit it to UBC IAM and record that you have, or hand it back.`,
          }
    }),
    ...assessments.map(({ record, project, sender: by }) => {
      const since = record.sentAt ?? record.updatedAt
      return {
        kind: 'privacy-assessment-to-submit' as const,
        project: projectOf(project),
        subjectId: record.id,
        environment: null,
        requestedBy: personOf(by),
        since,
        summary: `${sender(by)} sent the privacy assessment to the Manifest team on ${vancouverDayInWords(since)}: submit it to the UBC Privacy Office and record that you have, or hand it back.`,
        note: null,
      }
    }),
  ]
}

/** Who asked for a record with UBC: who SENT it to the team, else who recorded it sent (Decision 16). */
const askerOf = (t: typeof iamRegistrations | typeof privacyAssessments) =>
  eq(users.id, sql`coalesce(${t.sentBy}, ${t.submittedBy})`)

/**
 * WHEN IT WENT TO UBC: `submitted_at`, which the Manifest team's submission, an administrator's move
 * into `submitted` and a filed change request stamp (Task 9). A record an administrator moved before Task 9
 * kept no such day, and its last change is the nearest thing Manifest knows.
 */
const sentAt = (t: typeof iamRegistrations | typeof privacyAssessments) =>
  sql<Date>`coalesce(${t.submittedAt}, ${t.updatedAt})`

async function registrationsWithUbc(db: Db): Promise<QueueItem[]> {
  const rows = await db
    .select({
      record: iamRegistrations,
      project: projects,
      sender: { id: users.id, displayName: users.displayName },
    })
    .from(iamRegistrations)
    .innerJoin(projects, eq(iamRegistrations.projectId, projects.id))
    .leftJoin(users, askerOf(iamRegistrations))
    .where(
      and(
        isActive,
        or(
          eq(iamRegistrations.state, 'submitted'),
          // FILED WITH UBC by an administrator — not UBC's questions back to the owner.
          and(
            eq(iamRegistrations.state, 'change_requested'),
            eq(iamRegistrations.changeRequestedFrom, 'active'),
          ),
        ),
      ),
    )
    .orderBy(asc(sentAt(iamRegistrations)), asc(iamRegistrations.id))
    .limit(QUEUE_LIMIT + 1)
  return rows.map(({ record, project, sender }) => {
    const since = record.submittedAt ?? record.updatedAt
    const env = record.environmentKind
    const day = vancouverDayInWords(since)
    return record.state === 'submitted'
      ? {
          kind: 'iam-registration' as const,
          project: projectOf(project),
          subjectId: record.id,
          environment: env,
          requestedBy: personOf(sender),
          since,
          summary: `The ${env} registration was sent to UBC IAM on ${day}${ticket(record.externalTicketRef)}: record UBC IAM’s answer when it comes.`,
          note: null,
        }
      : {
          kind: 'iam-change-request' as const,
          project: projectOf(project),
          subjectId: record.id,
          environment: env,
          requestedBy: personOf(sender),
          since,
          summary:
            `A change request for the ${env} registration was filed with UBC IAM on ${day}${ticket(record.externalTicketRef)}` +
            `${asking(record.requestedAttributes)}: record UBC IAM’s answer when it comes.`,
          note: null,
        }
  })
}

async function assessmentsWithUbc(db: Db): Promise<QueueItem[]> {
  const rows = await db
    .select({
      record: privacyAssessments,
      project: projects,
      sender: { id: users.id, displayName: users.displayName },
    })
    .from(privacyAssessments)
    .innerJoin(projects, eq(privacyAssessments.projectId, projects.id))
    .leftJoin(users, askerOf(privacyAssessments))
    .where(and(isActive, eq(privacyAssessments.state, 'submitted')))
    .orderBy(asc(sentAt(privacyAssessments)), asc(privacyAssessments.id))
    .limit(QUEUE_LIMIT + 1)
  return rows.map(({ record, project, sender }) => {
    const since = record.submittedAt ?? record.updatedAt
    return {
      kind: 'privacy-assessment' as const,
      project: projectOf(project),
      subjectId: record.id,
      environment: null,
      requestedBy: personOf(sender),
      since,
      summary: `The privacy assessment was sent to the UBC Privacy Office on ${vancouverDayInWords(since)}${ticket(record.externalTicketRef)}: record its answer, with the PIA number, when it comes.`,
      note: null,
    }
  })
}
