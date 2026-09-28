import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildServer } from './server.js'
import { testDeps } from './testing.js'

/**
 * FE-17 (the front-end enablement plan's sitting 10): a person reaches `/auth/*` by NAVIGATING —
 * the IdP's auto-submitting form posts the callback, the IdP redirects to the single-logout
 * endpoint, and the console sends the browser to `/auth/step-up` — so whatever a refusal there
 * answers is what they SEE. It was the JSON envelope. A browser — a request whose `Accept` names
 * `text/html`, as every navigation's does — is now shown a short page that says what happened,
 * names the code for whoever helps them, and offers to start again on the SAME origin; any other
 * caller keeps the envelope exactly as it was, because a script switches on its code.
 */
const BROWSER = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

let app: Awaited<ReturnType<typeof buildServer>>
beforeAll(async () => {
  app = await buildServer(await testDeps())
})
afterAll(async () => {
  await app.close()
})

const callback = (accept: string | undefined, payload: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/saml/callback',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(accept === undefined ? {} : { accept }),
    },
    payload,
  })

function expectPage(
  res: Awaited<ReturnType<typeof app.inject>>,
  status: number,
  code: string,
): void {
  expect(res.statusCode).toBe(status)
  expect(res.headers['content-type']).toMatch(/^text\/html; charset=utf-8/)
  expect(res.headers['cache-control']).toBe('no-store')
  expect(res.body).toMatch(/^<!doctype html>/i)
  // The code, for whoever helps them — and never the JSON envelope.
  expect(res.body).toContain(code)
  expect(res.body).not.toContain('{"error"')
  // Start again on THIS origin: a relative link, never another host.
  expect(res.body).toContain('href="/auth/login"')
  expect(res.body).not.toMatch(/href="https?:/)
}

describe('a browser refused at /auth/* is shown a page (FE-17)', () => {
  it('shows a browser an unbound sign-in as a page; a non-browser caller keeps the envelope', async () => {
    const body = 'SAMLResponse=not-an-assertion&RelayState=abc'
    expectPage(await callback(BROWSER, body), 401, 'SAML_LOGIN_NOT_BOUND')
    // The positive control, same request, no browser: the envelope, byte-for-byte as before.
    const json = await callback('application/json', body)
    expect(json.statusCode).toBe(401)
    expect(json.headers['content-type']).toMatch(/^application\/json/)
    expect(json.json()).toEqual({
      error: {
        code: 'SAML_LOGIN_NOT_BOUND',
        message: 'sign-in could not be completed',
        hint: 'Start again at /auth/login. If it keeps failing, the control plane’s log has the reason.',
      },
    })
    // And with no Accept at all (curl's default is */*): the envelope.
    expect((await callback(undefined, body)).headers['content-type']).toMatch(
      /^application\/json/,
    )
  })

  it('shows a browser a malformed callback as a page', async () => {
    expectPage(await callback(BROWSER, 'RelayState=abc'), 400, 'REQUEST_INVALID')
  })

  it('shows a browser a refused single logout as a page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/logout?RelayState=abc',
      headers: { accept: BROWSER },
    })
    expectPage(res, 400, 'SAML_LOGOUT_REJECTED')
  })

  it('shows a browser sent to step up with no session a page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/step-up?returnTo=/',
      headers: { accept: BROWSER },
    })
    expectPage(res, 401, 'UNAUTHENTICATED')
  })

  it('leaves every non-/auth refusal as JSON, whatever the Accept', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { accept: BROWSER },
    })
    expect(res.statusCode).toBe(401)
    expect(res.headers['content-type']).toMatch(/^application\/json/)
  })
})
