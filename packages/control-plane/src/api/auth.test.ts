import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { authnRequestId, testSamlIdp, type TestIdp } from '../identity/testing.js'
import { mintSpKeypair } from '../sso/index.js'
import { buildServer } from './server.js'
import { loginAs, testDeps } from './testing.js'

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
const ACS = 'http://127.0.0.1:7100/auth/saml/callback'

describe('auth routes', () => {
  it('returns the session holder from /auth/me', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')

    const me = await app.inject({ method: 'GET', url: '/auth/me', cookies })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ puid: 'bio_prof', role: 'member' })
    await app.close()
  })

  it('refuses /auth/me without a session', async () => {
    const app = await buildServer(await testDeps())
    const me = await app.inject({ method: 'GET', url: '/auth/me' })
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
      url: '/auth/me',
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

  /** A login redirect, and the request ID an assertion must answer. */
  async function pendingLogin(
    app: App,
  ): Promise<{ location: string; requestId: string }> {
    const res = await app.inject({ method: 'GET', url: '/auth/login' })
    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    return { location, requestId: authnRequestId(location) }
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

  const post = (app: App, SAMLResponse: string) =>
    app.inject({ method: 'POST', url: '/auth/saml/callback', payload: { SAMLResponse } })

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
    const { requestId } = await pendingLogin(app)

    const res = await post(app, assertion(idp, requestId))
    expect(res.statusCode).toBe(302)
    const cookie = res.cookies.find((c) => c.name === 'manifest_session')
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax')

    // ASSERT THE SHAPE OF THE ANSWER. "a session was minted" and "the session
    // belongs to the person the IdP asserted" are different claims.
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { manifest_session: cookie!.value },
    })
    expect(me.json()).toMatchObject({ puid: 'ins000001', role: 'member' })
    await app.close()
  })

  it('refuses an assertion signed by a key that is not the IdP', async () => {
    // THE CONTROL THAT MAKES THE SUCCESS MEAN ANYTHING. Without it the callback
    // is an endpoint that mints a session for anyone who can POST XML — the
    // class of thing `/auth/dev-login` was, which P2 measured one line from live.
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const { requestId } = await pendingLogin(app)
    const impostor = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'impostor-idp',
      entityId: 'https://impostor.example/idp',
    })

    const res = await post(app, assertion(idp, requestId, { signWith: impostor }))
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
    const { requestId } = await pendingLogin(app)

    const res = await post(app, assertion(idp, requestId, { unsigned: true }))
    expect(res.statusCode).toBe(401)
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
    const { requestId } = await pendingLogin(app)

    const res = await post(
      app,
      assertion(idp, requestId, {
        audience: 'https://manifest.internal/sp/chem-labs/staging',
      }),
    )
    expect(res.statusCode).toBe(401)
    expect(res.cookies).toHaveLength(0)
    await app.close()
  })

  it('refuses an assertion that answers no request it made', async () => {
    // `validateInResponseTo` defaults to `never` in node-saml, which accepts an
    // unsolicited response. The control plane always initiates, so `always` is
    // set — and this is what proves it, by quoting an ID no login produced.
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    await pendingLogin(app)

    const res = await post(app, assertion(idp, '_anIdNobodyIssued'))
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('refuses an expired assertion', async () => {
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const { requestId } = await pendingLogin(app)

    const res = await post(app, assertion(idp, requestId, { expired: true }))
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('refuses an assertion that releases no ubcEduCwlPuid', async () => {
    // §9's only stable identifier. A session keyed on anything else eventually
    // belongs to the wrong person, so this fails rather than storing a blank.
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const { requestId } = await pendingLogin(app)

    const res = await post(
      app,
      assertion(idp, requestId, { attributes: { [OID.mail]: 'nobody@ubc.ca' } }),
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
      const { requestId } = await pendingLogin(app)
      const res = await post(app, assertion(idp, requestId))
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

    const { requestId } = await pendingLogin(app)
    expect((await post(app, assertion(idp, requestId))).statusCode).toBe(302)

    const [row] = await db.select().from(users).where(eq(users.ubcCwlPuid, 'ins000001'))
    expect(row!.role).toBe('admin')
    // The name and address DO follow the assertion — those are the IdP's to say.
    expect(row!.email).toBe('instructor@ubc.ca')
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
})
