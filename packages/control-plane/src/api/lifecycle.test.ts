import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  agentSessions,
  delegatedTokens,
  events,
  instances,
  pendingActions,
  projects,
  routes,
  secrets,
  sourceRepositories,
  withEnvironmentLock,
} from '../db/index.js'
import type { AiKeyService } from '../ai/index.js'
import { fakeLiteLlm, type FakeLiteLlm } from '../ai/testing.js'
import { TokenCapabilityRefusedError } from '../projects/index.js'
import {
  archiveProject,
  finishTeardowns,
  recoverAtBoot,
  runTeardown,
  TEARDOWN_STEPS,
} from '../releases/index.js'
import type { FakeDriver } from '../runtime/index.js'
import type { SsoCertificates, SsoDeregistrar, SsoRegistrar } from '../sso/index.js'
import { fingerprintOf, recordPendingAction, tokenActor } from '../tokens/index.js'
import { mintTestToken } from '../tokens/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { lifecycleDeps } from './routes/lifecycle.js'
import type { ServerDeps } from './server.js'
import {
  commitManifest,
  loginAs,
  mutationHeaders,
  projectBody,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

/**
 * §11's *Ending an app* over the API (Spec action 3; the front-end enablement plan's Task 11):
 * archive and restore, person-only with step-up for archive (Decision 30), and a teardown that is
 * idempotent and finished on retry or at boot (Decision 28).
 */

/** A registrar that records what the archive removes: the unit tier has no IdP (`testDeps`). */
function recordingSso(): SsoRegistrar &
  SsoDeregistrar &
  SsoCertificates & { removed: { slug: string; environmentKind: string }[] } {
  const removed: { slug: string; environmentKind: string }[] = []
  return {
    removed,
    // Nothing in this file drafts a registration (the launch path plan's Task 10).
    spCertificate: () => {
      throw new Error('the lifecycle tests draft no registration package')
    },
    registerServiceProvider: () => {
      throw new Error(
        'the unit tier has no IdP: nothing here registers a Service Provider',
      )
    },
    idpSigningCertificate: () => {
      throw new Error('the unit tier has no IdP signing certificate')
    },
    deregisterServiceProvider: (_db, input) => {
      removed.push({ slug: input.slug, environmentKind: input.environmentKind })
      return Promise.resolve(false)
    },
  }
}

function withLifecycleServer(
  fn: (
    ctx: TestProject,
    lite: FakeLiteLlm,
    sso: ReturnType<typeof recordingSso>,
  ) => Promise<void>,
  overrides: Partial<ServerDeps> = {},
) {
  const lite = fakeLiteLlm()
  const sso = recordingSso()
  return withProjectServer((ctx) => fn(ctx, lite, sso), { llm: lite, sso, ...overrides })
}

const archive = (ctx: TestProject, cookies: Record<string, string>) =>
  ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/archive`,
    cookies,
    headers: mutationHeaders(ctx.deps),
    payload: {},
  })

const restore = (ctx: TestProject, cookies: Record<string, string>) =>
  ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/restore`,
    cookies,
    headers: mutationHeaders(ctx.deps),
    payload: {},
  })

const mutate = (
  ctx: TestProject,
  url: string,
  payload: Record<string, unknown>,
  cookies = ctx.ownerCookies,
) =>
  ctx.app.inject({
    method: 'POST',
    url,
    cookies,
    headers: mutationHeaders(ctx.deps),
    payload,
  })

async function slugOf(ctx: TestProject): Promise<string> {
  const [row] = await ctx.db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, ctx.projectId))
  return row!.slug
}

/**
 * The app with a DATABASE, built, released and serving staging — through the routes. A backing
 * service is what "stopped keeping its data" is about, so the manifest declares one.
 */
async function deployWithDatabase(ctx: TestProject) {
  const slug = await slugOf(ctx)
  const { commitSha } = await commitManifest(
    {
      app: ctx.app,
      deps: ctx.deps,
      cookies: ctx.ownerCookies,
      project: { id: ctx.projectId, slug },
    },
    [
      'manifest: 1',
      `name: ${slug}`,
      'blueprint: fixture-node@1',
      'runtime:',
      '  port: 3000',
      '  health: /healthz',
      'services:',
      '  - name: db',
      '    type: mongo',
      '    version: "7"',
    ],
    'feat: a database',
  )
  const build = await mutate(ctx, `/v1/projects/${ctx.projectId}/builds`, { commitSha })
  expect(build.statusCode, build.body).toBe(202)
  await ctx.deps.builds.idle()
  const release = await mutate(ctx, `/v1/projects/${ctx.projectId}/releases`, {
    buildId: (build.json() as { id: string }).id,
  })
  expect(release.statusCode, release.body).toBe(201)
  const releaseId = (release.json() as { id: string }).id
  const deployed = await mutate(
    ctx,
    `/v1/environments/${ctx.stagingEnvironmentId}/deploy`,
    { releaseId },
  )
  expect(deployed.statusCode, deployed.body).toBe(200)
  const { id } = deployed.json() as { id: string }
  const [row] = await ctx.db.select().from(instances).where(eq(instances.id, id))
  return {
    slug,
    releaseId,
    instanceId: id,
    handle: row!.handle!,
    hostname: `${slug}.staging.manifest.internal`,
  }
}

const startSession = (ctx: TestProject, cookies = ctx.ownerCookies) =>
  ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/agent-sessions`,
    payload: { name: 'Build the bulletin board' },
    cookies,
    headers: mutationHeaders(ctx.deps),
  })

const eventTypes = async (ctx: TestProject, type: string) =>
  ctx.db
    .select()
    .from(events)
    .where(and(eq(events.projectId, ctx.projectId), eq(events.type, type)))

describe('archive and restore (§11, Task 11)', () => {
  /**
   * DECISION 27 SAYS A TOKEN CANNOT REACH AN ARCHIVED PROJECT BECAUSE ARCHIVING REVOKES EVERY TOKEN.
   * This holds it for a token the archive never saw — one the store wrote, or a mint that raced it:
   * `tokenActor` refuses a token whose project is not active, on the lookup it already makes.
   */
  it('a token of an archived project is 401 UNAUTHENTICATED, not 409 — even one the archive never revoked', async () => {
    await withProjectServer(async (ctx) => {
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read', 'build:create'],
      })
      const read = () =>
        ctx.app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.projectId}`,
          headers: { authorization: `Bearer ${plaintext}` },
        })
      // The positive control: the same token reads the project while it is active.
      expect((await read()).statusCode).toBe(200)
      await ctx.db
        .update(projects)
        .set({ state: 'archived' })
        .where(eq(projects.id, ctx.projectId))
      expect(refusal(await read())).toEqual({ status: 401, code: 'UNAUTHENTICATED' })
    })
  })

  it('archives: every session ended, every token revoked, every question expired, every name switched off, every instance retired, every environment stopped keeping its data', async () => {
    await withLifecycleServer(async (ctx, lite, sso) => {
      const deployed = await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      const started = await startSession(ctx)
      expect(started.statusCode, started.body).toBe(201)
      const session = started.json() as {
        session: { id: string; models: string[] }
        key: string
      }
      const minted = await mutate(ctx, `/v1/projects/${ctx.projectId}/tokens`, {
        name: 'agent',
        capabilities: ['project:read'],
        expiresInDays: 1,
      })
      expect(minted.statusCode, minted.body).toBe(201)
      const { token, secret } = minted.json() as { token: { id: string }; secret: string }
      const question = await recordPendingAction(ctx.db, ctx.deps.bus, {
        error: new TokenCapabilityRefusedError('members:manage', ctx.projectId, token.id),
        fingerprint: fingerprintOf({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/members`,
          body: { puid: 'bio_student', role: 'collaborator' },
          summary: 'Add or change a member',
        }),
      })

      const res = await archive(ctx, ctx.ownerSteppedUp)
      expect(res.statusCode, res.body).toBe(200)
      const body = res.json() as { state: string; archivedAt: string | null }
      expect(body.state).toBe('archived')
      expect(Date.parse(body.archivedAt ?? '')).not.toBeNaN()

      // 1. The session ended — and the GATEWAY refuses its key, which is the property.
      const [ended] = await ctx.db
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.id, session.session.id))
      expect(ended!.endReason).toBe('project_archived')
      expect(lite.use(session.key, session.session.models[0]!)).toEqual({
        status: 401,
        type: 'token_not_found_in_db',
      })
      // 2. The token revoked — and it authenticates nothing.
      const [revoked] = await ctx.db
        .select()
        .from(delegatedTokens)
        .where(eq(delegatedTokens.id, token.id))
      expect(revoked!.revokedAt).not.toBeNull()
      const asToken = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        headers: { authorization: `Bearer ${secret}` },
      })
      expect(refusal(asToken)).toEqual({ status: 401, code: 'UNAUTHENTICATED' })
      // 3. The question expired.
      const [expired] = await ctx.db
        .select()
        .from(pendingActions)
        .where(eq(pendingActions.id, question.id))
      expect(expired!.state).toBe('expired')
      // 4. The name switched off — on the edge and in the record of what serves.
      expect(driver.isSwitchedOff(deployed.hostname)).toBe(true)
      expect(await driver.servingInstance(deployed.hostname)).toBeUndefined()
      expect(
        await ctx.db.select().from(routes).where(eq(routes.hostname, deployed.hostname)),
      ).toEqual([])
      // 5. The instance retired — its row and its container.
      const [instance] = await ctx.db
        .select()
        .from(instances)
        .where(eq(instances.id, deployed.instanceId))
      expect(instance!.state).toBe('gone')
      expect((await driver.status(deployed.handle)).state).toBe('gone')
      // 6. Every environment stopped, its services named, KEEPING their data.
      expect(
        driver
          .destroyedEnvironments()
          .map((e) => ({ ...e, services: [...e.services] }))
          .sort((a, b) => a.kind.localeCompare(b.kind)),
      ).toEqual([
        { slug: deployed.slug, kind: 'production', services: [], deleteData: false },
        { slug: deployed.slug, kind: 'sandbox', services: [], deleteData: false },
        {
          slug: deployed.slug,
          kind: 'staging',
          services: [`${deployed.slug}-staging-db`],
          deleteData: false,
        },
      ])
      // 7. Sandbox's and staging's SP registrations removed — never production's (Spec action 6).
      expect(sso.removed).toEqual([
        { slug: deployed.slug, environmentKind: 'sandbox' },
        { slug: deployed.slug, environmentKind: 'staging' },
      ])
      // 8. Published once, naming the person who did it — never a PUID.
      const archived = await eventTypes(ctx, 'project.archived')
      expect(archived).toHaveLength(1)
      expect(archived[0]!.machineDetail).toEqual({
        via: 'session',
        userId: ctx.userId,
        tokenId: null,
      })
      expect(archived[0]!.humanMessage).not.toContain('bio_prof')
    })
  }, 30_000)

  it('archives a project that never deployed: nothing to retire, and every step still answers', async () => {
    await withLifecycleServer(async (ctx) => {
      const res = await archive(ctx, ctx.ownerSteppedUp)
      expect(res.statusCode, res.body).toBe(200)
      expect((await eventTypes(ctx, 'project.archived')).length).toBe(1)
    })
  })

  it('needs step-up to archive, and not to restore', async () => {
    await withLifecycleServer(async (ctx) => {
      expect(refusal(await archive(ctx, ctx.ownerCookies))).toEqual({
        status: 403,
        code: 'STEP_UP_REQUIRED',
      })
      // The refusal took nothing down: the project is still active.
      const [before] = await ctx.db
        .select({ state: projects.state })
        .from(projects)
        .where(eq(projects.id, ctx.projectId))
      expect(before!.state).toBe('active')
      expect((await archive(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
      const restored = await restore(ctx, ctx.ownerCookies)
      expect(restored.statusCode, restored.body).toBe(200)
      expect((restored.json() as { state: string }).state).toBe('active')
    })
  })

  it('refuses a collaborator, and a token outright; an administrator may', async () => {
    await withLifecycleServer(async (ctx) => {
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator', {
        steppedUp: true,
      })
      expect(refusal(await archive(ctx, collaborator))).toEqual({
        status: 403,
        code: 'FORBIDDEN',
      })
      expect(refusal(await restore(ctx, collaborator))).toEqual({
        status: 403,
        code: 'FORBIDDEN',
      })
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read', 'project:delete'],
      })
      const asToken = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/archive`,
        headers: {
          authorization: `Bearer ${plaintext}`,
          'idempotency-key': randomUUID(),
        },
        payload: {},
      })
      expect(refusal(asToken)).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
      // §26: an administrator acts on anyone's project — stepped up, like the owner.
      const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
      expect((await archive(ctx, admin)).statusCode).toBe(200)
    })
  })

  it('refuses a build, a commit, a deploy, a session and a token on an archived project, and answers reads', async () => {
    await withLifecycleServer(async (ctx) => {
      const deployed = await deployWithDatabase(ctx)
      expect((await archive(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
      const ARCHIVED = { status: 409, code: 'PROJECT_ARCHIVED' }
      expect(
        refusal(await mutate(ctx, `/v1/projects/${ctx.projectId}/builds`, {})),
      ).toEqual(ARCHIVED)
      expect(
        refusal(
          await mutate(ctx, `/v1/projects/${ctx.projectId}/commits`, {
            baseCommit: ctx.commitSha,
            message: 'feat: after the course ended',
            changes: [{ op: 'write', path: 'late.txt', content: 'late\n' }],
          }),
        ),
      ).toEqual(ARCHIVED)
      expect(
        refusal(
          await mutate(ctx, `/v1/environments/${ctx.stagingEnvironmentId}/deploy`, {
            releaseId: deployed.releaseId,
          }),
        ),
      ).toEqual(ARCHIVED)
      expect(refusal(await startSession(ctx))).toEqual(ARCHIVED)
      expect(
        refusal(
          await mutate(ctx, `/v1/projects/${ctx.projectId}/tokens`, {
            name: 'late',
            capabilities: ['project:read'],
            expiresInDays: 1,
          }),
        ),
      ).toEqual(ARCHIVED)
      // The positive control: it is still READ, and says what it is.
      const read = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        cookies: ctx.ownerCookies,
      })
      expect(read.statusCode, read.body).toBe(200)
      expect((read.json() as { state: string }).state).toBe('archived')
    })
  }, 30_000)

  it('an archive that stops at a step is finished by the same request retried', async () => {
    await withLifecycleServer(async (ctx) => {
      await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      const destroy = driver.destroyEnvironment.bind(driver)
      let failures = 1
      driver.destroyEnvironment = async (ref, opts) => {
        if (failures > 0) {
          failures -= 1
          throw new Error('the engine did not answer')
        }
        return destroy(ref, opts)
      }
      const headers = mutationHeaders(ctx.deps)
      const once = () =>
        ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/archive`,
          cookies: ctx.ownerSteppedUp,
          headers,
          payload: {},
        })
      const first = await once()
      expect(refusal(first)).toEqual({ status: 500, code: 'PROJECT_TEARDOWN_INCOMPLETE' })
      expect(first.body).not.toContain('the engine did not answer')
      const [row] = await ctx.db
        .select({ state: projects.state })
        .from(projects)
        .where(eq(projects.id, ctx.projectId))
      // Archived FIRST, whatever failed after: nothing new starts on a half-torn-down app.
      expect(row!.state).toBe('archived')
      expect(await eventTypes(ctx, 'project.archived')).toEqual([])
      // The SAME request — its Idempotency-Key and all — continues where it stopped.
      const second = await once()
      expect(second.statusCode, second.body).toBe(200)
      expect(
        driver
          .destroyedEnvironments()
          .map((e) => e.kind)
          .sort(),
      ).toEqual(['production', 'sandbox', 'staging'])
      expect(await eventTypes(ctx, 'project.archived')).toHaveLength(1)
      // And a THIRD asks nothing new of anyone: it answers as it is, published once.
      expect((await archive(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
      expect(await eventTypes(ctx, 'project.archived')).toHaveLength(1)
    })
  }, 30_000)

  it('restores to active, starts nothing, and the next deploy serves again', async () => {
    await withLifecycleServer(async (ctx) => {
      const deployed = await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      expect((await archive(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
      const instancesBefore = driver.instanceCount()
      const restored = await restore(ctx, ctx.ownerCookies)
      expect(restored.statusCode, restored.body).toBe(200)
      expect(restored.json()).toMatchObject({ state: 'active' })
      // Nothing started: the name still answers the switched-off page, and no instance appeared.
      expect(driver.isSwitchedOff(deployed.hostname)).toBe(true)
      expect(driver.instanceCount()).toBe(instancesBefore)
      expect(await eventTypes(ctx, 'project.restored')).toHaveLength(1)
      // A restore of an active project answers it as it is, and publishes nothing.
      expect((await restore(ctx, ctx.ownerCookies)).statusCode).toBe(200)
      expect(await eventTypes(ctx, 'project.restored')).toHaveLength(1)
      // The next deploy brings it back, replacing the page in place.
      const again = await mutate(
        ctx,
        `/v1/environments/${ctx.stagingEnvironmentId}/deploy`,
        { releaseId: deployed.releaseId },
      )
      expect(again.statusCode, again.body).toBe(200)
      const { id } = again.json() as { id: string }
      const [row] = await ctx.db.select().from(instances).where(eq(instances.id, id))
      expect(await driver.servingInstance(deployed.hostname)).toBe(row!.handle)
      expect(driver.isSwitchedOff(deployed.hostname)).toBe(false)
    })
  }, 30_000)

  /**
   * THE REVIEW'S I1, CARRIED FROM SITTING 7: a start that authorized before the archive and commits
   * after it. The start holds the project's row `FOR SHARE`, so either the archive waits and ends
   * the session, or it committed first and the start is refused `PROJECT_ARCHIVED`.
   */
  it('a session starting WHILE the project is archived never leaves the agent a working key', async () => {
    await withLifecycleServer(async (ctx, lite) => {
      lite.slow('/key/generate', 150)
      const starting = startSession(ctx)
      for (
        let i = 0;
        i < 200 && !lite.calls.some((c) => c.path === '/key/generate');
        i++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      expect(
        lite.calls.some((c) => c.path === '/key/generate'),
        'the mint never began',
      ).toBe(true)
      const archived = await archive(ctx, ctx.ownerSteppedUp)
      expect(archived.statusCode, archived.body).toBe(200)
      const res = await starting
      if (res.statusCode === 201) {
        const started = res.json() as { key: string; session: { models: string[] } }
        expect(lite.use(started.key, started.session.models[0]!)).toEqual({
          status: 401,
          type: 'token_not_found_in_db',
        })
      } else {
        expect(refusal(res)).toEqual({ status: 409, code: 'PROJECT_ARCHIVED' })
      }
      // Whichever order the two landed in: no key of this project's is still live.
      const live = [...lite.keys.values()].filter(
        (k) =>
          (k.metadata as { manifest_project?: string }).manifest_project ===
          ctx.projectId,
      )
      expect(live).toEqual([])
    })
  }, 30_000)

  /**
   * THE MINT'S WINDOW, MADE DETERMINISTIC (control (h) stayed green without it): a transaction here
   * holds the project's row `FOR UPDATE`, which a plain read — `assertCapability`'s — passes, and
   * which blocks both the mint's `FOR SHARE` hold and its insert's foreign-key check. The state is
   * set to archived in that transaction and committed. Held, the mint then reads the state and is
   * refused; without the hold, its insert proceeds and a token survives the archive — alive again
   * after a restore, where archive's rule is that every token stays revoked.
   */
  it('a token minted while the project is archived is refused, and none is left to come back after a restore', async () => {
    await withLifecycleServer(async (ctx) => {
      let minting: ReturnType<typeof mutate> | undefined
      await ctx.db.transaction(async (tx) => {
        await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, ctx.projectId))
          .for('update')
        minting = mutate(ctx, `/v1/projects/${ctx.projectId}/tokens`, {
          name: 'racing',
          capabilities: ['project:read'],
          expiresInDays: 1,
        })
        // Long enough that the mint has authorized and is waiting on this row.
        await new Promise((resolve) => setTimeout(resolve, 300))
        await tx
          .update(projects)
          .set({ state: 'archived' })
          .where(eq(projects.id, ctx.projectId))
      })
      expect(refusal(await minting!)).toEqual({ status: 409, code: 'PROJECT_ARCHIVED' })
      expect(
        await ctx.db
          .select()
          .from(delegatedTokens)
          .where(eq(delegatedTokens.projectId, ctx.projectId)),
      ).toEqual([])
    })
  })

  /**
   * A deploy AUTHORIZES before it takes the environment's lock. One that authorized before an
   * archive began, and was waiting for that lock when the archive set the project's state, must be
   * refused — not deploy, answer `200`, and be torn down behind its caller's back. Two things hold
   * it: the archive sets the state FIRST (Decision 28), and `deployRelease` reads the state again
   * under the lock. The deploy queues for the lock before the archive does, so it is granted it
   * first, and finds the project already archived.
   */
  it('a deploy waiting when an archive begins is refused, and starts nothing', async () => {
    await withLifecycleServer(async (ctx) => {
      const deployed = await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      let deploying: ReturnType<typeof mutate> | undefined
      let archiving: ReturnType<typeof archive> | undefined
      await withEnvironmentLock(ctx.stagingEnvironmentId, async () => {
        deploying = mutate(ctx, `/v1/environments/${ctx.stagingEnvironmentId}/deploy`, {
          releaseId: deployed.releaseId,
        })
        // Long enough that the deploy has authorized and is waiting for this lock…
        await new Promise((resolve) => setTimeout(resolve, 300))
        archiving = archive(ctx, ctx.ownerSteppedUp)
        // …and that the archive has set its state and is waiting for it too.
        await new Promise((resolve) => setTimeout(resolve, 300))
      })
      expect(refusal(await deploying!)).toEqual({ status: 409, code: 'PROJECT_ARCHIVED' })
      expect((await archiving!).statusCode).toBe(200)
      // Nothing it started: every instance of staging is the first deploy's, and it is gone.
      const staging = await ctx.db
        .select()
        .from(instances)
        .where(eq(instances.environmentId, ctx.stagingEnvironmentId))
      expect(staging.map((row) => row.id)).toEqual([deployed.instanceId])
      expect(staging[0]!.state).toBe('gone')
      expect(driver.isSwitchedOff(deployed.hostname)).toBe(true)
    })
  }, 30_000)

  /**
   * The review's deferred minor 3, decided here: with AI switched off, a session whose key has
   * already EXPIRED needs no gateway to end — LiteLLM refuses an expired key by its own `duration`
   * — so an archive stamps it and finishes. One whose key is still live cannot be ended without the
   * gateway, and the archive says so rather than pretending.
   */
  it('finishes an archive with AI switched off when its agent sessions have expired — and refuses to when one has not', async () => {
    await withProjectServer(async (ctx) => {
      const [expired] = await ctx.db
        .insert(agentSessions)
        .values({
          projectId: ctx.projectId,
          userId: ctx.userId,
          name: 'old',
          models: ['default-chat'],
          capUsd: '2',
          expiresAt: new Date(Date.now() - 60_000),
        })
        .returning()
      const done = await archive(ctx, ctx.ownerSteppedUp)
      expect(done.statusCode, done.body).toBe(200)
      const [row] = await ctx.db
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.id, expired!.id))
      expect(row!.endReason).toBe('project_archived')
      expect(row!.spentUsd).toBeNull()

      expect((await restore(ctx, ctx.ownerCookies)).statusCode).toBe(200)
      await ctx.db.insert(agentSessions).values({
        projectId: ctx.projectId,
        userId: ctx.userId,
        name: 'live',
        models: ['default-chat'],
        capUsd: '2',
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      expect(refusal(await archive(ctx, ctx.ownerSteppedUp))).toEqual({
        status: 500,
        code: 'PROJECT_TEARDOWN_INCOMPLETE',
      })
    })
  })

  /**
   * THE WHOLE-BRANCH REVIEW'S I1: the one step that needs the model gateway stood FIRST, and a run
   * stops at its first failure — so with LiteLLM down and one live agent session, an "archived" app
   * kept serving its students, its tokens were never revoked, and a restore revived them. Now the
   * tokens and questions go in the state's own transaction, and the gateway's step runs LAST.
   */
  it('an archive whose agent sessions cannot be ended still switches the app off and revokes its tokens — and a restore does not revive them', async () => {
    await withLifecycleServer(async (ctx, lite) => {
      const deployed = await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      expect((await startSession(ctx)).statusCode).toBe(201)
      const minted = await mutate(ctx, `/v1/projects/${ctx.projectId}/tokens`, {
        name: 'agent',
        capabilities: ['project:read'],
        expiresInDays: 1,
      })
      const { secret } = minted.json() as { secret: string }
      // The gateway cannot revoke anything.
      lite.fail('/key/delete', 503, 100)
      expect(refusal(await archive(ctx, ctx.ownerSteppedUp))).toEqual({
        status: 500,
        code: 'PROJECT_TEARDOWN_INCOMPLETE',
      })
      // What students meet is off, whatever the gateway says…
      expect(driver.isSwitchedOff(deployed.hostname)).toBe(true)
      expect((await driver.status(deployed.handle)).state).toBe('gone')
      // …and a restore does not bring the token back.
      expect((await restore(ctx, ctx.ownerCookies)).statusCode).toBe(200)
      const asToken = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        headers: { authorization: `Bearer ${secret}` },
      })
      expect(refusal(asToken)).toEqual({ status: 401, code: 'UNAUTHENTICATED' })
    })
  }, 30_000)

  /**
   * THE WHOLE-BRANCH REVIEW'S I2 (and its minor 6, that nothing measured this): an AI app's deploy
   * stores the instance's model key BEFORE its container is ready and its handle recorded, so a
   * control plane killed in between leaves a row with no handle and a key live at the gateway. An
   * archive revokes every instance key it retires — that row's included.
   */
  it('revokes the model key of every instance an archive retires — one whose deploy never recorded its handle included', async () => {
    const revoked: string[] = []
    const ai: AiKeyService = {
      enabled: true,
      mintAppKey: () => {
        throw new Error('nothing in this test mints an app key')
      },
      discardAppKey: () => {
        throw new Error('nothing in this test discards an app key')
      },
      storeInstanceKey: () => {
        throw new Error('nothing in this test stores an app key')
      },
      revokeInstanceKey: (_db, input) => {
        revoked.push(input.instanceId)
        return Promise.resolve(true)
      },
      revokeLegacyAppKey: () => Promise.resolve(false),
    }
    await withLifecycleServer(
      async (ctx) => {
        const deployed = await deployWithDatabase(ctx)
        const [interrupted] = await ctx.db
          .insert(instances)
          .values({
            environmentId: ctx.stagingEnvironmentId,
            releaseId: deployed.releaseId,
            driver: 'fake',
            kind: 'web',
            state: 'failed',
          })
          .returning()
        expect((await archive(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
        expect(revoked.sort()).toEqual([deployed.instanceId, interrupted!.id].sort())
      },
      { ai },
    )
  }, 30_000)

  /** The boot, as `index.ts` calls it: its retire passes recorded rather than run. */
  const boot = (ctx: TestProject) =>
    recoverAtBoot({
      db: ctx.db,
      driver: ctx.deps.driver,
      bus: ctx.deps.bus,
      retirer: { schedule: () => undefined },
      finishTeardowns: () => finishTeardowns(lifecycleDeps(ctx.deps)),
      takeDownLeftRehearsals: () => Promise.resolve({ takenDown: [], failed: [] }),
    })

  /**
   * REVIEW FOCUS 4: the control plane killed after the name moved and before the instances were
   * retired. The project reads archived, the name answers the switched-off page — and the next
   * boot finishes the rest and publishes `project.archived`, once.
   */
  it('an archive interrupted after the route moved is finished by the next boot', async () => {
    await withLifecycleServer(async (ctx) => {
      const deployed = await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      await ctx.db
        .update(projects)
        .set({ state: 'archived', archivedAt: new Date(), archivedBy: ctx.userId })
        .where(eq(projects.id, ctx.projectId))
      await runTeardown(
        lifecycleDeps(ctx.deps),
        { projectId: ctx.projectId, by: { userId: ctx.userId, tokenId: null } },
        {
          deleteData: false,
          steps: TEARDOWN_STEPS.slice(0, TEARDOWN_STEPS.indexOf('switch-off-names') + 1),
        },
      )
      // Stopped there: switched off, and still running behind the page.
      expect(driver.isSwitchedOff(deployed.hostname)).toBe(true)
      expect((await driver.status(deployed.handle)).state).not.toBe('gone')
      expect(driver.destroyedEnvironments()).toEqual([])

      const report = await boot(ctx)
      expect(report.teardowns).toEqual({ finished: [deployed.slug], failed: [] })
      expect((await driver.status(deployed.handle)).state).toBe('gone')
      expect(
        driver
          .destroyedEnvironments()
          .map((e) => e.kind)
          .sort(),
      ).toEqual(['production', 'sandbox', 'staging'])
      const archived = await eventTypes(ctx, 'project.archived')
      expect(archived).toHaveLength(1)
      expect(archived[0]!.machineDetail).toMatchObject({ userId: ctx.userId })
      // A second boot finishes nothing new, and publishes nothing twice.
      await boot(ctx)
      expect(await eventTypes(ctx, 'project.archived')).toHaveLength(1)
    })
  }, 30_000)

  it('an edge that forgot every route answers the switched-off page again once the boot has run', async () => {
    await withLifecycleServer(async (ctx) => {
      const deployed = await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      expect((await archive(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
      // What `docker restart manifest-caddy` does (ORIENTATION §4 trap 19).
      driver.dropRoutes()
      expect(driver.isSwitchedOff(deployed.hostname)).toBe(false)
      await boot(ctx)
      expect(driver.isSwitchedOff(deployed.hostname)).toBe(true)
      // And never an ACTIVE project's name: the positive control's other half.
      const [other] = await ctx.db
        .select({ slug: projects.slug })
        .from(projects)
        .where(eq(projects.id, ctx.otherProjectId))
      expect(driver.isSwitchedOff(`${other!.slug}.staging.manifest.internal`)).toBe(false)
    })
  }, 30_000)
})

/**
 * §11's DELETE (Spec action 3; the front-end enablement plan's Task 12, Decision 31): only a project
 * that never launched; archive first, then destroy what archive kept — every data volume, every
 * secret, the repository, the model users — and the names answer nothing of this project's. The
 * row stays, a tombstone the append-only audit trail references, and its slug is free again.
 */
describe('delete (§11, Task 12)', () => {
  const remove = (
    ctx: TestProject,
    cookies: Record<string, string>,
    headers = mutationHeaders(ctx.deps),
  ) =>
    ctx.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${ctx.projectId}`,
      cookies,
      headers,
    })

  const stateOf = async (ctx: TestProject) => {
    const [row] = await ctx.db
      .select({ state: projects.state, deletedAt: projects.deletedAt })
      .from(projects)
      .where(eq(projects.id, ctx.projectId))
    return row!
  }

  const secretCount = async (ctx: TestProject) =>
    (await ctx.db.select().from(secrets).where(eq(secrets.projectId, ctx.projectId)))
      .length

  const userDeletes = (lite: FakeLiteLlm) =>
    lite.calls.filter((c) => c.path === '/user/delete').map((c) => c.body)

  it('deletes a never-launched project: its repository, its data, its secrets and its model users destroyed; the row a tombstone', async () => {
    await withLifecycleServer(async (ctx, lite, sso) => {
      const deployed = await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      // One of the project's three model users exists, as a deploy with AI would have made it; the
      // other two do not, and each is asked for alone — a list with one missing deletes NOTHING
      // (measured on LiteLLM, sitting 9).
      await lite.post('/user/new', {
        user_id: `mf-${ctx.projectId}-staging`,
        max_budget: 5,
      })
      expect(await secretCount(ctx)).toBeGreaterThan(0)
      const repo = ctx.deps.source.repositoryFor(deployed.slug)
      expect(await ctx.deps.source.headCommit(repo)).toMatch(/^[0-9a-f]{40}$/)

      const res = await remove(ctx, ctx.ownerSteppedUp)
      expect(res.statusCode, res.body).toBe(200)
      const body = res.json() as Record<string, unknown>
      expect(Object.keys(body).sort()).toEqual(['deletedAt', 'id', 'slug', 'state'])
      expect(body).toMatchObject({
        id: ctx.projectId,
        slug: deployed.slug,
        state: 'deleted',
      })
      expect(Date.parse(String(body.deletedAt))).not.toBeNaN()

      // 1. Every environment's services destroyed WITH their data.
      expect(
        driver
          .destroyedEnvironments()
          .filter((e) => e.deleteData)
          .map((e) => ({ ...e, services: [...e.services] }))
          .sort((a, b) => a.kind.localeCompare(b.kind)),
      ).toEqual([
        { slug: deployed.slug, kind: 'production', services: [], deleteData: true },
        { slug: deployed.slug, kind: 'sandbox', services: [], deleteData: true },
        {
          slug: deployed.slug,
          kind: 'staging',
          services: [`${deployed.slug}-staging-db`],
          deleteData: true,
        },
      ])
      // 2. Every secret of the project gone.
      expect(await secretCount(ctx)).toBe(0)
      // 3. The repository gone.
      await expect(ctx.deps.source.headCommit(repo)).rejects.toMatchObject({
        code: 'SOURCE_GIT_FAILED',
      })
      // 4. The three model users asked for, ONE per call; the one that existed is gone.
      expect(userDeletes(lite)).toEqual(
        ['production', 'sandbox', 'staging'].map((kind) => ({
          user_ids: [`mf-${ctx.projectId}-${kind}`],
        })),
      )
      expect(lite.users.has(`mf-${ctx.projectId}-staging`)).toBe(false)
      // 5. The names answer nothing of this project's — not even the switched-off page.
      expect(driver.isSwitchedOff(deployed.hostname)).toBe(false)
      expect(await driver.servingInstance(deployed.hostname)).toBeUndefined()
      // Every Manifest-IdP registration — the archive's two, and production's, which a laptop's
      // launch rehearsal writes for a project that never launched.
      expect(sso.removed.map((r) => r.environmentKind).sort()).toEqual([
        'production',
        'sandbox',
        'staging',
      ])
      // 6. The tombstone: the row, deleted, and the trail it anchors still there.
      expect(await stateOf(ctx)).toMatchObject({ state: 'deleted' })
      expect((await stateOf(ctx)).deletedAt).not.toBeNull()
      const deleted = await eventTypes(ctx, 'project.deleted')
      expect(deleted).toHaveLength(1)
      expect(deleted[0]!.machineDetail).toEqual({
        via: 'session',
        userId: ctx.userId,
        tokenId: null,
      })
      expect(deleted[0]!.humanMessage).not.toContain('bio_prof')
      expect(await eventTypes(ctx, 'project.created')).toHaveLength(1)
      // And to everyone — the administrator included — a deleted project is a stranger's 404.
      const admin = await loginAs(ctx.deps, 'platform_admin')
      for (const cookies of [ctx.ownerCookies, admin]) {
        const read = await ctx.app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.projectId}`,
          cookies,
        })
        expect(refusal(read)).toEqual({ status: 404, code: 'NOT_FOUND' })
      }
    })
  }, 30_000)

  it('refuses a launched project by its own code, and destroys nothing', async () => {
    await withLifecycleServer(async (ctx, lite) => {
      const deployed = await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      await ctx.db
        .update(projects)
        .set({ launchedAt: new Date() })
        .where(eq(projects.id, ctx.projectId))
      expect(refusal(await remove(ctx, ctx.ownerSteppedUp))).toEqual({
        status: 409,
        code: 'PROJECT_LAUNCHED_NOT_DELETABLE',
      })
      // Nothing was asked of anything: not even the archive ran.
      expect(await stateOf(ctx)).toEqual({ state: 'active', deletedAt: null })
      expect(driver.destroyedEnvironments()).toEqual([])
      expect(driver.isSwitchedOff(deployed.hostname)).toBe(false)
      expect(await driver.servingInstance(deployed.hostname)).toBe(deployed.handle)
      expect(userDeletes(lite)).toEqual([])
      expect(await eventTypes(ctx, 'project.archived')).toEqual([])
      expect(
        await ctx.deps.source.headCommit(ctx.deps.source.repositoryFor(deployed.slug)),
      ).toMatch(/^[0-9a-f]{40}$/)
    })
  }, 30_000)

  it('releases the slug: a new project may take it, and the old one stays a tombstone', async () => {
    await withLifecycleServer(async (ctx) => {
      const slug = await slugOf(ctx)
      const check = () =>
        ctx.app.inject({
          method: 'GET',
          url: `/v1/slugs/${slug}`,
          cookies: ctx.ownerCookies,
        })
      expect((await check()).json()).toMatchObject({ available: false })
      expect((await remove(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
      expect((await check()).json()).toEqual({ slug, available: true })
      const again = await ctx.app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: projectBody(slug),
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(again.statusCode, again.body).toBe(201)
      const fresh = again.json() as { id: string }
      expect(fresh.id).not.toBe(ctx.projectId)
      const holders = await ctx.db
        .select({ id: projects.id, state: projects.state })
        .from(projects)
        .where(eq(projects.slug, slug))
      expect(holders.map((h) => h.state).sort()).toEqual(['active', 'deleted'])
      // The new one is the only one anybody sees: the owner's list names it, once.
      const list = await ctx.app.inject({
        method: 'GET',
        url: '/v1/projects',
        cookies: ctx.ownerCookies,
      })
      expect(list.statusCode, list.body).toBe(200)
      const listed = list.json() as { id: string; slug: string }[]
      expect(listed.filter((p) => p.slug === slug).map((p) => p.id)).toEqual([fresh.id])
      // …and the fleet the same.
      const fleet = await ctx.app.inject({
        method: 'GET',
        url: '/v1/fleet',
        cookies: await loginAs(ctx.deps, 'platform_admin'),
      })
      expect(fleet.statusCode, fleet.body).toBe(200)
      expect(fleet.body).not.toContain(ctx.projectId)
      // And while a slug is held by a LIVE project, it is still taken: the index is partial, not gone.
      expect((await check()).json()).toMatchObject({ available: false })
    })
  }, 30_000)

  /**
   * THE WHOLE-BRANCH REVIEW'S M2 (and the deferred "archiveProject does not re-read the state under
   * its lock"): an archive that authorized BEFORE a delete finished waits on the project's lock the
   * delete holds, and runs once the slug is free. Every step of a teardown reaches the edge, the
   * driver and the IdP by NAME, which is the slug's — so, unguarded, it switched off, retired and
   * deregistered whichever project had taken the slug since. Called here as it would then run: past
   * the route, whose `assertCapability` a deleted project already answers `404`.
   */
  it('an archive that authorized before a delete and runs after it touches nothing — the names may be another project’s now', async () => {
    await withLifecycleServer(async (ctx, _lite, sso) => {
      const slug = await slugOf(ctx)
      expect((await remove(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
      // Another project takes the slug, and serves staging on the same name.
      const again = await ctx.app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: projectBody(slug),
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(again.statusCode, again.body).toBe(201)
      const taken = again.json() as {
        id: string
        spec: { commitSha: string }
        environments: { id: string; kind: string }[]
      }
      const build = await mutate(ctx, `/v1/projects/${taken.id}/builds`, {
        commitSha: taken.spec.commitSha,
      })
      expect(build.statusCode, build.body).toBe(202)
      await ctx.deps.builds.idle()
      const release = await mutate(ctx, `/v1/projects/${taken.id}/releases`, {
        buildId: (build.json() as { id: string }).id,
      })
      expect(release.statusCode, release.body).toBe(201)
      const staging = taken.environments.find((e) => e.kind === 'staging')!
      const deployed = await mutate(ctx, `/v1/environments/${staging.id}/deploy`, {
        releaseId: (release.json() as { id: string }).id,
      })
      expect(deployed.json().state, deployed.body).toBe('healthy')
      const driver = ctx.deps.driver as FakeDriver
      const hostname = `${slug}.staging.manifest.internal`
      const serving = await driver.servingInstance(hostname)
      expect(serving).toBeDefined()
      const removedBefore = sso.removed.length
      const owner = await ensureTestUser(ctx.db, 'bio_prof')

      await archiveProject(lifecycleDeps(ctx.deps), {
        projectId: ctx.projectId,
        actor: {
          credential: 'session',
          userId: owner.id,
          platformRole: 'member',
          puid: 'bio_prof',
          steppedUpAt: Date.now(),
          expiresAt: Date.now() + 3_600_000,
        },
      })

      // The name still reaches the project that holds it now…
      expect(driver.isSwitchedOff(hostname)).toBe(false)
      expect(await driver.servingInstance(hostname)).toBe(serving)
      expect((await driver.status(serving!)).healthy).toBe(true)
      // …its Route record stays, nothing was deregistered, and the tombstone is still a tombstone.
      const [route] = await ctx.db
        .select()
        .from(routes)
        .where(eq(routes.hostname, hostname))
      expect(route).toBeDefined()
      expect(sso.removed.length).toBe(removedBefore)
      expect((await stateOf(ctx)).state).toBe('deleted')
    })
  }, 30_000)

  it('archives first when the project is active', async () => {
    await withLifecycleServer(async (ctx, lite) => {
      await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      const started = await startSession(ctx)
      expect(started.statusCode, started.body).toBe(201)
      const session = started.json() as { session: { models: string[] }; key: string }
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      expect((await remove(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
      // Every step of the archive — the session's key refused, the token revoked — then the destroy:
      // `project.archived` recorded BEFORE `project.deleted`.
      expect(lite.use(session.key, session.session.models[0]!).status).toBe(401)
      expect(await tokenActor(ctx.db, plaintext)).toBeUndefined()
      const trail = (
        await ctx.db
          .select({ type: events.type })
          .from(events)
          .where(eq(events.projectId, ctx.projectId))
          .orderBy(events.createdAt)
      ).map((e) => e.type)
      expect(trail.filter((t) => t.startsWith('project.'))).toEqual([
        'project.created',
        'project.archived',
        'project.deleted',
      ])
      // The switch-off KEEPS everything (the review's I1/I2); only then does the delete destroy it.
      expect(driver.destroyedEnvironments().map((e) => e.deleteData)).toEqual([
        false,
        false,
        false,
        true,
        true,
        true,
      ])
    })
  }, 30_000)

  it('deletes an archived project without switching it off twice', async () => {
    await withLifecycleServer(async (ctx) => {
      await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      expect((await archive(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
      expect((await remove(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
      expect(await eventTypes(ctx, 'project.archived')).toHaveLength(1)
      expect(await eventTypes(ctx, 'project.deleted')).toHaveLength(1)
      // The archive kept the data, and so did the delete's own switch-off; then it destroyed it.
      expect(driver.destroyedEnvironments().map((e) => e.deleteData)).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
      ])
    })
  }, 30_000)

  it('needs step-up, and is a person’s alone', async () => {
    await withLifecycleServer(async (ctx) => {
      expect(refusal(await remove(ctx, ctx.ownerCookies))).toEqual({
        status: 403,
        code: 'STEP_UP_REQUIRED',
      })
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator', {
        steppedUp: true,
      })
      expect(refusal(await remove(ctx, collaborator))).toEqual({
        status: 403,
        code: 'FORBIDDEN',
      })
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read', 'project:delete'],
      })
      const asToken = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/projects/${ctx.projectId}`,
        headers: {
          authorization: `Bearer ${plaintext}`,
          'idempotency-key': randomUUID(),
        },
      })
      expect(refusal(asToken)).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
      // Each refusal took nothing down.
      expect(await stateOf(ctx)).toEqual({ state: 'active', deletedAt: null })
      // The positive control: an administrator, stepped up, may.
      const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
      const res = await remove(ctx, admin)
      expect(res.statusCode, res.body).toBe(200)
      // And a deleted project is gone for its deleter too: the same request again is a 404.
      expect(refusal(await remove(ctx, admin))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
    })
  }, 30_000)

  it('a delete that stops at a step is finished by the same request retried', async () => {
    await withLifecycleServer(async (ctx) => {
      const deployed = await deployWithDatabase(ctx)
      const source = ctx.deps.source
      const destroy = source.destroyRepository.bind(source)
      let failures = 1
      source.destroyRepository = async (repo) => {
        if (failures > 0) {
          failures -= 1
          throw new Error('the disk did not answer')
        }
        return destroy(repo)
      }
      try {
        const headers = mutationHeaders(ctx.deps)
        const first = await remove(ctx, ctx.ownerSteppedUp, headers)
        expect(refusal(first)).toEqual({
          status: 500,
          code: 'PROJECT_TEARDOWN_INCOMPLETE',
        })
        expect(first.body).not.toContain('the disk did not answer')
        // ARCHIVED, not deleted: a person still sees it, and nothing runs.
        expect(await stateOf(ctx)).toEqual({ state: 'archived', deletedAt: null })
        expect(await eventTypes(ctx, 'project.deleted')).toEqual([])
        const second = await remove(ctx, ctx.ownerSteppedUp, headers)
        expect(second.statusCode, second.body).toBe(200)
        expect(await stateOf(ctx)).toMatchObject({ state: 'deleted' })
        expect(await eventTypes(ctx, 'project.deleted')).toHaveLength(1)
        await expect(
          source.headCommit(source.repositoryFor(deployed.slug)),
        ).rejects.toMatchObject({ code: 'SOURCE_GIT_FAILED' })
      } finally {
        source.destroyRepository = destroy
      }
    })
  }, 30_000)

  /**
   * THE WHOLE-BRANCH REVIEW'S I1: a production LAUNCH in flight when a delete begins. The launch's
   * deploy holds production's environment lock (the test holds it here, as that deploy does) and
   * records `launched_at` inside it (`recordLaunch`), AFTER the delete read `launched_at` as null. The
   * delete's teardown waits for that lock — and must read `launched_at` AGAIN once it has it, before
   * anything is destroyed: a launched app is never deleted by its owner (Decision 31).
   */
  it('a launch recorded while the delete waits for its lock stops the delete before anything is destroyed', async () => {
    await withLifecycleServer(async (ctx) => {
      const deployed = await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      let deleting: ReturnType<typeof remove> | undefined
      await withEnvironmentLock(ctx.productionEnvironmentId, async () => {
        deleting = remove(ctx, ctx.ownerSteppedUp)
        for (let i = 0; i < 400 && (await stateOf(ctx)).state !== 'archived'; i++)
          await new Promise((resolve) => setTimeout(resolve, 5))
        expect((await stateOf(ctx)).state).toBe('archived')
        // What `recordLaunch` does, inside the launch's lock — the delete is waiting for it now.
        await ctx.db
          .update(projects)
          .set({ launchedAt: new Date() })
          .where(eq(projects.id, ctx.projectId))
      })
      expect(refusal(await deleting!)).toEqual({
        status: 409,
        code: 'PROJECT_LAUNCHED_NOT_DELETABLE',
      })
      // Switched off — an archive — and NOTHING destroyed: every stop kept its data.
      expect(await stateOf(ctx)).toEqual({ state: 'archived', deletedAt: null })
      expect(driver.destroyedEnvironments().every((e) => !e.deleteData)).toBe(true)
      expect(driver.destroyedEnvironments()).toHaveLength(3)
      expect(await secretCount(ctx)).toBeGreaterThan(0)
      expect(
        await ctx.deps.source.headCommit(ctx.deps.source.repositoryFor(deployed.slug)),
      ).toMatch(/^[0-9a-f]{40}$/)
      expect(await eventTypes(ctx, 'project.deleted')).toEqual([])
    })
  }, 30_000)

  /**
   * THE WHOLE-BRANCH REVIEW'S I2: a delete interrupted INSIDE its archive — a step after the services
   * stopped — is finished by the next boot as an archive, which publishes `project.archived` saying
   * *"its code, data and secrets are kept"*. That record is append-only, so it must be TRUE: nothing
   * a delete destroys may go before its archive has finished.
   */
  it('a delete interrupted inside its archive keeps the data, so the boot’s record of it is true', async () => {
    await withLifecycleServer(async (ctx, _lite, sso) => {
      await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      const deregister = sso.deregisterServiceProvider
      let failures = 1
      sso.deregisterServiceProvider = (db, input) => {
        if (failures > 0) {
          failures -= 1
          return Promise.reject(new Error('the IdP did not answer'))
        }
        return deregister(db, input)
      }
      expect(refusal(await remove(ctx, ctx.ownerSteppedUp))).toEqual({
        status: 500,
        code: 'PROJECT_TEARDOWN_INCOMPLETE',
      })
      const report = await recoverAtBoot({
        db: ctx.db,
        driver: ctx.deps.driver,
        bus: ctx.deps.bus,
        retirer: { schedule: () => undefined },
        finishTeardowns: () => finishTeardowns(lifecycleDeps(ctx.deps)),
        takeDownLeftRehearsals: () => Promise.resolve({ takenDown: [], failed: [] }),
      })
      expect(report.teardowns.finished).toHaveLength(1)
      const archived = await eventTypes(ctx, 'project.archived')
      expect(archived).toHaveLength(1)
      expect(archived[0]!.humanMessage).toContain('kept')
      // …and it is: no stop destroyed anything, and the secrets are all there.
      expect(driver.destroyedEnvironments().every((e) => !e.deleteData)).toBe(true)
      expect(await secretCount(ctx)).toBeGreaterThan(0)
    })
  }, 30_000)

  it('refuses a project whose repository another source driver made, before it takes anything down', async () => {
    await withLifecycleServer(async (ctx) => {
      await ctx.db
        .update(sourceRepositories)
        .set({ provider: 'github' })
        .where(eq(sourceRepositories.projectId, ctx.projectId))
      expect(refusal(await remove(ctx, ctx.ownerSteppedUp))).toEqual({
        status: 409,
        code: 'SOURCE_PROVIDER_MISMATCH',
      })
      expect(await stateOf(ctx)).toEqual({ state: 'active', deletedAt: null })
      expect(await eventTypes(ctx, 'project.archived')).toEqual([])
    })
  })

  it('a token of a deleted project authenticates nothing, and the boot leaves a tombstone alone', async () => {
    await withLifecycleServer(async (ctx) => {
      const deployed = await deployWithDatabase(ctx)
      const driver = ctx.deps.driver as FakeDriver
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      expect((await remove(ctx, ctx.ownerSteppedUp)).statusCode).toBe(200)
      const asToken = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(refusal(asToken)).toEqual({ status: 401, code: 'UNAUTHENTICATED' })
      // A boot finishes ARCHIVED projects' teardowns; a deleted one is none of them, so its names
      // are never switched off again — they belong to whoever takes the slug next.
      const report = await recoverAtBoot({
        db: ctx.db,
        driver: ctx.deps.driver,
        bus: ctx.deps.bus,
        retirer: { schedule: () => undefined },
        finishTeardowns: () => finishTeardowns(lifecycleDeps(ctx.deps)),
        takeDownLeftRehearsals: () => Promise.resolve({ takenDown: [], failed: [] }),
      })
      expect(report.teardowns).toEqual({ finished: [], failed: [] })
      expect(driver.isSwitchedOff(deployed.hostname)).toBe(false)
    })
  }, 30_000)
})
