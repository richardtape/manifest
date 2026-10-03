import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InjectOptions } from 'fastify'
import { resetDatabase } from '../db/testing.js'
import { TOKEN_PREFIX } from '../tokens/index.js'
import { buildServer, type ServerDeps } from './server.js'
import { loginAs, mutationHeaders, testDeps, withProjectServer } from './testing.js'

/**
 * FE-30 (the faculty-ready plan's Task 3; §20 as its Spec action 3 has it): EVERY ANSWER CARRIES A
 * REQUEST ID, every refusal carries the same id in its body, and every refusal writes ONE operator
 * line with it — its time, the operation and its code, never its message. Table-driven over every
 * place a refusal leaves the server (Read this first 7); Task 1's `[M2]` measured which of them lost
 * the header (`frameworkErrors`, and a refusal raised inside the credential hook).
 *
 * The helpers say `id`, never `requestId`: that name already means a SAML AuthnRequest's id in
 * `auth.test.ts` (the plan's self-review, 2).
 */
beforeEach(resetDatabase)
afterAll(resetDatabase)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const NO_SUCH_PROJECT = '00000000-0000-4000-8000-000000000000'

let captured: string[]
beforeEach(() => {
  captured = []
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
    captured.push(String(line))
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

interface Ctx {
  deps: ServerDeps
  cookies: Record<string, string>
}

async function server() {
  const deps = await testDeps()
  const app = await buildServer(deps)
  const cookies = await loginAs(deps, 'bio_prof')
  return { deps, app, cookies }
}

/** The JSON lines the server wrote for one request, by its id. */
const linesFor = (id: string) =>
  captured
    .filter((l) => l.includes(id))
    .map((l) => JSON.parse(l) as Record<string, unknown>)

const PATHS: [string, (ctx: Ctx) => InjectOptions, number, string, string][] = [
  [
    'a contract refusal',
    ({ cookies }) => ({ method: 'GET', url: `/v1/projects/${NO_SUCH_PROJECT}`, cookies }),
    404,
    'NOT_FOUND',
    'getProject',
  ],
  [
    'the error handler’s 401',
    () => ({ method: 'GET', url: '/v1/me' }),
    401,
    'UNAUTHENTICATED',
    'getMe',
  ],
  [
    'a refusal raised inside the credential hook',
    ({ cookies }) => ({
      method: 'GET',
      url: '/v1/me',
      cookies,
      headers: { authorization: `Bearer ${TOKEN_PREFIX}_not-a-real-token` },
    }),
    400,
    'CREDENTIAL_AMBIGUOUS',
    'getMe',
  ],
  [
    'a body the parser refused',
    ({ deps, cookies }) => ({
      method: 'POST',
      url: '/v1/projects',
      cookies,
      headers: { ...mutationHeaders(deps), 'content-type': 'application/json' },
      payload: '{not json',
    }),
    400,
    'REQUEST_INVALID',
    'createProject',
  ],
  [
    'frameworkErrors: a path parameter over its limit',
    ({ cookies }) => ({ method: 'GET', url: `/v1/slugs/${'a'.repeat(101)}`, cookies }),
    400,
    'REQUEST_INVALID',
    'GET unmatched',
  ],
  [
    'frameworkErrors: a malformed URL',
    ({ cookies }) => ({ method: 'GET', url: '/v1/slugs/%E0%A4%A', cookies }),
    400,
    'REQUEST_INVALID',
    'GET unmatched',
  ],
  [
    'an unmatched route',
    () => ({ method: 'GET', url: '/v1/no-such-thing?private=words' }),
    404,
    'ROUTE_NOT_FOUND',
    'GET unmatched',
  ],
  [
    'the webhook receiver’s own refusal',
    () => ({
      method: 'POST',
      url: '/webhooks/github',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    }),
    404,
    'WEBHOOKS_NOT_CONFIGURED',
    'POST /webhooks/github',
  ],
  [
    'single logout’s own refusal',
    () => ({ method: 'GET', url: '/auth/logout?SAMLRequest=garbage' }),
    400,
    'SAML_LOGOUT_REJECTED',
    'GET /auth/logout',
  ],
]

describe('a request id on every answer, and every refusal logged (FE-30, §20)', () => {
  it.each(PATHS)(
    '%s carries x-request-id, the same id in its body, and one operator line without its message',
    async (_name, request, status, code, operation) => {
      const { app, deps, cookies } = await server()
      const sent = request({ deps, cookies })
      const res = await app.inject(sent)
      const id = res.headers['x-request-id'] as string
      expect(id).toMatch(UUID)
      const error = (res.json() as { error: { code: string; requestId?: string } }).error
      expect({ status: res.statusCode, code: error.code, id: error.requestId }).toEqual({
        status,
        code,
        id,
      })
      // EXACTLY these keys: no message, no hint, no body, no query string.
      expect(linesFor(id)).toEqual([
        {
          level: 'warn',
          msg: 'refused',
          requestId: id,
          at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          method: sent.method,
          operation,
          status,
          code,
        },
      ])
      // No credential reaches the log, whichever one the request carried.
      expect(captured.join('\n')).not.toMatch(
        new RegExp(`manifest_session|Bearer |${TOKEN_PREFIX}_`),
      )
      await app.close()
    },
  )

  it('a 500 writes the refused line first, then its own lines, every JSON line with the same id', async () => {
    const { app } = await server()
    app.get('/v1/__refusal-test-throws', async () => {
      throw new Error('three frames down')
    })
    const res = await app.inject({ method: 'GET', url: '/v1/__refusal-test-throws' })
    const id = res.headers['x-request-id'] as string
    expect(id).toMatch(UUID)
    expect({ status: res.statusCode, error: res.json().error }).toMatchObject({
      status: 500,
      error: { code: 'INTERNAL', requestId: id },
    })
    const lines = linesFor(id)
    expect(lines.map((l) => [l.msg, l.level])).toEqual([
      ['refused', 'error'],
      ['unhandled error', 'error'],
    ])
    // The stack, the operator's own copy, still follows them.
    const unhandled = captured.findIndex((l) => l.includes('"unhandled error"'))
    expect(captured.slice(unhandled + 1).join('\n')).toContain('three frames down')
    await app.close()
  })

  it('a refusal shown as a page carries the id in its header and in the words a person reads', async () => {
    const { app } = await server()
    const res = await app.inject({
      method: 'GET',
      url: '/auth/logout?SAMLRequest=garbage',
      headers: { accept: 'text/html' },
    })
    const id = res.headers['x-request-id'] as string
    expect(id).toMatch(UUID)
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toMatch(/^text\/html/)
    expect(res.body).toContain(id)
    expect(linesFor(id)).toHaveLength(1)
    await app.close()
  })

  it('the event stream’s plain GET — a 426 its own route sends — carries the id and its line too (sitting 2’s review)', async () => {
    await withProjectServer(async (ctx) => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/events`,
        cookies: ctx.ownerCookies,
      })
      const id = res.headers['x-request-id'] as string
      expect(id).toMatch(UUID)
      expect(res.headers.upgrade).toBe('websocket')
      const error = (res.json() as { error: { code: string; requestId?: string } }).error
      expect({ status: res.statusCode, code: error.code, id: error.requestId }).toEqual({
        status: 426,
        code: 'EVENTS_UPGRADE_REQUIRED',
        id,
      })
      expect(linesFor(id)).toEqual([
        expect.objectContaining({ msg: 'refused', requestId: id, status: 426 }),
      ])
    })
  })

  it('a success carries the header too, and writes no line', async () => {
    const { app, cookies } = await server()
    const res = await app.inject({ method: 'GET', url: '/v1/me', cookies })
    expect(res.statusCode).toBe(200)
    const id = res.headers['x-request-id'] as string
    expect(id).toMatch(UUID)
    expect(linesFor(id)).toEqual([])
    await app.close()
  })

  it('two requests are two ids', async () => {
    const { app, cookies } = await server()
    const a = await app.inject({ method: 'GET', url: '/v1/me', cookies })
    const b = await app.inject({ method: 'GET', url: '/v1/me', cookies })
    expect(a.headers['x-request-id']).toMatch(UUID)
    expect(b.headers['x-request-id']).toMatch(UUID)
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id'])
    await app.close()
  })

  it('an id a client sends is ignored: no caller writes into the platform’s log', async () => {
    const { app, cookies } = await server()
    const chosen = '11111111-1111-4111-8111-111111111111'
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${NO_SUCH_PROJECT}`,
      cookies,
      headers: { 'x-request-id': chosen, 'request-id': chosen },
    })
    expect(res.headers['x-request-id']).toMatch(UUID)
    expect(res.headers['x-request-id']).not.toBe(chosen)
    expect(res.json().error.requestId).not.toBe(chosen)
    expect(captured.join('\n')).not.toContain(chosen)
    await app.close()
  })
})
