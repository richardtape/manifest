import { SAML, ValidateInResponseTo } from '@node-saml/node-saml'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { users } from '../db/index.js'
import { MANIFEST_IDP_PATHS } from '../spec/index.js'
import { SP_NAME_ID_FORMAT, type SpEntity } from '../sso/index.js'

/**
 * §9: *"Manifest itself is an SP. Its own users log in with CWL… Locally it uses
 * the Manifest IdP like everything else."* Roadmap gap 3 closes here, and
 * `POST /auth/dev-login` — an unauthenticated endpoint that minted real
 * sessions — is deleted in the same change.
 *
 * **Why `@node-saml/node-saml` and not the `passport-saml` the blueprint pins.**
 * The plan asks for the latter, "one library to reason about, one CVE surface".
 * It was written on 2026-09-07, before 2026-09-08 established that
 * `passport-saml` is npm-deprecated and carries GHSA-4mxg-3p6v-xgq3 — a
 * **critical signature-verification** advisory at range `*` with no published
 * fix. Measured on this machine, 2026-09-09:
 *
 *   passport-saml@3.2.4          1 critical, 1 high, 3 moderate; no fix available
 *   @node-saml/node-saml@5.1.0   0 vulnerabilities
 *
 * Three reasons the argument does not survive that. C6's *"a library change is
 * never a prerequisite"* binds the APP side — a faculty app uses
 * `passport-ubcshib` as UBC ships it — and says nothing about Manifest's own
 * code. §12's dependency-scan gate scans APP IMAGES; nothing in this platform
 * scans the control plane's own tree, so a critical advisory here would be
 * invisible to every gate we have. And "one CVE surface" reads backwards: the
 * control plane holds the Docker socket and mints registry push tokens (§20),
 * so importing an app's unfixable critical into it adds a surface rather than
 * sharing one. The two SPs share no code path in any case — different key,
 * different audience, different framework — and two independent implementations
 * validating against the same IdP is stronger evidence than one, with the app
 * side already covered by §16's identity-path tier (`sso/login.docker.test.ts`).
 *
 * The long-term fix for `passport-ubcshib` is still UBC's, and still not
 * blocking Manifest (ORIENTATION §8).
 */

/** §9's OID vocabulary, as the Manifest IdP releases it after `core:AttributeMap`
 *  at priority 60 and as real UBC Shibboleth sends it (S2). The blueprint's
 *  `auth/attributes.js` carries the app-side copy of this table; this is the
 *  control plane's own, and it needs only the four names its SP declares. */
const OID = {
  ubcEduCwlPuid: 'urn:oid:1.3.6.1.4.1.60.6.1.6',
  mail: 'urn:oid:0.9.2342.19200300.100.1.3',
  givenName: 'urn:oid:2.5.4.42',
  sn: 'urn:oid:2.5.4.4',
} as const

export class SamlError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SamlError'
  }
}

export interface SamlSpConfig {
  /** From `controlPlaneSpEntity` — the same object the IdP row is rendered from. */
  entity: SpEntity
  /** `config.idp.baseUrl`. The SSO and SLO paths are `spec/`'s constants. */
  idpBaseUrl: string
  /** `config.idp.entityId`. Checked against the assertion's Issuer. */
  idpEntityId: string
  /** The IdP's PUBLIC signing certificate, PEM. What every assertion is checked against. */
  idpCertificatePem: string
  /** The control plane's own SP private key, PEM. Signs the AuthnRequest. */
  privateKeyPem: string
  /** Its certificate, PEM — the one `certData` in the IdP's row carries. */
  certificatePem: string
}

/** What a validated assertion yields. Nothing else from it is ever read. */
export interface SamlIdentity {
  ubcCwlPuid: string
  email: string
  displayName: string
}

export interface SamlSp {
  /** The entity this SP is, so the caller need not hold it twice. */
  entity: SpEntity
  /**
   * A signed AuthnRequest as a redirect URL, carrying `relayState` to the IdP and back to
   * the ACS — the nonce that binds a sign-in to the browser that started it (P5a Task 4,
   * `login-state.ts`). The HTTP-Redirect binding signs it with the request.
   */
  loginUrl(relayState: string): Promise<string>
  /**
   * §20's STEP-UP: the same signed AuthnRequest with `ForceAuthn="true"` on it, so the
   * IdP re-prompts a person who is already signed in there (P6a Task 8, Decision 17).
   *
   * Measured against the real Manifest IdP before this was built — `[M3]`, P6a sitting 1:
   * with the flag the IdP served a login form (1 form, 0 assertions) and without it an
   * assertion straight through (0 forms, 1 assertion), over the SAME cookie jar. The
   * control is what makes "a form appeared" mean the flag rather than a lost session.
   *
   * **AND THE FLAG IS THE ONLY THING NO TEST HERE CAN SEE.** A step-up with
   * `forceAuthn` removed still redirects, still comes back, still stamps the claim and
   * still passes every test in this repository — the IdP simply does not re-prompt.
   * `[M3]`'s measurement is the whole of the evidence, and Task 8's control (e) records
   * that it cannot be reproduced in the unit tier.
   */
  stepUpUrl(relayState: string): Promise<string>
  /** Validates a `SAMLResponse` and returns §9's identity, or throws. */
  validate(samlResponse: string): Promise<SamlIdentity>
  /**
   * The step-up half of `validate`, and it must be a SEPARATE entry point.
   *
   * `validateInResponseTo: always` caches request IDs in node-saml's **in-memory
   * provider, per SAML instance** — so an assertion answering a request the step-up
   * instance issued can only be validated by that instance, and the ordinary `validate`
   * would refuse it outright as unsolicited. The callback picks by which cookie's nonce
   * matches `RelayState` (Decision 17).
   */
  validateStepUp(samlResponse: string): Promise<SamlIdentity>
  /**
   * The IdP's OWN LogoutRequest, delivered over the HTTP-Redirect binding — which is
   * a GET carrying `?SAMLRequest=`, not a POST. Validates its signature against
   * `idpCert` and returns the signed LogoutResponse URL to send the browser back to.
   *
   * `originalQuery` is the RAW query string, because the redirect binding signs the
   * bytes as they were sent: re-serialising a parsed object changes them and the
   * signature stops verifying.
   *
   * Throws a plain `Error` — deliberately NOT a `SamlError`, which `errors.ts`
   * answers 401 as a failed SIGN-IN, wrong for a request nobody signed in with.
   * The caller must not end a session on a request it could not verify
   * (P5c sitting 9, F11).
   */
  completeIdpLogout(
    query: Record<string, unknown>,
    originalQuery: string,
  ): Promise<string>
}

/**
 * Every option here that is set is set because its DEFAULT is wrong for us, and
 * three of the defaults are wrong in the fail-open direction. Read 2026-09-09 out
 * of `node-saml@5.1.0`'s own `initialize()` rather than its README:
 *
 *  * `signatureAlgorithm` and `digestAlgorithm` both default to **sha1**
 *    (`algorithms.js` — `case "sha1": default:`). An AuthnRequest signed with
 *    SHA-1 is one SimpleSAMLphp still accepts, so nothing would have failed.
 *  * `validateInResponseTo` defaults to **`never`**, which accepts an
 *    unsolicited assertion — a response that answers no request this process
 *    made. The control plane always initiates, so `always` costs nothing and
 *    closes replay. The cache is node-saml's in-memory provider, which is
 *    correct for a single-process control plane and means a restart mid-login
 *    makes the user click again.
 *  * `identifierFormat` defaults to `…1.1:nameid-format:emailAddress`, and every
 *    Manifest SP row declares **transient** — hence `SP_NAME_ID_FORMAT`,
 *    imported from the module that writes the row rather than restated.
 *
 * `audience` defaults to `issuer`, which is what we want; it is passed anyway,
 * because a default that happens to be right is not a decision anyone can see.
 *
 * `wantAssertionsSigned` and `wantAuthnResponseSigned` are passed for the same
 * reason and NOTHING MORE — they are not what refuses anything here, and saying
 * so is the point. Measured 2026-09-09: setting BOTH to `false` reddens no test
 * in this repository, including one written specifically to see them. node-saml
 * refuses an unsigned document with *"Invalid document signature"* regardless,
 * and an assertion signed by the wrong key is refused by `idpCert`. So the
 * certificate is the whole control; these two are explicit defaults. That is
 * exactly the shape ORIENTATION records for SimpleSAMLphp's
 * `validate.authnrequest` — a flag that reads as load-bearing and whose removal
 * no test can see — and it is recorded here rather than left to be rediscovered.
 */
export function createSamlSp(config: SamlSpConfig): SamlSp {
  const options = {
    issuer: config.entity.entityId,
    callbackUrl: config.entity.acsUrl,
    entryPoint: `${config.idpBaseUrl}${MANIFEST_IDP_PATHS.sso}`,
    logoutUrl: `${config.idpBaseUrl}${MANIFEST_IDP_PATHS.slo}`,
    idpCert: config.idpCertificatePem,
    idpIssuer: config.idpEntityId,
    audience: config.entity.entityId,
    privateKey: config.privateKeyPem,
    publicCert: config.certificatePem,
    signatureAlgorithm: 'sha256',
    digestAlgorithm: 'sha256',
    identifierFormat: SP_NAME_ID_FORMAT,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    validateInResponseTo: ValidateInResponseTo.always,
    // The IdP's clock and ours are the same clock locally and will not be at
    // UBC. Thirty seconds is what §9's own registration guidance assumes and is
    // small enough that a replayed assertion is not usefully long-lived.
    acceptedClockSkewMs: 30_000,
    disableRequestedAuthnContext: true,
  } satisfies ConstructorParameters<typeof SAML>[0]

  /**
   * ONE SP, TWO REQUEST BUILDERS (P6a Task 8, Decision 17).
   *
   * Both instances share the entityID, the ACS URL and the keys — so **the IdP's
   * registration does NOT change**, which is what makes step-up affordable at all (§9
   * registers the ACS in the platform's SP row, and a second one would be a registration
   * change and a thing §9 alerts on specifically).
   *
   * **A SECOND INSTANCE IS NOT A PREFERENCE.** `forceAuthn` is a CONSTRUCTOR option in
   * node-saml 5.1.0 — `lib/types.d.ts:128`, read once in `initialize()` and applied while
   * generating the request — and the only per-request options are `AuthOptions`
   * (`samlFallback`, `additionalParams`). `ForceAuthn` is an XML ATTRIBUTE on
   * `<AuthnRequest>`, which `additionalParams` cannot reach.
   *
   * **AND THEY ARE BUILT HERE RATHER THAN BY TWO CALLERS**, because the seven fields
   * above are the thing that must not differ between them: two `createSamlSp` calls at
   * two construction sites would be the same configuration written twice, which is the
   * shape this project keeps paying for. The per-instance `InResponseTo` cache is then an
   * implementation detail the callback cannot get wrong — it calls `validateStepUp`.
   */
  const saml = new SAML({ ...options, forceAuthn: false })
  const stepUpSaml = new SAML({ ...options, forceAuthn: true })

  /** One refusal path for both instances; the CODE is what a client switches on. */
  const validateWith = async (
    instance: SAML,
    samlResponse: string,
  ): Promise<SamlIdentity> => {
    let profile
    try {
      ;({ profile } = await instance.validatePostResponseAsync({
        SAMLResponse: samlResponse,
      }))
    } catch (cause) {
      // Every refusal arrives here — a bad signature, a wrong audience, an
      // expired assertion, an unsolicited response. The CODE is stable and the
      // library's message is carried through for the operator, because §20's
      // opaque client envelope (D23.7) is not the same thing as an opaque log.
      throw new SamlError(
        'SAML_ASSERTION_REJECTED',
        `the assertion was refused: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
    if (!profile) {
      throw new SamlError(
        'SAML_ASSERTION_REJECTED',
        'the response carried no assertion (a logout response was posted to the ACS)',
      )
    }
    return toIdentity(profile as Record<string, unknown>)
  }

  return {
    entity: config.entity,
    loginUrl: (relayState: string) =>
      saml.getAuthorizeUrlAsync(relayState, undefined, {}),
    stepUpUrl: (relayState: string) =>
      stepUpSaml.getAuthorizeUrlAsync(relayState, undefined, {}),
    completeIdpLogout: async (
      query: Record<string, unknown>,
      originalQuery: string,
    ): Promise<string> => {
      let profile
      try {
        ;({ profile } = await saml.validateRedirectAsync(
          query as Parameters<typeof saml.validateRedirectAsync>[0],
          originalQuery,
        ))
      } catch (cause) {
        // A PLAIN Error, NOT a SamlError, and the distinction is load-bearing:
        // `errors.ts` answers every SamlError 401 with *"sign-in could not be
        // completed — start again at /auth/login"*, which fails closed correctly
        // for an assertion and is simply wrong here. Nobody was signing in. The
        // route owns this refusal and answers `400 SAML_LOGOUT_REJECTED`.
        throw new Error(
          `the logout request was refused: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
      if (!profile) {
        throw new Error('the logout request carried no profile to answer')
      }
      // `success: true` — we have ended the session by the time this is sent. A
      // LogoutResponse is owed either way: an IdP that gets none leaves the session
      // it is tearing down marked as still live at every other SP.
      const relayState = typeof query.RelayState === 'string' ? query.RelayState : ''
      return saml.getLogoutResponseUrlAsync(profile, relayState, {}, true)
    },
    validate: (samlResponse: string) => validateWith(saml, samlResponse),
    validateStepUp: (samlResponse: string) => validateWith(stepUpSaml, samlResponse),
  }
}

/** First value only: a SAML attribute is multi-valued and this wants a scalar. */
function first(value: unknown): string | undefined {
  const scalar = Array.isArray(value) ? value[0] : value
  return typeof scalar === 'string' && scalar.length > 0 ? scalar : undefined
}

/**
 * A validated profile → §9's identity, or a refusal.
 *
 * `ubcEduCwlPuid` is read by OID and then by friendly name, the same two-step
 * the blueprint's bridge makes: the OID is what the Manifest IdP and real UBC
 * Shibboleth both send, and the friendly fallback costs one `??` and covers an
 * IdP configured without `core:AttributeMap`.
 *
 * A missing PUID THROWS rather than returning a user with an empty identifier.
 * §9 makes it the only stable identifier UBC guarantees — a CWL login name can
 * change and an email address is not unique over time — so a session keyed on
 * anything else is a session that eventually belongs to the wrong person.
 */
function toIdentity(profile: Record<string, unknown>): SamlIdentity {
  const read = (friendly: keyof typeof OID): string | undefined =>
    first(profile[OID[friendly]]) ?? first(profile[friendly])

  const ubcCwlPuid = read('ubcEduCwlPuid')
  if (ubcCwlPuid === undefined) {
    throw new SamlError(
      'SAML_NO_PUID',
      'the assertion released no ubcEduCwlPuid. The control plane’s Service ' +
        'Provider registration must declare it and the IdP enforces release ' +
        'against that list (§9), so an attribute the row omits is never sent.',
    )
  }
  const givenName = read('givenName')
  const sn = read('sn')
  return {
    ubcCwlPuid,
    email: read('mail') ?? '',
    // Falls back to the PUID rather than to an empty string: `display_name` is
    // NOT NULL and is what a member list shows, and a blank row there reads as
    // a broken database rather than as an IdP that released no name.
    displayName: [givenName, sn].filter(Boolean).join(' ') || ubcCwlPuid,
  }
}

/**
 * The §6 `User` for an authenticated person: created on first login, found on
 * every one after.
 *
 * **The role is set on INSERT and never on update**, and that is the whole of
 * §9's *"authentication is the IdP's job; authorization is not"*. Two failures
 * it prevents, in opposite directions: a login must not be able to grant `admin`
 * — `eduPersonAffiliation` says `faculty` for an instructor, and letting that
 * through would make the IdP an authorization authority — and a login must not
 * be able to REMOVE it either, which is what an `onConflictDoUpdate` that reset
 * the column would do to every platform admin the moment they logged in again.
 *
 * `onConflictDoUpdate` rather than a select-then-insert: two logins racing on a
 * new user would otherwise both insert, and P3 defect 76 measured what an
 * unhandled unique violation looks like from outside — 500 INTERNAL, with no
 * trace anywhere.
 */
export async function upsertUserFromAssertion(
  db: Db,
  identity: SamlIdentity,
): Promise<typeof users.$inferSelect> {
  await db
    .insert(users)
    .values({
      ubcCwlPuid: identity.ubcCwlPuid,
      email: identity.email,
      displayName: identity.displayName,
      role: 'member',
    })
    .onConflictDoUpdate({
      target: users.ubcCwlPuid,
      set: { email: identity.email, displayName: identity.displayName },
    })
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.ubcCwlPuid, identity.ubcCwlPuid))
  if (!user) {
    throw new SamlError(
      'SAML_USER_UPSERT_FAILED',
      `logged in '${identity.ubcCwlPuid}' but could not read the user back`,
    )
  }
  return user
}
