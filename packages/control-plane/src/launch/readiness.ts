import { eq } from 'drizzle-orm'
import { STALENESS_THRESHOLD_DAYS } from '../build/index.js'
import { builds, environments, projects, releases, type Db } from '../db/index.js'
import { servingInstanceOf, type StoredAudience } from '../projects/index.js'
import type { ResolvedConfigSet } from '../releases/index.js'
import type { ScanSummary } from '../runtime/index.js'

export type LaunchItemId =
  | 'domain'
  | 'iam-registration'
  | 'privacy-assessment'
  | 'rehearsal'
  | 'scans'
  | 'admin-approval'
  | 'load-rehearsal'

export interface LaunchItem {
  id: LaunchItemId
  title: string
  owner: string
  blocking: boolean
  state: 'met' | 'unmet' | 'not_built'
  /** Why this state — for a faculty member, not a log line (§14). */
  why: string
  /** For `not_built`: the plan that builds it (roadmap, Phase 2). */
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
 * 35). §17 splits it: 1c ships this read-only view; Phase 2 ships the gate that blocks on
 * it. An item whose entity does not exist yet says so, and names the plan that builds it,
 * rather than inventing a status — the constant this replaces stamped four items
 * "deliveredBy: P4" that P4 did not deliver.
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
    usesCwl
      ? {
          id: 'iam-registration',
          title: 'Registered with UBC IAM',
          owner: 'UBC IAM, from a package Manifest generates',
          blocking: true,
          state: 'not_built',
          builtBy: 'P8',
          why: 'Every production app that signs people in with CWL needs its own IAM registration (§9, C4), with a multi-week lead time. Manifest does not track it yet.',
        }
      : {
          id: 'iam-registration',
          title: 'Registered with UBC IAM',
          owner: 'UBC IAM',
          blocking: true,
          state: 'met',
          why: 'This app does not sign people in with CWL, so it needs no IAM registration.',
        },
    {
      id: 'privacy-assessment',
      title: 'Privacy Impact Assessment approved',
      owner: 'UBC Privacy Office, from a draft Manifest generates',
      blocking: true,
      state: 'not_built',
      builtBy: 'P8',
      why: 'A PIA is required before a production launch (§9), with a multi-week lead time. Manifest does not track it yet.',
    },
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
    {
      id: 'admin-approval',
      title: 'Release approved by a platform administrator',
      owner: 'platform admin',
      blocking: true,
      state: 'not_built',
      builtBy: 'P6',
      why: 'An administrator approves the exact image digest, with step-up re-authentication (§13). Approvals are built with production environments.',
    },
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
  ]

  return {
    projectId,
    ready: items.filter((i) => i.blocking).every((i) => i.state === 'met'),
    candidateReleaseId: candidate?.release.id ?? null,
    items,
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
