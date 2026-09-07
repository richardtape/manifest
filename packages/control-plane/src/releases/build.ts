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
  /**
   * A FILESYSTEM PATH to the bare repository, not the `file://` URL a builder is
   * handed. `buildImage` gives it to `git --git-dir=`, which rejects a URL with
   * `fatal: not a git repository`. It was named `repoUrl` and the delivery route
   * built one by hand — see the note at that call site.
   */
  repoPath: string
}

/**
 * Records a build, asks the driver for an image, and records the outcome. A failed
 * build is a recorded row with `status: 'failed'` and no digest — not an exception —
 * because a faculty member needs to see the failure and its logs (§14).
 */
export async function startBuild(
  db: Db,
  driver: Driver,
  input: StartBuildInput,
): Promise<Build> {
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
      { repoPath: input.repoPath, commitSha: input.commitSha },
      { blueprintRef: input.blueprintRef, projectSlug: input.projectSlug },
    )
    const [done] = await db
      .update(builds)
      .set({
        status: 'succeeded',
        imageDigest: image.digest,
        // BOTH HALVES. A digest with a re-derived repository is not the image
        // that was built — see the column's own note.
        imageRepository: image.repository,
        logsRef: `build:${created.id}`,
      })
      .where(eq(builds.id, created.id))
      .returning()
    return done!
  } catch (error) {
    // THE REASON IS THE POINT. This used to be `void error` — the row said
    // `failed` and carried nothing else, so the person who has to fix the build
    // had no way to learn what went wrong short of re-running it outside the
    // platform. §14 makes a failure a row so that it can be SEEN, and a row that
    // says only "no" is not a failure anybody can act on.
    //
    // The message, not the stack: these errors are `BuildGateError`,
    // `EngineError` and `BuildContextError`, whose messages are written for the
    // app's author. `hint` is appended when the error carries one.
    const e = error as { message?: string; hint?: string; code?: string }
    const message = [
      e.code === undefined ? '' : `${e.code}: `,
      e.message ?? String(error),
      e.hint === undefined ? '' : ` — ${e.hint}`,
    ].join('')
    const [failed] = await db
      .update(builds)
      .set({ status: 'failed', logsRef: `build:${created.id}`, error: message })
      .where(eq(builds.id, created.id))
      .returning()
    return failed!
  }
}

export async function getBuild(db: Db, buildId: string): Promise<Build | undefined> {
  const [build] = await db.select().from(builds).where(eq(builds.id, buildId))
  return build
}
