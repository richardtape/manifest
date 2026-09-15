import { expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { getSecret } from '../secrets/index.js'
import { withSecretScope } from '../secrets/testing.js'
import { createLiteLlmClient } from './client.js'
import { LLM_API_KEY_SECRET, aiUserId, createAiKeyService } from './keys.js'
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
})
