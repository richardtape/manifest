import { desc, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { checkBlueprintCompatibility } from '../../blueprints/index.js'
import { appSpecs, builds, projects, type Db } from '../../db/index.js'
import { readBuildLog } from '../../observability/index.js'
import { assertCapability, AuthorizationError, type Actor } from '../../projects/index.js'
import { getBuild } from '../../releases/index.js'
import type { ManifestSpec } from '../../spec/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { BadRequestError, SpecInvalidError } from '../errors.js'
import {
  Build,
  BuildList,
  BuildLog,
  StartBuildRequest,
  toBuild,
  toBuildLog,
} from '../representations/builds.js'

const ProjectParams = z.strictObject({ projectId: z.uuid() })
const BuildParams = z.strictObject({ buildId: z.uuid() })

/**
 * A build a reader of its project may see. The project comes from the build ROW, never
 * from the request — P2 measured the alternative on `GET /builds/:id`: an IDOR answering
 * 200 — and a stranger gets the same 404 as a build that does not exist.
 */
async function buildReadableBy(db: Db, actor: Actor, buildId: string) {
  const build = await getBuild(db, buildId)
  if (build === undefined)
    throw new AuthorizationError('NOT_FOUND', `no build '${buildId}'`)
  await assertCapability(db, actor, build.projectId, 'project:read')
  return build
}

/** §22 step 4 and §14's build log (P5a Task 13): builds answer 202 and end on the stream (R6). */
export const buildRoutes = [
  defineRoute({
    operationId: 'startBuild',
    method: 'POST',
    path: '/v1/projects/{projectId}/builds',
    tag: 'delivery',
    summary: 'Build the project',
    description:
      '§22 step 4. Answers 202 at once with the build `running` (R6); its log lines arrive as `log` frames and its end as `build.succeeded` or `build.failed` on the project’s event stream. GET /v1/builds/{buildId} for the present state — a replayed Idempotency-Key answers the 202 as it was first sent.',
    params: ProjectParams,
    query: NO_QUERY,
    body: StartBuildRequest,
    success: { status: 202, description: 'The build, started.', schema: Build },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'SPEC_NOT_FOUND',
      'SPEC_INVALID',
      'BLUEPRINT_NOT_FOUND',
      'SOURCE_COMMIT_NOT_FOUND',
    ],
    handler: async ({ deps, actor, params, body }) => {
      await assertCapability(deps.db, actor, params.projectId, 'build:create')
      const [spec] = await deps.db
        .select()
        .from(appSpecs)
        .where(eq(appSpecs.projectId, params.projectId))
        .orderBy(desc(appSpecs.createdAt))
        .limit(1)
      if (spec === undefined) {
        throw new BadRequestError(
          'SPEC_NOT_FOUND',
          'this project has no validated spec yet',
        )
      }
      // SpecInvalidError, with the errors (P5a Task 5): one code, one status, from every
      // route that answers it — it was `400 SPEC_INVALID` here with no `details`.
      if (!spec.valid) throw new SpecInvalidError(spec.errors as never)
      const [project] = await deps.db
        .select()
        .from(projects)
        .where(eq(projects.id, params.projectId))
      if (project === undefined) {
        throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      }
      // D30/§25: the spec is checked against the blueprint it pins HERE rather than at
      // validation, because a blueprint's major version can move under a spec that has
      // not changed. This is `checkBlueprintCompatibility`'s call site.
      const descriptor = deps.blueprints.resolve(project.blueprintRef)
      if (descriptor === undefined) {
        throw new BadRequestError(
          'BLUEPRINT_NOT_FOUND',
          `this project pins '${project.blueprintRef}', which is no longer in the registry`,
        )
      }
      const incompatible = checkBlueprintCompatibility(
        spec.parsed as ManifestSpec,
        descriptor,
      )
      if (incompatible.length > 0) throw new SpecInvalidError(incompatible)
      const commitSha = body.commitSha ?? spec.commitSha
      // D5's seam (the D5 plan's Task 2): the builder is handed a LOCAL bare repository that
      // holds this commit, from the driver — never a path read off a reference. Driver 2
      // fetches it into its mirror first; driver 1 checks it is there. Either refuses
      // SOURCE_COMMIT_NOT_FOUND, here, rather than a build that fails later at `git archive`.
      const local = await deps.source.localGitDir(
        deps.source.repositoryFor(project.slug),
        commitSha,
      )
      const started = await deps.builds.start({
        projectId: params.projectId,
        projectSlug: project.slug,
        appSpecId: spec.id,
        commitSha,
        blueprintRef: project.blueprintRef,
        // A DIRECTORY, not a hand-built `file://` URL: the builder hands it to
        // `git --git-dir=`, which refuses a URL (`fatal: not a git repository`). Nothing
        // caught that while the export was a shell pipeline whose exit status was `tar`'s,
        // so the build ran on an EMPTY context and failed at the lockfile gate naming a file
        // the repository has. Both halves fixed 2026-09-07.
        repoPath: local.gitDir,
      })
      return toBuild(started)
    },
  }),
  defineRoute({
    operationId: 'getBuild',
    method: 'GET',
    path: '/v1/builds/{buildId}',
    tag: 'delivery',
    summary: 'A build',
    description:
      'Its present status, image digest, the reason a failed build failed, and its scan (§12).',
    params: BuildParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The build.', schema: Build },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) =>
      toBuild(await buildReadableBy(deps.db, actor, params.buildId)),
  }),
  defineRoute({
    operationId: 'getBuildLog',
    method: 'GET',
    path: '/v1/builds/{buildId}/logs',
    tag: 'delivery',
    summary: 'A build’s log',
    description:
      '§14: every line, redacted at capture — or the last `tail`. Lines arrive live on the project’s event stream while the build runs; this is every one of them afterwards.',
    params: BuildParams,
    query: z.strictObject({
      tail: z.coerce
        .number()
        .int()
        .min(1)
        .max(10_000)
        .optional()
        .describe('Only the last this-many lines, 1 to 10000.'),
    }),
    body: NO_BODY,
    success: { status: 200, description: 'The log.', schema: BuildLog },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params, query }) => {
      const build = await buildReadableBy(deps.db, actor, params.buildId)
      const lines = await readBuildLog(
        deps.db,
        build.id,
        query.tail === undefined ? {} : { tail: query.tail },
      )
      return toBuildLog(build.id, lines)
    },
  }),
  defineRoute({
    operationId: 'listBuilds',
    method: 'GET',
    path: '/v1/projects/{projectId}/builds',
    tag: 'delivery',
    summary: 'A project’s builds',
    description: 'The newest 50, newest first.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The builds.', schema: BuildList },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const rows = await deps.db
        .select()
        .from(builds)
        .where(eq(builds.projectId, params.projectId))
        .orderBy(desc(builds.createdAt))
        .limit(50)
      return rows.map(toBuild)
    },
  }),
]
