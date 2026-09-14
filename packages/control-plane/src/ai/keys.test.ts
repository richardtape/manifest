import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { getSecret } from '../secrets/index.js'
import { withSecretScope } from '../secrets/testing.js'
import type { LiteLlmClient } from './client.js'
import { mapLiteLlmError } from './errors.js'
import {
  AI_ALLOWED_ROUTES,
  LLM_API_KEY_SECRET,
  aiUserId,
  createAiKeyService,
  ensureAiUser,
  rotateAppKey,
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

describe('app key lifecycle (§10, S3 Evidence 11)', () => {
  it('mints every key with allowed_routes, and no caller can widen it', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const fake = fakeClient()
      await rotateAppKey(db, fake.client, keys, input(projectId))
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
  })

  it('REFUSES an empty model list, which LiteLLM reads as EVERY model', async () => {
    // Measured 2026-09-14: `models: []` listed all three catalogue entries and
    // embedded with a model the key was never given.
    await withSecretScope(async (db, { projectId, keys }) => {
      const fake = fakeClient()
      await expect(
        rotateAppKey(db, fake.client, keys, { ...input(projectId), models: [] }),
      ).rejects.toThrow(/every model/)
      // Before anything exists — not even the user.
      expect(fake.calls).toEqual([])
    })
  })

  it('puts the budget on the USER, gives that user no key of its own, and none on the key', async () => {
    // S3 Evidence 3: a key budget resets when the key rotates, which is every deploy.
    // `auto_create_key: false`: sitting 2 measured the default minting an unconfined key.
    await withSecretScope(async (db, { projectId, keys }) => {
      const fake = fakeClient()
      await rotateAppKey(db, fake.client, keys, input(projectId))
      expect(bodyOf(fake.calls, '/user/new')).toEqual({
        user_id: aiUserId(projectId, 'staging'),
        max_budget: 25,
        budget_duration: '1mo',
        auto_create_key: false,
      })
      const generate = bodyOf(fake.calls, '/key/generate')
      expect(generate.user_id).toBe(aiUserId(projectId, 'staging'))
      expect(generate.max_budget).toBeUndefined()
      expect(generate.budget_duration).toBeUndefined()
      expect(generate.metadata).toEqual({
        manifest_project: projectId,
        manifest_environment: 'staging',
        manifest_slug: 'chem-labs',
      })
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

  it('revokes the PREVIOUS key when it mints a new one, and stores the new one', async () => {
    // §10: "rotated every deploy". Without the revoke, every deploy leaves a live key
    // behind, and an app archived after ten deploys has ten working keys.
    await withSecretScope(async (db, { projectId, keys }) => {
      const fake = fakeClient()
      const first = await rotateAppKey(db, fake.client, keys, input(projectId))
      // A first deploy has nothing to revoke.
      expect(fake.calls.map((c) => c.path)).not.toContain('/key/delete')
      const second = await rotateAppKey(db, fake.client, keys, input(projectId))
      expect(second).not.toBe(first)
      expect(
        fake.calls.filter((c) => c.path === '/key/delete').map((c) => c.body.keys),
      ).toEqual([[first]])
      expect(await getSecret(db, stored(projectId), keys)).toBe(second)
    })
  })

  it('stores the new key BEFORE revoking the old one — observed at the moment of the revoke', async () => {
    // The plan asserted the ORDER OF ADMIN CALLS, and storing is not an admin call,
    // so its test could not see the ordering it was named for (sitting 4). This
    // reads the secret store at the instant /key/delete is sent.
    await withSecretScope(async (db, { projectId, keys }) => {
      const fake = fakeClient()
      await rotateAppKey(db, fake.client, keys, input(projectId))
      const seenAtRevoke: (string | undefined)[] = []
      const record = fake.post.getMockImplementation()!
      fake.post.mockImplementation(async (path: string, body: unknown) => {
        if (path === '/key/delete')
          seenAtRevoke.push(await getSecret(db, stored(projectId), keys))
        return record(path, body)
      })
      const second = await rotateAppKey(db, fake.client, keys, input(projectId))
      expect(seenAtRevoke).toEqual([second])
    })
  })

  it('a previous key LiteLLM no longer holds (404) does not fail the rotation', async () => {
    // Pre-flight 43: a reset gateway database, or a key deleted by hand. The deploy
    // must not fail after a live key has been minted and stored.
    await withSecretScope(async (db, { projectId, keys }) => {
      const fake = fakeClient({ '/key/delete': 404 })
      await rotateAppKey(db, fake.client, keys, input(projectId))
      const second = await rotateAppKey(db, fake.client, keys, input(projectId))
      expect(second).toBe('sk-2')
      expect(await getSecret(db, stored(projectId), keys)).toBe(second)
    })
  })

  it('any other revoke failure does fail it', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const fake = fakeClient({ '/key/delete': 500 })
      await rotateAppKey(db, fake.client, keys, input(projectId))
      await expect(
        rotateAppKey(db, fake.client, keys, input(projectId)),
      ).rejects.toMatchObject({ code: 'AI_BACKEND_UNAVAILABLE' })
    })
  })

  it('the BOUND service mints through the same function', async () => {
    // What `deployRelease` will hold (Task 9): no master key, no key material.
    await withSecretScope(async (db, { projectId, keys }) => {
      const fake = fakeClient()
      const key = await createAiKeyService(fake.client, keys).rotateAppKey(
        db,
        input(projectId),
      )
      expect(bodyOf(fake.calls, '/key/generate').allowed_routes).toEqual(
        AI_ALLOWED_ROUTES,
      )
      expect(await getSecret(db, stored(projectId), keys)).toBe(key)
    })
  })
})
