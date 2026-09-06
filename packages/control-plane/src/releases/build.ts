import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { builds } from '../db/index.js'
import type { Driver } from '../runtime/index.js'

export type Build = typeof builds.$inferSelect

export interface StartBuildInput {
  projectId: string
  projectSlug: string
  appSpecId: string
  commitSha: string
  blueprintRef: string
  repoUrl: string
}

/**
 * Records a build, asks the driver for an image, and records the outcome. A failed
 * build is a recorded row with `status: 'failed'` and no digest — not an exception —
 * because a faculty member needs to see the failure and its logs (§14).
 */
export async function startBuild(db: Db, driver: Driver, input: StartBuildInput): Promise<Build> {
  const [created] = await db
    .insert(builds)
    .values({
      projectId: input.projectId,
      commitSha: input.commitSha,
      appSpecId: input.appSpecId,
      status: 'running',
    })
    .returning()
  if (!created) throw new Error('build insert returned no row')

  try {
    const image = await driver.buildImage(
      { repoPath: input.repoUrl, commitSha: input.commitSha },
      { blueprintRef: input.blueprintRef, projectSlug: input.projectSlug },
    )
    const [done] = await db
      .update(builds)
      .set({ status: 'succeeded', imageDigest: image.digest, logsRef: `build:${created.id}` })
      .where(eq(builds.id, created.id))
      .returning()
    return done!
  } catch (error) {
    const [failed] = await db
      .update(builds)
      .set({ status: 'failed', logsRef: `build:${created.id}` })
      .where(eq(builds.id, created.id))
      .returning()
    void error
    return failed!
  }
}

export async function getBuild(db: Db, buildId: string): Promise<Build | undefined> {
  const [build] = await db.select().from(builds).where(eq(builds.id, buildId))
  return build
}
