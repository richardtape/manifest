import { appSpecs } from '../../db/index.js'
import type { ModelCatalogue } from '../../ai/index.js'
import { renderProjectSeed } from '../../blueprints/index.js'
import { makeRedactor, publishEvent } from '../../observability/index.js'
import {
  assertSlugAvailable,
  createProject,
  deleteProject,
  projectViews,
  recordRepository,
} from '../../projects/index.js'
import { declaresModels, validateSpec } from '../../spec/index.js'
import type { ValidationContext } from '../../spec/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { BadRequestError } from '../errors.js'
import { toEnvironment } from '../representations/environments.js'
import {
  CreatedProject,
  CreateProjectRequest,
  toProject,
} from '../representations/projects.js'

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

/**
 * §22 steps 2–3 (P5a Task 11), in Decision 29's order: the blueprint and starter exist →
 * the slug (§23's one function) → the seed rendered and the catalogue read if it declares
 * a model → the rows in one transaction → the repository, and the project deleted if that
 * fails → the spec validated and recorded → the three events, LAST.
 */
export const createProjectRoutes = [
  defineRoute({
    operationId: 'createProject',
    method: 'POST',
    path: '/v1/projects',
    tag: 'projects',
    summary: 'Create a project',
    description:
      '§22 steps 2–3: a name, a blueprint, optionally a starter, and who the app is for (§24). Interactive sessions only: a delegated token is scoped to one project and cannot make another (D24, P5b Decision 13), which is also what keeps §24’s audience question human-only (D29). Creates the project and its three environments, seeds a repository from the skeleton and the starter, and validates its manifest. Progress is on the project’s event stream: project.created, repository.seeded, spec.validated.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: CreateProjectRequest,
    success: {
      status: 201,
      description: 'The project, as created.',
      schema: CreatedProject,
    },
    errors: [
      'SLUG_INVALID',
      'SLUG_RESERVED',
      'SLUG_TAKEN',
      'BLUEPRINT_NOT_FOUND',
      'STARTER_NOT_FOUND',
      'SOURCE_GIT_FAILED',
      'SOURCE_GITHUB_REFUSED',
      'SOURCE_REPOSITORY_EXISTS',
      'SOURCE_REPOSITORY_NOT_PRIVATE',
      'SOURCE_UNREACHABLE',
      'AI_BACKEND_UNAVAILABLE',
      'AI_CATALOGUE_EMPTY',
      'TOKEN_CREDENTIAL_REFUSED',
    ],
    handler: async ({ deps, request, body }) => {
      /**
       * INTERACTIVE ONLY (P5b Decision 13), and this refusal carries more than it looks.
       *
       * D24's prose says a token can "create projects", but a token is scoped to ONE
       * project (Decision 3), so a token that created a second would either escape its
       * scope or make something it cannot then address. **And §24's audience is stated
       * at creation and nowhere else** — there is no route that changes one — so refusing
       * creation to a token is what keeps D29's "the audience question is human-only"
       * true BY CONSTRUCTION rather than by a rule somebody has to remember when the
       * audience-change route is written. Decision 12a; `credential.test.ts` asserts it
       * rather than leaving it to be inferred.
       *
       * No capability check runs on this route — there is no project yet to be a member
       * of — so Task 6's central refusal can never see it. That is the structural reason
       * this one is stated here and not there (`[M1]`).
       */
      const actor = requireSession(request)
      // 1. The blueprint and the starter exist — before anything is checked against them.
      const descriptor = deps.blueprints.resolve(body.blueprint)
      if (descriptor === undefined) {
        throw new BadRequestError(
          'BLUEPRINT_NOT_FOUND',
          `no blueprint '${body.blueprint}'`,
          `Available: ${deps.blueprints
            .list()
            .map((b) => `${b.blueprint}@${b.major_version}`)
            .join(', ')}`,
        )
      }
      if (
        body.starter !== undefined &&
        deps.blueprints.starter(body.blueprint, body.starter) === undefined
      ) {
        const offered = (descriptor.starters ?? []).map((s) => s.name)
        throw new BadRequestError(
          'STARTER_NOT_FOUND',
          `blueprint '${body.blueprint}' offers no starter '${body.starter}'`,
          offered.length === 0
            ? 'This blueprint offers no starters; leave `starter` out.'
            : `Offered: ${offered.join(', ')}`,
        )
      }
      // 2. The name — §23's one function, before the catalogue is read for it.
      await assertSlugAvailable(deps.db, deps.reservedLabels, body.slug)
      // 3. The seed, and the catalogue only if the seed declares a model — BEFORE anything
      //    is written, so a gateway outage writes nothing (P4b finding 45).
      const seed = renderProjectSeed(deps.blueprints, {
        blueprintRef: body.blueprint,
        slug: body.slug,
        ...(body.starter === undefined ? {} : { starter: body.starter }),
      })
      const models = await modelPolicy(deps.catalogue, seed['manifest.yaml']!)
      // 4. The rows, in one transaction.
      const { project, environments: created } = await createProject(
        deps.db,
        deps.config,
        deps.reservedLabels,
        {
          slug: body.slug,
          ownerId: actor.userId,
          blueprintRef: body.blueprint,
          starter: body.starter ?? null,
          audience: {
            scale: body.audience.scale,
            burst: body.audience.burst,
            justification: body.audience.justification ?? null,
            set_by: actor.userId,
            set_at: new Date().toISOString(),
          },
        },
      )
      // 5. The repository — and no project without one (P4b finding 178, Decision 29).
      let commitSha: string
      let yamlText: string
      try {
        const repo = await deps.source.createRepository(body.slug, seed)
        // Which driver made it, and what its host calls it (the D5 plan's Decision 3): every
        // later source operation checks the provider against the running driver's.
        await recordRepository(deps.db, project.id, {
          provider: deps.source.name,
          ...(await deps.source.describeRepository(repo)),
        })
        commitSha = await deps.source.headCommit(repo)
        yamlText = (await deps.source.readFile(repo, commitSha, 'manifest.yaml')) ?? ''
      } catch (error) {
        await deleteProject(deps.db, project.id)
        throw error
      }
      // 6. What was seeded, validated and recorded.
      const result = validateSpec(
        yamlText,
        validationContext(project.slug, project.quota as Record<string, unknown>, models),
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
      if (!appSpec) throw new Error('app_specs insert returned no row')
      // 7. The events — LAST, so no audit row exists for a project whose repository failed,
      //    which `audit.events`' RESTRICT would stop step 5 deleting. Nothing secret exists
      //    yet; the redactor still runs, as §14 requires of every event.
      const redact = makeRedactor([])
      const subject = `project:${project.slug}`
      const files = Object.keys(seed).length
      await publishEvent(
        deps.db,
        deps.bus,
        {
          projectId: project.id,
          subject,
          type: 'project.created',
          machineDetail: {
            slug: project.slug,
            blueprint: body.blueprint,
            starter: body.starter ?? null,
            audience: { scale: body.audience.scale, burst: body.audience.burst },
          },
          humanMessage: `${project.slug} was created from ${body.blueprint}${body.starter === undefined ? '' : ` with the ${body.starter} starter`}.`,
        },
        redact,
      )
      await publishEvent(
        deps.db,
        deps.bus,
        {
          projectId: project.id,
          subject,
          type: 'repository.seeded',
          machineDetail: { commitSha, files, starter: body.starter ?? null },
          humanMessage: `${project.slug}'s repository was created with ${files} files.`,
        },
        redact,
      )
      const errorCount = result.valid ? 0 : result.errors.length
      await publishEvent(
        deps.db,
        deps.bus,
        {
          projectId: project.id,
          subject,
          type: 'spec.validated',
          machineDetail: {
            appSpecId: appSpec.id,
            commitSha,
            valid: result.valid,
            errorCount,
          },
          humanMessage: result.valid
            ? `${project.slug}'s manifest.yaml is valid.`
            : `${project.slug}'s manifest.yaml has ${errorCount} problem(s) to fix.`,
        },
        redact,
      )

      const [view] = await projectViews(deps.db, [project.id])
      return {
        ...toProject(view!),
        environments: created.map((row) => toEnvironment(row, undefined)),
        spec: {
          appSpecId: appSpec.id,
          commitSha,
          valid: result.valid,
          errors: result.valid ? [] : result.errors,
          sensitiveDiff: { sensitive: false, fields: [] },
        },
      }
    },
  }),
]
