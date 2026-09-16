import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { getSecret, putSecret } from '../secrets/index.js'
import { withSecretScope } from '../secrets/testing.js'
import type { LiteLlmClient } from './client.js'
import { mapLiteLlmError } from './errors.js'
import {
  AI_ALLOWED_ROUTES,
  LLM_API_KEY_SECRET,
  aiUserId,
  createAiKeyService,
  disabledAiKeyService,
  discardAppKey,
  ensureAiUser,
  instanceKeySecretName,
  mintAppKey,
} from './keys.js'

interface Call {
  path: string
  body: Record<string, unknown>
}

/**
 * LiteLLM's admin API, recording every call. `failOn` makes a route reject with the
 * error Task 5's client really throws for that status — the case the plan's fake
 * could not express, which is why sitting 3's finding 28 was invisible to it.
 */
function fakeClient(failOn: Record<string, number> = {}) {
  const calls: Call[] = []
  let minted = 0
  const post = vi.fn(async (path: string, body: unknown): Promise<unknown> => {
    calls.push({ path, body: body as Record<string, unknown> })
    const status = failOn[path]
    if (status !== undefined) {
      throw mapLiteLlmError(status, { error: { type: 'internal_server_error' } })
    }
    if (path === '/key/generate') return { key: `sk-${++minted}` }
    return {}
  })
  const client = { get: vi.fn(), post } as unknown as LiteLlmClient
  return { calls, post, client }
}

const input = (projectId: string) => ({
  projectId,
  projectSlug: 'chem-labs',
  kind: 'staging' as const,
  models: ['default-chat'],
  monthlyUsd: 25,
})

const stored = (projectId: string) => ({
  projectId,
  environmentKind: 'staging' as const,
  name: LLM_API_KEY_SECRET,
})

const bodyOf = (calls: Call[], path: string) => calls.find((c) => c.path === path)!.body
const revoked = (calls: Call[]) =>
  calls.filter((c) => c.path === '/key/delete').map((c) => c.body.keys)

describe('minting an app key (§10, S3 Evidence 11)', () => {
  it('mints every key with allowed_routes, and no caller can widen it', async () => {
    const fake = fakeClient()
    await mintAppKey(fake.client, input('p1'))
    const generate = bodyOf(fake.calls, '/key/generate')
    expect(generate.allowed_routes).toEqual(AI_ALLOWED_ROUTES)
    expect(AI_ALLOWED_ROUTES).toEqual([
      '/v1/chat/completions',
      '/v1/embeddings',
      '/v1/models',
    ])
    expect(generate.models).toEqual(['default-chat'])
    // Every field the mint sends. There is no parameter to ask for more, and a
    // field added later — `permissions`, a budget — turns this red.
    expect(Object.keys(generate).sort()).toEqual([
      'allowed_routes',
      'metadata',
      'models',
      'user_id',
    ])
    // Frozen: widening it at run time throws rather than quietly succeeding.
    expect(() => (AI_ALLOWED_ROUTES as string[]).push('/key/generate')).toThrow()
  })

  it('REFUSES an empty model list, which LiteLLM reads as EVERY model', async () => {
    // Measured 2026-09-14: `models: []` listed all three catalogue entries and
    // embedded with a model the key was never given.
    const fake = fakeClient()
    await expect(mintAppKey(fake.client, { ...input('p1'), models: [] })).rejects.toThrow(
      /every model/,
    )
    // Before anything exists — not even the user.
    expect(fake.calls).toEqual([])
  })

  it('puts the budget on the USER, gives that user no key of its own, and none on the key', async () => {
    // S3 Evidence 3: a key budget resets when the key rotates, which is every deploy.
    // `auto_create_key: false`: sitting 2 measured the default minting an unconfined key.
    const fake = fakeClient()
    await mintAppKey(fake.client, input('p1'))
    expect(bodyOf(fake.calls, '/user/new')).toEqual({
      user_id: aiUserId('p1', 'staging'),
      max_budget: 25,
      budget_duration: '1mo',
      auto_create_key: false,
    })
    const generate = bodyOf(fake.calls, '/key/generate')
    expect(generate.user_id).toBe(aiUserId('p1', 'staging'))
    expect(generate.max_budget).toBeUndefined()
    expect(generate.budget_duration).toBeUndefined()
    expect(generate.metadata).toEqual({
      manifest_project: 'p1',
      manifest_environment: 'staging',
      manifest_slug: 'chem-labs',
    })
  })

  it('STORES NOTHING AND REVOKES NOTHING — the previous key stays live and stored', async () => {
    // Rich, 2026-09-14: no live AI call may fail because a deploy revoked its key. A
    // mint happens before the new instance exists, so if it touched the stored key or
    // the previous one, the running app would lose its AI for the whole deploy.
    await withSecretScope(async (db, { projectId, keys }) => {
      const fake = fakeClient()
      await putSecret(db, { ...stored(projectId), value: 'sk-previous' }, keys)
      const key = await mintAppKey(fake.client, input(projectId))
      expect(key).toBe('sk-1')
      expect(revoked(fake.calls)).toEqual([])
      expect(await getSecret(db, stored(projectId), keys)).toBe('sk-previous')
    })
  })

  it('never uses a day-count budget window, in any call', () => {
    // S3: `budget_duration` aligns to a CALENDAR boundary, so a day count is not a
    // rolling window, and a week behaved as one day. Asserted across the module's
    // source rather than per call site, because the next caller is the risk.
    expect(readFileSync(new URL('./keys.ts', import.meta.url), 'utf8')).not.toMatch(
      /['"]\d+d['"]/,
    )
  })

  it('treats 409 on /user/new as the existing user of a redeploy, and UPDATES its budget', async () => {
    // Sitting 3, finding 28: the plan matched "already exists" against the error
    // TEXT, which Task 5's client never carries, so every redeploy threw. This fake
    // rejects exactly as the client does.
    const fake = fakeClient({ '/user/new': 409 })
    await expect(
      ensureAiUser(fake.client, { projectId: 'p1', kind: 'staging', monthlyUsd: 40 }),
    ).resolves.toBe(aiUserId('p1', 'staging'))
    expect(fake.calls.map((c) => c.path)).toEqual(['/user/new', '/user/update'])
    expect(bodyOf(fake.calls, '/user/update')).toEqual({
      user_id: aiUserId('p1', 'staging'),
      max_budget: 40,
      budget_duration: '1mo',
    })
  })

  it('does not mistake any other /user/new failure for an existing user', async () => {
    const fake = fakeClient({ '/user/new': 500 })
    await expect(
      ensureAiUser(fake.client, { projectId: 'p1', kind: 'staging', monthlyUsd: 40 }),
    ).rejects.toMatchObject({ code: 'AI_BACKEND_UNAVAILABLE' })
    expect(fake.calls.map((c) => c.path)).toEqual(['/user/new'])
  })
})

describe('discarding a key that was never committed', () => {
  it('revokes exactly that key, and leaves the stored one — the previous key — alone', async () => {
    // The instance holding the new key failed to start or never passed health. The
    // previous container still holds the previous key, so it must stay live and stored.
    await withSecretScope(async (db, { projectId, keys }) => {
      const fake = fakeClient()
      await putSecret(db, { ...stored(projectId), value: 'sk-previous' }, keys)
      const minted = await mintAppKey(fake.client, input(projectId))
      await discardAppKey(fake.client, minted)
      expect(revoked(fake.calls)).toEqual([[minted]])
      expect(await getSecret(db, stored(projectId), keys)).toBe('sk-previous')
    })
  })

  it('a key LiteLLM no longer holds (404) is already discarded; anything else surfaces', async () => {
    await expect(
      discardAppKey(fakeClient({ '/key/delete': 404 }).client, 'sk-gone'),
    ).resolves.toBeUndefined()
    await expect(
      discardAppKey(fakeClient({ '/key/delete': 500 }).client, 'sk-x'),
    ).rejects.toMatchObject({ code: 'AI_BACKEND_UNAVAILABLE' })
  })
})

describe('the bound service `deployRelease` holds', () => {
  it('mints, records and discards through the same functions, with no key material of its own', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const fake = fakeClient()
      const service = createAiKeyService(fake.client, keys)
      expect(service.enabled).toBe(true)
      const key = await service.mintAppKey(input(projectId))
      expect(bodyOf(fake.calls, '/key/generate').allowed_routes).toEqual(
        AI_ALLOWED_ROUTES,
      )
      const instanceId = randomUUID()
      await service.storeInstanceKey(db, { projectId, kind: 'staging', instanceId, key })
      expect(
        await getSecret(
          db,
          {
            projectId,
            environmentKind: 'staging',
            name: instanceKeySecretName(instanceId),
          },
          keys,
        ),
      ).toBe(key)
      await service.discardAppKey('sk-stray')
      expect(revoked(fake.calls)).toEqual([['sk-stray']])
    })
  })

  it('with AI switched off: says so, and refuses every step naming the setting', async () => {
    // The backstop behind deployRelease's own refusal: without it, a guard removed by
    // mistake would surface as a TypeError on `undefined`.
    const service = disabledAiKeyService()
    expect(service.enabled).toBe(false)
    await expect(service.mintAppKey(input('p1'))).rejects.toThrow(/MANIFEST_AI_ENABLED=0/)
    await expect(
      service.storeInstanceKey({} as never, {
        projectId: 'p1',
        kind: 'staging',
        instanceId: 'i1',
        key: 'k',
      }),
    ).rejects.toThrow(/MANIFEST_AI_ENABLED=0/)
    await expect(service.discardAppKey('k')).rejects.toThrow(/MANIFEST_AI_ENABLED=0/)
  })
})
