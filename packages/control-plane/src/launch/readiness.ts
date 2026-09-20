import { eq } from 'drizzle-orm'
import { STALENESS_THRESHOLD_DAYS } from '../build/index.js'
import { builds, environments, projects, releases, type Db } from '../db/index.js'
import { servingInstanceOf, type StoredAudience } from '../projects/index.js'
import {
  approvalCoversDigest,
  latestApprovalFor,
  type ResolvedConfigSet,
} from '../releases/index.js'
import type { ScanSummary } from '../runtime/index.js'
import { getIamRegistration, getPrivacyAssessment } from './records.js'

/**
 * Every id §13's checklist can carry, ONCE. `api/representations/launch.ts` builds its
 * closed `z.enum` from this list rather than restating it (P6a Task 12): `[M4]` measured
 * that an id missing from a restated enum is a **`500 INTERNAL`** on the read — and on the
 * production deploy's `409` it is worse, because `mapError` drops a checklist that does not
 * parse rather than throw, so the refusal would arrive with no checklist at all. One list
 * leaves the generated `schema.d.ts` as the only copy, and `pnpm contract:generate` owns it.
 */
export const LAUNCH_ITEM_IDS = [
  'domain',
  'iam-registration',
  'privacy-assessment',
  'rehearsal',
  'scans',
  'admin-approval',
  'load-rehearsal',
  'code-review',
] as const

export type LaunchItemId = (typeof LAUNCH_ITEM_IDS)[number]

export interface LaunchItem {
  id: LaunchItemId
  title: string
  owner: string
  blocking: boolean
  state: 'met' | 'unmet' | 'not_built'
  /** Why this state — for a faculty member, not a log line (§14). */
  why: string
  /**
   * For `not_built`: the plan that builds it (roadmap, Phase 2) — or, for `code-review`, the
   * tracked hardening item, which is deliberately NOT a plan (R4e).
   */
  builtBy?: string
}

export interface LaunchReadinessView {
  projectId: string
  /** True only when every blocking item is met — so false throughout Phase 1, honestly. */
  ready: boolean
  /** The release a launch would promote: the one serving staging (§13 — promotion never rebuilds). */
  candidateReleaseId: string | null
  items: LaunchItem[]
}

/**
 * §13's first-launch checklist, COMPUTED FROM WHAT EXISTS and never stored (P5a Decision
 * 35). An item whose entity does not exist yet says so, and names the plan that builds
 * it, rather than inventing a status — the constant this replaces stamped four items
 * "deliveredBy: P4" that P4 did not deliver.
 *
 * **IT IS NO LONGER READ-ONLY.** 1c shipped this view alone and §17 put the gate in Phase
 * 2; P6a Task 7 built it, and `assertLaunchable` in `gate.ts` throws on this exact value.
 * There is ONE computation and two callers, so what a person reads and what refuses them
 * cannot disagree (Decision 2) — which means **an item added here changes what production
 * deploys are possible**, not just what a screen shows.
 */
export async function computeLaunchReadiness(
  db: Db,
  projectId: string,
): Promise<LaunchReadinessView> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  const [staging] = await db
    .select()
    .from(environments)
    .where(eq(environments.projectId, projectId))
    .then((rows) => rows.filter((e) => e.kind === 'staging'))
  const serving = staging === undefined ? undefined : await servingInstanceOf(db, staging)
  const [candidate] =
    serving === undefined
      ? []
      : await db
          .select({ release: releases, build: builds })
          .from(releases)
          .innerJoin(builds, eq(releases.buildId, builds.id))
          .where(eq(releases.id, serving.releaseId))
  const provider = (candidate?.release.resolvedConfig as ResolvedConfigSet | undefined)
    ?.production.auth.provider
  // No candidate means no answer yet, and the conservative answer is that it will need
  // one: an IAM registration has a multi-week lead time, so reporting "not needed" on no
  // evidence is the expensive direction to be wrong in.
  const usesCwl = provider !== 'none'
  const audience = project?.audience as StoredAudience | null | undefined

  const items: LaunchItem[] = [
    {
      id: 'domain',
      title: 'Where the app will live',
      owner: 'project owner',
      blocking: true,
      state: 'met',
      why: 'Canonical hostname only — no action. A custom domain is Phase 2 (§23), and for a CWL app it must be chosen before IAM registration, because the registration carries it.',
    },
    await iamItem(db, projectId, usesCwl),
    await piaItem(db, projectId),
    {
      id: 'rehearsal',
      title: 'Pre-production rehearsal passed',
      owner: 'Manifest',
      blocking: true,
      state: 'not_built',
      builtBy: 'P6',
      why: 'A rehearsal against production-shaped identity before launch (D21). It is built with production environments.',
    },
    scansItem(
      candidate?.build.scan as ScanSummary | null | undefined,
      candidate !== undefined,
    ),
    await approvalItem(db, candidate),
    ...(audience?.scale === 'large_course' || audience?.scale === 'public'
      ? [
          {
            id: 'load-rehearsal' as const,
            title: 'Load rehearsal passed',
            owner: 'Manifest',
            blocking: true,
            state: 'not_built' as const,
            builtBy: 'P9',
            why: `An app for ${audience.scale === 'public' ? 'the public' : 'a large course'} is rehearsed against staging with production-shaped capacity before launch (§24).`,
          },
        ]
      : []),
    // LAST, after every blocking item — including `load-rehearsal`, which is conditional —
    // so the checklist reads as the things that gate production followed by the one that
    // does not, and no blocking item's position depends on whether this one is present.
    // A COPY, so no caller that edits the view it was handed can edit every later view.
    { ...CODE_REVIEW_ITEM },
  ]

  return {
    projectId,
    ready: readyOf(items),
    candidateReleaseId: candidate?.release.id ?? null,
    items,
  }
}

/**
 * §13 and D9.1: production is reachable when EVERY BLOCKING item is met, and a
 * non-blocking item is read by a person and ignored by the gate.
 *
 * **EXPORTED FOR ONE TEST, AND THAT TEST IS WHY IT IS A FUNCTION** (P6a Task 12). Decision
 * 13 says `readiness.test.ts` must show a project with every blocking item met is still
 * `ready` beside a `not_built` `code-review` — and no project this platform can build has
 * every blocking item met until Task 14 builds `rehearsal`. So the test takes the REAL items
 * `computeLaunchReadiness` produced, forces every item but `code-review` to `met`, and asks
 * THIS function — the derivation the view itself uses, not a copy of it.
 */
export function readyOf(items: readonly LaunchItem[]): boolean {
  return items.filter((i) => i.blocking).every((i) => i.state === 'met')
}

/**
 * R4's item (D33, §15, P6a Task 12): code safety has a SEAM and nothing behind it.
 *
 * **Static, and deliberately so.** Nothing reviews code, whatever the project, so this item
 * cannot say anything about one project that it does not say about every other — and an
 * item that read the approval's stored verdict would be reading `not_performed` back out of
 * a record the same sentence put there. When a real reviewer lands this becomes a function
 * of that reviewer's verdict on the candidate, and becomes blocking in the same change.
 */
const CODE_REVIEW_ITEM: LaunchItem = {
  id: 'code-review',
  title: 'Code reviewed for safety',
  owner: 'Manifest',
  /**
   * **`false`, AND THIS IS NOT A PREFERENCE** (D33, R4c). `ready` is derived from every
   * BLOCKING item being met, so a blocking item in state `not_built` would make production
   * unreachable for ever — the precise trap R1 exists to undo, reintroduced by accident. It
   * becomes blocking when a real implementation lands, and that is a one-field change by
   * design. `readiness.test.ts` asserts both directions.
   */
  blocking: false,
  state: 'not_built',
  builtBy: 'a tracked hardening item (SemgrepReviewer), not a plan',
  /**
   * §20's control-map row, word for word where it matters: the risk is STILL ACCEPTED, the
   * control is CONTAINMENT, and until an implementation lands NOTHING REVIEWS CODE. If this
   * sentence and that row can be read as saying different things, this sentence is wrong.
   */
  why: 'Nothing reviews the code the agent wrote. Manifest reviews manifest.yaml, not code (§13), and that risk is still accepted: the controls that make it tolerable are containment — default-deny egress, network isolation, least privilege and edge protections (§20). A reviewer interface exists with no implementation behind it (D33, §15), so this item does not block a launch.',
}

/**
 * §13's first blocking item, and the one R1 bought (P6a Task 7). Until this task it read
 * `not_built` / `builtBy: 'P8'` — *"Manifest does not track it yet"* — which stopped being
 * true the moment migration 0019 landed. Four states now, and every one of them is a fact
 * about a row an administrator recorded from what UBC IAM said:
 *
 *  - `met` when the app signs nobody in with CWL — there is nothing to register.
 *  - `met` when a recorded registration is `active`.
 *  - `unmet` when one exists and is not yet active, naming the state and the ticket, so
 *    the owner can chase it rather than wonder.
 *  - `unmet` when none exists at all — **NOT `not_built`**, which said "Manifest does not
 *    track this yet" and is now false.
 *
 * **`builtBy` is gone from this item**, and a reader who finds it again should treat that
 * as a regression: it names the plan that will build a thing, and this thing is built.
 */
async function iamItem(db: Db, projectId: string, usesCwl: boolean): Promise<LaunchItem> {
  const base = {
    id: 'iam-registration' as const,
    title: 'Registered with UBC IAM',
    blocking: true,
  }
  if (!usesCwl)
    return {
      ...base,
      owner: 'UBC IAM',
      state: 'met',
      why: 'This app does not sign people in with CWL, so it needs no IAM registration.',
    }
  const row = await getIamRegistration(db, projectId)
  const owner = 'UBC IAM, recorded by a platform administrator (§9)'
  const ticket = (ref: string | null) => (ref === null ? '' : ` (ticket ${ref})`)
  if (row === undefined)
    return {
      ...base,
      owner,
      state: 'unmet',
      why: 'Every production app that signs people in with CWL needs its own IAM registration (§9, C4), with a multi-week lead time. Nothing has been recorded for this project yet — an administrator records what UBC IAM said, with the ticket reference.',
    }
  if (row.state === 'active')
    return {
      ...base,
      owner,
      state: 'met',
      why: `Registered as ${row.entityId}, active${ticket(row.externalTicketRef)}, releasing ${row.registeredAttributes.length} attribute(s).`,
    }
  return {
    ...base,
    owner,
    state: 'unmet',
    why: `The registration is '${row.state}'${ticket(row.externalTicketRef)} and must be 'active' before a first production launch (§9).`,
  }
}

/**
 * §13's fifth blocking item, and the one Task 10 bought. Until this task it read
 * `not_built` / `builtBy: 'P6'` — *"approvals are built with production environments"* —
 * which stopped being true the moment `POST /v1/releases/{id}/approve` existed.
 *
 * Five states, each a fact about a row an administrator wrote:
 *
 *  - `unmet` when nothing is serving staging: there is no release to approve.
 *  - `unmet` when the candidate has never been decided on.
 *  - `unmet` when it was REJECTED, in the administrator's own words (D23.7).
 *  - `unmet` when it was approved and then REBUILT — Decision 11, in words.
 *  - `met` when a live approval binds the digest that would actually be deployed.
 *
 * **`builtBy` is gone from this item**, and a reader who finds it again should treat that
 * as a regression: it names the plan that will build a thing, and this thing is built.
 */
async function approvalItem(
  db: Db,
  candidate:
    | { release: typeof releases.$inferSelect; build: typeof builds.$inferSelect }
    | undefined,
): Promise<LaunchItem> {
  const base = {
    id: 'admin-approval' as const,
    title: 'Release approved by a platform administrator',
    owner: 'platform admin',
    blocking: true,
  }
  if (candidate === undefined)
    return {
      ...base,
      state: 'unmet',
      why: 'Nothing is serving in staging yet, so there is no release to approve. Production runs exactly what staging ran (§13).',
    }
  const approval = await latestApprovalFor(db, candidate.release.id)
  if (approval === undefined)
    return {
      ...base,
      state: 'unmet',
      why: 'An administrator approves the exact image digest, with step-up re-authentication (§13, §20). This release has not been reviewed yet.',
    }
  if (approval.decision === 'rejected')
    return {
      ...base,
      state: 'unmet',
      why: `An administrator did not approve this release: ${approval.reason}`,
    }
  if (!approvalCoversDigest(approval, candidate.build.imageDigest ?? ''))
    // DECISION 11, IN WORDS. It reads as a bug the first time somebody meets it, so the
    // checklist explains it rather than reverting to the generic unmet text.
    return {
      ...base,
      state: 'unmet',
      why: 'This release was rebuilt since it was approved, so the approval no longer covers what would be deployed — the approval binds an image digest (§13). Approve the new build.',
    }
  return {
    ...base,
    state: 'met',
    why: `Approved by an administrator on ${approval.decidedAt.toISOString().slice(0, 10)}, bound to image digest ${approval.imageDigest.slice(0, 19)}…`,
  }
}

/**
 * §13's second blocking item, the same shape over §9's three PIA states — and its `met`
 * case NAMES THE REVIEWER AND THE DATE, because this checklist is read by a faculty
 * member who wants to know *who* said yes and *when*, not that a boolean flipped.
 *
 * `approvedAt` is set when the record reaches `approved` and cleared when it leaves
 * (sitting 4's decision 4), so a date here is always a date this state was reached on.
 */
async function piaItem(db: Db, projectId: string): Promise<LaunchItem> {
  const base = {
    id: 'privacy-assessment' as const,
    title: 'Privacy Impact Assessment approved',
    owner: 'UBC Privacy Office, recorded by a platform administrator (§9)',
    blocking: true,
  }
  const row = await getPrivacyAssessment(db, projectId)
  const ticket = (ref: string | null) => (ref === null ? '' : ` (ticket ${ref})`)
  if (row === undefined)
    return {
      ...base,
      state: 'unmet',
      why: 'A Privacy Impact Assessment is required before a production launch (§9), with a multi-week lead time. Nothing has been recorded for this project yet — an administrator records what the UBC Privacy Office said, with the ticket reference.',
    }
  if (row.state === 'approved')
    return {
      ...base,
      state: 'met',
      why:
        `Approved by ${row.reviewer ?? 'the UBC Privacy Office'}` +
        `${row.approvedAt === null ? '' : ` on ${row.approvedAt.toISOString().slice(0, 10)}`}` +
        `${ticket(row.externalTicketRef)}.`,
    }
  return {
    ...base,
    state: 'unmet',
    why: `The assessment is '${row.state}'${ticket(row.externalTicketRef)} and must be 'approved' before a first production launch (§9).`,
  }
}

function scansItem(
  scan: ScanSummary | null | undefined,
  hasCandidate: boolean,
): LaunchItem {
  const base = {
    id: 'scans' as const,
    title: 'Dependency and secret scans clean',
    owner: 'Manifest',
    blocking: true,
  }
  if (!hasCandidate) {
    return {
      ...base,
      state: 'unmet',
      why: 'Nothing is serving in staging yet, so there is no release to launch. Deploy to staging first — production runs exactly what staging ran (§13).',
    }
  }
  if (scan === null || scan === undefined) {
    return {
      ...base,
      state: 'unmet',
      why: 'The release serving staging was built before scans were recorded. Build and deploy it again.',
    }
  }
  // ONE guard, not two. `stale` is `assessScan`'s own verdict and is read FIRST; the age
  // comparison behind it is a deliberate second opinion on a stored summary the platform
  // wrote, never a re-derivation that could disagree — a `||` rather than a second branch,
  // so removing this guard removes the whole check and both tests below go red. Null means
  // the scanner did not say how old its database was, `scanImage` reads that as stale, and
  // `null > 7` is false — so the coalesce, not a comparison against null (P5a Task 13).
  if (scan.stale || (scan.databaseAgeDays ?? Infinity) > STALENESS_THRESHOLD_DAYS) {
    const age =
      scan.databaseAgeDays === null
        ? 'of unknown age'
        : `${scan.databaseAgeDays} days old, more than ${STALENESS_THRESHOLD_DAYS}`
    return {
      ...base,
      state: 'unmet',
      why: `The release serving staging was scanned against a vulnerability database ${age}. A clean result from a stale database is not evidence (§12); rebuild once the database is refreshed.`,
    }
  }
  const unfixable = Object.values(scan.unfixable).reduce((a, b) => a + b, 0)
  // `baseImageKnown: false` means every finding was attributed to the app, so the base
  // image's own count is a zero nobody could have counted (§12, P5a Task 13).
  const attribution = scan.baseImageKnown
    ? ''
    : ' The base image could not be identified, so every finding is attributed to this build.'
  return {
    ...base,
    state: 'met',
    why: `Its secret and lockfile gates passed and no finding it introduced has a published fix. ${unfixable} finding(s) with no published fix are recorded on the release (§12).${attribution}`,
  }
}
