import { eq } from 'drizzle-orm'
import { builds, environments, releases, type Db } from '../db/index.js'
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
  if (serving === undefined) return undefined
  const [row] = await db
    .select({ release: releases, build: builds })
    .from(releases)
    .innerJoin(builds, eq(releases.buildId, builds.id))
    .where(eq(releases.id, serving.releaseId))
  if (row === undefined) return undefined
  const auth = (row.release.resolvedConfig as ResolvedConfigSet).production.auth
  return { release: row.release, build: row.build, auth }
}
