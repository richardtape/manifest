import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { randomUUID } from 'node:crypto'
import {
  authnRequestId,
  authnRequestXml,
  testSamlIdp,
  testSessionCookies,
  type TestIdp,
} from '../identity/testing.js'
import { isSteppedUp, verifySession } from '../identity/index.js'
import { mintSpKeypair } from '../sso/index.js'
import { buildServer } from './server.js'
import { loginAs, refusal, testDeps } from './testing.js'

const OID = {
  ubcEduCwlPuid: 'urn:oid:1.3.6.1.4.1.60.6.1.6',
  mail: 'urn:oid:0.9.2342.19200300.100.1.3',
  givenName: 'urn:oid:2.5.4.42',
  sn: 'urn:oid:2.5.4.4',
  eduPersonAffiliation: 'urn:oid:1.3.6.1.4.1.5923.1.1.1.1',
} as const

const INSTRUCTOR: Record<string, string> = {
  [OID.ubcEduCwlPuid]: 'ins000001',
  [OID.mail]: 'instructor@ubc.ca',
  [OID.givenName]: 'Test',
  [OID.sn]: 'Instructor',
  // Released by the Manifest IdP's auth source but NOT declared by the control
  // plane's SP row. Present here so the test proves what the code does with a
  // value it is not supposed to act on: nothing.
  [OID.eduPersonAffiliation]: 'faculty',
}

const SP_ENTITY = 'https://manifest.internal/sp/manifest-control-plane/platform'
const ACS = 'https://console.manifest.internal/auth/saml/callback'

describe('auth routes', () => {
  it('returns the session holder from /v1/me', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')

    const me = await app.inject({ method: 'GET', url: '/v1/me', cookies })
    expect(me.statusCode).toBe(200)
    // EXACTLY `Me` (P5a Task 6): the row's name and address beside the session's role,
    // and nothing else the users table holds.
    const [user] = await deps.db
      .select()
      .from(users)
      .where(eq(users.ubcCwlPuid, 'bio_prof'))
    expect(me.json()).toEqual({
      id: user!.id,
      puid: 'bio_prof',
      displayName: 'Bio Prof',
      email: 'bio_prof@example.ubc.ca',
      role: 'member',
    })
    await app.close()
  })

  it('refuses /v1/me for a validly signed session whose user no longer exists', async () => {
    // Sessions are stateless (brief §7 item 6): the signature outlives the row. `Me` is
    // read from the row, so a session over nobody is authentication's refusal — not a
    // 500 from a mapper handed `undefined`, and not a representation of nobody.
    const deps = await testDeps()
    const app = await buildServer(deps)
    const cookies = testSessionCookies(
      { id: randomUUID(), ubcCwlPuid: 'departed_user', role: 'member' },
      deps.config.sessionSecret,
    )
    const me = await app.inject({ method: 'GET', url: '/v1/me', cookies })
    expect(me.statusCode).toBe(401)
    expect(me.json().error.code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('refuses a query parameter /v1/me does not name, naming it', async () => {
    // A `/v1` route's query is a strict object (P5a Task 6, `NO_QUERY`), so `?limt=` is
    // refused rather than ignored. The route answered 200 to any query before it was a
    // definition; this pins the change as intended.
    const deps = await testDeps()
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')
    const me = await app.inject({ method: 'GET', url: '/v1/me?verbose=1', cookies })
    expect(me.statusCode).toBe(400)
    expect(me.json().error.code).toBe('REQUEST_INVALID')
    expect(me.json().error.message).toContain('verbose')
    await app.close()
  })

  it('refuses /v1/me without a session', async () => {
    const app = await buildServer(await testDeps())
    const me = await app.inject({ method: 'GET', url: '/v1/me' })
    expect(me.statusCode).toBe(401)
    expect(me.json().error.code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('refuses a tampered session cookie', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const { manifest_session: value } = await loginAs(deps, 'bio_prof')
    const tampered = `${value.slice(0, -4)}AAAA`
    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      cookies: { manifest_session: tampered },
    })
    expect(me.statusCode).toBe(401)
    await app.close()
  })
})

/**
 * §9's first sentence: **Manifest itself is an SP.** Roadmap gap 3, closed.
 *
 * Every test here drives the REAL `createSamlSp` against an IdP this process
 * holds the signing key to (`identity/testing.ts`). That is what makes the two
 * refusals below possible: a correct IdP never issues an assertion signed by
 * somebody else's key or minted for another Service Provider, so the controls
 * that give the success its meaning cannot come from the real one.
 * `sso/login.docker.test.ts` covers the real IdP from the app side, and
 * `identity/saml.docker.test.ts` covers it from this one.
 */
describe('Manifest is its own SP (§9)', () => {
  // These commit users, so each starts from a clean slate — the "created once"
  // test asserts nothing against a row an earlier test left behind.
  beforeEach(resetDatabase)

  type App = Awaited<ReturnType<typeof buildServer>>

  /**
   * A login redirect, the request ID an assertion must answer, and the browser's
   * binding (P5a Task 4): the `RelayState` the redirect carries and the login cookie
   * set beside it. A browser holds both; an attacker posting through someone else's
   * browser holds only the first.
   */
  async function pendingLogin(
    app: App,
    returnTo?: string,
  ): Promise<{
    location: string
    requestId: string
    relayState: string
    loginCookie: string
  }> {
    const res = await app.inject({
      method: 'GET',
      url:
        returnTo === undefined
          ? '/auth/login'
          : `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
    })
    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    const cookie = res.cookies.find((c) => c.name === 'manifest_login')
    expect(cookie).toBeDefined()
    return {
      location,
      requestId: authnRequestId(location),
      relayState: new URL(location).searchParams.get('RelayState') ?? '',
      loginCookie: cookie!.value,
    }
  }

  function assertion(
    idp: TestIdp,
    requestId: string,
    overrides: {
      audience?: string
      attributes?: Record<string, string>
      signWith?: { privateKeyPem: string; certificatePem: string }
      expired?: boolean
      unsigned?: boolean
    } = {},
  ): string {
    return idp.sign({
      audience: overrides.audience ?? SP_ENTITY,
      destination: ACS,
      inResponseTo: requestId,
      attributes: overrides.attributes ?? INSTRUCTOR,
      ...(overrides.signWith ? { signWith: overrides.signWith } : {}),
      ...(overrides.expired ? { expired: true } : {}),
      ...(overrides.unsigned ? { unsigned: true } : {}),
    })
  }

  /**
   * The IdP's auto-submitting POST, as a browser sends it: the assertion, the
   * `RelayState` the IdP echoes, and whatever login cookie this browser holds. Every
   * refusal test below passes the WHOLE binding, so the refusal it asserts is the one
   * under test and not the binding's — which is also why each of them names its code.
   */
  const post = (
    app: App,
    SAMLResponse: string,
    binding: { relayState?: string; loginCookie?: string } = {},
  ) =>
    app.inject({
      method: 'POST',
      url: '/auth/saml/callback',
      payload: {
        SAMLResponse,
        ...(binding.relayState === undefined ? {} : { RelayState: binding.relayState }),
      },
      ...(binding.loginCookie === undefined
        ? {}
        : { cookies: { manifest_login: binding.loginCookie } }),
    })

  it('GET /auth/login redirects to the Manifest IdP with a signed SAMLRequest', async () => {
    const app = await buildServer(await testDeps())
    const { location } = await pendingLogin(app)
    const url = new URL(location)
    expect(url.origin).toBe('https://idp.test.manifest.internal')
    // The 2.x path, from `spec/`'s own constant rather than restated here.
    // `passport-ubcshib`'s UBC_CONFIG.LOCAL carries the 1.x path
    // (/simplesaml/saml2/idp/SSOService.php), which 404s against SimpleSAMLphp
    // 2.x — and a 404 from the IdP reads as "the IdP is down".
    expect(url.pathname).toBe('/module.php/saml/idp/singleSignOnService')
    expect(url.searchParams.get('SAMLRequest')).toBeTruthy()
    // §9 requires signed AuthnRequests, and every row `renderSpMetadata` writes
    // carries `validate.authnrequest: true` — so an unsigned request from the
    // control plane would be refused by its own IdP. SHA-256, not node-saml's
    // sha1 default.
    expect(url.searchParams.get('Signature')).toBeTruthy()
    expect(url.searchParams.get('SigAlg')).toBe(
      'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    )
    await app.close()
  })

  it('completes a login, and reads the user out of the OID attributes', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const login = await pendingLogin(app)

    const res = await post(app, assertion(idp, login.requestId), login)
    expect(res.statusCode).toBe(302)
    // THE TARGET, not just that it redirected. `/` again (P5a Task 4), and this time
    // deliberately: through the edge `/` is the console's home — P5c serves it, and
    // until then the edge answers it with a page naming /v1/. It was `/` once before,
    // when the control plane was reached directly and `/` was its own 404 — a
    // SUCCESSFUL login that read exactly like a failed one, found by opening it in a
    // browser. A browser that asks for somewhere else says so with `?returnTo=`.
    expect(res.headers.location).toBe('/')
    // The login cookie is spent: cleared on the way out, so it cannot bind a second
    // assertion.
    expect(res.cookies.find((c) => c.name === 'manifest_login')?.value).toBe('')
    const cookie = res.cookies.find((c) => c.name === 'manifest_session')
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax')
    // Secure because the ORIGIN is https (P5a Task 3), in development too.
    expect(cookie?.secure).toBe(true)

    // ASSERT THE SHAPE OF THE ANSWER. "a session was minted" and "the session
    // belongs to the person the IdP asserted" are different claims.
    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      cookies: { manifest_session: cookie!.value },
    })
    expect(me.json()).toMatchObject({
      puid: 'ins000001',
      displayName: 'Test Instructor',
      email: 'instructor@ubc.ca',
      role: 'member',
    })
    await app.close()
  })

  it('sets a session cookie without Secure only on a loopback http origin', async () => {
    // The Docker tier boots control planes at loopback http origins, where a Secure
    // cookie would never be sent back. The in-process SP in these deps still names the
    // https ACS, so the assertion is signed for it; only the cookie flag is under test.
    const deps = await testDeps()
    const loopback = {
      ...deps,
      config: {
        ...deps.config,
        sp: { ...deps.config.sp, origin: 'http://127.0.0.1:7100' },
      },
    }
    const app = await buildServer(loopback)
    const idp = await testSamlIdp()
    const login = await pendingLogin(app)
    const res = await post(app, assertion(idp, login.requestId), login)
    expect(res.statusCode).toBe(302)
    expect(res.cookies.find((c) => c.name === 'manifest_session')?.secure).toBeFalsy()
    await app.close()
  })

  it('refuses an assertion signed by a key that is not the IdP', async () => {
    // THE CONTROL THAT MAKES THE SUCCESS MEAN ANYTHING. Without it the callback
    // is an endpoint that mints a session for anyone who can POST XML — the
    // class of thing `/auth/dev-login` was, which P2 measured one line from live.
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const login = await pendingLogin(app)
    const impostor = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'impostor-idp',
      entityId: 'https://impostor.example/idp',
    })

    const res = await post(
      app,
      assertion(idp, login.requestId, { signWith: impostor }),
      login,
    )
    expect(res.statusCode).toBe(401)
    expect(res.cookies).toHaveLength(0)
    // The envelope names no detail (D23.7): which signature failed is a probing
    // oracle for anyone who can reach the ACS.
    expect(res.json().error.code).toBe('SAML_ASSERTION_REJECTED')
    expect(res.json().error.message).not.toMatch(/signature|certificate|digest/i)
    await app.close()
  })

  it('refuses an assertion carrying no signature at all', async () => {
    // The third refusal an ACS must make, alongside a wrong key and a wrong
    // audience: a document carrying no signature at all.
    //
    // It is NOT a test of `wantAssertionsSigned` / `wantAuthnResponseSigned`,
    // and the difference was measured rather than assumed. Setting both to
    // `false` leaves this test green: node-saml answers *"Invalid document
    // signature"* either way, so `idpCert` is the whole control and those two
    // options are explicit defaults. Same shape as SimpleSAMLphp's
    // `validate.authnrequest` (ORIENTATION §4) — a flag that reads as
    // load-bearing and whose removal no test can see.
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const login = await pendingLogin(app)

    const res = await post(
      app,
      assertion(idp, login.requestId, { unsigned: true }),
      login,
    )
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('SAML_ASSERTION_REJECTED')
    expect(res.cookies).toHaveLength(0)
    await app.close()
  })

  it('refuses an assertion whose audience is a different SP', async () => {
    // An assertion minted for a deployed APP, replayed at the control plane.
    // Both are SPs of the same IdP with assertions signed by the same key, so
    // this is a live shape rather than a theoretical one — the entityID is the
    // only thing that separates them.
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const login = await pendingLogin(app)

    const res = await post(
      app,
      assertion(idp, login.requestId, {
        audience: 'https://manifest.internal/sp/chem-labs/staging',
      }),
      login,
    )
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('SAML_ASSERTION_REJECTED')
    expect(res.cookies).toHaveLength(0)
    await app.close()
  })

  it('refuses an assertion that answers no request it made', async () => {
    // `validateInResponseTo` defaults to `never` in node-saml, which accepts an
    // unsolicited response. The control plane always initiates, so `always` is
    // set — and this is what proves it, by quoting an ID no login produced.
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const login = await pendingLogin(app)

    const res = await post(app, assertion(idp, '_anIdNobodyIssued'), login)
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('SAML_ASSERTION_REJECTED')
    await app.close()
  })

  it('refuses an expired assertion', async () => {
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const login = await pendingLogin(app)

    const res = await post(app, assertion(idp, login.requestId, { expired: true }), login)
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('SAML_ASSERTION_REJECTED')
    await app.close()
  })

  it('refuses an assertion that releases no ubcEduCwlPuid', async () => {
    // §9's only stable identifier. A session keyed on anything else eventually
    // belongs to the wrong person, so this fails rather than storing a blank.
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const login = await pendingLogin(app)

    const res = await post(
      app,
      assertion(idp, login.requestId, { attributes: { [OID.mail]: 'nobody@ubc.ca' } }),
      login,
    )
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('SAML_NO_PUID')
    await app.close()
  })

  it('creates the user on first login and reuses them on the second', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()

    for (let i = 0; i < 2; i++) {
      const login = await pendingLogin(app)
      const res = await post(app, assertion(idp, login.requestId), login)
      expect(res.statusCode).toBe(302)
    }

    // §6's User is keyed on ubc_cwl_puid. Two logins must not be two people, and
    // the second must not fail on the unique index either — which is what an
    // INSERT without onConflictDoUpdate would do (P3 defect 76 measured what an
    // unhandled unique violation looks like from outside: 500 INTERNAL, no trace).
    const rows = await db.select().from(users).where(eq(users.ubcCwlPuid, 'ins000001'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).toBe('instructor@ubc.ca')
    expect(rows[0]!.displayName).toBe('Test Instructor')
    // `member`, NOT `admin`. The platform role comes from Manifest, never from
    // an attribute the IdP asserts — this assertion carries
    // eduPersonAffiliation=faculty, and letting that grant admin would make the
    // IdP an authorization authority as well as an authentication one.
    expect(rows[0]!.role).toBe('member')
    await app.close()
  })

  it('never lets a login change an existing user’s platform role', async () => {
    // The other direction, and the one an `onConflictDoUpdate` that reset the
    // column would break silently: a platform admin who logs in again must not
    // be demoted to `member` by their own login.
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    await db.insert(users).values({
      ubcCwlPuid: 'ins000001',
      email: 'old@ubc.ca',
      displayName: 'Old Name',
      role: 'admin',
    })

    const login = await pendingLogin(app)
    expect((await post(app, assertion(idp, login.requestId), login)).statusCode).toBe(302)

    const [row] = await db.select().from(users).where(eq(users.ubcCwlPuid, 'ins000001'))
    expect(row!.role).toBe('admin')
    // The name and address DO follow the assertion — those are the IdP's to say.
    expect(row!.email).toBe('instructor@ubc.ca')
    await app.close()
  })

  it('sets a login cookie bound to the RelayState it sends, for ten minutes, on /auth only', async () => {
    const app = await buildServer(await testDeps())
    const res = await app.inject({ method: 'GET', url: '/auth/login' })
    const cookie = res.cookies.find((c) => c.name === 'manifest_login')!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.path).toBe('/auth')
    expect(cookie.maxAge).toBe(600)
    // `SameSite=None; Secure` on the https origin: the IdP's auto-submitting POST is
    // cross-site wherever the IdP is on another registrable domain, and Lax would drop
    // this cookie from exactly that request.
    expect(cookie.secure).toBe(true)
    expect(String(cookie.sameSite).toLowerCase()).toBe('none')
    const relayState = new URL(res.headers.location as string).searchParams.get(
      'RelayState',
    )
    expect(relayState).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(cookie.value.startsWith(`${relayState}.`)).toBe(true)
    // RelayState is SIGNED into the redirect (the HTTP-Redirect binding signs the whole
    // query), so a nonce swapped in transit is refused by the IdP, not only here.
    expect(
      new URL(res.headers.location as string).searchParams.get('Signature'),
    ).toBeTruthy()
    await app.close()
  })

  it('refuses an assertion posted by a browser that did not start the sign-in', async () => {
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const login = await pendingLogin(app)
    // The attacker's own assertion, posted through a victim's browser: the right
    // RelayState, but no login cookie — the victim never started this sign-in.
    const res = await post(app, assertion(idp, login.requestId), {
      relayState: login.relayState,
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('SAML_LOGIN_NOT_BOUND')
    expect(res.cookies.find((c) => c.name === 'manifest_session')).toBeUndefined()

    // AND THE REQUEST ID IS NOT SPENT: the refusal happened before node-saml was asked,
    // so the browser that DID start this sign-in still completes it. Without this, a
    // refusal that consumed the ID would read the same from outside.
    const own = await post(app, assertion(idp, login.requestId), login)
    expect(own.statusCode).toBe(302)
    await app.close()
  })

  it('refuses an assertion that carries no RelayState, even with a login cookie', async () => {
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const login = await pendingLogin(app)
    const res = await post(app, assertion(idp, login.requestId), {
      loginCookie: login.loginCookie,
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('SAML_LOGIN_NOT_BOUND')
    await app.close()
  })

  it('refuses an assertion whose RelayState is not this browser’s nonce', async () => {
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const mine = await pendingLogin(app)
    const theirs = await pendingLogin(app)
    const res = await post(app, assertion(idp, theirs.requestId), {
      relayState: theirs.relayState,
      loginCookie: mine.loginCookie,
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('SAML_LOGIN_NOT_BOUND')
    await app.close()
  })

  it('returns to a same-origin path, and to / for anything else', async () => {
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    for (const [asked, landed] of [
      ['/v1/me', '/v1/me'],
      ['/projects/7', '/projects/7'],
      ['//evil.example', '/'],
      ['https://evil.example/', '/'],
    ] as const) {
      const login = await pendingLogin(app, asked)
      const res = await post(app, assertion(idp, login.requestId), login)
      expect(res.statusCode, asked).toBe(302)
      expect(res.headers.location, asked).toBe(landed)
    }
    await app.close()
  })

  it('has no /auth/dev-login route at all', async () => {
    const app = await buildServer(await testDeps())
    const res = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { puid: 'bio_prof' },
      headers: { 'idempotency-key': 'x'.repeat(8) },
    })
    // 404, not 401 or 403: the route must be ABSENT, not merely refusing. A 403
    // would confirm the shim is still compiled in.
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  /* ----------------------------------------------------------------------- *
   * §20's STEP-UP RE-AUTHENTICATION (P6a Task 8).
   *
   * Nested here rather than in a file of its own so it drives the REAL SP through the
   * same `pendingLogin` / `assertion` / `post` helpers the sign-in tests use: a step-up
   * is the same ACS, the same keys and the same IdP, distinguished by its own cookie
   * (Decision 17), and a second harness would be a second statement of that.
   * ----------------------------------------------------------------------- */

  /** A browser that has really signed in — the cookie the callback minted, not a signed fixture. */
  async function signedIn(app: App, idp: TestIdp): Promise<string> {
    const login = await pendingLogin(app)
    const res = await post(app, assertion(idp, login.requestId), login)
    expect(res.statusCode).toBe(302)
    return res.cookies.find((c) => c.name === 'manifest_session')!.value
  }

  /** The step-up half of `pendingLogin`: it needs a session, and it sets its own cookie. */
  async function pendingStepUp(
    app: App,
    session: string,
    returnTo?: string,
  ): Promise<{
    location: string
    requestId: string
    relayState: string
    stepUpCookie: string
    cookie: {
      path?: string
      maxAge?: number
      httpOnly?: boolean
      secure?: boolean
      sameSite?: string
    }
  }> {
    const res = await app.inject({
      method: 'GET',
      url:
        returnTo === undefined
          ? '/auth/step-up'
          : `/auth/step-up?returnTo=${encodeURIComponent(returnTo)}`,
      cookies: { manifest_session: session },
    })
    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    const cookie = res.cookies.find((c) => c.name === 'manifest_stepup')
    expect(cookie).toBeDefined()
    return {
      location,
      requestId: authnRequestId(location),
      relayState: new URL(location).searchParams.get('RelayState') ?? '',
      stepUpCookie: cookie!.value,
      cookie: cookie!,
    }
  }

  /** The IdP's auto-submitting POST coming back from a STEP-UP: all three of its parts. */
  const postStepUp = (
    app: App,
    SAMLResponse: string,
    binding: { relayState?: string; stepUpCookie?: string; session?: string },
  ) =>
    app.inject({
      method: 'POST',
      url: '/auth/saml/callback',
      payload: {
        SAMLResponse,
        ...(binding.relayState === undefined ? {} : { RelayState: binding.relayState }),
      },
      cookies: {
        ...(binding.stepUpCookie === undefined
          ? {}
          : { manifest_stepup: binding.stepUpCookie }),
        ...(binding.session === undefined ? {} : { manifest_session: binding.session }),
      },
    })

  /**
   * THE POSITIVE CONTROL, AND IT COMES FIRST. P5c's F16: every test in a file fired
   * garbage at the route and asserted a refusal, and a route that refuses everything
   * passes them all. This is the test that fails if the step-up branch refuses
   * everything — and it asserts the CLAIM on the cookie, not that a redirect happened.
   */
  it('stamps steppedUpAt on the session when a valid assertion comes back for the same person', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const session = await signedIn(app, idp)
    expect(verifySession(session, deps.config.sessionSecret)!.steppedUpAt).toBeNull()

    const stepUp = await pendingStepUp(app, session, '/projects/7')
    const res = await postStepUp(app, assertion(idp, stepUp.requestId), {
      relayState: stepUp.relayState,
      stepUpCookie: stepUp.stepUpCookie,
      session,
    })

    expect(res.statusCode).toBe(302)
    // To where the browser asked to go back to, re-checked on the way out.
    expect(res.headers.location).toBe('/projects/7')
    const stamped = res.cookies.find((c) => c.name === 'manifest_session')!.value
    const after = verifySession(stamped, deps.config.sessionSecret)!
    expect(isSteppedUp(after.steppedUpAt)).toBe(true)
    // THE SAME SESSION, re-signed — not a new one. A step-up is an addition to a
    // session, so the person, the role and the expiry all carry through unchanged: a
    // step-up that silently extended a session would be the more expensive kind of wrong.
    const before = verifySession(session, deps.config.sessionSecret)!
    expect({
      userId: after.userId,
      puid: after.puid,
      role: after.role,
      expiresAt: after.expiresAt,
    }).toEqual({
      userId: before.userId,
      puid: before.puid,
      role: before.role,
      expiresAt: before.expiresAt,
    })
    // The step-up cookie is spent: it cannot bind a second assertion.
    expect(res.cookies.find((c) => c.name === 'manifest_stepup')?.value).toBe('')
    await app.close()
  })

  /**
   * THE FLAG, ON THE WIRE — and this is the assertion the plan predicted could not exist.
   *
   * Task 8's control (e) says removing `forceAuthn: true` reddens nothing and that only
   * `[M3]`'s live measurement can see it. That is true of the IdP HONOURING the flag and
   * false of the flag being SENT: `ForceAuthn` is an XML attribute on `<AuthnRequest>`,
   * and `[M3]` proved it by inflating the redirect binding exactly as this does. So the
   * unit tier sees the request and only `[M3]` sees the re-prompt — both are needed, and
   * P4a's *four settings that read like controls and are not* is why neither is enough.
   */
  it('sends ForceAuthn="true" on the step-up request, and never on an ordinary sign-in', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const session = await signedIn(app, idp)

    const stepUp = await pendingStepUp(app, session)
    expect(authnRequestXml(stepUp.location)).toContain('ForceAuthn="true"')
    // THE CONTROL IN THE SAME TEST: an ordinary sign-in must not carry it, or every
    // login would re-prompt and the attribute would prove nothing about step-up.
    const login = await pendingLogin(app)
    expect(authnRequestXml(login.location)).not.toContain('ForceAuthn')
    // And both are the same SP: one entityID, one ACS, so the IdP's registration is
    // untouched (Decision 17) — which is what makes this one sitting rather than three.
    for (const url of [stepUp.location, login.location]) {
      const xml = authnRequestXml(url)
      expect(xml).toContain(
        'https://manifest.internal/sp/manifest-control-plane/platform',
      )
      expect(xml).toContain(`AssertionConsumerServiceURL="${ACS}"`)
    }
    await app.close()
  })

  /**
   * WITHOUT THIS CHECK, SIGNING IN AS ANYBODY AT THE IdP STAMPS THE CLAIM ONTO WHOEVER'S
   * SESSION IS IN THIS BROWSER. Nothing else in the suite sees it, which is why it is
   * written — and the second half is the half that matters: the session must be left
   * exactly as it was.
   */
  it('refuses an assertion for a DIFFERENT person, and leaves the session unstamped', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const session = await signedIn(app, idp)
    const stepUp = await pendingStepUp(app, session)

    const somebodyElse = { ...INSTRUCTOR, [OID.ubcEduCwlPuid]: 'stu000001' }
    const res = await postStepUp(
      app,
      assertion(idp, stepUp.requestId, { attributes: somebodyElse }),
      { relayState: stepUp.relayState, stepUpCookie: stepUp.stepUpCookie, session },
    )

    expect(refusal(res)).toEqual({ status: 401, code: 'SAML_STEP_UP_WRONG_USER' })
    // NO new session cookie at all — the old one is untouched and is still not stepped up.
    expect(res.cookies.find((c) => c.name === 'manifest_session')).toBeUndefined()
    expect(verifySession(session, deps.config.sessionSecret)!.steppedUpAt).toBeNull()
    await app.close()
  })

  it('refuses a step-up that comes back to a browser holding no session', async () => {
    // A step-up is an ADDITION to a session, never a way to get one. Answering this by
    // minting a session would make the ACS a second, quieter front door.
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const session = await signedIn(app, idp)
    const stepUp = await pendingStepUp(app, session)

    const res = await postStepUp(app, assertion(idp, stepUp.requestId), {
      relayState: stepUp.relayState,
      stepUpCookie: stepUp.stepUpCookie,
      // and no session cookie
    })
    expect(refusal(res)).toEqual({ status: 401, code: 'SAML_STEP_UP_NO_SESSION' })
    expect(res.cookies.find((c) => c.name === 'manifest_session')).toBeUndefined()
    await app.close()
  })

  it('refuses a RelayState that is not the step-up cookie’s nonce, and does not stamp', async () => {
    // Two step-ups in one browser: the cookie from one, the RelayState from the other.
    // The branch is not entered at all, so the ordinary one answers — and it answers
    // `SAML_LOGIN_NOT_BOUND`, which is the honest code for "this browser did not start
    // this". Asserted by CODE: `401` alone is four different answers here.
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const session = await signedIn(app, idp)
    const mine = await pendingStepUp(app, session)
    const theirs = await pendingStepUp(app, session)

    const res = await postStepUp(app, assertion(idp, theirs.requestId), {
      relayState: theirs.relayState,
      stepUpCookie: mine.stepUpCookie,
      session,
    })
    expect(refusal(res)).toEqual({ status: 401, code: 'SAML_LOGIN_NOT_BOUND' })
    expect(verifySession(session, deps.config.sessionSecret)!.steppedUpAt).toBeNull()
    await app.close()
  })

  it('leaves an ordinary sign-in alone when a stale step-up cookie is in the browser', async () => {
    // THE OTHER POSITIVE CONTROL. The step-up branch runs FIRST, so a leftover
    // `manifest_stepup` must not be able to derail a sign-in — which it would if the
    // branch keyed on the cookie's presence rather than on its nonce matching.
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const session = await signedIn(app, idp)
    const stale = await pendingStepUp(app, session)

    const login = await pendingLogin(app)
    const res = await app.inject({
      method: 'POST',
      url: '/auth/saml/callback',
      payload: {
        SAMLResponse: assertion(idp, login.requestId),
        RelayState: login.relayState,
      },
      cookies: { manifest_login: login.loginCookie, manifest_stepup: stale.stepUpCookie },
    })
    expect(res.statusCode).toBe(302)
    const minted = res.cookies.find((c) => c.name === 'manifest_session')!.value
    // Signed in, and NOT stepped up: a sign-in is not a second round trip (§20).
    expect(verifySession(minted, deps.config.sessionSecret)!.steppedUpAt).toBeNull()
    await app.close()
  })

  it('sets a step-up cookie bound to the RelayState it sends, for ten minutes, on /auth only', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const idp = await testSamlIdp()
    const session = await signedIn(app, idp)
    const stepUp = await pendingStepUp(app, session)

    expect(stepUp.cookie.httpOnly).toBe(true)
    expect(stepUp.cookie.path).toBe('/auth')
    expect(stepUp.cookie.maxAge).toBe(600)
    expect(stepUp.cookie.secure).toBe(true)
    expect(String(stepUp.cookie.sameSite).toLowerCase()).toBe('none')
    expect(stepUp.relayState).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(stepUp.stepUpCookie.startsWith(`${stepUp.relayState}.`)).toBe(true)
    // A DIFFERENT cookie from the sign-in's, which is the whole of Decision 17.
    expect(stepUp.stepUpCookie).not.toBe(session)
    // The redirect binding signs the whole query, so the nonce cannot be swapped in transit.
    expect(new URL(stepUp.location).searchParams.get('Signature')).toBeTruthy()
    await app.close()
  })

  it('refuses to start a step-up with no credential at all', async () => {
    const app = await buildServer(await testDeps())
    const res = await app.inject({ method: 'GET', url: '/auth/step-up' })
    expect(refusal(res)).toEqual({ status: 401, code: 'UNAUTHENTICATED' })
    await app.close()
  })
})
