import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDatabase } from '../db/testing.js'
import { buildServer } from './server.js'
import { loginAs, mutationHeaders, testDeps } from './testing.js'
import type { TestUserPuid } from '../identity/testing.js'
import { AI_CODES, AiError, disabledCatalogue, type ModelCatalogue } from '../ai/index.js'
import { declaredCatalogue } from '../ai/testing.js'

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
  return { app, deps, session }
}

const create = (slug: string) => ({
  method: 'POST' as const,
  url: '/v1/projects',
  payload: { slug, blueprint: 'fixture-node@1' },
})

describe('POST /v1/projects', () => {
  it('creates a project with three environments and a seeded repository', async () => {
    const { app, deps, session } = await loggedIn()
    const response = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.slug).toBe('chem-labs')
    expect(body.repositoryUrl).toMatch(/^file:\/\/.*chem-labs\.git$/)
    expect(body.commitSha).toMatch(/^[0-9a-f]{40}$/)
    expect(body.specValid).toBe(true)
    expect(body.environments.map((e: { kind: string }) => e.kind).sort()).toEqual([
      'production',
      'sandbox',
      'staging',
    ])
    await app.close()
  })

  it('refuses a mutating request with no Idempotency-Key', async () => {
    const { app, deps, session } = await loggedIn()
    const response = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      // The ORIGIN is present, so the refusal is the key's and not §20's (P5a Task 4).
      headers: { origin: deps.config.sp.origin },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
    await app.close()
  })

  it('creates one project when the same request is replayed', async () => {
    const { app, deps, session } = await loggedIn()
    // ONE object, so both requests carry the same key — which is the replay.
    const headers = mutationHeaders(deps)
    const first = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers,
    })
    const second = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers,
    })
    expect(second.statusCode).toBe(first.statusCode)
    expect(second.json().id).toBe(first.json().id)

    const list = await app.inject({
      method: 'GET',
      url: '/v1/projects',
      cookies: { manifest_session: session },
    })
    expect(list.json()).toHaveLength(1)
    await app.close()
  })

  it('rejects a slug §7 would not accept', async () => {
    const { app, deps, session } = await loggedIn()
    const response = await app.inject({
      ...create('Chem_Labs'),
      cookies: { manifest_session: session },
      headers: mutationHeaders(deps),
    })
    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('refuses an unauthenticated request', async () => {
    const { app, deps } = await loggedIn()
    const response = await app.inject({
      ...create('chem-labs'),
      headers: mutationHeaders(deps),
    })
    expect(response.statusCode).toBe(401)
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
    expect(spec.json().commitSha).toBe(created.json().commitSha)
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
  const PROJECT_KEYS = ['audience', 'blueprint', 'createdAt', 'id', 'owner', 'slug']

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
  async function signedIn() {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')
    return { deps, app, cookies }
  }

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
        payload: { slug, blueprint: 'fixture-node@1' },
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
    const commitSha = await deps.source.commitFiles(
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
    await deps.source.commitFiles(
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
    await deps.source.commitFiles(
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
    await deps.source.commitFiles(
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
    const { app, deps, session } = await loggedIn('bio_prof')
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
      cookies: { manifest_session: session },
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
    const { app, deps, session } = await loggedIn('bio_prof')
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
      cookies: { manifest_session: session },
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
    await deps.source.commitFiles(
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
    expect(created.json().specValid).toBe(true)
    expect(get).not.toHaveBeenCalled()
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
