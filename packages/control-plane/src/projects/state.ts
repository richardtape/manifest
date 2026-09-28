import { eq } from 'drizzle-orm'
import { projects, type Db } from '../db/index.js'

/**
 * §11's *Ending an app* (Spec action 3, applied 2026-09-27; the front-end enablement plan's Tasks
 * 11–12, Decisions 27–31): what `projects.state` may be, and the refusals that follow from it.
 */
export type ProjectState = 'active' | 'archived'

/** Task 12's delete adds `PROJECT_LAUNCHED_NOT_DELETABLE` with its first thrower. */
export type ProjectStateCode = 'PROJECT_ARCHIVED' | 'PROJECT_TEARDOWN_INCOMPLETE'

/**
 * A project's STATE refused the request — not who asked (that is `AuthorizationError`). Each
 * code's status is the registry's (`api/error-codes.ts`): `PROJECT_ARCHIVED` 409, a state a person
 * resolves by restoring; `PROJECT_TEARDOWN_INCOMPLETE` 500, an archive that stopped at a step and
 * finishes on the same request retried or at the next boot.
 */
export class ProjectStateError extends Error {
  constructor(
    readonly code: ProjectStateCode,
    message: string,
  ) {
    super(message)
    this.name = 'ProjectStateError'
  }
}

/** The refusal every change to an archived project meets, worded once. */
export function archivedRefusal(projectId: string): ProjectStateError {
  return new ProjectStateError(
    'PROJECT_ARCHIVED',
    `project '${projectId}' is archived — switched off by its owner (§11) — so it can be read and restored, and nothing else`,
  )
}

/**
 * HOLDS THE PROJECT ROW for the rest of the caller's transaction, and refuses one that is not
 * active — the front-end enablement plan's Task 11, carrying sitting 7's I1 to archive. A start that
 * mints something (an agent key, a delegated token) authorizes when the request ARRIVES and commits
 * hundreds of milliseconds later; an archive landing in between finds nothing to end or revoke, and
 * the start then commits a live credential for a switched-off project. `FOR SHARE` conflicts with
 * the archive's `UPDATE … SET state`, so either the archive waits for this commit — and its teardown
 * ends or revokes what it made — or it committed first, is seen here, and the start is refused.
 *
 * An insert's own foreign key takes `FOR KEY SHARE`, which an `UPDATE` of a non-key column does NOT
 * wait for — which is why this read exists rather than relying on the reference.
 */
export async function holdActiveProject(
  tx: Pick<Db, 'select'>,
  projectId: string,
): Promise<void> {
  const [held] = await tx
    .select({ state: projects.state })
    .from(projects)
    .where(eq(projects.id, projectId))
    .for('share')
  if (held !== undefined && held.state !== 'active') throw archivedRefusal(projectId)
}
