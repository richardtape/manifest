import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import {
  appSpecs,
  builds,
  environments,
  events,
  instances,
  releases,
  secrets,
  type Db,
} from '../db/index.js'
import { withProject } from '../db/testing.js'
import { createEventBus } from '../observability/index.js'
import { generateMasterKeypair, putSecret } from '../secrets/index.js'
import { appKeysAtBoot, withdrawLoweredAppModels } from './app-key-sweep.js'
import { instanceKeySecretName, LLM_API_KEY_SECRET } from './keys.js'
import { fakeLiteLlm, type FakeLiteLlm } from './testing.js'

/**
 * An instance in `kind` whose release is frozen at `level` with `models`, holding a REAL fake key minted with them, recorded as
 * its secret — what `deployRelease` leaves behind. One per kind per project (an environment is unique by both). The fake's
 * catalogue is seeded by the caller.
 */
async function running(
  tx: Db,
  ctx: { projectId: string; ownerId: string },
  lite: FakeLiteLlm,
  keys: Awaited<ReturnType<typeof generateMasterKeypair>>,
  frozen: { level: string; models: string[] },
  kind: 'staging' | 'production' = 'staging',
): Promise<{ instanceId: string; key: string }> {
  const [spec] = await tx
    .insert(appSpecs)
    .values({
      projectId: ctx.projectId,
      commitSha: 'a'.repeat(40),
      parsed: {},
      schemaVersion: 1,
      valid: true,
    })
    .returning()
  const [build] = await tx
    .insert(builds)
    .values({
      projectId: ctx.projectId,
      commitSha: 'a'.repeat(40),
      appSpecId: spec!.id,
      status: 'succeeded',
    })
    .returning()
  const [release] = await tx
    .insert(releases)
    .values({
      projectId: ctx.projectId,
      buildId: build!.id,
      appSpecId: spec!.id,
      resolvedConfig: {
        [kind]: { classification: frozen.level, ai: { models: frozen.models } },
      },
      createdBy: ctx.ownerId,
    })
    .returning()
  const [env] = await tx
    .insert(environments)
    .values({
      projectId: ctx.projectId,
      kind,
      hostname: `${ctx.projectId.slice(0, 8)}.${kind}.example`,
    })
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
  const userId = `app-${ctx.projectId}`
  if (!lite.users.has(userId)) await lite.post('/user/new', { user_id: userId })
  const { key } = await lite.post<{ key: string }>('/key/generate', {
    user_id: userId,
    key_alias: `app-${instance!.id}`,
    models: frozen.models,
    duration: '86400s', // the fake requires one; an app key's real expiry plays no part here
  })
  await putSecret(
    tx,
    {
      projectId: ctx.projectId,
      environmentKind: kind,
      name: instanceKeySecretName(instance!.id),
      value: key,
    },
    keys,
  )
  return { instanceId: instance!.id, key }
}

/**
 * The catalogue the sweep reads FRESH (M8): `name → level`. A name `infra/litellm/config.yaml` already gives the fake is left
 * as it is (each test names those at their config level); any other is added through `/model/new`, as an operator's would be.
 */
async function catalogue(
  lite: FakeLiteLlm,
  levels: Record<string, string>,
): Promise<void> {
  const listed = new Set([...lite.deployments.values()].map((d) => d.modelName))
  for (const [name, level] of Object.entries(levels)) {
    if (listed.has(name)) continue
    await lite.post('/model/new', {
      model_name: name,
      litellm_params: { model: 'ollama_chat/qwen3.5:4b' },
      model_info: { id: `probe-${name}`, max_classification: level },
    })
  }
}
const heldBy = (lite: FakeLiteLlm, key: string) => lite.keys.get(key)?.models
const sweptEvents = (tx: Db) =>
  tx.select().from(events).where(eq(events.type, 'ai.models_withdrawn'))

describe('withdrawLoweredAppModels — a lowered level takes effect on running apps (S11; U1 plan Task 6)', () => {
  it('narrows a key holding a model now ranked below its release’s level, by value, and records why', async () => {
    await withProject(async (tx, ctx) => {
      const lite = fakeLiteLlm()
      const keys = await generateMasterKeypair()
      await catalogue(lite, { 'gw-zdr': 'medium', 'default-chat-onprem': 'confidential' }) // gw-zdr lowered from high
      const { instanceId, key } = await running(tx, ctx, lite, keys, {
        level: 'high',
        models: ['gw-zdr', 'default-chat-onprem'],
      })
      const r = await withdrawLoweredAppModels({
        db: tx,
        bus: createEventBus(),
        llm: lite,
        keys,
      })
      expect(r).toEqual({ narrowed: [instanceId], revoked: [], failed: [], legacy: 0 })
      expect(heldBy(lite, key)).toEqual(['default-chat-onprem'])
      // By the key's VALUE: an app key has no alias the platform knows.
      expect(
        lite.calls.filter((c) => c.path === '/key/update').map((c) => c.body),
      ).toEqual([{ key, models: ['default-chat-onprem'] }])
      const [event] = await sweptEvents(tx)
      expect(event?.machineDetail).toEqual({
        instanceId,
        environment: 'staging',
        withdrawn: ['gw-zdr'],
        models: ['default-chat-onprem'],
        revoked: false,
      })
      expect(event?.humanMessage).toContain('gw-zdr')
      expect(JSON.stringify(event)).not.toContain(key)
    })
  })

  it('a SECOND sweep changes nothing and records nothing — idempotent by what the key holds now (I2)', async () => {
    await withProject(async (tx, ctx) => {
      const lite = fakeLiteLlm()
      const keys = await generateMasterKeypair()
      await catalogue(lite, { 'gw-zdr': 'medium', 'default-chat-onprem': 'confidential' })
      await running(tx, ctx, lite, keys, {
        level: 'high',
        models: ['gw-zdr', 'default-chat-onprem'],
      })
      const deps = { db: tx, bus: createEventBus(), llm: lite, keys }
      await withdrawLoweredAppModels(deps)
      const updates = () => lite.calls.filter((c) => c.path === '/key/update').length
      const before = updates()
      expect(await withdrawLoweredAppModels(deps)).toEqual({
        narrowed: [],
        revoked: [],
        failed: [],
        legacy: 0,
      })
      expect(updates()).toBe(before)
      expect(await sweptEvents(tx)).toHaveLength(1)
    })
  })

  it('REVOKES a key left with nothing it may use — never models: [] (Review Focus 5)', async () => {
    await withProject(async (tx, ctx) => {
      const lite = fakeLiteLlm()
      const keys = await generateMasterKeypair()
      await catalogue(lite, { 'gw-zdr': 'medium' })
      const { instanceId, key } = await running(tx, ctx, lite, keys, {
        level: 'high',
        models: ['gw-zdr'],
      })
      const r = await withdrawLoweredAppModels({
        db: tx,
        bus: createEventBus(),
        llm: lite,
        keys,
      })
      expect(r.revoked).toEqual([instanceId])
      expect(lite.keys.has(key)).toBe(false)
      expect(
        await tx
          .select()
          .from(secrets)
          .where(eq(secrets.name, instanceKeySecretName(instanceId))),
      ).toEqual([])
      expect(
        lite.calls.some(
          (c) =>
            c.path === '/key/update' && JSON.stringify(c.body).includes('"models":[]'),
        ),
      ).toBe(false)
      expect((await sweptEvents(tx))[0]?.machineDetail).toMatchObject({
        revoked: true,
        models: [],
      })
    })
  })

  it('reads a frozen alias as its level: confidential keeps an on-premise model and loses a high one', async () => {
    await withProject(async (tx, ctx) => {
      const lite = fakeLiteLlm()
      const keys = await generateMasterKeypair()
      await catalogue(lite, { 'gw-high': 'high', 'default-chat-onprem': 'confidential' })
      const { key } = await running(tx, ctx, lite, keys, {
        level: 'confidential',
        models: ['gw-high', 'default-chat-onprem'],
      })
      await withdrawLoweredAppModels({ db: tx, bus: createEventBus(), llm: lite, keys })
      expect(heldBy(lite, key)).toEqual(['default-chat-onprem'])
    })
  })

  it('changes nothing when every model is still allowed — and a model the catalogue no longer serves stays on the key', async () => {
    await withProject(async (tx, ctx) => {
      const lite = fakeLiteLlm()
      const keys = await generateMasterKeypair()
      await catalogue(lite, { 'default-chat': 'internal' })
      const { key } = await running(tx, ctx, lite, keys, {
        level: 'medium',
        models: ['default-chat', 'gone-model'],
      })
      expect(
        await withdrawLoweredAppModels({
          db: tx,
          bus: createEventBus(),
          llm: lite,
          keys,
        }),
      ).toEqual({ narrowed: [], revoked: [], failed: [], legacy: 0 })
      expect(heldBy(lite, key)).toEqual(['default-chat', 'gone-model'])
      expect(await sweptEvents(tx)).toEqual([])
    })
  })

  it('names and skips an instance whose release has no readable level — never assumed', async () => {
    await withProject(async (tx, ctx) => {
      const lite = fakeLiteLlm()
      const keys = await generateMasterKeypair()
      await catalogue(lite, { 'default-chat': 'internal' })
      const line = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { instanceId, key } = await running(tx, ctx, lite, keys, {
        level: 'secret',
        models: ['default-chat'],
      })
      const r = await withdrawLoweredAppModels({
        db: tx,
        bus: createEventBus(),
        llm: lite,
        keys,
      })
      expect(r.failed).toEqual([instanceId])
      expect(heldBy(lite, key)).toEqual(['default-chat'])
      expect(line.mock.calls.flat().join('\n')).toContain(instanceId)
      line.mockRestore()
    })
  })

  it('counts P4b’s environment-level keys, names them in one line, and checks none', async () => {
    await withProject(async (tx, ctx) => {
      const lite = fakeLiteLlm()
      const keys = await generateMasterKeypair()
      await putSecret(
        tx,
        {
          projectId: ctx.projectId,
          environmentKind: 'staging',
          name: LLM_API_KEY_SECRET,
          value: 'sk-legacy',
        },
        keys,
      )
      const line = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      expect(
        (
          await withdrawLoweredAppModels({
            db: tx,
            bus: createEventBus(),
            llm: lite,
            keys,
          })
        ).legacy,
      ).toBe(1)
      expect(line).toHaveBeenCalledTimes(1)
      expect(String(line.mock.calls[0]?.[0])).not.toContain('sk-legacy')
      line.mockRestore()
    })
  })

  it('a gateway that refuses one key is that key’s line, and the sweep goes on to the next', async () => {
    await withProject(async (tx, ctx) => {
      const lite = fakeLiteLlm()
      const keys = await generateMasterKeypair()
      await catalogue(lite, { 'gw-zdr': 'medium', 'default-chat-onprem': 'confidential' })
      const first = await running(tx, ctx, lite, keys, {
        level: 'high',
        models: ['gw-zdr', 'default-chat-onprem'],
      })
      const second = await running(
        tx,
        ctx,
        lite,
        keys,
        { level: 'high', models: ['gw-zdr', 'default-chat-onprem'] },
        'production',
      )
      lite.fail('/key/update', 500)
      const line = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const r = await withdrawLoweredAppModels({
        db: tx,
        bus: createEventBus(),
        llm: lite,
        keys,
      })
      expect(new Set([...r.failed, ...r.narrowed])).toEqual(
        new Set([first.instanceId, second.instanceId]),
      )
      expect(r.failed).toHaveLength(1)
      // ONE line names the failure (the other key's narrowing has its own line, Decision 8), and none carries a key.
      const said = line.mock.calls.map((c) => String(c[0]))
      expect(said.filter((l) => l.includes('could not be narrowed'))).toHaveLength(1)
      expect(said.find((l) => l.includes('could not be narrowed'))).toContain(r.failed[0])
      for (const k of [first.key, second.key]) {
        expect(line.mock.calls.flat().join('\n')).not.toContain(k)
      }
      line.mockRestore()
    })
  })
})

it('appKeysAtBoot is never fatal: a gateway that does not answer is one line and "failed"', async () => {
  const lite = fakeLiteLlm()
  lite.fail('/model/info', 0)
  const line = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  expect(
    await appKeysAtBoot({
      db: {} as Db,
      bus: createEventBus(),
      llm: lite,
      keys: await generateMasterKeypair(),
    }),
  ).toBe('failed')
  expect(line).toHaveBeenCalledTimes(1)
  line.mockRestore()
})
