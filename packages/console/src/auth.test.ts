import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signOut } from './auth'

/**
 * THE ONE THING IN auth.ts THAT CAN BE WRONG SILENTLY, tested in Node with no DOM —
 * which is the half of Decision 7 that DOES have a tier: "the console's screens are
 * proved by a person clicking them and its CALLS are proved in Node".
 *
 * `signOut` is a call, and its first draft awaited `POST /auth/logout` and then left for
 * `/` whatever came back. A refused sign-out therefore reloaded the page, `getMe`
 * succeeded, and the person was still signed in with nothing saying so — ORIENTATION §4's
 * swallowed catch, which is this codebase's most productive defect.
 *
 * It asserts the STATUS, not `response.ok`, and both directions are here because a claim
 * that something is not refused is true of code that refuses nothing (P5b sitting 6, F5).
 */
describe('signOut asserts the shape of the answer (D23.7, §20)', () => {
  const originalFetch = globalThis.fetch
  let href: string

  beforeEach(() => {
    href = 'unchanged'
    // `signOut` reaches `window.location.href` only on the success path. Stubbed rather
    // than mocked away, so the positive control can assert that the redirect HAPPENED —
    // a test that only proved "it did not throw" would pass against a function that did
    // nothing at all.
    Object.defineProperty(globalThis, 'window', {
      value: {
        get location() {
          return {
            set href(value: string) {
              href = value
            },
            get href() {
              return href
            },
          }
        },
      },
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    Reflect.deleteProperty(globalThis, 'window')
    vi.restoreAllMocks()
  })

  const answering = (status: number) => {
    const fetchMock = vi.fn(async () => new Response(null, { status }))
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
    return fetchMock
  }

  it('leaves for / when the route answered 204', async () => {
    const fetchMock = answering(204)
    await signOut()
    expect(fetchMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST' })
    expect(href, 'a 204 must still end the session AND leave the page').toBe('/')
  })

  it.each([
    // What the console's OWN Vite server answers for POST /auth/logout when the console
    // is wrongly reached at 127.0.0.1:7104 — measured 2026-09-18.
    404,
    // §20's origin refusal, which a console served from another origin would get.
    403, 500, 502,
  ])('refuses %i and does NOT leave the page', async (status) => {
    answering(status)
    await expect(signOut()).rejects.toThrow(new RegExp(`answered ${status}, not 204`))
    expect(href, 'a refused sign-out must not look like a successful one').toBe(
      'unchanged',
    )
  })

  /**
   * The one `response.ok` would let through. Vite answers `GET /v1/me` with index.html
   * and 200 at 127.0.0.1:7104 (measured), so "the request succeeded" and "the control
   * plane ended the session" are different claims — which is the whole reason this keys
   * on 204 rather than on `ok`.
   */
  it('refuses a 200, which an `ok` check would have accepted', async () => {
    answering(200)
    await expect(signOut()).rejects.toThrow(/answered 200, not 204/)
    expect(href).toBe('unchanged')
  })
})
