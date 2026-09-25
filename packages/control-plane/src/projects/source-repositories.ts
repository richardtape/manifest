import { eq } from 'drizzle-orm'
import { sourceRepositories, type Db } from '../db/index.js'
import {
  SourceError,
  type RepoRef,
  type SourceDriver,
  type SourceProvider,
} from '../source/index.js'

/**
 * WHERE A PROJECT'S CODE LIVES, as the driver that created it recorded it (the D5 plan's
 * Decision 3, Task 8). One row per project, written by `POST /v1/projects` after the
 * repository exists; every project older than migration 0024 was backfilled `local`, the
 * only driver there was. `webUrl` is `null` for driver 1: a laptop path is not an address,
 * and publishing it would tell a client the host's filesystem layout (Decision 15).
 */
export interface StoredRepository {
  provider: SourceProvider
  fullName: string
  webUrl: string | null
}

export async function recordRepository(
  db: Db,
  projectId: string,
  r: StoredRepository,
): Promise<void> {
  await db.insert(sourceRepositories).values({
    projectId,
    provider: r.provider,
    fullName: r.fullName,
    webUrl: r.webUrl,
  })
}

/**
 * The project's repository, IF the running driver made it (Decision 3) — the ONE way the API
 * and the approval path name a project's repository. A GitHub-mode control plane must never
 * treat a driver-1 bare repository as a mirror: it would push a laptop repository's history to
 * GitHub, or fetch over it.
 *
 * **No row is a platform defect**, not a client's: a plain `Error`, a `500` and an operator
 * line naming the project.
 */
export async function repositoryOf(
  deps: { db: Db; source: Pick<SourceDriver, 'name' | 'repositoryFor'> },
  project: { id: string; slug: string },
): Promise<RepoRef> {
  const [row] = await deps.db
    .select({ provider: sourceRepositories.provider })
    .from(sourceRepositories)
    .where(eq(sourceRepositories.projectId, project.id))
  if (row === undefined) {
    throw new Error(
      `project '${project.slug}' (${project.id}) has no source_repositories row; every project has one since migration 0024`,
    )
  }
  if (row.provider !== deps.source.name) {
    throw new SourceError(
      'SOURCE_PROVIDER_MISMATCH',
      `${project.slug}'s repository was made by the ${row.provider} driver, and this control plane runs the ${deps.source.name} driver; restart it on the ${row.provider} driver to work on this project`,
    )
  }
  return deps.source.repositoryFor(project.slug)
}
