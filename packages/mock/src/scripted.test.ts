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
