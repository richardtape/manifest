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
import type { ModelCatalogue } from '../../ai/index.js'
import { isSensitiveDiff, validateSpec } from '../../spec/index.js'
import type { ManifestSpec, ValidationContext } from '../../spec/index.js'
import { BadRequestError, SpecInvalidError } from '../errors.js'
import { requireActor, type ServerDeps } from '../server.js'

const createBody = z.object({
  slug: z
    .string()
    .regex(/^[a-z][a-z0-9-]{2,38}$/, 'slug must match ^[a-z][a-z0-9-]{2,38}$'),
  blueprint: z.string().min(1),
})

const specBody = z.object({ commitSha: z.string().min(1).optional() })

const memberBody = z.object({
  puid: z.string().min(1).max(64),
  role: z.enum(['owner', 'collaborator']),
})

type ModelPolicy = Pick<ValidationContext, 'aiEnabled' | 'modelCatalogue'>

/**
 * D17's half of the validation context — LiteLLM's catalogue (`ai/catalogue.ts`, P4b
 * Task 6). This route used to carry its own copy of that list, which was a second
 * source of truth for the check that stops "a privacy incident at runtime" (§7).
 *
 * AWAITED BEFORE ANYTHING IS WRITTEN. Project creation inserts the project row and
 * creates the repository before it validates, so a read that failed after them left
 * a project with no spec whose retry collided with its own slug (sitting 4,
 * finding 45). A failed read is a 503 and nothing else.
 */
async function modelPolicy(catalogue: ModelCatalogue): Promise<ModelPolicy> {
  // A disabled catalogue is never READ: there is no client behind it (finding 38).
  if (!catalogue.enabled) return { aiEnabled: false, modelCatalogue: [] }
  return { aiEnabled: true, modelCatalogue: await catalogue.get() }
}

/** The validation context §7 needs but manifest.yaml cannot contain (Task 4). */
function validationContext(
  projectSlug: string,
  quota: Record<string, unknown>,
  models: ModelPolicy,
): ValidationContext {
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
    ...models,
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
      // FIRST — before the project row and the repository exist. See modelPolicy.
      const models = await modelPolicy(deps.catalogue)
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
        validationContext(slug, project.quota as Record<string, unknown>, models),
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
   * gate with nothing behind it would be a control on paper. Reporting it gives P6
   * a call site instead of a function that has never been called by anything but
   * its own test.
   */
  app.post('/projects/:projectId/spec', async (request, reply) => {
    const actor = requireActor(request)
    const { projectId } = request.params as { projectId: string }
    await assertCapability(deps.db, actor, projectId, 'project:write')

    const parsedBody = specBody.safeParse(request.body ?? {})
    if (!parsedBody.success)
      throw new BadRequestError('SPEC_INVALID_INPUT', parsedBody.error.message)

    const project = await getProject(deps.db, projectId)
    if (!project)
      throw new BadRequestError('PROJECT_NOT_FOUND', `no project '${projectId}'`)

    const [previous] = await deps.db
      .select()
      .from(appSpecs)
      .where(eq(appSpecs.projectId, projectId))
      .orderBy(desc(appSpecs.createdAt))
      .limit(1)

    const { status, body } = await app.idempotent(request, async () => {
      const models = await modelPolicy(deps.catalogue)
      const repo = deps.source.repositoryFor(project.slug)
      const commitSha = parsedBody.data.commitSha ?? (await deps.source.headCommit(repo))
      const yamlText =
        (await deps.source.readFile(repo, commitSha, 'manifest.yaml')) ?? ''
      const result = validateSpec(
        yamlText,
        validationContext(project.slug, project.quota as Record<string, unknown>, models),
      )
      const [appSpec] = await deps.db
        .insert(appSpecs)
        .values({
          projectId,
          commitSha,
          parsed: result.valid ? result.spec : {},
          schemaVersion: 1,
          valid: result.valid,
          errors: result.valid ? [] : result.errors,
        })
        .returning()

      const sensitive =
        result.valid && previous?.valid === true
          ? isSensitiveDiff(previous.parsed as ManifestSpec, result.spec)
          : { sensitive: false, fields: [] }

      return {
        status: 201,
        body: {
          appSpecId: appSpec!.id,
          commitSha,
          valid: result.valid,
          errors: result.valid ? [] : result.errors,
          // D9. Reported, not enforced — see the note above.
          sensitiveDiff: sensitive,
        },
      }
    })
    return reply.status(status).send(body)
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
