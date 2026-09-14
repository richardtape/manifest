import { expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { withSecretScope } from '../secrets/testing.js'
import { createLiteLlmClient } from './client.js'
import { aiUserId, createAiKeyService } from './keys.js'
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
 * `ai/keys.ts` against the RUNNING gateway (P4b Task 7).
 *
 * Three of the module's rules were measured rather than reasoned, and a fake client
 * can see none of them: `/user/new` mints an unconfined key unless told not to
 * (sitting 2, finding 19), a redeploy's `/user/new` answers 409 (sitting 3, finding
 * 28), and revoking a key the gateway no longer holds answers 404 (pre-flight 43).
 * So this rotates for real and reads the gateway back — the count of live keys, the
 * budget on the user, and what each key can still do.
 */
describeDocker('app keys against the running gateway (P4b Task 7)', () => {
  it('one confined key per app and environment, under a budgeted user holding no other', async () => {
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

        const first = await service.rotateAppKey(db, args)
        minted.push(first)
        // A REDEPLOY with a changed budget: /user/new answers 409, and is updated.
        const second = await service.rotateAppKey(db, { ...args, monthlyUsd: 7 })
        minted.push(second)

        const info = await userInfo()
        // ONE live key, the second: no auto-created key beside it, the first revoked.
        expect(info.keys).toHaveLength(1)
        expect(info.user_info).toMatchObject({ max_budget: 7, budget_duration: '1mo' })
        expect((await call(first, 'GET', '/v1/models')).status).toBe(401)

        const models = await call(second, 'GET', '/v1/models')
        expect(models.status).toBe(200)
        const listed = ((await models.json()) as { data: { id: string }[] }).data
        expect(listed.map((m) => m.id)).toEqual(['default-chat'])
        // Confined: the admin route that mints a child key is refused.
        const escalation = await call(second, 'POST', '/key/generate', {
          key_alias: escalationAlias,
        })
        expect(escalation.status).toBe(403)

        // The gateway loses the key — a reset database, a hand delete. The next
        // rotation still succeeds, and still leaves exactly one live key.
        expect(
          (await call(master, 'POST', '/key/delete', { keys: [second] })).status,
        ).toBe(200)
        const third = await service.rotateAppKey(db, args)
        minted.push(third)
        expect((await call(third, 'GET', '/v1/models')).status).toBe(200)
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
