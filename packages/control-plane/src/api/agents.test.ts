import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { agentSessions, appSpecs, events, idempotencyKeys } from '../db/index.js'
import { declaredCatalogue, fakeLiteLlm, type FakeLiteLlm } from '../ai/testing.js'
import {
  disabledCatalogue,
  endSessionsOf,
  narrowSessionsHoldingMore,
  personSpend,
  type BuilderModels,
  type LiteLlmClient,
  type ModelCatalogue,
} from '../ai/index.js'
import { ROUTE_DEFINITIONS } from './routes/index.js'
import { ensureTestUser, testSessionCookies } from '../identity/testing.js'
import { mintTestToken } from '../tokens/testing.js'
import { resetDatabase } from '../db/testing.js'
import { writeFiles } from '../source/testing.js'
import {
  approvedProject,
  commitManifest,
  CWL_LAUNCH_ATTRIBUTES,
  cwlFakes,
  cwlManifest,
  loginAs,
  mutationHeaders,
  projectBody,
  refusal,
  sessionFor,
  testDeps,
  withProjectServer,
  type TestProject,
} from './testing.js'
import { buildServer, type ServerDeps } from './server.js'

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

  it('names each session a revocation could not end WITH ITS CAUSE — never a key the gateway revoked as still live (the whole-branch review’s M8)', async () => {
    await withAgentServer(async (ctx, lite) => {
      const token = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['agent:session'],
      })
      const a = (await start(ctx, { bearer: token.plaintext })).json() as Started
      // The gateway revokes the key; the database then refuses the row's stamp.
      const refusing = new Proxy(ctx.db, {
        get(target, name) {
          if (name === 'update')
            return () => {
              throw new Error('the database refused the stamp')
            }
          const value = Reflect.get(target, name, target) as unknown
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        await expect(
          endSessionsOf(
            { db: refusing, bus: ctx.deps.bus, llm: lite },
            { tokenId: token.row.id },
            'token_revoked',
            { userId: ctx.userId, tokenId: null },
          ),
        ).rejects.toThrow(/could not be ended/)
        const lines = logged.mock.calls.map((call) => call.map(String).join(' '))
        // Its own line, with the cause.
        expect(
          lines.some(
            (line) =>
              line.includes(a.session.id) &&
              line.includes('the database refused the stamp'),
          ),
          lines.join('\n'),
        ).toBe(true)
        // And no line says a key is STILL LIVE that the gateway has revoked.
        expect(lines.join('\n')).not.toMatch(/STILL LIVE/)
        // Never the key itself.
        expect(lines.join('\n')).not.toContain(a.key)
      } finally {
        logged.mockRestore()
      }
      expect(lite.use(a.key, a.session.models[0]!)).toEqual({
        status: 401,
        type: 'token_not_found_in_db',
      })
    })
  })

  it('a revocation with AI switched off answers AI_CATALOGUE_DISABLED — the code it declares — and the retry once it is back ends the session (the whole-branch review’s I1)', async () => {
    await withAgentServer(async (ctx, lite) => {
      const token = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['agent:session'],
      })
      const a = (await start(ctx, { bearer: token.plaintext })).json() as Started
      const revoke = () =>
        ctx.app.inject({
          method: 'DELETE',
          url: `/v1/tokens/${token.row.id}`,
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
        })
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      let off: Awaited<ReturnType<typeof revoke>>
      try {
        // The control plane restarted with AI off while the session's key is still live.
        ctx.deps.llm = undefined
        off = await revoke()
      } finally {
        ctx.deps.llm = lite
        logged.mockRestore()
      }
      expect(refusal(off)).toEqual({ status: 503, code: 'AI_CATALOGUE_DISABLED' })
      expect(off.body).toContain('1 agent session(s) could not be ended')
      // The declaration is the answer (`revokeToken`'s `errors:`).
      expect(
        ROUTE_DEFINITIONS.find((r) => r.operationId === 'revokeToken')?.errors,
      ).toContain('AI_CATALOGUE_DISABLED')
      expect(lite.use(a.key, a.session.models[0]!)).toEqual({ status: 200 })

      // POSITIVE CONTROL: the same request, AI back on, ends it.
      const retried = await revoke()
      expect(retried.statusCode, retried.body).toBe(200)
      expect(lite.use(a.key, a.session.models[0]!)).toEqual({
        status: 401,
        type: 'token_not_found_in_db',
      })
    })
  })

  it('ending an agent or an intake session with AI switched off answers AI_CATALOGUE_DISABLED — and both operations declare it (the whole-branch review’s I1)', async () => {
    await withAgentServer(async (ctx, lite) => {
      const agent = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      const intake = await ctx.app.inject({
        method: 'POST',
        url: '/v1/intake-sessions',
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(intake.statusCode, intake.body).toBe(201)
      const intakeId = (intake.json() as { session: { id: string } }).session.id
      const end = (url: string) =>
        ctx.app.inject({
          method: 'DELETE',
          url,
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
        })
      const urls = [
        `/v1/agent-sessions/${agent.session.id}`,
        `/v1/intake-sessions/${intakeId}`,
      ]
      ctx.deps.llm = undefined
      const off = []
      try {
        for (const url of urls) off.push(await end(url))
      } finally {
        ctx.deps.llm = lite
      }
      for (const answer of off)
        expect(refusal(answer)).toEqual({ status: 503, code: 'AI_CATALOGUE_DISABLED' })
      for (const operationId of ['endAgentSession', 'endIntakeSession'])
        expect(
          ROUTE_DEFINITIONS.find((r) => r.operationId === operationId)?.errors,
          operationId,
        ).toContain('AI_CATALOGUE_DISABLED')
      // POSITIVE CONTROL: AI back on, each ends.
      for (const url of urls) {
        const ended = await end(url)
        expect(ended.statusCode, ended.body).toBe(200)
      }
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

/** The declared catalogue with `default-chat-large` registered, as the boot registers it (Task 12a). */
async function capableCatalogue(): Promise<ModelCatalogue> {
  const declared = await declaredCatalogue().get()
  const snapshot = {
    ...declared,
    models: [
      ...declared.models,
      {
        name: 'default-chat-large',
        maxClassification: 'internal' as const,
        kind: 'chat' as const,
      },
    ],
  }
  return { enabled: true, get: async () => snapshot }
}

/**
 * A catalogue with NO model approved for `confidential` data — the declared catalogue's `internal` entries
 * alone, and no capable model — so a session a raise reaches is left with nothing it may use (the launch
 * path plan's Task 7: the one case still ENDED `models_withdrawn`).
 */
async function internalOnlyCatalogue(): Promise<ModelCatalogue> {
  const declared = await declaredCatalogue().get()
  const snapshot = {
    ...declared,
    models: declared.models.filter((m) => m.maxClassification === 'internal'),
  }
  return { enabled: true, get: async () => snapshot }
}

/** A server whose catalogue holds the capable model (or `catalogue`), under the builder setting given. */
async function withBuilderServer(
  builderModels: BuilderModels,
  fn: (ctx: TestProject, lite: FakeLiteLlm) => Promise<void>,
  catalogue?: ModelCatalogue,
): Promise<void> {
  const lite = fakeLiteLlm()
  const base = await testDeps()
  await withProjectServer((ctx) => fn(ctx, lite), {
    ...base,
    llm: lite,
    catalogue: catalogue ?? (await capableCatalogue()),
    config: { ...base.config, agent: { ...base.config.agent, builderModels } },
  })
}

/**
 * THE LISTS THE NARROWING TESTS EXPECT, DERIVED BEFORE THEY WERE RUN (the launch path plan's Task 7: *"never
 * adjust an expectation to what the code answers"*) from `agentModelsFor` (`ai/models.ts`) over
 * `capableCatalogue()` — `infra/litellm/config.yaml`'s five entries in their order (`default-chat` internal,
 * `default-chat-onprem` confidential, `default-chat-reasoning` internal, `default-chat-onprem-reasoning`
 * confidential, `default-embed` internal), then `default-chat-large` (internal) — under the builder setting
 * `capable`. An `internal` session holds every one of the six (each is approved for at least `internal`).
 * Raised to `confidential`, the project allows the two approved for it and, while the setting is `capable`,
 * the capable model's name: the session KEEPS those three, in the order it held them, and loses the rest.
 */
const INTERNAL_SESSION = [
  'default-chat',
  'default-chat-onprem',
  'default-chat-reasoning',
  'default-chat-onprem-reasoning',
  'default-embed',
  'default-chat-large',
]
const CONFIDENTIAL_KEEPS = [
  'default-chat-onprem',
  'default-chat-onprem-reasoning',
  'default-chat-large',
]
const CONFIDENTIAL_WITHDRAWS = ['default-chat', 'default-chat-reasoning', 'default-embed']

const gatewayCalls = (lite: FakeLiteLlm, path: '/key/update' | '/key/delete') =>
  lite.calls.filter((c) => c.path === path)

/** The sweep itself, as the boot and every trigger run it — here over every project. */
const sweep = (
  ctx: TestProject,
  lite: FakeLiteLlm,
  overrides: { builderModels?: BuilderModels; catalogue?: ModelCatalogue } = {},
) =>
  narrowSessionsHoldingMore(
    {
      db: ctx.db,
      bus: ctx.deps.bus,
      llm: lite,
      catalogue: overrides.catalogue ?? ctx.deps.catalogue,
      agent: {
        ...ctx.deps.config.agent,
        ...(overrides.builderModels === undefined
          ? {}
          : { builderModels: overrides.builderModels }),
      },
    },
    'every',
  )

/** The project's `manifest.yaml` on `main`, with `lines` appended — the fixture declares no `data:`. */
async function manifestWith(ctx: TestProject, ...lines: string[]): Promise<string> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.projectId}/file?path=manifest.yaml`,
    cookies: ctx.ownerCookies,
  })
  expect(res.statusCode, res.body).toBe(200)
  return `${(res.json() as { content: string }).content}${lines.map((l) => `${l}\n`).join('')}`
}

/** One commit through the API (`createCommit`), which validates the manifest it leaves. */
async function commitFile(
  ctx: TestProject,
  base: string,
  path: string,
  content: string,
): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/commits`,
    cookies: ctx.ownerCookies,
    headers: mutationHeaders(ctx.deps),
    payload: {
      baseCommit: base,
      message: `write ${path}`,
      changes: [{ op: 'write', path, content }],
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { commitSha: string }).commitSha
}

/** Waits for `condition`, polling — for a race opened by the fake's `slow()`, never a fixed sleep. */
async function until(condition: () => boolean, what: string): Promise<void> {
  for (let waited = 0; !condition(); waited += 10) {
    if (waited > 10_000) throw new Error(`waited 10 s for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/**
 * `lite`, with its answer to ONE call — `path`, for the key `alias` — HELD until `release()`. The fake has
 * recorded the call and acted on it (`answered()` says so); only its answer waits. A race opened by a
 * gate, so it opens whatever the machine's load — never by `slow()`'s margin.
 */
function holdingAnswer(lite: FakeLiteLlm, path: string, alias: string) {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  let answered = false
  const llm: LiteLlmClient = {
    get: (p, query) => lite.get(p, query),
    delete: (p, query) => lite.delete(p, query),
    post: async <T>(p: string, body: unknown): Promise<T> => {
      const answer = await lite.post<T>(p, body)
      if (p === path && (body as { key_alias?: unknown }).key_alias === alias) {
        answered = true
        await released
      }
      return answer
    },
  }
  return { llm, answered: () => answered, release }
}

const sessionsById = async (ctx: TestProject) =>
  new Map(
    (
      (await list(ctx, ctx.ownerCookies)).json() as { sessions: Started['session'][] }
    ).sessions.map((s) => [s.id, s]),
  )

const endedEvents = (ctx: TestProject) =>
  ctx.db
    .select()
    .from(events)
    .where(
      and(eq(events.projectId, ctx.projectId), eq(events.type, 'agent_session.ended')),
    )

const narrowedEvents = (ctx: TestProject) =>
  ctx.db
    .select()
    .from(events)
    .where(
      and(eq(events.projectId, ctx.projectId), eq(events.type, 'agent_session.narrowed')),
    )

describe('FE-36 — a session never holds more than its project now allows (Spec action 10; Task 14a) — narrowed in place (Spec action 1; the launch path plan’s Task 7)', () => {
  it('a commit that raises the project to confidential NARROWS a session to what it may still use, and keeps it — one /key/update, the withdrawn models refused at once, the rest answered, published', async () => {
    await withBuilderServer('capable', async (ctx, lite) => {
      const internal = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      // The precondition, against the DERIVED list (the constants' comment): the capable model is held too.
      expect(internal.session.models).toEqual(INTERNAL_SESSION)
      expect(lite.use(internal.key, 'default-chat')).toEqual({ status: 200 })

      await commitFile(
        ctx,
        ctx.commitSha,
        'manifest.yaml',
        await manifestWith(ctx, 'data:', '  classification: confidential'),
      )

      // The session GOES ON, and answers what its key now holds.
      expect((await sessionsById(ctx)).get(internal.session.id)).toMatchObject({
        state: 'active',
        endedAt: null,
        endReason: null,
        models: CONFIDENTIAL_KEEPS,
      })
      // At the GATEWAY: one narrowing, by the alias alone — never a revocation.
      expect(gatewayCalls(lite, '/key/update').map((c) => c.body)).toEqual([
        { key_alias: `mf-agent-${internal.session.id}`, models: CONFIDENTIAL_KEEPS },
      ])
      expect(gatewayCalls(lite, '/key/delete')).toHaveLength(0)
      // The SAME key: refused a withdrawn model at once (`[M3]`'s refusal), answered a kept one.
      for (const withdrawn of CONFIDENTIAL_WITHDRAWS) {
        expect(lite.use(internal.key, withdrawn)).toEqual({
          status: 403,
          type: 'key_model_access_denied',
        })
      }
      expect(lite.use(internal.key, 'default-chat-onprem')).toEqual({ status: 200 })
      expect(lite.use(internal.key, 'default-chat-large')).toEqual({ status: 200 })

      // Published: what was withdrawn, what it keeps, and the person by NAME — never a key or its hash.
      const [narrowed, ...more] = await narrowedEvents(ctx)
      expect(more).toEqual([])
      expect(narrowed?.subject).toBe(`agent_session:${internal.session.id}`)
      expect(narrowed?.machineDetail).toEqual({
        sessionId: internal.session.id,
        withdrawn: CONFIDENTIAL_WITHDRAWS,
        models: CONFIDENTIAL_KEEPS,
        via: 'session',
        userId: ctx.userId,
        tokenId: null,
      })
      expect(narrowed?.humanMessage).toBe(
        `${internal.session.person.name}'s agent session 'Build the bulletin board' can no longer use ` +
          'default-chat, default-chat-reasoning and default-embed, because the project is now confidential; ' +
          'it keeps default-chat-onprem, default-chat-onprem-reasoning and default-chat-large.',
      )
      expect(JSON.stringify(narrowed)).not.toContain(internal.key)
      expect(JSON.stringify(narrowed)).not.toContain('hash-of-')
      expect(await endedEvents(ctx)).toEqual([])
    })
  })

  it('a session left with nothing it may use is ENDED models_withdrawn, as before — its key revoked, never narrowed to nothing', async () => {
    await withBuilderServer(
      'capable',
      async (ctx, lite) => {
        const internal = (
          await start(ctx, { cookies: ctx.ownerCookies })
        ).json() as Started
        // Derived: the three `internal` entries of `infra/litellm/config.yaml`, in its order — and none is
        // approved for `confidential` data, and there is no capable model to keep.
        expect(internal.session.models).toEqual([
          'default-chat',
          'default-chat-reasoning',
          'default-embed',
        ])

        await commitFile(
          ctx,
          ctx.commitSha,
          'manifest.yaml',
          await manifestWith(ctx, 'data:', '  classification: confidential'),
        )

        // Revoked at the GATEWAY by its alias, for every model — never a key narrowed to an empty list,
        // which LiteLLM would read as EVERY model (`[M7]`).
        expect(gatewayCalls(lite, '/key/update')).toHaveLength(0)
        expect(gatewayCalls(lite, '/key/delete')).toHaveLength(1)
        expect(lite.use(internal.key, 'default-chat')).toEqual({
          status: 401,
          type: 'token_not_found_in_db',
        })
        expect((await sessionsById(ctx)).get(internal.session.id)).toMatchObject({
          state: 'ended',
          endReason: 'models_withdrawn',
        })
        const [ended] = await endedEvents(ctx)
        expect(ended?.machineDetail).toMatchObject({
          sessionId: internal.session.id,
          reason: 'models_withdrawn',
        })
        expect(ended?.humanMessage).toMatch(/no longer allows any of the models it held/)
        expect(await narrowedEvents(ctx)).toEqual([])
      },
      await internalOnlyCatalogue(),
    )
  })

  it('a session whose only models the project still allows are no longer served is ended, not narrowed to names nothing answers', async () => {
    await withBuilderServer('capable', async (ctx, lite) => {
      const internal = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      expect(internal.session.models).toEqual(INTERNAL_SESSION)
      // The raise, recorded without the commit's own sweep, so the sweep below is the only one.
      await ctx.db.insert(appSpecs).values({
        projectId: ctx.projectId,
        commitSha: ctx.commitSha,
        parsed: { data: { classification: 'confidential' } },
        schemaVersion: 1,
        valid: true,
        createdAt: new Date(Date.now() + 1000),
      })
      // The gateway now serves `default-chat` alone: it is withdrawn, and every name the session would keep
      // is one nothing answers under — so nothing it may use is left.
      const served = (await declaredCatalogue().get()).models.filter(
        (m) => m.name === 'default-chat',
      )
      const shrunk: ModelCatalogue = {
        enabled: true,
        get: async () => ({ models: served, unclassified: [] }),
      }
      expect(await sweep(ctx, lite, { catalogue: shrunk })).toEqual({
        ended: [internal.session.id],
        narrowed: [],
        failed: [],
      })
      expect(gatewayCalls(lite, '/key/update')).toHaveLength(0)
      expect((await sessionsById(ctx)).get(internal.session.id)).toMatchObject({
        state: 'ended',
        endReason: 'models_withdrawn',
      })
    })
  })

  it('keeps a session its project still allows: one started confidential outlives a later confidential commit, while the internal one beside it is narrowed', async () => {
    await withBuilderServer('capable', async (ctx, lite) => {
      // The positive control, in the same test: a session started while the project was internal.
      const internal = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      const head = await commitFile(
        ctx,
        ctx.commitSha,
        'manifest.yaml',
        await manifestWith(ctx, 'data:', '  classification: confidential'),
      )
      const confidential = (
        await start(ctx, { cookies: ctx.ownerCookies })
      ).json() as Started
      expect(confidential.session.models).toEqual([
        'default-chat-onprem',
        'default-chat-onprem-reasoning',
        'default-chat-large',
      ])
      await commitFile(ctx, head, 'notes.md', 'still confidential\n')
      const byId = await sessionsById(ctx)
      expect(byId.get(confidential.session.id)).toMatchObject({
        state: 'active',
        endReason: null,
        models: confidential.session.models,
      })
      expect(byId.get(internal.session.id)).toMatchObject({
        state: 'active',
        endReason: null,
        models: CONFIDENTIAL_KEEPS,
      })
      expect(lite.use(confidential.key, 'default-chat-large')).toEqual({ status: 200 })
      // ONE narrowing, the raise's: the second commit's sweep found nothing either session may not hold.
      expect(gatewayCalls(lite, '/key/update').map((c) => c.body?.key_alias)).toEqual([
        `mf-agent-${internal.session.id}`,
      ])
      expect(
        (await narrowedEvents(ctx)).map(
          (e) => (e.machineDetail as { sessionId: string }).sessionId,
        ),
      ).toEqual([internal.session.id])
      expect(await endedEvents(ctx)).toEqual([])
    })
  })

  it('the capable model builds a confidential app and never becomes its own AI: validation still refuses it in ai.models', async () => {
    await withBuilderServer('capable', async (ctx) => {
      const commit = async (model: string) =>
        ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/commits`,
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
          payload: {
            baseCommit: ctx.commitSha,
            message: `ai.models: ${model}`,
            changes: [
              {
                op: 'write',
                path: 'manifest.yaml',
                content: await manifestWith(
                  ctx,
                  'ai:',
                  `  models: [${model}]`,
                  '  budget:',
                  '    project_monthly_usd: 10',
                  'data:',
                  '  classification: confidential',
                ),
              },
            ],
          },
        })
      // The builder may call it (the setting is `capable`) — the app may not (§7: D17 for `ai.models`).
      expect(refusal(await commit('default-chat-large'))).toEqual({
        status: 422,
        code: 'SPEC_INVALID',
      })
      // The positive control: the same manifest naming the on-premise model is accepted.
      const accepted = await commit('default-chat-onprem')
      expect(accepted.statusCode, accepted.body).toBe(201)
    })
  })

  it('a commit that leaves the classification as it was narrows nothing — and the raise that follows does', async () => {
    await withBuilderServer('capable', async (ctx, lite) => {
      const internal = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      const head = await commitFile(ctx, ctx.commitSha, 'notes.md', 'no change of data\n')
      expect((await sessionsById(ctx)).get(internal.session.id)).toMatchObject({
        state: 'active',
        models: INTERNAL_SESSION,
      })
      expect(gatewayCalls(lite, '/key/update')).toHaveLength(0)
      // The positive control, in the same test: the same session, the raise.
      await commitFile(
        ctx,
        head,
        'manifest.yaml',
        await manifestWith(ctx, 'data:', '  classification: confidential'),
      )
      expect((await sessionsById(ctx)).get(internal.session.id)).toMatchObject({
        state: 'active',
        models: CONFIDENTIAL_KEEPS,
      })
      expect(gatewayCalls(lite, '/key/update')).toHaveLength(1)
    })
  })

  it('the boot’s sweep narrows a confidential session holding the capable model once the setting is on-premise — and keeps it whole under capable', async () => {
    await withBuilderServer('capable', async (ctx, lite) => {
      await commitFile(
        ctx,
        ctx.commitSha,
        'manifest.yaml',
        await manifestWith(ctx, 'data:', '  classification: confidential'),
      )
      const held = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      expect(held.session.models).toEqual(CONFIDENTIAL_KEEPS)
      // The setting unchanged: nothing is held beyond what it allows.
      expect(await sweep(ctx, lite, { builderModels: 'capable' })).toEqual({
        ended: [],
        narrowed: [],
        failed: [],
      })
      expect(lite.use(held.key, 'default-chat-large')).toEqual({ status: 200 })
      // The setting narrowed, as a restart with MANIFEST_AGENT_BUILDER_MODELS=on-premise does: the capable
      // model goes, and the on-premise ones stay.
      expect(await sweep(ctx, lite, { builderModels: 'on-premise' })).toEqual({
        ended: [],
        narrowed: [held.session.id],
        failed: [],
      })
      expect(lite.use(held.key, 'default-chat-large')).toEqual({
        status: 403,
        type: 'key_model_access_denied',
      })
      expect(lite.use(held.key, 'default-chat-onprem')).toEqual({ status: 200 })
      expect((await sessionsById(ctx)).get(held.session.id)).toMatchObject({
        state: 'active',
        endReason: null,
        models: ['default-chat-onprem', 'default-chat-onprem-reasoning'],
      })
      // Its sentence names the SETTING as the cause — the project's classification did not change.
      const [narrowed] = await narrowedEvents(ctx)
      expect(narrowed?.machineDetail).toMatchObject({ withdrawn: ['default-chat-large'] })
      expect(narrowed?.humanMessage).toBe(
        `${held.session.person.name}'s agent session 'Build the bulletin board' can no longer use ` +
          'default-chat-large, because the platform now keeps a confidential project’s building agent ' +
          'on-premise; it keeps default-chat-onprem and default-chat-onprem-reasoning.',
      )
    })
  })

  it(
    'a raise recorded while a session waits to start is the one its key is given',
    { timeout: 30_000 },
    async () => {
      await withBuilderServer('capable', async (ctx, lite) => {
        // The start reads the classification early, then waits on the gateway for the person's month —
        // long enough here that the whole commit, validation included, lands in that window. The key
        // must carry what the NEW classification allows: the read under the project is what mints.
        lite.slow('/user/info', 6_000)
        const starting = start(ctx, { cookies: ctx.ownerCookies })
        // The start is INSIDE its spend read — past its early classification read — once the fake
        // has recorded the call (it records, then waits): never a sleep, which a loaded machine outruns.
        await until(
          () => lite.calls.some((c) => c.path === '/user/info'),
          'the spend read',
        )
        await commitFile(
          ctx,
          ctx.commitSha,
          'manifest.yaml',
          await manifestWith(ctx, 'data:', '  classification: confidential'),
        )
        const res = await starting
        expect(res.statusCode, res.body).toBe(201)
        const started = res.json() as Started
        expect(started.session.models).toEqual([
          'default-chat-onprem',
          'default-chat-onprem-reasoning',
          'default-chat-large',
        ])
        expect(keyGenerations(lite).at(-1)?.body?.models).toEqual(started.session.models)
      })
    },
  )

  it(
    'a session whose key is being minted when the raise is recorded is narrowed by it before the commit answers',
    { timeout: 30_000 },
    async () => {
      await withBuilderServer('capable', async (ctx, lite) => {
        // The other order: the start is INSIDE its transaction — the project held, the old models read —
        // when the manifest is recorded. The barrier waits for it to commit; the sweep then narrows it.
        lite.slow('/key/generate', 6_000)
        const starting = start(ctx, { cookies: ctx.ownerCookies })
        // Inside the mint, so inside the transaction holding the project FOR SHARE (the review's M6).
        await until(() => keyGenerations(lite).length > 0, 'the mint')
        await commitFile(
          ctx,
          ctx.commitSha,
          'manifest.yaml',
          await manifestWith(ctx, 'data:', '  classification: confidential'),
        )
        const started = (await starting).json() as Started
        expect(started.session.models).toEqual(INTERNAL_SESSION)
        expect((await sessionsById(ctx)).get(started.session.id)).toMatchObject({
          state: 'active',
          models: CONFIDENTIAL_KEEPS,
        })
        expect(lite.use(started.key, 'default-chat')).toEqual({
          status: 403,
          type: 'key_model_access_denied',
        })
        expect(lite.use(started.key, 'default-chat-onprem')).toEqual({ status: 200 })
      })
    },
  )

  it('a gateway failure while narrowing leaves the session live and its row unchanged, the commit still lands, and the sweep says so — and the next sweep narrows it', async () => {
    await withBuilderServer('capable', async (ctx, lite) => {
      const internal = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        lite.fail('/key/update', 500, 1)
        // `commitFile` asserts the 201: the commit lands whatever the gateway answered.
        await commitFile(
          ctx,
          ctx.commitSha,
          'manifest.yaml',
          await manifestWith(ctx, 'data:', '  classification: confidential'),
        )
        // …and the sweep SAYS so: in its answer, from a second failure —
        lite.fail('/key/update', 500, 1)
        expect(await sweep(ctx, lite)).toEqual({
          ended: [],
          narrowed: [],
          failed: [internal.session.id],
        })
        // — and in an operator line naming the session and what its key may still hold, never the key.
        const lines = logged.mock.calls.map((call) => call.map(String).join(' '))
        expect(
          lines.some(
            (line) =>
              line.includes(internal.session.id) &&
              line.includes('default-chat, default-chat-reasoning and default-embed'),
          ),
          lines.join('\n'),
        ).toBe(true)
        expect(lines.join('\n')).not.toContain(internal.key)
        expect(lines.join('\n')).not.toContain('hash-of-')
      } finally {
        logged.mockRestore()
      }
      // LEFT LIVE, ITS ROW UNCHANGED, nothing published — and the key truly still holds what the row says.
      expect((await sessionsById(ctx)).get(internal.session.id)).toMatchObject({
        state: 'active',
        endReason: null,
        models: INTERNAL_SESSION,
      })
      expect(await narrowedEvents(ctx)).toEqual([])
      expect(await endedEvents(ctx)).toEqual([])
      expect(lite.use(internal.key, 'default-chat')).toEqual({ status: 200 })

      // The positive control, in the same test: the gateway answers, and the next sweep narrows it.
      expect(await sweep(ctx, lite)).toEqual({
        ended: [],
        narrowed: [internal.session.id],
        failed: [],
      })
      expect((await sessionsById(ctx)).get(internal.session.id)).toMatchObject({
        state: 'active',
        models: CONFIDENTIAL_KEEPS,
      })
      expect(lite.use(internal.key, 'default-chat')).toEqual({
        status: 403,
        type: 'key_model_access_denied',
      })
      expect(await narrowedEvents(ctx)).toHaveLength(1)
    })
  })

  it('a narrowing the gateway made but the database did not record is named with its cause, and the next sweep records it', async () => {
    await withBuilderServer('capable', async (ctx, lite) => {
      const internal = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      await ctx.db.insert(appSpecs).values({
        projectId: ctx.projectId,
        commitSha: ctx.commitSha,
        parsed: { data: { classification: 'confidential' } },
        schemaVersion: 1,
        valid: true,
        createdAt: new Date(Date.now() + 1000),
      })
      // The gateway narrows the key; the database then refuses the transaction that records it.
      const refusing = new Proxy(ctx.db, {
        get(target, name) {
          if (name === 'transaction')
            return () => {
              throw new Error('the database refused the record')
            }
          const value = Reflect.get(target, name, target) as unknown
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        expect(
          await narrowSessionsHoldingMore(
            {
              db: refusing,
              bus: ctx.deps.bus,
              llm: lite,
              catalogue: ctx.deps.catalogue,
              agent: ctx.deps.config.agent,
            },
            'every',
          ),
        ).toEqual({ ended: [], narrowed: [], failed: [internal.session.id] })
        const lines = logged.mock.calls.map((call) => call.map(String).join(' '))
        expect(
          lines.some(
            (line) =>
              line.includes(internal.session.id) &&
              line.includes('the database refused the record'),
          ),
          lines.join('\n'),
        ).toBe(true)
      } finally {
        logged.mockRestore()
      }
      // The key WAS narrowed; the row still says what it held — so the next sweep narrows again (the same
      // list, which the gateway takes as it took the first) and records it.
      expect(lite.use(internal.key, 'default-chat')).toEqual({
        status: 403,
        type: 'key_model_access_denied',
      })
      expect((await sessionsById(ctx)).get(internal.session.id)).toMatchObject({
        models: INTERNAL_SESSION,
      })
      expect(await sweep(ctx, lite)).toEqual({
        ended: [],
        narrowed: [internal.session.id],
        failed: [],
      })
      expect(gatewayCalls(lite, '/key/update').map((c) => c.body?.models)).toEqual([
        CONFIDENTIAL_KEEPS,
        CONFIDENTIAL_KEEPS,
      ])
      expect((await sessionsById(ctx)).get(internal.session.id)).toMatchObject({
        state: 'active',
        models: CONFIDENTIAL_KEEPS,
      })
      expect(await narrowedEvents(ctx)).toHaveLength(1)
    })
  })

  it('a session ENDED while the sweep narrows it stays as it ended — no agent_session.narrowed is recorded after its end, while the same sweep narrows the session nobody ended (the final review’s Important 1)', async () => {
    // THE NARROWING'S ROW WRITE IS GUARDED BY `ended_at IS NULL` — and that guard is the only thing between
    // an end landing while the sweep waits on the gateway (a removal, Task 8, or a revoke) and an
    // `agent_session.narrowed` recorded for a session already ended. DETERMINISTIC: the gateway has
    // recorded and made the TA's `/key/update`, and its answer is HELD until the removal has answered — so
    // the removal ends the session after the sweep read it live and before the sweep writes its row. A
    // gate, never `slow()`'s margin: a whole removal request is not something a fixed delay can be
    // trusted to outrun on a loaded machine.
    await withBuilderServer('capable', async (ctx, lite) => {
      const taCookies = await sessionFor(ctx, 'bio_student', 'collaborator')
      const ta = await ensureTestUser(ctx.db, 'bio_student')
      const theirs = (await start(ctx, { cookies: taCookies })).json() as Started
      const mine = (await start(ctx, { cookies: ctx.ownerCookies })).json() as Started
      expect(theirs.session.models).toEqual(INTERNAL_SESSION)
      expect(mine.session.models).toEqual(INTERNAL_SESSION)
      // Raised to confidential by a recorded manifest — no commit, so no sweep but the one below.
      await ctx.db.insert(appSpecs).values({
        projectId: ctx.projectId,
        commitSha: ctx.commitSha,
        parsed: { data: { classification: 'confidential' } },
        schemaVersion: 1,
        valid: true,
        createdAt: new Date(Date.now() + 1000),
      })
      const gate = holdingAnswer(lite, '/key/update', `mf-agent-${theirs.session.id}`)
      const sweeping = narrowSessionsHoldingMore(
        {
          db: ctx.db,
          bus: ctx.deps.bus,
          llm: gate.llm,
          catalogue: ctx.deps.catalogue,
          agent: ctx.deps.config.agent,
        },
        'every',
      )
      await until(
        () => gate.answered(),
        'the gateway narrowing the TA’s key, its answer held',
      )
      const removed = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/projects/${ctx.projectId}/members/${ta.id}`,
        cookies: ctx.ownerSteppedUp,
        headers: mutationHeaders(ctx.deps),
      })
      expect(removed.statusCode, removed.body).toBe(200)
      gate.release()
      const swept = await sweeping

      // NOTHING RECORDED AFTER THE END: no `agent_session.narrowed` names the ended session…
      expect(
        (await narrowedEvents(ctx)).filter(
          (e) => e.subject === `agent_session:${theirs.session.id}`,
        ),
      ).toEqual([])
      // …and the sweep claims neither a narrowing nor a failure for it. THE POSITIVE CONTROL, in the same
      // sweep: the session nobody ended IS narrowed, and recorded.
      expect(swept).toEqual({ ended: [], narrowed: [mine.session.id], failed: [] })
      expect((await narrowedEvents(ctx)).map((e) => e.subject)).toEqual([
        `agent_session:${mine.session.id}`,
      ])
      // The ended row is as the removal left it — its reason, and the models it held when it ended.
      const after = await sessionsById(ctx)
      expect(after.get(theirs.session.id)).toMatchObject({
        state: 'ended',
        endReason: 'member_removed',
        models: INTERNAL_SESSION,
      })
      expect(after.get(mine.session.id)).toMatchObject({
        state: 'active',
        endReason: null,
        models: CONFIDENTIAL_KEEPS,
      })
      expect(lite.use(theirs.key, 'default-chat-onprem')).toEqual({
        status: 401,
        type: 'token_not_found_in_db',
      })
    })
  })

  it('a session whose key was revoked but whose end could not be recorded is named with its cause — never as still holding its models (the review’s M3)', async () => {
    // A catalogue with nothing approved for `confidential`, so the raise ENDS this session (Task 7).
    const catalogue = await internalOnlyCatalogue()
    await withBuilderServer(
      'capable',
      async (ctx, lite) => {
        const internal = (
          await start(ctx, { cookies: ctx.ownerCookies })
        ).json() as Started
        await ctx.db.insert(appSpecs).values({
          projectId: ctx.projectId,
          commitSha: ctx.commitSha,
          parsed: { data: { classification: 'confidential' } },
          schemaVersion: 1,
          valid: true,
          createdAt: new Date(Date.now() + 1000),
        })
        // The gateway revokes the key; the database then refuses the row's stamp.
        const refusing = new Proxy(ctx.db, {
          get(target, name) {
            if (name === 'update')
              return () => {
                throw new Error('the database refused the stamp')
              }
            const value = Reflect.get(target, name, target) as unknown
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        try {
          expect(
            await narrowSessionsHoldingMore(
              {
                db: refusing,
                bus: ctx.deps.bus,
                llm: lite,
                catalogue: ctx.deps.catalogue,
                agent: ctx.deps.config.agent,
              },
              'every',
            ),
          ).toEqual({ ended: [], narrowed: [], failed: [internal.session.id] })
          const lines = logged.mock.calls.map((call) => call.map(String).join(' '))
          // Its own line, with the cause.
          expect(
            lines.some(
              (line) =>
                line.includes(internal.session.id) &&
                line.includes('the database refused the stamp'),
            ),
            lines.join('\n'),
          ).toBe(true)
          // And no line claims a key is still live that the gateway has revoked.
          expect(lines.join('\n')).not.toMatch(/STILL hold/)
          expect(lines.join('\n')).not.toMatch(/may still hold/)
        } finally {
          logged.mockRestore()
        }
        expect(lite.use(internal.key, 'default-chat')).toEqual({
          status: 401,
          type: 'token_not_found_in_db',
        })
      },
      catalogue,
    )
  })

  it('a production deploy that raises the classification narrows the sessions holding what it no longer allows, before it answers (the review’s I2)', async () => {
    await resetDatabase()
    const lite = fakeLiteLlm()
    const slug = 'fe36-launch'
    const ctx = await approvedProject(slug, {
      classification: 'confidential',
      overrides: { llm: lite, catalogue: await capableCatalogue() },
    })
    try {
      // `main` LOWERED after the confidential release was built — a commit a building agent's own
      // token may make (D9 binds only at a production deploy). Production serves nothing yet, so
      // the project's floor is `internal`, and a session started now holds `default-chat`.
      await writeFiles(
        ctx.deps.source,
        ctx.deps.source.repositoryFor(slug),
        {
          'manifest.yaml': [
            'manifest: 1',
            `name: ${slug}`,
            'blueprint: fixture-node@1',
            'runtime:',
            '  port: 3000',
            '  health: /healthz',
            '',
          ].join('\n'),
        },
        'the data is internal after all',
      )
      const lowered = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.project.id}/spec`,
        payload: {},
        cookies: ctx.cookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(lowered.json().valid, lowered.body).toBe(true)
      const started = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.project.id}/agent-sessions`,
        payload: { name: 'before the launch' },
        cookies: ctx.cookies,
        headers: { ...mutationHeaders(ctx.deps), 'idempotency-key': randomUUID() },
      })
      expect(started.statusCode, started.body).toBe(201)
      const { session, key } = started.json() as Started
      expect(session.models).toEqual(INTERNAL_SESSION)
      expect(lite.use(key, 'default-chat')).toEqual({ status: 200 })

      // The launch: production now serves the CONFIDENTIAL release, so the floor rises.
      const launched = await ctx.app.inject({
        method: 'POST',
        url: `/v1/environments/${ctx.production.id}/deploy`,
        payload: { releaseId: ctx.release.id },
        cookies: await loginAs(ctx.deps, 'bio_prof', { steppedUp: true }),
        headers: mutationHeaders(ctx.deps),
      })
      expect(launched.statusCode, launched.body).toBe(200)
      expect(launched.json().state).toBe('healthy')

      // Narrowed, not ended: the withdrawn model refused at the gateway, a kept one answered.
      expect(lite.use(key, 'default-chat')).toEqual({
        status: 403,
        type: 'key_model_access_denied',
      })
      expect(lite.use(key, 'default-chat-onprem')).toEqual({ status: 200 })
      const [row] = await ctx.deps.db
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.id, session.id))
      expect(row).toMatchObject({
        endedAt: null,
        endReason: null,
        models: CONFIDENTIAL_KEEPS,
      })
    } finally {
      await ctx.deps.builds.idle()
      await ctx.app.close()
      await resetDatabase()
    }
  })

  /**
   * THE OTHER PRODUCTION CALLER OF `deployRelease` (the whole-branch review's I2): D21's rehearsal
   * deploys the candidate into production itself, and a rehearsal's instance is what production reads
   * as its instance — serving while its sign-in runs, `gone` after its take-down (the launch path plan's
   * Task 6c), which `servingInstanceOf` still falls back to — so it floors the classification exactly as
   * a launch does. Were production's instance ever read as `null` once `gone`, this would go red. A CWL app, because
   * only one is rehearsed: over `cwlFakes`, the unit tier's two labelled fakes, and for their reason.
   */
  it('a rehearsal that deploys a confidential release into production narrows the sessions holding what it no longer allows, before it answers (the whole-branch review’s I2)', async () => {
    await resetDatabase()
    const lite = fakeLiteLlm()
    const base = await testDeps()
    const deps: ServerDeps = {
      ...base,
      ...cwlFakes(base),
      llm: lite,
      catalogue: await capableCatalogue(),
    }
    const app = await buildServer(deps)
    const slug = 'fe36-rehearse'
    try {
      const cookies = await loginAs(deps, 'bio_prof')
      const created = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: projectBody(slug, { blueprint: 'node-ts-mongo@1' }),
        cookies,
        headers: mutationHeaders(deps),
      })
      expect(created.statusCode, created.body).toBe(201)
      const project = created.json() as {
        id: string
        slug: string
        environments: { id: string; kind: string }[]
      }
      const ctx = { app, deps, cookies, project }
      const call = async (url: string, payload: Record<string, unknown>) =>
        app.inject({
          method: 'POST',
          url,
          payload,
          cookies,
          headers: mutationHeaders(deps),
        })
      // R1: a CONFIDENTIAL release, serving staging — the rehearsal's candidate.
      await commitManifest(
        ctx,
        cwlManifest(slug, CWL_LAUNCH_ATTRIBUTES, [
          'data:',
          '  classification: confidential',
        ]),
        'feat: confidential, signing in with CWL',
      )
      const build = await call(`/v1/projects/${project.id}/builds`, {})
      expect(build.statusCode, build.body).toBe(202)
      await deps.builds.idle()
      const release = await call(`/v1/projects/${project.id}/releases`, {
        buildId: (build.json() as { id: string }).id,
      })
      expect(release.statusCode, release.body).toBe(201)
      const staging = project.environments.find((e) => e.kind === 'staging')!
      const staged = await call(`/v1/environments/${staging.id}/deploy`, {
        releaseId: (release.json() as { id: string }).id,
      })
      expect(staged.json().state, staged.body).toBe('healthy')
      // `main` LOWERED to internal — as in the launch case above. Production serves nothing, so the
      // floor is `internal`, and a session started now holds `default-chat`.
      await commitManifest(
        ctx,
        cwlManifest(slug, CWL_LAUNCH_ATTRIBUTES),
        'the data is internal after all',
      )
      const started = await app.inject({
        method: 'POST',
        url: `/v1/projects/${project.id}/agent-sessions`,
        payload: { name: 'before the rehearsal' },
        cookies,
        headers: { ...mutationHeaders(deps), 'idempotency-key': randomUUID() },
      })
      expect(started.statusCode, started.body).toBe(201)
      const { session, key } = started.json() as Started
      expect(session.models).toEqual(INTERNAL_SESSION)
      expect(lite.use(key, 'default-chat')).toEqual({ status: 200 })

      // The rehearsal: production now serves the CONFIDENTIAL release, so the floor rises.
      const rehearsed = await app.inject({
        method: 'POST',
        url: `/v1/projects/${project.id}/rehearsal`,
        cookies: await loginAs(deps, 'platform_admin', { steppedUp: true }),
        headers: mutationHeaders(deps),
      })
      expect(rehearsed.statusCode, rehearsed.body).toBe(200)
      // It really deployed into production and passed — the precondition, not the subject.
      expect(rehearsed.json()).toMatchObject({
        passed: true,
        evidence: { listener: 'public' },
      })

      // Narrowed, not ended: the withdrawn model refused at the gateway, a kept one answered.
      expect(lite.use(key, 'default-chat')).toEqual({
        status: 403,
        type: 'key_model_access_denied',
      })
      expect(lite.use(key, 'default-chat-onprem')).toEqual({ status: 200 })
      const [row] = await deps.db
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.id, session.id))
      expect(row).toMatchObject({
        endedAt: null,
        endReason: null,
        models: CONFIDENTIAL_KEEPS,
      })
    } finally {
      await deps.builds.idle()
      await app.close()
      await resetDatabase()
    }
  })
})

/**
 * FE-29 (the faculty-ready plan's Task 4; §20 as its Spec action 3 has it): A REFUSAL ABOUT A LIMIT
 * CARRIES THE LIMIT AS FIELDS, and one that names something already started carries its id — so a
 * client acts on fields rather than parsing a sentence.
 */
describe('an agent session refusal carries its facts as fields (FE-29)', () => {
  interface Facts {
    limit?: Record<string, unknown>
    session?: Record<string, unknown>
  }
  const factsOf = (res: { json: () => unknown }) => (res.json() as { error: Facts }).error

  it('AGENT_BUDGET_EXHAUSTED says the person’s month: the amount, and the reset the gateway reports', async () => {
    await withAgentServer(async (ctx, lite) => {
      expect((await start(ctx, { cookies: ctx.ownerCookies })).statusCode).toBe(201)
      lite.spend(`mf-person-${ctx.userId}`, ctx.deps.config.agent.monthlyUsd)
      const res = await start(ctx, { cookies: ctx.ownerCookies })
      expect(refusal(res)).toEqual({ status: 409, code: 'AGENT_BUDGET_EXHAUSTED' })
      const reported = (await personSpend(lite, ctx.userId)).resetsAt
      expect(reported).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000Z$/)
      expect(factsOf(res).limit).toEqual({
        scope: 'person',
        period: 'month',
        amountUsd: ctx.deps.config.agent.monthlyUsd,
        resetsAt: reported,
      })
    })
  })

  it('a reset the gateway does not report is null, never absent and never invented', async () => {
    await withAgentServer(async (ctx, lite) => {
      expect((await start(ctx, { cookies: ctx.ownerCookies })).statusCode).toBe(201)
      lite.withoutReset(`mf-person-${ctx.userId}`)
      lite.spend(`mf-person-${ctx.userId}`, ctx.deps.config.agent.monthlyUsd)
      const res = await start(ctx, { cookies: ctx.ownerCookies })
      expect(refusal(res)).toEqual({ status: 409, code: 'AGENT_BUDGET_EXHAUSTED' })
      const { limit } = factsOf(res)
      expect(limit).toHaveProperty('resetsAt', null)
      expect(limit).toMatchObject({ scope: 'person', period: 'month' })
    })
  })

  it('AGENT_SESSION_ALREADY_STARTED names the session the first start made', async () => {
    await withAgentServer(async (ctx) => {
      const idem = randomUUID()
      const first = await start(ctx, { cookies: ctx.ownerCookies }, undefined, idem)
      expect(first.statusCode, first.body).toBe(201)
      const again = await start(ctx, { cookies: ctx.ownerCookies }, undefined, idem)
      expect(refusal(again)).toEqual({
        status: 409,
        code: 'AGENT_SESSION_ALREADY_STARTED',
      })
      const { session } = first.json() as Started
      expect(factsOf(again).session).toEqual({ id: session.id, name: session.name })
    })
  })
})
