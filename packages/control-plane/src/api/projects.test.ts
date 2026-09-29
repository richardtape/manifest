import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { and, asc, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { startFake, type StartedFake } from '@manifest/github-fake/testing'
import { appSpecs, events, projects } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { SourceError } from '../source/index.js'
import { buildServer } from './server.js'
import {
  githubTestDeps,
  loginAs,
  mutationHeaders,
  projectBody,
  refusal,
  sessionFor,
  testDeps,
  withProjectServer,
  type TestProject,
} from './testing.js'
import { mintTestToken } from '../tokens/testing.js'
import type { TestUserPuid } from '../identity/testing.js'
import { AI_CODES, AiError, disabledCatalogue, type ModelCatalogue } from '../ai/index.js'
import { declaredCatalogue } from '../ai/testing.js'
import { writeFiles } from '../source/testing.js'

// These drive a real server, so they cannot use withRollback. Each test starts
// from an empty database; without this they collide on the unique project slug.
beforeEach(resetDatabase)
// And afterwards, so the committed rows this file leaves cannot collide with the
// `chem-labs` that three withRollback suites insert inside their transactions.
afterAll(resetDatabase)

async function loggedIn(puid: TestUserPuid = 'bio_prof') {
  const deps = await testDeps()
  const app = await buildServer(deps)
  const { manifest_session: session } = await loginAs(deps, puid)
  /**
   * The SAME person with §20's step-up claim stamped (P6a Task 9). `members:manage` is
   * guarded, and the two tests below are about who may add a member rather than about
   * the second round trip — which `auth.test.ts` and `step-up-guarded.test.ts` own.
   */
  const { manifest_session: steppedUp } = await loginAs(deps, puid, { steppedUp: true })
  return { app, deps, session, steppedUp }
}

const create = (slug: string) => ({
  method: 'POST' as const,
  url: '/v1/projects',
  payload: projectBody(slug),
})

/** What the GitHub fake answers a PERSON (`faculty-dev`, with admin) reading the repository. */
async function asPerson(fake: StartedFake, slug: string): Promise<number> {
  const res = await fetch(`${fake.apiUrl}/repos/${fake.org}/${slug}`, {
    headers: { authorization: `token ${fake.developerToken}` },
  })
  return res.status
}

async function signedIn(puid: TestUserPuid = 'bio_prof') {
  const deps = await testDeps()
  const app = await buildServer(deps)
  const cookies = await loginAs(deps, puid)
  const me = (await app.inject({ method: 'GET', url: '/v1/me', cookies })).json() as {
    id: string
  }
  return { deps, app, cookies, me }
}

describe('POST /v1/projects (§22 steps 2–3, P5a Task 11)', () => {
  it('creates a project from node-ts-mongo@1’s proof-app starter, for a stated audience', async () => {
    const { deps, app, cookies, me } = await signedIn()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      cookies,
      headers: mutationHeaders(deps),
      payload: {
        slug: 'journey-app',
        blueprint: 'node-ts-mongo@1',
        starter: 'proof-app',
        audience: {
          scale: 'class',
          burst: 'synchronised',
          justification: 'CHEM 121, used live in lectures',
        },
      },
    })
    expect(res.statusCode).toBe(201)
    const created = res.json()
    expect(created).toMatchObject({
      slug: 'journey-app',
      blueprint: 'node-ts-mongo@1',
      starter: 'proof-app',
      owner: { id: me.id },
      audience: {
        scale: 'class',
        burst: 'synchronised',
        justification: 'CHEM 121, used live in lectures',
        setBy: me.id,
      },
      spec: {
        valid: true,
        errors: [],
        commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
        sensitiveDiff: { sensitive: false, fields: [] },
      },
    })
    expect(Object.keys(created).sort()).toEqual(
      [
        'archivedAt',
        'audience',
        'blueprint',
        'createdAt',
        'environments',
        'id',
        'launchedAt',
        'name',
        'owner',
        'repository',
        'slug',
        'spec',
        'starter',
        'state',
      ].sort(),
    )
    expect(created.environments.map((e: { kind: string }) => e.kind).sort()).toEqual([
      'production',
      'sandbox',
      'staging',
    ])
    const repo = deps.source.repositoryFor('journey-app')
    const at = (path: string) => deps.source.readFile(repo, created.spec.commitSha, path)
    const starter = deps.blueprints.starter('node-ts-mongo@1', 'proof-app')!
    const skeleton = deps.blueprints.skeleton('node-ts-mongo@1')!
    expect(await at('public/index.html')).toBe(starter.files['public/index.html'])
    expect(await at('auth/session.js')).toBe(skeleton['auth/session.js'])
    expect(await at('server.js')).toBe(starter.files['server.js'])
    // The name is the project's; nothing else in the author's file moved.
    expect(await at('manifest.yaml')).toBe(
      starter.files['manifest.yaml']!.replace(/^name: .*$/m, 'name: journey-app'),
    )
    // And the project reads back with its provenance.
    const read = await app.inject({
      method: 'GET',
      url: `/v1/projects/${created.id}`,
      cookies,
    })
    expect(read.json()).toMatchObject({
      starter: 'proof-app',
      audience: { scale: 'class' },
    })
    await app.close()
  })

  it('without a starter, seeds the skeleton and a minimal manifest', async () => {
    const { deps, app, cookies } = await signedIn()
    const res = await app.inject({
      ...create('chem-labs'),
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(res.statusCode).toBe(201)
    const created = res.json()
    expect(created).toMatchObject({ starter: null, spec: { valid: true } })
    const repo = deps.source.repositoryFor('chem-labs')
    expect(await deps.source.readFile(repo, created.spec.commitSha, 'server.js')).toBe(
      deps.blueprints.skeleton('fixture-node@1')!['server.js'],
    )
    expect(
      await deps.source.readFile(repo, created.spec.commitSha, 'src/index.js'),
    ).toBeNull()
    await app.close()
  })

  it('requires the audience question to be answered', async () => {
    const { deps, app, cookies } = await signedIn()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      cookies,
      headers: mutationHeaders(deps),
      payload: { slug: 'chem-labs', blueprint: 'fixture-node@1' },
    })
    expect({ status: res.statusCode, code: res.json().error.code }).toEqual({
      status: 400,
      code: 'REQUEST_INVALID',
    })
    expect(res.json().error.message).toContain('audience')
    await app.close()
  })

  it('refuses a blueprint that does not exist, naming what does', async () => {
    const { deps, app, cookies } = await signedIn()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      cookies,
      headers: mutationHeaders(deps),
      payload: projectBody('chem-labs', { blueprint: 'nope@1' }),
    })
    expect({ status: res.statusCode, code: res.json().error.code }).toEqual({
      status: 400,
      code: 'BLUEPRINT_NOT_FOUND',
    })
    expect(res.json().error.hint).toContain('node-ts-mongo@1')
    await app.close()
  })

  it('refuses a starter the blueprint does not offer, and leaves no project behind', async () => {
    const { deps, app, cookies } = await signedIn()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      cookies,
      headers: mutationHeaders(deps),
      payload: projectBody('chem-labs', { starter: 'proof-app' }),
    })
    expect({ status: res.statusCode, code: res.json().error.code }).toEqual({
      status: 400,
      code: 'STARTER_NOT_FOUND',
    })
    expect(res.json().error.hint).toContain('offers no starters')
    const check = await app.inject({ method: 'GET', url: '/v1/slugs/chem-labs', cookies })
    expect(check.json().available).toBe(true)
    await app.close()
  })

  it('leaves no project behind when its repository cannot be created (P4b finding 178)', async () => {
    const deps = await testDeps()
    const failing = {
      ...deps,
      source: {
        ...deps.source,
        createRepository: () =>
          Promise.reject(new SourceError('SOURCE_GIT_FAILED', 'git init failed')),
      },
    }
    const app = await buildServer(failing)
    const cookies = await loginAs(failing, 'bio_prof')
    const res = await app.inject({
      ...create('chem-labs'),
      cookies,
      headers: mutationHeaders(failing),
    })
    expect({ status: res.statusCode, code: res.json().error.code }).toEqual({
      status: 409,
      code: 'SOURCE_GIT_FAILED',
    })
    const check = await app.inject({ method: 'GET', url: '/v1/slugs/chem-labs', cookies })
    expect(check.json().available).toBe(true)
    expect(await failing.db.select().from(projects)).toEqual([])
    expect(await failing.db.select().from(events)).toEqual([])
    await app.close()
  })

  /**
   * A CREATE THAT FAILS AFTER THE DRIVER MADE THE REPOSITORY (the launch path plan's Task 2,
   * *Read this first* 13): the route records the row and reads the seed back AFTER
   * `createRepository` returned, and a failure there used to delete only the project row — the
   * repository stayed on GitHub, the mirror stayed here, and the slug was refused
   * `SOURCE_REPOSITORY_EXISTS` for ever. On driver 2, against the in-process fake: the read after
   * the create fails ONCE, as a GitHub that stopped answering would make it.
   */
  it('a create that fails after the driver made the repository destroys it, and frees the slug', async () => {
    const fake = await startFake()
    try {
      const base = await githubTestDeps(fake)
      let failures = 1
      const failing = {
        ...base,
        source: {
          ...base.source,
          headCommit: (repo: Parameters<typeof base.source.headCommit>[0]) =>
            failures-- > 0
              ? Promise.reject(
                  new SourceError(
                    'SOURCE_GIT_FAILED',
                    'the read after the create failed',
                  ),
                )
              : base.source.headCommit(repo),
        },
      }
      const app = await buildServer(failing)
      try {
        const cookies = await loginAs(failing, 'bio_prof')
        const post = () =>
          app.inject({
            ...create('lp-fail-after'),
            cookies,
            headers: mutationHeaders(failing),
          })
        const res = await post()
        // The ORIGINAL failure, answered as it maps — not the cleanup's.
        expect(refusal(res)).toEqual({ status: 409, code: 'SOURCE_GIT_FAILED' })
        expect(await asPerson(fake, 'lp-fail-after')).toBe(404) // gone on "GitHub"
        expect(existsSync(join(failing.config.reposRoot, 'lp-fail-after.git'))).toBe(
          false,
        )
        expect(await failing.db.select().from(projects)).toEqual([])
        // THE POSITIVE CONTROL: the same slug creates — nothing of the failed one is in its way.
        const again = await post()
        expect(again.statusCode, again.body).toBe(201)
        expect(await asPerson(fake, 'lp-fail-after')).toBe(200)
      } finally {
        await failing.sourceSync.idle()
        await app.close()
      }
    } finally {
      await fake.stop()
    }
  })

  /**
   * AND A CLEANUP THAT FAILS TOO IS SAID, NEVER SWALLOWED — and never answered in place of the
   * failure that caused it. Driver 1, both steps failing by injection: the operator line names
   * the slug and the provider, and the client is told the ORIGINAL code.
   */
  it('a cleanup that fails after a failed create is an operator line naming the slug and provider, and the original error is answered', async () => {
    const base = await testDeps()
    const failing = {
      ...base,
      source: {
        ...base.source,
        headCommit: () =>
          Promise.reject(
            new SourceError('SOURCE_GIT_FAILED', 'the read after the create failed'),
          ),
        destroyRepository: () =>
          Promise.reject(new SourceError('SOURCE_PATH_ESCAPE', 'the destroy failed too')),
      },
    }
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const app = await buildServer(failing)
    try {
      const cookies = await loginAs(failing, 'bio_prof')
      const res = await app.inject({
        ...create('lp-cleanup-fails'),
        cookies,
        headers: mutationHeaders(failing),
      })
      expect(refusal(res)).toEqual({ status: 409, code: 'SOURCE_GIT_FAILED' })
      const lines = said.mock.calls.map((c) => c.map(String).join(' '))
      expect(lines).toContainEqual(expect.stringContaining('lp-cleanup-fails'))
      const line = lines.find((l) => l.includes('lp-cleanup-fails'))!
      expect(line).toContain('local')
      expect(line).toContain('the destroy failed too')
      // The project row goes whatever the repository did: the slug is not held by a ghost.
      expect(await failing.db.select().from(projects)).toEqual([])
    } finally {
      said.mockRestore()
      await app.close()
    }
  })

  it('publishes project.created, repository.seeded and spec.validated, in that order, once the repository exists', async () => {
    const { deps, app, cookies } = await signedIn()
    const frames: { type?: string; machineDetail?: unknown }[] = []
    // The project id is not known until the response, so listen to every project's frames.
    const publish = deps.bus.publish.bind(deps.bus)
    deps.bus.publish = (frame) => {
      frames.push(frame as never)
      publish(frame)
    }
    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      cookies,
      headers: mutationHeaders(deps),
      payload: projectBody('chem-labs'),
    })
    expect(res.statusCode).toBe(201)
    const created = res.json()
    expect(frames.map((f) => f.type)).toEqual([
      'project.created',
      'repository.seeded',
      'spec.validated',
    ])
    expect(frames[0]!.machineDetail).toEqual({
      slug: 'chem-labs',
      blueprint: 'fixture-node@1',
      starter: null,
      audience: { scale: 'solo', burst: 'steady' },
    })
    expect(frames[1]!.machineDetail).toEqual({
      commitSha: created.spec.commitSha,
      files: Object.keys(deps.blueprints.skeleton('fixture-node@1')!).length + 1,
      starter: null,
    })
    expect(frames[2]!.machineDetail).toEqual({
      appSpecId: created.spec.appSpecId,
      commitSha: created.spec.commitSha,
      valid: true,
      errorCount: 0,
    })
    // Recorded, not only streamed: the audit trail holds the same three.
    const recorded = await deps.db
      .select({ type: events.type })
      .from(events)
      .where(eq(events.projectId, created.id))
      .orderBy(asc(events.createdAt))
    expect(recorded.map((r) => r.type)).toEqual([
      'project.created',
      'repository.seeded',
      'spec.validated',
    ])
    await app.close()
  })

  it('refuses a mutating request with no Idempotency-Key', async () => {
    const { app, deps, cookies } = await signedIn()
    const response = await app.inject({
      ...create('chem-labs'),
      cookies,
      // The ORIGIN is present, so the refusal is the key's and not §20's (P5a Task 4).
      headers: { origin: deps.config.sp.origin },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
    await app.close()
  })

  it('creates one project when the same request is replayed', async () => {
    const { app, deps, cookies } = await signedIn()
    // ONE object, so both requests carry the same key — which is the replay.
    const headers = mutationHeaders(deps)
    const first = await app.inject({ ...create('chem-labs'), cookies, headers })
    const second = await app.inject({ ...create('chem-labs'), cookies, headers })
    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(first.statusCode)
    expect(second.json()).toEqual(first.json())
    const list = await app.inject({ method: 'GET', url: '/v1/projects', cookies })
    expect(list.json()).toHaveLength(1)
    await app.close()
  })

  it('rejects a slug §7 would not accept, with the slug check’s code', async () => {
    const { app, deps, cookies } = await signedIn()
    const response = await app.inject({
      ...create('Chem_Labs'),
      cookies,
      headers: mutationHeaders(deps),
    })
    expect({ status: response.statusCode, code: response.json().error.code }).toEqual({
      status: 400,
      code: 'SLUG_INVALID',
    })
    await app.close()
  })

  it('refuses an unauthenticated request', async () => {
    const { app, deps } = await signedIn()
    const response = await app.inject({
      ...create('chem-labs'),
      headers: mutationHeaders(deps),
    })
    expect({ status: response.statusCode, code: response.json().error.code }).toEqual({
      status: 401,
      code: 'UNAUTHENTICATED',
    })
    await app.close()
  })
})

describe('GET /v1/projects/:id', () => {
  it('expands environments only when asked (D23.1)', async () => {
    const { app, deps, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    const id = created.json().id

    const plain = await app.inject({
      method: 'GET',
      url: `/v1/projects/${id}`,
      cookies: { manifest_session: session },
    })
    expect(plain.json().environments).toBeUndefined()

    const expanded = await app.inject({
      method: 'GET',
      url: `/v1/projects/${id}?expand=environments`,
      cookies: { manifest_session: session },
    })
    expect(expanded.json().environments).toHaveLength(3)
    await app.close()
  })

  it('returns the validated spec at the seeded commit', async () => {
    const { app, deps, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    const spec = await app.inject({
      method: 'GET',
      url: `/v1/projects/${created.json().id}/spec`,
      cookies: { manifest_session: session },
    })
    expect(spec.statusCode).toBe(200)
    expect(spec.json().spec.name).toBe('chem-labs')
    expect(spec.json().commitSha).toBe(created.json().spec.commitSha)
    await app.close()
  })

  it('hides another user’s project behind 404, not 403', async () => {
    const { app, deps, session } = await loggedIn('bio_prof')
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    const { manifest_session: otherSession } = await loginAs(deps, 'bio_student')

    const response = await app.inject({
      method: 'GET',
      url: `/v1/projects/${created.json().id}`,
      cookies: { manifest_session: otherSession },
    })
    expect(response.statusCode).toBe(404)
    await app.close()
  })
})

/**
 * P5a Task 8: every read answers a REPRESENTATION, not a row. A column added to a table
 * cannot reach a client unless a mapper names it and its schema admits it (Decision 2).
 */
describe('project reads answer representations (P5a Task 8)', () => {
  const PROJECT_KEYS = [
    'archivedAt',
    'audience',
    'blueprint',
    'createdAt',
    'id',
    'launchedAt',
    'name',
    'owner',
    'repository',
    'slug',
    'starter',
    // §11's archive (the front-end enablement plan's Task 11).
    'state',
  ]

  async function withCreatedProject(slug: string) {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')
    const res = await app.inject({
      ...create(slug),
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(res.statusCode).toBe(201)
    return { deps, app, cookies, project: res.json() as { id: string } }
  }

  it('a project carries exactly the representation’s fields, and its owner by name', async () => {
    const { app, cookies, project } = await withCreatedProject('chem-labs')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${project.id}`,
      cookies,
    })
    expect(res.statusCode).toBe(200)
    expect(Object.keys(res.json()).sort()).toEqual(PROJECT_KEYS)
    expect(res.json().owner).toEqual({ id: expect.any(String), displayName: 'Bio Prof' })
    for (const internal of [
      'quota',
      'visibility',
      'published',
      'forkedFrom',
      'ownerId',
      'blueprintRef',
    ])
      expect(res.json()).not.toHaveProperty(internal)
    await app.close()
  })

  it('expands environments, each with its url and no driver internals', async () => {
    const { app, cookies, project } = await withCreatedProject('chem-labs')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${project.id}?expand=environments`,
      cookies,
    })
    const staging = res
      .json()
      .environments.find((e: { kind: string }) => e.kind === 'staging')
    expect(staging).toEqual({
      id: expect.any(String),
      projectId: project.id,
      kind: 'staging',
      hostname: 'chem-labs.staging.manifest.internal',
      url: 'https://chem-labs.staging.manifest.internal',
      instance: null,
    })
    await app.close()
  })

  it('lists a project’s environments and its members', async () => {
    const { app, cookies, project } = await withCreatedProject('chem-labs')
    const environments = await app.inject({
      method: 'GET',
      url: `/v1/projects/${project.id}/environments`,
      cookies,
    })
    expect(environments.statusCode).toBe(200)
    expect(
      environments
        .json()
        .map((e: { kind: string }) => e.kind)
        .sort(),
    ).toEqual(['production', 'sandbox', 'staging'])
    const members = await app.inject({
      method: 'GET',
      url: `/v1/projects/${project.id}/members`,
      cookies,
    })
    expect(members.statusCode).toBe(200)
    expect(members.json()).toEqual([
      {
        userId: expect.any(String),
        puid: 'bio_prof',
        // Null: this owner's session was signed in-process, never by an assertion carrying uid.
        cwlLogin: null,
        displayName: 'Bio Prof',
        email: 'bio_prof@example.ubc.ca',
        role: 'owner',
      },
    ])
    await app.close()
  })

  it('an administrator’s own list is their memberships — the fleet is another read (Decision 20)', async () => {
    const { deps, app } = await withCreatedProject('chem-labs')
    const admin = await loginAs(deps, 'platform_admin')
    const res = await app.inject({ method: 'GET', url: '/v1/projects', cookies: admin })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
    await app.close()
  })
})

/**
 * §23: "one function answers both". The check and creation must give the same answer
 * for the same name, and this is the test that makes that a fact rather than two
 * functions that happen to agree today (P5a Task 9, control (b)).
 */
describe('the slug check and creation agree (§23, P5a Task 9)', () => {
  it('GET /v1/slugs answers 200 whatever the answer, and creation refuses with the same code', async () => {
    const { deps, app, cookies } = await signedIn()
    for (const [slug, code, status] of [
      ['console', 'SLUG_RESERVED', 409],
      ['chem', 'SLUG_RESERVED', 409],
      ['Chem_Labs', 'SLUG_INVALID', 400],
      // Longer than any slug, and still §23's answer rather than a request refusal.
      ['a'.repeat(80), 'SLUG_INVALID', 400],
    ] as const) {
      const check = await app.inject({ method: 'GET', url: `/v1/slugs/${slug}`, cookies })
      expect(check.statusCode).toBe(200)
      expect(check.json()).toMatchObject({ slug, available: false, reasons: [{ code }] })
      const created = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        cookies,
        headers: mutationHeaders(deps),
        payload: projectBody(slug),
      })
      expect({ status: created.statusCode, code: created.json().error?.code }).toEqual({
        status,
        code,
      })
      // The message a person reads at creation is the one the check gave them.
      expect(created.json().error.message).toBe(check.json().reasons[0].message)
    }
    await app.close()
  })

  it('a name taken by creation is SLUG_TAKEN at both', async () => {
    const { deps, app, cookies } = await signedIn()
    const first = await app.inject({
      ...create('chem-labs'),
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(first.statusCode).toBe(201)
    const check = await app.inject({ method: 'GET', url: '/v1/slugs/chem-labs', cookies })
    expect(check.json()).toEqual({
      slug: 'chem-labs',
      available: false,
      reasons: [expect.objectContaining({ code: 'SLUG_TAKEN' })],
    })
    const again = await app.inject({
      ...create('chem-labs'),
      cookies,
      headers: mutationHeaders(deps),
    })
    expect({ status: again.statusCode, code: again.json().error.code }).toEqual({
      status: 409,
      code: 'SLUG_TAKEN',
    })
    await app.close()
  })

  it('an available name is available, and says nothing more', async () => {
    const { app, cookies } = await signedIn()
    const check = await app.inject({
      method: 'GET',
      url: '/v1/slugs/journey-app',
      cookies,
    })
    expect(check.statusCode).toBe(200)
    expect(check.json()).toEqual({ slug: 'journey-app', available: true })
    await app.close()
  })

  it('limits the check to 60 a minute per person, with Retry-After', async () => {
    const { deps, app, cookies } = await signedIn()
    for (let i = 0; i < 60; i += 1) {
      const ok = await app.inject({
        method: 'GET',
        url: '/v1/slugs/journey-app',
        cookies,
      })
      expect(ok.statusCode).toBe(200)
    }
    const limited = await app.inject({
      method: 'GET',
      url: '/v1/slugs/journey-app',
      cookies,
    })
    expect({ status: limited.statusCode, code: limited.json().error?.code }).toEqual({
      status: 429,
      code: 'RATE_LIMITED',
    })
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
    // Per PERSON: somebody else is not limited by it.
    const other = await loginAs(deps, 'bio_student')
    const theirs = await app.inject({
      method: 'GET',
      url: '/v1/slugs/journey-app',
      cookies: other,
    })
    expect(theirs.statusCode).toBe(200)
    await app.close()
  })
})

/**
 * §22 step 3, at a commit. Project creation was the ONLY thing that had ever
 * validated a manifest.yaml, so a project's spec was fixed for its whole life —
 * an agent could push a manifest declaring a database and the platform would
 * never read it. `make demo` is what found that.
 */
describe('POST /v1/projects/:id/spec', () => {
  it('re-validates the manifest at HEAD after the repository changes', async () => {
    const { app, deps, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    const projectId = created.json().id as string

    // What an agent does: push a manifest declaring a database.
    const repo = deps.source.repositoryFor('chem-labs')
    const commitSha = await writeFiles(
      deps.source,
      repo,
      {
        'manifest.yaml': [
          'manifest: 1',
          'name: chem-labs',
          'blueprint: fixture-node@1',
          'runtime:',
          '  port: 3000',
          '  health: /healthz',
          'services:',
          '  - name: db',
          '    type: mongo',
          '    version: "7"',
          '',
        ].join('\n'),
      },
      'feat: declare a database',
    )

    const response = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/spec`,
      payload: {},
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.valid).toBe(true)
    expect(body.commitSha).toBe(commitSha)
    // THE POINT. Before this route existed, GET /spec still answered with the
    // seeded manifest and its empty service list, whatever the repository said.
    const latest = await app.inject({
      url: `/v1/projects/${projectId}/spec`,
      cookies: { manifest_session: session },
    })
    expect(latest.json().spec.services).toEqual([
      { name: 'db', type: 'mongo', version: '7' },
    ])
    // ANNOUNCED, once (the authoring API plan's Decision 7): every validation publishes
    // `spec.validated`, not only a project's creation.
    const announced = await deps.db
      .select({ machineDetail: events.machineDetail, humanMessage: events.humanMessage })
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(asc(events.createdAt))
    const validated = announced.filter(
      (e) =>
        (e.machineDetail as { commitSha?: string }).commitSha === commitSha &&
        (e.machineDetail as { appSpecId?: string }).appSpecId === body.appSpecId,
    )
    expect(validated).toEqual([
      {
        machineDetail: {
          appSpecId: body.appSpecId,
          commitSha,
          valid: true,
          errorCount: 0,
        },
        humanMessage: "chem-labs's manifest.yaml is valid.",
      },
    ])
    await app.close()
  })

  it('announces an INVALID validation too, with how many problems — Decision 7', async () => {
    const { app, deps, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    const projectId = created.json().id as string
    const commitSha = await writeFiles(
      deps.source,
      deps.source.repositoryFor('chem-labs'),
      { 'manifest.yaml': 'manifest: 1\nname: chem-labs\n' },
      'a manifest missing its blueprint and runtime',
    )
    const response = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/spec`,
      payload: {},
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    expect(response.statusCode, response.body).toBe(201)
    const body = response.json() as {
      valid: boolean
      errors: unknown[]
      appSpecId: string
    }
    expect(body.valid).toBe(false)
    const rows = await deps.db
      .select({
        type: events.type,
        machineDetail: events.machineDetail,
        humanMessage: events.humanMessage,
      })
      .from(events)
      .where(eq(events.projectId, projectId))
    const mine = rows.filter(
      (e) => (e.machineDetail as { appSpecId?: string }).appSpecId === body.appSpecId,
    )
    expect(mine).toEqual([
      {
        type: 'spec.validated',
        machineDetail: {
          appSpecId: body.appSpecId,
          commitSha,
          valid: false,
          errorCount: body.errors.length,
        },
        humanMessage: `chem-labs's manifest.yaml has ${body.errors.length} problem(s) to fix.`,
      },
    ])
    expect(body.errors.length).toBeGreaterThan(0)
    await app.close()
  })

  /**
   * A COMMIT THE REPOSITORY DOES NOT HAVE IS NOT AN INVALID MANIFEST (the D5 plan's Task 7,
   * its route consequence recorded in Task 8). Until `readFile` refused it, the route read
   * `null`, validated an empty manifest and RECORDED an invalid spec for a commit it never
   * read — a row that says a person's commit is broken when it does not exist.
   */
  it('refuses a commit the repository does not have, and records nothing — beside one it has', async () => {
    const { app, deps, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    const projectId = created.json().id as string
    const validate = (commitSha: string) =>
      app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/spec`,
        payload: { commitSha },
        cookies: { manifest_session: session },
        headers: mutationHeaders(deps),
      })
    const before = await deps.db
      .select()
      .from(appSpecs)
      .where(eq(appSpecs.projectId, projectId))
    const missing = await validate('f'.repeat(40))
    expect(refusal(missing)).toEqual({ status: 409, code: 'SOURCE_COMMIT_NOT_FOUND' })
    const after = await deps.db
      .select()
      .from(appSpecs)
      .where(eq(appSpecs.projectId, projectId))
    expect(after).toHaveLength(before.length)
    // The positive control: the seeded commit, named the same way, validates.
    const seeded = await validate(created.json().spec.commitSha as string)
    expect(seeded.statusCode, seeded.body).toBe(201)
    expect(seeded.json().valid).toBe(true)
    await app.close()
  })

  it('REPORTS a sensitive diff (D9) rather than silently accepting it', async () => {
    const { app, deps, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    const projectId = created.json().id as string

    const repo = deps.source.repositoryFor('chem-labs')
    await writeFiles(
      deps.source,
      repo,
      {
        'manifest.yaml': [
          'manifest: 1',
          'name: chem-labs',
          'blueprint: fixture-node@1',
          'runtime:',
          '  port: 3000',
          '  health: /healthz',
          'services:',
          '  - name: db',
          '    type: mongo',
          '    version: "7"',
          '',
        ].join('\n'),
      },
      'feat: declare a database',
    )
    const response = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/spec`,
      payload: {},
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    // Adding a service is sensitive under D9. It is REPORTED and not enforced —
    // the escalation and step-up re-auth it feeds are P6's — but `isSensitiveDiff`
    // now has a call site outside its own unit test, which it did not before.
    expect(response.json().sensitiveDiff).toEqual({
      sensitive: true,
      fields: ['services'],
    })
    await app.close()
  })

  it('reports NO sensitive diff for an unchanged manifest that declares a service (P5a sitting 6)', async () => {
    // Through the database, because that is where the shape changes: the previous spec is
    // read back from jsonb, whose key order is not zod's.
    const { app, deps, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    const projectId = created.json().id as string
    await writeFiles(
      deps.source,
      deps.source.repositoryFor('chem-labs'),
      {
        'manifest.yaml': [
          'manifest: 1',
          'name: chem-labs',
          'blueprint: fixture-node@1',
          'runtime:',
          '  port: 3000',
          '  health: /healthz',
          'services:',
          '  - name: db',
          '    type: mongo',
          '    version: "7"',
          '',
        ].join('\n'),
      },
      'feat: declare a database',
    )
    const validate = () =>
      app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/spec`,
        payload: {},
        cookies: { manifest_session: session },
        headers: mutationHeaders(deps),
      })
    expect((await validate()).json().sensitiveDiff.sensitive).toBe(true)
    const again = await validate()
    expect(again.statusCode).toBe(201)
    expect(again.json().sensitiveDiff).toEqual({ sensitive: false, fields: [] })
    await app.close()
  })

  it('records an INVALID manifest as a row rather than throwing it away', async () => {
    const { app, deps, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    const projectId = created.json().id as string
    const repo = deps.source.repositoryFor('chem-labs')
    await writeFiles(
      deps.source,
      repo,
      { 'manifest.yaml': 'manifest: 1\nname: chem-labs\n' },
      'break it',
    )
    const response = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/spec`,
      payload: {},
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    // 201: the validation RAN and its answer is "no". A build then refuses with
    // SPEC_INVALID, which is where the failure belongs (P2's build route).
    expect(response.statusCode).toBe(201)
    expect(response.json().valid).toBe(false)
    expect(response.json().errors.length).toBeGreaterThan(0)
    await app.close()
  })
})

describe('POST /v1/projects/:id/members', () => {
  it('lets an owner add a collaborator, who can then read the project', async () => {
    const { app, deps, session, steppedUp } = await loggedIn('bio_prof')
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    const id = created.json().id

    // The invitee needs a §6 User row — a session names a userId, and a member
    // row references it. `loginAs` creates it, exactly as the shim's login did.
    const { manifest_session: inviteeSession } = await loginAs(deps, 'bio_student')

    const added = await app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/members`,
      payload: { puid: 'bio_student', role: 'collaborator' },
      cookies: { manifest_session: steppedUp },
      headers: mutationHeaders(deps),
    })
    expect(added.statusCode).toBe(201)

    const read = await app.inject({
      method: 'GET',
      url: `/v1/projects/${id}`,
      cookies: { manifest_session: inviteeSession },
    })
    expect(read.statusCode).toBe(200)
    await app.close()
  })

  it('refuses a collaborator with 403 — they are a member, so nothing is hidden', async () => {
    const { app, deps, session, steppedUp } = await loggedIn('bio_prof')
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    const id = created.json().id

    const { manifest_session: inviteeSession } = await loginAs(deps, 'bio_student')
    await app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/members`,
      payload: { puid: 'bio_student', role: 'collaborator' },
      cookies: { manifest_session: steppedUp },
      headers: mutationHeaders(deps),
    })

    const response = await app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/members`,
      payload: { puid: 'unrelated_user', role: 'collaborator' },
      cookies: { manifest_session: inviteeSession },
      headers: mutationHeaders(deps),
    })
    // 403, not 404: a collaborator already knows this project exists.
    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('FORBIDDEN')
    await app.close()
  })
})

/**
 * D17 at the route (P4b Task 6). The route used to restate the model catalogue as an
 * array; these prove it reads `deps.catalogue` instead, and pin what it does when
 * that catalogue is switched off or cannot be read.
 */
describe('the model catalogue a spec is validated against', () => {
  async function withCatalogue(catalogue: ModelCatalogue) {
    const deps = { ...(await testDeps()), catalogue }
    const app = await buildServer(deps)
    const { manifest_session: session } = await loginAs(deps, 'bio_prof')
    return { app, deps, session }
  }

  /** A manifest for `slug` declaring one model, with a budget so nothing else fires. */
  const aiManifest = (slug: string, classification: string) =>
    [
      'manifest: 1',
      `name: ${slug}`,
      'blueprint: fixture-node@1',
      'runtime:',
      '  port: 3000',
      '  health: /healthz',
      'data:',
      `  classification: ${classification}`,
      'ai:',
      '  models: [default-chat]',
      '  budget:',
      '    project_monthly_usd: 10',
      '',
    ].join('\n')

  async function createAndPush(
    { app, deps, session }: Awaited<ReturnType<typeof withCatalogue>>,
    slug: string,
    manifest: string,
  ) {
    const created = await app.inject({
      ...create(slug),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    expect(created.statusCode).toBe(201)
    await writeFiles(
      deps.source,
      deps.source.repositoryFor(slug),
      { 'manifest.yaml': manifest },
      'feat: ask a model',
    )
    return app.inject({
      method: 'POST',
      url: `/v1/projects/${created.json().id as string}/spec`,
      payload: {},
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
  }

  const codes = (body: { errors: { code: string }[] }) => body.errors.map((e) => e.code)

  it('reads deps.catalogue: one manifest, two catalogues, two answers', async () => {
    // infra/litellm/config.yaml approves default-chat up to `internal`, so a
    // confidential app is refused it (D17)...
    const declared = await withCatalogue(declaredCatalogue())
    const refused = await createAndPush(
      declared,
      'chem-labs',
      aiManifest('chem-labs', 'confidential'),
    )
    expect(refused.json().valid).toBe(false)
    expect(codes(refused.json())).toEqual(['SPEC_MODEL_CLASSIFICATION_TOO_LOW'])
    await declared.app.close()

    // ...and a catalogue approving it for confidential data accepts the same file. A
    // list restated in the route would give the same answer both times.
    const approving = await withCatalogue({
      enabled: true,
      get: async () => ({
        models: [
          { name: 'default-chat', maxClassification: 'confidential', kind: 'chat' },
        ],
        unclassified: [],
      }),
    })
    const accepted = await createAndPush(
      approving,
      'bio-labs',
      aiManifest('bio-labs', 'confidential'),
    )
    expect(accepted.json()).toMatchObject({ valid: true, errors: [] })
    await approving.app.close()
  })

  it('with AI switched off: SPEC_AI_DISABLED, and the catalogue is never read', async () => {
    // Sitting 4's decision (finding 38). Not SPEC_MODEL_UNKNOWN, which is what an
    // empty catalogue gives and which blames the manifest for a platform setting.
    const catalogue = disabledCatalogue()
    const get = vi.spyOn(catalogue, 'get')
    const ctx = await withCatalogue(catalogue)
    const response = await createAndPush(
      ctx,
      'chem-labs',
      aiManifest('chem-labs', 'internal'),
    )
    expect(response.statusCode).toBe(201)
    expect(codes(response.json())).toEqual(['SPEC_AI_DISABLED'])
    // Neither validation — the seeded manifest's nor the pushed one's — read it.
    expect(get).not.toHaveBeenCalled()
    await ctx.app.close()
  })

  it('a gateway outage refuses NO app that declares no model — the catalogue is never read', async () => {
    // §7 as amended on 2026-09-14: an app that declares no model validates and deploys
    // as normal. Every project is created from a seeded manifest that declares none, so
    // until this a gateway outage was a 503 for every new project on the platform.
    const get = vi.fn().mockRejectedValue(
      new AiError(AI_CODES.BACKEND_UNAVAILABLE, 0, {
        status: 0,
        reason: 'unreachable',
      }),
    )
    const { app, deps, session } = await withCatalogue({ enabled: true, get })
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().spec.valid).toBe(true)
    expect(get).not.toHaveBeenCalled()
    await app.close()
  })

  it('a STARTER declaring a model during an outage is a 503, and creates nothing (P5a Task 11)', async () => {
    // The proof-app starter declares two models, so creation from it is the first creation
    // that reads the catalogue — BEFORE the project row or the repository (P4b finding 45).
    const get = vi.fn().mockRejectedValue(
      new AiError(AI_CODES.BACKEND_UNAVAILABLE, 0, {
        status: 0,
        reason: 'unreachable',
      }),
    )
    const { app, deps, session } = await withCatalogue({ enabled: true, get })
    const cookies = { manifest_session: session }
    const refused = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      cookies,
      headers: mutationHeaders(deps),
      payload: projectBody('journey-app', {
        blueprint: 'node-ts-mongo@1',
        starter: 'proof-app',
      }),
    })
    expect({ status: refused.statusCode, code: refused.json().error.code }).toEqual({
      status: 503,
      code: 'AI_BACKEND_UNAVAILABLE',
    })
    expect(get).toHaveBeenCalledTimes(1)
    const check = await app.inject({
      method: 'GET',
      url: '/v1/slugs/journey-app',
      cookies,
    })
    expect(check.json().available).toBe(true)
    // No repository: the driver has no head for the slug (a reference has no path to
    // check on disk since the D5 plan's Task 2 — the driver is the only one who knows).
    await expect(
      deps.source.headCommit(deps.source.repositoryFor('journey-app')),
    ).rejects.toMatchObject({ code: 'SOURCE_GIT_FAILED' })
    expect(await deps.db.select().from(events)).toEqual([])
    await app.close()
  })

  it('a spec push DECLARING a model during an outage is a 503, and stores no spec', async () => {
    const declared = declaredCatalogue()
    const get = vi.fn().mockImplementation(() => declared.get())
    const ctx = await withCatalogue({ enabled: true, get })
    const cookies = { manifest_session: ctx.session }
    // The gateway is down for exactly one read — the push's, since creation reads none.
    get.mockRejectedValueOnce(
      new AiError(AI_CODES.BACKEND_UNAVAILABLE, 0, { status: 0, reason: 'unreachable' }),
    )
    const refused = await createAndPush(
      ctx,
      'chem-labs',
      aiManifest('chem-labs', 'internal'),
    )
    // Not `500 INTERNAL`: the code and hint say the gateway is not answering.
    expect(refused.statusCode).toBe(503)
    expect(refused.json().error.code).toBe('AI_BACKEND_UNAVAILABLE')

    // NOTHING stored: the project's spec is still the one creation seeded.
    const [project] = (
      await ctx.app.inject({ method: 'GET', url: '/v1/projects', cookies })
    ).json()
    const spec = await ctx.app.inject({
      method: 'GET',
      url: `/v1/projects/${project.id as string}/spec`,
      cookies,
    })
    expect(spec.json().spec.ai.models).toEqual([])

    // The gateway is back, and the same push validates — and the budget it omitted is
    // STORED as the project's quota (§7 as amended 2026-09-14), not left for a reader
    // to interpret.
    const retried = await ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id as string}/spec`,
      payload: {},
      cookies,
      headers: mutationHeaders(ctx.deps),
    })
    expect(retried.json()).toMatchObject({ valid: true, errors: [] })
    await ctx.app.close()
  })

  it('an omitted AI budget is stored as the project quota', async () => {
    const ctx = await withCatalogue(declaredCatalogue())
    const cookies = { manifest_session: ctx.session }
    const noBudget = aiManifest('chem-labs', 'internal')
      .split('\n')
      .filter((line) => !/budget|project_monthly_usd/.test(line))
      .join('\n')
    expect(noBudget).not.toContain('project_monthly_usd')
    const pushed = await createAndPush(ctx, 'chem-labs', noBudget)
    expect(pushed.json()).toMatchObject({ valid: true, errors: [] })

    const [listed] = (
      await ctx.app.inject({ method: 'GET', url: '/v1/projects', cookies })
    ).json()
    const project = (
      await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${listed.id as string}`,
        cookies,
      })
    ).json()
    const spec = (
      await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${listed.id as string}/spec`,
        cookies,
      })
    ).json()
    // The route's own default is $50 when the project row carries no quota.
    const quota = Number(project.quota?.ai_monthly_usd ?? 50)
    expect(quota).toBeGreaterThan(0)
    expect(spec.spec.ai.budget.project_monthly_usd).toBe(quota)
    await ctx.app.close()
  })

  it('an unclassified catalogue entry refuses only the manifest that declares it', async () => {
    // §7 as amended on 2026-09-14. Before it, one unclassified entry made every
    // validation on the platform a 503 (finding 50).
    const { models } = await declaredCatalogue().get()
    const ctx = await withCatalogue({
      enabled: true,
      get: async () => ({
        models: models.filter((m) => m.name !== 'default-chat'),
        unclassified: ['default-chat'],
      }),
    })
    const refused = await createAndPush(
      ctx,
      'chem-labs',
      aiManifest('chem-labs', 'internal'),
    )
    expect(refused.statusCode).toBe(201)
    expect(codes(refused.json())).toEqual(['SPEC_MODEL_UNCLASSIFIED'])

    const accepted = await createAndPush(
      ctx,
      'bio-labs',
      aiManifest('bio-labs', 'internal').replace('[default-chat]', '[default-embed]'),
    )
    expect(accepted.json()).toMatchObject({ valid: true, errors: [] })
    await ctx.app.close()
  })
})

/**
 * A PROJECT'S NAME (the front-end enablement plan's Task 6; §6 as Spec action 4 amended it on
 * 2026-09-27): what people call the project — set at creation, the slug when none is given, and
 * changed by `PATCH /v1/projects/{projectId}`, the API's first `PATCH`. It is never part of an
 * address: every hostname, the repository and anything else §23 derives stays the slug's.
 */
describe('a project’s name (Task 6)', () => {
  const rename = (
    ctx: TestProject,
    name: unknown,
    options: {
      cookies?: Record<string, string>
      headers?: Record<string, string>
    } = {},
  ) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/v1/projects/${ctx.projectId}`,
      cookies: options.cookies ?? ctx.ownerCookies,
      headers: options.headers ?? mutationHeaders(ctx.deps),
      payload: { name },
    })

  const renamedEvents = (ctx: TestProject) =>
    ctx.db
      .select({
        machineDetail: events.machineDetail,
        humanMessage: events.humanMessage,
      })
      .from(events)
      .where(and(eq(events.projectId, ctx.projectId), eq(events.type, 'project.renamed')))
      .orderBy(asc(events.createdAt))

  it('names a project at creation, and the slug is the name when none is given', async () => {
    const { deps, app, cookies } = await signedIn()
    const named = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      cookies,
      headers: mutationHeaders(deps),
      payload: { ...projectBody('chem-121-labs'), name: '  CHEM 121 — Lab notebook  ' },
    })
    expect(named.statusCode, named.body).toBe(201)
    // Trimmed, and nothing else changed: the dash is an em dash, and stays one.
    expect(named.json()).toMatchObject({
      slug: 'chem-121-labs',
      name: 'CHEM 121 — Lab notebook',
    })
    const unnamed = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      cookies,
      headers: mutationHeaders(deps),
      payload: projectBody('bio-labs'),
    })
    expect(unnamed.statusCode, unnamed.body).toBe(201)
    expect(unnamed.json()).toMatchObject({ slug: 'bio-labs', name: 'bio-labs' })
    // Read back, not only answered.
    const read = await app.inject({
      method: 'GET',
      url: `/v1/projects/${named.json().id}`,
      cookies,
    })
    expect(read.json().name).toBe('CHEM 121 — Lab notebook')
    await app.close()
  })

  it('renames a project, answers the project, and publishes project.renamed naming the person', async () => {
    await withProjectServer(async (ctx) => {
      const before = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        cookies: ctx.ownerCookies,
      })
      const frames: { type?: string; machineDetail?: unknown }[] = []
      const publish = ctx.deps.bus.publish.bind(ctx.deps.bus)
      ctx.deps.bus.publish = (frame) => {
        frames.push(frame as never)
        publish(frame)
      }
      const res = await rename(ctx, 'Organic Chemistry Labs')
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({
        id: ctx.projectId,
        slug: before.json().slug,
        name: 'Organic Chemistry Labs',
      })
      // Streamed …
      expect(frames.map((f) => f.type)).toEqual(['project.renamed'])
      expect(frames[0]!.machineDetail).toEqual({
        from: before.json().slug,
        to: 'Organic Chemistry Labs',
        via: 'session',
        userId: ctx.userId,
        tokenId: null,
      })
      // … and recorded, its sentence naming the person and never a PUID.
      const recorded = await renamedEvents(ctx)
      expect(recorded).toHaveLength(1)
      // Both names QUOTED (the review's Minor 1): a name is somebody's free text inside a
      // sentence the owner reads, and quotes keep it one phrase.
      expect(recorded[0]!.humanMessage).toBe(
        `Bio Prof renamed the project from “${before.json().slug}” to “Organic Chemistry Labs”.`,
      )
    })
  })

  it('a rename to the name it already has answers the project and publishes nothing', async () => {
    await withProjectServer(async (ctx) => {
      const first = await rename(ctx, 'Organic Chemistry Labs')
      expect(first.statusCode, first.body).toBe(200)
      // A DIFFERENT key, so this is a second request and not a replay of the first.
      const again = await rename(ctx, '  Organic Chemistry Labs ')
      expect(again.statusCode, again.body).toBe(200)
      expect(again.json().name).toBe('Organic Chemistry Labs')
      expect(await renamedEvents(ctx)).toHaveLength(1)
    })
  })

  it('a rename changes no hostname, no repository and no slug', async () => {
    await withProjectServer(async (ctx) => {
      const read = () =>
        ctx.app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.projectId}?expand=environments`,
          cookies: ctx.ownerCookies,
        })
      const before = (await read()).json()
      expect((await rename(ctx, 'Something else entirely')).statusCode).toBe(200)
      const after = (await read()).json()
      expect(after.name).toBe('Something else entirely')
      expect(after.slug).toBe(before.slug)
      expect(after.repository).toEqual(before.repository)
      expect(after.environments.map((e: { hostname: string }) => e.hostname)).toEqual(
        before.environments.map((e: { hostname: string }) => e.hostname),
      )
      expect(after.environments.map((e: { url: string }) => e.url)).toEqual(
        before.environments.map((e: { url: string }) => e.url),
      )
    })
  })

  it('refuses a name with a control character, or of 81 characters, as a malformed request', async () => {
    await withProjectServer(async (ctx) => {
      // The positive control: 80 characters, the bound, is a name.
      const eighty = 'x'.repeat(80)
      expect((await rename(ctx, eighty)).statusCode).toBe(200)
      for (const name of [
        'x'.repeat(81),
        'a tab\there',
        'a line\nbreak',
        'an escape \u001b[31m',
        'a C1 \u009b control',
        'a lone \ud800 surrogate',
        '   ',
        '',
        // The review's Minor 1, re-graded: "on one line", with something to see, and no mark
        // that reorders the sentence a name is read in.
        'a line\u2028separator',
        'a paragraph\u2029separator',
        'a \u202eright-to-left override',
        'an \u2066isolate\u2069',
        'a \u200eleft-to-right mark',
        '\u200b\u200b',
      ]) {
        expect(refusal(await rename(ctx, name)), JSON.stringify(name)).toEqual({
          status: 400,
          code: 'REQUEST_INVALID',
        })
      }
      // And at creation, by the same rule.
      const created = await ctx.app.inject({
        method: 'POST',
        url: '/v1/projects',
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
        payload: { ...projectBody('ctl-name'), name: 'bell\u0007' },
      })
      expect(refusal(created)).toEqual({ status: 400, code: 'REQUEST_INVALID' })
      // Nothing was renamed by any refusal.
      const read = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        cookies: ctx.ownerCookies,
      })
      expect(read.json().name).toBe(eighty)
    })
  })

  it('the first PATCH is a mutation: a session’s needs its Origin and an Idempotency-Key', async () => {
    // The review's Minor 6, re-graded: every rename test sends both, so dropping 'PATCH' from
    // the server's MUTATING set left all of Task 6 green. §20's CSRF and D23.6's key, asserted.
    await withProjectServer(async (ctx) => {
      const { origin, 'idempotency-key': key } = mutationHeaders(ctx.deps)
      const noOrigin = await rename(ctx, 'No origin', {
        headers: { 'idempotency-key': key },
      })
      expect(refusal(noOrigin)).toEqual({ status: 403, code: 'CSRF_ORIGIN_REFUSED' })
      const noKey = await rename(ctx, 'No key', { headers: { origin } })
      expect(refusal(noKey)).toEqual({ status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' })
      // The positive control: both present, and it renames.
      expect(
        (await rename(ctx, 'Both', { headers: { origin, 'idempotency-key': key } }))
          .statusCode,
      ).toBe(200)
    })
  })

  it('a collaborator renames; a stranger is not told the project exists', async () => {
    await withProjectServer(async (ctx) => {
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator')
      expect(
        (await rename(ctx, 'Named by a collaborator', { cookies: collaborator }))
          .statusCode,
      ).toBe(200)
      const stranger = await sessionFor(ctx, 'unrelated_user')
      expect(
        refusal(await rename(ctx, 'Named by a stranger', { cookies: stranger })),
      ).toEqual({ status: 404, code: 'NOT_FOUND' })
    })
  })

  it('a token holding project:write renames; one holding only project:read is refused', async () => {
    await withProjectServer(async (ctx) => {
      const withToken = async (capabilities: string[], name: string) => {
        const { plaintext, row } = await mintTestToken(ctx.db, {
          userId: ctx.userId,
          projectId: ctx.projectId,
          capabilities,
          name: 'naming-agent',
        })
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: `/v1/projects/${ctx.projectId}`,
          headers: {
            authorization: `Bearer ${plaintext}`,
            'idempotency-key': randomUUID(),
          },
          payload: { name },
        })
        return { res, tokenId: row.id }
      }
      const allowed = await withToken(
        ['project:read', 'project:write'],
        'Named by an agent',
      )
      expect(allowed.res.statusCode, allowed.res.body).toBe(200)
      expect(allowed.res.json().name).toBe('Named by an agent')
      const [event] = await renamedEvents(ctx)
      expect(event!.machineDetail).toMatchObject({
        via: 'token',
        userId: ctx.userId,
        tokenId: allowed.tokenId,
      })
      expect(event!.humanMessage).toContain("Bio Prof's agent (token 'naming-agent')")
      const refused = await withToken(['project:read'], 'Not allowed')
      expect(refusal(refused.res)).toEqual({ status: 403, code: 'FORBIDDEN' })
    })
  })

  it('a retried rename with the same key is one rename and one event', async () => {
    await withProjectServer(async (ctx) => {
      const headers = mutationHeaders(ctx.deps)
      const first = await rename(ctx, 'Once', { headers })
      const second = await rename(ctx, 'Once', { headers })
      expect(first.statusCode, first.body).toBe(200)
      expect(second.statusCode).toBe(200)
      expect(second.json()).toEqual(first.json())
      expect(await renamedEvents(ctx)).toHaveLength(1)
    })
  })
})
