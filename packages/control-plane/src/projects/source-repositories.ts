import { and, eq, ne } from 'drizzle-orm'
import { projects, sourceRepositories, type Db } from '../db/index.js'
import {
  SourceError,
  type PublishedRepositoryLink,
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
    // Which GitHub (the launch path plan's Task 2) — null for driver 1.
    apiHost: link.apiHost,
  })
}

/**
 * The link as a client reads it — from the row, which the CHECK holds to the two providers.
 * **`api_host` is not in it** (the launch path plan's Task 2): which GitHub is the platform's own
 * bookkeeping, and `Project.repository` is built from this.
 */
export function linkOf(
  row: typeof sourceRepositories.$inferSelect,
): PublishedRepositoryLink {
  return {
    provider: row.provider as SourceProvider,
    fullName: row.fullName,
    webUrl: row.webUrl,
    mainProtected: row.mainProtected,
    protectionDetail: row.protectionDetail,
  }
}

/**
 * WHY THE RUNNING DRIVER DID NOT MAKE THIS REPOSITORY, or null when it did — the ONE statement of
 * the rule, read by `repositoryOf` (which refuses with it) and `projectViews` (which then reads no
 * visibility). The provider first (Decision 3); then, when BOTH hosts are known, the GitHub (the
 * launch path plan's Task 2): a row older than `api_host` is answered by any GitHub, as before.
 */
export function notMadeByRunning(
  row: { provider: string; apiHost: string | null },
  running: { name: SourceProvider; apiHost: string | null },
): string | null {
  if (row.provider !== running.name) {
    return `was made by the ${row.provider} driver, and this control plane runs the ${running.name} driver; restart it on the ${row.provider} driver to work on this project`
  }
  if (
    row.apiHost !== null &&
    running.apiHost !== null &&
    row.apiHost !== running.apiHost
  ) {
    return `is on the GitHub at ${row.apiHost}, and this control plane runs against the GitHub at ${running.apiHost}; restart it with MANIFEST_GITHUB_API_URL naming ${row.apiHost} to work on this project`
  }
  return null
}

/**
 * The project's repository, IF the running driver made it (Decision 3) — the ONE way the API
 * and the approval path name a project's repository. A GitHub-mode control plane must never
 * treat a driver-1 bare repository as a mirror: it would push a laptop repository's history to
 * GitHub, or fetch over it. **Nor a project another GitHub made** (the launch path plan's Task 2):
 * after a restart onto the real App, a fake-made project's token mint would answer `422`, which a
 * delete reads as GONE — removing the mirror and leaving the fake's repository (*Read this first*
 * 14, read from the code). Refused here, before any reference is made.
 *
 * **No row is a platform defect**, not a client's: a plain `Error`, a `500` and an operator
 * line naming the project.
 */
export async function repositoryOf(
  deps: { db: Db; source: Pick<SourceDriver, 'identity' | 'repositoryFor'> },
  project: { id: string; slug: string },
): Promise<RepoRef> {
  const [row] = await deps.db
    .select({
      provider: sourceRepositories.provider,
      apiHost: sourceRepositories.apiHost,
    })
    .from(sourceRepositories)
    .where(eq(sourceRepositories.projectId, project.id))
  if (row === undefined) {
    throw new Error(
      `project '${project.slug}' (${project.id}) has no source_repositories row; every project has one since migration 0024`,
    )
  }
  const why = notMadeByRunning(row, deps.source.identity())
  if (why !== null) {
    throw new SourceError(
      'SOURCE_PROVIDER_MISMATCH',
      `${project.slug}'s repository ${why}`,
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
        // A deleted project's repository is gone, and its name may be a NEW project's (Task 12).
        ne(projects.state, 'deleted'),
      ),
    )
  return row
}
