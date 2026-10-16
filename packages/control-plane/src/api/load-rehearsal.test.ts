import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, count, eq } from 'drizzle-orm'
import {
  events,
  instances,
  loadRehearsals,
  projects,
  tryWithRehearsalLock,
} from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { addMember } from '../projects/index.js'
import { mintTestToken } from '../tokens/testing.js'
import { createLoadRehearsalRuns } from '../launch/index.js'
import { gatedLoadGenerator } from '../launch/testing.js'
import { buildServer, type ServerDeps } from './server.js'
import { openApiDocument } from './contract/document.js'
import { ROUTE_DEFINITIONS } from './routes/index.js'
import { loginAs, mutationHeaders, projectBody, refusal, testDeps } from './testing.js'

/**
 * §24'S LOAD REHEARSAL, AS AN OPERATION (the load rehearsal plan's Task 5; Decisions 1, 6, 7 and 11; Review Focus 4, 6
 * and 7): `runLoadRehearsal` answers AT ONCE — `202` with the `running` record — and is polled; its refusals, each with
 * its own code; staging is the run's while it lasts; and one `load_rehearsal.completed` per run.
 *
 * The generator is `gatedLoadGenerator`: its load waits for `open()`, so each case acts WHILE a run holds staging, and
 * then lets it end. The run itself — grant, read back, load, watch, judge, take down — is `launch/load-run.test.ts`'s.
 */
beforeEach(resetDatabase)
afterAll(resetDatabase)

type Server = Awaited<ReturnType<typeof server>>

/** The harness, its load rehearsals run through a gated generator, the watch reading every 5 ms. */
async function server() {
  const base = await testDeps()
  const gated = gatedLoadGenerator()
  const runs = createLoadRehearsalRuns({ generator: gated.generator, watchIntervalMs: 5 })
  const deps: ServerDeps = { ...base, loadRehearsals: runs }
  const app = await buildServer(deps)
  return { app, deps, gated, runs }
}

/**
 * A project of `scale` created, built and released through the routes as `bio_prof` — and, unless `deploy` is false, its
 * release SERVING STAGING: the load rehearsal's candidate.
 */
async function staged(
  s: Server,
  slug: string,
  opts: { scale?: 'solo' | 'class' | 'large_course' | 'public'; deploy?: boolean } = {},
) {
  const cookies = await loginAs(s.deps, 'bio_prof')
  const post = (url: string, payload: Record<string, unknown>) =>
    s.app.inject({
      method: 'POST',
      url,
      payload,
      cookies,
      headers: mutationHeaders(s.deps),
    })
  const created = await post(
    '/v1/projects',
    projectBody(slug, { scale: opts.scale ?? 'large_course' }),
  )
  if (created.statusCode !== 201)
    throw new Error(`creating '${slug}' answered ${created.statusCode}: ${created.body}`)
  const project = created.json() as {
    id: string
    slug: string
    environments: { id: string; kind: string; hostname: string }[]
  }
  const started = await post(`/v1/projects/${project.id}/builds`, {})
  if (started.statusCode !== 202)
    throw new Error(`the build answered ${started.statusCode}: ${started.body}`)
  await s.deps.builds.idle()
  const release = await post(`/v1/projects/${project.id}/releases`, {
    buildId: (started.json() as { id: string }).id,
  })
  if (release.statusCode !== 201)
    throw new Error(`the release answered ${release.statusCode}: ${release.body}`)
  const releaseId = (release.json() as { id: string }).id
  const staging = project.environments.find((e) => e.kind === 'staging')!
  const production = project.environments.find((e) => e.kind === 'production')!
  if (opts.deploy !== false) {
    const deployed = await post(`/v1/environments/${staging.id}/deploy`, { releaseId })
    if (deployed.statusCode !== 200 || deployed.json().state !== 'healthy')
      throw new Error(
        `the staging deploy answered ${deployed.statusCode}: ${deployed.body}`,
      )
    await s.deps.retirer.idle()
  }
  return { project, releaseId, staging, production, cookies }
}

type Staged = Awaited<ReturnType<typeof staged>>

/** `POST /v1/projects/{id}/load-rehearsal`, as a session (with §26's reason unless told not to) or as a token. */
function run(
  s: Server,
  projectId: string,
  credential:
    { cookies: Record<string, string>; reason?: string | null } | { bearer: string },
) {
  return s.app.inject({
    method: 'POST',
    url: `/v1/projects/${projectId}/load-rehearsal`,
    ...('cookies' in credential
      ? {
          cookies: credential.cookies,
          headers: {
            ...mutationHeaders(s.deps),
            ...(credential.reason === null
              ? {}
              : {
                  'manifest-admin-reason':
                    credential.reason ?? 'the load rehearsal tests',
                }),
          },
        }
      : {
          headers: {
            authorization: `Bearer ${credential.bearer}`,
            'idempotency-key': randomUUID(),
          },
        }),
  })
}

const stepped = (s: Server, puid: Parameters<typeof loginAs>[1] = 'bio_prof') =>
  loginAs(s.deps, puid, { steppedUp: true })

function read(
  s: Server,
  cookies: Record<string, string>,
  projectId: string,
  id?: string,
) {
  return s.app.inject({
    method: 'GET',
    url:
      id === undefined
        ? `/v1/projects/${projectId}/load-rehearsals`
        : `/v1/projects/${projectId}/load-rehearsals/${id}`,
    cookies,
  })
}

/** Every load rehearsal row of a project — the record a refusal must never have written. */
async function rowCount(s: Server, projectId: string): Promise<number> {
  const [row] = await s.deps.db
    .select({ n: count() })
    .from(loadRehearsals)
    .where(eq(loadRehearsals.projectId, projectId))
  return row?.n ?? -1
}

/** Every instance staging has had — a refusal must never have started one. */
async function stagingInstances(s: Server, ctx: Staged): Promise<number> {
  const [row] = await s.deps.db
    .select({ n: count() })
    .from(instances)
    .where(eq(instances.environmentId, ctx.staging.id))
  return row?.n ?? -1
}

/** Runs ended: the gate opened and every run's take-down done. */
async function finishAll(s: Server): Promise<void> {
  s.gated.open()
  await s.runs.idle()
  await s.deps.retirer.idle()
}

describe('runLoadRehearsal answers at once, and is polled (§24)', () => {
  it('answers 202 with the running record before the load has ended; getLoadRehearsal reads running, then passed with its evidence; listLoadRehearsals newest first', async () => {
    const s = await server()
    try {
      const ctx = await staged(s, 'lr-poll')
      const started = await run(s, ctx.project.id, { cookies: await stepped(s) })
      expect(refusal(started)).toEqual({ status: 202, code: undefined })
      const record = started.json()
      expect(record).toMatchObject({
        projectId: ctx.project.id,
        releaseId: ctx.releaseId,
        state: 'running',
        audience: { scale: 'large_course', burst: 'steady' },
        evidence: null,
        finishedAt: null,
        pollAfterSeconds: 10,
      })
      expect(record.profile.phases.map((p: { name: string }) => p.name)).toEqual([
        'ramp-1',
        'ramp-2',
        'ramp-3',
        'ramp-4',
        'ramp-5',
      ])
      expect(record).not.toHaveProperty('generatorAddress')

      // The load has begun and waits: the record still says `running` — granted, read back.
      await s.gated.went
      const mid = await read(s, ctx.cookies, ctx.project.id, record.id)
      expect(refusal(mid)).toEqual({ status: 200, code: undefined })
      expect(mid.json()).toMatchObject({
        id: record.id,
        state: 'running',
        evidence: null,
      })
      expect(mid.json().granted).toMatchObject({ count: 3 })

      await finishAll(s)
      const end = await read(s, ctx.cookies, ctx.project.id, record.id)
      expect(end.json()).toMatchObject({
        id: record.id,
        state: 'passed',
        pollAfterSeconds: null,
        evidence: { requests: 9000, answered: 9000, answeredRatio: 1, p95Ms: 8 },
      })
      expect(end.json().finishedAt).not.toBeNull()
      expect(end.json().evidence.reason).toMatch(/every instance stayed healthy/)

      const again = await run(s, ctx.project.id, { cookies: await stepped(s) })
      expect(refusal(again)).toEqual({ status: 202, code: undefined })
      await finishAll(s)
      const list = await read(s, ctx.cookies, ctx.project.id)
      expect(refusal(list)).toEqual({ status: 200, code: undefined })
      expect(list.json().loadRehearsals.map((r: { id: string }) => r.id)).toEqual([
        again.json().id,
        record.id,
      ])
    } finally {
      await finishAll(s)
      await s.app.close()
    }
  })

  it('reads another project’s record as 404 NOT_FOUND, a stranger as 404, and a token holding project:read as the record', async () => {
    const s = await server()
    try {
      const ctx = await staged(s, 'lr-read')
      const other = await staged(s, 'lr-read-other', { deploy: false })
      const started = await run(s, ctx.project.id, { cookies: await stepped(s) })
      await finishAll(s)
      const id = started.json().id as string

      expect(refusal(await read(s, ctx.cookies, other.project.id, id))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
      const stranger = await loginAs(s.deps, 'unrelated_user')
      expect(refusal(await read(s, stranger, ctx.project.id, id))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
      const owner = await ensureTestUser(s.deps.db, 'bio_prof')
      const { plaintext } = await mintTestToken(s.deps.db, {
        userId: owner.id,
        projectId: ctx.project.id,
        capabilities: ['project:read'],
      })
      const byToken = await s.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.project.id}/load-rehearsals/${id}`,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(refusal(byToken)).toEqual({ status: 200, code: undefined })
      expect(byToken.json()).toMatchObject({ id, state: 'passed' })
    } finally {
      await finishAll(s)
      await s.app.close()
    }
  })
})

describe('who may run it, and what refuses it — nothing granted by any refusal (Review Focus 4 and 6)', () => {
  it('another app’s run under way → 409 LOAD_REHEARSAL_BUSY, naming no other project; this app’s → 409 LOAD_REHEARSAL_RUNNING', async () => {
    const s = await server()
    try {
      const holder = await staged(s, 'lr-holder')
      const asker = await staged(s, 'lr-asker')
      const first = await run(s, holder.project.id, { cookies: await stepped(s) })
      expect(refusal(first)).toEqual({ status: 202, code: undefined })
      await s.gated.went
      const before = await stagingInstances(s, asker)

      const busy = await run(s, asker.project.id, { cookies: await stepped(s) })
      expect(refusal(busy)).toEqual({ status: 409, code: 'LOAD_REHEARSAL_BUSY' })
      expect(busy.body).not.toContain(holder.project.id)
      expect(busy.body).not.toContain(holder.project.slug)
      expect(await rowCount(s, asker.project.id)).toBe(0)
      expect(await stagingInstances(s, asker)).toBe(before)

      const twice = await run(s, holder.project.id, { cookies: await stepped(s) })
      expect(refusal(twice)).toEqual({ status: 409, code: 'LOAD_REHEARSAL_RUNNING' })
      expect(await rowCount(s, holder.project.id)).toBe(1)

      // The positive control: once the holder's run has ended, the asker's runs.
      await finishAll(s)
      const after = await run(s, asker.project.id, { cookies: await stepped(s) })
      expect(refusal(after)).toEqual({ status: 202, code: undefined })
    } finally {
      await finishAll(s)
      await s.app.close()
    }
  })

  it('D21’s rehearsal under way → 409 REHEARSAL_RUNNING; D21’s asked while a load rehearsal runs → 409 LOAD_REHEARSAL_RUNNING', async () => {
    const s = await server()
    try {
      const ctx = await staged(s, 'lr-d21')
      const cookies = await stepped(s)
      // D21's lock HELD while the load rehearsal is asked for — as a rehearsal under way holds it.
      const asked = await tryWithRehearsalLock(ctx.project.id, () =>
        run(s, ctx.project.id, { cookies }),
      )
      expect(refusal(asked!)).toEqual({ status: 409, code: 'REHEARSAL_RUNNING' })
      expect(await rowCount(s, ctx.project.id)).toBe(0)

      const started = await run(s, ctx.project.id, { cookies })
      expect(refusal(started)).toEqual({ status: 202, code: undefined })
      await s.gated.went
      const rehearse = () =>
        s.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.project.id}/rehearsal`,
          cookies,
          headers: mutationHeaders(s.deps),
        })
      const d21 = await rehearse()
      expect(refusal(d21)).toEqual({ status: 409, code: 'LOAD_REHEARSAL_RUNNING' })

      // The positive control: once the load rehearsal has ended, D21's answers what it answers this app — it signs
      // nobody in.
      await finishAll(s)
      expect(refusal(await rehearse())).toEqual({
        status: 409,
        code: 'REHEARSAL_NOT_CWL',
      })
    } finally {
      await finishAll(s)
      await s.app.close()
    }
  })

  it('a class or solo app → 409 LOAD_REHEARSAL_NOT_NEEDED; nothing serving staging → 409 REHEARSAL_NO_CANDIDATE; an archived app → 409 PROJECT_ARCHIVED', async () => {
    const s = await server()
    try {
      const cookies = await stepped(s)
      for (const scale of ['class', 'solo'] as const) {
        const small = await staged(s, `lr-${scale}`, { scale })
        const res = await run(s, small.project.id, { cookies })
        expect(refusal(res), scale).toEqual({
          status: 409,
          code: 'LOAD_REHEARSAL_NOT_NEEDED',
        })
        expect(await rowCount(s, small.project.id)).toBe(0)
      }
      const bare = await staged(s, 'lr-bare', { deploy: false })
      expect(refusal(await run(s, bare.project.id, { cookies }))).toEqual({
        status: 409,
        code: 'REHEARSAL_NO_CANDIDATE',
      })
      expect(await rowCount(s, bare.project.id)).toBe(0)

      const archived = await staged(s, 'lr-archived')
      await s.deps.db
        .update(projects)
        .set({ state: 'archived' })
        .where(eq(projects.id, archived.project.id))
      expect(refusal(await run(s, archived.project.id, { cookies }))).toEqual({
        status: 409,
        code: 'PROJECT_ARCHIVED',
      })
      expect(await rowCount(s, archived.project.id)).toBe(0)
    } finally {
      await finishAll(s)
      await s.app.close()
    }
  })

  it('a token — even one holding launch:rehearse — 403 TOKEN_CREDENTIAL_REFUSED; a session not stepped up 403 STEP_UP_REQUIRED; a stranger 404', async () => {
    const s = await server()
    try {
      const ctx = await staged(s, 'lr-who')
      const owner = await ensureTestUser(s.deps.db, 'bio_prof')
      const { plaintext } = await mintTestToken(s.deps.db, {
        userId: owner.id,
        projectId: ctx.project.id,
        capabilities: ['project:read', 'launch:rehearse'],
      })
      expect(refusal(await run(s, ctx.project.id, { bearer: plaintext }))).toEqual({
        status: 403,
        code: 'TOKEN_CREDENTIAL_REFUSED',
      })
      expect(
        refusal(
          await run(s, ctx.project.id, { cookies: await loginAs(s.deps, 'bio_prof') }),
        ),
      ).toEqual({ status: 403, code: 'STEP_UP_REQUIRED' })
      expect(
        refusal(
          await run(s, ctx.project.id, { cookies: await stepped(s, 'unrelated_user') }),
        ),
      ).toEqual({ status: 404, code: 'NOT_FOUND' })
      expect(await rowCount(s, ctx.project.id)).toBe(0)
    } finally {
      await finishAll(s)
      await s.app.close()
    }
  })

  it('a collaborator → 202; an administrator who is no member → 400 ADMIN_REASON_REQUIRED without §26’s reason, and 202 with it, the reason in the run’s events', async () => {
    const s = await server()
    try {
      const ctx = await staged(s, 'lr-people')
      const student = await ensureTestUser(s.deps.db, 'bio_student')
      await addMember(s.deps.db, ctx.project.id, student.id, 'collaborator')
      const collaborator = await run(s, ctx.project.id, {
        cookies: await stepped(s, 'bio_student'),
        reason: null,
      })
      expect(refusal(collaborator)).toEqual({ status: 202, code: undefined })
      await finishAll(s)

      const admin = await stepped(s, 'platform_admin')
      const unreasoned = await run(s, ctx.project.id, { cookies: admin, reason: null })
      expect(refusal(unreasoned)).toEqual({ status: 400, code: 'ADMIN_REASON_REQUIRED' })
      expect(await rowCount(s, ctx.project.id)).toBe(1)

      const reasoned = await run(s, ctx.project.id, {
        cookies: admin,
        reason: 'checking the course before term',
      })
      expect(refusal(reasoned)).toEqual({ status: 202, code: undefined })
      await finishAll(s)
      const [completed] = await s.deps.db
        .select()
        .from(events)
        .where(
          and(
            eq(events.projectId, ctx.project.id),
            eq(events.type, 'load_rehearsal.completed'),
            eq(events.subject, `load-rehearsal:${reasoned.json().id}`),
          ),
        )
      expect(completed).toMatchObject({
        actedAsAdmin: true,
        reason: 'checking the course before term',
      })
    } finally {
      await finishAll(s)
      await s.app.close()
    }
  })
})

describe('staging is the run’s while it lasts (Review Focus 7)', () => {
  it('a staging deploy by a person, and by a token, is refused 409 LOAD_REHEARSAL_RUNNING and deploys nothing; a production deploy is not; after the run a staging deploy passes', async () => {
    const s = await server()
    try {
      const ctx = await staged(s, 'lr-held')
      const started = await run(s, ctx.project.id, { cookies: await stepped(s) })
      expect(refusal(started)).toEqual({ status: 202, code: undefined })
      await s.gated.went
      const before = await stagingInstances(s, ctx)

      const deploy = (environmentId: string, credential: Record<string, unknown>) =>
        s.app.inject({
          method: 'POST',
          url: `/v1/environments/${environmentId}/deploy`,
          payload: { releaseId: ctx.releaseId },
          ...credential,
        })
      const byPerson = await deploy(ctx.staging.id, {
        cookies: ctx.cookies,
        headers: mutationHeaders(s.deps),
      })
      expect(refusal(byPerson)).toEqual({ status: 409, code: 'LOAD_REHEARSAL_RUNNING' })
      const owner = await ensureTestUser(s.deps.db, 'bio_prof')
      const { plaintext } = await mintTestToken(s.deps.db, {
        userId: owner.id,
        projectId: ctx.project.id,
        capabilities: ['project:read', 'release:deploy'],
      })
      const byToken = await deploy(ctx.staging.id, {
        headers: {
          authorization: `Bearer ${plaintext}`,
          'idempotency-key': randomUUID(),
        },
      })
      expect(refusal(byToken)).toEqual({ status: 409, code: 'LOAD_REHEARSAL_RUNNING' })
      expect(await stagingInstances(s, ctx)).toBe(before)

      // Production is not the run's: its deploy answers what it answers this app — the launch checklist.
      const toProduction = await deploy(ctx.production.id, {
        cookies: await stepped(s),
        headers: mutationHeaders(s.deps),
      })
      expect(refusal(toProduction).code).not.toBe('LOAD_REHEARSAL_RUNNING')
      expect(refusal(toProduction).status).toBe(409)

      // The run's end gives staging back; then a person's staging deploy passes.
      await finishAll(s)
      const after = await deploy(ctx.staging.id, {
        cookies: ctx.cookies,
        headers: mutationHeaders(s.deps),
      })
      expect(refusal(after)).toEqual({ status: 200, code: undefined })
      expect(after.json().state).toBe('healthy')
    } finally {
      await finishAll(s)
      await s.app.close()
    }
  })
})

describe('the event and the document', () => {
  it('publishes ONE load_rehearsal.completed per finished run, naming who ran it and the result', async () => {
    const s = await server()
    try {
      const ctx = await staged(s, 'lr-event')
      const started = await run(s, ctx.project.id, { cookies: await stepped(s) })
      await finishAll(s)
      const published = await s.deps.db
        .select()
        .from(events)
        .where(
          and(
            eq(events.projectId, ctx.project.id),
            eq(events.type, 'load_rehearsal.completed'),
          ),
        )
      expect(published).toHaveLength(1)
      expect(published[0]!.machineDetail).toEqual({
        loadRehearsalId: started.json().id,
        releaseId: ctx.releaseId,
        state: 'passed',
        p95Ms: 8,
        answeredRatio: 1,
        reason: expect.stringMatching(/every instance stayed healthy/),
      })
      expect(published[0]!.humanMessage).toMatch(/ran the load rehearsal and it passed/)
    } finally {
      await finishAll(s)
      await s.app.close()
    }
  })

  it('declares LOAD_REHEARSAL_RUNNING where it is answered — deploy and runRehearsal — and the run’s codes on runLoadRehearsal', () => {
    const document = openApiDocument(ROUTE_DEFINITIONS) as {
      paths: Record<
        string,
        Record<string, { operationId: string; 'x-manifest-error-codes': string[] }>
      >
    }
    const codesOf = (operationId: string) =>
      Object.values(document.paths)
        .flatMap((methods) => Object.values(methods))
        .find((operation) => operation.operationId === operationId)?.[
        'x-manifest-error-codes'
      ]
    expect(codesOf('deploy')).toContain('LOAD_REHEARSAL_RUNNING')
    expect(codesOf('runRehearsal')).toContain('LOAD_REHEARSAL_RUNNING')
    expect(codesOf('runLoadRehearsal')).toEqual(
      expect.arrayContaining([
        'LOAD_REHEARSAL_BUSY',
        'LOAD_REHEARSAL_RUNNING',
        'LOAD_REHEARSAL_NOT_NEEDED',
        'REHEARSAL_NO_CANDIDATE',
        'REHEARSAL_RUNNING',
        'STEP_UP_REQUIRED',
        'TOKEN_CREDENTIAL_REFUSED',
        'PROJECT_ARCHIVED',
        'ADMIN_REASON_REQUIRED',
      ]),
    )
    expect(codesOf('getLoadRehearsal')).toContain('NOT_FOUND')
  })
})
