import { and, eq, ne, sql } from 'drizzle-orm'
import {
  approvalRequests,
  builds,
  environments,
  projects,
  releases,
  type Db,
} from '../db/index.js'
import { servingInstanceOf } from '../projects/index.js'
import type { ResolvedConfigSet } from '../releases/index.js'
import type { ManifestSpec } from '../spec/index.js'

export interface LaunchCandidate {
  release: typeof releases.$inferSelect
  build: typeof builds.$inferSelect
  /** The PRODUCTION resolution frozen into this release — what a launch would actually run. */
  auth: ManifestSpec['auth']
}

/**
 * THE RELEASE A FIRST LAUNCH WOULD PROMOTE: the one serving STAGING.
 *
 * §13: *"Production runs exactly what staging ran"* and *"promotion never rebuilds"*, so
 * the candidate is not the newest release and not the newest build — it is whatever is
 * serving staging right now. Nothing else is a thing a person has actually seen work.
 *
 * **ITS OWN MODULE SINCE P6a TASK 14**, and that is a cycle rather than tidiness:
 * `readiness.ts` needs the candidate to compute five of its items, `rehearsal.ts` needs
 * the same candidate to know what to deploy, and `readiness.ts` imports `rehearsal.ts` for
 * the item. Two modules needing one derivation is what a third module is for; a copy in
 * either would be the second source of truth this project has paid for repeatedly.
 */
export async function candidateFor(
  db: Db,
  projectId: string,
): Promise<LaunchCandidate | undefined> {
  const [staging] = await db
    .select()
    .from(environments)
    .where(eq(environments.projectId, projectId))
    .then((rows) => rows.filter((e) => e.kind === 'staging'))
  const serving = staging === undefined ? undefined : await servingInstanceOf(db, staging)
  // **HEALTHY, OR IT IS NOT SERVING** (P6b Task 6). `servingInstanceOf` falls back to the
  // environment's NEWEST instance of ANY state when no Route record exists — its rule for
  // apps deployed before P4c — so a staging whose only deploy FAILED answered with the
  // failed release, and the checklist offered production a release that never served
  // staging (measured: `candidateReleaseId` was the failed release). Nothing in Phase 1
  // hibernates a staging instance, so `healthy` is the whole of "serving".
  if (serving === undefined || serving.state !== 'healthy') return undefined
  const [row] = await db
    .select({ release: releases, build: builds })
    .from(releases)
    .innerJoin(builds, eq(releases.buildId, builds.id))
    .where(eq(releases.id, serving.releaseId))
  if (row === undefined) return undefined
  const auth = (row.release.resolvedConfig as ResolvedConfigSet).production.auth
  return { release: row.release, build: row.build, auth }
}

export type ApprovalRequestRow = typeof approvalRequests.$inferSelect

/**
 * NO DECISION RECORDED FOR THE REQUEST'S RELEASE SINCE THE REQUEST WAS MADE (§6's `ApprovalRequest`:
 * *"answered by an `Approval`, and closes when one is recorded"*) — an approval or a rejection, at or
 * after `created_at`. One statement, read by `openRequestFor` and by the administrators' queue.
 */
export const undecidedSince = sql`NOT EXISTS (SELECT 1 FROM approvals a WHERE a.release_id = ${approvalRequests.releaseId} AND a.decided_at >= ${approvalRequests.createdAt})`

/**
 * THE OPEN SIGN-OFF REQUEST FOR A PROJECT — the one an administrator still has to answer (Spec action
 * 5; the launch path plan's Task 12). DERIVED, never stored: the request for the release serving
 * staging NOW, with no decision recorded since it was made. A request whose release stopped being the
 * candidate is closed, and stays so — another release now serves staging, and that is the one to ask
 * about. At most one per project, since one release is the candidate.
 *
 * Here, beside `candidateFor`, rather than in `requests.ts`: the checklist (`readiness.ts`) and the
 * queue read it, and `requestApproval` reads the checklist — so a `requests.ts` holding both would be
 * an import cycle. `candidate` is the caller's when it already holds it; absent, it is derived here.
 */
export async function openRequestFor(
  db: Db,
  projectId: string,
  candidate?: Pick<LaunchCandidate, 'release'> | null,
): Promise<ApprovalRequestRow | undefined> {
  const current = candidate === undefined ? await candidateFor(db, projectId) : candidate
  if (current == null) return undefined
  const [row] = await db
    .select({ request: approvalRequests })
    .from(approvalRequests)
    .innerJoin(projects, eq(approvalRequests.projectId, projects.id))
    .where(
      and(
        eq(approvalRequests.projectId, projectId),
        ne(projects.state, 'deleted'),
        // STILL THE CANDIDATE: the release serving staging now.
        eq(approvalRequests.releaseId, current.release.id),
        undecidedSince,
      ),
    )
    .limit(1)
  return row?.request
}
