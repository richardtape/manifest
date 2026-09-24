import type { FastifyRequest } from 'fastify'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import {
  appSpecs,
  builds,
  environments,
  projects,
  releases,
  type Db,
} from '../../db/index.js'
import { assertLaunchable } from '../../launch/index.js'
import { incidentPrompt, listIncidents } from '../../observability/index.js'
import {
  assertCapability,
  assertStepUp,
  AuthorizationError,
  type Actor,
} from '../../projects/index.js'
import {
  buildDiffSnapshot,
  createRelease,
  deployRelease,
  latestApprovalFor,
  recordApproval,
  ReleaseError,
} from '../../releases/index.js'
import { resolveConfig, type ManifestSpec } from '../../spec/index.js'
import { requireSession } from '../actor.js'
import type { ServerDeps } from '../server.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { BadRequestError } from '../errors.js'
import { IncidentList, toIncident } from '../representations/incidents.js'
import { Instance, toInstance } from '../representations/instances.js'
import {
  Approval,
  ApproveReleaseRequest,
  CreateReleaseRequest,
  DeployRequest,
  RejectReleaseRequest,
  Release,
  ReleaseList,
  toApproval,
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
 * §13's approval, in the four guards it needs, IN THIS ORDER — written once because
 * `approveRelease` and `rejectRelease` are one decision with two values, and two copies of
 * a security ordering is one copy that will be reordered.
 *
 * 1. **D14: an interactive session**, enforced by `requireSession`'s RETURN TYPE
 *    (Decision 18) — `recordApproval` needs the `puid` it returns, so reverting this line
 *    does not weaken a check, it stops compiling. It runs FIRST, before the release is
 *    read, so every token actor gets the same answer for every release id and a token
 *    learns nothing about which releases exist (Task 6's measured ordering).
 * 2. **WHO may decide** — `release:approve`, held by a platform admin alone. Its FIRST
 *    caller in this platform's life: the capability has existed since P5b and no route has
 *    ever asserted it.
 * 3. **§20: and they must have re-proved themselves inside `STEP_UP_TTL_MS`.** AFTER the
 *    capability check, deliberately, so somebody who may not approve is told *that* rather
 *    than sent on a round trip that would not help them.
 * 4. **§13: "Approval binds to an immutable image digest."** THE BUILD's digest, read
 *    here — not a tag, and not the release id alone, because a release row's build can be
 *    rebuilt and a binding to a mutable thing is not a binding.
 */
async function decide(
  deps: ServerDeps,
  request: FastifyRequest,
  releaseId: string,
  decision: 'approved' | 'rejected',
  reason: string | undefined,
) {
  const actor = requireSession(request)
  const joined = await releaseWithBuild(deps.db, releaseId)
  // The project comes from the release ROW, never from the request, and a release nobody
  // may see is indistinguishable from one that does not exist — `getRelease`'s rule, for
  // the enumeration-oracle reason `assertCapability` states.
  if (joined === undefined)
    throw new AuthorizationError('NOT_FOUND', `no release '${releaseId}'`)
  await assertCapability(deps.db, actor, joined.release.projectId, 'release:approve')
  assertStepUp(actor, 'release:approve')
  const digest = joined.build.imageDigest
  /**
   * UNREACHABLE THROUGH `createRelease`, WHICH REFUSES A BUILD WITH NO DIGEST
   * (`RELEASE_BUILD_NOT_DEPLOYABLE`) — and asserted anyway, because an approval bound to
   * nothing would satisfy §13's gate while binding to nothing at all. `toRelease` answers
   * `''` for the same column for the same reason; here the answer is a refusal, because
   * this is the write.
   */
  if (!digest)
    throw new ReleaseError(
      'RELEASE_DIGEST_MISSING',
      `release '${joined.release.id}' has no digest, so there is nothing to bind an approval to`,
    )
  return toApproval(
    await recordApproval(deps.db, deps.bus, {
      release: joined.release,
      actor,
      decision,
      ...(reason === undefined ? {} : { reason }),
      diffSnapshot: await buildDiffSnapshot(deps, joined.release, digest),
      imageDigest: digest,
    }),
  )
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
      '§13: an immutable release — the build’s digest, the spec that build was made from, and the configuration resolved from it for all three environments, frozen together. The build must be this project’s.',
    params: ProjectParams,
    query: NO_QUERY,
    body: CreateReleaseRequest,
    success: { status: 201, description: 'The release.', schema: Release },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
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
      // THE BUILD'S OWN SPEC (P6b Decision 6, [M6]) — the one §7's build-time attribute
      // check ran against, and a spec `startBuild` has already refused if it was invalid. The
      // newest spec is somebody's NEXT commit, and freezing it paired one commit's image with
      // another's configuration — and an invalid newest spec (`parsed: {}`) reached
      // `resolveConfig` as a `500`. SCOPED TO THE PROJECT, so another project's build is
      // indistinguishable from no build at all (the enumeration rule `getRelease` states).
      // `createRelease` reads the same condition again: two independent reads (ORIENTATION §9).
      const [build] = await deps.db
        .select()
        .from(builds)
        .where(and(eq(builds.id, body.buildId), eq(builds.projectId, params.projectId)))
      if (build === undefined)
        throw new ReleaseError(
          'RELEASE_BUILD_NOT_FOUND',
          `no build '${body.buildId}' in this project`,
        )
      const [spec] = await deps.db
        .select()
        .from(appSpecs)
        .where(eq(appSpecs.id, build.appSpecId))
      // `builds.app_spec_id` is NOT NULL with a foreign key, so this cannot happen through
      // any route; an honest 500 rather than a code a client would be told to act on.
      if (spec === undefined)
        throw new Error(
          `build '${build.id}' names spec '${build.appSpecId}', which is gone`,
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
    operationId: 'approveRelease',
    method: 'POST',
    path: '/v1/releases/{releaseId}/approve',
    tag: 'delivery',
    summary: 'Approve a release for production',
    description:
      '§13’s *Integrity of the gate*: the approval binds the release’s immutable image digest, records who decided and when, and stores the exact diff shown at decision time. It requires step-up re-authentication (§20) and an interactive session (D14). A later rebuild produces a new digest, which this approval does not cover.',
    params: z.strictObject({ releaseId: z.uuid() }),
    query: NO_QUERY,
    body: ApproveReleaseRequest,
    success: {
      status: 201,
      description: 'The approval, with the diff it was made on.',
      schema: Approval,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'STEP_UP_REQUIRED',
      // **`RELEASE_NOT_FOUND` IS DELIBERATELY NOT HERE**, though the plan's snippet listed
      // it: a release that does not exist and one this actor may not see answer the same
      // `NOT_FOUND`, which is `getRelease`'s rule and the enumeration-oracle reason behind
      // it. A second code for the first case would be the oracle, in the contract.
      'RELEASE_DIGEST_MISSING',
    ],
    handler: ({ deps, request, params, body }) =>
      decide(deps, request, params.releaseId, 'approved', body.reason),
  }),
  defineRoute({
    operationId: 'rejectRelease',
    method: 'POST',
    path: '/v1/releases/{releaseId}/reject',
    tag: 'delivery',
    summary: 'Decline to approve a release for production',
    description:
      '§13, and the same four guards as approving. **The reason is REQUIRED**: a refusal a faculty member is told about, with no words in it, is a refusal nobody can act on (D23.7) — the request schema is the first half of that rule and the `approvals_rejection_has_reason` CHECK is the second.',
    params: z.strictObject({ releaseId: z.uuid() }),
    query: NO_QUERY,
    body: RejectReleaseRequest,
    success: {
      status: 201,
      description: 'The rejection, with the diff it was made on.',
      schema: Approval,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'STEP_UP_REQUIRED',
      'RELEASE_DIGEST_MISSING',
    ],
    handler: ({ deps, request, params, body }) =>
      decide(deps, request, params.releaseId, 'rejected', body.reason),
  }),
  defineRoute({
    operationId: 'getApproval',
    method: 'GET',
    path: '/v1/releases/{releaseId}/approval',
    tag: 'delivery',
    summary: 'The latest decision about a release',
    description:
      '§13: the newest approval or rejection, with the diff it was made on. 404 when nobody has decided yet.',
    params: z.strictObject({ releaseId: z.uuid() }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The latest decision.', schema: Approval },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      const joined = await releaseWithBuild(deps.db, params.releaseId)
      if (joined === undefined)
        throw new AuthorizationError('NOT_FOUND', `no release '${params.releaseId}'`)
      // **`project:read`, NOT `release:approve`.** An owner must be able to see why their
      // release was rejected, in the administrator's own words — a decision only its maker
      // can read is not a decision anybody can act on (D23.7).
      await assertCapability(deps.db, actor, joined.release.projectId, 'project:read')
      const approval = await latestApprovalFor(deps.db, params.releaseId)
      if (approval === undefined)
        throw new AuthorizationError(
          'NOT_FOUND',
          `nobody has approved or rejected release '${params.releaseId}'`,
        )
      return toApproval(approval)
    },
  }),
  defineRoute({
    operationId: 'deploy',
    method: 'POST',
    path: '/v1/environments/{environmentId}/deploy',
    tag: 'delivery',
    summary: 'Deploy a release to an environment',
    description:
      '§22 step 5. Answers once the new instance serves, or once it has failed with an Incident — a failed deploy is a 200 whose state is `failed` (R3, §14). The previous instance keeps serving until the new one is proved, and drains in the background. Up to ~90 s when a release never becomes ready. Production answers 409 with the checklist: a first launch’s, or — once launched — the self-serve check, re-escalated when a sensitive field changed (§13, D9). Production deploys only the release serving staging.',
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
      // §20 (P6a Task 15): a production deploy asks for `release:promote`, which is
      // step-up-guarded — so an ordinary admin session is refused here before the gate.
      'STEP_UP_REQUIRED',
      'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
      // §13 D9.2 (P6b Task 6): a launched app's release changes a sensitive field and only
      // an administrator's approval is missing — the one refusal whose remedy is to ask.
      'RELEASE_REESCALATED',
      // §13: production runs exactly what staging ran — a deploy naming any other release
      // is refused, with the checklist of the one that IS serving staging (P6b Decision 8).
      'RELEASE_NOT_STAGED',
      // §13's *Integrity of the gate*: the approval binds a digest and the deploy verifies
      // it before anything starts. A rebuild since the approval is refused with this.
      'RELEASE_DIGEST_NOT_APPROVED',
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
      /**
       * §20: *"A stolen admin session must not be sufficient to put an app on the public
       * internet."* (P6a Task 15, decided by Rich on 2026-09-20 after sitting 6 found
       * `release:promote` in `STEP_UP_GUARDED` with no route asking for it.)
       *
       * **ON THE PRODUCTION BRANCH ONLY**, because a staging deploy authorizes
       * `release:deploy`, which is not guarded — asking for freshness there would put a
       * second IdP round trip inside the build loop D24 exists to keep cheap.
       *
       * It is defence in depth BEHIND the approval, which is where §13 puts the human
       * decision and which steps up already (`approveRelease` above). Sitting 6's own
       * argument for why this could be left out is recorded in the plan; Rich chose to
       * make §20's sentence true of the DEPLOY as well as of the decision.
       *
       * AFTER `assertCapability` and BEFORE the gate: who may ask, then whether they
       * proved themselves recently, then whether the project is ready. A person refused
       * here learns nothing about the project's readiness.
       */
      if (environment.kind === 'production') assertStepUp(actor, 'release:promote')
      // §13's gate, which until P6a Task 7 refused unconditionally. `assertLaunchable`
      // throws `ProductionGateError` carrying the SAME checklist
      // `GET /v1/projects/{projectId}/launch-readiness` answers — one computation, so the
      // view and the gate cannot disagree (Decision 2).
      //
      // AFTER `assertCapability` above, deliberately and unchanged: that check is about
      // WHO may ask, this one is about whether the project is ready, and a collaborator is
      // refused without the project's readiness ever being consulted.
      if (environment.kind === 'production')
        await assertLaunchable(deps.db, environment.projectId, body.releaseId)
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
