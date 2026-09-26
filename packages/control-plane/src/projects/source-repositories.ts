import { and, eq } from 'drizzle-orm'
import { projects, sourceRepositories, type Db } from '../db/index.js'
import {
  SourceError,
  type RepoRef,
  type RepositoryLink,
  type SourceDriver,
  type SourceProvider,
} from '../source/index.js'

/**
 * WHERE A PROJECT'S CODE LIVES, as the driver that created it recorded it (the D5 plan's
 * Decision 3, Task 8) — and, since Task 12, whether its `main` is protected there. One row per
 * project, written by `POST /v1/projects` from the LINK `createRepository` answered; every
 * project older than migration 0024 was backfilled `local`, the only driver there was, and
 * migration 0028 backfilled driver 1's `main_protected` true. `webUrl` is `null` for driver 1:
 * a laptop path is not an address, and publishing it would tell a client the host's
 * filesystem layout (Decision 15).
 */
export async function recordRepository(
  db: Db,
  projectId: string,
  link: RepositoryLink,
): Promise<void> {
  await db.insert(sourceRepositories).values({
    projectId,
    provider: link.provider,
    fullName: link.fullName,
    webUrl: link.webUrl,
    mainProtected: link.mainProtected,
    protectionDetail: link.protectionDetail,
  })
}

/** The link as a client reads it — from the row, which the CHECK holds to the two providers. */
export function linkOf(row: typeof sourceRepositories.$inferSelect): RepositoryLink {
  return {
    provider: row.provider as SourceProvider,
    fullName: row.fullName,
    webUrl: row.webUrl,
    mainProtected: row.mainProtected,
    protectionDetail: row.protectionDetail,
  }
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

/**
 * The project whose repository the PROVIDER calls `fullName` — the name GitHub answered at
 * creation and names in every delivery (Task 9's receiver). Matched on the stored name, never
 * rebuilt from the configured organisation: GitHub keeps an organisation's own capitals
 * (`Manifest-local-dev`), and a configuration written in lower case would miss them.
 */
export async function projectForRepository(
  db: Db,
  provider: SourceProvider,
  fullName: string,
): Promise<
  { id: string; slug: string; quota: unknown; blueprintRef: string } | undefined
> {
  const [row] = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      quota: projects.quota,
      // A push is validated against the project's pin (the authoring API plan's Task 7).
      blueprintRef: projects.blueprintRef,
    })
    .from(sourceRepositories)
    .innerJoin(projects, eq(projects.id, sourceRepositories.projectId))
    .where(
      and(
        eq(sourceRepositories.provider, provider),
        eq(sourceRepositories.fullName, fullName),
      ),
    )
  return row
}
