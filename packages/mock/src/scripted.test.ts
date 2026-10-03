import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import * as f from './fixtures.js'
import { createMockServer, type MockOptions } from './server.js'

/**
 * WHAT A FRONT-END BUILT AGAINST THE MOCK MUST MEET (the front-end enablement plan's Task 13,
 * sitting 10): FE-26 — the mock trusts only the session it issued and refuses the credential an
 * operation's `security` does not list; FE-27 — it answers from its fixtures per what is asked,
 * `404` for an id it does not hold, and times counted from now; and the states Task 13 scripts
 * that the document's examples cannot — each refusal asserted by its CODE, with the positive half
 * in the same test (CLAUDE.md: a refusal that is unconditional refuses nothing in particular).
 */

const servers: Server[] = []
async function serve(options: MockOptions = {}): Promise<string> {
  const server = createMockServer({ scanSilenceMs: 50, ...options })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))))
})

const SESSION = { cookie: 'manifest_session=mock-session' }
const BEARER = { authorization: `Bearer ${f.MINTED_TOKEN.secret}` }
const codeOf = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code
const mutation = (headers: Record<string, string>) => ({
  ...headers,
  'content-type': 'application/json',
  'idempotency-key': crypto.randomUUID(),
})
const minutesFromNow = (iso: string) => (Date.parse(iso) - Date.now()) / 60_000
const UNKNOWN = '00000000-0000-4000-8000-00000000abcd'

let origin: string
beforeAll(async () => {
  origin = await serve()
})

describe('FE-26 — the mock trusts only what it issued, and what the operation takes', () => {
  it('refuses a session it never issued 401 UNAUTHENTICATED — invented or empty', async () => {
    for (const cookie of ['manifest_session=nonsense', 'manifest_session=']) {
      const refused = await fetch(`${origin}/v1/me`, { headers: { cookie } })
      expect(refused.status, cookie).toBe(401)
      expect(await codeOf(refused)).toBe('UNAUTHENTICATED')
    }
    // The positive half: the value its own sign-in sets.
    const login = await fetch(`${origin}/auth/login?returnTo=/`, { redirect: 'manual' })
    const issued = login.headers.get('set-cookie')!.split(';')[0]!
    const me = await fetch(`${origin}/v1/me`, { headers: { cookie: issued } })
    expect(me.status).toBe(200)
    expect(issued).toBe(SESSION.cookie)
  })

  it('refuses a Bearer on an operation whose security names the session alone 403 TOKEN_CREDENTIAL_REFUSED', async () => {
    const intake = (headers: Record<string, string>) =>
      fetch(`${origin}/v1/intake-sessions`, {
        method: 'POST',
        headers: mutation(headers),
      })
    const refused = await intake(BEARER)
    expect(refused.status).toBe(403)
    expect(await codeOf(refused)).toBe('TOKEN_CREDENTIAL_REFUSED')
    // The same request in a session is the platform's 201…
    expect((await intake(SESSION)).status).toBe(201)
    // …and a Bearer on an operation that takes either credential is answered.
    const project = await fetch(`${origin}/v1/projects/${f.PROJECT_ID}`, {
      headers: BEARER,
    })
    expect(project.status).toBe(200)
    // Every session-only read too: getMe names the session alone.
    const me = await fetch(`${origin}/v1/me`, { headers: BEARER })
    expect(await codeOf(me)).toBe('TOKEN_CREDENTIAL_REFUSED')
  })

  it('refuses the stream to a session it never issued, before the upgrade', async () => {
    const open = (cookie: string) =>
      new Promise<string>((resolve) => {
        const ws = new WebSocket(
          `${origin.replace('http', 'ws')}/v1/projects/${f.PROJECT_ID}/events`,
          { headers: { cookie } },
        )
        ws.on('open', () => {
          ws.close()
          resolve('open')
        })
        ws.on('unexpected-response', (_request, response) =>
          resolve(String(response.statusCode)),
        )
        ws.on('error', () => resolve('error'))
      })
    expect(await open('manifest_session=nonsense')).toBe('401')
    expect(await open(SESSION.cookie)).toBe('open')
  })

  it('starts from source: its start script builds nothing and serves', async () => {
    const pkg = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> }
    for (const name of ['dev', 'start']) {
      expect(pkg.scripts[name], name).not.toMatch(/\btsc\b|\bbuild\b|dist\//)
      expect(pkg.scripts[name], name).toMatch(/src\/main\.ts/)
    }
    // And it RUNS: the start script's own command, from the package directory, on a free port.
    const [command, ...args] = pkg.scripts.start!.split(' ')
    expect(command).toBe('node')
    const child = spawn(process.execPath, args, {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, MANIFEST_MOCK_PORT: '0' },
    })
    try {
      const served = await new Promise<string>((resolve, reject) => {
        let seen = ''
        child.stdout.on('data', (chunk: Buffer) => {
          seen += chunk.toString()
          const m = /manifest-mock on (http:\/\/127\.0\.0\.1:\d+)/.exec(seen)
          if (m !== null) resolve(m[1]!)
        })
        child.stderr.on('data', (chunk: Buffer) => (seen += chunk.toString()))
        child.on('exit', (code) => reject(new Error(`exited ${code}: ${seen}`)))
      })
      expect(served).not.toMatch(/:0$/)
      expect((await fetch(`${served}/v1/me`, { headers: SESSION })).status).toBe(200)
    } finally {
      child.kill()
    }
  })
})

describe('FE-27 — answers per what is asked, 404 for what it does not hold', () => {
  const get = (path: string, headers: Record<string, string> = SESSION) =>
    fetch(`${origin}${path}`, { headers })

  it('answers every id-named read 404 NOT_FOUND for an id it does not hold', async () => {
    for (const path of [
      `/v1/projects/${UNKNOWN}`,
      `/v1/environments/${UNKNOWN}/instances`,
      `/v1/instances/${UNKNOWN}/output`,
      `/v1/releases/${UNKNOWN}`,
      `/v1/builds/${UNKNOWN}`,
      `/v1/pending-actions/${UNKNOWN}`,
      `/v1/projects/${UNKNOWN}/agent-sessions`,
      `/v1/releases/${f.RELEASE_ID}/approval-previews/${UNKNOWN}`,
    ]) {
      const refused = await get(path)
      expect(refused.status, path).toBe(404)
      expect(await codeOf(refused), path).toBe('NOT_FOUND')
    }
    // The positive half: the ids it holds.
    for (const path of [
      `/v1/projects/${f.PROJECT_ID}`,
      `/v1/releases/${f.RELEASE_ID}`,
      `/v1/builds/${f.BUILD_ID}`,
      `/v1/pending-actions/${f.PENDING_ACTION_ID}`,
    ])
      expect((await get(path)).status, path).toBe(200)
  })

  it('answers each approval preview it holds as itself', async () => {
    for (const [id, fixture] of [
      [f.APPROVAL_PREVIEW_ID, f.APPROVAL_PREVIEW],
      [f.WITHHELD_PREVIEW_ID, f.WITHHELD_APPROVAL_PREVIEW],
      [f.UNAVAILABLE_PREVIEW_ID, f.UNAVAILABLE_APPROVAL_PREVIEW],
    ] as const) {
      const read = await get(`/v1/releases/${f.RELEASE_ID}/approval-previews/${id}`)
      expect(await read.json()).toEqual(fixture)
    }
  })

  it('lists each environment’s own instances, agreeing with the project', async () => {
    const list = async (id: string) =>
      (await (await get(`/v1/environments/${id}/instances`)).json()) as {
        environmentId: string
        instances: {
          id: string
          environmentId: string
          state: string
          serving: boolean
        }[]
      }
    const sandbox = await list(f.SANDBOX_ID)
    const staging = await list(f.STAGING_ID)
    const production = await list(f.PRODUCTION_ID)
    expect(sandbox.environmentId).toBe(f.SANDBOX_ID)
    expect(sandbox.instances.map((i) => [i.state, i.serving])).toEqual([
      ['healthy', true],
      ['failed', false],
    ])
    expect(staging.instances.map((i) => [i.id, i.serving])).toEqual([
      [f.INSTANCE_ID, true],
    ])
    expect(production.instances).toEqual([])
    for (const l of [sandbox, staging])
      expect(l.instances.every((i) => i.environmentId === l.environmentId)).toBe(true)
    // What the project says each hostname reaches is the serving instance of that list.
    const project = (await (
      await get(`/v1/projects/${f.PROJECT_ID}?expand=environments`)
    ).json()) as { environments: { id: string; instance: { id: string } | null }[] }
    const reached = Object.fromEntries(
      project.environments.map((e) => [e.id, e.instance?.id ?? null]),
    )
    expect(reached).toEqual({
      [f.SANDBOX_ID]: sandbox.instances.find((i) => i.serving)!.id,
      [f.STAGING_ID]: f.INSTANCE_ID,
      [f.PRODUCTION_ID]: null,
    })
  })

  it('deploys to the environment asked for', async () => {
    const deploy = async (environmentId: string) =>
      (await (
        await fetch(`${origin}/v1/environments/${environmentId}/deploy`, {
          method: 'POST',
          headers: mutation(SESSION),
          body: JSON.stringify({ releaseId: f.RELEASE_ID }),
        })
      ).json()) as { environmentId: string }
    expect((await deploy(f.SANDBOX_ID)).environmentId).toBe(f.SANDBOX_ID)
    expect((await deploy(f.STAGING_ID)).environmentId).toBe(f.STAGING_ID)
  })

  it('starts an agent session on the project asked, with the name asked, its key living from now', async () => {
    const start = (body: Record<string, unknown>, headers = SESSION) =>
      fetch(`${origin}/v1/projects/${f.PROJECT_ID}/agent-sessions`, {
        method: 'POST',
        headers: mutation(headers),
        body: JSON.stringify(body),
      })
    const started = await start({ name: 'Writing the plan' })
    expect(started.status).toBe(201)
    const { session, key } = (await started.json()) as {
      session: { projectId: string; name: string; expiresAt: string; via: unknown }
      key: string
    }
    expect(session).toMatchObject({
      projectId: f.PROJECT_ID,
      name: 'Writing the plan',
      via: null,
    })
    expect(key).toBe('sk-mock-not-a-real-key')
    expect(minutesFromNow(session.expiresAt)).toBeGreaterThan(59)
    expect(minutesFromNow(session.expiresAt)).toBeLessThanOrEqual(60)
    // A shorter life asked for is the life answered; a token's start names the token.
    const short = (await (
      await start({ name: 'quick', durationMinutes: 15 }, BEARER)
    ).json()) as {
      session: { expiresAt: string; via: { tokenId: string } | null }
    }
    expect(Math.round(minutesFromNow(short.session.expiresAt))).toBe(15)
    expect(short.session.via?.tokenId).toBe(f.TOKEN_ID)
    // On a project it does not hold: the platform's 404.
    const elsewhere = await fetch(`${origin}/v1/projects/${UNKNOWN}/agent-sessions`, {
      method: 'POST',
      headers: mutation(SESSION),
      body: JSON.stringify({ name: 'x' }),
    })
    expect(await codeOf(elsewhere)).toBe('NOT_FOUND')
  })

  it('never answers a started session’s key twice — the retry is told which session it started', async () => {
    const headers = mutation(SESSION)
    const start = () =>
      fetch(`${origin}/v1/projects/${f.PROJECT_ID}/agent-sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'once' }),
      })
    expect((await start()).status).toBe(201)
    const again = await start()
    expect(again.status).toBe(409)
    const text = await again.text()
    expect(JSON.parse(text).error.code).toBe('AGENT_SESSION_ALREADY_STARTED')
    expect(text).not.toContain('sk-mock-not-a-real-key')
    const intakeHeaders = mutation(SESSION)
    const intake = () =>
      fetch(`${origin}/v1/intake-sessions`, { method: 'POST', headers: intakeHeaders })
    expect((await intake()).status).toBe(201)
    const replay = await intake()
    expect(await codeOf(replay)).toBe('INTAKE_SESSION_ALREADY_STARTED')
  })

  it('lists and ends only the sessions it holds, as themselves', async () => {
    const listed = (await (
      await get(`/v1/projects/${f.PROJECT_ID}/agent-sessions`)
    ).json()) as {
      sessions: { id: string; projectId: string; state: string }[]
    }
    expect(listed.sessions.length).toBeGreaterThan(0)
    expect(listed.sessions.every((s) => s.projectId === f.PROJECT_ID)).toBe(true)
    const active = listed.sessions.find((s) => s.state === 'active')!
    const end = (path: string) =>
      fetch(`${origin}${path}`, { method: 'DELETE', headers: mutation(SESSION) })
    const ended = await end(`/v1/agent-sessions/${active.id}`)
    expect(await ended.json()).toMatchObject({
      id: active.id,
      state: 'ended',
      endReason: 'ended',
    })
    expect(await codeOf(await end(`/v1/agent-sessions/${UNKNOWN}`))).toBe('NOT_FOUND')
    const intake = await end(`/v1/intake-sessions/${f.INTAKE_SESSION_ID}`)
    expect(await intake.json()).toMatchObject({ id: f.INTAKE_SESSION_ID, state: 'ended' })
    expect(await codeOf(await end(`/v1/intake-sessions/${UNKNOWN}`))).toBe('NOT_FOUND')
  })

  it('counts an intake key’s life from now', async () => {
    const started = (await (
      await fetch(`${origin}/v1/intake-sessions`, {
        method: 'POST',
        headers: mutation(SESSION),
      })
    ).json()) as { session: { expiresAt: string; createdAt: string } }
    expect(Math.round(minutesFromNow(started.session.expiresAt))).toBe(30)
    expect(Math.abs(minutesFromNow(started.session.createdAt))).toBeLessThan(1)
  })
})

describe('Task 13 — the states the document’s examples cannot show', () => {
  const output = (id: string, query = '') =>
    fetch(`${origin}/v1/instances/${id}/output${query}`, { headers: SESSION })

  it('reads the sandbox instance’s output — a redacted line and a cut one — and refuses the rest by their codes', async () => {
    const read = await output(f.SANDBOX_INSTANCE_ID)
    expect(read.status).toBe(200)
    const body = (await read.json()) as {
      instanceId: string
      environmentKind: string
      lines: { text: string }[]
    }
    expect(body).toMatchObject({
      instanceId: f.SANDBOX_INSTANCE_ID,
      environmentKind: 'sandbox',
    })
    const texts = body.lines.map((l) => l.text)
    expect(texts.some((t) => t.includes('[REDACTED]'))).toBe(true)
    expect(texts.some((t) => /…\[cut: \d+ bytes\]$/.test(t))).toBe(true)
    // `lines` is honoured, the newest kept.
    const two = (await (await output(f.SANDBOX_INSTANCE_ID, '?lines=2')).json()) as {
      lines: { text: string }[]
    }
    expect(two.lines.map((l) => l.text)).toEqual(texts.slice(-2))
    for (const [id, status, code] of [
      [f.SANDBOX_FAILED_INSTANCE_ID, 409, 'INSTANCE_OUTPUT_UNAVAILABLE'],
      [f.INSTANCE_ID, 403, 'INSTANCE_OUTPUT_STAGING'],
      [UNKNOWN, 404, 'NOT_FOUND'],
    ] as const) {
      const refused = await output(id)
      expect(refused.status, id).toBe(status)
      expect(await codeOf(refused), id).toBe(code)
    }
  })

  it('refuses a token a confidential mock-app’s staging and production Incidents, and lists the confidential models, when scripted (Task 14a)', async () => {
    const incidents = (at: string, env: string, headers: Record<string, string>) =>
      fetch(`${at}/v1/environments/${env}/incidents`, { headers })
    // The positive control: mock-app as it always was — a token reads staging's Incident.
    const plain = await serve()
    const read = await incidents(plain, f.STAGING_ID, BEARER)
    expect(read.status).toBe(200)
    expect(((await read.json()) as { incidents: unknown[] }).incidents).toHaveLength(1)

    const confidential = await serve({ confidential: true })
    for (const env of [f.STAGING_ID, f.PRODUCTION_ID]) {
      const refused = await incidents(confidential, env, BEARER)
      expect(refused.status, env).toBe(403)
      expect(await codeOf(refused), env).toBe('INCIDENT_LOG_CONFIDENTIAL')
      // A person's session still reads it.
      expect((await incidents(confidential, env, SESSION)).status, env).toBe(200)
    }
    expect((await incidents(confidential, f.SANDBOX_ID, BEARER)).status).toBe(200)

    // The models a confidential project's agent session holds while its builder may use the capable model.
    const started = await fetch(
      `${confidential}/v1/projects/${f.PROJECT_ID}/agent-sessions`,
      {
        method: 'POST',
        headers: mutation(BEARER),
        body: JSON.stringify({ name: 'build it' }),
      },
    )
    expect(started.status).toBe(201)
    const models = [
      'default-chat-onprem',
      'default-chat-onprem-reasoning',
      'default-chat-large',
    ]
    expect(
      ((await started.json()) as { session: { models: string[] } }).session.models,
    ).toEqual(models)
    const listed = (await (
      await fetch(`${confidential}/v1/projects/${f.PROJECT_ID}/agent-sessions`, {
        headers: SESSION,
      })
    ).json()) as { sessions: { models: string[] }[] }
    expect(listed.sessions.map((s) => s.models)).toEqual([models, models])
  })

  it('answers the month’s budget from now, and a spent or unreadable month when scripted', async () => {
    const budget = async (at: string) =>
      (await (await fetch(`${at}/v1/agent-budget`, { headers: SESSION })).json()) as {
        monthlyUsd: number
        spentUsd: number | null
        remainingUsd: number | null
        resetsAt: string | null
        unavailable: string | null
      }
    const ok = await budget(origin)
    expect(ok.remainingUsd).toBeCloseTo(ok.monthlyUsd - ok.spentUsd!, 6)
    const now = new Date()
    expect(ok.resetsAt).toBe(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    )

    const spent = await serve({ agentBudget: 'exhausted' })
    expect((await budget(spent)).remainingUsd).toBe(0)
    const refused = await fetch(`${spent}/v1/projects/${f.PROJECT_ID}/agent-sessions`, {
      method: 'POST',
      headers: mutation(SESSION),
      body: JSON.stringify({ name: 'x' }),
    })
    expect(refused.status).toBe(409)
    expect(await codeOf(refused)).toBe('AGENT_BUDGET_EXHAUSTED')

    const unreadable = await serve({ agentBudget: 'unavailable' })
    const b = await budget(unreadable)
    expect(b).toMatchObject({ spentUsd: null, remainingUsd: null })
    expect(b.unavailable).toMatch(/gateway/)
    // The review's I2: the platform reads the month FRESH to start a session (`ai/sessions.ts`), so a
    // gateway that cannot say what was spent refuses the start `503 AI_BACKEND_UNAVAILABLE` — never a key.
    const start = await fetch(
      `${unreadable}/v1/projects/${f.PROJECT_ID}/agent-sessions`,
      {
        method: 'POST',
        headers: mutation(SESSION),
        body: JSON.stringify({ name: 'x' }),
      },
    )
    expect(start.status).toBe(503)
    expect(await codeOf(start)).toBe('AI_BACKEND_UNAVAILABLE')
    const listed = (await (
      await fetch(`${unreadable}/v1/projects/${f.PROJECT_ID}/agent-sessions`, {
        headers: SESSION,
      })
    ).json()) as {
      sessions: { spentUsd: number | null; spentUnavailable: string | null }[]
    }
    expect(
      listed.sessions.every((s) => s.spentUsd === null && s.spentUnavailable !== null),
    ).toBe(true)
  })

  it('says who may build — true by default; scripted false, it refuses creating, describing and adding by code', async () => {
    // FE-39: the platform answers `Me.mayBuild` and refuses the three operations; the mock plays
    // both answers, as `MANIFEST_MOCK_MAY_BUILD=0` (or `mayBuild: false`) says.
    const create = (at: string) =>
      fetch(`${at}/v1/projects`, {
        method: 'POST',
        headers: mutation(SESSION),
        body: JSON.stringify({
          slug: 'new-app',
          blueprint: 'node-ts-mongo@1',
          audience: { scale: 'solo', burst: 'steady' },
        }),
      })
    const describe_ = (at: string) =>
      fetch(`${at}/v1/intake-sessions`, { method: 'POST', headers: mutation(SESSION) })
    const add = (at: string) =>
      fetch(`${at}/v1/projects/${f.PROJECT_ID}/members`, {
        method: 'POST',
        headers: mutation(SESSION),
        body: JSON.stringify({ cwlLogin: 'student', role: 'collaborator' }),
      })
    const me = async (at: string) =>
      (
        (await (await fetch(`${at}/v1/me`, { headers: SESSION })).json()) as {
          mayBuild: boolean
        }
      ).mayBuild
    // The positive half, on the default server.
    expect(await me(origin)).toBe(true)
    expect((await create(origin)).status).toBe(201)
    expect((await describe_(origin)).status).toBe(201)
    expect((await add(origin)).status).toBe(201)

    const closed = await serve({ mayBuild: false })
    expect(await me(closed)).toBe(false)
    for (const [name, response, status, code] of [
      ['createProject', await create(closed), 403, 'BUILDING_NOT_OPEN'],
      ['startIntakeSession', await describe_(closed), 403, 'BUILDING_NOT_OPEN'],
      ['addMember', await add(closed), 409, 'MEMBER_MAY_NOT_BUILD'],
    ] as const) {
      expect(response.status, name).toBe(status)
      expect(await codeOf(response), name).toBe(code)
    }
  })

  it('carries a limit’s facts and a started session’s as fields, as the platform does (FE-29)', async () => {
    const errorOf = async (response: Response) =>
      ((await response.json()) as { error: Record<string, unknown> }).error
    const now = new Date()
    const nextMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString()
    const startAgent = (at: string, key = crypto.randomUUID()) =>
      fetch(`${at}/v1/projects/${f.PROJECT_ID}/agent-sessions`, {
        method: 'POST',
        headers: { ...mutation(SESSION), 'idempotency-key': key },
        body: JSON.stringify({ name: 'Build the bulletin board' }),
      })
    const startIntake = (at: string, key = crypto.randomUUID()) =>
      fetch(`${at}/v1/intake-sessions`, {
        method: 'POST',
        headers: { ...mutation(SESSION), 'idempotency-key': key },
      })

    expect(
      (await errorOf(await startAgent(await serve({ agentBudget: 'exhausted' })))).limit,
    ).toEqual({
      scope: 'person',
      period: 'month',
      amountUsd: 10,
      resetsAt: nextMonth,
    })
    expect(
      (await errorOf(await startIntake(await serve({ intake: 'budget-spent' })))).limit,
    ).toEqual({
      scope: 'platform',
      period: 'month',
      amountUsd: 25,
      resetsAt: nextMonth,
    })
    const day = (await errorOf(await startIntake(await serve({ intake: 'daily-limit' }))))
      .limit as { resetsAt: string }
    expect(day).toEqual({
      scope: 'person',
      period: 'day',
      count: 10,
      resetsAt: expect.any(String),
    })
    // The next midnight in Vancouver: 07:00 or 08:00 UTC, within the next day.
    const lifts = Date.parse(day.resetsAt)
    expect(
      new Date(lifts).getUTCHours() === 7 || new Date(lifts).getUTCHours() === 8,
    ).toBe(true)
    expect(lifts - Date.now()).toBeGreaterThan(0)
    expect(lifts - Date.now()).toBeLessThanOrEqual(25 * 3_600_000)

    const agentKey = crypto.randomUUID()
    const started = (await (await startAgent(origin, agentKey)).json()) as {
      session: { id: string; name: string }
    }
    const replayed = await startAgent(origin, agentKey)
    expect(replayed.status).toBe(409)
    expect((await errorOf(replayed)).session).toEqual({
      id: started.session.id,
      name: started.session.name,
    })
    const intakeKey = crypto.randomUUID()
    const intake = (await (await startIntake(origin, intakeKey)).json()) as {
      session: { id: string }
    }
    const again = await startIntake(origin, intakeKey)
    expect(again.status).toBe(409)
    expect((await errorOf(again)).session).toEqual({ id: intake.session.id, name: null })
  })

  it('pauses describing a new app when scripted: the day’s limit, or the platform’s month', async () => {
    for (const [intake, code] of [
      ['daily-limit', 'INTAKE_DAILY_LIMIT_REACHED'],
      ['budget-spent', 'INTAKE_BUDGET_EXHAUSTED'],
    ] as const) {
      const at = await serve({ intake })
      const refused = await fetch(`${at}/v1/intake-sessions`, {
        method: 'POST',
        headers: mutation(SESSION),
      })
      expect(refused.status, intake).toBe(409)
      expect(await codeOf(refused), intake).toBe(code)
    }
  })

  it('renames, archives, restores and deletes its own project — and refuses to delete a launched one', async () => {
    const change = async (method: string, path: string, body?: unknown, at = origin) =>
      fetch(`${at}/v1/projects/${f.PROJECT_ID}${path}`, {
        method,
        headers: mutation(SESSION),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    const renamed = (await (
      await change('PATCH', '', { name: 'CHEM 121 — Lab notebook' })
    ).json()) as {
      id: string
      slug: string
      name: string
    }
    expect(renamed).toMatchObject({
      id: f.PROJECT_ID,
      slug: f.PROJECT.slug,
      name: 'CHEM 121 — Lab notebook',
    })
    const archived = (await (await change('POST', '/archive', {})).json()) as {
      state: string
      archivedAt: string | null
    }
    expect(archived.state).toBe('archived')
    expect(archived.archivedAt).not.toBeNull()
    expect(
      ((await (await change('POST', '/restore', {})).json()) as { state: string }).state,
    ).toBe('active')
    const deleted = await change('DELETE', '')
    expect(deleted.status).toBe(200)
    expect(await deleted.json()).toMatchObject({
      id: f.PROJECT_ID,
      slug: f.PROJECT.slug,
      state: 'deleted',
    })

    const launched = await serve({ launched: true })
    const project = (await (
      await fetch(`${launched}/v1/projects/${f.PROJECT_ID}`, { headers: SESSION })
    ).json()) as { launchedAt: string | null }
    expect(project.launchedAt).not.toBeNull()
    const refused = await change('DELETE', '', undefined, launched)
    expect(refused.status).toBe(409)
    expect(await codeOf(refused)).toBe('PROJECT_LAUNCHED_NOT_DELETABLE')
  })

  it('answers a base64 read of its file as base64 of the same bytes', async () => {
    const tree = (await (
      await fetch(`${origin}/v1/projects/${f.PROJECT_ID}/tree`, { headers: SESSION })
    ).json()) as { commitSha: string }
    const read = async (encoding: string) =>
      (await (
        await fetch(
          `${origin}/v1/projects/${f.PROJECT_ID}/file?path=src/app.js&ref=${tree.commitSha}${encoding}`,
          { headers: SESSION },
        )
      ).json()) as { content: string; encoding: string; size: number }
    const text = await read('')
    const bytes = await read('&encoding=base64')
    expect(text.encoding).toBe('utf8')
    expect(bytes.encoding).toBe('base64')
    expect(Buffer.from(bytes.content, 'base64').toString('utf8')).toBe(text.content)
    expect(bytes.size).toBe(text.size)
  })
})

/**
 * THE LAUNCH PATH PLAN'S TASK 13: THE RECORDS, THE SIGN-OFF REQUEST, THE QUEUE, AND FE-40'S SWITCHES.
 * The mock keeps no state (P5c Decision 9), so each stage of UBC's order is an option, and every
 * draft and send is answered as the platform answers it FROM that stage — in its words and its
 * order of checks. Each refusal is asserted by its code, beside the success it is the other half of.
 */
describe('the launch path plan’s Task 13 — the records by stage, the sign-off request, the queue, FE-40', () => {
  type Registration = {
    state: string
    environment: string
    entityId: string
    acsUrl: string
    sloUrl: string
    certFingerprint: string | null
    submittedAt: string | null
    externalTicketRef: string | null
    package: {
      environment: string
      generatedAt: string
      entityId: string
      acsUrl: string
      sloUrl: string
      certificate: { fingerprint: string; pem: string }
      attributes: { name: string; unused: boolean }[]
      privacyAssessmentReference: string | null
      metadataXml: string
      warnings: string[]
    } | null
  }
  type Assessment = {
    state: string
    submittedAt: string | null
    externalTicketRef: string | null
    draft: {
      generatedAt: string
      project: { slug: string }
      sections: { id: string; gaps: string[] }[]
      text: string
    } | null
  }
  type Records = {
    iamRegistration: Registration | null
    stagingRegistration: Registration | null
    privacyAssessment: Assessment | null
  }
  const records = async (at: string) =>
    (await (
      await fetch(`${at}/v1/projects/${f.PROJECT_ID}/launch-records`, {
        headers: SESSION,
      })
    ).json()) as Records
  const readiness = async (at: string) =>
    (await (
      await fetch(`${at}/v1/projects/${f.PROJECT_ID}/launch-readiness`, {
        headers: SESSION,
      })
    ).json()) as {
      ready: boolean
      items: { id: string; state: string; why: string; since: string | null }[]
    }
  const item = async (at: string, id: string) =>
    (await readiness(at)).items.find((i) => i.id === id)!
  const post = (at: string, path: string, body?: unknown) =>
    fetch(`${at}${path}`, {
      method: 'POST',
      headers: mutation(SESSION),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const records_ = `/v1/projects/${f.PROJECT_ID}/launch-records`
  const draftIam = (at: string, env: string) =>
    post(at, `${records_}/iam-registration/${env}/draft`)
  const sendIam = (at: string, env: string, body: unknown = {}) =>
    post(at, `${records_}/iam-registration/${env}/submission`, body)
  const draftPia = (at: string) => post(at, `${records_}/privacy-assessment/draft`)
  const sendPia = (at: string, body: unknown = {}) =>
    post(at, `${records_}/privacy-assessment/submission`, body)
  const today = () =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Vancouver',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())

  it('carries what was sent by default — a real package for each registration and a real draft for the assessment — and refuses to draft or send them again', async () => {
    const r = await records(origin)
    for (const [record, environment] of [
      [r.stagingRegistration, 'staging'],
      [r.iamRegistration, 'production'],
    ] as const) {
      const sent = record!.package!
      expect(sent, environment).not.toBeNull()
      // A package names its own record: its environment, entity, ACS and SLO — the ACS the
      // platform derives, `/auth/ubcshib/callback`.
      expect(sent.environment).toBe(environment)
      expect(sent.entityId).toBe(record!.entityId)
      expect(sent.acsUrl).toBe(record!.acsUrl)
      expect(sent.acsUrl).toMatch(/\/auth\/ubcshib\/callback$/)
      expect(sent.sloUrl).toBe(record!.sloUrl)
      // UBC registered the certificate that was sent.
      expect(record!.certFingerprint).toBe(sent.certificate.fingerprint)
      expect(sent.certificate.pem).toMatch(/^-----BEGIN CERTIFICATE-----/)
      expect(sent.metadataXml).toContain(`entityID="${record!.entityId}"`)
      expect(sent.privacyAssessmentReference).toBe('PIA-2026-0088')
    }
    expect(r.privacyAssessment!.draft!.project.slug).toBe('mock-app')
    expect(r.privacyAssessment!.draft!.sections.map((s) => s.id)).toEqual([
      'collected',
      'stored',
      'flows',
      'retention',
      'accountable',
      'hosting',
    ])
    // A CERTIFICATE IS PUBLIC; A PRIVATE KEY IS NEVER IN AN ANSWER.
    expect(JSON.stringify(r)).not.toMatch(/PRIVATE KEY/)

    for (const [refused, code] of [
      [await draftIam(origin, 'staging'), 'LAUNCH_RECORD_SUBMITTED'],
      [await draftIam(origin, 'production'), 'LAUNCH_RECORD_SUBMITTED'],
      [await draftPia(origin), 'LAUNCH_RECORD_SUBMITTED'],
      [await sendPia(origin), 'LAUNCH_TRANSITION_INVALID'],
      [await sendIam(origin, 'staging'), 'LAUNCH_TRANSITION_INVALID'],
    ] as const) {
      expect(refused.status, code).toBe(409)
      expect(await codeOf(refused)).toBe(code)
    }
  })

  it('MANIFEST_MOCK_RECORDS=none — nothing recorded; a draft is made now; nothing can be sent before it', async () => {
    const at = await serve({ records: 'none' })
    expect(await records(at)).toMatchObject({
      iamRegistration: null,
      stagingRegistration: null,
      privacyAssessment: null,
    })
    expect((await item(at, 'privacy-assessment')).state).toBe('unmet')
    expect((await item(at, 'iam-registration')).state).toBe('unmet')

    for (const [refused, code] of [
      [await sendPia(at), 'LAUNCH_DRAFT_REQUIRED'],
      [await sendIam(at, 'staging'), 'LAUNCH_DRAFT_REQUIRED'],
    ] as const) {
      expect(refused.status, code).toBe(409)
      expect(await codeOf(refused)).toBe(code)
    }

    const pia = await draftPia(at)
    expect(pia.status).toBe(200)
    const drafted = (await pia.json()) as Assessment
    expect(drafted.state).toBe('draft')
    // Times from now: drafted within the last three days.
    const age = Date.now() - Date.parse(drafted.draft!.generatedAt)
    expect(age).toBeGreaterThan(0)
    expect(age).toBeLessThan(3 * 86_400_000)

    const production = await draftIam(at, 'production')
    expect(production.status).toBe(200)
    const registration = (await production.json()) as Registration
    expect(registration).toMatchObject({ state: 'draft', environment: 'production' })
    expect(registration.package!.environment).toBe('production')
    expect(registration.package!.entityId).toBe(registration.entityId)
  })

  it('MANIFEST_MOCK_RECORDS=drafted — all three drafted with their warnings; the assessment is sent as asked; a registration waits for it', async () => {
    const at = await serve({ records: 'drafted' })
    const r = await records(at)
    expect(r.privacyAssessment!.state).toBe('draft')
    const staging = r.stagingRegistration!
    expect(staging.state).toBe('draft')
    // An attribute the app asks for and never reads, and no PIA number yet: both said.
    expect(staging.package!.attributes.find((a) => a.name === 'givenName')!.unused).toBe(
      true,
    )
    expect(staging.package!.warnings.some((w) => w.includes('givenName'))).toBe(true)
    expect(staging.package!.warnings.some((w) => w.includes('PIA number'))).toBe(true)
    expect(staging.package!.privacyAssessmentReference).toBeNull()
    expect(r.iamRegistration!.state).toBe('draft')

    // A registration is sent only once the assessment is approved — the platform's first gate.
    const early = await sendIam(at, 'staging', {
      draftGeneratedAt: staging.package!.generatedAt,
    })
    expect(early.status).toBe(409)
    expect(await codeOf(early)).toBe('LAUNCH_PIA_NOT_APPROVED')

    const draftGeneratedAt = r.privacyAssessment!.draft!.generatedAt
    // A draft other than the one held, a day still to come: each refused by its code.
    const changed = await sendPia(at, { draftGeneratedAt: new Date().toISOString() })
    expect(changed.status).toBe(409)
    expect(await codeOf(changed)).toBe('LAUNCH_DRAFT_CHANGED')
    const future = await sendPia(at, { sentAt: '2999-01-01', draftGeneratedAt })
    expect(future.status).toBe(400)
    expect(await codeOf(future)).toBe('LAUNCH_SENT_AT_INVALID')

    const sent = await sendPia(at, {
      sentAt: today(),
      reference: 'PRISM-0042',
      draftGeneratedAt,
    })
    expect(sent.status).toBe(200)
    const assessment = (await sent.json()) as Assessment
    expect(assessment).toMatchObject({
      state: 'submitted',
      externalTicketRef: 'PRISM-0042',
    })
    // Stamped at noon in Vancouver on the day named — the platform's rule.
    expect(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Vancouver',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(assessment.submittedAt!)),
    ).toBe('12')
    expect(assessment.draft!.generatedAt).toBe(draftGeneratedAt)
  })

  it('MANIFEST_MOCK_RECORDS=assessed — the assessment approved; staging is sent; production waits for staging', async () => {
    const at = await serve({ records: 'assessed' })
    const r = await records(at)
    expect(r.privacyAssessment).toMatchObject({
      state: 'approved',
      externalTicketRef: 'PIA-2026-0088',
    })
    const staging = r.stagingRegistration!
    expect(staging.package!.privacyAssessmentReference).toBe('PIA-2026-0088')
    expect(staging.package!.warnings.some((w) => w.includes('PIA number'))).toBe(false)

    const production = await sendIam(at, 'production', {
      draftGeneratedAt: r.iamRegistration!.package!.generatedAt,
    })
    expect(production.status).toBe(409)
    expect(await codeOf(production)).toBe('LAUNCH_STAGING_NOT_REGISTERED')

    const sent = await sendIam(at, 'staging', {
      reference: 'IAM-2026-0500',
      draftGeneratedAt: staging.package!.generatedAt,
    })
    expect(sent.status).toBe(200)
    expect((await sent.json()) as Registration).toMatchObject({
      state: 'submitted',
      environment: 'staging',
      externalTicketRef: 'IAM-2026-0500',
    })
  })

  it('MANIFEST_MOCK_RECORDS=approved is FE-40 (1) — every blocking item met, and a production deploy answers a production instance of its own', async () => {
    const deployProduction = (at: string) =>
      post(at, `/v1/environments/${f.PRODUCTION_ID}/deploy`, { releaseId: f.RELEASE_ID })
    const ready = await serve({ records: 'approved' })
    expect((await readiness(ready)).ready).toBe(true)
    const deployed = (await (await deployProduction(ready)).json()) as {
      environmentId: string
    }
    expect(deployed.environmentId).toBe(f.PRODUCTION_ID)
    // The default is unchanged (FE-40: the defaults do not move) — not ready.
    expect((await readiness(origin)).ready).toBe(false)
  })

  it('answers a sign-off request as the platform does: not needed by default, open while pending (FE-40 (3)), refused after a rejection', async () => {
    const ask = (at: string, releaseId: string = f.RELEASE_ID) =>
      post(at, `/v1/releases/${releaseId}/approval-request`, { note: 'please look' })

    const needless = await ask(origin)
    expect(needless.status).toBe(409)
    expect(await codeOf(needless)).toBe('APPROVAL_NOT_NEEDED')

    const pending = await serve({ approval: 'pending' })
    const asked = await ask(pending)
    expect(asked.status).toBe(200)
    const request = (await asked.json()) as {
      releaseId: string
      projectId: string
      open: boolean
      createdAt: string
    }
    expect(request).toMatchObject({
      releaseId: f.RELEASE_ID,
      projectId: f.PROJECT_ID,
      open: true,
    })
    // The note is the administrators' alone: never in the answer.
    expect(JSON.stringify(request)).not.toContain('please look')
    expect(Math.abs(Date.now() - Date.parse(request.createdAt))).toBeLessThan(60_000)
    // Nobody has decided: getApproval is the platform's 404, and the checklist's item is unmet.
    const none = await fetch(`${pending}/v1/releases/${f.RELEASE_ID}/approval`, {
      headers: SESSION,
    })
    expect(none.status).toBe(404)
    expect(await codeOf(none)).toBe('NOT_FOUND')
    expect((await item(pending, 'admin-approval')).state).toBe('unmet')
    const unknown = await ask(pending, UNKNOWN)
    expect(unknown.status).toBe(404)
    expect(await codeOf(unknown)).toBe('NOT_FOUND')

    const rejected = await serve({ approval: 'rejected' })
    const refused = await ask(rejected)
    expect(refused.status).toBe(409)
    expect(await codeOf(refused)).toBe('RELEASE_REJECTED')
    const decision = (await (
      await fetch(`${rejected}/v1/releases/${f.RELEASE_ID}/approval`, {
        headers: SESSION,
      })
    ).json()) as { decision: string; reason: string | null }
    expect(decision.decision).toBe('rejected')
    expect(decision.reason).not.toBeNull()
  })

  it('lists the queue for an administrator only — what the fixtures hold by default, four kinds oldest first when MANIFEST_MOCK_QUEUE=full', async () => {
    const queue = (at: string) => fetch(`${at}/v1/queue`, { headers: SESSION })
    const member = await queue(origin)
    expect(member.status).toBe(403)
    expect(await codeOf(member)).toBe('FORBIDDEN')

    type Queue = {
      items: {
        kind: string
        since: string
        note: string | null
        project: { slug: string }
      }[]
      oldestSince: string | null
      truncated: boolean
    }
    const admin = (await (await queue(await serve({ role: 'admin' }))).json()) as Queue
    expect(admin.items.map((i) => i.kind)).toEqual(['privacy-assessment'])
    expect(admin.items[0]!.project.slug).toBe('mock-app')
    expect(admin.oldestSince).toBe(admin.items[0]!.since)

    const full = (await (
      await queue(await serve({ role: 'admin', queue: 'full' }))
    ).json()) as Queue
    expect(new Set(full.items.map((i) => i.kind))).toEqual(
      new Set([
        'release-approval',
        'iam-registration',
        'iam-change-request',
        'privacy-assessment',
      ]),
    )
    expect(full.items.length).toBe(4)
    const sinces = full.items.map((i) => Date.parse(i.since))
    expect(sinces).toEqual([...sinces].sort((a, b) => a - b))
    expect(full.oldestSince).toBe(full.items[0]!.since)
    // A sign-off request carries its note for the administrators; nothing else does.
    expect(full.items.find((i) => i.kind === 'release-approval')!.note).not.toBeNull()
    expect(full.truncated).toBe(false)
  })

  it('MANIFEST_MOCK_STEP_UP=1 is FE-40 (2) — a production deploy and a production secret are refused until the session steps up', async () => {
    const at = await serve({ stepUp: true, records: 'approved' })
    const deploy = (env: string, cookie = SESSION.cookie) =>
      fetch(`${at}/v1/environments/${env}/deploy`, {
        method: 'POST',
        headers: { ...mutation({ cookie }) },
        body: JSON.stringify({ releaseId: f.RELEASE_ID }),
      })
    const secret = (env: string, cookie = SESSION.cookie) =>
      fetch(`${at}/v1/environments/${env}/secrets/API_KEY`, {
        method: 'PUT',
        headers: { ...mutation({ cookie }) },
        body: JSON.stringify({ value: 'not-a-real-secret' }),
      })

    const refused = await deploy(f.PRODUCTION_ID)
    expect(refused.status).toBe(403)
    expect(await codeOf(refused)).toBe('STEP_UP_REQUIRED')
    const refusedSecret = await secret(f.PRODUCTION_ID)
    expect(refusedSecret.status).toBe(403)
    expect(await codeOf(refusedSecret)).toBe('STEP_UP_REQUIRED')
    // Staging is not guarded.
    expect((await deploy(f.STAGING_ID)).status).toBe(200)

    const stepUp = await fetch(`${at}/auth/step-up?returnTo=/projects/${f.PROJECT_ID}`, {
      headers: SESSION,
      redirect: 'manual',
    })
    expect(stepUp.status).toBe(302)
    expect(stepUp.headers.get('location')).toBe(`/projects/${f.PROJECT_ID}`)
    const stepped = stepUp.headers.get('set-cookie')!.split(';')[0]!
    const cookie = `${SESSION.cookie}; ${stepped}`
    expect((await deploy(f.PRODUCTION_ID, cookie)).status).toBe(200)
    expect((await secret(f.PRODUCTION_ID, cookie)).status).toBe(200)
    // Unscripted, step-up is not enforced — the default, unchanged.
    const plain = await fetch(`${origin}/v1/environments/${f.PRODUCTION_ID}/deploy`, {
      method: 'POST',
      headers: mutation(SESSION),
      body: JSON.stringify({ releaseId: f.RELEASE_ID }),
    })
    expect(plain.status).toBe(200)
  })

  it('MANIFEST_MOCK_ADMIN_REASON=1 plays an administrator who is not a member — an owner’s change is refused ADMIN_REASON_REQUIRED without the header, and made with it (the faculty-ready plan’s Task 10)', async () => {
    const at = await serve({ adminReason: true })
    const rename = (reason?: string, key = crypto.randomUUID()) =>
      fetch(`${at}/v1/projects/${f.PROJECT_ID}`, {
        method: 'PATCH',
        headers: {
          ...mutation(SESSION),
          'idempotency-key': key,
          ...(reason === undefined ? {} : { 'manifest-admin-reason': reason }),
        },
        body: JSON.stringify({ name: 'Renamed by an administrator' }),
      })
    const refused = await rename()
    expect(refused.status).toBe(400)
    const body = (await refused.json()) as { error: { code: string; hint: string } }
    expect(body.error.code).toBe('ADMIN_REASON_REQUIRED')
    expect(body.error.hint).toMatch(/Manifest-Admin-Reason/)
    expect((await rename('x'.repeat(501))).status).toBe(400)
    // With a reason — percent-encoded, as a browser must send a person's own words — it is made.
    const key = crypto.randomUUID()
    expect((await rename(encodeURIComponent('Élève — page cassée'), key)).status).toBe(
      200,
    )
    // The reason is part of the request: another reason under the same key is another request.
    const reused = await rename('Another reason', key)
    expect(reused.status).toBe(409)
    expect(await codeOf(reused)).toBe('IDEMPOTENCY_KEY_REUSED')
    // A read asks nothing.
    expect(
      (await fetch(`${at}/v1/projects/${f.PROJECT_ID}`, { headers: SESSION })).status,
    ).toBe(200)
    // WHO IS ASKED: an administrator, and not a member — so a front-end that offers the reason field to
    // exactly that person shows it against this scenario.
    const me = (await (await fetch(`${at}/v1/me`, { headers: SESSION })).json()) as {
      id: string
      role: string
    }
    expect(me.role).toBe('admin')
    const members = (await (
      await fetch(`${at}/v1/projects/${f.PROJECT_ID}/members`, { headers: SESSION })
    ).json()) as { userId: string }[]
    expect(members.length).toBeGreaterThan(0)
    expect(members.map((m) => m.userId)).not.toContain(me.id)
    // Unscripted, nobody is asked — the default, unchanged.
    const plain = await fetch(`${origin}/v1/projects/${f.PROJECT_ID}`, {
      method: 'PATCH',
      headers: mutation(SESSION),
      body: JSON.stringify({ name: 'Renamed by the owner' }),
    })
    expect(plain.status).toBe(200)
  })

  it('refuses a production deploy that is not ready with the platform’s gate and checklist, while a launch is scripted (the whole-branch review’s I3)', async () => {
    const at = await serve({ records: 'drafted' })
    const refused = await post(at, `/v1/environments/${f.PRODUCTION_ID}/deploy`, {
      releaseId: f.RELEASE_ID,
    })
    expect(refused.status).toBe(409)
    const body = (await refused.json()) as {
      error: {
        code: string
        launchReadiness: { ready: boolean; items: { id: string; state: string }[] }
      }
    }
    expect(body.error.code).toBe('RELEASE_PRODUCTION_GATE_UNAVAILABLE')
    expect(body.error.launchReadiness.ready).toBe(false)
    expect(
      body.error.launchReadiness.items.find((i) => i.id === 'iam-registration')!.state,
    ).toBe('unmet')
    // The positive halves: ready, it deploys (FE-40 (1), above); unscripted, the default is unchanged.
    const plain = await post(origin, `/v1/environments/${f.PRODUCTION_ID}/deploy`, {
      releaseId: f.RELEASE_ID,
    })
    expect(plain.status).toBe(200)
  })

  it('asks a SESSION to step up, never a token — which can never step up (the whole-branch review’s finding 11)', async () => {
    const at = await serve({ stepUp: true, records: 'approved' })
    const asToken = (method: string, path: string, body: unknown) =>
      fetch(`${at}${path}`, {
        method,
        headers: mutation(BEARER),
        body: JSON.stringify(body),
      })
    const deployed = await asToken('POST', `/v1/environments/${f.PRODUCTION_ID}/deploy`, {
      releaseId: f.RELEASE_ID,
    })
    expect(deployed.status).toBe(200)
    const secret = await asToken(
      'PUT',
      `/v1/environments/${f.PRODUCTION_ID}/secrets/API_KEY`,
      {
        value: 'not-a-real-secret',
      },
    )
    expect(secret.status).not.toBe(403)
    // The positive half: a session is still asked.
    const session = await post(at, `/v1/environments/${f.PRODUCTION_ID}/deploy`, {
      releaseId: f.RELEASE_ID,
    })
    expect(session.status).toBe(403)
    expect(await codeOf(session)).toBe('STEP_UP_REQUIRED')
  })

  it('MANIFEST_MOCK_REHEARSAL=failed is FE-40 (4) — a rehearsal that did not pass is a 200 carrying its evidence, and the item is unmet', async () => {
    const at = await serve({ rehearsal: 'failed' })
    const ran = await post(at, `/v1/projects/${f.PROJECT_ID}/rehearsal`)
    expect(ran.status).toBe(200)
    const rehearsal = (await ran.json()) as {
      passed: boolean
      evidence: { reason: string; signInStatus: number | null }
    }
    expect(rehearsal.passed).toBe(false)
    expect(rehearsal.evidence.reason).not.toBe('')
    const failed = await item(at, 'rehearsal')
    expect(failed.state).toBe('unmet')
    expect(failed.why).toContain(rehearsal.evidence.reason)
    // The default rehearsal passes.
    expect((await item(origin, 'rehearsal')).state).toBe('met')
  })
})
