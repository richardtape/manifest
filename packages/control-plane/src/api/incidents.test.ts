import { desc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { BuilderModels } from '../ai/index.js'
import { appSpecs, builds, incidents, instances, releases } from '../db/index.js'
import { mintTestToken } from '../tokens/testing.js'
import { refusal, testDeps, withProjectServer, type TestProject } from './testing.js'

/**
 * THE SAFEGUARD (§7 as Spec action 10 amended it; the front-end enablement plan's Task 14a): while a
 * `confidential` project's BUILDING agent may call the capable model — `MANIFEST_AGENT_BUILDER_MODELS`
 * `capable`, the default — a delegated token is refused that project's staging and production Incident
 * log tails, which can carry the input of the people the classification protects. A person's session
 * still reads them; the sandbox's are test users'. Every refusal asserts its CODE, and every one has
 * its positive control in the same test.
 */

const LOG_TAIL =
  'Error: cannot read "Ada Lovelace, 12345678" — the student who submitted it'

/**
 * A failed instance's Incident in `environmentId`, written directly — what `listIncidents` reads — of
 * a release whose frozen config says `classification` for every environment (none by default).
 */
async function incidentIn(
  ctx: TestProject,
  environmentId: string,
  classification?: 'internal' | 'confidential',
): Promise<void> {
  const [spec] = await ctx.db
    .select({ id: appSpecs.id })
    .from(appSpecs)
    .where(eq(appSpecs.projectId, ctx.projectId))
    .orderBy(desc(appSpecs.createdAt))
    .limit(1)
  const [build] = await ctx.db
    .insert(builds)
    .values({
      projectId: ctx.projectId,
      commitSha: ctx.commitSha,
      appSpecId: spec!.id,
      status: 'succeeded',
    })
    .returning()
  const [release] = await ctx.db
    .insert(releases)
    .values({
      projectId: ctx.projectId,
      buildId: build!.id,
      appSpecId: spec!.id,
      resolvedConfig:
        classification === undefined
          ? {}
          : Object.fromEntries(
              ['sandbox', 'staging', 'production'].map((kind) => [
                kind,
                { classification },
              ]),
            ),
      createdBy: ctx.userId,
    })
    .returning()
  const [instance] = await ctx.db
    .insert(instances)
    .values({ environmentId, releaseId: release!.id, driver: 'fake', state: 'failed' })
    .returning()
  await ctx.db.insert(incidents).values({
    instanceId: instance!.id,
    exitReason: 'the platform reports the instance as failed',
    logTail: LOG_TAIL,
    failedCheck: 'health: GET /healthz on port 3000',
    diffSinceHealthy: 'This app has never been healthy here.',
  })
}

/** A newer VALID manifest saying `classification` — what `classificationFloor` reads. */
const declared = (
  ctx: TestProject,
  classification: 'internal' | 'confidential',
  inMs = 1000,
) =>
  ctx.db.insert(appSpecs).values({
    projectId: ctx.projectId,
    commitSha: ctx.commitSha,
    parsed: { data: { classification } },
    schemaVersion: 1,
    valid: true,
    createdAt: new Date(Date.now() + inMs),
  })
const confidential = (ctx: TestProject) => declared(ctx, 'confidential')

async function withSetting(
  builderModels: BuilderModels,
  fn: (ctx: TestProject) => Promise<void>,
): Promise<void> {
  const base = await testDeps()
  await withProjectServer(fn, {
    ...base,
    config: { ...base.config, agent: { ...base.config.agent, builderModels } },
  })
}

const read = (ctx: TestProject, environmentId: string, auth: { bearer?: string }) =>
  ctx.app.inject({
    method: 'GET',
    url: `/v1/environments/${environmentId}/incidents`,
    ...(auth.bearer === undefined
      ? { cookies: ctx.ownerCookies }
      : { headers: { authorization: `Bearer ${auth.bearer}` } }),
  })

const tailOf = (res: { json: () => unknown }) =>
  (res.json() as { incidents: { logTail: string }[] }).incidents.map((i) => i.logTail)

const reader = async (ctx: TestProject) =>
  (
    await mintTestToken(ctx.db, {
      userId: ctx.userId,
      projectId: ctx.projectId,
      capabilities: ['project:read'],
    })
  ).plaintext

describe('listIncidents — a confidential project’s staging and production log tails (Spec action 10; Task 14a)', () => {
  it('refuses a token staging’s and production’s Incidents by its own code, while the builder may use the capable model — and answers the person, and the sandbox’s', async () => {
    await withSetting('capable', async (ctx) => {
      for (const env of [
        ctx.sandboxEnvironmentId,
        ctx.stagingEnvironmentId,
        ctx.productionEnvironmentId,
      ]) {
        await incidentIn(ctx, env)
      }
      await confidential(ctx)
      const token = await reader(ctx)
      for (const env of [ctx.stagingEnvironmentId, ctx.productionEnvironmentId]) {
        expect(refusal(await read(ctx, env, { bearer: token })), env).toEqual({
          status: 403,
          code: 'INCIDENT_LOG_CONFIDENTIAL',
        })
        // The person, in their own session, still reads it.
        expect(tailOf(await read(ctx, env, {})), env).toEqual([LOG_TAIL])
      }
      // The sandbox serves test users only: the token reads it.
      expect(
        tailOf(await read(ctx, ctx.sandboxEnvironmentId, { bearer: token })),
      ).toEqual([LOG_TAIL])
    })
  })

  it('answers the token when the builder is kept on-premise', async () => {
    await withSetting('on-premise', async (ctx) => {
      await incidentIn(ctx, ctx.stagingEnvironmentId)
      await confidential(ctx)
      const res = await read(ctx, ctx.stagingEnvironmentId, { bearer: await reader(ctx) })
      expect(res.statusCode, res.body).toBe(200)
      expect(tailOf(res)).toEqual([LOG_TAIL])
    })
  })

  it('answers the token on a project that is not confidential — until it is', async () => {
    await withSetting('capable', async (ctx) => {
      await incidentIn(ctx, ctx.stagingEnvironmentId)
      const token = await reader(ctx)
      const res = await read(ctx, ctx.stagingEnvironmentId, { bearer: token })
      expect(res.statusCode, res.body).toBe(200)
      expect(tailOf(res)).toEqual([LOG_TAIL])
      await confidential(ctx)
      expect(
        refusal(await read(ctx, ctx.stagingEnvironmentId, { bearer: token })),
      ).toEqual({
        status: 403,
        code: 'INCIDENT_LOG_CONFIDENTIAL',
      })
    })
  })

  it('refuses a token staging’s Incidents of a confidential release after a commit LOWERS the manifest (the review’s I1)', async () => {
    await withSetting('capable', async (ctx) => {
      // The release that failed in staging was built confidential; then a commit — one a building
      // agent's own token may make, since D9 binds only at a production deploy — says `internal`.
      await incidentIn(ctx, ctx.stagingEnvironmentId, 'confidential')
      await declared(ctx, 'confidential', 1000)
      await declared(ctx, 'internal', 2000)
      const token = await reader(ctx)
      expect(
        refusal(await read(ctx, ctx.stagingEnvironmentId, { bearer: token })),
      ).toEqual({
        status: 403,
        code: 'INCIDENT_LOG_CONFIDENTIAL',
      })
      // The positive controls: the person reads it; and an environment whose releases were all
      // internal is answered to the same token.
      expect(tailOf(await read(ctx, ctx.stagingEnvironmentId, {}))).toEqual([LOG_TAIL])
      await incidentIn(ctx, ctx.productionEnvironmentId, 'internal')
      expect(
        tailOf(await read(ctx, ctx.productionEnvironmentId, { bearer: token })),
      ).toEqual([LOG_TAIL])
    })
  })
})
