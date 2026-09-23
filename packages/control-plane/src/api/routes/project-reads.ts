import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { appSpecs, environments, users, type Db } from '../../db/index.js'
import {
  addMember,
  assertCapability,
  assertStepUp,
  AuthorizationError,
  getProject,
  listEnvironments as environmentsOf,
  listMembers,
  listProjectsFor,
  projectViews,
  removeMember,
  servingInstanceOf,
} from '../../projects/index.js'
import { isSensitiveDiff, validateSpec, type ManifestSpec } from '../../spec/index.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { BadRequestError, LastOwnerError, SpecInvalidError } from '../errors.js'
import {
  Environment,
  EnvironmentList,
  toEnvironment,
} from '../representations/environments.js'
import {
  AddMemberRequest,
  Member,
  MemberList,
  toMember,
} from '../representations/members.js'
import { Project, ProjectList, toProject } from '../representations/projects.js'
import { Spec, SpecValidation, ValidateSpecRequest } from '../representations/specs.js'
import { modelPolicy, validationContext } from './projects.js'

const ProjectParams = z.strictObject({ projectId: z.uuid() })
/** The member routes that name a person: `userId` is the §6 `users.id`, not a PUID. */
const MemberParams = z.strictObject({ projectId: z.uuid(), userId: z.uuid() })
const EnvironmentParams = z.strictObject({ environmentId: z.uuid() })

async function environmentsWithInstances(db: Db, projectId: string) {
  const rows = await environmentsOf(db, projectId)
  return Promise.all(
    rows.map(async (row) => toEnvironment(row, await servingInstanceOf(db, row))),
  )
}

/**
 * P5a Task 8: a project, its environments, its members and its spec, each answered as a
 * representation (Decision 19) — and the two reads a console needs that did not exist,
 * the environment list and the member list. `POST /v1/projects` is Task 11's.
 */
export const projectReadRoutes = [
  defineRoute({
    operationId: 'listProjects',
    method: 'GET',
    path: '/v1/projects',
    tag: 'projects',
    summary: 'The projects I am a member of',
    description:
      'Every project the caller owns or collaborates on, newest first — for administrators too. A delegated token answers exactly the one project it is scoped to (D24). The fleet is GET /v1/fleet.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The caller’s projects.', schema: ProjectList },
    errors: [],
    handler: async ({ deps, actor }) => {
      /**
       * A TOKEN ANSWERS EXACTLY ITS OWN PROJECT (Decision 12), and this is the only place
       * that can say so.
       *
       * `listProjectsFor` selects by `actor.userId` alone and this route calls no
       * `assertCapability`, so **nothing Task 6 does can scope it**: a token scoped to X,
       * minted by somebody who is also a member of Y and Z, listed all three — measured
       * as `[M1]`, sitting 1 finding 2. Scoping here rather than in the repository
       * because a token's project is an API-layer fact about the credential, not a
       * property of "the projects this person is in".
       *
       * A refusal was rejected: an agent listing "my projects" and getting a 403 has to
       * learn a second code path for no benefit, and scoping behaving correctly is what
       * a client expects.
       */
      const ids =
        actor.credential === 'token'
          ? [actor.projectId]
          : (await listProjectsFor(deps.db, actor)).map((p) => p.id)
      return (await projectViews(deps.db, ids)).map((view) => toProject(view))
    },
  }),
  defineRoute({
    operationId: 'getProject',
    method: 'GET',
    path: '/v1/projects/{projectId}',
    tag: 'projects',
    summary: 'A project',
    description:
      'One project; `?expand=environments` includes its three environments, each with the instance it serves (D23.1).',
    params: ProjectParams,
    query: z.strictObject({ expand: z.literal('environments').optional() }),
    body: NO_BODY,
    success: { status: 200, description: 'The project.', schema: Project },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params, query }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const [view] = await projectViews(deps.db, [params.projectId])
      if (view === undefined)
        throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      return toProject(
        view,
        query.expand === 'environments'
          ? await environmentsWithInstances(deps.db, params.projectId)
          : undefined,
      )
    },
  }),
  defineRoute({
    operationId: 'listEnvironments',
    method: 'GET',
    path: '/v1/projects/{projectId}/environments',
    tag: 'projects',
    summary: 'A project’s environments',
    description:
      'Sandbox, staging and production — all three exist from the moment the project does (§23).',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The environments.', schema: EnvironmentList },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      return environmentsWithInstances(deps.db, params.projectId)
    },
  }),
  defineRoute({
    operationId: 'getEnvironment',
    method: 'GET',
    path: '/v1/environments/{environmentId}',
    tag: 'projects',
    summary: 'An environment, and what it serves',
    description:
      'The environment and the instance its hostname reaches (§6 Route) — not the newest deploy, which may have failed.',
    params: EnvironmentParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The environment.', schema: Environment },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      const [row] = await deps.db
        .select()
        .from(environments)
        .where(eq(environments.id, params.environmentId))
      // The project comes from the environment ROW, never from the request.
      if (row === undefined)
        throw new AuthorizationError(
          'NOT_FOUND',
          `no environment '${params.environmentId}'`,
        )
      await assertCapability(deps.db, actor, row.projectId, 'project:read')
      return toEnvironment(row, await servingInstanceOf(deps.db, row))
    },
  }),
  defineRoute({
    operationId: 'listMembers',
    method: 'GET',
    path: '/v1/projects/{projectId}/members',
    tag: 'projects',
    summary: 'Who is a member of a project',
    description:
      'Owners and collaborators (§13). Reading is `project:read`; changing membership is `members:manage`.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The members.', schema: MemberList },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      return (await listMembers(deps.db, params.projectId)).map(toMember)
    },
  }),
  defineRoute({
    operationId: 'addMember',
    method: 'POST',
    path: '/v1/projects/{projectId}/members',
    tag: 'projects',
    summary: 'Add or change a member',
    description:
      'Grants a person who has signed in once a role on the project. One of D24’s privileged four: a delegated token will never hold it (P5b).',
    params: ProjectParams,
    query: NO_QUERY,
    body: AddMemberRequest,
    success: { status: 201, description: 'The member, as they now are.', schema: Member },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'MEMBER_USER_NOT_FOUND',
      // D24's central refusal (P5b Task 6). Listed on the two routes whose capability is
      // one of `PRIVILEGED` rather than on every route, because only these two can answer
      // it — `members:manage` here, `release:promote` on the production deploy.
      'TOKEN_ACTION_PENDING',
      // And Task 7's other answer: a person already refused this exact request, so
      // retrying it will not change anything. Listed beside it because the two are one
      // mechanism with two outcomes, and a client switches on the difference.
      'TOKEN_ACTION_REJECTED',
      // §20's step-up (P6a Task 9). A FIFTH `403` on this route, which is why the
      // authorization matrix's rows for it are explicit (status, code) pairs.
      'STEP_UP_REQUIRED',
    ],
    handler: async ({ deps, actor, params, body }) => {
      // A collaborator reaches this line and is refused here. §13: "same as owner
      // except member management and deletion."
      await assertCapability(deps.db, actor, params.projectId, 'members:manage')
      // §20 names member management in the step-up set, and P6a Decision 9 takes it from
      // day one: adding it later is a second pass over a route P5b already tested, and
      // doing it now gives step-up a caller whose tests already exist — so the negative
      // control is an EXISTING passing test going red rather than a new test nobody has
      // seen fail. AFTER `assertCapability`, never inside it (see `assertStepUp`).
      assertStepUp(actor, 'members:manage')
      const [user] = await deps.db
        .select()
        .from(users)
        .where(eq(users.ubcCwlPuid, body.puid))
      if (user === undefined) {
        throw new BadRequestError(
          'MEMBER_USER_NOT_FOUND',
          `no user with PUID '${body.puid}' has ever signed in`,
          'A person must sign in once before they can be added to a project.',
        )
      }
      await addMember(deps.db, params.projectId, user.id, body.role)
      return toMember({
        userId: user.id,
        puid: user.ubcCwlPuid,
        displayName: user.displayName,
        email: user.email,
        role: body.role,
      })
    },
  }),
  defineRoute({
    operationId: 'removeMember',
    method: 'DELETE',
    path: '/v1/projects/{projectId}/members/{userId}',
    tag: 'projects',
    summary: 'Remove a member',
    description:
      'Takes a person off the project (§13). One of D24’s privileged four: a delegated token will never hold it, and asking creates a pending action a person confirms (P5b). Idempotent — removing somebody who is not a member answers the members as they are — and the LAST owner cannot be removed, because a project with no owner is one nobody can grant access to, delete or deploy.',
    params: MemberParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The members as they now are.',
      schema: MemberList,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'PROJECT_LAST_OWNER',
      // D24's central refusal, which this route does NOTHING to earn (P5b Task 8). It is
      // the first privileged route written after Task 6 made the rule central, and
      // `assertCapability` below is the whole of its part in it. `errors:` names the two
      // codes because they are what a client can receive, not because this route throws
      // them — the wrapper in `api/contract/route.ts` does.
      'TOKEN_ACTION_PENDING',
      'TOKEN_ACTION_REJECTED',
      // §20's step-up, the same capability and therefore the same guard (P6a Task 9).
      'STEP_UP_REQUIRED',
    ],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'members:manage')
      assertStepUp(actor, 'members:manage')
      if ((await removeMember(deps.db, params.projectId, params.userId)) === 'last owner')
        throw new LastOwnerError()
      return (await listMembers(deps.db, params.projectId)).map(toMember)
    },
  }),
  defineRoute({
    operationId: 'getSpec',
    method: 'GET',
    path: '/v1/projects/{projectId}/spec',
    tag: 'projects',
    summary: 'The project’s newest valid manifest',
    description:
      'manifest.yaml as last validated (§7). An invalid newest manifest answers SPEC_INVALID with its errors.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The spec.', schema: Spec },
    errors: ['NOT_FOUND', 'SPEC_NOT_FOUND', 'SPEC_INVALID'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const [latest] = await deps.db
        .select()
        .from(appSpecs)
        .where(eq(appSpecs.projectId, params.projectId))
        .orderBy(desc(appSpecs.createdAt))
        .limit(1)
      if (latest === undefined)
        throw new BadRequestError(
          'SPEC_NOT_FOUND',
          'this project has no validated spec yet',
        )
      if (!latest.valid) throw new SpecInvalidError(latest.errors as never)
      return {
        appSpecId: latest.id,
        commitSha: latest.commitSha,
        spec: latest.parsed as Record<string, unknown>,
      }
    },
  }),
  /**
   * §22 step 3, the half P2 did not build: "manifest.yaml validated" AT A COMMIT.
   *
   * Project creation validated the seeded manifest and nothing could validate it
   * again, so a project's spec was fixed for its whole life: an agent could push a
   * `manifest.yaml` declaring a database and the platform would never read it.
   * `make demo` found this — the fixture app needs Mongo and the seeded spec
   * declares none.
   *
   * `isSensitiveDiff` (D9) is COMPUTED and REPORTED here and deliberately does not
   * gate: the approval flow it feeds — escalation, step-up re-auth — is P6's, and a
   * gate with nothing behind it would be a control on paper.
   */
  defineRoute({
    operationId: 'validateSpec',
    method: 'POST',
    path: '/v1/projects/{projectId}/spec',
    tag: 'projects',
    summary: 'Validate manifest.yaml at a commit',
    description:
      '§22 step 3: reads manifest.yaml at the commit (HEAD by default), validates it (§7) and records the result. A sensitive diff (D9) is reported here against the newest valid spec; it is ENFORCED at the production deploy, against the last approved release (§13 D9.2).',
    params: ProjectParams,
    query: NO_QUERY,
    body: ValidateSpecRequest,
    success: {
      status: 201,
      description:
        'The validation, valid or not — an invalid manifest is a recorded answer, not a refusal.',
      schema: SpecValidation,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'SOURCE_GIT_FAILED',
      'AI_BACKEND_UNAVAILABLE',
      'AI_CATALOGUE_EMPTY',
    ],
    handler: async ({ deps, actor, params, body }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:write')
      const project = await getProject(deps.db, params.projectId)
      if (project === undefined)
        throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      // THE NEWEST VALID SPEC, not the newest row (P6b sitting 1, F7). Compared only with
      // the immediately previous row, an invalid commit in between made the route answer
      // `{sensitive: false}` — the answer a genuine no-change gets — for a change it had
      // never compared, so any sensitive change after a broken commit reported as none.
      const [previous] = await deps.db
        .select()
        .from(appSpecs)
        .where(and(eq(appSpecs.projectId, params.projectId), eq(appSpecs.valid, true)))
        .orderBy(desc(appSpecs.createdAt))
        .limit(1)
      const repo = deps.source.repositoryFor(project.slug)
      const commitSha = body.commitSha ?? (await deps.source.headCommit(repo))
      const yamlText =
        (await deps.source.readFile(repo, commitSha, 'manifest.yaml')) ?? ''
      // Still before the spec row is written, and after the manifest is read: the
      // catalogue is consulted only if this manifest declares a model.
      const models = await modelPolicy(deps.catalogue, yamlText)
      const result = validateSpec(
        yamlText,
        validationContext(project.slug, project.quota as Record<string, unknown>, models),
      )
      const [appSpec] = await deps.db
        .insert(appSpecs)
        .values({
          projectId: params.projectId,
          commitSha,
          parsed: result.valid ? result.spec : {},
          schemaVersion: 1,
          valid: result.valid,
          errors: result.valid ? [] : result.errors,
        })
        .returning()
      const sensitiveDiff =
        result.valid && previous !== undefined
          ? isSensitiveDiff(previous.parsed as ManifestSpec, result.spec)
          : { sensitive: false, fields: [] }
      return {
        appSpecId: appSpec!.id,
        commitSha,
        valid: result.valid,
        errors: result.valid ? [] : result.errors,
        sensitiveDiff,
      }
    },
  }),
]
