import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { checkBlueprintCompatibility } from '../../blueprints/index.js'
import { appSpecs, builds, projects, type Db } from '../../db/index.js'
import { readBuildLog } from '../../observability/index.js'
import {
  assertCapability,
  AuthorizationError,
  repositoryOf,
  type Actor,
} from '../../projects/index.js'
import { getBuild } from '../../releases/index.js'
import type { ManifestSpec } from '../../spec/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { PATH } from '../contract/schemas.js'
import { BadRequestError, SpecInvalidError } from '../errors.js'
import { validateAndRecord } from '../spec-validation.js'
import {
  Build,
  BuildList,
  BuildLog,
  StartBuildRequest,
  toBuild,
  toBuildLog,
} from '../representations/builds.js'

const ProjectParams = z.strictObject({ projectId: PATH.projectId })

/** The `app_specs` row `validateAndRecord` wrote — it answers the representation, not the row. */
async function specRowOf(db: Db, appSpecId: string) {
  const [row] = await db.select().from(appSpecs).where(eq(appSpecs.id, appSpecId))
  return row!
}
const BuildParams = z.strictObject({ buildId: PATH.buildId })

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
      '§22 step 4. Builds `commitSha` with THAT commit’s own manifest.yaml — its recorded validation, or one made now if nobody has validated it — and refuses `SPEC_INVALID` if it is not valid. With no `commitSha` it builds the commit of the project’s newest recorded validation, which is not necessarily `main`’s head: name the commit you mean. Answers 202 at once with the build `running`; its log lines arrive as `log` frames and its end as `build.succeeded` or `build.failed` on the project’s event stream. GET /v1/builds/{buildId} for the present state — a replayed Idempotency-Key answers the 202 as it was first sent.',
    params: ProjectParams,
    query: NO_QUERY,
    body: StartBuildRequest,
    success: { status: 202, description: 'The build, started.', schema: Build },
    capability: 'build:create',
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'SPEC_NOT_FOUND',
      'SPEC_INVALID',
      'BLUEPRINT_NOT_FOUND',
      'SOURCE_COMMIT_NOT_FOUND',
      'SOURCE_PROVIDER_MISMATCH',
      'SOURCE_REPOSITORY_PUBLIC',
      'SOURCE_UNREACHABLE',
      // A commit nobody has validated is validated first (Task 7), which reads the model
      // catalogue when its manifest declares a model.
      'AI_BACKEND_UNAVAILABLE',
      'AI_CATALOGUE_EMPTY',
    ],
    examples: {
      request: { commitSha: 'e47cbba42cf5ba5ae3bb110198ad19089cd883fb' },
      response: {
        id: '5002ee0c-8e74-4ec8-96d0-27eaf5908a03',
        projectId: '46a772b2-8f42-4d9e-9a1a-241a097965d6',
        commitSha: 'e47cbba42cf5ba5ae3bb110198ad19089cd883fb',
        status: 'running',
        imageDigest: null,
        error: null,
        scan: null,
        createdAt: '2026-09-26T21:47:37.711Z',
      },
    },
    handler: async ({ deps, actor, params, body }) => {
      await assertCapability(deps.db, actor, params.projectId, 'build:create')
      // Moved up (the authoring API plan's Task 7): the commit's validation needs the project.
      const [project] = await deps.db
        .select()
        .from(projects)
        .where(eq(projects.id, params.projectId))
      if (project === undefined) {
        throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      }
      const [newest] = await deps.db
        .select()
        .from(appSpecs)
        .where(eq(appSpecs.projectId, params.projectId))
        .orderBy(desc(appSpecs.createdAt))
        .limit(1)
      if (newest === undefined && body.commitSha === undefined) {
        throw new BadRequestError(
          'SPEC_NOT_FOUND',
          'this project has no validated spec yet',
        )
      }
      // No commit named: the newest recorded validation's — the meaning the empty body has
      // always had (ORIENTATION §4 trap 23), and what the description now says in words.
      const commitSha = body.commitSha ?? newest!.commitSha
      /**
       * THE SPEC OF THE COMMIT BUILT (Decision 12): its own newest validation, or one made now.
       * This read the project's NEWEST row, whatever commit that came from — so a client that
       * committed X, then Y, then built X froze X's code with Y's manifest (the plan's *Read
       * this first* 4). A commit nobody validated is validated first, recorded and announced
       * like any other; one the repository lacks is `SOURCE_COMMIT_NOT_FOUND` from the read,
       * before any row is written.
       */
      const [ofCommit] = await deps.db
        .select()
        .from(appSpecs)
        .where(
          and(
            eq(appSpecs.projectId, params.projectId),
            eq(appSpecs.commitSha, commitSha),
          ),
        )
        .orderBy(desc(appSpecs.createdAt))
        .limit(1)
      const spec =
        ofCommit ??
        (await specRowOf(
          deps.db,
          (await validateAndRecord(deps, project, commitSha)).appSpecId,
        ))
      // SpecInvalidError, with the errors (P5a Task 5): one code, one status, from every
      // route that answers it — it was `400 SPEC_INVALID` here with no `details`.
      if (!spec.valid) throw new SpecInvalidError(spec.errors as never)
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
      // D5's seam (the D5 plan's Task 2): the builder is handed a LOCAL bare repository that
      // holds this commit, from the driver — never a path read off a reference. Driver 2
      // fetches it into its mirror first; driver 1 checks it is there. Either refuses
      // SOURCE_COMMIT_NOT_FOUND, here, rather than a build that fails later at `git archive`.
      // `repositoryOf` first (Decision 3): on a laptop that switched drivers, driver 1's bare
      // repository sits where driver 2's mirror would, and holds the commit — without the
      // check, driver 2 took it for a mirror and BUILT it (measured, the D5 plan's Task 8).
      const local = await deps.source.localGitDir(
        await repositoryOf(deps, project),
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
    capability: 'project:read',
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        id: 'a7fa8817-0f11-43fc-a66e-e5a307068a59',
        projectId: 'f3d4076b-b482-4d5d-b614-7e1cc4064392',
        commitSha: '8ca53a0c88c96b9624724873b4e03d9c40af796c',
        status: 'failed',
        imageDigest: null,
        error:
          "SPEC_ATTRIBUTE_NOT_REGISTERED: manifest.yaml asks for 1 CWL attribute(s) UBC IAM did not register for 'iam-add': sn. Registered: mail, ubcEduCwlPuid. — A production release must request a subset of what UBC IAM registered (§7, §9) — otherwise students hit a broken login on launch …",
        scan: null,
        createdAt: '2026-09-26T21:48:49.290Z',
      },
    },
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
    capability: 'project:read',
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        buildId: 'd9152353-95cd-4f1c-9a4f-655b710b4d46',
        lines: [
          {
            seq: 0,
            stream: 'stdout',
            text: 'fake build of authz-fixture at 26f71b49f02162fc3614864c3f520faea87c10a2 from fixture-node@1',
            at: '2026-09-26T21:51:47.637Z',
          },
        ],
      },
    },
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
    description:
      'The project’s newest 50 builds, newest first, each with its status, image digest and scan. A build in progress reads `running`; the event stream says when it ends.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The builds.', schema: BuildList },
    capability: 'project:read',
    errors: ['NOT_FOUND'],
    examples: {
      response: [
        {
          id: '3ab69e9e-b83f-400d-9653-2c18038aa578',
          projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
          commitSha: '26f71b49f02162fc3614864c3f520faea87c10a2',
          status: 'succeeded',
          imageDigest:
            'sha256:381846aa0581a9b8a299a0789f2627a9da7491365a4a40625c74582f12b6d419',
          error: null,
          scan: {
            scanner: 'fake',
            scannedAt: '2026-09-26T21:51:54.417Z',
            databaseAgeDays: 0,
            stale: false,
            baseImageKnown: true,
            fixable: { critical: 0, high: 0 },
            unfixable: { critical: 0, high: 0 },
            baseImage: { critical: 0, high: 0 },
            unfixableFindings: [],
          },
          createdAt: '2026-09-26T21:51:54.415Z',
        },
        {
          id: 'cda88a76-2d07-4e7a-b0f5-0c524e157b03',
          projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
          commitSha: '26f71b49f02162fc3614864c3f520faea87c10a2',
          status: 'succeeded',
          imageDigest:
            'sha256:381846aa0581a9b8a299a0789f2627a9da7491365a4a40625c74582f12b6d419',
          error: null,
          scan: {
            scanner: 'fake',
            scannedAt: '2026-09-26T21:51:54.395Z',
            databaseAgeDays: 0,
            stale: false,
            baseImageKnown: true,
            fixable: { critical: 0, high: 0 },
            unfixable: { critical: 0, high: 0 },
            baseImage: { critical: 0, high: 0 },
            unfixableFindings: [],
          },
          createdAt: '2026-09-26T21:51:54.392Z',
        },
      ],
    },
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
