import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../db/testing.js'
import { buildServer } from './server.js'
import { rawQueryValues } from './routes/auth.js'
import { testDeps } from './testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

/**
 * §9: Manifest is its own SP, and `sso/platform.ts` registers
 * `<origin>/auth/logout` as that SP's SingleLogoutService. SAML's HTTP-Redirect
 * binding — which is what SimpleSAMLphp uses for single logout — delivers a
 * LogoutRequest as a **GET** carrying `?SAMLRequest=`.
 *
 * P5c sitting 9 (F11) found that the path answered `POST` only, so signing out of
 * ANY deployed app left the person on a raw JSON `404` and Manifest's own session
 * was never ended. The blueprint this platform GENERATES had already learned the
 * same lesson on 2026-09-09 — `skeleton/server.js` says an advertised logout path
 * that is not served is "a 404 in front of a real person the moment anything does".
 *
 * These assert the CODE, never merely "not 404": a refusal that moves in front of
 * this one must not keep the test green (§16, and P5a sitting 12's three controls
 * that could not fail).
 */
describe('single logout — the IdP’s LogoutRequest (§9, D15; P5c sitting 9, F11)', () => {
  it('answers a GET LogoutRequest as a SAML refusal, not as a missing route', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)

    const res = await app.inject({
      method: 'GET',
      url: '/auth/logout?SAMLRequest=not-a-real-request&RelayState=abc',
    })

    // STATUS FIRST, and deliberately. If the signature check is ever removed this
    // route redirects `302` with an empty body, and `res.json()` then throws
    // "Unexpected end of JSON input" — a red test that names the wrong thing.
    // Asserting the status first makes that failure read `expected 302 to be 400`.
    expect(res.statusCode).toBe(400)
    const code = res.json<{ error?: { code?: string } }>().error?.code
    expect(code).not.toBe('ROUTE_NOT_FOUND')
    expect(code).toBe('SAML_LOGOUT_REJECTED')
    await app.close()
  })

  it('refuses a GET with no SAMLRequest at all, because this is the SLO endpoint and not a sign-out link', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)

    const res = await app.inject({ method: 'GET', url: '/auth/logout' })

    expect(res.json<{ error?: { code?: string } }>().error?.code).toBe(
      'SAML_LOGOUT_REJECTED',
    )
    await app.close()
  })

  it('still clears the session on the console’s own POST, which is a different thing', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)

    const res = await app.inject({ method: 'POST', url: '/auth/logout' })

    expect(res.statusCode).toBe(204)
    expect(String(res.headers['set-cookie'] ?? '')).toContain('manifest_session=')
    await app.close()
  })
})

/**
 * F16, and the reason the browser test mattered: the route reached, the request
 * refused. `+` is a LITERAL character of the base64 alphabet and the SAML redirect
 * binding sends percent-encoded base64 — but every FORM decoder reads `+` as a
 * space, and `Buffer.from(x, 'base64')` then silently drops those spaces, leaving a
 * short deflate stream. node-saml dies in `inflateRawAsync` with "unexpected end of
 * file" before it ever looks at the signature, so single logout failed against the
 * real IdP while every test firing garbage at the route passed.
 */
describe('the redirect binding’s values are URI components, not form fields (F16)', () => {
  it('keeps a literal + in the SAMLRequest, where a form decoder would make it a space', () => {
    const query = 'SAMLRequest=ab+cd%2Bef&RelayState=xyz'

    expect(rawQueryValues(query).SAMLRequest).toBe('ab+cd+ef')

    // THE CONTRAST THAT MAKES THIS TEST MEAN SOMETHING. This is precisely what the
    // route used to receive, and `ab cd+ef` is not base64 — it is a shorter string
    // that decodes to fewer bytes and inflates to nothing.
    expect(new URLSearchParams(query).get('SAMLRequest')).toBe('ab cd+ef')
  })

  it('decodes percent-escapes, and does not choke on a malformed one', () => {
    expect(rawQueryValues('a=%2F%2B').a).toBe('/+')
    expect(rawQueryValues('a=%ZZ').a).toBe('%ZZ')
  })
})
