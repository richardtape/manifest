import type { FastifyInstance } from 'fastify'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { appSpecs, environments, projects } from '../../db/index.js'
import { assertCapability, AuthorizationError } from '../../projects/index.js'
import { createRelease, deployRelease } from '../../releases/index.js'
import { incidentPrompt, listIncidents } from '../../observability/index.js'
import { resolveConfig } from '../../spec/index.js'
import type { ManifestSpec } from '../../spec/index.js'
import { BadRequestError } from '../errors.js'
import { requireActor, type ServerDeps } from '../server.js'

const releaseBody = z.object({
  buildId: z.string().uuid(),
  summary: z.string().max(500).optional(),
})
const deployBody = z.object({ releaseId: z.string().uuid() })

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
  app.post('/v1/projects/:projectId/releases', async (request, reply) => {
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

  app.post('/v1/environments/:environmentId/deploy', async (request, reply) => {
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
          bus: deps.bus,
          retirer: deps.retirer,
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

  /**
   * §14's Incidents for one environment, newest first — each with the repair prompt §14
   * says it is shaped to become (P4b Task 13), so an agent reads exactly what a faculty
   * member would hand it. Authorized like the environment itself: the project comes from
   * the environment ROW, never from the request.
   */
  app.get('/v1/environments/:environmentId/incidents', async (request) => {
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
