import { desc, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import {
  appSpecs,
  builds,
  environments,
  projects,
  releases,
  type Db,
} from '../../db/index.js'
import { computeLaunchReadiness } from '../../launch/index.js'
import { incidentPrompt, listIncidents } from '../../observability/index.js'
import { assertCapability, AuthorizationError, type Actor } from '../../projects/index.js'
import { createRelease, deployRelease } from '../../releases/index.js'
import { resolveConfig, type ManifestSpec } from '../../spec/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { BadRequestError, ProductionGateError } from '../errors.js'
import { IncidentList, toIncident } from '../representations/incidents.js'
import { Instance, toInstance } from '../representations/instances.js'
import {
  CreateReleaseRequest,
  DeployRequest,
  Release,
  ReleaseList,
  toRelease,
} from '../representations/releases.js'

const ProjectParams = z.strictObject({ projectId: z.uuid() })
const EnvironmentParams = z.strictObject({ environmentId: z.uuid() })

/** A release with the build it names: the digest and the scan are the build's (§12, §13). */
async function releaseWithBuild(db: Db, releaseId: string) {
  const [row] = await db
    .select({ release: releases, build: builds })
    .from(releases)
    .innerJoin(builds, eq(releases.buildId, builds.id))
    .where(eq(releases.id, releaseId))
  return row
}

/**
 * The environment row, with no authorization of its own. The project comes from this ROW,
 * never from the request — the IDOR shape P2 measured on `GET /builds/:id` — so every
 * caller below authorizes against the project the environment actually belongs to, and a
 * stranger gets the 404 the project itself would give them.
 *
 * Separate from `environmentReadableBy` because the deploy route's capability DEPENDS on
 * the row: promoting to production is a different decision from deploying to staging
 * (§13, D24), so it must read the kind before it can say what to assert (P5b Task 2).
 */
async function environmentById(db: Db, environmentId: string) {
  const [row] = await db
    .select()
    .from(environments)
    .where(eq(environments.id, environmentId))
  if (row === undefined)
    throw new AuthorizationError('NOT_FOUND', `no environment '${environmentId}'`)
  return row
}

/** An environment the actor may READ. */
async function environmentReadableBy(db: Db, actor: Actor, environmentId: string) {
  const row = await environmentById(db, environmentId)
  await assertCapability(db, actor, row.projectId, 'project:read')
  return row
}

/** §22 steps 5 and 6 (P5a Task 14): releases, deploys and Incidents as representations. */
export const releaseRoutes = [
  defineRoute({
    operationId: 'createRelease',
    method: 'POST',
    path: '/v1/projects/{projectId}/releases',
    tag: 'delivery',
    summary: 'Release a build',
    description:
      '§13: an immutable release — the build’s digest, the newest valid spec, and the configuration resolved for all three environments, frozen together.',
    params: ProjectParams,
    query: NO_QUERY,
    body: CreateReleaseRequest,
    success: { status: 201, description: 'The release.', schema: Release },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'SPEC_NOT_FOUND',
      'BLUEPRINT_NOT_FOUND',
      'RELEASE_BUILD_NOT_FOUND',
      'RELEASE_BUILD_NOT_DEPLOYABLE',
    ],
    handler: async ({ deps, actor, params, body }) => {
      await assertCapability(deps.db, actor, params.projectId, 'release:create')
      const [project] = await deps.db
        .select()
        .from(projects)
        .where(eq(projects.id, params.projectId))
      if (project === undefined)
        throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      const [spec] = await deps.db
        .select()
        .from(appSpecs)
        .where(eq(appSpecs.projectId, params.projectId))
        .orderBy(desc(appSpecs.createdAt))
        .limit(1)
      if (spec === undefined)
        throw new BadRequestError(
          'SPEC_NOT_FOUND',
          'this project has no validated spec yet',
        )
      const descriptor = deps.blueprints.resolve(project.blueprintRef)
      if (descriptor === undefined) {
        throw new BadRequestError(
          'BLUEPRINT_NOT_FOUND',
          `this project pins '${project.blueprintRef}', which is no longer in the registry`,
        )
      }
      const parsed = spec.parsed as ManifestSpec
      const defaults = descriptor.defaults.resources
      const release = await createRelease(deps.db, {
        projectId: params.projectId,
        buildId: body.buildId,
        appSpecId: spec.id,
        createdBy: actor.userId,
        ...(body.summary === undefined ? {} : { summary: body.summary }),
        // Resolved once, at release time, and frozen — all three environments together,
        // so promotion applies the exact numbers the approver saw.
        resolvedConfig: {
          sandbox: resolveConfig(parsed, 'sandbox', defaults),
          staging: resolveConfig(parsed, 'staging', defaults),
          production: resolveConfig(parsed, 'production', defaults),
        },
      })
      const joined = await releaseWithBuild(deps.db, release.id)
      return toRelease(joined!.release, joined!.build)
    },
  }),
  defineRoute({
    operationId: 'getRelease',
    method: 'GET',
    path: '/v1/releases/{releaseId}',
    tag: 'delivery',
    summary: 'A release',
    description: 'One immutable release (§13).',
    params: z.strictObject({ releaseId: z.uuid() }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The release.', schema: Release },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      const joined = await releaseWithBuild(deps.db, params.releaseId)
      // The project comes from the release ROW, never from the request.
      if (joined === undefined)
        throw new AuthorizationError('NOT_FOUND', `no release '${params.releaseId}'`)
      await assertCapability(deps.db, actor, joined.release.projectId, 'project:read')
      return toRelease(joined.release, joined.build)
    },
  }),
  defineRoute({
    operationId: 'listReleases',
    method: 'GET',
    path: '/v1/projects/{projectId}/releases',
    tag: 'delivery',
    summary: 'A project’s releases',
    description: 'The newest 50, newest first.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The releases.', schema: ReleaseList },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const rows = await deps.db
        .select({ release: releases, build: builds })
        .from(releases)
        .innerJoin(builds, eq(releases.buildId, builds.id))
        .where(eq(releases.projectId, params.projectId))
        .orderBy(desc(releases.createdAt))
        .limit(50)
      return rows.map((r) => toRelease(r.release, r.build))
    },
  }),
  defineRoute({
    operationId: 'deploy',
    method: 'POST',
    path: '/v1/environments/{environmentId}/deploy',
    tag: 'delivery',
    summary: 'Deploy a release to an environment',
    description:
      '§22 step 5. Answers once the new instance serves, or once it has failed with an Incident — a failed deploy is a 200 whose state is `failed` (R3, §14). The previous instance keeps serving until the new one is proved, and drains in the background. Up to ~90 s when a release never becomes ready. Production answers 409 with LaunchReadiness (§13).',
    params: EnvironmentParams,
    query: NO_QUERY,
    body: DeployRequest,
    success: {
      status: 200,
      description: 'The instance, healthy or failed.',
      schema: Instance,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
      // D24 (P5b Task 6): a token deploying to PRODUCTION asks for `release:promote`,
      // which is privileged — and is refused here, before the launch gate above.
      'TOKEN_ACTION_PENDING',
      // And Task 7's other answer: a person already refused this exact request, so
      // retrying it will not change anything. Listed beside it because the two are one
      // mechanism with two outcomes, and a client switches on the difference.
      'TOKEN_ACTION_REJECTED',
      'RELEASE_NOT_FOUND',
      'RELEASE_DIGEST_MISSING',
      'RELEASE_AI_DISABLED',
      'RELEASE_AI_BUDGET_MISSING',
      'RELEASE_MODEL_NOT_IN_CATALOGUE',
      'RELEASE_MODEL_CLASSIFICATION_TOO_LOW',
      'RELEASE_MODEL_UNCLASSIFIED',
      'AI_BACKEND_UNAVAILABLE',
    ],
    handler: async ({ deps, actor, params, body }) => {
      const environment = await environmentById(deps.db, params.environmentId)
      // §13 and D24: promoting to production is a different decision from deploying to
      // staging, and a different capability. The launch gate below refuses production for
      // a second, independent reason — this check is about WHO may ask, that one is about
      // whether the project is ready. Both must hold, and this one runs first, so a
      // collaborator is refused before the project's readiness is ever consulted.
      await assertCapability(
        deps.db,
        actor,
        environment.projectId,
        environment.kind === 'production' ? 'release:promote' : 'release:deploy',
      )
      // §13: not forbidden, not ready. Say which items and who owns them — the SAME
      // checklist `GET /v1/projects/{projectId}/launch-readiness` answers, computed from
      // what exists rather than the constant this carried until P5a Task 15.
      if (environment.kind === 'production')
        throw new ProductionGateError(
          await computeLaunchReadiness(deps.db, environment.projectId),
        )
      const instance = await deployRelease(
        deps.db,
        deps.driver,
        deps.config,
        {
          secrets: deps.secrets,
          appSecrets: deps.appSecrets,
          sso: deps.sso,
          blueprints: deps.blueprints,
          ai: deps.ai,
          catalogue: deps.catalogue,
          bus: deps.bus,
          retirer: deps.retirer,
        },
        { releaseId: body.releaseId, environmentId: params.environmentId },
      )
      return toInstance(instance)
    },
  }),
  defineRoute({
    operationId: 'listIncidents',
    method: 'GET',
    path: '/v1/environments/{environmentId}/incidents',
    tag: 'delivery',
    summary: 'An environment’s incidents',
    description:
      '§14: each failed deploy’s exit, last 200 log lines, failing check and diff since the last healthy release, newest first, with its repair prompt.',
    params: EnvironmentParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The incidents.', schema: IncidentList },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      const environment = await environmentReadableBy(
        deps.db,
        actor,
        params.environmentId,
      )
      const [project] = await deps.db
        .select({ slug: projects.slug })
        .from(projects)
        .where(eq(projects.id, environment.projectId))
      if (project === undefined)
        throw new AuthorizationError('NOT_FOUND', `no project '${environment.projectId}'`)
      const rows = await listIncidents(deps.db, environment.id)
      return {
        environmentId: environment.id,
        incidents: rows.map((row) =>
          toIncident(
            row,
            incidentPrompt(row, {
              slug: project.slug,
              environmentKind: environment.kind,
            }),
          ),
        ),
      }
    },
  }),
]
