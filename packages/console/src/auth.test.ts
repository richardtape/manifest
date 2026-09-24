import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signOut, stepUpUrl } from './auth'

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

  const answering = (status: number, body: string | null = null) => {
    const fetchMock = vi.fn(async () => new Response(body, { status }))
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
    return fetchMock
  }

  /**
   * P6b's F10, FIXED 2026-09-24: the route answers WHERE THE BROWSER GOES NEXT — the IdP's
   * single logout, so CWL forgets the person too. Before, it answered 204 and the console
   * went to `/`, and the next *Sign in with CWL* returned the previous person unasked.
   */
  it('leaves for the IdP’s single logout when the route names it', async () => {
    const idp =
      'https://idp.manifest.internal/module.php/saml/idp/singleLogout?SAMLRequest=x&SigAlg=y&Signature=z'
    const fetchMock = answering(200, JSON.stringify({ redirectTo: idp }))
    await signOut()
    expect(fetchMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST' })
    expect(href, 'the IdP must be told, or CWL signs the same person back in').toBe(idp)
  })

  it('leaves for / when the route has no IdP session to end', async () => {
    answering(200, JSON.stringify({ redirectTo: '/' }))
    await signOut()
    expect(href).toBe('/')
  })

  it.each([
    // What the console's OWN Vite server answers for POST /auth/logout when the console
    // is wrongly reached at 127.0.0.1:7104 — measured 2026-09-18.
    404,
    // §20's origin refusal, which a console served from another origin would get.
    403, 500, 502,
  ])('refuses %i and does NOT leave the page', async (status) => {
    answering(status)
    await expect(signOut()).rejects.toThrow(new RegExp(`answered ${status}, not 200`))
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
  it('refuses a 200 that is not the route’s answer — Vite’s index.html, which an `ok` check would accept', async () => {
    answering(200, '<!doctype html><html></html>')
    await expect(signOut()).rejects.toThrow(/did not say where to go next/)
    expect(href).toBe('unchanged')
  })

  it.each([
    ['204, the answer before F10 was fixed — Manifest’s session only', 204, null],
    ['no redirectTo', 200, '{}'],
    ['a javascript: URL', 200, JSON.stringify({ redirectTo: 'javascript:alert(1)' })],
    [
      'a protocol-relative URL',
      200,
      JSON.stringify({ redirectTo: '//evil.example.com/' }),
    ],
  ])('refuses %s', async (_name, status, body) => {
    answering(status, body)
    await expect(signOut()).rejects.toThrow()
    expect(href).toBe('unchanged')
  })
})

/**
 * §20's step-up link (P6a Task 18). The server re-checks `returnTo` (`safeReturnTo`), so the
 * property this asserts is the ENCODING: a path with a query string must arrive as ONE
 * parameter, or `?tab=x&y=z` would leave half of itself behind as a second query parameter
 * of `/auth/step-up` and the person would land somewhere else.
 */
describe('stepUpUrl', () => {
  it('names the step-up endpoint and carries the page back, encoded', () => {
    expect(stepUpUrl('/releases/abc/approval')).toBe(
      '/auth/step-up?returnTo=%2Freleases%2Fabc%2Fapproval',
    )
    const url = new URL(stepUpUrl('/projects/p?tab=records&x=1'), 'https://c.example')
    expect(url.pathname).toBe('/auth/step-up')
    expect([...url.searchParams.keys()]).toEqual(['returnTo'])
    expect(url.searchParams.get('returnTo')).toBe('/projects/p?tab=records&x=1')
  })
})
