import { createHash } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../db/testing.js'
import { buildServer } from './server.js'
import { loginAs, testDeps } from './testing.js'

// A real server signs a real user in, and that row is committed.
beforeEach(resetDatabase)
afterAll(resetDatabase)

async function signedIn() {
  const deps = await testDeps()
  const app = await buildServer(deps)
  const cookies = await loginAs(deps, 'bio_prof')
  return { deps, app, cookies }
}

describe('blueprints over the API (§25, D25 — P5a Task 10)', () => {
  it('lists every blueprint with its starters, and nothing registry-internal', async () => {
    const { app, cookies } = await signedIn()
    const res = await app.inject({ method: 'GET', url: '/v1/blueprints', cookies })
    expect(res.statusCode).toBe(200)
    const list = res.json() as { ref: string; starters: unknown }[]
    expect(list.map((b) => b.ref).sort()).toEqual(['fixture-node@1', 'node-ts-mongo@1'])
    const ntm = list.find((b) => b.ref === 'node-ts-mongo@1')!
    expect(ntm).toEqual({
      ref: 'node-ts-mongo@1',
      name: 'node-ts-mongo',
      majorVersion: 1,
      language: 'typescript',
      defaultPort: 3000,
      healthPath: '/healthz',
      schemaVersions: [1],
      provides: { services: ['mongo'], authProviders: ['cwl', 'none'], ai: true },
      starters: [{ name: 'proof-app', summary: expect.stringContaining('CWL sign-in') }],
    })
    expect(list.find((b) => b.ref === 'fixture-node@1')!.starters).toEqual([])
    const text = res.body
    expect(text).not.toContain('sha256:') // no base-image digest
    expect(text).not.toContain('run_as_uid')
    expect(text).not.toContain('manifest-registry')
    await app.close()
  })

  it('answers one blueprint by its reference, and an unknown one 404 NOT_FOUND', async () => {
    const { app, cookies } = await signedIn()
    const one = await app.inject({
      method: 'GET',
      url: '/v1/blueprints/node-ts-mongo@1',
      cookies,
    })
    expect(one.statusCode).toBe(200)
    expect(one.json()).toMatchObject({
      ref: 'node-ts-mongo@1',
      starters: [{ name: 'proof-app' }],
    })
    for (const url of ['/v1/blueprints/nope@1', '/v1/blueprints/node-ts-mongo@9']) {
      const res = await app.inject({ method: 'GET', url, cookies })
      expect({ status: res.statusCode, code: res.json().error.code }).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
    }
    // Not a reference at all: the request is malformed, not a missing resource.
    const malformed = await app.inject({
      method: 'GET',
      url: '/v1/blueprints/Node',
      cookies,
    })
    expect({ status: malformed.statusCode, code: malformed.json().error.code }).toEqual({
      status: 400,
      code: 'REQUEST_INVALID',
    })
    await app.close()
  })

  it('serves a known blueprint’s knowledge pack, each file with the digest of its content', async () => {
    const { app, cookies } = await signedIn()
    const res = await app.inject({
      method: 'GET',
      url: '/v1/blueprints/node-ts-mongo@1/knowledge-pack',
      cookies,
    })
    expect(res.statusCode).toBe(200)
    const pack = res.json() as {
      blueprint: string
      files: { path: string; mediaType: string; sha256: string; content: string }[]
    }
    expect(pack.blueprint).toBe('node-ts-mongo@1')
    expect(pack.files.map((f) => f.path)).toContain('AGENTS.md')
    for (const file of pack.files) {
      expect(file.sha256).toBe(createHash('sha256').update(file.content).digest('hex'))
    }
    const missing = await app.inject({
      method: 'GET',
      url: '/v1/blueprints/nope@1/knowledge-pack',
      cookies,
    })
    expect({ status: missing.statusCode, code: missing.json().error.code }).toEqual({
      status: 404,
      code: 'NOT_FOUND',
    })
    await app.close()
  })
})
