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
import { CAPABLE_MODEL_NAME } from './capable.js'
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
    expect(agentModelsFor(catalogue, 'confidential', 'on-premise')).toEqual([
      'default-chat-onprem',
      'default-chat-onprem-reasoning',
    ])
    expect(agentModelsFor(catalogue, 'internal', 'on-premise')).toEqual(
      expect.arrayContaining(['default-chat', 'default-chat-onprem', 'default-embed']),
    )
    expect(agentModelsFor(catalogue, 'public', 'on-premise')).toHaveLength(
      catalogue.models.length,
    )
  })

  it('never answers an unclassified entry, and answers nothing when nothing is approved', () => {
    const catalogue: CatalogueSnapshot = {
      models: [{ name: 'default-chat', maxClassification: 'internal', kind: 'chat' }],
      unclassified: ['rogue-chat'],
    }
    expect(agentModelsFor(catalogue, 'public', 'capable')).toEqual(['default-chat'])
    expect(agentModelsFor(catalogue, 'confidential', 'capable')).toEqual([])
  })
})

/** The declared catalogue with the capable model registered, as the boot registers it (Task 12a). */
async function withCapable(): Promise<CatalogueSnapshot> {
  const declared = await declaredCatalogue().get()
  return {
    ...declared,
    models: [
      ...declared.models,
      { name: CAPABLE_MODEL_NAME, maxClassification: 'internal', kind: 'chat' },
    ],
  }
}

describe('agentModelsFor — the building agent’s setting (Spec action 10; the front-end enablement plan’s Task 14a)', () => {
  it('lets a confidential project’s agent call the capable model while the setting is capable', async () => {
    // The capable model's NAME and nothing else the classification refuses: default-chat,
    // default-chat-reasoning and default-embed stay out (§7: the setting is about the BUILDER's model).
    expect(agentModelsFor(await withCapable(), 'confidential', 'capable')).toEqual([
      'default-chat-onprem',
      'default-chat-onprem-reasoning',
      CAPABLE_MODEL_NAME,
    ])
  })

  it('gives a confidential project’s agent the on-premise models alone when the setting is on-premise', async () => {
    expect(agentModelsFor(await withCapable(), 'confidential', 'on-premise')).toEqual([
      'default-chat-onprem',
      'default-chat-onprem-reasoning',
    ])
  })

  it('adds nothing when the capable model is not registered, whatever the setting', async () => {
    const declared = await declaredCatalogue().get()
    expect(agentModelsFor(declared, 'confidential', 'capable')).toEqual([
      'default-chat-onprem',
      'default-chat-onprem-reasoning',
    ])
  })

  it('changes nothing below confidential — the setting is the confidential floor’s alone', async () => {
    const catalogue = await withCapable()
    for (const floor of ['public', 'internal'] as const) {
      expect(agentModelsFor(catalogue, floor, 'on-premise'), floor).toEqual(
        agentModelsFor(catalogue, floor, 'capable'),
      )
      expect(agentModelsFor(catalogue, floor, 'on-premise'), floor).toContain(
        CAPABLE_MODEL_NAME,
      )
    }
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
