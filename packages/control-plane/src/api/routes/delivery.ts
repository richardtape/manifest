import type { FastifyInstance } from 'fastify'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { appSpecs, environments, instances, projects } from '../../db/index.js'
import { assertCapability, AuthorizationError } from '../../projects/index.js'
import {
  createRelease,
  deployRelease,
  getBuild,
  startBuild,
} from '../../releases/index.js'
import { checkBlueprintCompatibility } from '../../blueprints/index.js'
import { incidentPrompt, listIncidents, readBuildLog } from '../../observability/index.js'
import { resolveConfig } from '../../spec/index.js'
import type { ManifestSpec } from '../../spec/index.js'
import { BadRequestError, SpecInvalidError } from '../errors.js'
import { requireActor, type ServerDeps } from '../server.js'

const buildBody = z.object({
  commitSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
})
const releaseBody = z.object({
  buildId: z.string().uuid(),
  summary: z.string().max(500).optional(),
})
const deployBody = z.object({ releaseId: z.string().uuid() })
const logsQuery = z.object({
  tail: z.coerce.number().int().min(1).max(10_000).optional(),
})

/** §13's checklist, as data, so the refusal can name what is missing. */
const LAUNCH_READINESS = [
  { item: 'IamRegistration', owner: 'UBC IAM', blocking: true, deliveredBy: 'P4' },
  {
    item: 'PrivacyAssessment',
    owner: 'UBC Privacy Office',
    blocking: true,
    deliveredBy: 'P4',
  },
  {
    item: 'PreProductionRehearsal',
    owner: 'Manifest',
    blocking: true,
    deliveredBy: 'P4',
  },
  {
    item: 'DependencyAndSecretScans',
    owner: 'Manifest',
    blocking: true,
    deliveredBy: 'P3',
  },
  { item: 'AdminApproval', owner: 'platform admin', blocking: true, deliveredBy: 'P4' },
] as const

export async function registerDeliveryRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
): Promise<void> {
  app.post('/projects/:projectId/builds', async (request, reply) => {
    const actor = requireActor(request)
    const { projectId } = request.params as { projectId: string }
    await assertCapability(deps.db, actor, projectId, 'build:create')

    const parsed = buildBody.safeParse(request.body ?? {})
    if (!parsed.success)
      throw new BadRequestError('BUILD_INVALID_INPUT', parsed.error.message)

    const [spec] = await deps.db
      .select()
      .from(appSpecs)
      .where(eq(appSpecs.projectId, projectId))
      .orderBy(desc(appSpecs.createdAt))
      .limit(1)
    if (!spec)
      throw new BadRequestError(
        'SPEC_NOT_FOUND',
        'this project has no validated spec yet',
      )
    if (!spec.valid) {
      throw new BadRequestError(
        'SPEC_INVALID',
        'the latest manifest.yaml is not valid, so there is nothing to build',
        'GET /projects/:id/spec lists the errors.',
      )
    }

    const [project] = await deps.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
    if (!project) throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)

    // D30/§25: the spec is checked against the blueprint it pins, here rather than at
    // validation time, because a blueprint's major version can move under a spec that
    // has not changed. This is `checkBlueprintCompatibility`'s call site.
    const descriptor = deps.blueprints.resolve(project.blueprintRef)
    if (!descriptor) {
      throw new BadRequestError(
        'BLUEPRINT_NOT_FOUND',
        `this project pins '${project.blueprintRef}', which is no longer in the registry`,
      )
    }
    const incompatibilities = checkBlueprintCompatibility(
      spec.parsed as ManifestSpec,
      descriptor,
    )
    if (incompatibilities.length > 0) throw new SpecInvalidError(incompatibilities)

    const { status, body } = await app.idempotent(request, async () => {
      const build = await startBuild(deps.db, deps.driver, {
        projectId,
        projectSlug: project.slug,
        appSpecId: spec.id,
        commitSha: parsed.data.commitSha ?? spec.commitSha,
        blueprintRef: project.blueprintRef,
        // The PATH, from D5's driver, not a hand-built `file://` URL. The driver
        // passes this straight to `git --git-dir=`, which does not accept a URL:
        // `fatal: not a git repository`. Nothing caught it, because the export
        // was a shell pipeline whose exit status came from `tar` — so the build
        // proceeded with an EMPTY context and failed at the lockfile gate,
        // naming a file the repository actually has. Both halves fixed 2026-09-07.
        repoPath: deps.source.repositoryFor(project.slug).path,
      })
      return { status: 201, body: build }
    })
    return reply.status(status).send(body)
  })

  app.get('/builds/:buildId', async (request) => {
    const actor = requireActor(request)
    const { buildId } = request.params as { buildId: string }
    const build = await getBuild(deps.db, buildId)
    // The project comes from the resource, never from the request.
    if (!build) throw new AuthorizationError('NOT_FOUND', `no build '${buildId}'`)
    await assertCapability(deps.db, actor, build.projectId, 'project:read')
    return build
  })

  /**
   * §14's build log. Authorized exactly like the build above — the project comes
   * from the build ROW, never from the request — and before the query is looked
   * at, so a stranger learns nothing from a 400 that a 404 would have hidden.
   *
   * AFTER THE FACT, not a live tail (pre-flight 111): `POST …/builds` awaits the
   * whole build and only then returns the id this route needs. Live delivery is
   * `WS /projects/:projectId/events` (Task 14), published from `onLog` (Task 15).
   */
  app.get('/builds/:buildId/logs', async (request) => {
    const actor = requireActor(request)
    const { buildId } = request.params as { buildId: string }
    const build = await getBuild(deps.db, buildId)
    if (!build) throw new AuthorizationError('NOT_FOUND', `no build '${buildId}'`)
    await assertCapability(deps.db, actor, build.projectId, 'project:read')

    const query = logsQuery.safeParse(request.query ?? {})
    if (!query.success) {
      throw new BadRequestError(
        'BUILD_LOG_INVALID_QUERY',
        query.error.message,
        '`tail` is a whole number of lines, from 1 to 10000; leave it out for the whole log.',
      )
    }
    const lines = await readBuildLog(
      deps.db,
      buildId,
      query.data.tail === undefined ? {} : { tail: query.data.tail },
    )
    return { buildId, lines }
  })

  app.post('/projects/:projectId/releases', async (request, reply) => {
    const actor = requireActor(request)
    const { projectId } = request.params as { projectId: string }
    await assertCapability(deps.db, actor, projectId, 'release:create')

    const parsed = releaseBody.safeParse(request.body)
    if (!parsed.success)
      throw new BadRequestError('RELEASE_INVALID_INPUT', parsed.error.message)

    const [project] = await deps.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
    if (!project) throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)

    const [spec] = await deps.db
      .select()
      .from(appSpecs)
      .where(eq(appSpecs.projectId, projectId))
      .orderBy(desc(appSpecs.createdAt))
      .limit(1)
    if (!spec)
      throw new BadRequestError(
        'SPEC_NOT_FOUND',
        'this project has no validated spec yet',
      )

    const { status, body } = await app.idempotent(request, async () => {
      const parsedSpec = spec.parsed as ManifestSpec
      const descriptor = deps.blueprints.resolve(project.blueprintRef)
      if (!descriptor) {
        throw new BadRequestError(
          'BLUEPRINT_NOT_FOUND',
          `this project pins '${project.blueprintRef}', which is no longer in the registry`,
        )
      }
      const defaults = descriptor.defaults.resources

      const release = await createRelease(deps.db, {
        projectId,
        buildId: parsed.data.buildId,
        appSpecId: spec.id,
        createdBy: actor.userId,
        ...(parsed.data.summary === undefined ? {} : { summary: parsed.data.summary }),
        // Resolved once, at release time, and frozen — all three environments
        // together, so promotion applies the exact numbers the approver saw.
        resolvedConfig: {
          sandbox: resolveConfig(parsedSpec, 'sandbox', defaults),
          staging: resolveConfig(parsedSpec, 'staging', defaults),
          production: resolveConfig(parsedSpec, 'production', defaults),
        },
      })
      return { status: 201, body: release }
    })
    return reply.status(status).send(body)
  })

  app.post('/environments/:environmentId/deploy', async (request, reply) => {
    const actor = requireActor(request)
    const { environmentId } = request.params as { environmentId: string }

    const [environment] = await deps.db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId))
    if (!environment)
      throw new AuthorizationError('NOT_FOUND', `no environment '${environmentId}'`)
    await assertCapability(deps.db, actor, environment.projectId, 'release:deploy')

    const parsed = deployBody.safeParse(request.body)
    if (!parsed.success)
      throw new BadRequestError('DEPLOY_INVALID_INPUT', parsed.error.message)

    // §13: not forbidden, not ready. Say which items and who owns them.
    if (environment.kind === 'production') {
      return reply.status(409).send({
        error: {
          code: 'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
          message: 'first production launch is a checklist, not a button (§13, D19)',
          hint: 'These items have multi-week lead times and are tracked from project creation.',
          launchReadiness: LAUNCH_READINESS,
        },
      })
    }

    const { status, body } = await app.idempotent(request, async () => {
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
        },
        {
          releaseId: parsed.data.releaseId,
          environmentId,
        },
      )
      return { status: 200, body: instance }
    })
    return reply.status(status).send(body)
  })

  app.get('/environments/:environmentId', async (request) => {
    const actor = requireActor(request)
    const { environmentId } = request.params as { environmentId: string }

    const [environment] = await deps.db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId))
    if (!environment)
      throw new AuthorizationError('NOT_FOUND', `no environment '${environmentId}'`)
    await assertCapability(deps.db, actor, environment.projectId, 'project:read')

    const [instance] = await deps.db
      .select()
      .from(instances)
      .where(eq(instances.environmentId, environmentId))
      .orderBy(desc(instances.lastSeenAt))
      .limit(1)

    return { ...environment, instance: instance ?? null }
  })

  /**
   * §14's Incidents for one environment, newest first — each with the repair prompt §14
   * says it is shaped to become (P4b Task 13), so an agent reads exactly what a faculty
   * member would hand it. Authorized like the environment itself: the project comes from
   * the environment ROW, never from the request.
   */
  app.get('/environments/:environmentId/incidents', async (request) => {
    const actor = requireActor(request)
    const { environmentId } = request.params as { environmentId: string }

    const [environment] = await deps.db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId))
    if (!environment)
      throw new AuthorizationError('NOT_FOUND', `no environment '${environmentId}'`)
    await assertCapability(deps.db, actor, environment.projectId, 'project:read')

    const [project] = await deps.db
      .select({ slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, environment.projectId))
    if (!project)
      throw new AuthorizationError('NOT_FOUND', `no project '${environment.projectId}'`)

    const incidents = await listIncidents(deps.db, environmentId)
    return {
      environmentId,
      incidents: incidents.map((incident) => ({
        ...incident,
        prompt: incidentPrompt(incident, {
          slug: project.slug,
          environmentKind: environment.kind,
        }),
      })),
    }
  })
}
