import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signOut, stepUpUrl } from './auth'

/**
 * THE RAIL'S *SIGN OUT* ASSERTS THE SHAPE OF THE ANSWER — the reference console's `auth.test.ts`,
 * whole, against this console's copy of its `signOut`. Its first draft awaited `POST /auth/logout`
 * and left for `/` whatever came back, so a refused sign-out reloaded the page, `getMe` succeeded,
 * and the person was still signed in with nothing saying so. Both directions are here, because a
 * claim that something is not refused is true of code that refuses nothing.
 */
describe('signOut asserts the shape of the answer', () => {
  const originalFetch = globalThis.fetch
  let went: string

  beforeEach(() => {
    went = 'unchanged'
    // Stubbed rather than mocked away, so the positive control can assert that the browser LEFT —
    // a test that only proved "it did not throw" would pass against a function that did nothing.
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          assign(to: string) {
            went = to
          },
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

  it('leaves for the IdP’s single logout when the route names it', async () => {
    const idp =
      'https://idp.manifest.internal/module.php/saml/idp/singleLogout?SAMLRequest=x&SigAlg=y&Signature=z'
    const fetchMock = answering(200, JSON.stringify({ redirectTo: idp }))
    await signOut()
    expect(fetchMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST' })
    expect(went, 'the IdP must be told, or CWL signs the same person back in').toBe(idp)
  })

  it('leaves for / when the route has no IdP session to end — the mock’s answer', async () => {
    answering(200, JSON.stringify({ redirectTo: '/' }))
    await signOut()
    expect(went).toBe('/')
  })

  it.each([404, 403, 500, 502])(
    'refuses %i and does NOT leave the page',
    async (status) => {
      answering(status)
      await expect(signOut()).rejects.toThrow(new RegExp(`answered ${status}, not 200`))
      expect(went, 'a refused sign-out must not look like a successful one').toBe(
        'unchanged',
      )
    },
  )

  it('refuses a 200 that is not the route’s answer — a Vite server’s index.html', async () => {
    answering(200, '<!doctype html><html></html>')
    await expect(signOut()).rejects.toThrow(/did not say where to go next/)
    expect(went).toBe('unchanged')
  })

  it.each([
    ['204 — Manifest’s session only', 204, null],
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
    expect(went).toBe('unchanged')
  })
})

/**
 * THE STEP-UP ROUND TRIP COMES BACK TO THE SAME PREVIEW (Review Focus 3): the pane's own URL, the
 * preview's id in it, as `returnTo` — ENCODED, as the reference console encodes it
 * (`packages/console/src/auth.ts`), so the `?` and `=` of the return path are not read as the
 * step-up's own query.
 */
describe('stepUpUrl', () => {
  it('returns to the release’s pane and its preview, encoded', () => {
    const release = '6f1c2a40-3b2d-4c5e-9f10-1a2b3c4d5e6f'
    const preview = '7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d'
    expect(stepUpUrl(release, preview)).toBe(
      '/auth/step-up?returnTo=' +
        encodeURIComponent('/releases/' + release + '/approval?preview=' + preview),
    )
    expect(stepUpUrl(release, preview)).toBe(
      `/auth/step-up?returnTo=%2Freleases%2F${release}%2Fapproval%3Fpreview%3D${preview}`,
    )
  })
})
