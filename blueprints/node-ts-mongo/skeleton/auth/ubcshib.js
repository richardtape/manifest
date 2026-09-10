// The blueprint's auth component. §8: "the AI's task for authentication is
// 'copy the blueprint's auth component', not 'implement SAML'" — so this file
// is the one an agent is told to leave alone, and every value in it comes from
// the environment Manifest injects.
//
// DEFAULT IMPORT, THEN DESTRUCTURE, and the name is `Strategy`.
// passport-ubcshib is CommonJS and ends with
//   module.exports = { Strategy: UBCStrategy, UBC_CONFIG, ensureAuthenticated, … }
// so there is no `UBCStrategy` named export to import — that form yields
// undefined and `new undefined(...)` throws at construction. Measured against
// 0.1.6 on 2026-09-08.
import { readFileSync } from 'node:fs'
import passport from 'passport'
import ubcshib from 'passport-ubcshib'
import { bridge } from './attributes.js'

const { Strategy: UBCStrategy } = ubcshib

/**
 * §8's SAML rows, each read as a literal `process.env.NAME`.
 *
 * In one block, and literally, because §16's injection-contract drift test reads
 * THIS FILE'S SOURCE for `process.env.X` and compares the set against what the
 * platform renders. A helper doing `process.env[name]` would hide every name
 * from that comparison, and the test would then assert that two hand-maintained
 * lists agree — which is the failure it exists to prevent.
 */
const RAW = {
  SAML_ENVIRONMENT: process.env.SAML_ENVIRONMENT,
  SAML_ISSUER: process.env.SAML_ISSUER,
  SAML_CALLBACK_URL: process.env.SAML_CALLBACK_URL,
  SAML_ENTRY_POINT: process.env.SAML_ENTRY_POINT,
  SAML_LOGOUT_URL: process.env.SAML_LOGOUT_URL,
  SAML_IDP_METADATA_URL: process.env.SAML_IDP_METADATA_URL,
  SAML_IDP_CERT_PATH: process.env.SAML_IDP_CERT_PATH,
  // §8's "Required in" column: staging and production only. The Manifest IdP
  // requires a signed AuthnRequest outside sandbox (§9) and real UBC encrypts
  // assertions; in sandbox the platform places no key and an unsigned request is
  // accepted. So this one is READ AND ALLOWED TO BE ABSENT, and it is the only
  // §8 variable this file treats that way.
  SAML_PRIVATE_KEY_PATH: process.env.SAML_PRIVATE_KEY_PATH,
}

/**
 * NONE of these has a fallback, and §8's `SAML_ENVIRONMENT` is the reason:
 * passport-ubcshib defaults it to 'STAGING' at index.js:120 AND index.js:307, so
 * an app deployed without it points at https://authentication.stg.id.ubc.ca —
 * real UBC infrastructure. A default here would reintroduce exactly that, one
 * level up, and it would do it silently.
 */
function required(name) {
  const value = RAW[name]
  if (!value) throw new Error(`${name} is required and was not injected (§8)`)
  return value
}

/**
 * Wires the strategy and returns the two middlewares an app mounts.
 *
 * Called at startup, not lazily: every §8 variable is read here, so a missing
 * one fails the container's FIRST boot rather than the first login. A deploy
 * that cannot authenticate should never become healthy.
 */
export function configureCwl() {
  passport.use(
    new UBCStrategy(
      {
        // The Manifest IdP in sandbox and staging, real UBC in production —
        // decided by the platform, never by this file. UBC_CONFIG.LOCAL
        // hardcodes SimpleSAMLphp 1.x paths (/simplesaml/saml2/idp/SSOService.php)
        // which 404 against the 2.x IdP Manifest runs, and that is why §8 makes
        // this variable mandatory rather than optional.
        entryPoint: required('SAML_ENTRY_POINT'),
        issuer: required('SAML_ISSUER'),
        // The REGISTERED ACS URL, injected. Not rebuilt here from
        // MANIFEST_APP_URL and a path: the IdP POSTs the assertion to whatever
        // its own row says, so an app listening anywhere else sees a login that
        // never completes and reports nothing (D15).
        callbackUrl: required('SAML_CALLBACK_URL'),
        // MANDATORY. The strategy builds `cert: options.cert || (() => { throw })()`,
        // an IIFE evaluated at construction, so it throws unless a certificate is
        // supplied and the library's _fetchCertificate() fallback is unreachable.
        // Manifest mounts the file; this blueprint never fetches it at runtime.
        cert: readFileSync(required('SAML_IDP_CERT_PATH'), 'utf8'),
        // Injected even though `cert` above makes the fetch unreachable, because
        // the DEFAULT is wrong: UBC_CONFIG.LOCAL.metadataUrl is
        // http://localhost:8080/simplesaml/saml2/idp/metadata.php — a 1.x path
        // on the CONTAINER'S OWN loopback, which is the failure §21 spends a
        // paragraph on. Leaving a library default in place that points at the
        // app itself is the same class of thing as leaving SAML_ENVIRONMENT unset.
        metadataUrl: required('SAML_IDP_METADATA_URL'),
        // Set only where the platform placed a key. The library turns it into
        // passport-saml's `privateKey`, which makes it SIGN the AuthnRequest —
        // and SimpleSAMLphp validates any signature that is PRESENT, whatever
        // the SP row says, so signing without a registered certificate is
        // refused with "Missing certificate in metadata". The platform writes
        // both halves together or neither.
        ...(RAW.SAML_PRIVATE_KEY_PATH
          ? { privateKeyPath: RAW.SAML_PRIVATE_KEY_PATH }
          : {}),
        // NON-EMPTY, or `mapAttributes` never runs and the profile keeps raw
        // OID keys (S2 Evidence 11 — the library does
        // `attributeConfig: options.attributeConfig || []` and then
        // `if (length > 0)`, so an absent list means no mapping at all).
        //
        // AND YET REMOVING IT REDDENS NOTHING, measured 2026-09-09 by deleting
        // it and running the full acceptance: `bridge()` reads the OID key
        // FIRST and falls back to the profile itself when `profile.attributes`
        // is unset, so it finds all seven names in the raw profile and the app
        // is unaffected. That is the bridge doing exactly what S2 built it for,
        // not a hole — but it means THIS OPTION IS NOT THE CONTROL IT LOOKS
        // LIKE, and a reader who assumes otherwise is assuming a flag whose
        // removal no test can see. Same shape as `validate.authnrequest` and
        // node-saml's `wantAssertionsSigned` (ORIENTATION §4); the third in
        // this plan. It stays because the library documents it, it costs
        // nothing, and it is what a name OUTSIDE the bridge's seven would need.
        //
        // Every name here must also be in the app's `auth.attributes`: §9
        // enforces release AT THE IdP, so an attribute this list requests and
        // the registration does not declare is never sent, and `bridge()`
        // reports it as absent rather than empty. THAT is the control, and
        // negative control (c) on the acceptance watches it work.
        attributeConfig: [
          'ubcEduCwlPuid',
          'mail',
          'givenName',
          'sn',
          'eduPersonAffiliation',
        ],
      },
      (profile, done) => done(null, { profile, user: bridge(profile) }),
    ),
  )

  passport.serializeUser((u, done) => done(null, u))
  passport.deserializeUser((u, done) => done(null, u))

  return {
    /** Mount at your login path. Redirects the browser to the IdP. */
    login: passport.authenticate('ubcshib'),
    /** Mount at `auth.callback` — a POST, because SAML uses HTTP-POST binding. */
    callback: passport.authenticate('ubcshib', { failureRedirect: '/login/failed' }),
  }
}

/**
 * Where to send a browser to end the IdP session.
 *
 * §8 injects SAML_LOGOUT_URL because the library's own `logout()` reads it from
 * ENV rather than from options — so it must be present even though every other
 * endpoint is passed in code. Read here as well so a missing value fails at
 * startup with the others, rather than the first time somebody signs out.
 */
export function logoutUrl() {
  return required('SAML_LOGOUT_URL')
}

/**
 * `LOCAL` in sandbox and staging, `PRODUCTION` in production — a different
 * vocabulary from MANIFEST_ENV on purpose, because they are two variables read
 * by two consumers. Read (and required) here so the fail-open default described
 * above can never apply.
 */
export function samlEnvironment() {
  return required('SAML_ENVIRONMENT')
}
