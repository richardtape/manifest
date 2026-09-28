import { describe, expect, it } from 'vitest'
import {
  appSpecs,
  builds,
  environments,
  instances,
  releases,
  routes,
  type Db,
} from '../db/index.js'
import { withProject } from '../db/testing.js'
import type { Classification } from '../spec/index.js'
import type { CatalogueSnapshot } from './catalogue.js'
import { agentModelsFor, classificationFloor } from './models.js'
import { declaredCatalogue } from './testing.js'

async function spec(
  tx: Db,
  projectId: string,
  input: { classification: Classification; valid: boolean; at: string },
): Promise<string> {
  const [row] = await tx
    .insert(appSpecs)
    .values({
      projectId,
      commitSha: 'a'.repeat(40),
      parsed: { data: { classification: input.classification } },
      schemaVersion: 1,
      valid: input.valid,
      createdAt: new Date(input.at),
    })
    .returning()
  return row!.id
}

/** A release frozen at `classification`, SERVING production — its instance holds the route. */
async function servingProduction(
  tx: Db,
  ctx: { projectId: string; ownerId: string },
  classification: Classification,
): Promise<void> {
  const specId = await spec(tx, ctx.projectId, {
    classification,
    valid: true,
    at: '2026-01-01T00:00:00Z',
  })
  const [build] = await tx
    .insert(builds)
    .values({
      projectId: ctx.projectId,
      commitSha: 'a'.repeat(40),
      appSpecId: specId,
      status: 'succeeded',
    })
    .returning()
  const [release] = await tx
    .insert(releases)
    .values({
      projectId: ctx.projectId,
      buildId: build!.id,
      appSpecId: specId,
      resolvedConfig: { production: { classification } },
      createdBy: ctx.ownerId,
    })
    .returning()
  const hostname = `${ctx.projectId.slice(0, 8)}.prod.example`
  const [env] = await tx
    .insert(environments)
    .values({ projectId: ctx.projectId, kind: 'production', hostname })
    .returning()
  const [instance] = await tx
    .insert(instances)
    .values({
      environmentId: env!.id,
      releaseId: release!.id,
      driver: 'fake',
      state: 'healthy',
    })
    .returning()
  await tx
    .insert(routes)
    .values({ instanceId: instance!.id, hostname, listener: 'public' })
}

describe('agentModelsFor (Decision 23)', () => {
  it('answers every catalogue entry at or above the classification', async () => {
    const catalogue = await declaredCatalogue().get()
    expect(agentModelsFor(catalogue, 'confidential')).toEqual([
      'default-chat-onprem',
      'default-chat-onprem-reasoning',
    ])
    expect(agentModelsFor(catalogue, 'internal')).toEqual(
      expect.arrayContaining(['default-chat', 'default-chat-onprem', 'default-embed']),
    )
    expect(agentModelsFor(catalogue, 'public')).toHaveLength(catalogue.models.length)
  })

  it('never answers an unclassified entry, and answers nothing when nothing is approved', () => {
    const catalogue: CatalogueSnapshot = {
      models: [{ name: 'default-chat', maxClassification: 'internal', kind: 'chat' }],
      unclassified: ['rogue-chat'],
    }
    expect(agentModelsFor(catalogue, 'public')).toEqual(['default-chat'])
    expect(agentModelsFor(catalogue, 'confidential')).toEqual([])
  })
})

describe('classificationFloor (Decision 23)', () => {
  it('takes the newest VALID manifest’s classification, internal when there is none', async () => {
    await withProject(async (tx, ctx) => {
      expect(await classificationFloor(tx, ctx.projectId)).toBe('internal')
      await spec(tx, ctx.projectId, {
        classification: 'public',
        valid: true,
        at: '2026-01-01T00:00:00Z',
      })
      await spec(tx, ctx.projectId, {
        classification: 'confidential',
        valid: false,
        at: '2026-01-02T00:00:00Z',
      })
      expect(await classificationFloor(tx, ctx.projectId)).toBe('public')
      await spec(tx, ctx.projectId, {
        classification: 'confidential',
        valid: true,
        at: '2026-01-03T00:00:00Z',
      })
      expect(await classificationFloor(tx, ctx.projectId)).toBe('confidential')
    })
  })

  it('never answers below the classification of the release serving production', async () => {
    await withProject(async (tx, ctx) => {
      await servingProduction(tx, ctx, 'confidential')
      // An agent lowered it in a commit: the newest valid manifest says public.
      await spec(tx, ctx.projectId, {
        classification: 'public',
        valid: true,
        at: '2026-02-01T00:00:00Z',
      })
      expect(await classificationFloor(tx, ctx.projectId)).toBe('confidential')
    })
  })

  it('answers the manifest when it is the more restrictive of the two', async () => {
    await withProject(async (tx, ctx) => {
      await servingProduction(tx, ctx, 'public')
      await spec(tx, ctx.projectId, {
        classification: 'confidential',
        valid: true,
        at: '2026-02-01T00:00:00Z',
      })
      expect(await classificationFloor(tx, ctx.projectId)).toBe('confidential')
    })
  })
})
