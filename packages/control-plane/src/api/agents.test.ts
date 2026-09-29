import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { agentSessions, appSpecs, idempotencyKeys } from '../db/index.js'
import { declaredCatalogue, fakeLiteLlm, type FakeLiteLlm } from '../ai/testing.js'
import { disabledCatalogue } from '../ai/index.js'
import { ensureTestUser, testSessionCookies } from '../identity/testing.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  mutationHeaders,
  refusal,
  sessionFor,
  testDeps,
  withProjectServer,
  type TestProject,
} from './testing.js'

const HOUR_MS = 3_600_000

interface Started {
  session: {
    id: string
    projectId: string
    name: string
    person: { id: string; name: string }
    via: { tokenId: string; tokenName: string } | null
    models: string[]
    capUsd: number
    expiresAt: string
    state: string
    endReason: string | null
    spentUsd: number | null
    spentUnavailable: string | null
  }
  key: string
  baseUrl: string
}

/** The session and its gateway: the unit tier's LiteLLM is a recording fake (Task 9). */
function withAgentServer(fn: (ctx: TestProject, lite: FakeLiteLlm) => Promise<void>) {
  const lite = fakeLiteLlm()
  return withProjectServer((ctx) => fn(ctx, lite), { llm: lite })
}

function start(
  ctx: TestProject,
  auth: { cookies?: Record<string, string>; bearer?: string },
  body: Record<string, unknown> = { name: 'Build the bulletin board' },
  key: string = randomUUID(),
) {
  return ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/agent-sessions`,
    payload: body,
    ...(auth.cookies === undefined ? {} : { cookies: auth.cookies }),
    headers:
      auth.bearer === undefined
        ? { ...mutationHeaders(ctx.deps), 'idempotency-key': key }
        : { authorization: `Bearer ${auth.bearer}`, 'idempotency-key': key },
  })
}

const list = (ctx: TestProject, cookies: Record<string, string>) =>
  ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.projectId}/agent-sessions`,
    cookies,
  })

const keyGenerations = (lite: FakeLiteLlm) =>
  lite.calls.filter((c) => c.path === '/key/generate')

describe('agent sessions (the front-end enablement plan’s Task 10)', () => {
  it('starts a session and answers the key ONCE; a replay is 409 naming the session, never the key', async () => {
    await withAgentServer(async (ctx, lite) => {
      const idem = randomUUID()
      const first = await start(ctx, { cookies: ctx.ownerCookies }, undefined, idem)
      expect(first.statusCode, first.body).toBe(201)
      const started = first.json() as Started
      expect(started.key).toMatch(/^sk-/)
      expect(started.baseUrl).toBe(ctx.deps.config.agent.llmUrl)
      expect(started.session).toMatchObject({
        name: 'Build the bulletin board',
        person: { id: ctx.userId },
        via: null,
        state: 'active',
        endReason: null,
        spentUsd: 0,
        spentUnavailable: null,
      })
      // The key calls the models it was given, and the gateway answers it.
      expect(lite.use(started.key, started.session.models[0]!)).toEqual({ status: 200 })

      const again = await start(ctx, { cookies: ctx.ownerCookies }, undefined, idem)
      expect(refusal(again)).toEqual({
        status: 409,
        code: 'AGENT_SESSION_ALREADY_STARTED',
      })
      expect(again.body).toContain(started.session.id)
      expect(again.body).not.toContain('sk-')
      expect(keyGenerations(lite)).toHaveLength(1)

      // …and the idempotency record keeps the session, never the key.
      const rows = await ctx.db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, idem))
      expect(rows).toHaveLength(1)
      expect(JSON.stringify(rows[0]!.responseBody)).toContain(started.session.id)
      expect(JSON.stringify(rows[0]!.responseBody)).not.toContain(started.key)
      // Nor does the row, or the event: no column holds a key.
      const [row] = await ctx.db.select().from(agentSessions)
      expect(JSON.stringify(row)).not.toContain(started.key)
    })
  })

  it('charges the PERSON: a token’s session is its minter’s, on the minter’s LiteLLM user', async () => {
    await withAgentServer(async (ctx, lite) => {
      const token = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['agent:session', 'project:read'],
        name: 'conversation-42',
      })
      const res = await start(ctx, { bearer: token.plaintext })
      expect(res.statusCode, res.body).toBe(201)
      const started = res.json() as Started
      expect(started.session.person.id).toBe(ctx.userId)
      expect(started.session.via).toEqual({
        tokenId: token.row.id,
        tokenName: 'conversation-42',
      })
      expect(keyGenerations(lite).at(-1)?.body).toMatchObject({
        user_id: `mf-person-${ctx.userId}`,
        key_alias: `mf-agent-${started.session.id}`,
        metadata: { manifest_token: token.row.id, manifest_person: ctx.userId },
      })
    })
  })

  it('never lets a key outlive the token that asked for it', async () => {
    await withAgentServer(async (ctx, lite) => {
      const token = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['agent:session'],
        expiresAt: new Date(Date.now() + 10 * 60_000),
      })
      const res = await start(
        ctx,
        { bearer: token.plaintext },
        { name: 'x', durationMinutes: 60 },
      )
      expect(res.statusCode, res.body).toBe(201)
      const duration = String(keyGenerations(lite).at(-1)?.body?.duration)
      expect(Number(duration.replace(/s$/, ''))).toBeLessThanOrEqual(600)
      expect(Number(duration.replace(/s$/, ''))).toBeGreaterThan(590)
      const expiresAt = Date.parse((res.json() as Started).session.expiresAt)
      expect(expiresAt).toBeLessThanOrEqual(token.row.expiresAt.getTime())
    })
  })

  it('never lets a key outlive the signed-in session that asked for it', async () => {
    await withAgentServer(async (ctx, lite) => {
      const owner = await ensureTestUser(ctx.db, 'bio_prof')
      // Signed in 11 h 55 m ago: five minutes of the twelve-hour session remain.
      const cookies = testSessionCookies(
        owner,
        ctx.deps.config.sessionSecret,
        Date.now() - 12 * HOUR_MS + 5 * 60_000,
      )
      const res = await start(ctx, { cookies }, { name: 'x', durationMinutes: 60 })
      expect(res.statusCode, res.body).toBe(201)
      const seconds = Number(
        String(keyGenerations(lite).at(-1)?.body?.duration).replace(/s$/, ''),
      )
      expect(seconds).toBeLessThanOrEqual(300)
      expect(seconds).toBeGreaterThan(290)
    })
  })

  it('caps a session at what remains of the month, and refuses a spent month', async () => {
    await withAgentServer(async (ctx, lite) => {
      const first = await start(ctx, { cookies: ctx.ownerCookies })
      expect(first.statusCode, first.body).toBe(201)
      expect((first.json() as Started).session.capUsd).toBe(2)

      lite.spend(`mf-person-${ctx.userId}`, 9.5)
      const second = await start(
        ctx,
        { cookies: ctx.ownerCookies },
        { name: 'x', capUsd: 5 },
      )
      expect(second.statusCode, second.body).toBe(201)
      expect((second.json() as Started).session.capUsd).toBe(0.5)
      expect(keyGenerations(lite).at(-1)?.body?.max_budget).toBe(0.5)

      lite.spend(`mf-person-${ctx.userId}`, 10)
      const minted = keyGenerations(lite).length
      const third = await start(ctx, { cookies: ctx.ownerCookies })
      expect(refusal(third)).toEqual({ status: 409, code: 'AGENT_BUDGET_EXHAUSTED' })
      expect(keyGenerations(lite)).toHaveLength(minted)
    })
  })

  it('keeps a cap smaller than a hundredth of a cent — it is not a spent month', async () => {
    // Found by the Docker tier (sitting 7): the cap was floored to four places, so $0.00002 read
    // as $0 and was refused AGENT_BUDGET_EXHAUSTED — with a message saying the month was spent.
    await withAgentServer(async (ctx, lite) => {
      const res = await start(
        ctx,
        { cookies: ctx.ownerCookies },
        { name: 'x', capUsd: 0.00002 },
      )
      expect(res.statusCode, res.body).toBe(201)
      expect((res.json() as Started).session.capUsd).toBe(0.00002)
      expect(keyGenerations(lite).at(-1)?.body?.max_budget).toBe(0.00002)
    })
  })

  it('asks for less than the platform’s cap and gets it, never more', async () => {
    await withAgentServer(async (ctx) => {
      const less = await start(
        ctx,
        { cookies: ctx.ownerCookies },
        { name: 'x', capUsd: 0.5 },
      )
      expect((less.json() as Started).session.capUsd).toBe(0.5)
      const more = await start(
        ctx,
        { cookies: ctx.ownerCookies },
        { name: 'y', capUsd: 50 },
      )
      expect((more.json() as Started).session.capUsd).toBe(2)
    })
  })

  it('routes a confidential project to on-premise models only, and refuses when there are none', async () => {
    await withAgentServer(async (ctx, lite) => {
      // A newer VALID manifest saying confidential — what classificationFloor reads (Decision 23).
      await ctx.db.insert(appSpecs).values({
        projectId: ctx.projectId,
        commitSha: ctx.commitSha,
        parsed: { data: { classification: 'confidential' } },
        schemaVersion: 1,
        valid: true,
        createdAt: new Date(Date.now() + 1000),
      })
      const res = await start(ctx, { cookies: ctx.ownerCookies })
      expect(res.statusCode, res.body).toBe(201)
      expect((res.json() as Started).session.models).toEqual([
        'default-chat-onprem',
        'default-chat-onprem-reasoning',
      ])
      expect(keyGenerations(lite).at(-1)?.body?.models).toEqual([
        'default-chat-onprem',
        'default-chat-onprem-reasoning',
      ])
    })
    const internalOnly = await declaredCatalogue().get()
    const lite = fakeLiteLlm()
    await withProjectServer(
      async (ctx) => {
        await ctx.db.insert(appSpecs).values({
          projectId: ctx.projectId,
          commitSha: ctx.commitSha,
          parsed: { data: { classification: 'confidential' } },
          schemaVersion: 1,
          valid: true,
          createdAt: new Date(Date.now() + 1000),
        })
        const res = await start(ctx, { cookies: ctx.ownerCookies })
        expect(refusal(res)).toEqual({
          status: 409,
          code: 'AGENT_NO_MODEL_FOR_CLASSIFICATION',
        })
        expect(keyGenerations(lite)).toEqual([])
      },
      {
        llm: lite,
        catalogue: {
          enabled: true,
          get: async () => ({
            models: internalOnly.models.filter((m) => m.maxClassification === 'internal'),
            unclassified: [],
          }),
        },
      },
    )
  })

  it('lets a confidential project’s agent call the capable model while the builder setting allows it (Spec action 10)', async () => {
    const declared = await declaredCatalogue().get()
    const withCapable = {
      enabled: true,
      get: async () => ({
        ...declared,
        models: [
          ...declared.models,
          {
            name: 'default-chat-large',
            maxClassification: 'internal' as const,
            kind: 'chat' as const,
          },
        ],
      }),
    }
    const confidential = (ctx: TestProject) =>
      ctx.db.insert(appSpecs).values({
        projectId: ctx.projectId,
        commitSha: ctx.commitSha,
        parsed: { data: { classification: 'confidential' } },
        schemaVersion: 1,
        valid: true,
        createdAt: new Date(Date.now() + 1000),
      })
    for (const [builderModels, expected] of [
      [
        'capable',
        ['default-chat-onprem', 'default-chat-onprem-reasoning', 'default-chat-large'],
      ],
      ['on-premise', ['default-chat-onprem', 'default-chat-onprem-reasoning']],
    ] as const) {
      const lite = fakeLiteLlm()
      // ONE `testDeps()` laid over the harness's whole, so the config and the source driver it
      // was built with agree (the repositories' root is per call).
      const base = await testDeps()
      await withProjectServer(
        async (ctx) => {
          await confidential(ctx)
          const res = await start(ctx, { cookies: ctx.ownerCookies })
          expect(res.statusCode, res.body).toBe(201)
          expect((res.json() as Started).session.models, builderModels).toEqual(expected)
          // The KEY carries the same list — LiteLLM enforces the key's, never the row's.
          expect(keyGenerations(lite).at(-1)?.body?.models, builderModels).toEqual(
            expected,
          )
        },
        {
          ...base,
          llm: lite,
          catalogue: withCapable,
          config: { ...base.config, agent: { ...base.config.agent, builderModels } },
        },
      )
    }
  })

  it('a revoked token’s sessions end, and their keys are revoked by alias', async () => {
    await withAgentServer(async (ctx, lite) => {
      const token = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['agent:session'],
      })
      const a = (await start(ctx, { bearer: token.plaintext })).json() as Started
      const b = (await start(ctx, { bearer: token.plaintext })).json() as Started
      const mine = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started

      const revoked = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/tokens/${token.row.id}`,
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(revoked.statusCode, revoked.body).toBe(200)
      expect(lite.use(a.key, a.session.models[0]!)).toEqual({
        status: 401,
        type: 'token_not_found_in_db',
      })
      expect(lite.use(b.key, b.session.models[0]!)).toEqual({
        status: 401,
        type: 'token_not_found_in_db',
      })
      // A person's own session is not the token's to end.
      expect(lite.use(mine.key, mine.session.models[0]!)).toEqual({ status: 200 })

      const sessions = (
        (await list(ctx, ctx.ownerCookies)).json() as { sessions: Started['session'][] }
      ).sessions
      const byId = new Map(sessions.map((s) => [s.id, s]))
      expect(byId.get(a.session.id)).toMatchObject({
        state: 'ended',
        endReason: 'token_revoked',
      })
      expect(byId.get(b.session.id)).toMatchObject({
        state: 'ended',
        endReason: 'token_revoked',
      })
      expect(byId.get(mine.session.id)).toMatchObject({
        state: 'active',
        endReason: null,
      })
    })
  })

  it('a token revoked WHILE its session is starting never leaves the agent a working key', async () => {
    // The whole-branch review's I1 (sitting 7): the revoke's `endSessionsOf` saw no committed row
    // while the start's mint was in flight, and the start then committed a live key for a revoked token.
    await withAgentServer(async (ctx, lite) => {
      lite.slow('/key/generate', 150)
      const token = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['agent:session'],
      })
      const starting = start(ctx, { bearer: token.plaintext })
      for (
        let i = 0;
        i < 200 && !lite.calls.some((c) => c.path === '/key/generate');
        i++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      expect(
        lite.calls.some((c) => c.path === '/key/generate'),
        'the mint never began',
      ).toBe(true)
      const revoked = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/tokens/${token.row.id}`,
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(revoked.statusCode, revoked.body).toBe(200)
      const res = await starting
      if (res.statusCode === 201) {
        const started = res.json() as Started
        expect(lite.use(started.key, started.session.models[0]!)).toEqual({
          status: 401,
          type: 'token_not_found_in_db',
        })
      } else {
        expect(refusal(res)).toEqual({ status: 401, code: 'UNAUTHENTICATED' })
      }
      // Whichever order the two landed in: no key minted for that token is still live.
      const live = [...lite.keys.values()].filter(
        (k) =>
          (k.metadata as { manifest_token?: string }).manifest_token === token.row.id,
      )
      expect(live).toEqual([])
    })
  })

  it('a revocation that could not end every session is a 500, and the same request retried ends them', async () => {
    await withAgentServer(async (ctx, lite) => {
      const token = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['agent:session'],
      })
      const a = (await start(ctx, { bearer: token.plaintext })).json() as Started
      lite.fail('/key/delete', 503)
      const revoke = () =>
        ctx.app.inject({
          method: 'DELETE',
          url: `/v1/tokens/${token.row.id}`,
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
        })
      const failed = await revoke()
      expect(failed.statusCode, failed.body).toBe(500)
      expect(lite.use(a.key, a.session.models[0]!)).toEqual({ status: 200 })

      // The token is revoked already; the retry must still reach its sessions.
      const retried = await revoke()
      expect(retried.statusCode, retried.body).toBe(200)
      expect(lite.use(a.key, a.session.models[0]!)).toEqual({
        status: 401,
        type: 'token_not_found_in_db',
      })
    })
  })

  it('a token ends the sessions it started, and not a person’s', async () => {
    await withAgentServer(async (ctx, lite) => {
      const token = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['agent:session'],
      })
      const its = (await start(ctx, { bearer: token.plaintext })).json() as Started
      const persons = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      const end = (id: string) =>
        ctx.app.inject({
          method: 'DELETE',
          url: `/v1/agent-sessions/${id}`,
          headers: {
            authorization: `Bearer ${token.plaintext}`,
            'idempotency-key': randomUUID(),
          },
        })
      const ended = await end(its.session.id)
      expect(ended.statusCode, ended.body).toBe(200)
      expect(ended.json()).toMatchObject({ state: 'ended', endReason: 'ended' })
      expect(lite.use(its.key, its.session.models[0]!)).toMatchObject({ status: 401 })
      expect(refusal(await end(persons.session.id))).toEqual({
        status: 403,
        code: 'FORBIDDEN',
      })
      expect(lite.use(persons.key, persons.session.models[0]!)).toEqual({ status: 200 })
      // Ending twice is the session as it is.
      const again = await end(its.session.id)
      expect(again.statusCode, again.body).toBe(200)
    })
  })

  it('a person ends any session of their project, a stranger none', async () => {
    await withAgentServer(async (ctx) => {
      const persons = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator')
      const stranger = await sessionFor(ctx, 'unrelated_user')
      const end = (cookies: Record<string, string>) =>
        ctx.app.inject({
          method: 'DELETE',
          url: `/v1/agent-sessions/${persons.session.id}`,
          cookies,
          headers: mutationHeaders(ctx.deps),
        })
      expect(refusal(await end(stranger))).toEqual({ status: 404, code: 'NOT_FOUND' })
      const ended = await end(collaborator)
      expect(ended.statusCode, ended.body).toBe(200)
    })
  })

  it('answers the budget of the person the credential acts for — a token’s minter', async () => {
    await withAgentServer(async (ctx, lite) => {
      await start(ctx, { cookies: ctx.ownerCookies })
      lite.spend(`mf-person-${ctx.userId}`, 0.4)
      const token = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/v1/agent-budget',
        headers: { authorization: `Bearer ${token.plaintext}` },
      })
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({
        monthlyUsd: 10,
        spentUsd: 0.4,
        remainingUsd: 9.6,
        unavailable: null,
      })
      expect((res.json() as { resetsAt: string }).resetsAt).toMatch(/-01T00:00:00/)

      // A person who has never started one: a known zero, not unknown.
      const student = await sessionFor(ctx, 'bio_student')
      const fresh = await ctx.app.inject({
        method: 'GET',
        url: '/v1/agent-budget',
        cookies: student,
      })
      expect(fresh.json()).toMatchObject({
        spentUsd: 0,
        remainingUsd: 10,
        unavailable: null,
      })
    })
  })

  it('answers spentUsd null with a reason when the gateway does not answer — never 0', async () => {
    await withAgentServer(async (ctx, lite) => {
      const started = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      lite.fail('/user/info', 503, 5)
      const budget = await ctx.app.inject({
        method: 'GET',
        url: '/v1/agent-budget',
        cookies: ctx.ownerCookies,
      })
      expect(budget.statusCode, budget.body).toBe(200)
      expect(budget.json()).toMatchObject({ spentUsd: null, remainingUsd: null })
      expect((budget.json() as { unavailable: string }).unavailable).toMatch(/gateway/)

      const sessions = (
        (await list(ctx, ctx.ownerCookies)).json() as { sessions: Started['session'][] }
      ).sessions
      expect(sessions.find((s) => s.id === started.session.id)).toMatchObject({
        spentUsd: null,
      })
      expect(sessions[0]!.spentUnavailable).toMatch(/gateway/)
    })
  })

  it('lists each session’s spend (FE-23) — a live one from the gateway, an ended one as recorded at its end', async () => {
    await withAgentServer(async (ctx, lite) => {
      const live = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      const done = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      lite.charge(`mf-agent-${live.session.id}`, 0.4)
      lite.charge(`mf-agent-${done.session.id}`, 0.25)
      const ended = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/agent-sessions/${done.session.id}`,
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(ended.json()).toMatchObject({ state: 'ended', spentUsd: 0.25 })
      const res = await list(ctx, ctx.ownerCookies)
      expect(res.statusCode, res.body).toBe(200)
      const sessions = (
        res.json() as { sessions: Started['session'][]; truncated: boolean }
      ).sessions
      // Newest first.
      expect(sessions.map((s) => s.id)).toEqual([done.session.id, live.session.id])
      expect(sessions[1]).toMatchObject({
        spentUsd: 0.4,
        spentUnavailable: null,
        state: 'active',
      })
      expect(sessions[0]).toMatchObject({
        spentUsd: 0.25,
        spentUnavailable: null,
        state: 'ended',
      })
    })
  })

  it('reads a session past its life as expired, whether or not anybody ended it', async () => {
    await withAgentServer(async (ctx) => {
      const started = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      await ctx.db
        .update(agentSessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(agentSessions.id, started.session.id))
      const sessions = (
        (await list(ctx, ctx.ownerCookies)).json() as { sessions: Started['session'][] }
      ).sessions
      expect(sessions[0]).toMatchObject({ state: 'expired', endReason: null })
    })
  })

  it('fails the start, and keeps no session, when the key cannot be minted', async () => {
    await withAgentServer(async (ctx, lite) => {
      lite.fail('/key/generate', 500)
      const res = await start(ctx, { cookies: ctx.ownerCookies })
      expect(refusal(res)).toEqual({ status: 503, code: 'AI_BACKEND_UNAVAILABLE' })
      const sessions = (
        (await list(ctx, ctx.ownerCookies)).json() as { sessions: unknown[] }
      ).sessions
      expect(sessions).toEqual([])
    })
  })

  it('refuses every start with AI switched off, naming the setting, and mints nothing', async () => {
    await withProjectServer(
      async (ctx) => {
        const res = await start(ctx, { cookies: ctx.ownerCookies })
        expect(refusal(res)).toEqual({ status: 503, code: 'AI_CATALOGUE_DISABLED' })
      },
      { catalogue: disabledCatalogue() },
    )
  })

  it('never answers a session to anyone outside the project', async () => {
    await withAgentServer(async (ctx) => {
      await start(ctx, { cookies: ctx.ownerCookies })
      const stranger = await sessionFor(ctx, 'unrelated_user')
      expect(refusal(await list(ctx, stranger))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
    })
  })
})
