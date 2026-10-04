import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { createLiteLlmClient } from './client.js'
import { AiError } from './errors.js'
import {
  AI_ALLOWED_ROUTES,
  aiUserId,
  deleteAppUsers,
  discardAppKey,
  mintAppKey,
} from './keys.js'
import { litellmMasterKey, litellmUrl } from './testing.js'

/** One model call, answered RAW — `ai/agent-keys.docker.test.ts`'s, with the route a parameter. */
async function call(
  key: string,
  route: '/v1/chat/completions' | '/v1/embeddings',
  model: string,
): Promise<{ status: number; type?: string }> {
  const body =
    route === '/v1/embeddings'
      ? { model, input: 'ok' }
      : {
          model,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Answer with the single word ok.' }],
        }
  const res = await fetch(`${litellmUrl()}${route}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: { type?: unknown } }
  return {
    status: res.status,
    ...(typeof json.error?.type === 'string' ? { type: json.error.type } : {}),
  }
}

type KeyInfo = { key?: string; info?: Record<string, unknown> }
const BOUNDS = ['allowed_routes', 'metadata', 'user_id', 'max_budget'] as const

describeDocker(
  'app keys narrowed at boot, against the running gateway (U1 plan Task 6)',
  () => {
    it(
      'the pinned LiteLLM narrows an APP key named by its VALUE, and keeps its other bounds — the premise of S11’s sweep (I4)',
      { timeout: 120_000 },
      async () => {
        const client = createLiteLlmClient({
          baseUrl: litellmUrl(),
          masterKey: litellmMasterKey(),
        })
        const projectId = randomUUID()
        const key = await mintAppKey(client, {
          projectId,
          projectSlug: `sweep-${projectId.slice(0, 8)}`,
          kind: 'staging',
          models: ['default-chat', 'default-embed'],
          monthlyUsd: 1,
        })
        try {
          const before = await client.get<KeyInfo>('/key/info', { key })
          expect(before.info?.models).toEqual(['default-chat', 'default-embed'])
          // The bounds are THERE to keep — so a bound /key/info never answers cannot pass as "unmoved".
          expect(before.info?.allowed_routes).toEqual([...AI_ALLOWED_ROUTES])
          expect(before.info?.metadata).toMatchObject({ manifest_project: projectId })
          expect(before.info?.user_id).toBe(aiUserId(projectId, 'staging'))
          expect('max_budget' in (before.info ?? {})).toBe(true)
          // Held before the narrowing.
          expect((await call(key, '/v1/embeddings', 'default-embed')).status).toBe(200)

          await client.post('/key/update', { key, models: ['default-chat'] })

          expect(await call(key, '/v1/embeddings', 'default-embed')).toEqual({
            status: 403,
            type: 'key_model_access_denied',
          })
          // The kept model answers.
          expect((await call(key, '/v1/chat/completions', 'default-chat')).status).toBe(
            200,
          )
          const after = await client.get<KeyInfo>('/key/info', { key })
          expect(after.info?.models).toEqual(['default-chat'])
          // I4: nothing else moved.
          for (const bound of BOUNDS)
            expect(after.info?.[bound], bound).toEqual(before.info?.[bound])

          // I4's two records — neither asserted, both written into the plan's record:
          const unknown = await client
            .post('/key/update', {
              key: `sk-not-a-key-${projectId.slice(0, 8)}`,
              models: ['default-chat'],
            })
            .then(() => ({ status: 200 }))
            .catch((e: unknown) =>
              e instanceof AiError ? { status: e.status, code: e.code } : { status: -1 },
            )
          const hash = before.key // the token hash /key/info answers
          const byHash = await client
            .post('/key/update', { key: hash, models: ['default-chat'] })
            .then(() => 'accepted')
            .catch((e: unknown) =>
              e instanceof AiError ? `refused ${e.status}` : 'threw',
            )
          console.log(
            JSON.stringify({
              measured: 'U1 Task 6 Step 1',
              unknownKey: unknown,
              updateByHash: byHash,
            }),
          )
        } finally {
          await discardAppKey(client, key)
          await deleteAppUsers(client, projectId)
        }
      },
    )
  },
)
