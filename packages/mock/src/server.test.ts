import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ANSWERED, createMockServer, operationsOf, readDocument } from './server.js'

/**
 * THE MOCK'S OWN HALF OF D22. `server.ts` derives its paths from the document, so it cannot
 * answer an operation at the wrong URL; this is the other direction — every operation the
 * document declares has an entry in the routing table. Without it the mock silently
 * `501`s a route the contract grew, which reads to a front-end developer as a platform they
 * cannot use rather than as a mock they must extend.
 */
describe('manifest-mock answers the whole document', () => {
  it('has an entry for every operation the contract declares', async () => {
    const operations = operationsOf(await readDocument())
    const missing = operations
      .map((o) => o.operationId)
      .filter((id) => !ANSWERED.includes(id))
    expect(missing).toEqual([])
    // A document that failed to parse has no operations and no missing ones. Say which.
    expect(
      operations.length,
      'no operations were read from the document',
    ).toBeGreaterThan(30)
  })

  it('compiles a path template into a pattern that captures its parameters', async () => {
    const operations = operationsOf(await readDocument())
    const remove = operations.find((o) => o.operationId === 'removeMember')
    expect(remove?.names).toEqual(['projectId', 'userId'])
    const m = remove?.pattern.exec('/v1/projects/p-1/members/u-2')
    expect(m?.slice(1)).toEqual(['p-1', 'u-2'])
    // And it does NOT match one segment too many, which is what an unanchored pattern would.
    expect(remove?.pattern.test('/v1/projects/p-1/members/u-2/extra')).toBe(false)
  })
})

/**
 * The refusals a client switches on, driven over a real socket. Each asserts the CODE and
 * not only the status: `401`, `403` and `400` are all reachable here for more than one
 * reason, and a status-only assertion passes for the wrong one (CLAUDE.md).
 */
describe('manifest-mock refuses what the platform refuses', () => {
  let server: Server
  let origin: string

  beforeAll(async () => {
    server = createMockServer({ scanSilenceMs: 50 })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    origin = `http://127.0.0.1:${address.port}`
  })
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  const session = { cookie: 'manifest_session=mock-session' }

  it('answers a request with no credential 401 UNAUTHENTICATED', async () => {
    const response = await fetch(`${origin}/v1/me`)
    expect(response.status).toBe(401)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'UNAUTHENTICATED',
    )
  })

  it('answers a request carrying both credentials 400 CREDENTIAL_AMBIGUOUS', async () => {
    const response = await fetch(`${origin}/v1/me`, {
      headers: { ...session, authorization: 'Bearer mft_x_y' },
    })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'CREDENTIAL_AMBIGUOUS',
    )
  })

  it('answers a path the document does not declare 404 ROUTE_NOT_FOUND', async () => {
    const response = await fetch(`${origin}/v1/nonsense`, { headers: session })
    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'ROUTE_NOT_FOUND',
    )
  })

  it('answers the stream’s plain GET 426 EVENTS_UPGRADE_REQUIRED', async () => {
    const response = await fetch(
      `${origin}/v1/projects/22222222-2222-4222-8222-222222222222/events`,
      { headers: session },
    )
    expect(response.status).toBe(426)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'EVENTS_UPGRADE_REQUIRED',
    )
  })

  it('answers §26’s fleet 403 FORBIDDEN unless the role is admin', async () => {
    const member = await fetch(`${origin}/v1/fleet`, { headers: session })
    expect(member.status).toBe(403)
    expect(((await member.json()) as { error: { code: string } }).error.code).toBe(
      'FORBIDDEN',
    )
    // The positive half, on a second server: a refusal that is unconditional refuses
    // nothing in particular.
    const admin = createMockServer({ role: 'admin' })
    await new Promise<void>((resolve) => admin.listen(0, '127.0.0.1', resolve))
    const { port } = admin.address() as { port: number }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/fleet`, {
        headers: session,
      })
      expect(response.status).toBe(200)
      expect((await response.json()) as unknown[]).toHaveLength(1)
    } finally {
      await new Promise((resolve) => admin.close(resolve))
    }
  })
})
