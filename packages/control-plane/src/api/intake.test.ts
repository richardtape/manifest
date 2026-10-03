import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { intakeSessions } from '../db/index.js'
import { declaredCatalogue, fakeLiteLlm, type FakeLiteLlm } from '../ai/testing.js'
import { disabledCatalogue, intakeSpend } from '../ai/index.js'
import { ensureTestUser, testSessionCookies } from '../identity/testing.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  mutationHeaders,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

const HOUR_MS = 3_600_000

interface Started {
  session: {
    id: string
    model: string
    capUsd: number
    expiresAt: string
    state: string
  }
  key: string
  baseUrl: string
}

function withIntakeServer(fn: (ctx: TestProject, lite: FakeLiteLlm) => Promise<void>) {
  const lite = fakeLiteLlm()
  return withProjectServer((ctx) => fn(ctx, lite), { llm: lite })
}

const start = (ctx: TestProject, cookies: Record<string, string>, key = randomUUID()) =>
  ctx.app.inject({
    method: 'POST',
    url: '/v1/intake-sessions',
    cookies,
    headers: { ...mutationHeaders(ctx.deps), 'idempotency-key': key },
  })

const mints = (lite: FakeLiteLlm) => lite.calls.filter((c) => c.path === '/key/generate')

/**
 * Midnight today in Vancouver, as an instant — computed by `Intl`, not by the SQL under test.
 * `longOffset` answers `GMT-07:00` (PDT) or `GMT-08:00` (PST).
 *
 * **AT MIDNIGHT'S OFFSET, NEVER NOW'S** (the whole-branch review's deferred triage): on the day the
 * clocks change, now's offset is an hour away from the one midnight had. Found by asking at the
 * instant now's offset puts midnight: within an hour of it, and on midnight's side of the change,
 * which Vancouver makes at 02:00.
 */
function vancouverMidnight(now = new Date()): number {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(
    now,
  )
  const offsetAt = (at: Date): string =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Vancouver',
      timeZoneName: 'longOffset',
    })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')!
      .value.replace('GMT', '')
  const near = new Date(`${date}T00:00:00${offsetAt(now)}`)
  return Date.parse(`${date}T00:00:00${offsetAt(near)}`)
}

describe('intake sessions (Spec action 5, FE-1)', () => {
  it('starts one for a signed-in person, on ONE model, paid by the PLATFORM — and answers the key once', async () => {
    await withIntakeServer(async (ctx, lite) => {
      const idem = randomUUID()
      const res = await start(ctx, ctx.ownerCookies, idem)
      expect(res.statusCode, res.body).toBe(201)
      const started = res.json() as Started
      expect(started.key).toMatch(/^sk-/)
      expect(started.baseUrl).toBe(ctx.deps.config.agent.llmUrl)
      expect(started.session).toMatchObject({
        model: 'default-chat',
        capUsd: 0.25,
        state: 'active',
      })
      expect(mints(lite).at(-1)?.body).toMatchObject({
        user_id: 'mf-platform-intake',
        key_alias: `mf-intake-${started.session.id}`,
        models: ['default-chat'],
        duration: '1800s',
        max_budget: 0.25,
      })
      // Never the person's month: no LiteLLM user of theirs exists.
      expect(lite.users.has(`mf-person-${ctx.userId}`)).toBe(false)
      expect(lite.use(started.key, 'default-chat')).toEqual({ status: 200 })
      expect(lite.use(started.key, 'default-chat-onprem')).toMatchObject({ status: 403 })

      const again = await start(ctx, ctx.ownerCookies, idem)
      expect(refusal(again)).toEqual({
        status: 409,
        code: 'INTAKE_SESSION_ALREADY_STARTED',
      })
      expect(again.body).toContain(started.session.id)
      expect(again.body).not.toContain('sk-')
      expect(mints(lite)).toHaveLength(1)
      // The row is the record — and it holds no key.
      const rows = await ctx.db.select().from(intakeSessions)
      expect(rows).toHaveLength(1)
      expect(rows[0]!.userId).toBe(ctx.userId)
      expect(JSON.stringify(rows)).not.toContain(started.key)
    })
  })

  it('refuses a delegated token outright — intake belongs to no project', async () => {
    await withIntakeServer(async (ctx, lite) => {
      const token = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['agent:session'],
      })
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/v1/intake-sessions',
        headers: {
          authorization: `Bearer ${token.plaintext}`,
          'idempotency-key': randomUUID(),
        },
      })
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
      expect(mints(lite)).toEqual([])
    })
  })

  it('never lets a key outlive the signed-in session that asked for it', async () => {
    await withIntakeServer(async (ctx, lite) => {
      const owner = await ensureTestUser(ctx.db, 'bio_prof')
      const cookies = testSessionCookies(
        owner,
        ctx.deps.config.sessionSecret,
        Date.now() - 12 * HOUR_MS + 5 * 60_000,
      )
      expect((await start(ctx, cookies)).statusCode).toBe(201)
      const seconds = Number(String(mints(lite).at(-1)?.body?.duration).replace(/s$/, ''))
      expect(seconds).toBeLessThanOrEqual(300)
      expect(seconds).toBeGreaterThan(290)
    })
  })

  /**
   * THE TEST'S OWN CLOCK, on the days Vancouver's changes (the whole-branch review's deferred triage):
   * the test below compares rows with `vancouverMidnight()`, and a midnight computed with NOW's offset
   * is an hour out for the rest of the day the clocks change — the test goes red every such day,
   * first on 2026-11-01. Asked of the helper, because the day the SQL counts is Postgres's `now()`,
   * which no fake timer reaches. An ordinary day is the positive control.
   */
  it('finds Vancouver’s midnight at MIDNIGHT’S offset, on the days the clocks change too', () => {
    // An ordinary day, PDT all day: 00:00 −07:00.
    expect(vancouverMidnight(new Date('2026-09-29T19:00:00Z'))).toBe(
      Date.parse('2026-09-29T07:00:00Z'),
    )
    // 2026-11-01: PDT until 02:00 local (09:00Z), so midnight was 00:00 −07:00 — asked at noon PST.
    expect(vancouverMidnight(new Date('2026-11-01T20:00:00Z'))).toBe(
      Date.parse('2026-11-01T07:00:00Z'),
    )
    // 2027-03-14: PST until 02:00 local (10:00Z), so midnight was 00:00 −08:00 — asked at noon PDT.
    expect(vancouverMidnight(new Date('2027-03-14T19:00:00Z'))).toBe(
      Date.parse('2027-03-14T08:00:00Z'),
    )
  })

  it('counts a person’s keys over a VANCOUVER day, and refuses one more with a code of its own', async () => {
    await withIntakeServer(async (ctx, lite) => {
      ctx.deps.config.intake.dailyKeys = 1
      const v0 = vancouverMidnight()
      const now = new Date()
      const u0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      const row = (at: number) => ({
        userId: ctx.userId,
        model: 'default-chat',
        capUsd: '0.25',
        expiresAt: new Date(at + 30 * 60_000),
        createdAt: new Date(at),
        endedAt: new Date(at + 60_000),
      })
      // Yesterday in Vancouver never counts, whatever UTC says.
      await ctx.db.insert(intakeSessions).values(row(v0 - 60_000))
      if (v0 < u0) {
        // A Vancouver evening: a row between Vancouver's midnight and UTC's is TODAY here and
        // yesterday in UTC — it counts, so the day is spent.
        await ctx.db.insert(intakeSessions).values(row(v0 + 60_000))
        expect(refusal(await start(ctx, ctx.ownerCookies))).toEqual({
          status: 409,
          code: 'INTAKE_DAILY_LIMIT_REACHED',
        })
        expect(mints(lite)).toEqual([])
      } else {
        // A Vancouver morning: a row between UTC's midnight and Vancouver's is today in UTC and
        // YESTERDAY here — it does not count, so today's one key is still there.
        await ctx.db.insert(intakeSessions).values(row(u0 + 60_000))
        expect((await start(ctx, ctx.ownerCookies)).statusCode).toBe(201)
        expect(refusal(await start(ctx, ctx.ownerCookies))).toEqual({
          status: 409,
          code: 'INTAKE_DAILY_LIMIT_REACHED',
        })
      }
      // Another person's day is their own — another instructor's, since only faculty start one.
      const colleague = await sessionFor(ctx, 'bio_colleague')
      expect((await start(ctx, colleague)).statusCode).toBe(201)
    })
  })

  it('lets two starts at once past a one-key day exactly once — the count and the row under one lock', async () => {
    await withIntakeServer(async (ctx, lite) => {
      ctx.deps.config.intake.dailyKeys = 1
      // The real gateway's mint takes ~100 ms, holding the first transaction open while the others
      // count — measured (sitting 7): with an instant fake the three ran one after another and the
      // lock's absence could not be seen.
      lite.slow('/key/generate', 100)
      const answers = await Promise.all([
        start(ctx, ctx.ownerCookies),
        start(ctx, ctx.ownerCookies),
        start(ctx, ctx.ownerCookies),
      ])
      expect(answers.map((a) => a.statusCode).sort()).toEqual([201, 409, 409])
      expect(mints(lite)).toHaveLength(1)
    })
  })

  it('caps a key at what remains of the platform’s month, and refuses a spent month', async () => {
    await withIntakeServer(async (ctx, lite) => {
      expect((await start(ctx, ctx.ownerCookies)).statusCode).toBe(201)
      lite.spend('mf-platform-intake', 49.9)
      const low = await start(ctx, ctx.ownerCookies)
      expect(low.statusCode, low.body).toBe(201)
      expect((low.json() as Started).session.capUsd).toBe(0.1)
      lite.spend('mf-platform-intake', 50)
      const minted = mints(lite).length
      expect(refusal(await start(ctx, ctx.ownerCookies))).toEqual({
        status: 409,
        code: 'INTAKE_BUDGET_EXHAUSTED',
      })
      expect(mints(lite)).toHaveLength(minted)
      // …and a person's own agent budget is never asked instead.
      expect(lite.users.has(`mf-person-${ctx.userId}`)).toBe(false)
    })
  })

  it('pauses intake when the setting names no model D17 allows for internal — never another model', async () => {
    await withIntakeServer(async (ctx, lite) => {
      ctx.deps.config.intake.model = 'no-such-model'
      expect(refusal(await start(ctx, ctx.ownerCookies))).toEqual({
        status: 503,
        code: 'INTAKE_MODEL_UNAVAILABLE',
      })
      expect(mints(lite)).toEqual([])
    })
    const catalogue = await declaredCatalogue().get()
    const lite = fakeLiteLlm()
    await withProjectServer(
      async (ctx) => {
        // The intake model LOWERED to `public` in the catalogue: checked at every mint.
        expect(refusal(await start(ctx, ctx.ownerCookies))).toEqual({
          status: 503,
          code: 'INTAKE_MODEL_UNAVAILABLE',
        })
        expect(mints(lite)).toEqual([])
      },
      {
        llm: lite,
        catalogue: {
          enabled: true,
          get: async () => ({
            models: catalogue.models.map((m) =>
              m.name === 'default-chat'
                ? { ...m, maxClassification: 'public' as const }
                : m,
            ),
            unclassified: [],
          }),
        },
      },
    )
  })

  it('refuses every start with AI switched off, naming the setting', async () => {
    await withProjectServer(
      async (ctx) => {
        expect(refusal(await start(ctx, ctx.ownerCookies))).toEqual({
          status: 503,
          code: 'AI_CATALOGUE_DISABLED',
        })
      },
      { catalogue: disabledCatalogue() },
    )
  })

  it('is ended by the person who started it, and by nobody else', async () => {
    await withIntakeServer(async (ctx, lite) => {
      const started = (await start(ctx, ctx.ownerCookies)).json() as Started
      const end = (cookies: Record<string, string>) =>
        ctx.app.inject({
          method: 'DELETE',
          url: `/v1/intake-sessions/${started.session.id}`,
          cookies,
          headers: mutationHeaders(ctx.deps),
        })
      const student = await sessionFor(ctx, 'bio_student')
      expect(refusal(await end(student))).toEqual({ status: 404, code: 'NOT_FOUND' })
      expect(lite.use(started.key, 'default-chat')).toEqual({ status: 200 })
      const ended = await end(ctx.ownerCookies)
      expect(ended.statusCode, ended.body).toBe(200)
      expect(ended.json()).toMatchObject({ id: started.session.id, state: 'ended' })
      expect(lite.use(started.key, 'default-chat')).toEqual({
        status: 401,
        type: 'token_not_found_in_db',
      })
      expect((await end(ctx.ownerCookies)).statusCode).toBe(200)
    })
  })

  it('a person who may not build is refused BUILDING_NOT_OPEN — nothing minted, nothing recorded, no day counted', async () => {
    // FE-39 (Spec action 7, Rich's): an intake session spends the platform's model money on
    // describing an app, so it is building, and only faculty or an administrator may start one.
    await withIntakeServer(async (ctx, lite) => {
      const student = await sessionFor(ctx, 'bio_student')
      const refused = await start(ctx, student)
      expect(refusal(refused)).toEqual({ status: 403, code: 'BUILDING_NOT_OPEN' })
      expect(mints(lite)).toEqual([])
      expect(await ctx.db.select().from(intakeSessions)).toEqual([])
      // The positive control: the faculty owner starts one through the same server.
      const started = await start(ctx, ctx.ownerCookies)
      expect(started.statusCode, started.body).toBe(201)
      expect(mints(lite)).toHaveLength(1)
    })
  })
})

/**
 * FE-29 (the faculty-ready plan's Task 4; §20 as its Spec action 3 has it): A REFUSAL ABOUT A LIMIT
 * CARRIES THE LIMIT AS FIELDS — whose, over what period, how much, and when it lifts — and one that
 * names something already started carries its id, so a client acts on fields, never a sentence.
 */
describe('an intake refusal carries its facts as fields (FE-29)', () => {
  interface Facts {
    limit?: Record<string, unknown>
    session?: Record<string, unknown>
  }
  const factsOf = (res: { json: () => unknown }) => (res.json() as { error: Facts }).error

  it('INTAKE_DAILY_LIMIT_REACHED says the count and when it lifts — the next midnight in Vancouver, by the database’s clock', async () => {
    await withIntakeServer(async (ctx) => {
      ctx.deps.config.intake.dailyKeys = 1
      expect((await start(ctx, ctx.ownerCookies)).statusCode).toBe(201)
      const res = await start(ctx, ctx.ownerCookies)
      expect(refusal(res)).toEqual({ status: 409, code: 'INTAKE_DAILY_LIMIT_REACHED' })
      const { limit } = factsOf(res)
      expect(limit).toEqual({
        scope: 'person',
        period: 'day',
        count: 1,
        resetsAt: expect.any(String),
      })
      // ONE clock decides both the count and the reset: the database's, in the zone the count uses.
      const { rows } = await ctx.db.execute<{ next: Date | string }>(
        sql`select (date_trunc('day', now() at time zone 'America/Vancouver') + interval '1 day') at time zone 'America/Vancouver' as next`,
      )
      expect(new Date(limit!.resetsAt as string).toISOString()).toBe(
        new Date(rows[0]!.next).toISOString(),
      )
    })
  })

  it('INTAKE_BUDGET_EXHAUSTED says the platform’s month: the amount, and the reset the gateway reports', async () => {
    await withIntakeServer(async (ctx, lite) => {
      expect((await start(ctx, ctx.ownerCookies)).statusCode).toBe(201)
      lite.spend('mf-platform-intake', ctx.deps.config.intake.monthlyUsd)
      const res = await start(ctx, ctx.ownerCookies)
      expect(refusal(res)).toEqual({ status: 409, code: 'INTAKE_BUDGET_EXHAUSTED' })
      const reported = (await intakeSpend(lite)).resetsAt
      expect(reported).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000Z$/)
      expect(factsOf(res).limit).toEqual({
        scope: 'platform',
        period: 'month',
        amountUsd: ctx.deps.config.intake.monthlyUsd,
        resetsAt: reported,
      })
    })
  })

  it('INTAKE_SESSION_ALREADY_STARTED names the session it started — an intake session has no name', async () => {
    await withIntakeServer(async (ctx) => {
      const idem = randomUUID()
      const first = await start(ctx, ctx.ownerCookies, idem)
      expect(first.statusCode, first.body).toBe(201)
      const again = await start(ctx, ctx.ownerCookies, idem)
      expect(refusal(again)).toEqual({
        status: 409,
        code: 'INTAKE_SESSION_ALREADY_STARTED',
      })
      expect(factsOf(again).session).toEqual({
        id: (first.json() as Started).session.id,
        name: null,
      })
    })
  })
})
