import { desc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { appSpecs, builds, releases } from '../db/index.js'
import { manifestSchema, resolveConfig, type Classification } from '../spec/index.js'
import { withProjectServer, type TestProject } from './testing.js'

/**
 * S6 — THE PLATFORM ANSWERS IN U1'S NAMES, OLD ROWS TOO (§7's *Data classification: UBC's U1 levels*;
 * the U1 plan's Task 2). Nothing in the database is migrated: a row stored with an alias keeps it, and
 * the two answers that carry a stored classification — `getSpec` and a release's frozen config — say
 * the level it means.
 */

const DEFAULTS = { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' }
const minimal = {
  manifest: 1,
  name: 'levels-app',
  blueprint: 'node-ts-mongo@2',
  runtime: { port: 3000 },
}

/** A build and a release whose every environment's FULL frozen config says `classification` — `toRelease` reads every field. */
async function frozenRelease(
  ctx: TestProject,
  classification: Classification,
): Promise<string> {
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
  const parsed = manifestSchema.parse(minimal)
  const [release] = await ctx.db
    .insert(releases)
    .values({
      projectId: ctx.projectId,
      buildId: build!.id,
      appSpecId: spec!.id,
      resolvedConfig: Object.fromEntries(
        (['sandbox', 'staging', 'production'] as const).map((kind) => [
          kind,
          { ...resolveConfig(parsed, kind, DEFAULTS), classification },
        ]),
      ),
      createdBy: ctx.userId,
    })
    .returning()
  return release!.id
}

describe('the platform answers in U1’s names — old rows too (S6; U1 plan Task 2)', () => {
  it('getSpec answers an old row’s alias as its level', async () => {
    await withProjectServer(async (ctx) => {
      await ctx.db.insert(appSpecs).values({
        projectId: ctx.projectId,
        commitSha: ctx.commitSha,
        parsed: {
          manifest: 1,
          name: 'x',
          data: { classification: 'internal', retention_days: 365 },
        },
        schemaVersion: 1,
        valid: true,
        createdAt: new Date(Date.now() + 1000),
      })
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/spec`,
        cookies: ctx.ownerCookies,
      })
      expect(res.statusCode, res.body).toBe(200)
      const spec = (
        res.json() as {
          spec: { data: { classification: string; retention_days: number } }
        }
      ).spec
      expect(spec.data).toEqual({ classification: 'medium', retention_days: 365 })
    })
  })

  it('a release frozen confidential is answered very-high in every environment', async () => {
    await withProjectServer(async (ctx) => {
      const releaseId = await frozenRelease(ctx, 'confidential')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/releases/${releaseId}`,
        cookies: ctx.ownerCookies,
      })
      expect(res.statusCode, res.body).toBe(200)
      const config = (
        res.json() as { config: Record<string, { classification: string }> }
      ).config
      expect(Object.values(config).map((c) => c.classification)).toEqual([
        'very-high',
        'very-high',
        'very-high',
      ])
    })
  })
})
