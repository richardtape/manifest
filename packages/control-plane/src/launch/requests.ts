import { eq } from 'drizzle-orm'
import { approvalRequests, releases, type Db } from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import { personName } from '../projects/index.js'
import { latestApprovalFor } from '../releases/index.js'
import { openRequestFor, type ApprovalRequestRow } from './candidate.js'
import { ProductionGateError } from './gate.js'
import { computeLaunchReadiness } from './readiness.js'
import { LaunchRecordError } from './records.js'

export interface RequestApprovalInput {
  releaseId: string
  /** The person asking — a token's own person when an agent asks for them, with the token named. */
  actor: { userId: string; tokenId: string | null }
  /** The asker's words to the administrators: shown to them in the queue, and to nobody else. */
  note?: string | undefined
}

export interface RequestedApproval {
  request: ApprovalRequestRow
  /** False when the release had been asked about already — a second ask answers the first. */
  created: boolean
  /** Whether an administrator still has to answer it (`openRequestFor`). */
  open: boolean
}

/**
 * AN OWNER ASKS AN ADMINISTRATOR TO SIGN OFF THE RELEASE SERVING STAGING (§6, §13 and §26 as Spec
 * action 5 amended them; the launch path plan's Task 12, FE-25). Until this, an approval began on the
 * administrator's side and a refused production deploy wrote nothing, so the one approval a launch
 * needs from a person at the platform could be waited for without ever being asked for. The request
 * is what puts *"Release awaiting approval"* in the administrators' queue.
 *
 * Refused, in this order, each before anything is written:
 *  1. **`RELEASE_NOT_STAGED`** unless the release is the candidate — the release serving staging,
 *     healthy — as the production gate refuses it, carrying the checklist that names the one that is.
 *  2. **`APPROVAL_NOT_NEEDED`** when the checklist's `admin-approval` item is already met — an approval
 *     covers it, or a launched app's release changes nothing that needs one — in the item's words.
 *  3. **`RELEASE_REJECTED`** when an administrator rejected it: a rejection is final for its release
 *     (Decision 17), and an ask could only make a request closed the moment it was made.
 *
 * **ONE REQUEST PER RELEASE** (`release_id` UNIQUE, `ON CONFLICT DO NOTHING`): a second ask — two at
 * once included — answers the first, unchanged, and announces nothing. The note is never in the event.
 *
 * The caller is `requestApproval`'s route, after `approval:request` (owner, collaborator,
 * administrator; mintable — a request grants nothing and decides nothing).
 */
export async function requestApproval(
  db: Db,
  bus: EventBus,
  input: RequestApprovalInput,
): Promise<RequestedApproval> {
  const [release] = await db
    .select()
    .from(releases)
    .where(eq(releases.id, input.releaseId))
  // The route reads the release before it authorizes, and answers `404` for one that does not exist.
  if (release === undefined)
    throw new Error(`no release '${input.releaseId}' to ask about`)
  const view = await computeLaunchReadiness(db, release.projectId)
  if (view.candidateReleaseId !== release.id)
    throw new ProductionGateError('RELEASE_NOT_STAGED', view)
  const item = view.items.find((i) => i.id === 'admin-approval')
  if (item?.state === 'met')
    throw new LaunchRecordError(
      'APPROVAL_NOT_NEEDED',
      `there is no approval to ask an administrator for — ${item.why}`,
      'Read the launch checklist for what is still unmet, and deploy to production once it is ready.',
    )
  const latest = await latestApprovalFor(db, release.id)
  if (latest?.decision === 'rejected')
    throw new LaunchRecordError(
      'RELEASE_REJECTED',
      `an administrator did not approve this release: ${latest.reason ?? ''} — a rejection is final for the release it was made on, so there is nothing to ask again`,
      'Change the app, build and release it, deploy that release to staging, and ask for sign-off on it.',
    )

  const [inserted] = await db
    .insert(approvalRequests)
    .values({
      releaseId: release.id,
      projectId: release.projectId,
      requestedBy: input.actor.userId,
      requestedByToken: input.actor.tokenId,
      ...(input.note === undefined ? {} : { note: input.note }),
    })
    .onConflictDoNothing({ target: approvalRequests.releaseId })
    .returning()
  const request =
    inserted ??
    (
      await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.releaseId, release.id))
    )[0]
  if (request === undefined)
    throw new Error(
      `the request for release '${release.id}' vanished while it was asked for`,
    )

  if (inserted !== undefined) {
    const name = await personName(db, input.actor.userId)
    await publishEvent(
      db,
      bus,
      {
        projectId: release.projectId,
        subject: `release:${release.id}`,
        type: 'approval.requested',
        // WHO AND WHICH RELEASE — never the note, which is for administrators alone (`listQueue`).
        machineDetail: {
          requestId: inserted.id,
          releaseId: release.id,
          viaToken: input.actor.tokenId !== null,
        },
        humanMessage:
          input.actor.tokenId === null
            ? `${name} asked an administrator to approve this release for production.`
            : `An agent on ${name}’s token asked an administrator to approve this release for production.`,
      },
      makeRedactor([]),
    )
  }
  const open = (await openRequestFor(db, release.projectId))?.id === request.id
  return { request, created: inserted !== undefined, open }
}
