import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { z } from 'zod/v4'
import { appSpecs } from '../../db/index.js'
import type { ModelCatalogue } from '../../ai/index.js'
import { renderProjectSeed } from '../../blueprints/index.js'
import { makeRedactor, publishEvent } from '../../observability/index.js'
import {
  actorPhrase,
  assertCapability,
  assertSlugAvailable,
  AuthorizationError,
  createProject,
  deleteProject,
  projectViews,
  recordRepository,
  renameProject,
} from '../../projects/index.js'
import { SourceError, type RepoRef, type RepositoryLink } from '../../source/index.js'
import { declaresModels, validateSpec } from '../../spec/index.js'
import type { ValidationContext } from '../../spec/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { PATH } from '../contract/schemas.js'
import { BadRequestError } from '../errors.js'
import { toEnvironment } from '../representations/environments.js'
import {
  CreatedProject,
  CreateProjectRequest,
  Project,
  toProject,
  UpdateProjectRequest,
} from '../representations/projects.js'

const ProjectParams = z.strictObject({ projectId: PATH.projectId })

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

/**
 * An operator line's copy of a message, with this machine's paths replaced (FE-41, the launch path
 * plan's Task 6a): a `SourceError` is NOT path-free — driver 1's git failure carries git's whole
 * command line, the repository's path in it (`local-driver.ts`), and driver 2's local git names its
 * mirror or its scratch directory. The repository root and the temporary directory, each in both of
 * macOS's spellings (`/var/…`, `/private/var/…`), longest first; never a bare `/`.
 */
function withoutLaptopPaths(text: string, reposRoot: string): string {
  const paths: [string, string][] = []
  for (const [dir, as] of [
    [resolve(reposRoot), '<repos>'],
    [tmpdir(), '<tmp>'],
  ] as const) {
    if (dir.length > 1) paths.push([dir, as], [`/private${dir}`, as])
  }
  let out = text
  for (const [dir, as] of paths.sort((a, b) => b[0].length - a[0].length)) {
    out = out.split(dir).join(as)
  }
  return out
}

/**
 * The validation context §7 needs but manifest.yaml cannot contain (Task 4) — and, since the
 * authoring API plan's Task 7, the project's pinned blueprint, which the manifest must name.
 */
export function validationContext(
  projectSlug: string,
  quota: Record<string, unknown>,
  models: ModelPolicy,
  projectBlueprint: string,
): ValidationContext {
  return {
    projectSlug,
    projectBlueprint,
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
export const projectWriteRoutes = [
  defineRoute({
    operationId: 'createProject',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects',
    tag: 'projects',
    summary: 'Create a project',
    description:
      'Creates a project: its three environments, and a repository seeded from the skeleton and the starter, whose manifest is validated. Session only (`TOKEN_CREDENTIAL_REFUSED` for a delegated token). Progress arrives on the project’s event stream: `project.created`, `repository.seeded`, `spec.validated`.',
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
      'SOURCE_SECRET_DETECTED',
      'SOURCE_UNREACHABLE',
      'AI_BACKEND_UNAVAILABLE',
      'AI_CATALOGUE_EMPTY',
      'TOKEN_CREDENTIAL_REFUSED',
    ],
    examples: {
      request: {
        slug: 'fixture-40adbffa',
        blueprint: 'fixture-node@1',
        audience: { scale: 'solo', burst: 'steady' },
      },
      response: {
        id: '2851c199-1ddd-4635-aca4-d5f173a904eb',
        slug: 'fixture-40adbffa',
        name: 'fixture-40adbffa',
        blueprint: 'fixture-node@1',
        starter: null,
        owner: { id: '25ecede0-2db6-462f-a5f5-e56a27a8b401', displayName: 'Bio Prof' },
        audience: {
          scale: 'solo',
          burst: 'steady',
          justification: null,
          setBy: '25ecede0-2db6-462f-a5f5-e56a27a8b401',
          setAt: '2026-09-26T21:47:45.365Z',
        },
        createdAt: '2026-09-26T21:47:45.365Z',
        launchedAt: null,
        state: 'active',
        archivedAt: null,
        repository: {
          provider: 'local',
          fullName: 'fixture-40adbffa',
          webUrl: null,
          mainProtected: true,
          protectionDetail: null,
          visibility: null,
        },
        environments: [
          {
            id: 'b0c5266e-e5cf-4695-9237-96574a847f68',
            projectId: '2851c199-1ddd-4635-aca4-d5f173a904eb',
            kind: 'sandbox',
            hostname: 'fixture-40adbffa.sandbox.manifest.internal',
            url: 'https://fixture-40adbffa.sandbox.manifest.internal',
            instance: null,
          },
          {
            id: '0c05344a-9022-4a93-b868-101b66b7a6c9',
            projectId: '2851c199-1ddd-4635-aca4-d5f173a904eb',
            kind: 'staging',
            hostname: 'fixture-40adbffa.staging.manifest.internal',
            url: 'https://fixture-40adbffa.staging.manifest.internal',
            instance: null,
          },
        ],
        spec: {
          appSpecId: '23b24e73-d35c-4cb9-b971-2bfc465419c9',
          commitSha: 'a9a0a5d69c68020e2f4adf3330fd6e3c2f0bab20',
          valid: true,
          errors: [],
          warnings: [],
          sensitiveDiff: { sensitive: false, fields: [] },
        },
      },
    },
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
          // The slug when none is given — `createProject` states that rule once (Decision 13).
          ...(body.name === undefined ? {} : { name: body.name }),
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
      let link: RepositoryLink
      /**
       * SET ONCE `createRepository` RETURNED (the launch path plan's Task 2, *Read this first* 13):
       * from then on the repository exists — on GitHub, for driver 2 — and a failure below must
       * destroy it, or it stays there with its mirror here and the slug is refused
       * `SOURCE_REPOSITORY_EXISTS` for ever. A failure INSIDE `createRepository` leaves this unset:
       * the driver undoes its own steps.
       */
      let made: RepoRef | undefined
      try {
        const created = await deps.source.createRepository(body.slug, seed)
        const repo = created.ref
        made = repo
        link = created.link
        // Which driver made it, what its host calls it and whether `main` is protected there
        // (the D5 plan's Decision 3, Task 12): every later source operation checks the
        // provider against the running driver's, and `Project.repository` reads the rest.
        await recordRepository(deps.db, project.id, link)
        commitSha = await deps.source.headCommit(repo)
        yamlText = (await deps.source.readFile(repo, commitSha, 'manifest.yaml')) ?? ''
      } catch (error) {
        // SAID FIRST, before a cleanup that could fail in its place (FE-41, the launch path plan's
        // Task 6a): a `SourceError` is answered 409 or 503, which the error handler does not log, so
        // a create GitHub failed left no trace but the client's. Driver 2's messages are redacted of
        // every token it holds; the paths go here.
        console.error(
          `POST /v1/projects: ${body.slug} was not created; its repository step failed (${error instanceof SourceError ? error.code : error instanceof Error ? error.name : typeof error}): ${withoutLaptopPaths(error instanceof Error ? error.message : String(error), deps.config.reposRoot)}`,
        )
        if (made !== undefined) {
          const repo = made
          // Never swallowed, and never answered in place of the failure that caused it: a
          // repository left behind is an operator line naming what to remove.
          await deps.source.destroyRepository(repo).catch((cleanup: unknown) => {
            console.error(
              `POST /v1/projects: ${body.slug}'s repository was made by the ${repo.provider} driver and could not be destroyed after the create failed; it is still there (${cleanup instanceof Error ? cleanup.message : String(cleanup)})`,
            )
          })
        }
        // The row goes whatever the repository did (its `source_repositories` row with it,
        // ON DELETE CASCADE): the slug is not held by a project that never finished.
        await deleteProject(deps.db, project.id)
        throw error
      }
      // 6. What was seeded, validated and recorded.
      const result = validateSpec(
        yamlText,
        validationContext(
          project.slug,
          project.quota as Record<string, unknown>,
          models,
          project.blueprintRef,
        ),
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

      // `main` NOT protected where the code lives (Task 12, Decision 13) — NEVER SILENTLY, and
      // LAST, with the creation's other events, after every row that can fail (sitting 5's
      // F3: `audit.events` RESTRICTs the delete that undoes a failed creation). GitHub's own
      // words stay on the link; the event carries Manifest's.
      if (!link.mainProtected) {
        await publishEvent(
          deps.db,
          deps.bus,
          {
            projectId: project.id,
            subject: `repository:${project.slug}`,
            type: 'repository.protection_unavailable',
            machineDetail: {
              ref: 'refs/heads/main',
              detail:
                'the host would not protect main; a person can rewrite or delete it there',
            },
            humanMessage:
              `${link.fullName}'s main is NOT protected: GitHub would not protect it (see the project's repository), ` +
              'so a person can force-push or delete it on GitHub. Manifest keeps every commit a release names either way.',
          },
          redact,
        )
      }

      const [view] = await projectViews(deps, [project.id])
      return {
        ...toProject(view!),
        environments: created.map((row) => toEnvironment(row, undefined)),
        spec: {
          appSpecId: appSpec.id,
          commitSha,
          valid: result.valid,
          errors: result.valid ? [] : result.errors,
          warnings: result.warnings,
          sensitiveDiff: { sensitive: false, fields: [] },
        },
      }
    },
  }),
  /**
   * WHAT PEOPLE CALL A PROJECT, CHANGED (the front-end enablement plan's Task 6, Decision 13) — the
   * API's first `PATCH`. `project:write`, so a collaborator and a token holding it may; the slug,
   * and every hostname, SP entity and repository derived from it, never moves. A rename to the name
   * it already has answers the project and publishes nothing: the event is a change.
   */
  defineRoute({
    operationId: 'updateProject',
    method: 'PATCH',
    path: '/v1/projects/{projectId}',
    tag: 'projects',
    summary: 'Rename a project',
    description:
      'Renames the project: `name` is any text of 1 to 80 characters on one line. The slug, and so every hostname and the repository, never changes. Publishes `project.renamed`; renaming to the current `name` answers the project and publishes nothing.',
    params: ProjectParams,
    query: NO_QUERY,
    body: UpdateProjectRequest,
    success: { status: 200, description: 'The project, as it now is.', schema: Project },
    capability: 'project:write',
    errors: ['NOT_FOUND', 'FORBIDDEN'],
    examples: {
      request: { name: 'CHEM 121 — Lab notebook' },
      response: {
        id: '77811340-0c79-4c30-a00f-b87e8460b6cf',
        slug: 'chem-labs',
        name: 'CHEM 121 — Lab notebook',
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
        state: 'active',
        archivedAt: null,
        repository: {
          provider: 'local',
          fullName: 'chem-labs',
          webUrl: null,
          mainProtected: true,
          protectionDetail: null,
          visibility: null,
        },
      },
    },
    handler: async ({ deps, actor, params, body }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:write')
      const renamed = await renameProject(deps.db, params.projectId, body.name)
      if (renamed === undefined)
        throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      const [view] = await projectViews(deps, [params.projectId])
      if (view === undefined)
        throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      if (renamed.from !== body.name) {
        await publishEvent(
          deps.db,
          deps.bus,
          {
            projectId: params.projectId,
            subject: `project:${view.project.slug}`,
            type: 'project.renamed',
            machineDetail: {
              from: renamed.from,
              to: body.name,
              via: actor.credential,
              userId: actor.userId,
              tokenId: actor.credential === 'token' ? actor.tokenId : null,
            },
            // Both names QUOTED: each is somebody's free text inside a sentence another
            // person reads (the review's Minor 1).
            humanMessage: `${await actorPhrase(deps.db, actor)} renamed the project from “${renamed.from}” to “${body.name}”.`,
          },
          makeRedactor([]),
        )
      }
      return toProject(view)
    },
  }),
]
