import { desc, eq } from 'drizzle-orm'
import { approvals, releases, type Db } from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'

export type ApprovalRow = typeof approvals.$inferSelect
export type ReleaseRow = typeof releases.$inferSelect

/** Decision 6: the RENDERED diff, at decision time — the jsonb column's own shape. */
export type DiffSnapshot = ApprovalRow['diffSnapshot']

export interface RecordApprovalInput {
  release: Pick<ReleaseRow, 'id' | 'projectId'>
  actor: { userId: string; puid: string }
  decision: 'approved' | 'rejected'
  reason?: string
  diffSnapshot: DiffSnapshot
  imageDigest: string
}

/**
 * §13: "Approval is a non-repudiable record: actor, timestamp, and the exact diff shown at
 * decision time."
 *
 * INSERT ONLY. There is no update and no delete — a release can be approved, rejected and
 * approved again, and each is its own row. *Integrity of the gate* is a list of ways an
 * approval could be made to say something it did not, and "edit the record" is the first of
 * them. `latestApprovalFor` takes the newest by `decided_at`, so the history is kept and
 * the answer is unambiguous.
 */
export async function recordApproval(
  db: Db,
  bus: EventBus,
  input: RecordApprovalInput,
): Promise<ApprovalRow> {
  const [row] = await db
    .insert(approvals)
    .values({
      releaseId: input.release.id,
      projectId: input.release.projectId,
      decision: input.decision,
      decidedBy: input.actor.userId,
      imageDigest: input.imageDigest,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      diffSnapshot: input.diffSnapshot,
    })
    .returning()

  await publishEvent(
    db,
    bus,
    {
      projectId: input.release.projectId,
      subject: `release:${input.release.id}`,
      type:
        input.decision === 'approved' ? 'release.approved' : 'release.approval_rejected',
      // THE DIGEST, NOT THE DIFF. The diff is on the row and is read through `getApproval`;
      // an event goes on a project's public stream and a manifest diff can name services,
      // attributes and egress destinations (§14's redaction argument, applied by omission).
      machineDetail: {
        releaseId: input.release.id,
        imageDigest: input.imageDigest.slice(0, 19),
        decision: input.decision,
      },
      humanMessage:
        input.decision === 'approved'
          ? `${input.actor.puid} approved this release for production.`
          : `${input.actor.puid} did not approve this release: ${input.reason}`,
    },
    makeRedactor([]),
  )
  return row!
}

/**
 * The newest decision about this release, or `undefined` when nobody has made one.
 *
 * NEWEST BY `decided_at`, with `id` breaking a tie — the same order `recentFramesFor` uses
 * and for the same measured reason: two rows written inside one transaction carry the same
 * instant, and without the tiebreak they come back in whatever order the index holds.
 */
export async function latestApprovalFor(
  db: Db,
  releaseId: string,
): Promise<ApprovalRow | undefined> {
  const [row] = await db
    .select()
    .from(approvals)
    .where(eq(approvals.releaseId, releaseId))
    .orderBy(desc(approvals.decidedAt), desc(approvals.id))
    .limit(1)
  return row
}

/**
 * Does this approval cover what would actually be deployed? (§13, and Decision 11.)
 *
 * **A STRING COMPARISON AND DELIBERATELY NOT A PREFIX ONE.** A digest is `sha256:<64 hex>`;
 * comparing a truncated form — which every log line and every event carries — would make a
 * rebuild whose digest shares nineteen characters look approved.
 */
export function approvalCoversDigest(
  approval: { decision: string; imageDigest: string },
  digest: string,
): boolean {
  return approval.decision === 'approved' && approval.imageDigest === digest
}

/**
 * §13's `diff_snapshot` — **WRITTEN IN TASK 10 AS A SIGNATURE AND FILLED IN BY TASK 11**,
 * in the same sitting. Task 10's subject is the approval and its binding; what the
 * administrator READ at decision time is Task 11's, and this body is replaced there.
 *
 * It is not a stub that purports to have rendered a diff: `changes` is empty and
 * `summarySource` says `unavailable`, which is the same shape a real snapshot takes when
 * there is nothing to compare — so nothing downstream has to special-case it, and nothing
 * here claims a diff was shown that was not.
 */
export async function buildDiffSnapshot(
  _deps: unknown,
  _release: ReleaseRow,
  digest: string,
): Promise<DiffSnapshot> {
  return Promise.resolve({
    imageDigest: digest,
    changes: [],
    services: [],
    attributes: [],
    resources: {},
    summary: null,
    summarySource: 'unavailable',
    review: {
      state: 'not_performed',
      reviewer: 'none',
      detail: 'no code reviewer is configured (D33, §15)',
    },
  })
}
