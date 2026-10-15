import { ManifestApiError } from '@manifest/contract'
import { createMockServer, fixtures } from '@manifest/mock'
import { describe, expect, it } from 'vitest'
import { createApi } from './api.js'

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
