import { randomUUID } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import { eq } from 'drizzle-orm'
import { SignedXml } from 'xml-crypto'
import type { Db } from '../db/index.js'
import { users } from '../db/index.js'
import { mintSpKeypair, SP_NAME_ID_FORMAT, type SpKeypair } from '../sso/index.js'
import { SESSION_COOKIE, issueSession, signSession } from './session.js'

/**
 * `identity/`'s test surface — what replaced `POST /auth/dev-login`.
 *
 * **The authentication bypass was the ROUTE**, not a test's ability to construct
 * a session. P2 measured exactly how thin the shim's protection was: the route
 * was registered only when `MANIFEST_DEV_AUTH=1`, and removing that single
 * registration guard made an unauthenticated HTTP endpoint mint **real
 * sessions** — it answered 200, not the refusal the plan predicted. One line
 * from live, and it read correctly in review.
 *
 * A test that signs a session in-process is not that shape at all: it already
 * holds `config.sessionSecret`, so it can do nothing an attacker could do
 * without it, and no HTTP surface exists for anyone to find. `issueSession` and
 * `signSession` were already exported from `session.ts` and needed no route.
 */

/**
 * §16's four tiers need four distinct identities: *"owner, collaborator,
 * unrelated user, and admin"*. Reusing one for two tiers is how a suite comes to
 * assert nothing — a "collaborator" who is not a member makes every collaborator
 * expectation indistinguishable from the stranger's.
 *
 * Moved here verbatim from `identity/dev-auth.ts` when the shim was deleted.
 * They are test fixtures and they always were; living beside a production route
 * is what made them look like seed data.
 *
 * `bio_prof` and `bio_student` are §9's own names. `platform_admin` and
 * `unrelated_user` are the two §9 does not name and the contract suite needs.
 */
export const TEST_USERS = Object.freeze([
  {
    puid: 'bio_prof',
    email: 'bio_prof@example.ubc.ca',
    displayName: 'Bio Prof',
    role: 'member',
  },
  {
    puid: 'bio_student',
    email: 'bio_student@example.ubc.ca',
    displayName: 'Bio Student',
    role: 'member',
  },
  {
    puid: 'unrelated_user',
    email: 'unrelated_user@example.ubc.ca',
    displayName: 'Unrelated User',
    role: 'member',
  },
  {
    puid: 'platform_admin',
    email: 'platform_admin@example.ubc.ca',
    displayName: 'Platform Admin',
    role: 'admin',
  },
] as const)

export type TestUserPuid = (typeof TEST_USERS)[number]['puid']

/** The §6 row, which is what a session is signed over. */
export type SessionUser = Pick<typeof users.$inferSelect, 'id' | 'ubcCwlPuid' | 'role'>

/**
 * The §6 `User` row for one test identity, created if it is not there.
 *
 * A session carries a `userId` and every authorization check resolves it, so a
 * cookie signed for a user who does not exist authenticates nobody — it is the
 * row, not the cookie, that makes an actor real. This upserts for the same
 * reason `devLogin` did: the API suites reset the database between files and a
 * test that assumed the row survived would pass or fail on file order.
 *
 * The role is set on every call rather than only on insert, because these four
 * identities are fixtures whose roles the suite depends on — unlike a real CWL
 * login, which deliberately never touches an existing user's role (see
 * `upsertUserFromAssertion`).
 */
export async function ensureTestUser(
  db: Db,
  puid: TestUserPuid,
): Promise<typeof users.$inferSelect> {
  const seed = TEST_USERS.find((candidate) => candidate.puid === puid)
  if (!seed) {
    throw new Error(
      `'${puid}' is not one of §16's four test identities: ` +
        `${TEST_USERS.map((u) => u.puid).join(', ')}`,
    )
  }
  await db
    .insert(users)
    .values({
      ubcCwlPuid: seed.puid,
      email: seed.email,
      displayName: seed.displayName,
      role: seed.role,
    })
    .onConflictDoUpdate({
      target: users.ubcCwlPuid,
      set: { email: seed.email, displayName: seed.displayName, role: seed.role },
    })
  const [user] = await db.select().from(users).where(eq(users.ubcCwlPuid, seed.puid))
  if (!user)
    throw new Error(`upserted test user '${seed.puid}' but could not read it back`)
  return user
}

/**
 * The signed session token — the cookie's VALUE.
 *
 * The one producer; the two functions below are encodings of it. `app.inject`
 * wants `{ manifest_session: <value> }` and an HTTP client wants a `Cookie`
 * header, and neither is worth a second signing path.
 */
export function testSessionToken(user: SessionUser, secret: string): string {
  return signSession(issueSession(user), secret)
}

/** The `Cookie` header form, for anything driving real HTTP. */
export function testSessionCookie(user: SessionUser, secret: string): string {
  return `${SESSION_COOKIE}=${testSessionToken(user, secret)}`
}

/**
 * The `app.inject({ cookies })` form.
 *
 * The return type names the cookie rather than being `Record<string, string>`,
 * and that is load-bearing under this repository's `noUncheckedIndexedAccess`:
 * an index signature makes every read `string | undefined`, which fails
 * `InjectOptions`' `cookies` overload — and a FAILED overload silently resolves
 * `app.inject` to its chainable form, so `response.statusCode` stops existing.
 * Twenty-six `tsc` errors in four files from one loose return type, none of them
 * visible to `pnpm test`. Same trap `authz-contract.ts` records at its own
 * `payload`.
 */
export function testSessionCookies(
  user: SessionUser,
  secret: string,
): Record<typeof SESSION_COOKIE, string> {
  return { [SESSION_COOKIE]: testSessionToken(user, secret) }
}

/* ------------------------------------------------------------------------- *
 * §9's other half: a SAML IdP that exists only in this process.
 *
 * `sso/login.docker.test.ts` drives the REAL Manifest IdP through a real
 * browser-shaped flow, and that is the identity-path regression tier. It cannot
 * produce the two assertions that matter most here: one signed by a key that is
 * not the IdP's, and one minted for a DIFFERENT Service Provider. A correct IdP
 * will never issue either, so the controls that make a successful login mean
 * something need a signer we hold the key to.
 *
 * That is what this is. It mints its own keypair and signs assertions with
 * `xml-crypto` — the same library `@node-saml/node-saml` verifies with, so a
 * signature this produces is one the SP is genuinely checking rather than one
 * crafted to match its parser.
 * ------------------------------------------------------------------------- */

/** The IdP the control plane's SP is pointed at in the unit tier. */
export interface TestIdp {
  entityId: string
  certificatePem: string
  /** Signs a `SAMLResponse`, base64 as the POST binding carries it. */
  sign(input: AssertionInput): string
}

export interface AssertionInput {
  /** Who the assertion is FOR. A different value is the replay control. */
  audience: string
  /** Where it is posted. Must be the SP's registered ACS URL. */
  destination: string
  /** The AuthnRequest this answers — `authnRequestId(await sp.loginUrl(nonce))`. */
  inResponseTo: string
  /** Keyed by OID, as the Manifest IdP releases them after `core:AttributeMap`. */
  attributes: Record<string, string>
  /** Signs with this key instead of the IdP's. The wrong-key control. */
  signWith?: { privateKeyPem: string; certificatePem: string }
  /** Shifts `NotOnOrAfter` into the past. The expiry control. */
  expired?: boolean
  /**
   * Emits the assertion with NO signature at all.
   *
   * The only thing that can show `wantAssertionsSigned` and
   * `wantAuthnResponseSigned` doing anything. Measured 2026-09-09: turning both
   * to `false` reddens NOTHING, because node-saml validates a signature that is
   * PRESENT against `idpCert` whatever those flags say — so an assertion signed
   * by the wrong key is refused either way, and the flags looked load-bearing
   * while being untested. Exactly the shape ORIENTATION records for
   * SimpleSAMLphp's `validate.authnrequest`, now measured on the SP side too.
   */
  unsigned?: boolean
}

const SAML_NS = {
  protocol: 'urn:oasis:names:tc:SAML:2.0:protocol',
  assertion: 'urn:oasis:names:tc:SAML:2.0:assertion',
} as const

const EXCLUSIVE_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#'
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'

/**
 * One keypair per test PROCESS, not per call.
 *
 * `openssl req -newkey rsa:4096` is about a second, and the unit tier builds a
 * server per test. A module-level promise is the cheapest correct cache: every
 * importer in this worker awaits the same mint.
 */
let idpKeypair: Promise<SpKeypair> | undefined

export async function testSamlIdp(): Promise<TestIdp> {
  const entityId = 'https://idp.test.manifest.internal/idp/shibboleth'
  idpKeypair ??= mintSpKeypair({
    projectId: '00000000-0000-0000-0000-000000000000',
    environmentKind: 'staging',
    slug: 'test-idp',
    entityId,
  })
  const keys = await idpKeypair

  return {
    entityId,
    certificatePem: keys.certificatePem,
    sign: (input) => {
      const signer = input.signWith ?? {
        privateKeyPem: keys.privateKeyPem,
        certificatePem: keys.certificatePem,
      }
      const now = Date.now()
      const iso = (ms: number) => new Date(ms).toISOString()
      // Five minutes is the SAML convention and is longer than any test runs.
      // `expired` moves the whole window behind us rather than only the end, so
      // the refusal is an expiry and not a not-yet-valid.
      const notBefore = iso(input.expired ? now - 600_000 : now - 30_000)
      const notOnOrAfter = iso(input.expired ? now - 300_000 : now + 300_000)
      const responseId = `_res${randomUUID().replace(/-/g, '')}`
      const assertionId = `_asrt${randomUUID().replace(/-/g, '')}`

      const attributes = Object.entries(input.attributes)
        .map(
          ([name, value]) =>
            `<saml:Attribute Name="${name}" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">` +
            `<saml:AttributeValue>${value}</saml:AttributeValue></saml:Attribute>`,
        )
        .join('')

      const xml =
        `<samlp:Response xmlns:samlp="${SAML_NS.protocol}" xmlns:saml="${SAML_NS.assertion}" ` +
        `ID="${responseId}" Version="2.0" IssueInstant="${iso(now)}" ` +
        `Destination="${input.destination}" InResponseTo="${input.inResponseTo}">` +
        `<saml:Issuer>${entityId}</saml:Issuer>` +
        `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
        `<saml:Assertion xmlns:saml="${SAML_NS.assertion}" ID="${assertionId}" Version="2.0" ` +
        `IssueInstant="${iso(now)}">` +
        `<saml:Issuer>${entityId}</saml:Issuer>` +
        `<saml:Subject>` +
        `<saml:NameID Format="${SP_NAME_ID_FORMAT}">_transient${assertionId}</saml:NameID>` +
        `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
        `<saml:SubjectConfirmationData NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}" ` +
        `Recipient="${input.destination}" InResponseTo="${input.inResponseTo}"/>` +
        `</saml:SubjectConfirmation></saml:Subject>` +
        `<saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">` +
        `<saml:AudienceRestriction><saml:Audience>${input.audience}</saml:Audience>` +
        `</saml:AudienceRestriction></saml:Conditions>` +
        `<saml:AttributeStatement>${attributes}</saml:AttributeStatement>` +
        `</saml:Assertion></samlp:Response>`

      if (input.unsigned) return Buffer.from(xml, 'utf8').toString('base64')

      // INNER FIRST, then outer. The control plane's SP sets both
      // `wantAssertionsSigned` and `wantAuthnResponseSigned`, and the response
      // signature digests the whole document — so signing the response before
      // the assertion produces a response signature over a document that is
      // about to change, and the SP then reports a digest mismatch on the
      // OUTER signature while the real mistake was the order.
      const signedAssertion = signElement(xml, 'Assertion', signer)
      return Buffer.from(
        signElement(signedAssertion, 'Response', signer),
        'utf8',
      ).toString('base64')
    },
  }
}

/** One enveloped signature, placed after the element's own `Issuer`. */
function signElement(
  xml: string,
  element: 'Assertion' | 'Response',
  signer: { privateKeyPem: string; certificatePem: string },
): string {
  const sig = new SignedXml({
    privateKey: signer.privateKeyPem,
    publicCert: signer.certificatePem,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: EXCLUSIVE_C14N,
  })
  sig.addReference({
    xpath: `//*[local-name(.)='${element}']`,
    transforms: [ENVELOPED, EXCLUSIVE_C14N],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  })
  sig.computeSignature(xml, {
    prefix: 'ds',
    location: {
      // AFTER the Issuer, which is where the SAML 2.0 schema puts it. An
      // appended signature parses and then fails schema validation at a real
      // IdP, so getting it right here keeps the fixture honest about what the
      // Manifest IdP actually sends.
      reference: `//*[local-name(.)='${element}']/*[local-name(.)='Issuer']`,
      action: 'after',
    },
  })
  return sig.getSignedXml()
}

/**
 * The `ID` of the AuthnRequest inside a login redirect URL.
 *
 * The control plane's SP runs with `validateInResponseTo: always`, so an
 * assertion that answers no request it made is refused — which means a test has
 * to ask for the redirect first and quote its ID back. That is not ceremony: it
 * is the one thing that proves the replay guard is wired, and a fixture that
 * invented an ID would be testing the guard's absence.
 *
 * The redirect binding DEFLATEs the request with no zlib header, hence
 * `inflateRawSync`.
 */
export function authnRequestId(loginUrl: string): string {
  const encoded = new URL(loginUrl).searchParams.get('SAMLRequest')
  if (!encoded) throw new Error(`no SAMLRequest in '${loginUrl}'`)
  const xml = inflateRawSync(Buffer.from(encoded, 'base64')).toString('utf8')
  const id = /\bID="([^"]+)"/.exec(xml)?.[1]
  if (!id) throw new Error(`no ID attribute in the AuthnRequest:\n${xml}`)
  return id
}
