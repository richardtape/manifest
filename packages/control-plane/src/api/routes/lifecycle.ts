import { z } from 'zod/v4'
import {
  assertCapability,
  assertStepUp,
  AuthorizationError,
  projectViews,
} from '../../projects/index.js'
import {
  archiveProject,
  deleteProject,
  restoreProject,
  type DeleteDeps,
  type LifecycleDeps,
} from '../../releases/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { EmptyRequest, PATH } from '../contract/schemas.js'
import { DeletedProject, Project, toProject } from '../representations/projects.js'
import type { ServerDeps } from '../server.js'

const ProjectParams = z.strictObject({ projectId: PATH.projectId })

/** What `releases/lifecycle.ts` needs, from the server's own — one retire's drain bound. */
export function lifecycleDeps(deps: ServerDeps): LifecycleDeps {
  return {
    db: deps.db,
    bus: deps.bus,
    streams: deps.streams,
    driver: deps.driver,
    llm: deps.llm,
    sso: deps.sso,
    ai: deps.ai,
    appSecrets: deps.appSecrets,
    drainMs: deps.config.drainTimeoutMs,
  }
}

/** …and a delete's: the archive's, and the source driver that holds the repository. */
export function deleteDeps(deps: ServerDeps): DeleteDeps {
  return { ...lifecycleDeps(deps), source: deps.source }
}

/** The project as it now is — archived or active — through the one representation. */
async function answer(deps: ServerDeps, projectId: string) {
  const [view] = await projectViews(deps, [projectId])
  if (view === undefined)
    throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)
  return toProject(view)
}

/** A real answer, shortened: `archiveProject`'s, from `api/lifecycle.test.ts`. */
const ARCHIVED_EXAMPLE = {
  id: '77811340-0c79-4c30-a00f-b87e8460b6cf',
  slug: 'chem-labs',
  name: 'CHEM 121 — Lab notebook',
  blueprint: 'fixture-node@1',
  starter: null,
  owner: { id: '40baf394-7897-4cbb-89d6-7df27e51626d', displayName: 'Bio Prof' },
  audience: {
    scale: 'class' as const,
    burst: 'synchronised' as const,
    justification: null,
    setBy: '40baf394-7897-4cbb-89d6-7df27e51626d',
    setAt: '2026-09-26T21:49:02.609Z',
  },
  createdAt: '2026-09-26T21:49:02.611Z',
  launchedAt: null,
  state: 'archived' as const,
  archivedAt: '2026-12-18T17:02:44.120Z',
  repository: {
    provider: 'local' as const,
    fullName: 'chem-labs',
    webUrl: null,
    mainProtected: true,
    protectionDetail: null,
    visibility: null,
  },
}

/**
 * §11's *Ending an app* — archive and restore (Spec action 3, applied 2026-09-27; the front-end
 * enablement plan's Task 11, Decisions 27–30), and delete (Task 12, Decision 31).
 *
 * **PERSON-ONLY (D24), AND ARCHIVE AND DELETE STEP UP (§20).** All three routes are `credential: 'session'`, so a
 * token is refused `TOKEN_CREDENTIAL_REFUSED` before the handler runs; `project:delete` is in
 * `PERSON_ONLY` besides, so a token holding it is refused centrally too — two layers, two codes.
 * Archive takes an app away from its students, so it asks for step-up AFTER the capability (the
 * order every step-up route keeps); restore takes nothing from anyone and does not.
 *
 * **SYNCHRONOUS — D23.9's second exception, as Spec action 3 wrote it**: each answers once its
 * names are switched off and its instances retired, bounded by the drain.
 */
export const lifecycleRoutes = [
  defineRoute({
    operationId: 'archiveProject',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/archive',
    tag: 'projects',
    summary: 'Switch a project off (archive it)',
    description:
      'Switches the app off for everyone, and keeps it (§11). The project is marked archived first, so nothing new starts; then its agent sessions end, its delegated tokens are revoked — any event stream one holds open closing `4401`, while a person’s stays open, because an archived project can still be read — its pending questions expire, each of its names answers a page saying the app has been switched off by its owner (`410`), every instance is retired after its usual drain, its backing services stop keeping their data, and its sandbox and staging sign-on registrations are removed. Its code, data, secrets and records are kept. Answers once all of that is done — seconds, bounded by the drain. A step that fails answers `500 PROJECT_TEARDOWN_INCOMPLETE` with the project left archived: retrying the same request continues where it stopped, and so does the control plane’s next boot. Archiving an archived project answers it as it is. The owner’s or a platform administrator’s, in their own session with a recent second sign-in (step-up); never a delegated token’s. Publishes `project.archived`.',
    params: ProjectParams,
    query: NO_QUERY,
    body: EmptyRequest,
    success: {
      status: 200,
      description: 'The project, archived — `state` and `archivedAt`.',
      schema: Project,
    },
    capability: 'project:delete',
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'STEP_UP_REQUIRED',
      'PROJECT_TEARDOWN_INCOMPLETE',
    ],
    examples: { request: {}, response: ARCHIVED_EXAMPLE },
    handler: async ({ deps, request, params }) => {
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'project:delete')
      assertStepUp(actor, 'project:delete')
      await archiveProject(lifecycleDeps(deps), { projectId: params.projectId, actor })
      return answer(deps, params.projectId)
    },
  }),
  defineRoute({
    operationId: 'restoreProject',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/restore',
    tag: 'projects',
    summary: 'Restore a switched-off project',
    description:
      'Makes an archived project an ordinary one again (§11) — and starts nothing. Its names keep answering the switched-off page until its next deploy, which brings the app back on its kept data and signs it up for sign-on again. Its delegated tokens stay revoked: mint new ones. Restoring an active project answers it as it is. The owner’s or a platform administrator’s, in their own session; no step-up, because bringing an app back takes nothing from anyone. Publishes `project.restored`.',
    params: ProjectParams,
    query: NO_QUERY,
    body: EmptyRequest,
    success: {
      status: 200,
      description: 'The project, active again.',
      schema: Project,
    },
    capability: 'project:delete',
    errors: ['NOT_FOUND', 'FORBIDDEN', 'TOKEN_CREDENTIAL_REFUSED'],
    examples: {
      request: {},
      response: { ...ARCHIVED_EXAMPLE, state: 'active' as const },
    },
    handler: async ({ deps, request, params }) => {
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'project:delete')
      await restoreProject(lifecycleDeps(deps), { projectId: params.projectId, actor })
      return answer(deps, params.projectId)
    },
  }),
  defineRoute({
    operationId: 'deleteProject',
    credential: 'session',
    method: 'DELETE',
    path: '/v1/projects/{projectId}',
    tag: 'projects',
    summary: 'Delete a project that never launched',
    description:
      'Deletes the project for good (§11) — only one that has never been to production. It is switched off first, exactly as `archiveProject` does, and then its repository, every data volume, every secret and its model budgets are destroyed and its names released: each answers nothing of this project’s. Its record and its audit trail remain, and its slug is free for another project to take. From then on every route answers it `404`, and every event stream still open on it closes `4404`. A launched project is refused `409 PROJECT_LAUNCHED_NOT_DELETABLE` — its data is disposed of under its retention period and UBC’s sunset procedure, and its production name stays held; archive it instead. (A launch that completes while the delete is starting is refused the same way, AFTER the app has been switched off: it is left archived, with everything kept.) A project whose repository another source driver made is refused `409 SOURCE_PROVIDER_MISMATCH` before anything is touched. A step that fails answers `500 PROJECT_TEARDOWN_INCOMPLETE` with the project left ARCHIVED: send the same request again to finish the delete. The control plane’s next boot only finishes switching it off, keeping whatever data is left — and restoring it instead gives back a project that may have lost its code or data, so finish the delete. Answers once all of that is done — seconds, bounded by the drain. The owner’s or a platform administrator’s, in their own session with a recent second sign-in (step-up); never a delegated token’s. Publishes `project.archived` (if it was active), then `project.deleted`.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description:
        'What remains of the project: its id, its now-free slug, and when it was deleted.',
      schema: DeletedProject,
    },
    capability: 'project:delete',
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'STEP_UP_REQUIRED',
      'PROJECT_LAUNCHED_NOT_DELETABLE',
      'SOURCE_PROVIDER_MISMATCH',
      'PROJECT_TEARDOWN_INCOMPLETE',
    ],
    examples: {
      // A real answer, from `api/lifecycle.test.ts`.
      response: {
        id: '77811340-0c79-4c30-a00f-b87e8460b6cf',
        slug: 'chem-labs',
        state: 'deleted' as const,
        deletedAt: '2026-12-18T17:04:12.518Z',
      },
    },
    handler: async ({ deps, request, params }) => {
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'project:delete')
      assertStepUp(actor, 'project:delete')
      const tombstone = await deleteProject(deleteDeps(deps), {
        projectId: params.projectId,
        actor,
      })
      return {
        id: tombstone.id,
        slug: tombstone.slug,
        state: 'deleted' as const,
        deletedAt: tombstone.deletedAt.toISOString(),
      }
    },
  }),
]
