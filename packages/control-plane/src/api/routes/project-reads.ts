import { desc, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { appSpecs, environments, type Db } from '../../db/index.js'
import { makeRedactor, publishEvent } from '../../observability/index.js'
import {
  actorPhrase,
  addMember,
  assertCapability,
  assertStepUp,
  AuthorizationError,
  findPerson,
  getProject,
  personName,
  type Actor,
  listEnvironments as environmentsOf,
  listMembers,
  listProjectsFor,
  projectViews,
  removeMember,
  servingInstanceOf,
} from '../../projects/index.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { PATH } from '../contract/schemas.js'
import { validateAndRecord } from '../spec-validation.js'
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

const ProjectParams = z.strictObject({ projectId: PATH.projectId })

/** A role as a sentence reads it — *"as a collaborator"*, *"an owner of"*. */
const ROLE_PHRASE = { owner: 'an owner', collaborator: 'a collaborator' } as const

/** Who acted, as every event records it beside its sentence: `audit.events` has no actor column. */
const actorDetail = (actor: Actor) => ({
  via: actor.credential,
  userId: actor.userId,
  tokenId: actor.credential === 'token' ? actor.tokenId : null,
})
/** The member routes that name a person: `userId` is the §6 `users.id`, not a PUID. */
const MemberParams = z.strictObject({ projectId: PATH.projectId, userId: PATH.userId })
const EnvironmentParams = z.strictObject({ environmentId: PATH.environmentId })

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
    examples: {
      response: [
        {
          id: '71a3eefa-e530-44c1-b7f5-3dde5e38eef8',
          slug: 'p-6e200d3a',
          name: 'p-6e200d3a',
          blueprint: 'fixture-node@1',
          starter: null,
          owner: { id: '39414511-6e5d-46e9-a47a-090166426ed3', displayName: 'Bio Prof' },
          audience: {
            scale: 'solo',
            burst: 'steady',
            justification: null,
            setBy: '39414511-6e5d-46e9-a47a-090166426ed3',
            setAt: '2026-09-26T21:51:48.272Z',
          },
          createdAt: '2026-09-26T21:51:48.272Z',
          launchedAt: null,
          repository: {
            provider: 'local',
            fullName: 'p-6e200d3a',
            webUrl: null,
            mainProtected: true,
            protectionDetail: null,
            visibility: null,
          },
        },
        {
          id: 'f8920a3c-e857-4580-8f04-c72b008ae71f',
          slug: 'authz-other-f891223a',
          name: 'authz-other-f891223a',
          blueprint: 'fixture-node@1',
          starter: null,
          owner: { id: '39414511-6e5d-46e9-a47a-090166426ed3', displayName: 'Bio Prof' },
          audience: {
            scale: 'solo',
            burst: 'steady',
            justification: null,
            setBy: '39414511-6e5d-46e9-a47a-090166426ed3',
            setAt: '2026-09-26T21:51:47.663Z',
          },
          createdAt: '2026-09-26T21:51:47.664Z',
          launchedAt: null,
          repository: {
            provider: 'local',
            fullName: 'authz-other-f891223a',
            webUrl: null,
            mainProtected: true,
            protectionDetail: null,
            visibility: null,
          },
        },
      ],
    },
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
      return (await projectViews(deps, ids)).map((view) => toProject(view))
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
    query: z.strictObject({
      expand: z
        .literal('environments')
        .optional()
        .describe(
          '`environments` includes the project’s three environments in the answer.',
        ),
    }),
    body: NO_BODY,
    success: { status: 200, description: 'The project.', schema: Project },
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        id: '77811340-0c79-4c30-a00f-b87e8460b6cf',
        slug: 'chem-labs',
        name: 'chem-labs',
        blueprint: 'fixture-node@1',
        starter: null,
        owner: { id: '40baf394-7897-4cbb-89d6-7df27e51626d', displayName: 'Bio Prof' },
        audience: {
          scale: 'solo',
          burst: 'steady',
          justification: null,
          setBy: '40baf394-7897-4cbb-89d6-7df27e51626d',
          setAt: '2026-09-26T21:49:02.609Z',
        },
        createdAt: '2026-09-26T21:49:02.611Z',
        launchedAt: null,
        repository: {
          provider: 'local',
          fullName: 'chem-labs',
          webUrl: null,
          mainProtected: true,
          protectionDetail: null,
          visibility: null,
        },
        environments: [
          {
            id: '72a1fc83-a0e4-4c8a-ba76-eb040c1c9eda',
            projectId: '77811340-0c79-4c30-a00f-b87e8460b6cf',
            kind: 'sandbox',
            hostname: 'chem-labs.sandbox.manifest.internal',
            url: 'https://chem-labs.sandbox.manifest.internal',
            instance: null,
          },
          {
            id: 'ca192723-fae5-415e-8ed5-b0085b6e33d6',
            projectId: '77811340-0c79-4c30-a00f-b87e8460b6cf',
            kind: 'staging',
            hostname: 'chem-labs.staging.manifest.internal',
            url: 'https://chem-labs.staging.manifest.internal',
            instance: null,
          },
        ],
      },
    },
    handler: async ({ deps, actor, params, query }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const [view] = await projectViews(deps, [params.projectId])
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
    examples: {
      response: [
        {
          id: '5647b084-e2c2-4281-a604-dcb11d735441',
          projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
          kind: 'sandbox',
          hostname: 'authz-fixture.sandbox.manifest.internal',
          url: 'https://authz-fixture.sandbox.manifest.internal',
          instance: null,
        },
        {
          id: 'd5084b58-e7b0-46ef-bdd8-a431d9b97b2d',
          projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
          kind: 'staging',
          hostname: 'authz-fixture.staging.manifest.internal',
          url: 'https://authz-fixture.staging.manifest.internal',
          instance: null,
        },
      ],
    },
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
    examples: {
      response: {
        id: 'd5084b58-e7b0-46ef-bdd8-a431d9b97b2d',
        projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
        kind: 'staging',
        hostname: 'authz-fixture.staging.manifest.internal',
        url: 'https://authz-fixture.staging.manifest.internal',
        instance: {
          id: 'a6605b8a-7adb-464e-ac45-ef3d8d56cca5',
          environmentId: 'd5084b58-e7b0-46ef-bdd8-a431d9b97b2d',
          releaseId: '8e4d08ba-37d8-4b96-8981-e6a13722e42f',
          kind: 'web',
          state: 'healthy',
          lastSeenAt: '2026-09-26T21:51:54.793Z',
        },
      },
    },
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
    examples: {
      response: [
        {
          userId: '39414511-6e5d-46e9-a47a-090166426ed3',
          puid: 'bio_prof',
          cwlLogin: null,
          displayName: 'Bio Prof',
          email: 'bio_prof@example.ubc.ca',
          role: 'owner',
        },
        {
          userId: '9a77d151-997d-49f4-8c60-23c009fa18db',
          puid: 'bio_student',
          cwlLogin: null,
          displayName: 'Bio Student',
          email: 'bio_student@example.ubc.ca',
          role: 'collaborator',
        },
      ],
    },
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
      'Grants a person who has signed in once a role on the project, naming them by EXACTLY ONE of their PUID, CWL login name or email (an email two people share is `MEMBER_USER_AMBIGUOUS`). Publishes `member.added` when it changed something. One of D24’s privileged four: a delegated token never holds it, and asking creates a pending action a person confirms.',
    params: ProjectParams,
    query: NO_QUERY,
    body: AddMemberRequest,
    success: { status: 201, description: 'The member, as they now are.', schema: Member },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'MEMBER_USER_NOT_FOUND',
      'MEMBER_USER_AMBIGUOUS',
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
    examples: {
      request: { cwlLogin: 'student', role: 'collaborator' },
      response: {
        userId: '5d0f7c3e-9b21-4f6a-8e47-2c1a9b3d6e80',
        puid: 'stu000001',
        cwlLogin: 'student',
        displayName: 'Test Student',
        email: 'student@student.ubc.ca',
        role: 'collaborator',
      },
    },
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
      // THE LOOKUP COMES AFTER BOTH (the front-end enablement plan's Task 7): a person who may
      // not manage members is refused the same way for a login that exists and one that does
      // not, so they learn nothing about who has signed in.
      // Exactly one of the three is present: the request's own refinement says so.
      const [how, value, key] =
        body.puid !== undefined
          ? (['PUID', body.puid, { puid: body.puid }] as const)
          : body.cwlLogin !== undefined
            ? (['CWL login name', body.cwlLogin, { cwlLogin: body.cwlLogin }] as const)
            : (['email', body.email!, { email: body.email! }] as const)
      const person = await findPerson(deps.db, key)
      if (person.kind === 'nobody') {
        throw new BadRequestError(
          'MEMBER_USER_NOT_FOUND',
          `nobody with the ${how} '${value}' has signed in to Manifest`,
          'A person must sign in to Manifest once with CWL before they can be added to a project.',
        )
      }
      if (person.kind === 'ambiguous') {
        // NAMING NEITHER: who shares an address is not the asker's to learn from a refusal.
        throw new BadRequestError(
          'MEMBER_USER_AMBIGUOUS',
          `more than one person who has signed in to Manifest has the email '${value}'`,
          'Add them by their CWL login name instead.',
        )
      }
      const user = person.user
      const { previousRole } = await addMember(
        deps.db,
        params.projectId,
        user.id,
        body.role,
      )
      if (previousRole !== body.role) {
        const who = await actorPhrase(deps.db, actor)
        const them = await personName(deps.db, user.id)
        await publishEvent(
          deps.db,
          deps.bus,
          {
            projectId: params.projectId,
            subject: `member:${user.id}`,
            type: 'member.added',
            machineDetail: {
              memberId: user.id,
              role: body.role,
              previousRole,
              ...actorDetail(actor),
            },
            humanMessage:
              previousRole === null
                ? `${who} added ${them} to the project as ${ROLE_PHRASE[body.role]}.`
                : `${who} made ${them} ${ROLE_PHRASE[body.role]} of the project; they were ${ROLE_PHRASE[previousRole]}.`,
          },
          makeRedactor([]),
        )
      }
      return toMember({
        userId: user.id,
        puid: user.ubcCwlPuid,
        cwlLogin: user.cwlLogin,
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
      'Takes a person off the project (§13). One of D24’s privileged four: a delegated token will never hold it, and asking creates a pending action a person confirms. Publishes `member.removed`. Idempotent — removing somebody who is not a member answers the members as they are, and publishes nothing — and the LAST owner cannot be removed, because a project with no owner is one nobody can grant access to, delete or deploy.',
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
    examples: {
      response: [
        {
          userId: '6e78f827-89cd-4186-80e6-549dcaa4d76a',
          puid: 'bio_student',
          cwlLogin: null,
          displayName: 'Bio Student',
          email: 'bio_student@example.ubc.ca',
          role: 'owner',
        },
      ],
    },
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'members:manage')
      assertStepUp(actor, 'members:manage')
      const outcome = await removeMember(deps.db, params.projectId, params.userId)
      if (outcome === 'last owner') throw new LastOwnerError()
      // Published only for a removal: taking off somebody who was not a member changed nothing.
      if (outcome === 'removed') {
        await publishEvent(
          deps.db,
          deps.bus,
          {
            projectId: params.projectId,
            subject: `member:${params.userId}`,
            type: 'member.removed',
            machineDetail: { memberId: params.userId, ...actorDetail(actor) },
            humanMessage: `${await actorPhrase(deps.db, actor)} removed ${await personName(deps.db, params.userId)} from the project.`,
          },
          makeRedactor([]),
        )
      }
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
    examples: {
      response: {
        appSpecId: 'bcdbd995-b929-4f18-bab8-a765757b7a73',
        commitSha: 'bc2120d529f824d4715bfe75526c7780eb00b9e3',
        spec: {
          ai: { budget: { per_user_monthly_usd: 0 }, models: [] },
          env: [],
          auth: {
            logout: '/auth/logout',
            callback: '/auth/ubcshib/callback',
            provider: 'none',
            attributes: [],
          },
          data: { classification: 'internal', retention_days: 365 },
          jobs: [],
          name: 'chem-labs',
          checks: [],
          egress: { allow: [] },
          runtime: { port: 3000, health: '/healthz', command: null },
          manifest: 1,
          services: [{ name: 'db', type: 'mongo', version: '7' }],
          blueprint: 'fixture-node@1',
          resources: {},
          environments: {},
          integrations: [],
        },
      },
    },
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
      'SOURCE_COMMIT_NOT_FOUND',
      'SOURCE_GIT_FAILED',
      'SOURCE_PROVIDER_MISMATCH',
      'SOURCE_UNREACHABLE',
      'AI_BACKEND_UNAVAILABLE',
      'AI_CATALOGUE_EMPTY',
    ],
    examples: {
      request: { commitSha: '0cf7e2d5dc61fb39c8c0cff09b531c4ef3e1cbdf' },
      response: {
        appSpecId: '14da1d0c-1831-4adc-b823-211891a2db9e',
        commitSha: '0cf7e2d5dc61fb39c8c0cff09b531c4ef3e1cbdf',
        valid: true,
        errors: [],
        // A manifest setting `ai.budget.per_user_monthly_usd: 2`: valid, and warned about
        // (Spec action 4) — held to the route's real answer by source-commit.test.ts.
        warnings: [
          {
            code: 'SPEC_FIELD_NOT_ENFORCED',
            path: 'ai.budget.per_user_monthly_usd',
            message:
              '$2/month per person is validated and recorded with the release, and not enforced before Phase 4 (§10): no single person is limited by it yet',
            hint: 'Nothing to fix. What limits the app’s AI spending today is ai.budget.project_monthly_usd; keep this value if you mean it — it applies once Manifest enforces it.',
          },
        ],
        sensitiveDiff: { sensitive: false, fields: [] },
      },
    },
    handler: async ({ deps, actor, params, body }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:write')
      const project = await getProject(deps.db, params.projectId)
      if (project === undefined)
        throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      // The body is `validateAndRecord`'s, which a GitHub push also calls (Task 9).
      return validateAndRecord(deps, project, body.commitSha)
    },
  }),
]
