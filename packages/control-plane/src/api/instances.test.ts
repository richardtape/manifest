import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { instances } from '../db/index.js'
import type { FakeDriver } from '../runtime/index.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  mutationHeaders,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

/**
 * A RUNNING APP'S RECENT OUTPUT OVER THE API (the front-end enablement plan's Task 3; §14,
 * applied 2026-09-26). `listInstances` names an environment's instances; `getInstanceOutput`
 * reads one's last lines through THE reader (`observability/output.ts`), redacted with the
 * platform's own secret set, under `output:read` — and never in production.
 */

/** Build the seeded commit, release it, and deploy it to staging — through the routes. */
const deployToStaging = (ctx: TestProject) => deployTo(ctx, ctx.stagingEnvironmentId)

/**
 * …and to the SANDBOX, the one environment whose output is readable (§14 as Spec action 6 left it;
 * FE-24's code, sitting 10) — every read below is of a sandbox instance.
 */
const deployToSandbox = (ctx: TestProject) => deployTo(ctx, ctx.sandboxEnvironmentId)

async function deployTo(ctx: TestProject, environmentId: string) {
  const mutate = (url: string, payload: Record<string, unknown>) =>
    ctx.app.inject({
      method: 'POST',
      url,
      cookies: ctx.ownerCookies,
      headers: mutationHeaders(ctx.deps),
      payload,
    })
  const build = await mutate(`/v1/projects/${ctx.projectId}/builds`, {
    commitSha: ctx.commitSha,
  })
  expect(build.statusCode, build.body).toBe(202)
  await ctx.deps.builds.idle()
  const release = await mutate(`/v1/projects/${ctx.projectId}/releases`, {
    buildId: (build.json() as { id: string }).id,
  })
  expect(release.statusCode, release.body).toBe(201)
  const releaseId = (release.json() as { id: string }).id
  const deployed = await mutate(`/v1/environments/${environmentId}/deploy`, {
    releaseId,
  })
  expect(deployed.statusCode, deployed.body).toBe(200)
  const { id, state } = deployed.json() as { id: string; state: string }
  const [row] = await ctx.db.select().from(instances).where(eq(instances.id, id))
  return { id, state, handle: row!.handle!, releaseId }
}

/** An instance row written directly — for the states a deploy is not this test's subject. */
async function instanceRow(
  ctx: TestProject,
  values: {
    environmentId: string
    releaseId: string
    state: (typeof instances.$inferInsert)['state']
    handle: string | null
    lastSeenAt?: Date
  },
) {
  const [row] = await ctx.db
    .insert(instances)
    .values({ driver: 'fake', kind: 'web', ...values })
    .returning()
  return row!
}

const fake = (ctx: TestProject) => ctx.deps.driver as FakeDriver
const outputOf = (ctx: TestProject, instanceId: string, cookies = ctx.ownerCookies) =>
  ctx.app.inject({ method: 'GET', url: `/v1/instances/${instanceId}/output`, cookies })

describe('listInstances — an environment’s instances (Task 3)', () => {
  it('lists an environment’s instances, the serving one marked, a failed one still listed', async () => {
    await withProjectServer(async (ctx) => {
      const healthy = await deployToStaging(ctx)
      expect(healthy.state).toBe('healthy')
      // The second deploy fails: its instance never becomes healthy.
      vi.spyOn(ctx.deps.driver, 'status').mockResolvedValue({
        id: 'unused',
        state: 'failed',
        healthy: false,
      })
      const failed = await deployToStaging(ctx)
      expect(failed.state).toBe('failed')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/environments/${ctx.stagingEnvironmentId}/instances`,
        cookies: ctx.ownerCookies,
      })
      expect(res.statusCode, res.body).toBe(200)
      const body = res.json() as {
        environmentId: string
        instances: { id: string; state: string; serving: boolean }[]
        truncated: boolean
      }
      expect(body.environmentId).toBe(ctx.stagingEnvironmentId)
      expect(body.truncated).toBe(false)
      expect(
        Object.fromEntries(body.instances.map((i) => [i.id, [i.state, i.serving]])),
      ).toEqual({
        [healthy.id]: ['healthy', true],
        [failed.id]: ['failed', false],
      })
      // Never the platform's own fields (Decision 23).
      expect(res.body).not.toContain(healthy.handle)
      expect(res.body).not.toContain('"driver"')
    })
  })

  // `servingInstanceOf` falls back to the newest instance of ANY state when no Route record
  // exists — so an environment whose only deploy failed would name the failed one (P6b Task 6).
  it('marks no instance serving when the only deploy failed', async () => {
    await withProjectServer(async (ctx) => {
      vi.spyOn(ctx.deps.driver, 'status').mockResolvedValue({
        id: 'unused',
        state: 'failed',
        healthy: false,
      })
      const failed = await deployToStaging(ctx)
      expect(failed.state).toBe('failed')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/environments/${ctx.stagingEnvironmentId}/instances`,
        cookies: ctx.ownerCookies,
      })
      const body = res.json() as { instances: { id: string; serving: boolean }[] }
      expect(body.instances).toEqual([
        expect.objectContaining({ id: failed.id, serving: false }),
      ])
    })
  })

  it('lists at most 50, the one seen most recently first, and says when there were more', async () => {
    await withProjectServer(async (ctx) => {
      const { releaseId } = await deployToStaging(ctx)
      const base = Date.now() - 3_600_000
      for (let i = 0; i < 51; i += 1)
        await instanceRow(ctx, {
          environmentId: ctx.stagingEnvironmentId,
          releaseId,
          state: 'gone',
          handle: null,
          lastSeenAt: new Date(base + i * 1000),
        })
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/environments/${ctx.stagingEnvironmentId}/instances`,
        cookies: ctx.ownerCookies,
      })
      const body = res.json() as {
        instances: { state: string; lastSeenAt: string | null }[]
        truncated: boolean
      }
      expect(body.instances).toHaveLength(50)
      expect(body.truncated).toBe(true)
      const seen = body.instances.map((i) => Date.parse(i.lastSeenAt!))
      expect(seen).toEqual([...seen].sort((a, b) => b - a))
    })
  })

  it('hides an environment from a stranger with the stranger’s 404', async () => {
    await withProjectServer(async (ctx) => {
      const stranger = await sessionFor(ctx, 'unrelated_user')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/environments/${ctx.stagingEnvironmentId}/instances`,
        cookies: stranger,
      })
      expect(refusal(res)).toEqual({ status: 404, code: 'NOT_FOUND' })
    })
  })
})

describe('getInstanceOutput — a running app’s last lines (Task 3, §14)', () => {
  it('reads the last lines of a sandbox instance, redacted', async () => {
    await withProjectServer(async (ctx) => {
      const instance = await deployToSandbox(ctx)
      // The platform's OWN set for the scope — the app's session secret is in it (§8).
      const [secret] = await ctx.deps.appSecrets.secretValues(ctx.db, {
        projectId: ctx.projectId,
        environmentKind: 'sandbox',
      })
      expect(secret!.length).toBeGreaterThanOrEqual(6)
      fake(ctx).seedLogs(instance.handle, [
        `connecting with ${secret}`,
        'listening on 3000',
      ])

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/instances/${instance.id}/output?lines=10`,
        cookies: ctx.ownerCookies,
      })
      expect(res.statusCode, res.body).toBe(200)
      const body = res.json() as {
        instanceId: string
        environmentId: string
        environmentKind: string
        lines: { text: string; stamped: boolean; stream: string }[]
        truncated: { lines: boolean; bytes: boolean }
        failure: string | null
        readAt: string
      }
      expect(body).toMatchObject({
        instanceId: instance.id,
        environmentId: ctx.sandboxEnvironmentId,
        environmentKind: 'sandbox',
        truncated: { lines: false, bytes: false },
        failure: null,
      })
      expect(body.lines.map((l) => l.text).slice(-2)).toEqual([
        'connecting with [REDACTED]',
        'listening on 3000',
      ])
      expect(body.lines.every((l) => l.stamped && l.stream === 'stdout')).toBe(true)
      expect(res.body).not.toContain(secret)
    })
  })

  it('refuses a production instance by its own code, and never asks the driver', async () => {
    await withProjectServer(async (ctx) => {
      const sandbox = await deployToSandbox(ctx)
      // A production instance row written directly: a launch is not this test's subject.
      const production = await instanceRow(ctx, {
        environmentId: ctx.productionEnvironmentId,
        releaseId: sandbox.releaseId,
        state: 'healthy',
        handle: sandbox.handle,
      })
      const logs = vi.spyOn(ctx.deps.driver, 'logs')

      expect(refusal(await outputOf(ctx, production.id))).toEqual({
        status: 403,
        code: 'INSTANCE_OUTPUT_PRODUCTION',
      })
      expect(logs).toHaveBeenCalledTimes(0)

      // The positive control: the same person, the same handle, in the sandbox — read.
      const read = await outputOf(ctx, sandbox.id)
      expect(read.statusCode, read.body).toBe(200)
      expect(logs).toHaveBeenCalledTimes(1)
    })
  })

  /**
   * FE-24'S CODE (sitting 10; §14 as Spec action 6 left it): staging serves real people — staging
   * CWL holders at UBC — so its output is refused like production's, by a code that names THAT
   * rule, and decided by the environment's KIND: a laptop's staging, which keeps the fake sign-in,
   * is refused all the same. A real DEPLOY to staging, so the row is the platform's own.
   */
  it('refuses a staging instance by its own code, and never asks the driver', async () => {
    await withProjectServer(async (ctx) => {
      const staging = await deployToStaging(ctx)
      expect(staging.state).toBe('healthy')
      const logs = vi.spyOn(ctx.deps.driver, 'logs')

      const res = await outputOf(ctx, staging.id)
      expect(refusal(res)).toEqual({ status: 403, code: 'INSTANCE_OUTPUT_STAGING' })
      // An OutputError carries no `hint` (Task 3's envelope); its remedy is the registry's.
      expect((res.json() as { error: { message: string } }).error.message).toContain(
        'Incident',
      )
      expect(logs).toHaveBeenCalledTimes(0)

      // The positive control: the same person, the same release, in the sandbox — read.
      const sandbox = await deployToSandbox(ctx)
      const read = await outputOf(ctx, sandbox.id)
      expect(read.statusCode, read.body).toBe(200)
      expect(logs).toHaveBeenCalledTimes(1)
    })
  })

  it('answers a gone instance 409 INSTANCE_OUTPUT_UNAVAILABLE, naming the Incident as the place to look', async () => {
    await withProjectServer(async (ctx) => {
      const { releaseId } = await deployToSandbox(ctx)
      const gone = await instanceRow(ctx, {
        environmentId: ctx.sandboxEnvironmentId,
        releaseId,
        state: 'gone',
        handle: 'a-container-long-gone',
      })
      const res = await outputOf(ctx, gone.id)
      expect(refusal(res)).toEqual({ status: 409, code: 'INSTANCE_OUTPUT_UNAVAILABLE' })
      expect((res.json() as { error: { message: string } }).error.message).toContain(
        'Incident',
      )
      // And one the driver never created.
      const never = await instanceRow(ctx, {
        environmentId: ctx.sandboxEnvironmentId,
        releaseId,
        state: 'pending',
        handle: null,
      })
      expect(refusal(await outputOf(ctx, never.id))).toEqual({
        status: 409,
        code: 'INSTANCE_OUTPUT_UNAVAILABLE',
      })
    })
  })

  // The review's I3: a failed deploy removes its container once its Incident is captured, but
  // the row keeps its handle and `failed` — and Docker's 404, read as frames, yields no line.
  it('answers a failed instance whose container is gone 409, never an empty 200', async () => {
    await withProjectServer(async (ctx) => {
      const status = vi.spyOn(ctx.deps.driver, 'status').mockResolvedValue({
        id: 'unused',
        state: 'failed',
        healthy: false,
      })
      const failed = await deployToSandbox(ctx)
      expect(failed.state).toBe('failed')
      status.mockRestore()
      expect(failed.handle).not.toBeNull()
      expect(refusal(await outputOf(ctx, failed.id))).toEqual({
        status: 409,
        code: 'INSTANCE_OUTPUT_UNAVAILABLE',
      })
    })
  })

  it('a token holding output:read reads it; one holding only project:read is refused', async () => {
    await withProjectServer(async (ctx) => {
      const instance = await deployToSandbox(ctx)
      const read = async (capabilities: string[]) => {
        const { plaintext } = await mintTestToken(ctx.db, {
          userId: ctx.userId,
          projectId: ctx.projectId,
          capabilities,
        })
        return ctx.app.inject({
          method: 'GET',
          url: `/v1/instances/${instance.id}/output`,
          headers: { authorization: `Bearer ${plaintext}` },
        })
      }
      const allowed = await read(['project:read', 'output:read'])
      expect(allowed.statusCode, allowed.body).toBe(200)
      expect(refusal(await read(['project:read']))).toEqual({
        status: 403,
        code: 'FORBIDDEN',
      })
    })
  })

  it('finds the project from the INSTANCE’s environment row, never the request', async () => {
    await withProjectServer(async (ctx) => {
      const instance = await deployToSandbox(ctx)
      const stranger = await sessionFor(ctx, 'unrelated_user')
      expect(refusal(await outputOf(ctx, instance.id, stranger))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
      // A project named in the request is not even accepted — the route reads none.
      const named = await ctx.app.inject({
        method: 'GET',
        url: `/v1/instances/${instance.id}/output?projectId=${ctx.otherProjectId}`,
        cookies: stranger,
      })
      expect(refusal(named)).toEqual({ status: 400, code: 'REQUEST_INVALID' })
    })
  })

  it('refuses lines past 1000 as a malformed request', async () => {
    await withProjectServer(async (ctx) => {
      const instance = await deployToSandbox(ctx)
      const ask = (lines: number) =>
        ctx.app.inject({
          method: 'GET',
          url: `/v1/instances/${instance.id}/output?lines=${lines}`,
          cookies: ctx.ownerCookies,
        })
      expect(refusal(await ask(1001))).toEqual({ status: 400, code: 'REQUEST_INVALID' })
      expect((await ask(1000)).statusCode).toBe(200)
    })
  })

  it('answers the stranger’s 404 for an instance that does not exist', async () => {
    await withProjectServer(async (ctx) => {
      expect(
        refusal(await outputOf(ctx, '00000000-0000-4000-8000-000000000000')),
      ).toEqual({ status: 404, code: 'NOT_FOUND' })
    })
  })
})
