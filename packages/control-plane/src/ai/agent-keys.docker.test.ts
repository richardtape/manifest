import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { createLiteLlmClient } from './client.js'
import {
  agentKeyAlias,
  ensureIntakeBudget,
  ensurePersonBudget,
  intakeKeyAlias,
  mintAgentKey,
  mintIntakeKey,
  personAiUserId,
  personSpend,
  revokeAgentKey,
  revokeIntakeKey,
  revokeKeyByAlias,
} from './agent-keys.js'
import { litellmMasterKey, litellmUrl } from './testing.js'

/** One model call, answered RAW: the assertions are on the gateway's own status and error type. */
async function chat(
  key: string,
  model = 'default-chat',
): Promise<{ status: number; type?: string }> {
  const res = await fetch(`${litellmUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Answer with the single word ok.' }],
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: { type?: unknown } }
  return {
    status: res.status,
    ...(typeof body.error?.type === 'string' ? { type: body.error.type } : {}),
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * `ai/agent-keys.ts` against the RUNNING gateway (the front-end enablement plan's Task 9, Review
 * Focus 2's first half — Task 10 adds the credential's half). Every bound a session's key carries
 * is the GATEWAY's to enforce, whatever the control plane does next, so each is measured by
 * CALLING THE MODEL with the key — never by reading a row: the key's cap, its life, and its
 * revocation by alias. `[M7]` measured the mechanisms on 1.98.0; this holds the module to them.
 *
 * Its LiteLLM user is `mf-person-<a random id>`, deleted at the end; the platform's intake user
 * is the machine's own, and `scripts/litellm-orphans.sh` holds it only while a key is live.
 */
describeDocker('agent and intake keys against the running gateway (Task 9)', () => {
  it(
    'a key stops at its cap, at its life, and when revoked by its alias',
    { timeout: 180_000 },
    async () => {
      const client = createLiteLlmClient({
        baseUrl: litellmUrl(),
        masterKey: litellmMasterKey(),
      })
      const person = `docker-${randomUUID()}`
      const sessions = [randomUUID(), randomUUID(), randomUUID()] as const
      try {
        await ensurePersonBudget(client, { userId: person, monthlyUsd: 1 })
        const base = {
          userId: person,
          projectId: randomUUID(),
          tokenId: null,
          models: ['default-chat'],
        }

        // (1) THE CAP. A first call spends more than $0.00002 at the local model's price, so the
        // SECOND is refused — at once (`[M7]`: 0.3 s, no batch lag) once the spend has landed.
        const capped = await mintAgentKey(client, {
          ...base,
          sessionId: sessions[0],
          capUsd: 0.00002,
          seconds: 120,
        })
        expect(await chat(capped)).toEqual({ status: 200 })
        let landed = 0
        for (let i = 0; i < 60 && landed === 0; i++) {
          landed =
            (await personSpend(client, person)).byAlias.get(agentKeyAlias(sessions[0])) ??
            0
          if (landed === 0) await sleep(1_000)
        }
        expect(landed, 'the first call’s spend never landed on the key').toBeGreaterThan(
          0,
        )
        expect(await chat(capped)).toEqual({ status: 429, type: 'budget_exceeded' })

        // (2) THE LIFE. Five seconds, and the gateway refuses it past them with no call from here.
        const brief = await mintAgentKey(client, {
          ...base,
          sessionId: sessions[1],
          capUsd: 1,
          seconds: 5,
        })
        await sleep(6_000)
        expect(await chat(brief)).toEqual({ status: 401, type: 'expired_key' })

        // (3) REVOKED BY ITS ALIAS — the platform never held the key, and still ends it.
        const revoked = await mintAgentKey(client, {
          ...base,
          sessionId: sessions[2],
          capUsd: 1,
          seconds: 120,
        })
        expect((await chat(revoked, 'default-chat-onprem')).status).toBe(403)
        await revokeAgentKey(client, sessions[2])
        expect(await chat(revoked)).toEqual({
          status: 401,
          type: 'token_not_found_in_db',
        })
        // A second revocation of the same alias is done, not a failure (`404 No keys found`).
        await expect(revokeAgentKey(client, sessions[2])).resolves.toBeUndefined()
      } finally {
        for (const id of sessions) await revokeKeyByAlias(client, agentKeyAlias(id))
        await client.post('/user/delete', { user_ids: [personAiUserId(person)] })
      }
    },
  )

  it(
    'an intake key calls ONE model, on the platform’s user, and ends with its alias',
    { timeout: 120_000 },
    async () => {
      const client = createLiteLlmClient({
        baseUrl: litellmUrl(),
        masterKey: litellmMasterKey(),
      })
      const session = randomUUID()
      try {
        await ensureIntakeBudget(client, { monthlyUsd: 50 })
        const key = await mintIntakeKey(client, {
          sessionId: session,
          userId: `docker-${randomUUID()}`,
          model: 'default-chat',
          capUsd: 0.25,
          seconds: 120,
        })
        expect(await chat(key)).toEqual({ status: 200 })
        expect((await chat(key, 'default-chat-onprem')).status).toBe(403)
        await revokeIntakeKey(client, session)
        expect(await chat(key)).toEqual({ status: 401, type: 'token_not_found_in_db' })
      } finally {
        await revokeKeyByAlias(client, intakeKeyAlias(session))
      }
    },
  )
})
