import { and, desc, eq } from 'drizzle-orm'
import type { LiteLlmClient } from '../ai/index.js'
import { approvals, builds, projects, releases, type Db } from '../db/index.js'
// TYPES ONLY, and that is load-bearing: `launch/readiness.ts` imports this module at
// RUNTIME, so a value imported back from `launch/` would be an import cycle.
import type { Reviewer, ReviewVerdict } from '../launch/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import type { SourceDriver } from '../source/index.js'
import { describeDiff, type SpecChange } from '../spec/index.js'
import type { ResolvedConfigSet } from './release.js'
import { summariseChanges } from './summary.js'

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
 * The newest release of this project an administrator has APPROVED — what §13's diff at
 * decision time is taken against ("since the last approved release").
 *
 * **BY APPROVAL ORDER, NOT BY RELEASE ORDER.** A release made after an approved one and
 * never approved is not what production is running and is not what changed since; the
 * question this answers is about decisions, so it is asked of the decisions table.
 *
 * **THE RELEASE IN HAND IS EXCLUDED, and that is not tidiness.** A release can be approved,
 * rejected and approved again (there is no unique constraint on `release_id`), so without
 * this a second approval of the same release would diff it against itself and report that
 * nothing changed — beside a digest that had.
 */
export async function lastApprovedReleaseFor(
  db: Db,
  projectId: string,
  excludeReleaseId: string,
): Promise<ReleaseRow | undefined> {
  const rows = await db
    .select({ release: releases })
    .from(approvals)
    .innerJoin(releases, eq(approvals.releaseId, releases.id))
    .where(and(eq(approvals.projectId, projectId), eq(approvals.decision, 'approved')))
    .orderBy(desc(approvals.decidedAt), desc(approvals.id))
  return rows.find((r) => r.release.id !== excludeReleaseId)?.release
}

export interface SnapshotDeps {
  db: Db
  /** §10's admin transport. Absent under `MANIFEST_AI_ENABLED=0` (Decision 7). */
  llm: LiteLlmClient | undefined
  /** Where a project's code lives, so the reviewer is told a real repository path. */
  source: Pick<SourceDriver, 'repositoryFor'>
  /**
   * R4's seam (D33, §15). `NullReviewer` at boot, whose verdict is an honest
   * `not_performed`; a real one is a one-line change where `ServerDeps` is built.
   */
  reviewer: Reviewer
}

/**
 * §13: the approval record captures "image digest, `manifest.yaml` diff, services requested,
 * CWL attributes requested, resource delta, and an AI-written plain-English summary of what
 * changed since the last approved release."
 *
 * **RENDERED AT DECISION TIME AND STORED** (Decision 6). §13 says "the exact diff shown at
 * decision time"; a diff recomputed later against a changed spec is a different claim about
 * a different thing, and the record exists precisely to be non-repudiable.
 *
 * `describeDiff` runs over the FROZEN `ResolvedConfig` of each release, never over
 * `app_specs.parsed` — a release is what §13 froze, and reading the spec back would be the
 * second source of truth P4a deleted.
 *
 * **`isSensitiveDiff` IS NOT CALLED HERE.** That one answers *"does this need an approval?"*
 * and is D9.2's re-escalation, which is P6b's; calling it now would be P6b built badly.
 */
export async function buildDiffSnapshot(
  deps: SnapshotDeps,
  release: ReleaseRow,
  digest: string,
): Promise<DiffSnapshot> {
  const previous = await lastApprovedReleaseFor(deps.db, release.projectId, release.id)
  const now = (release.resolvedConfig as ResolvedConfigSet).production
  // A FIRST LAUNCH HAS NOTHING TO DIFF, and that is a STATE rather than an absence: §13's
  // gate for a first launch is the whole checklist, and D9.2's re-escalation — which is
  // what a diff is FOR — is P6b's. So the changes are empty and the summary says why,
  // which is a different answer from "the model could not be reached".
  const changes =
    previous === undefined
      ? []
      : describeDiff((previous.resolvedConfig as ResolvedConfigSet).production, now)
  return {
    imageDigest: digest,
    changes: changes.map((c) => ({
      path: c.path,
      from: c.from,
      to: c.to,
      summary: c.summary,
    })),
    // **THE `.sort()` CALLS ARE NOT COSMETIC.** A snapshot is compared by eye and by `diff`
    // in Task 19's demo, and an unsorted list makes two identical approvals look different
    // — the same order-insensitivity `spec/diff.ts` already applies for the same reason.
    services: now.services.map((s) => `${s.type}@${s.version}`).sort(),
    attributes: [...(now.auth?.attributes ?? [])].sort(),
    resources: {
      cpu: now.resources.cpu ?? null,
      memory: now.resources.memory ?? null,
      disk: now.resources.disk ?? null,
      pids: now.resources.pids ?? null,
    },
    ...(previous === undefined
      ? { summary: null, summarySource: 'no-previous-release' as const }
      : await summariseChanges(deps.llm, changes)),
    // R4 (D33): the reviewer's verdict AT DECISION TIME, from the reviewer `ServerDeps`
    // carries — the seam's one real caller (P6a Task 12). What it says is the reviewer's
    // to say: `NullReviewer` answers `not_performed` and names itself, and a verdict of
    // `clean` from a reviewer that looked at nothing is the stub R4(b) forbids.
    review: await reviewOf(deps, release, changes),
  }
}

/**
 * Asks the configured reviewer about this release, and renders its verdict for the record.
 *
 * **THE SOURCE IS READ FROM THE RELEASE'S OWN BUILD**, not handed in by the route: the
 * commit a reviewer reads must be the commit the approved digest was built from, and a
 * caller that passed the wrong one would be invisible through `NullReviewer`, which reads
 * nothing (`approval.test.ts` injects a recording reviewer for exactly that reason).
 *
 * **A REVIEWER THAT THROWS FAILS THE APPROVAL, LOUDLY**, and that is a decision rather than
 * an omission: `NullReviewer` cannot throw, and whether a real reviewer's outage should be
 * recorded as absent — Decision 7's argument for the summary — is the question the plan
 * that lands one must answer, not one this seam answers for it by swallowing an error.
 */
async function reviewOf(
  deps: SnapshotDeps,
  release: ReleaseRow,
  changes: readonly SpecChange[],
): Promise<DiffSnapshot['review']> {
  const [origin] = await deps.db
    .select({ slug: projects.slug, commitSha: builds.commitSha })
    .from(builds)
    .innerJoin(projects, eq(builds.projectId, projects.id))
    .where(eq(builds.id, release.buildId))
  if (origin === undefined)
    throw new Error(`release '${release.id}' has no build row to review`)
  const verdict = await deps.reviewer.review({
    projectId: release.projectId,
    releaseId: release.id,
    changes,
    source: {
      repoPath: deps.source.repositoryFor(origin.slug).path,
      commitSha: origin.commitSha,
    },
  })
  return {
    state: verdict.state,
    reviewer: verdict.reviewer,
    detail: describeVerdict(verdict),
  }
}

/**
 * One line for the record, per verdict state.
 *
 * **EXHAUSTIVE WITH NO `default`**, so a fourth state added to `ReviewVerdict` is a `tsc`
 * error here (TS2366: the function can fall off the end) rather than a verdict stored with
 * a detail nobody wrote. A `default` branch would compile against any union at all.
 */
export function describeVerdict(verdict: ReviewVerdict): string {
  switch (verdict.state) {
    case 'not_performed':
      return verdict.reason
    case 'clean':
      return `${verdict.checked} checked, no findings`
    case 'findings':
      return (
        `${verdict.findings.length} finding(s): ` +
        verdict.findings
          .map(
            (f) =>
              `[${f.severity}] ${f.message}${f.path === undefined ? '' : ` (${f.path}${f.line === undefined ? '' : `:${f.line}`})`}`,
          )
          .join('; ')
      )
  }
}
