// A minimal Service Provider, used only by sso/login.docker.test.ts. It exists
// to prove that a hand-written saml20_sp_remote row produces a usable login
// BEFORE any code generates such a row (§16, identity-path regression).
//
// It is built on the real passport-ubcshib because the mapping between what the
// IdP releases and what an app can read is precisely what is under test — S2
// found the library's own map covers six names, has no OID entry for `uid` or
// `eduPersonPrincipalName` at all, and reaches its MACE entry never.
import express from 'express'
import session from 'express-session'
import passport from 'passport'
import { readFileSync } from 'node:fs'

// DEFAULT IMPORT, THEN DESTRUCTURE, and the name is `Strategy`.
// passport-ubcshib is CommonJS and ends with
//   module.exports = { Strategy: UBCStrategy, UBC_CONFIG, ensureAuthenticated, … }
// so there is no `UBCStrategy` named export to import — that form yields
// undefined and `new undefined(...)` throws at construction. Measured against
// 0.1.6 on 2026-09-08.
import ubcshib from 'passport-ubcshib'
const { Strategy: UBCStrategy } = ubcshib

const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(
  session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }),
)
app.use(passport.initialize())
app.use(passport.session())
passport.serializeUser((u, d) => d(null, u))
passport.deserializeUser((u, d) => d(null, u))

passport.use(
  new UBCStrategy(
    {
      // Every one of these is §8's contract, read from the environment exactly
      // as the blueprint will read it.
      entryPoint: process.env.SAML_ENTRY_POINT,
      issuer: process.env.SAML_ISSUER,
      callbackUrl: process.env.SAML_CALLBACK_URL,
      // MANDATORY. The strategy builds `cert: options.cert || (() => { throw })()`,
      // an IIFE evaluated at construction, so it throws unless a certificate is
      // supplied and the library's _fetchCertificate() fallback is unreachable.
      cert: readFileSync(process.env.SAML_IDP_CERT_PATH, 'utf8'),
      // NON-EMPTY, or mapAttributes never runs and the app sees raw OID keys
      // (S2 Evidence 11). This list is what §9's attribute bridge is for.
      attributeConfig: ['ubcEduCwlPuid', 'mail', 'givenName', 'sn', 'eduPersonAffiliation'],
    },
    (profile, done) => done(null, profile),
  ),
)

// The blueprint's health_path. It must answer before the IdP is ever involved:
// the deploy's readiness gate probes it through the edge, and an app that only
// answers after a login would never become healthy.
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }))
app.get('/login', passport.authenticate('ubcshib'))
app.post(
  '/auth/ubcshib/callback',
  passport.authenticate('ubcshib', { failureRedirect: '/failed' }),
  (req, res) => res.json({ attributes: req.user?.attributes ?? null }),
)
app.get('/failed', (_req, res) => res.status(401).json({ error: 'saml login failed' }))
app.get('/me', (req, res) =>
  req.user
    ? res.json({ attributes: req.user.attributes })
    : res.status(401).json({ error: 'no session' }),
)

app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () =>
  console.log(JSON.stringify({ msg: 'saml-sp listening', port: process.env.PORT })),
)
