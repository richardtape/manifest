import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../db/testing.js'
import { verifySession } from '../identity/index.js'
import {
  authnRequestId,
  logoutRequestXml,
  testSamlIdp,
  testSessionCookies,
  type TestIdp,
} from '../identity/testing.js'
import { mintSpKeypair } from '../sso/index.js'
import { buildServer } from './server.js'
import { rawQueryValues } from './routes/auth.js'
import { testDeps } from './testing.js'

type App = Awaited<ReturnType<typeof buildServer>>
type Deps = Awaited<ReturnType<typeof testDeps>>

const SP_ENTITY = 'https://manifest.internal/sp/manifest-control-plane/platform'
const ORIGIN = 'https://console.manifest.internal'
const ACS = `${ORIGIN}/auth/saml/callback`
/** This SP's SLO URL — `sso/platform.ts` registers `<origin>/auth/logout`. */
const SLO = `${ORIGIN}/auth/logout`
const IDP_SLO = 'https://idp.test.manifest.internal/module.php/saml/idp/singleLogout'

const INSTRUCTOR: Record<string, string> = {
  'urn:oid:1.3.6.1.4.1.60.6.1.6': 'ins000001',
  'urn:oid:0.9.2342.19200300.100.1.3': 'instructor@ubc.ca',
  'urn:oid:2.5.4.42': 'Test',
  'urn:oid:2.5.4.4': 'Instructor',
}

/**
 * A REAL sign-in through the callback, against the test IdP — so the session under test
 * is one the ACS minted from an assertion, carrying whatever handle the ACS kept, and not
 * one a helper signed with the handle already in it.
 */
async function signIn(
  app: App,
  idp: TestIdp,
  sessionIndex = '_sess-ins',
): Promise<string> {
  const login = await app.inject({ method: 'GET', url: '/auth/login' })
  expect(login.statusCode).toBe(302)
  const location = login.headers.location as string
  const res = await app.inject({
    method: 'POST',
    url: '/auth/saml/callback',
    payload: {
      SAMLResponse: idp.sign({
        audience: SP_ENTITY,
        destination: ACS,
        inResponseTo: authnRequestId(location),
        attributes: INSTRUCTOR,
        sessionIndex,
      }),
      RelayState: new URL(location).searchParams.get('RelayState') ?? '',
    },
    cookies: {
      manifest_login: login.cookies.find((c) => c.name === 'manifest_login')!.value,
    },
  })
  expect(res.statusCode, res.body).toBe(302)
  return res.cookies.find((c) => c.name === 'manifest_session')!.value
}

/** The console's sign-out, as a browser sends it: the session, and §20's Origin. */
const consoleSignOut = (app: App, session?: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/logout',
    headers: { origin: ORIGIN },
    ...(session === undefined ? {} : { cookies: { manifest_session: session } }),
  })

/** The session cookie a response set: '' when it CLEARED it, undefined when it said nothing. */
const sessionSet = (res: { cookies: { name: string; value: string }[] }) =>
  res.cookies.find((c) => c.name === 'manifest_session')?.value

const code = (res: { json: <T>() => T }) =>
  res.json<{ error?: { code?: string } }>().error?.code

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

    // No session, so nothing to tell the IdP: back to the console's home.
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ redirectTo: '/' })
    expect(String(res.headers['set-cookie'] ?? '')).toContain('manifest_session=')
    await app.close()
  })
})

/**
 * THE IdP's LOGOUT MESSAGES MUST BE SIGNED (found 2026-09-24, fixing P6b's F10).
 *
 * This route's own comment said *"IT REQUIRES A SIGNED REQUEST"*, and nothing required
 * one. Measured from source: node-saml 5.1.0's `hasValidSignatureForRedirect` returns
 * `true` when the query carries no `Signature` at all, and SimpleSAMLphp v2.5.3.1 sent
 * none, because `sign.logout` was set nowhere. So any page could end a console session
 * with an `<img>` pointing at an unsigned LogoutRequest naming the IdP as its Issuer — the
 * logout-CSRF primitive the comment says this route is not. Every test above fired
 * garbage at the route, and a route that refuses garbage passed them all.
 */
describe('the IdP’s logout messages must be signed', () => {
  it('refuses an UNSIGNED LogoutRequest that is otherwise valid, and ends no session', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const session = await signIn(app, idp)

    const res = await app.inject({
      method: 'GET',
      url: `/auth/logout?${idp.redirect({ kind: 'LogoutRequest', destination: SLO, unsigned: true })}`,
      cookies: { manifest_session: session },
    })

    expect(res.statusCode).toBe(400)
    expect(code(res)).toBe('SAML_LOGOUT_REJECTED')
    expect(
      sessionSet(res),
      'an unverified request must not end a session',
    ).toBeUndefined()
    await app.close()
  })

  it('refuses a LogoutRequest signed by a key that is not the IdP’s', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const stranger = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'stranger',
      entityId: 'https://stranger.example/idp',
    })

    const res = await app.inject({
      method: 'GET',
      url: `/auth/logout?${idp.redirect({ kind: 'LogoutRequest', destination: SLO, signWith: stranger })}`,
    })

    expect(res.statusCode).toBe(400)
    expect(code(res)).toBe('SAML_LOGOUT_REJECTED')
    await app.close()
  })

  it('accepts the same LogoutRequest SIGNED: answers the IdP and ends the session (the positive control)', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const session = await signIn(app, idp)

    const res = await app.inject({
      method: 'GET',
      url: `/auth/logout?${idp.redirect({ kind: 'LogoutRequest', destination: SLO, relayState: 'r1' })}`,
      cookies: { manifest_session: session },
    })

    expect(res.statusCode, res.body).toBe(302)
    const back = new URL(res.headers.location as string)
    expect(`${back.origin}${back.pathname}`).toBe(IDP_SLO)
    expect(back.searchParams.get('SAMLResponse')).toBeTruthy()
    expect(back.searchParams.get('Signature')).toBeTruthy()
    expect(back.searchParams.get('RelayState')).toBe('r1')
    expect(sessionSet(res)).toBe('')
    await app.close()
  })
})

/**
 * P6b's F10, FIXED 2026-09-24: THE CONSOLE'S *Sign out* ENDS THE IdP SESSION TOO.
 *
 * It used to clear Manifest's cookie and nothing else, so the IdP kept its session and
 * the next *Sign in with CWL* quietly signed the SAME person back in — on a shared lab
 * machine, the next person got the previous one's session. Now the POST answers where
 * the browser goes next: the IdP's SingleLogoutService with a signed LogoutRequest naming
 * the session the IdP holds (the NameID and SessionIndex its assertion carried), and the
 * IdP's signed LogoutResponse comes back to `GET /auth/logout`, which lands on `/`.
 */
describe('the console’s sign-out ends the IdP session (P6b F10)', () => {
  /** Signs in, signs out, and returns what the IdP would be sent. */
  async function signedOut(deps: Deps, app: App, idp: TestIdp) {
    const session = await signIn(app, idp)
    const held = verifySession(session, deps.config.sessionSecret)?.idp
    const res = await consoleSignOut(app, session)
    return { res, held }
  }

  it('keeps the IdP’s NameID and SessionIndex on the session the ACS mints', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()

    const held = verifySession(
      await signIn(app, idp, '_sess-42'),
      deps.config.sessionSecret,
    )?.idp

    expect(held?.sessionIndex).toBe('_sess-42')
    // The test IdP's NameID is `_transient<assertion ID>` — random per assertion, as a
    // transient NameID is; the shape says it came off THIS assertion.
    expect(held?.nameID).toMatch(/^_transient_asrt[0-9a-f]{32}$/)
    expect(held?.nameIDFormat).toBe('urn:oasis:names:tc:SAML:2.0:nameid-format:transient')
    await app.close()
  })

  it('sends a person who signed in with CWL to the IdP, with a signed LogoutRequest naming their session', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()

    const { res, held } = await signedOut(deps, app, idp)

    expect(res.statusCode, res.body).toBe(200)
    const to = new URL(res.json<{ redirectTo: string }>().redirectTo)
    expect(`${to.origin}${to.pathname}`).toBe(IDP_SLO)
    // §9: the IdP refuses an unsigned one (`validate.logout: true` on this SP's row).
    expect(to.searchParams.get('Signature')).toBeTruthy()
    expect(to.searchParams.get('SigAlg')).toBe(
      'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    )
    const xml = logoutRequestXml(to.toString())
    expect(/NameID[^>]*>([^<]+)</.exec(xml)?.[1]).toBe(held?.nameID)
    expect(/SessionIndex[^>]*>([^<]+)</.exec(xml)?.[1]).toBe('_sess-ins')
    expect(/<saml:Issuer[^>]*>([^<]+)</.exec(xml)?.[1]).toBe(SP_ENTITY)
    // CLEARED NOW, not when the IdP answers: a sign-out whose round trip fails must still
    // have ended Manifest's own session.
    expect(sessionSet(res)).toBe('')
    await app.close()
  })

  it('lands a session with NO handle — one an older build signed — on /, cleared', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const cookies = testSessionCookies(
      {
        id: '00000000-0000-0000-0000-00000000abcd',
        ubcCwlPuid: 'bio_prof',
        role: 'member',
      },
      deps.config.sessionSecret,
    )

    const res = await consoleSignOut(app, cookies.manifest_session)

    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({ redirectTo: '/' })
    expect(sessionSet(res)).toBe('')
    await app.close()
  })

  it('completes on the IdP’s SIGNED LogoutResponse and lands on /', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const { res } = await signedOut(deps, app, idp)
    const requestId = /\bID="([^"]+)"/.exec(
      logoutRequestXml(res.json<{ redirectTo: string }>().redirectTo),
    )?.[1]

    const done = await app.inject({
      method: 'GET',
      url: `/auth/logout?${idp.redirect({ kind: 'LogoutResponse', destination: SLO, inResponseTo: requestId! })}`,
    })

    expect(done.statusCode, done.body).toBe(302)
    expect(done.headers.location).toBe('/')
    await app.close()
  })

  it.each([
    ['UNSIGNED', { unsigned: true }],
    ['answering a request this process never sent', { inResponseTo: '_never-sent' }],
    ['answering NO request (no InResponseTo)', { inResponseTo: undefined }],
  ] as const)('refuses a LogoutResponse %s', async (_name, change) => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const { res } = await signedOut(deps, app, idp)
    const requestId = /\bID="([^"]+)"/.exec(
      logoutRequestXml(res.json<{ redirectTo: string }>().redirectTo),
    )?.[1]
    const query =
      'inResponseTo' in change && change.inResponseTo === undefined
        ? idp.redirect({ kind: 'LogoutResponse', destination: SLO })
        : idp.redirect({
            kind: 'LogoutResponse',
            destination: SLO,
            inResponseTo: 'inResponseTo' in change ? change.inResponseTo : requestId!,
            ...('unsigned' in change ? { unsigned: true } : {}),
          })

    const done = await app.inject({ method: 'GET', url: `/auth/logout?${query}` })

    expect(done.statusCode).toBe(400)
    expect(code(done)).toBe('SAML_LOGOUT_REJECTED')
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
