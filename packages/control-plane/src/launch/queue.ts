import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm'
import {
  approvalRequests,
  iamRegistrations,
  privacyAssessments,
  projects,
  users,
  type Db,
} from '../db/index.js'
import { openRequestFor, undecidedSince } from './candidate.js'
import { vancouverDayInWords } from './records.js'

/** What an item asks of an administrator — stable, for a client to switch on. */
export const QUEUE_KINDS = [
  'release-approval',
  'iam-registration',
  'iam-change-request',
  'privacy-assessment',
] as const
export type QueueKind = (typeof QUEUE_KINDS)[number]

/** The most items one read answers; `truncated` says when more wait. */
export const QUEUE_LIMIT = 200

export interface QueueItem {
  kind: QueueKind
  project: { id: string; slug: string; name: string; state: 'active' | 'archived' }
  /** The release asked about, or the registration or assessment with UBC. */
  subjectId: string
  /** Which registration, for a registration's item; null for anything else. */
  environment: 'staging' | 'production' | null
  /** Who asked, or who said it was sent; null when nobody was recorded. */
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
 *  - **`iam-registration`** — a registration `submitted` to UBC IAM, staging's or production's: the
 *    administrator records UBC's answer when it comes.
 *  - **`iam-change-request`** — a registration `change_requested` FROM `active`: a change request an
 *    administrator filed with UBC IAM, waiting on UBC since it was filed. One UBC sent back to the
 *    owner (FROM `submitted`) is the owner's move, and not here (Rich's (a), Spec action 10).
 *  - **`privacy-assessment`** — an assessment `submitted` to the Privacy Office.
 *
 * A deleted project's records are not in it; an archived project's are, saying so — UBC's answer still
 * comes. Pending actions are not in it: they are the requesting person's own question (§26). Each
 * select is bounded to the oldest `QUEUE_LIMIT + 1`, which is enough to know the oldest `QUEUE_LIMIT`
 * of all of them and whether there are more.
 */
export async function listQueue(db: Db): Promise<Queue> {
  const all = [
    ...(await signOffRequests(db)),
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
  state: p.state === 'archived' ? 'archived' : 'active',
})

const personOf = (u: { id: string | null; displayName: string | null } | null) =>
  u?.id == null ? null : { id: u.id, displayName: u.displayName ?? '' }

const ticket = (ref: string | null) => (ref === null ? '' : ` (ticket ${ref})`)

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
    .where(and(ne(projects.state, 'deleted'), undecidedSince))
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
    const who =
      request.requestedByToken === null
        ? asker.displayName
        : `An agent on ${asker.displayName}’s token`
    return {
      kind: 'release-approval' as const,
      project: projectOf(project),
      subjectId: request.releaseId,
      environment: null,
      requestedBy: { id: asker.id, displayName: asker.displayName },
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
 * WHEN IT WENT TO UBC: `submitted_at`, which the owner's *"I've sent it"*, an administrator's move into
 * `submitted` and a filed change request stamp (Task 9). A record an administrator moved before Task 9
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
    .leftJoin(users, eq(iamRegistrations.submittedBy, users.id))
    .where(
      and(
        ne(projects.state, 'deleted'),
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
            `${(record.requestedAttributes ?? []).length === 0 ? '' : `, asking for ${(record.requestedAttributes ?? []).join(', ')}`}` +
            ': record UBC IAM’s answer when it comes.',
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
    .leftJoin(users, eq(privacyAssessments.submittedBy, users.id))
    .where(and(ne(projects.state, 'deleted'), eq(privacyAssessments.state, 'submitted')))
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
