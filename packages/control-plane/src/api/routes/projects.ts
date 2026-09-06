import type { FastifyInstance } from 'fastify'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { appSpecs, users } from '../../db/index.js'
import {
  addMember,
  assertCapability,
  createProject,
  getProject,
  listEnvironments,
  listProjectsFor,
} from '../../projects/index.js'
import { validateSpec } from '../../spec/index.js'
import { BadRequestError, SpecInvalidError } from '../errors.js'
import { requireActor, type ServerDeps } from '../server.js'

const createBody = z.object({
  slug: z
    .string()
    .regex(/^[a-z][a-z0-9-]{2,38}$/, 'slug must match ^[a-z][a-z0-9-]{2,38}$'),
  blueprint: z.string().min(1),
})

const memberBody = z.object({
  puid: z.string().min(1).max(64),
  role: z.enum(['owner', 'collaborator']),
})

/** The validation context §7 needs but manifest.yaml cannot contain (Task 4). */
function validationContext(projectSlug: string, quota: Record<string, unknown>) {
  return {
    projectSlug,
    attributeWhitelist: [
      'ubcEduCwlPuid',
      'mail',
      'givenName',
      'sn',
      'eduPersonAffiliation',
    ],
    serviceCatalogue: ['mongo', 'qdrant'],
    modelCatalogue: [
      { name: 'default-chat-onprem', maxClassification: 'confidential' as const },
      { name: 'default-chat', maxClassification: 'internal' as const },
      { name: 'default-embed', maxClassification: 'internal' as const },
    ],
    quota: {
      maxCpu: Number(quota.max_cpu ?? 2),
      maxMemoryMi: 2048,
      maxServices: Number(quota.max_services ?? 3),
      aiMonthlyUsd: Number(quota.ai_monthly_usd ?? 50),
    },
  }
}

export async function registerProjectRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
): Promise<void> {
  app.post('/projects', async (request, reply) => {
    const actor = requireActor(request)
    const parsed = createBody.safeParse(request.body)
    if (!parsed.success) {
      throw new BadRequestError(
        'PROJECT_INVALID_INPUT',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        'Slugs are lowercase letters, digits and hyphens, 3–39 characters, starting with a letter.',
      )
    }
    const { slug, blueprint } = parsed.data

    const descriptor = deps.blueprints.resolve(blueprint)
    if (!descriptor) {
      throw new BadRequestError(
        'BLUEPRINT_NOT_FOUND',
        `no blueprint '${blueprint}'`,
        `Available: ${deps.blueprints
          .list()
          .map((b) => `${b.blueprint}@${b.major_version}`)
          .join(', ')}`,
      )
    }

    const { status, body } = await app.idempotent(request, async () => {
      const { project, environments } = await createProject(deps.db, deps.config, {
        slug,
        ownerId: actor.userId,
        blueprintRef: blueprint,
      })

      // §22 step 3: "repository created, manifest.yaml validated".
      const repo = await deps.source.createRepository(slug, {
        'manifest.yaml': [
          'manifest: 1',
          `name: ${slug}`,
          `blueprint: ${blueprint}`,
          'runtime:',
          `  port: ${descriptor.runtime.default_port}`,
          `  health: ${descriptor.runtime.health_path}`,
          '',
        ].join('\n'),
        'src/index.js': "import http from 'node:http'\n",
      })
      const commitSha = await deps.source.headCommit(repo)
      const yamlText =
        (await deps.source.readFile(repo, commitSha, 'manifest.yaml')) ?? ''

      const result = validateSpec(
        yamlText,
        validationContext(slug, project.quota as Record<string, unknown>),
      )
      const [appSpec] = await deps.db
        .insert(appSpecs)
        .values({
          projectId: project.id,
          commitSha,
          parsed: result.valid ? result.spec : {},
          schemaVersion: 1,
          valid: result.valid,
          errors: result.valid ? [] : result.errors,
        })
        .returning()

      return {
        status: 201,
        body: {
          id: project.id,
          slug: project.slug,
          blueprint: project.blueprintRef,
          repositoryUrl: repo.url,
          commitSha,
          specValid: result.valid,
          specErrors: result.valid ? [] : result.errors,
          appSpecId: appSpec!.id,
          environments: environments.map((e) => ({
            id: e.id,
            kind: e.kind,
            hostname: e.hostname,
          })),
        },
      }
    })

    return reply.status(status).send(body)
  })

  app.get('/projects', async (request) => {
    const actor = requireActor(request)
    return listProjectsFor(deps.db, actor)
  })

  app.get('/projects/:projectId', async (request) => {
    const actor = requireActor(request)
    const { projectId } = request.params as { projectId: string }
    await assertCapability(deps.db, actor, projectId, 'project:read')

    const project = await getProject(deps.db, projectId)
    const expand = String((request.query as { expand?: string }).expand ?? '').split(',')
    if (!expand.includes('environments')) return project

    return { ...project, environments: await listEnvironments(deps.db, projectId) }
  })

  app.get('/projects/:projectId/spec', async (request) => {
    const actor = requireActor(request)
    const { projectId } = request.params as { projectId: string }
    await assertCapability(deps.db, actor, projectId, 'project:read')

    const [latest] = await deps.db
      .select()
      .from(appSpecs)
      .where(eq(appSpecs.projectId, projectId))
      .orderBy(desc(appSpecs.createdAt))
      .limit(1)

    if (!latest)
      throw new BadRequestError(
        'SPEC_NOT_FOUND',
        'this project has no validated spec yet',
      )
    if (!latest.valid) throw new SpecInvalidError(latest.errors as never)

    return { commitSha: latest.commitSha, spec: latest.parsed, appSpecId: latest.id }
  })

  app.post('/projects/:projectId/members', async (request, reply) => {
    const actor = requireActor(request)
    const { projectId } = request.params as { projectId: string }
    // A collaborator reaches this line and is refused here. §13: "same as owner
    // except member management and deletion."
    await assertCapability(deps.db, actor, projectId, 'members:manage')

    const parsed = memberBody.safeParse(request.body)
    if (!parsed.success)
      throw new BadRequestError('MEMBER_INVALID_INPUT', parsed.error.message)

    const [user] = await deps.db
      .select()
      .from(users)
      .where(eq(users.ubcCwlPuid, parsed.data.puid))
    if (!user) {
      throw new BadRequestError(
        'MEMBER_USER_NOT_FOUND',
        `no user with PUID '${parsed.data.puid}' has ever logged in`,
        'A person must log in once before they can be added to a project.',
      )
    }

    const { status, body } = await app.idempotent(request, async () => {
      await addMember(deps.db, projectId, user.id, parsed.data.role)
      return { status: 201, body: { projectId, userId: user.id, role: parsed.data.role } }
    })
    return reply.status(status).send(body)
  })
}
