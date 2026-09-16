import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { getSecret } from '../secrets/index.js'
import { withSecretScope } from '../secrets/testing.js'
import { createLiteLlmClient } from './client.js'
import {
  LLM_API_KEY_SECRET,
  aiUserId,
  createAiKeyService,
  instanceKeySecretName,
} from './keys.js'
import { litellmMasterKey, litellmUrl } from './testing.js'

/** One request, answered RAW: the assertions are on the gateway's own statuses. */
const call = (key: string, method: 'GET' | 'POST', route: string, body?: unknown) =>
  fetch(`${litellmUrl()}${route}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

interface UserInfo {
  user_info?: { max_budget?: number | null; budget_duration?: string | null }
  keys?: unknown[]
}

/**
 * `ai/keys.ts` against the RUNNING gateway (P4b Tasks 7 and 9).
 *
 * Three of the module's rules were measured rather than reasoned, and a fake client
 * can see none of them: `/user/new` mints an unconfined key unless told not to
 * (sitting 2, finding 19), a redeploy's `/user/new` answers 409 (sitting 3, finding
 * 28), and revoking a key the gateway no longer holds answers 404 (pre-flight 43).
 * And the property the three-step split exists for — the previous key STILL WORKS
 * after the next one is minted, until it is committed (Rich, 2026-09-14) — is a fact
 * about the gateway, not about this module. So this mints, commits and discards for
 * real, and reads the gateway back.
 */
describeDocker('app keys against the running gateway (P4b Tasks 7 and 9)', () => {
  it('one confined key per app and environment, and the previous key lives until the next is committed', async () => {
    const master = litellmMasterKey()
    const client = createLiteLlmClient({ baseUrl: litellmUrl(), masterKey: master })
    // Aliased, so the child key a BROKEN confinement would mint is one teardown finds.
    const escalationAlias = `p4b-keys-escalation-${Date.now()}`
    const minted: string[] = []
    let userId: string | undefined
    let passed = false

    const userInfo = async (): Promise<UserInfo> =>
      (await (
        await call(master, 'GET', `/user/info?user_id=${userId}`)
      ).json()) as UserInfo
    const answers = async (key: string): Promise<number> =>
      (await call(key, 'GET', '/v1/models')).status

    try {
      await withSecretScope(async (db, { projectId, keys }) => {
        userId = aiUserId(projectId, 'staging')
        const service = createAiKeyService(client, keys)
        const args = {
          projectId,
          projectSlug: 'chem-labs',
          kind: 'staging' as const,
          models: ['default-chat'],
          monthlyUsd: 5,
        }
        const commit = (key: string) =>
          service.commitAppKey(db, { projectId, kind: 'staging', key })
        const storedKey = () =>
          getSecret(
            db,
            { projectId, environmentKind: 'staging', name: LLM_API_KEY_SECRET },
            keys,
          )

        const first = await service.mintAppKey(args)
        minted.push(first)
        await commit(first)

        // A REDEPLOY with a changed budget: /user/new answers 409, and is updated.
        const second = await service.mintAppKey({ ...args, monthlyUsd: 7 })
        minted.push(second)
        // THE PROPERTY THE SPLIT EXISTS FOR. Minted, not committed: the running
        // instance's key still answers and is still the stored one, and the new key
        // answers too, because the new container needs it working before health.
        expect(await answers(first)).toBe(200)
        expect(await answers(second)).toBe(200)
        expect(await storedKey()).toBe(first)

        await commit(second)
        const info = await userInfo()
        // ONE live key, the second: no auto-created key beside it, the first revoked.
        expect(info.keys).toHaveLength(1)
        expect(info.user_info).toMatchObject({ max_budget: 7, budget_duration: '1mo' })
        expect(await answers(first)).toBe(401)
        expect(await storedKey()).toBe(second)

        const models = await call(second, 'GET', '/v1/models')
        const listed = ((await models.json()) as { data: { id: string }[] }).data
        expect(listed.map((m) => m.id)).toEqual(['default-chat'])
        // Confined: the admin route that mints a child key is refused.
        const escalation = await call(second, 'POST', '/key/generate', {
          key_alias: escalationAlias,
        })
        expect(escalation.status).toBe(403)

        // A deploy whose instance never became healthy: the minted key is discarded,
        // and the committed one is untouched on both sides.
        const failed = await service.mintAppKey(args)
        minted.push(failed)
        await service.discardAppKey(failed)
        expect(await answers(failed)).toBe(401)
        expect(await answers(second)).toBe(200)
        expect(await storedKey()).toBe(second)
        expect((await userInfo()).keys).toHaveLength(1)

        // The gateway loses the committed key — a reset database, a hand delete. The
        // next commit still succeeds, and still leaves exactly one live key.
        expect(
          (await call(master, 'POST', '/key/delete', { keys: [second] })).status,
        ).toBe(200)
        const third = await service.mintAppKey(args)
        minted.push(third)
        await commit(third)
        expect(await answers(third)).toBe(200)
        expect((await userInfo()).keys).toHaveLength(1)
      })
      passed = true
    } finally {
      // The keys this test minted, then anything else the user still holds. A delete
      // of a key that is already gone answers 404, which is expected — so what is
      // LEFT after these deletes is the leak check, and a leak fails a passing run.
      for (const key of minted) await call(master, 'POST', '/key/delete', { keys: [key] })
      await call(master, 'POST', '/key/delete', { key_aliases: [escalationAlias] })
      if (userId !== undefined) {
        const left = ((await userInfo()).keys ?? []) as { token?: string }[]
        // By the HASHED token /user/info reports, which /key/delete accepts (measured
        // 2026-09-14) — so a key this test never saw, such as one auto-created with
        // the user, does not outlive the run either.
        const tokens = left
          .map((k) => k.token)
          .filter((t): t is string => typeof t === 'string')
        if (tokens.length > 0) await call(master, 'POST', '/key/delete', { keys: tokens })
        await call(master, 'POST', '/user/delete', { user_ids: [userId] })
        const leak = `teardown: ${userId} held ${left.length} key(s) this test did not mint`
        if (left.length > 0 && passed) throw new Error(leak)
        if (left.length > 0) console.error(leak)
      }
    }
  })

  /**
   * A KEY PER INSTANCE (P4c Task 6).
   *
   * P4b stored one key per app and environment and revoked the previous one at the
   * commit — the moment the previous container is still serving. P4c replaces an
   * instance beside the one serving and drains it, so both instances hold a live key
   * at once and each is revoked exactly when its own instance is retired. That is a
   * fact about the gateway — two keys under one user, both answering — so it is
   * measured here rather than against a fake.
   */
  it('gives each instance its own live key, and revokes exactly that one', async () => {
    const master = litellmMasterKey()
    const client = createLiteLlmClient({ baseUrl: litellmUrl(), masterKey: master })
    const minted: string[] = []
    let userId: string | undefined
    let passed = false

    const answers = async (key: string): Promise<number> =>
      (await call(key, 'GET', '/v1/models')).status

    try {
      await withSecretScope(async (db, { projectId, keys }) => {
        userId = aiUserId(projectId, 'staging')
        const service = createAiKeyService(client, keys)
        const args = {
          projectId,
          projectSlug: 'chem-labs',
          kind: 'staging' as const,
          models: ['default-chat'],
          monthlyUsd: 5,
        }
        const oldInstance = randomUUID()
        const newInstance = randomUUID()
        const stored = (instanceId: string) =>
          getSecret(
            db,
            {
              projectId,
              environmentKind: 'staging',
              name: instanceKeySecretName(instanceId),
            },
            keys,
          )

        const oldKey = await service.mintAppKey(args)
        minted.push(oldKey)
        await service.storeInstanceKey(db, {
          ...args,
          instanceId: oldInstance,
          key: oldKey,
        })
        const newKey = await service.mintAppKey(args)
        minted.push(newKey)
        await service.storeInstanceKey(db, {
          ...args,
          instanceId: newInstance,
          key: newKey,
        })

        // BOTH LIVE AT ONCE. This is the whole point: the old container is draining
        // and its questions must still be answered.
        expect(await answers(oldKey)).toBe(200)
        expect(await answers(newKey)).toBe(200)
        expect(await stored(oldInstance)).toBe(oldKey)
        expect(await stored(newInstance)).toBe(newKey)

        // The old instance is retired: its key dies and the serving one does not.
        expect(
          await service.revokeInstanceKey(db, {
            projectId,
            kind: 'staging',
            instanceId: oldInstance,
          }),
        ).toBe(true)
        expect(await answers(oldKey)).toBe(401)
        expect(await answers(newKey)).toBe(200)
        expect(await stored(oldInstance)).toBeUndefined()
        expect(await stored(newInstance)).toBe(newKey)

        // A second retire of the same instance — the retirer runs again after a
        // failure — is not an error, and revokes nothing it should not.
        expect(
          await service.revokeInstanceKey(db, {
            projectId,
            kind: 'staging',
            instanceId: oldInstance,
          }),
        ).toBe(false)
        expect(await answers(newKey)).toBe(200)

        // THE ORDER, AND THE ONLY THING THAT DISCRIMINATES IT.
        //
        // The plan's negative control for this — delete before revoking, then make
        // the revoke throw — cannot fail: with a working revoke both orders end in
        // the same state and both pass, and with a throwing revoke both orders throw
        // and both fail. (Measured 2026-09-15; it is sitting 4's finding 29 again.)
        // What tells them apart is the STATE A FAILED REVOKE LEAVES: revoke-then-
        // delete keeps the secret recorded, so the next retire tries again;
        // delete-then-revoke loses the only reference to a key that is still live.
        const failing = await service.mintAppKey(args)
        minted.push(failing)
        const failedInstance = randomUUID()
        await service.storeInstanceKey(db, {
          ...args,
          instanceId: failedInstance,
          key: failing,
        })
        const brokenGateway = createAiKeyService(
          {
            get: (path, query) => client.get(path, query as Record<string, string>),
            post: (path, body) => {
              if (path === '/key/delete') throw new Error('the gateway is down')
              return client.post(path, body)
            },
          },
          keys,
        )
        await expect(
          brokenGateway.revokeInstanceKey(db, {
            projectId,
            kind: 'staging',
            instanceId: failedInstance,
          }),
        ).rejects.toThrow('the gateway is down')
        // STILL RECORDED, and still live: the retirer's next pass can find it.
        expect(await stored(failedInstance)).toBe(failing)
        expect(await answers(failing)).toBe(200)
        // And that next pass finishes the job.
        expect(
          await service.revokeInstanceKey(db, {
            projectId,
            kind: 'staging',
            instanceId: failedInstance,
          }),
        ).toBe(true)
        expect(await answers(failing)).toBe(401)
        expect(await stored(failedInstance)).toBeUndefined()

        // P4b's ENVIRONMENT-level key, which every app deployed before P4c holds.
        const legacy = await service.mintAppKey(args)
        minted.push(legacy)
        await service.commitAppKey(db, { projectId, kind: 'staging', key: legacy })
        expect(await service.revokeLegacyAppKey(db, { projectId, kind: 'staging' })).toBe(
          true,
        )
        expect(await answers(legacy)).toBe(401)
        // It is gone from the store as well as from the gateway, so the next retire
        // does not try again for ever.
        expect(await service.revokeLegacyAppKey(db, { projectId, kind: 'staging' })).toBe(
          false,
        )
        // And the instance's own key — the one actually serving — is still live.
        expect(await answers(newKey)).toBe(200)
      })
      passed = true
    } finally {
      for (const key of minted) await call(master, 'POST', '/key/delete', { keys: [key] })
      if (userId !== undefined) {
        const left = ((
          (await (
            await call(master, 'GET', `/user/info?user_id=${userId}`)
          ).json()) as UserInfo
        ).keys ?? []) as { token?: string }[]
        const tokens = left
          .map((k) => k.token)
          .filter((t): t is string => typeof t === 'string')
        if (tokens.length > 0) await call(master, 'POST', '/key/delete', { keys: tokens })
        await call(master, 'POST', '/user/delete', { user_ids: [userId] })
        const leak = `teardown: ${userId} held ${left.length} key(s) this test did not mint`
        if (left.length > 0 && passed) throw new Error(leak)
        if (left.length > 0) console.error(leak)
      }
    }
  })
})
