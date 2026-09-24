import { desc, eq } from 'drizzle-orm'
import type { LiteLlmClient } from '../ai/index.js'
import { appSpecs, approvals, builds, projects, releases, type Db } from '../db/index.js'
// TYPES ONLY, and that is load-bearing: `launch/readiness.ts` imports this module at
// RUNTIME, so a value imported back from `launch/` would be an import cycle.
import type { Reviewer, ReviewVerdict } from '../launch/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import type { SourceDriver } from '../source/index.js'
import {
  describeDiff,
  securityNotesFor,
  sensitiveFieldsBetween,
  sensitiveViewOfRelease,
  type ManifestSpec,
  type SensitiveField,
  type SensitiveView,
  type SpecChange,
} from '../spec/index.js'
import type { ResolvedConfigSet } from './release.js'
import { summariseChanges } from './summary.js'
import { launchedAt } from './launched.js'

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
 * The newest release of this project whose LATEST decision is `approved` (P6b Decision 4) —
 * the baseline a re-escalation is diffed against, and what §13's summary means by "the last
 * approved release".
 *
 * **BY APPROVAL ORDER, NOT BY RELEASE ORDER.** A release made after an approved one and
 * never approved is not what changed since; the question this answers is about decisions,
 * so it is asked of the decisions table.
 *
 * **EACH RELEASE'S LATEST DECISION, NOT ANY APPROVAL ROW** (P6b `[M5]`). A release can be
 * approved, rejected and approved again (no unique constraint on `release_id`), and
 * filtering the rows on `decision = 'approved'` let a release an administrator had
 * WITHDRAWN stay the baseline for every diff after it. Rows are read newest first, and the
 * first row seen for a release is its latest decision.
 *
 * **THE RELEASE IN HAND IS EXCLUDED, and that is not tidiness.** Without it a second
 * approval of the same release would diff it against itself and report that nothing
 * changed — beside a digest that had.
 */
export async function lastApprovedReleaseFor(
  db: Db,
  projectId: string,
  excludeReleaseId: string,
): Promise<ReleaseRow | undefined> {
  const rows = await db
    .select({ decision: approvals.decision, release: releases })
    .from(approvals)
    .innerJoin(releases, eq(approvals.releaseId, releases.id))
    .where(eq(approvals.projectId, projectId))
    .orderBy(desc(approvals.decidedAt), desc(approvals.id))
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.release.id)) continue
    seen.add(row.release.id)
    if (row.release.id !== excludeReleaseId && row.decision === 'approved')
      return row.release
  }
  return undefined
}

/** D9.2's question about one release: what it changed since the baseline, if there is one. */
export interface SensitiveChange {
  /** The last approved release (Decision 4), or `undefined` when nothing is approved yet. */
  baseline: ReleaseRow | undefined
  /** §7's fields that differ, in `SENSITIVE_FIELDS` order; `[]` when there is no baseline. */
  fields: SensitiveField[]
}

/**
 * A release's `SensitiveView`: its frozen PRODUCTION config, and the `blueprint:` its own
 * spec row names (`ResolvedConfig` carries none — P6b *Read this first* 3).
 */
async function sensitiveViewOf(db: Db, release: ReleaseRow): Promise<SensitiveView> {
  const [spec] = await db
    .select({ parsed: appSpecs.parsed })
    .from(appSpecs)
    .where(eq(appSpecs.id, release.appSpecId))
  // '' when the reference cannot be read: compared with any real one it DIFFERS, so a
  // missing spec row re-escalates rather than waving the release through.
  const blueprint = (spec?.parsed as Partial<ManifestSpec> | undefined)?.blueprint ?? ''
  return sensitiveViewOfRelease(
    (release.resolvedConfig as ResolvedConfigSet).production,
    blueprint,
  )
}

/**
 * D9.2's diff (P6b Task 3, Decision 5): the sensitive fields in which this release's FROZEN
 * production config differs from the last approved release's — the configuration the
 * platform actually runs, blueprint defaults and production override included.
 *
 * **WITH NO BASELINE IT ANSWERS NO FIELDS, AND THE CALLER DECIDES** what that means: for a
 * launched app with nothing approved to compare against, "no fields" must not read as
 * "self-serve" — Task 5's `approvalRequirementFor` treats a missing baseline as requiring
 * an approval.
 *
 * **Caller:** `approvalRequirementFor` below (P6b Task 5), which `deployRelease` reads before
 * any production launch deploy starts; Task 6's checklist is its second reader, and Task 8's
 * snapshot will be a third.
 */
export async function sensitiveChangeOf(
  db: Db,
  release: ReleaseRow,
): Promise<SensitiveChange> {
  const baseline = await lastApprovedReleaseFor(db, release.projectId, release.id)
  if (baseline === undefined) return { baseline, fields: [] }
  const [before, after] = await Promise.all([
    sensitiveViewOf(db, baseline),
    sensitiveViewOf(db, release),
  ])
  return { baseline, fields: sensitiveFieldsBetween(before, after) }
}

/**
 * Whether a production deploy of this release needs an administrator's approval, and why.
 * `fields` is always present, so a reader never has to ask which branch it is on to print it.
 */
export type ApprovalRequirement =
  | {
      required: true
      reason: 'first-launch'
      baselineReleaseId: null
      fields: readonly SensitiveField[]
    }
  /** Launched, and yet nothing approved to compare with — a hand-edited row, or a lost approval. FAIL CLOSED. */
  | {
      required: true
      reason: 'no-baseline'
      baselineReleaseId: null
      fields: readonly SensitiveField[]
    }
  | {
      required: true
      reason: 'sensitive'
      baselineReleaseId: string
      fields: readonly SensitiveField[]
    }
  | {
      required: false
      reason: 'self-serve'
      baselineReleaseId: string
      fields: readonly SensitiveField[]
    }

/**
 * §13 D9's TWO CLAUSES, as ONE rule (P6b Decisions 2, 3, 4 and 7) — read by `deployRelease`,
 * which is the gate's second half, and from Task 6 by §13's checklist, which is its first.
 * Two statements of it would be the drift ORIENTATION §9 names.
 *
 *  - NOT LAUNCHED: every production release is a first launch and needs an approval (D9.1)
 *    — an identical rebuild of an approved release included, because the candidate changed
 *    and asking is the safe direction (Decision 3).
 *  - LAUNCHED: compare the release's frozen production config with the LAST APPROVED release
 *    (Decision 4). Nothing sensitive changed → self-serve. Something did → approval (D9.2).
 *  - LAUNCHED WITH NO BASELINE: fail closed. A launch needs an approval, so a launched project
 *    with none has had its history edited, and self-serve is the expensive direction to be
 *    wrong in. **This is also what redeploying the ONLY approved release reads as** — the
 *    release in hand is excluded from its own baseline — and its own approval then covers it.
 *
 * **Callers:** `productionApprovalFor` (below), and so `deployRelease`; Task 6's checklist.
 */
export async function approvalRequirementFor(
  db: Db,
  release: ReleaseRow,
): Promise<ApprovalRequirement> {
  if ((await launchedAt(db, release.projectId)) === null)
    return { required: true, reason: 'first-launch', baselineReleaseId: null, fields: [] }
  const { baseline, fields } = await sensitiveChangeOf(db, release)
  if (baseline === undefined)
    return { required: true, reason: 'no-baseline', baselineReleaseId: null, fields: [] }
  return fields.length > 0
    ? { required: true, reason: 'sensitive', baselineReleaseId: baseline.id, fields }
    : {
        required: false,
        reason: 'self-serve',
        baselineReleaseId: baseline.id,
        fields: [],
      }
}

/** The rule's answer for one release and the digest a deploy would run. */
export interface ProductionApproval {
  requirement: ApprovalRequirement
  latest: ApprovalRow | undefined
  /** Decision 7: an administrator's rejection is final for this release, sensitive or not. */
  rejected: boolean
  covered: boolean
  satisfied: boolean
}

/**
 * THE VERDICT `deployRelease` ACTS ON — the requirement, plus what an administrator has said
 * about THIS release. A rejection is never overridden by self-serve (Decision 7): deploying a
 * release someone refused would override a recorded human decision.
 *
 * **Callers:** `deployRelease` (P6b Task 5), and Task 6's `admin-approval` item — P6a's
 * Decision 2 applied a second time: the view and the gate cannot disagree.
 */
export async function productionApprovalFor(
  db: Db,
  release: ReleaseRow,
  digest: string,
): Promise<ProductionApproval> {
  const [requirement, latest] = await Promise.all([
    approvalRequirementFor(db, release),
    latestApprovalFor(db, release.id),
  ])
  const rejected = latest?.decision === 'rejected'
  const covered = latest !== undefined && approvalCoversDigest(latest, digest)
  return {
    requirement,
    latest,
    rejected,
    covered,
    satisfied: !rejected && (!requirement.required || covered),
  }
}

/**
 * WHY A VERDICT IS NOT SATISFIED, IN WORDS — which of the three it was. The CODE stays
 * `RELEASE_DIGEST_NOT_APPROVED` for all three: through the route, Task 6's gate answers
 * first with a more specific code and the view, and this refusal is the second half.
 */
export function unsatisfiedReason(verdict: ProductionApproval, digest: string): string {
  if (verdict.rejected)
    return (
      'an administrator rejected this release for production' +
      (verdict.latest?.reason ? `: ${verdict.latest.reason}` : '') +
      '. A rejection is final for this release (§13); build and release again.'
    )
  const { requirement } = verdict
  if (requirement.reason === 'sensitive')
    return (
      `this release changes ${requirement.fields.join(', ')} since the last approved ` +
      `release (${requirement.baselineReleaseId}), so it needs an administrator's approval ` +
      `again (§13 D9.2), and none covers image digest ${digest.slice(0, 19)}….`
    )
  return (
    (requirement.reason === 'no-baseline'
      ? 'this project has launched but has no other approved release to compare with, ' +
        'so it fails closed: '
      : '') +
    `no administrator approval covers image digest ${digest.slice(0, 19)}… for this ` +
    'release. An approval binds the exact digest (§13), so a rebuild needs a new approval.'
  )
}

/**
 * D33's coverage limit (P6b Task 8, R4(d)), written into every record so no reader mistakes an
 * approval for a code review — and handed to the model, which is told not to imply otherwise.
 */
export const COVERAGE_LIMIT =
  'An administrator sees a first launch and any release that changes a sensitive field (§7). A release that changes none reaches production without an administrator, and its code is reviewed by nothing (§13’s residual risk); containment is the control (§20).'

/**
 * THE NEWEST CODE-REVIEW VERDICT RECORDED FOR A RELEASE (P6b Task 8, Decision 12), or
 * `undefined` when no reviewer has been asked about it — which, under D9, is every release an
 * administrator never saw: a self-serve one (D33). Read from the approvals' stored snapshots;
 * **Task 9 adds `approval_previews` as a second source, here, and the item does not change.**
 *
 * NEWEST BY `decided_at`, with `id` breaking a tie — `latestApprovalFor`'s order.
 *
 * **Caller:** `launch/readiness.ts`'s `code-review` item — which reads it through `releases/`,
 * never the table itself: `launch/` already imports `releases/` at runtime, and the reverse
 * would be a cycle.
 */
export async function latestReviewFor(
  db: Db,
  releaseId: string,
): Promise<DiffSnapshot['review'] | undefined> {
  return (await latestApprovalFor(db, releaseId))?.diffSnapshot.review
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
 * **R4(d)'S SECURITY DIMENSION (P6b Task 8, Decision 13)** — deterministic first: the
 * baseline, the sensitive fields that changed since it (`sensitiveChangeOf`, the rule the gate
 * reads) and a note for each, present when the model is down; and D33's coverage limit. **The
 * reviewer is asked BEFORE the model**, so the summary can carry its verdict, and the model is
 * told the notes, the verdict and the limit.
 */
export async function buildDiffSnapshot(
  deps: SnapshotDeps,
  release: ReleaseRow,
  digest: string,
): Promise<DiffSnapshot> {
  // ONE READ OF THE BASELINE: the summary's "previous" and the sensitive diff's baseline are
  // the same question (Decision 4), so `sensitiveChangeOf` answers both.
  const { baseline: previous, fields } = await sensitiveChangeOf(deps.db, release)
  const now = (release.resolvedConfig as ResolvedConfigSet).production
  // A FIRST LAUNCH HAS NOTHING TO DIFF, and that is a STATE rather than an absence: §13's
  // gate for a first launch is the whole checklist, and D9.2's re-escalation — which is
  // what a diff is FOR — is P6b's. So the changes are empty and the summary says why,
  // which is a different answer from "the model could not be reached".
  const changes =
    previous === undefined
      ? []
      : describeDiff((previous.resolvedConfig as ResolvedConfigSet).production, now)
  const security = securityNotesFor(fields)
  // R4(d): THE REVIEWER FIRST, so the summary below is written knowing the verdict — and the
  // record carries the verdict whatever the model then says (Decision 13).
  const review = await reviewOf(deps, release, changes)
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
      : await summariseChanges(deps.llm, changes, {
          security,
          review,
          coverage: COVERAGE_LIMIT,
        })),
    // R4 (D33): the reviewer's verdict AT DECISION TIME, from the reviewer `ServerDeps`
    // carries — the seam's one real caller (P6a Task 12). What it says is the reviewer's
    // to say: `NullReviewer` answers `not_performed` and names itself, and a verdict of
    // `clean` from a reviewer that looked at nothing is the stub R4(b) forbids.
    review,
    baselineReleaseId: previous?.id ?? null,
    sensitiveFields: fields,
    security,
    coverage: COVERAGE_LIMIT,
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
