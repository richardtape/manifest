import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { appSpecs } from '../../db/index.js'
import { createProject } from '../../projects/index.js'
import type { ModelCatalogue } from '../../ai/index.js'
import { declaresModels, validateSpec } from '../../spec/index.js'
import type { ValidationContext } from '../../spec/index.js'
import { BadRequestError } from '../errors.js'
import { requireActor, type ServerDeps } from '../server.js'

const createBody = z.object({
  // Not §7's rule: that is `checkSlug`'s, so creation and GET /v1/slugs/{slug} refuse a
  // name with the same code and the same sentence (§23, P5a Task 9).
  slug: z.string().min(1),
  blueprint: z.string().min(1),
})

type ModelPolicy = Pick<
  ValidationContext,
  'aiEnabled' | 'modelCatalogue' | 'unclassifiedModels'
>

/**
 * D17's half of the validation context — LiteLLM's catalogue (`ai/catalogue.ts`, P4b
 * Task 6). This route used to carry its own copy of that list, which was a second
 * source of truth for the check that stops "a privacy incident at runtime" (§7).
 *
 * READ ONLY FOR A MANIFEST THAT DECLARES A MODEL. §7 as amended on 2026-09-14 promises
 * that an app declaring none validates and deploys as normal, and this used to await
 * the catalogue for every validation — so a gateway outage refused every project
 * creation, whose seeded manifest declares no model at all (P4b Task 9, sitting 4's
 * call).
 *
 * AWAITED BEFORE ANYTHING IS WRITTEN. Project creation inserts the project row and
 * creates the repository before it validates, so a read that failed after them left
 * a project with no spec whose retry collided with its own slug (sitting 4,
 * finding 45). A failed read is a 503 and nothing else.
 */
export async function modelPolicy(
  catalogue: ModelCatalogue,
  yamlText: string,
): Promise<ModelPolicy> {
  // A disabled catalogue is never READ: there is no client behind it (finding 38).
  if (!catalogue.enabled) {
    return { aiEnabled: false, modelCatalogue: [], unclassifiedModels: [] }
  }
  if (!declaresModels(yamlText)) {
    return { aiEnabled: true, modelCatalogue: [], unclassifiedModels: [] }
  }
  const { models, unclassified } = await catalogue.get()
  return { aiEnabled: true, modelCatalogue: models, unclassifiedModels: unclassified }
}

/** The validation context §7 needs but manifest.yaml cannot contain (Task 4). */
export function validationContext(
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
  app.post('/v1/projects', async (request, reply) => {
    const actor = requireActor(request)
    const parsed = createBody.safeParse(request.body)
    if (!parsed.success) {
      throw new BadRequestError(
        'PROJECT_INVALID_INPUT',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        'Send `slug` and `blueprint`. GET /v1/slugs/{slug} says whether a name will be accepted.',
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
      const seeded = [
        'manifest: 1',
        `name: ${slug}`,
        `blueprint: ${blueprint}`,
        'runtime:',
        `  port: ${descriptor.runtime.default_port}`,
        `  health: ${descriptor.runtime.health_path}`,
        '',
      ].join('\n')
      // FIRST — before the project row and the repository exist. See modelPolicy. The
      // seeded manifest declares no model, so the catalogue is not read here at all.
      const models = await modelPolicy(deps.catalogue, seeded)
      const { project, environments } = await createProject(
        deps.db,
        deps.config,
        deps.reservedLabels,
        {
          slug,
          ownerId: actor.userId,
          blueprintRef: blueprint,
        },
      )

      // §22 step 3: "repository created, manifest.yaml validated".
      const repo = await deps.source.createRepository(slug, {
        'manifest.yaml': seeded,
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
}
