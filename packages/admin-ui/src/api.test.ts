import { ManifestApiError } from '@manifest/contract'
import { createMockServer, fixtures, FLEET_PROJECTS } from '@manifest/mock'
import { describe, expect, it } from 'vitest'
import { createApi } from './api.js'
import { BAND, headlineOf } from './queue-state.js'

/**
 * THE CONSOLE'S CALLS, AGAINST `manifest-mock`, IN NODE — the reference console's pattern
 * (`packages/console/src/api.test.ts`): `createApi({ origin, session })` is the Node shape; in a
 * browser the console passes `{ origin: window.location.origin }` and the browser sends its own
 * cookie and `Origin`. Importing `@manifest/mock` here is outside the boundary by design: the
 * boundary test skips test files, and so does the lint rule.
 *
 * Every refusal asserts its CODE (CLAUDE.md, *Assert the shape of the answer*): a status-only `403`
 * is satisfied by any refusal at all.
 */
async function withMock<T>(
  fn: (origin: string) => Promise<T>,
  options: Parameters<typeof createMockServer>[0] = {},
): Promise<T> {
  const server = createMockServer({ scanSilenceMs: 50, ...options })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  try {
    return await fn(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const api = (origin: string) => createApi({ origin, session: 'mock-session' })

async function refusal(promise: Promise<unknown>): Promise<ManifestApiError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ManifestApiError)
  return error as ManifestApiError
}

describe('the administrator’s console’s client', () => {
  it('getMe answers an administrator under role admin, and a member without', async () => {
    const admin = await withMock((o) => api(o).getMe(), { role: 'admin' })
    expect(admin.role).toBe('admin')
    const member = await withMock((o) => api(o).getMe())
    expect(member.role).toBe('member')
  })

  it('listQueue and listFleet answer an administrator', async () => {
    await withMock(
      async (o) => {
        const queue = await api(o).listQueue()
        expect(Array.isArray(queue.items)).toBe(true)
        expect(typeof queue.truncated).toBe('boolean')
        const fleet = await api(o).listFleet()
        expect(fleet.map((p) => p.id)).toContain(fixtures.PROJECT_ID)
      },
      { role: 'admin' },
    )
  })

  it('refuses a member the queue and the fleet — 403 FORBIDDEN, each', async () => {
    await withMock(async (o) => {
      const queue = await refusal(api(o).listQueue())
      expect([queue.status, queue.code]).toEqual([403, 'FORBIDDEN'])
      const fleet = await refusal(api(o).listFleet())
      expect([fleet.status, fleet.code]).toEqual([403, 'FORBIDDEN'])
    })
  })

  /**
   * `getApproval` is the newest decision, and `404 NOT_FOUND` when nobody has decided — which is
   * not a failure for a console that is about to decide it, so the client answers `null` for that
   * and that alone.
   */
  it('getApproval answers the decision, and null when nobody has decided', async () => {
    const decided = await withMock((o) => api(o).getApproval(fixtures.RELEASE_ID), {
      role: 'admin',
    })
    expect(decided?.releaseId).toBe(fixtures.RELEASE_ID)
    const pending = await withMock((o) => api(o).getApproval(fixtures.RELEASE_ID), {
      role: 'admin',
      approval: 'pending',
    })
    expect(pending).toBeNull()
  })

  it('getApproval throws every other refusal — a signed-out read is 401 UNAUTHENTICATED, not null', async () => {
    // Only `404 NOT_FOUND` becomes `null`; any other refusal must reach <Refusal> or the sign-in
    // round trip, never read as "nobody has decided".
    await withMock(async (o) => {
      const signedOut = createApi({ origin: o })
      const error = await refusal(signedOut.getApproval(fixtures.RELEASE_ID))
      expect([error.status, error.code]).toEqual([401, 'UNAUTHENTICATED'])
    })
  })
})

/**
 * THE DEMO FLEET (`MANIFEST_MOCK_FLEET=demo`) — the queue the console is walked on. Its data carries
 * the headline's trap: our band's oldest wait is `reading-responses`' sign-off, while
 * `oldestSince` is a privacy assessment with the Privacy Office (`mock-app`'s).
 */
describe('the queue on the demo fleet', () => {
  const fleet = { role: 'admin', fleet: 'demo' } as const

  it('headlines reading-responses’ wait, not oldestSince — five people on our band', async () => {
    const queue = await withMock((o) => api(o).listQueue(), fleet)
    const rr = queue.items.find(
      (i) => i.kind === 'release-approval' && i.project.slug === 'reading-responses',
    )
    expect(rr?.project.id).toBe(
      FLEET_PROJECTS.find((p) => p.slug === 'reading-responses')?.id,
    )
    const headline = headlineOf(queue)
    expect(headline.oldestOnUs).toBe(rr?.since)
    expect(headline.peopleWaiting).toBe(5)
    expect(headline.truncated).toBe(false)
    const oldest = queue.items.find((i) => i.since === queue.oldestSince)
    expect(oldest && BAND[oldest.kind]).toBe('ubc')
    expect(queue.oldestSince).not.toBe(rr?.since)
  })
})
