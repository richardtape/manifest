import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { mutationHeaders, withProjectServer, type TestProject } from '../api/testing.js'
import { describeDocker } from '../runtime/testing.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  agentKeyAlias,
  personAiUserId,
  personSpend,
  revokeKeyByAlias,
} from './agent-keys.js'
import { createLiteLlmClient, type LiteLlmClient } from './client.js'
import { agentSessionsOf } from './sessions.js'
import { litellmMasterKey, litellmUrl } from './testing.js'

/** One model call with a session's key, answered RAW: the gateway's own status and error type. */
async function chat(
  key: string,
  model: string,
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

interface Started {
  session: { id: string; models: string[] }
  key: string
}

/**
 * The CREDENTIAL'S half of Review Focus 2 (the front-end enablement plan's Task 10): a model key that
 * outlives what it was issued under is refused by the GATEWAY — measured by calling the model with
 * the key, never by reading a row. A real in-process server over the running LiteLLM: the token's
 * revocation reaches the key through `revokeToken`'s route, and the cap is LiteLLM's own.
 *
 * Every session a case starts is ended in its `finally`, and the person's LiteLLM user —
 * `mf-person-<this run's bio_prof>` — deleted, so the run leaves no live key and no budget behind.
 */
describeDocker('agent sessions against the running gateway (Task 10)', () => {
  async function withGateway(
    fn: (ctx: TestProject, llm: LiteLlmClient) => Promise<void>,
  ) {
    const llm = createLiteLlmClient({
      baseUrl: litellmUrl(),
      masterKey: litellmMasterKey(),
    })
    const started: string[] = []
    let person: string | undefined
    await withProjectServer(
      async (ctx) => {
        person = ctx.userId
        try {
          await fn(ctx, llm)
        } finally {
          const { rows } = await agentSessionsOf(ctx.db, ctx.projectId, 50)
          for (const row of rows) started.push(row.id)
        }
      },
      { llm },
    )
    for (const id of started) await revokeKeyByAlias(llm, agentKeyAlias(id))
    if (person !== undefined)
      await llm.post('/user/delete', { user_ids: [personAiUserId(person)] })
  }

  it(
    'a revoked token’s sessions end, and LiteLLM refuses their keys',
    { timeout: 120_000 },
    async () => {
      await withGateway(async (ctx) => {
        const token = await mintTestToken(ctx.db, {
          userId: ctx.userId,
          projectId: ctx.projectId,
          capabilities: ['agent:session'],
          name: 'conversation-docker',
        })
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/agent-sessions`,
          payload: { name: 'docker', capUsd: 1 },
          headers: {
            authorization: `Bearer ${token.plaintext}`,
            'idempotency-key': randomUUID(),
          },
        })
        expect(res.statusCode, res.body).toBe(201)
        const { session, key } = res.json() as Started
        expect(await chat(key, 'default-chat')).toEqual({ status: 200 })

        const revoked = await ctx.app.inject({
          method: 'DELETE',
          url: `/v1/tokens/${token.row.id}`,
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
        })
        expect(revoked.statusCode, revoked.body).toBe(200)
        expect(await chat(key, 'default-chat')).toEqual({
          status: 401,
          type: 'token_not_found_in_db',
        })
        expect(session.models).toContain('default-chat')
      })
    },
  )

  it('a session’s key is refused past its cap', { timeout: 120_000 }, async () => {
    await withGateway(async (ctx, llm) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/agent-sessions`,
        payload: { name: 'docker-cap', capUsd: 0.00002 },
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(res.statusCode, res.body).toBe(201)
      const { session, key } = res.json() as Started
      expect(await chat(key, 'default-chat')).toEqual({ status: 200 })
      let landed = 0
      for (let i = 0; i < 60 && landed === 0; i++) {
        landed =
          (await personSpend(llm, ctx.userId)).byAlias.get(agentKeyAlias(session.id)) ?? 0
        if (landed === 0) await new Promise((resolve) => setTimeout(resolve, 1_000))
      }
      expect(landed, 'the first call’s spend never landed on the key').toBeGreaterThan(0)
      expect(await chat(key, 'default-chat')).toEqual({
        status: 429,
        type: 'budget_exceeded',
      })

      // Ended through the route: its spend recorded (FE-23), and its key gone at the gateway.
      const ended = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/agent-sessions/${session.id}`,
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(ended.statusCode, ended.body).toBe(200)
      expect((ended.json() as { spentUsd: number }).spentUsd).toBeGreaterThan(0)
      expect(await chat(key, 'default-chat')).toEqual({
        status: 401,
        type: 'token_not_found_in_db',
      })
    })
  })

  it(
    'a commit raising the project to confidential ends its session, and LiteLLM refuses the key (FE-36, Task 14a)',
    { timeout: 120_000 },
    async () => {
      await withGateway(async (ctx) => {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/agent-sessions`,
          payload: { name: 'docker-withdrawn', capUsd: 1 },
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
        })
        expect(res.statusCode, res.body).toBe(201)
        const { session, key } = res.json() as Started
        expect(session.models).toContain('default-chat')
        expect(await chat(key, 'default-chat')).toEqual({ status: 200 })

        // The raise, through the API's own commit — the manifest it leaves validated and recorded.
        const file = await ctx.app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.projectId}/file?path=manifest.yaml`,
          cookies: ctx.ownerCookies,
        })
        const committed = await ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/commits`,
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
          payload: {
            baseCommit: ctx.commitSha,
            message: 'the data is confidential',
            changes: [
              {
                op: 'write',
                path: 'manifest.yaml',
                content: `${(file.json() as { content: string }).content}data:\n  classification: confidential\n`,
              },
            ],
          },
        })
        expect(committed.statusCode, committed.body).toBe(201)

        // Refused by the GATEWAY — even for the on-premise model the new classification allows,
        // because the whole key is gone; a new session is what an agent starts next.
        expect(await chat(key, 'default-chat-onprem')).toEqual({
          status: 401,
          type: 'token_not_found_in_db',
        })
        const { rows } = await agentSessionsOf(ctx.db, ctx.projectId, 50)
        expect(rows.find((r) => r.id === session.id)).toMatchObject({
          endReason: 'models_withdrawn',
        })
      })
    },
  )
})
