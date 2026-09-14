import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { resetDatabase } from '../db/testing.js'
import { buildServer } from './server.js'
import { loginAs, testDeps } from './testing.js'
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
  url: '/projects',
  payload: { slug, blueprint: 'fixture-node@1' },
})

describe('POST /projects', () => {
  it('creates a project with three environments and a seeded repository', async () => {
    const { app, session } = await loggedIn()
    const response = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
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
    const { app, session } = await loggedIn()
    const response = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
    await app.close()
  })

  it('creates one project when the same request is replayed', async () => {
    const { app, session } = await loggedIn()
    const headers = { 'idempotency-key': randomUUID() }
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
      url: '/projects',
      cookies: { manifest_session: session },
    })
    expect(list.json()).toHaveLength(1)
    await app.close()
  })

  it('rejects a slug §7 would not accept', async () => {
    const { app, session } = await loggedIn()
    const response = await app.inject({
      ...create('Chem_Labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('refuses an unauthenticated request', async () => {
    const { app } = await loggedIn()
    const response = await app.inject({
      ...create('chem-labs'),
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(response.statusCode).toBe(401)
    await app.close()
  })
})

describe('GET /projects/:id', () => {
  it('expands environments only when asked (D23.1)', async () => {
    const { app, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    const id = created.json().id

    const plain = await app.inject({
      method: 'GET',
      url: `/projects/${id}`,
      cookies: { manifest_session: session },
    })
    expect(plain.json().environments).toBeUndefined()

    const expanded = await app.inject({
      method: 'GET',
      url: `/projects/${id}?expand=environments`,
      cookies: { manifest_session: session },
    })
    expect(expanded.json().environments).toHaveLength(3)
    await app.close()
  })

  it('returns the validated spec at the seeded commit', async () => {
    const { app, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    const spec = await app.inject({
      method: 'GET',
      url: `/projects/${created.json().id}/spec`,
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
      headers: { 'idempotency-key': randomUUID() },
    })
    const { manifest_session: otherSession } = await loginAs(deps, 'bio_student')

    const response = await app.inject({
      method: 'GET',
      url: `/projects/${created.json().id}`,
      cookies: { manifest_session: otherSession },
    })
    expect(response.statusCode).toBe(404)
    await app.close()
  })
})

/**
 * §22 step 3, at a commit. Project creation was the ONLY thing that had ever
 * validated a manifest.yaml, so a project's spec was fixed for its whole life —
 * an agent could push a manifest declaring a database and the platform would
 * never read it. `make demo` is what found that.
 */
describe('POST /projects/:id/spec', () => {
  it('re-validates the manifest at HEAD after the repository changes', async () => {
    const { app, deps, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
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
      url: `/projects/${projectId}/spec`,
      payload: {},
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.valid).toBe(true)
    expect(body.commitSha).toBe(commitSha)
    // THE POINT. Before this route existed, GET /spec still answered with the
    // seeded manifest and its empty service list, whatever the repository said.
    const latest = await app.inject({
      url: `/projects/${projectId}/spec`,
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
      headers: { 'idempotency-key': randomUUID() },
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
      url: `/projects/${projectId}/spec`,
      payload: {},
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
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

  it('records an INVALID manifest as a row rather than throwing it away', async () => {
    const { app, deps, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
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
      url: `/projects/${projectId}/spec`,
      payload: {},
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    // 201: the validation RAN and its answer is "no". A build then refuses with
    // SPEC_INVALID, which is where the failure belongs (P2's build route).
    expect(response.statusCode).toBe(201)
    expect(response.json().valid).toBe(false)
    expect(response.json().errors.length).toBeGreaterThan(0)
    await app.close()
  })
})

describe('POST /projects/:id/members', () => {
  it('lets an owner add a collaborator, who can then read the project', async () => {
    const { app, deps, session } = await loggedIn('bio_prof')
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    const id = created.json().id

    // The invitee needs a §6 User row — a session names a userId, and a member
    // row references it. `loginAs` creates it, exactly as the shim's login did.
    const { manifest_session: inviteeSession } = await loginAs(deps, 'bio_student')

    const added = await app.inject({
      method: 'POST',
      url: `/projects/${id}/members`,
      payload: { puid: 'bio_student', role: 'collaborator' },
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(added.statusCode).toBe(201)

    const read = await app.inject({
      method: 'GET',
      url: `/projects/${id}`,
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
      headers: { 'idempotency-key': randomUUID() },
    })
    const id = created.json().id

    const { manifest_session: inviteeSession } = await loginAs(deps, 'bio_student')
    await app.inject({
      method: 'POST',
      url: `/projects/${id}/members`,
      payload: { puid: 'bio_student', role: 'collaborator' },
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${id}/members`,
      payload: { puid: 'unrelated_user', role: 'collaborator' },
      cookies: { manifest_session: inviteeSession },
      headers: { 'idempotency-key': randomUUID() },
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
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(created.statusCode).toBe(201)
    await deps.source.commitFiles(
      deps.source.repositoryFor(slug),
      { 'manifest.yaml': manifest },
      'feat: ask a model',
    )
    return app.inject({
      method: 'POST',
      url: `/projects/${created.json().id as string}/spec`,
      payload: {},
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
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
      get: async () => [
        { name: 'default-chat', maxClassification: 'confidential', kind: 'chat' },
      ],
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

  it('a catalogue that cannot be read is a 503, and project creation leaves NOTHING', async () => {
    const declared = declaredCatalogue()
    const get = vi
      .fn()
      .mockRejectedValueOnce(
        new AiError(AI_CODES.BACKEND_UNAVAILABLE, 0, {
          status: 0,
          reason: 'unreachable',
        }),
      )
      .mockImplementation(() => declared.get())
    const { app, session } = await withCatalogue({ enabled: true, get })
    const cookies = { manifest_session: session }

    const refused = await app.inject({
      ...create('chem-labs'),
      cookies,
      headers: { 'idempotency-key': randomUUID() },
    })
    // Not `500 INTERNAL`: the code and hint say the gateway is not answering.
    expect(refused.statusCode).toBe(503)
    expect(refused.json().error.code).toBe('AI_BACKEND_UNAVAILABLE')
    const list = await app.inject({ method: 'GET', url: '/projects', cookies })
    expect(list.json()).toHaveLength(0)

    // The gateway is back, and the SAME slug is creatable — which it is not if the
    // refusal left a project row or a repository behind (finding 45).
    const retried = await app.inject({
      ...create('chem-labs'),
      cookies,
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(retried.statusCode).toBe(201)
    await app.close()
  })
})
