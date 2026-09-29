import type { FastifyRequest } from 'fastify'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import {
  appSpecs,
  builds,
  environments,
  projects,
  releases,
  users,
  type Db,
} from '../../db/index.js'
import { assertLaunchable } from '../../launch/index.js'
import { environmentFloor } from '../../ai/index.js'
import { incidentPrompt, listIncidents, OutputError } from '../../observability/index.js'
import {
  assertCapability,
  assertStepUp,
  AuthorizationError,
  type Actor,
} from '../../projects/index.js'
import {
  assertPreviewCurrent,
  buildDiffSnapshot,
  createRelease,
  deployRelease,
  latestApprovalFor,
  previewFor,
  recordApproval,
  recordPreview,
  ReleaseError,
} from '../../releases/index.js'
import { resolveConfig, type ManifestSpec } from '../../spec/index.js'
import { requireSession } from '../actor.js'
import type { ServerDeps } from '../server.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { PATH } from '../contract/schemas.js'
import { BadRequestError } from '../errors.js'
import { withdrawWhatItNoLongerAllows } from '../spec-validation.js'
import { IncidentList, toIncident } from '../representations/incidents.js'
import { Instance, toInstance } from '../representations/instances.js'
import {
  Approval,
  ApprovalPreview,
  ApproveReleaseRequest,
  CreateReleaseRequest,
  DeployRequest,
  RejectReleaseRequest,
  Release,
  ReleaseList,
  toApproval,
  toApprovalPreview,
  toRelease,
} from '../representations/releases.js'

const ProjectParams = z.strictObject({ projectId: PATH.projectId })
const ReleaseParams = z.strictObject({ releaseId: PATH.releaseId })
const EnvironmentParams = z.strictObject({ environmentId: PATH.environmentId })

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
 * A person's display name, for `decidedByName` and `createdByName` (P6b Decision 18). The
 * column is NOT NULL and the row is a foreign key's target, so a miss is a broken store — an
 * honest 500 rather than a record that names nobody.
 */
async function displayNameOf(db: Db, userId: string): Promise<string> {
  const [row] = await db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
  if (row === undefined) throw new Error(`no user '${userId}' to name`)
  return row.name
}

/**
 * Guards 2 of `decide()` below, for every route that asserts `release:approve` (the decision
 * and both preview routes): the release with its build, and WHO may approve it. The caller has
 * already run `requireSession`. A release nobody may see is indistinguishable from one that
 * does not exist — `getRelease`'s rule, for the enumeration-oracle reason `assertCapability`
 * states — so the project comes from the release ROW, never from the request.
 */
async function approvableRelease(deps: ServerDeps, actor: Actor, releaseId: string) {
  const joined = await releaseWithBuild(deps.db, releaseId)
  if (joined === undefined)
    throw new AuthorizationError('NOT_FOUND', `no release '${releaseId}'`)
  await assertCapability(deps.db, actor, joined.release.projectId, 'release:approve')
  return joined
}

/**
 * UNREACHABLE THROUGH `createRelease`, WHICH REFUSES A BUILD WITH NO DIGEST
 * (`RELEASE_BUILD_NOT_DEPLOYABLE`) — and asserted anyway, because an approval bound to
 * nothing would satisfy §13's gate while binding to nothing at all. `toRelease` answers
 * `''` for the same column for the same reason; here the answer is a refusal, because
 * this is the write.
 */
function digestOf(joined: {
  release: { id: string }
  build: { imageDigest: string | null }
}) {
  const digest = joined.build.imageDigest
  if (!digest)
    throw new ReleaseError(
      'RELEASE_DIGEST_MISSING',
      `release '${joined.release.id}' has no digest, so there is nothing to bind an approval to`,
    )
  return digest
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
 * 5. **The preview it names** (P6b Task 9) — required, and this release's.
 * 6. **Still current** — not expired, and its facts unmoved.
 *
 * **A REPRESENTATION DEFECT ANSWERS `500` AFTER THE ROW IS WRITTEN** (P6b sitting 5, F7):
 * `recordApproval` inserts and publishes, and the wrapper parses the body only then. Every
 * stored value parses today; it is the contract layer's shape for every mutation, recorded
 * rather than fixed.
 */
async function decide(
  deps: ServerDeps,
  request: FastifyRequest,
  releaseId: string,
  decision: 'approved' | 'rejected',
  body: { reason?: string | undefined; previewId?: string | undefined },
) {
  const actor = requireSession(request)
  const joined = await approvableRelease(deps, actor, releaseId)
  assertStepUp(actor, 'release:approve')
  const digest = digestOf(joined)
  // 5. RICH'S DECISION (2026-09-22): the administrator saw the diff BEFORE deciding, as a STORED
  //    preview, and names it. `previewId` is optional in the SCHEMA and required HERE —
  //    Decision 15: a refusal an older client meets, rather than a document that stops
  //    generating (D23.8). AFTER the four guards, so a flat session is still told to step up
  //    and a stranger still learns nothing.
  if (body.previewId === undefined)
    throw new BadRequestError(
      'APPROVAL_PREVIEW_REQUIRED',
      'an approval names the preview the administrator read',
      'POST /v1/releases/{releaseId}/approval-preview, read it, then decide naming its id.',
    )
  const preview = await previewFor(deps.db, body.previewId, joined.release.id)
  if (preview === undefined)
    throw new AuthorizationError(
      'NOT_FOUND',
      `no preview '${body.previewId}' of release '${joined.release.id}'`,
    )
  // 6. EXPIRED, then STALE — the facts recomputed NOW; never the summary, never the verdict.
  await assertPreviewCurrent(deps, preview, joined.release, digest)
  const row = await recordApproval(deps.db, deps.bus, {
    release: joined.release,
    actor,
    decision,
    previewId: preview.id,
    ...(body.reason === undefined ? {} : { reason: body.reason }),
    // WHAT WAS SHOWN — not a second call to the model, which would record a summary nobody
    // read (Rich, 2026-09-22; P6b *Read this first* 13).
    diffSnapshot: preview.diffSnapshot,
    imageDigest: digest,
  })
  return toApproval(row, await displayNameOf(deps.db, row.decidedBy))
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
    examples: {
      request: { buildId: '5b083281-e96c-48ee-9dcc-6347ed5f087a' },
      response: {
        id: 'cc85411d-da69-4291-9ece-8db66e086109',
        projectId: '760932a4-7e0f-42c8-bfe4-9ddc80c3cd16',
        buildId: '5b083281-e96c-48ee-9dcc-6347ed5f087a',
        appSpecId: 'b9a04952-9145-4912-a0e3-216305f6bae6',
        imageDigest:
          'sha256:1ffe125abe69cae1fe908d3c937a5ba3966dcf03867e7ae44edf21281f9df8c9',
        summary: null,
        createdBy: '438641c1-3d15-4c8a-b2dc-bca3da187db1',
        createdAt: '2026-09-26T21:48:33.798Z',
        scan: {
          scanner: 'fake',
          scannedAt: '2026-09-26T21:48:33.793Z',
          databaseAgeDays: 0,
          stale: false,
          baseImageKnown: true,
          fixable: { critical: 0, high: 0 },
          unfixable: { critical: 0, high: 0 },
          baseImage: { critical: 0, high: 0 },
          unfixableFindings: [],
        },
        config: {
          sandbox: {
            port: 3000,
            health: '/healthz',
            resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
            services: [],
            egressAllow: ['x.example.org'],
            classification: 'internal',
            auth: { provider: 'none', attributes: [] },
            ai: { models: [] },
            envNames: [],
          },
          staging: {
            port: 3000,
            health: '/healthz',
            resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
            services: [],
            egressAllow: ['x.example.org'],
            classification: 'internal',
            auth: { provider: 'none', attributes: [] },
            ai: { models: [] },
            envNames: [],
          },
          production: {
            port: 3000,
            health: '/healthz',
            resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
            services: [],
            egressAllow: ['x.example.org'],
            classification: 'internal',
            auth: { provider: 'none', attributes: [] },
            ai: { models: [] },
            envNames: [],
          },
        },
      },
    },
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
    description:
      'One immutable release (§13): the build and the validation it froze, and what it runs as in each environment. `deploy` deploys it; to production only once `getLaunchReadiness` says the checklist is met.',
    params: ReleaseParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The release.', schema: Release },
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        id: '43c8a96a-000d-41f1-9884-efb3db828883',
        projectId: '62492871-47f1-4733-92e2-4ae75634cd53',
        buildId: '1890d9d7-900a-4b9b-a2b4-e969f174e23f',
        appSpecId: '9a08683a-39aa-43c6-8921-7d1960e8c6d4',
        imageDigest:
          'sha256:404a9e253752d77f41bd20ad14e09167c8f4ae6e3cd564f9b58af0b6eb73f329',
        summary: null,
        createdBy: '6320001f-7385-470b-a1dd-1214cd8af583',
        createdAt: '2026-09-26T21:47:39.608Z',
        scan: {
          scanner: 'fake',
          scannedAt: '2026-09-26T21:47:39.600Z',
          databaseAgeDays: 0,
          stale: false,
          baseImageKnown: true,
          fixable: { critical: 0, high: 0 },
          unfixable: { critical: 0, high: 0 },
          baseImage: { critical: 0, high: 0 },
          unfixableFindings: [],
        },
        config: {
          sandbox: {
            port: 3000,
            health: '/healthz',
            resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
            services: [],
            egressAllow: [],
            classification: 'internal',
            auth: { provider: 'none', attributes: [] },
            ai: { models: [] },
            envNames: ['COURSE_CODE'],
          },
          staging: {
            port: 3000,
            health: '/healthz',
            resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
            services: [],
            egressAllow: [],
            classification: 'internal',
            auth: { provider: 'none', attributes: [] },
            ai: { models: [] },
            envNames: ['COURSE_CODE'],
          },
          production: {
            port: 3000,
            health: '/healthz',
            resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
            services: [],
            egressAllow: [],
            classification: 'internal',
            auth: { provider: 'none', attributes: [] },
            ai: { models: [] },
            envNames: ['COURSE_CODE'],
          },
        },
      },
    },
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
    description:
      'The project’s newest 50 releases, newest first. `deploy` names one; `getRelease` reads one.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The releases.', schema: ReleaseList },
    errors: ['NOT_FOUND'],
    examples: {
      response: [
        {
          id: '5c0f405e-0aac-4b10-a75f-19bf38f60117',
          projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
          buildId: 'd9152353-95cd-4f1c-9a4f-655b710b4d46',
          appSpecId: 'ab95aadb-d8b8-4b78-83df-c8d9067af42b',
          imageDigest:
            'sha256:381846aa0581a9b8a299a0789f2627a9da7491365a4a40625c74582f12b6d419',
          summary: null,
          createdBy: '39414511-6e5d-46e9-a47a-090166426ed3',
          createdAt: '2026-09-26T21:51:54.496Z',
          scan: {
            scanner: 'fake',
            scannedAt: '2026-09-26T21:51:47.638Z',
            databaseAgeDays: 0,
            stale: false,
            baseImageKnown: true,
            fixable: { critical: 0, high: 0 },
            unfixable: { critical: 0, high: 0 },
            baseImage: { critical: 0, high: 0 },
            unfixableFindings: [],
          },
          config: {
            sandbox: {
              port: 3000,
              health: '/healthz',
              resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
              services: [],
              egressAllow: [],
              classification: 'internal',
              auth: { provider: 'none', attributes: [] },
              ai: { models: [] },
              envNames: [],
            },
            staging: {
              port: 3000,
              health: '/healthz',
              resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
              services: [],
              egressAllow: [],
              classification: 'internal',
              auth: { provider: 'none', attributes: [] },
              ai: { models: [] },
              envNames: [],
            },
            production: {
              port: 3000,
              health: '/healthz',
              resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
              services: [],
              egressAllow: [],
              classification: 'internal',
              auth: { provider: 'none', attributes: [] },
              ai: { models: [] },
              envNames: [],
            },
          },
        },
        {
          id: '9642a63a-14de-4d22-84e4-3736fb77f6ac',
          projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
          buildId: 'd9152353-95cd-4f1c-9a4f-655b710b4d46',
          appSpecId: 'ab95aadb-d8b8-4b78-83df-c8d9067af42b',
          imageDigest:
            'sha256:381846aa0581a9b8a299a0789f2627a9da7491365a4a40625c74582f12b6d419',
          summary: null,
          createdBy: '39414511-6e5d-46e9-a47a-090166426ed3',
          createdAt: '2026-09-26T21:51:54.487Z',
          scan: {
            scanner: 'fake',
            scannedAt: '2026-09-26T21:51:47.638Z',
            databaseAgeDays: 0,
            stale: false,
            baseImageKnown: true,
            fixable: { critical: 0, high: 0 },
            unfixable: { critical: 0, high: 0 },
            baseImage: { critical: 0, high: 0 },
            unfixableFindings: [],
          },
          config: {
            sandbox: {
              port: 3000,
              health: '/healthz',
              resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
              services: [],
              egressAllow: [],
              classification: 'internal',
              auth: { provider: 'none', attributes: [] },
              ai: { models: [] },
              envNames: [],
            },
            staging: {
              port: 3000,
              health: '/healthz',
              resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
              services: [],
              egressAllow: [],
              classification: 'internal',
              auth: { provider: 'none', attributes: [] },
              ai: { models: [] },
              envNames: [],
            },
            production: {
              port: 3000,
              health: '/healthz',
              resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
              services: [],
              egressAllow: [],
              classification: 'internal',
              auth: { provider: 'none', attributes: [] },
              ai: { models: [] },
              envNames: [],
            },
          },
        },
      ],
    },
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
    credential: 'session',
    method: 'POST',
    path: '/v1/releases/{releaseId}/approve',
    tag: 'delivery',
    summary: 'Approve a release for production',
    description:
      '§13’s *Integrity of the gate*: the approval binds the release’s immutable image digest, records who decided and when, and stores the exact diff shown at decision time — COPIED from the stored preview it names, whose facts are recomputed and must not have moved. `previewId` is optional in the request schema and REQUIRED here (`400 APPROVAL_PREVIEW_REQUIRED`). It requires step-up re-authentication (§20) and an interactive session (D14). A later rebuild produces a new digest, which this approval does not cover.',
    params: ReleaseParams,
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
      // P6b Task 9: the preview the administrator read — named, current, and this release's
      // (a preview of another release is `NOT_FOUND`, the same enumeration rule).
      'APPROVAL_PREVIEW_REQUIRED',
      'APPROVAL_PREVIEW_EXPIRED',
      'APPROVAL_PREVIEW_STALE',
    ],
    examples: {
      request: {
        reason: 'dropping mail is data minimisation',
        previewId: '0df5bf80-218f-430f-9295-c6837256afca',
      },
      response: {
        id: 'a5e8fc49-1e64-4cd0-a0e1-77512fdaf3b4',
        releaseId: 'e04bcda9-e9e4-44b7-a5ec-b064498179c7',
        projectId: '5a52e925-81ea-4fca-a517-cad1799a2cbb',
        decision: 'approved',
        decidedBy: '26628bdf-719c-4664-8a77-9e97a37e472a',
        decidedByName: 'Platform Admin',
        decidedAt: '2026-09-26T21:48:55.765Z',
        imageDigest:
          'sha256:538c34511aac0a6f2165a18cad074b6d342a54415d67ca6d00a000b020b7f937',
        reason: 'dropping mail is data minimisation',
        diff: {
          imageDigest:
            'sha256:538c34511aac0a6f2165a18cad074b6d342a54415d67ca6d00a000b020b7f937',
          changes: [
            {
              path: 'auth.attributes',
              from: 'mail, ubcEduCwlPuid',
              to: 'ubcEduCwlPuid',
              summary: 'no longer requests the mail attribute',
            },
          ],
          services: [],
          attributes: ['ubcEduCwlPuid'],
          resources: { cpu: 0.5, memory: '512Mi', disk: '2Gi', pids: 256 },
          summary: null,
          summarySource: 'not-modelled',
          summaryWithheldBecause: null,
          summaryExposures: null,
          baselineReleaseId: '781048e0-06c6-47f5-92d7-f4125ee53e6e',
          sensitiveFields: ['auth.attributes'],
          security: [
            {
              field: 'auth.attributes',
              note: 'The app receives different personal information about every person who signs in. In production it must stay within what UBC IAM registered (§7, §9), and it is an input to the PIA.',
            },
          ],
          coverage:
            'An administrator sees a first launch and any release that changes a sensitive field (§7). A release that changes none reaches production without an administrator, and its code is reviewed by nothing (§13’s residual risk); containment is the control (§20).',
          review: {
            state: 'not_performed',
            reviewer: 'none',
            detail:
              'No code reviewer is configured. Manifest reviews manifest.yaml, not code (§13); the controls that make that tolerable are containment — default-deny egress, network isolation, least privilege and edge protections (§20).',
          },
        },
        previewId: '0df5bf80-218f-430f-9295-c6837256afca',
      },
    },
    handler: ({ deps, request, params, body }) =>
      decide(deps, request, params.releaseId, 'approved', body),
  }),
  defineRoute({
    operationId: 'rejectRelease',
    credential: 'session',
    method: 'POST',
    path: '/v1/releases/{releaseId}/reject',
    tag: 'delivery',
    summary: 'Decline to approve a release for production',
    description:
      '§13, and the same four guards as approving, naming a preview the same way. **The reason is REQUIRED**: a refusal a faculty member is told about, with no words in it, is a refusal nobody can act on (D23.7) — the request schema is the first half of that rule and the `approvals_rejection_has_reason` CHECK is the second.',
    params: ReleaseParams,
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
      'APPROVAL_PREVIEW_REQUIRED',
      'APPROVAL_PREVIEW_EXPIRED',
      'APPROVAL_PREVIEW_STALE',
    ],
    examples: {
      request: {
        reason: 'withdrawn — the destination is not in the PIA',
        previewId: '46109278-ffed-493e-8489-09e3b24c9be8',
      },
      response: {
        id: '29c68784-e30b-4a94-b501-bc1e728dca81',
        releaseId: '469a1136-582d-470f-8692-0e72223d3186',
        projectId: '50cd1bf5-1343-46a7-9bf4-81bf56b87ceb',
        decision: 'rejected',
        decidedBy: '2ff7d194-783e-46f9-91f1-33a84281d966',
        decidedByName: 'Platform Admin',
        decidedAt: '2026-09-26T21:48:37.947Z',
        imageDigest:
          'sha256:c583f7d2b6553963268d6e547075e823616f5c07eab9b52c7b782b7e5c82cef5',
        reason: 'withdrawn — the destination is not in the PIA',
        diff: {
          imageDigest:
            'sha256:c583f7d2b6553963268d6e547075e823616f5c07eab9b52c7b782b7e5c82cef5',
          changes: [
            {
              path: 'egress.allow',
              from: 'none',
              to: 'x.example.org',
              summary: 'now allows x.example.org',
            },
          ],
          services: [],
          attributes: [],
          resources: { cpu: 0.5, memory: '512Mi', disk: '2Gi', pids: 256 },
          summary: null,
          summarySource: 'unavailable',
          summaryWithheldBecause: null,
          summaryExposures: null,
          baselineReleaseId: '17874d11-f772-4ab0-9ad2-a3dadaa1542c',
          sensitiveFields: ['egress.allow'],
          security: [
            {
              field: 'egress.allow',
              note: 'The app may send data to a host it could not reach before. Default-deny egress is §20’s containment for unreviewed code, and this widens it. An input to the PIA’s “where it flows”.',
            },
          ],
          coverage:
            'An administrator sees a first launch and any release that changes a sensitive field (§7). A release that changes none reaches production without an administrator, and its code is reviewed by nothing (§13’s residual risk); containment is the control (§20).',
          review: {
            state: 'not_performed',
            reviewer: 'none',
            detail:
              'No code reviewer is configured. Manifest reviews manifest.yaml, not code (§13); the controls that make that tolerable are containment — default-deny egress, network isolation, least privilege and edge protections (§20).',
          },
        },
        previewId: '46109278-ffed-493e-8489-09e3b24c9be8',
      },
    },
    handler: ({ deps, request, params, body }) =>
      decide(deps, request, params.releaseId, 'rejected', body),
  }),
  defineRoute({
    operationId: 'createApprovalPreview',
    credential: 'session',
    method: 'POST',
    path: '/v1/releases/{releaseId}/approval-preview',
    tag: 'delivery',
    summary: 'Take the preview an administrator reads before deciding',
    description:
      '§13’s exact diff, computed NOW and STORED: the facts, the security notes, the reviewer’s verdict and the model’s summary. Approve and reject name it; the record copies it. No step-up — a preview decides nothing — but an interactive session and `release:approve` (§20). Valid for thirty minutes.',
    params: ReleaseParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 201, description: 'The preview.', schema: ApprovalPreview },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'RELEASE_DIGEST_MISSING',
      // The reviewer is handed the build's commit through `repositoryOf` (the D5 plan's
      // Task 8): a project another driver made is refused, on a laptop that switched drivers.
      'SOURCE_PROVIDER_MISMATCH',
      // …and, on driver 2, a repository last read public is never handed over (Task 10).
      'SOURCE_REPOSITORY_PUBLIC',
    ],
    examples: {
      response: {
        id: '0df5bf80-218f-430f-9295-c6837256afca',
        releaseId: 'e04bcda9-e9e4-44b7-a5ec-b064498179c7',
        projectId: '5a52e925-81ea-4fca-a517-cad1799a2cbb',
        createdBy: '26628bdf-719c-4664-8a77-9e97a37e472a',
        createdByName: 'Platform Admin',
        createdAt: '2026-09-26T21:48:55.759Z',
        expiresAt: '2026-09-26T22:18:55.759Z',
        imageDigest:
          'sha256:538c34511aac0a6f2165a18cad074b6d342a54415d67ca6d00a000b020b7f937',
        diff: {
          imageDigest:
            'sha256:538c34511aac0a6f2165a18cad074b6d342a54415d67ca6d00a000b020b7f937',
          changes: [
            {
              path: 'auth.attributes',
              from: 'mail, ubcEduCwlPuid',
              to: 'ubcEduCwlPuid',
              summary: 'no longer requests the mail attribute',
            },
          ],
          services: [],
          attributes: ['ubcEduCwlPuid'],
          resources: { cpu: 0.5, memory: '512Mi', disk: '2Gi', pids: 256 },
          summary: null,
          summarySource: 'not-modelled',
          summaryWithheldBecause: null,
          summaryExposures: null,
          baselineReleaseId: '781048e0-06c6-47f5-92d7-f4125ee53e6e',
          sensitiveFields: ['auth.attributes'],
          security: [
            {
              field: 'auth.attributes',
              note: 'The app receives different personal information about every person who signs in. In production it must stay within what UBC IAM registered (§7, §9), and it is an input to the PIA.',
            },
          ],
          coverage:
            'An administrator sees a first launch and any release that changes a sensitive field (§7). A release that changes none reaches production without an administrator, and its code is reviewed by nothing (§13’s residual risk); containment is the control (§20).',
          review: {
            state: 'not_performed',
            reviewer: 'none',
            detail:
              'No code reviewer is configured. Manifest reviews manifest.yaml, not code (§13); the controls that make that tolerable are containment — default-deny egress, network isolation, least privilege and edge protections (§20).',
          },
        },
      },
    },
    handler: async ({ deps, request, params }) => {
      // requireSession FIRST, as `decide()`: a token learns nothing about which releases exist.
      const actor = requireSession(request)
      const joined = await approvableRelease(deps, actor, params.releaseId)
      // NO `assertStepUp`: a preview decides nothing (Decision 10), and the step-up round trip
      // is what the administrator takes AFTER reading it — with the preview's id in the URL.
      const digest = digestOf(joined)
      const row = await recordPreview(deps.db, {
        release: joined.release,
        actor,
        snapshot: await buildDiffSnapshot(deps, joined.release, digest),
        digest,
      })
      return toApprovalPreview(row, await displayNameOf(deps.db, row.createdBy))
    },
  }),
  defineRoute({
    operationId: 'getApprovalPreview',
    credential: 'session',
    method: 'GET',
    path: '/v1/releases/{releaseId}/approval-previews/{previewId}',
    tag: 'delivery',
    summary: 'Re-read a stored preview',
    description:
      'The preview exactly as it was taken — re-read, never recomputed — so a console coming back from the step-up round trip shows the administrator what they read before it. 404 for a preview of another release.',
    params: z.strictObject({ releaseId: PATH.releaseId, previewId: PATH.previewId }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The preview.', schema: ApprovalPreview },
    errors: ['NOT_FOUND', 'FORBIDDEN', 'TOKEN_CREDENTIAL_REFUSED'],
    examples: {
      response: {
        id: 'a08d1993-28bf-4378-a8d8-dfad2dccfc57',
        releaseId: '8e4d08ba-37d8-4b96-8981-e6a13722e42f',
        projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
        createdBy: '0a418b8c-6d32-4e9f-bc77-24765feebf3b',
        createdByName: 'Platform Admin',
        createdAt: '2026-09-26T21:51:48.171Z',
        expiresAt: '2026-09-26T22:21:48.171Z',
        imageDigest:
          'sha256:381846aa0581a9b8a299a0789f2627a9da7491365a4a40625c74582f12b6d419',
        diff: {
          imageDigest:
            'sha256:381846aa0581a9b8a299a0789f2627a9da7491365a4a40625c74582f12b6d419',
          changes: [],
          services: [],
          attributes: [],
          resources: { cpu: 0.5, memory: '512Mi', disk: '2Gi', pids: 256 },
          summary: null,
          summarySource: 'no-previous-release',
          summaryWithheldBecause: null,
          summaryExposures: null,
          baselineReleaseId: null,
          sensitiveFields: [],
          security: [],
          coverage:
            'An administrator sees a first launch and any release that changes a sensitive field (§7). A release that changes none reaches production without an administrator, and its code is reviewed by nothing (§13’s residual risk); containment is the control (§20).',
          review: {
            state: 'not_performed',
            reviewer: 'none',
            detail:
              'No code reviewer is configured. Manifest reviews manifest.yaml, not code (§13); the controls that make that tolerable are containment — default-deny egress, network isolation, least privilege and edge protections (§20).',
          },
        },
      },
    },
    handler: async ({ deps, request, params }) => {
      const actor = requireSession(request)
      const joined = await approvableRelease(deps, actor, params.releaseId)
      const row = await previewFor(deps.db, params.previewId, joined.release.id)
      if (row === undefined)
        throw new AuthorizationError(
          'NOT_FOUND',
          `no preview '${params.previewId}' of release '${joined.release.id}'`,
        )
      return toApprovalPreview(row, await displayNameOf(deps.db, row.createdBy))
    },
  }),
  defineRoute({
    operationId: 'getApproval',
    method: 'GET',
    path: '/v1/releases/{releaseId}/approval',
    tag: 'delivery',
    summary: 'The latest decision about a release',
    description:
      '§13: the newest approval or rejection, with the diff it was made on. 404 when nobody has decided yet.',
    params: ReleaseParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The latest decision.', schema: Approval },
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        id: '2e2862ae-a97d-4cfe-b1bd-f89515c4841a',
        releaseId: '8e4d08ba-37d8-4b96-8981-e6a13722e42f',
        projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
        decision: 'approved',
        decidedBy: '0a418b8c-6d32-4e9f-bc77-24765feebf3b',
        decidedByName: 'Platform Admin',
        decidedAt: '2026-09-26T21:51:48.180Z',
        imageDigest:
          'sha256:381846aa0581a9b8a299a0789f2627a9da7491365a4a40625c74582f12b6d419',
        reason: 'the authorization fixture needs a decision to read',
        diff: {
          imageDigest:
            'sha256:381846aa0581a9b8a299a0789f2627a9da7491365a4a40625c74582f12b6d419',
          changes: [],
          services: [],
          attributes: [],
          resources: { cpu: 0.5, memory: '512Mi', disk: '2Gi', pids: 256 },
          summary: null,
          summarySource: 'no-previous-release',
          summaryWithheldBecause: null,
          summaryExposures: null,
          baselineReleaseId: null,
          sensitiveFields: [],
          security: [],
          coverage:
            'An administrator sees a first launch and any release that changes a sensitive field (§7). A release that changes none reaches production without an administrator, and its code is reviewed by nothing (§13’s residual risk); containment is the control (§20).',
          review: {
            state: 'not_performed',
            reviewer: 'none',
            detail:
              'No code reviewer is configured. Manifest reviews manifest.yaml, not code (§13); the controls that make that tolerable are containment — default-deny egress, network isolation, least privilege and edge protections (§20).',
          },
        },
        previewId: 'a08d1993-28bf-4378-a8d8-dfad2dccfc57',
      },
    },
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
      return toApproval(approval, await displayNameOf(deps.db, approval.decidedBy))
    },
  }),
  defineRoute({
    operationId: 'deploy',
    method: 'POST',
    path: '/v1/environments/{environmentId}/deploy',
    tag: 'delivery',
    summary: 'Deploy a release to an environment',
    description:
      '§22 step 5. Answers once the new instance serves, or once it has failed with an Incident — a failed deploy is a 200 whose state is `failed` (§14). The previous instance keeps serving until the new one is proved, and drains in the background. Up to ~90 s when a release never becomes ready. Production answers 409 with the checklist: a first launch’s, or — once launched — the self-serve check, re-escalated when a sensitive field changed (§13, D9). Production deploys only the release serving staging.',
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
      // The authoring API plan's Task 8: the release declares a secret this environment has no
      // value for — refused before anything starts, naming the names.
      'RELEASE_SECRET_NOT_SET',
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
    examples: {
      request: { releaseId: '87155b5c-f7d8-4519-9042-cc5fa8e2d352' },
      response: {
        id: 'b0d088b9-183e-4138-bda0-a4939537a2b8',
        environmentId: '669c357e-7857-45c2-8406-428079de4026',
        releaseId: '87155b5c-f7d8-4519-9042-cc5fa8e2d352',
        kind: 'web',
        state: 'healthy',
        lastSeenAt: '2026-09-26T21:47:31.749Z',
      },
    },
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
      // FE-36 (the front-end enablement plan's Task 14a, its review's I2): the release production
      // serves floors the classification an agent session is routed by, so a production deploy may
      // have RAISED it — end every session holding what the project no longer allows, before this
      // answers. Never a refusal of the deploy (an operator line); a failed deploy changed nothing.
      if (environment.kind === 'production')
        await withdrawWhatItNoLongerAllows(
          deps,
          environment.projectId,
          'a production deploy',
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
      '§14: each failed deploy’s exit, last 200 log lines, failing check and diff since the last healthy release, newest first, with its repair prompt. **A delegated token is refused a `confidential` project’s staging and production Incidents** (`INCIDENT_LOG_CONFIDENTIAL`) while the platform lets that project’s building agent use the capable model (§7): their log tails can carry the input of real people. A person’s session reads them, and every token reads the sandbox’s.',
    params: EnvironmentParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The incidents.', schema: IncidentList },
    errors: ['NOT_FOUND', 'INCIDENT_LOG_CONFIDENTIAL'],
    examples: {
      response: {
        environmentId: '4de1302a-e630-4fca-8d47-5c66d99bfdb8',
        incidents: [
          {
            id: 'e6f321ab-9a68-49b6-98fd-fa9f0f9f9fbb',
            instanceId: 'd5affadc-0751-4b8a-9af8-ae4351512916',
            releaseId: '7ec58cd8-3dd3-4209-89a8-4c04596b2f5c',
            exitReason: 'the platform reports the instance as failed',
            logTail: 'starting chem-labs-staging-7ec58cd8-d5affadc',
            failedCheck:
              'health: GET /healthz on port 3000 — the driver reported the instance as failed',
            diffSinceHealthy:
              'This app has never been healthy in staging, so there is no working release to compare this one with.',
            createdAt: '2026-09-26T21:47:38.803Z',
            prompt:
              'The application "chem-labs" failed to start in its staging environment.\n\nWhat the platform checked: health: GET /healthz on port 3000 — the driver reported the instance as failed\nHow it ended: the platform reports the instance as failed\n\nWhat changed since the last time it starte …',
          },
        ],
      },
    },
    handler: async ({ deps, actor, params }) => {
      const environment = await environmentReadableBy(
        deps.db,
        actor,
        params.environmentId,
      )
      // THE SAFEGUARD (§7 as Spec action 10 amended it; the front-end enablement plan's Task 14a),
      // decided BEFORE anything is read: while a confidential project's building agent may call the
      // capable model — which may route off-premise — a delegated token is the agent's credential,
      // and staging's and production's log tails can carry real people's input. By the environment's
      // KIND, as the output read decides, and by `environmentFloor`: the project's classification and
      // every release that has run HERE — so a commit lowering the manifest does not unlock the
      // Incidents of the confidential release before it (the review's I1).
      if (
        actor.credential === 'token' &&
        environment.kind !== 'sandbox' &&
        deps.config.agent.builderModels === 'capable' &&
        (await environmentFloor(deps.db, environment)) === 'confidential'
      )
        throw new OutputError(
          'INCIDENT_LOG_CONFIDENTIAL',
          `the ${environment.kind} Incidents of a confidential project are not answered to a delegated token while its building agent may use the capable model (§7); a person reads them in their own session`,
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
