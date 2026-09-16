// node-ts-mongo@1's skeleton. What a generated application starts from.
//
// THE FILENAME IS PART OF THE CONTRACT. `Dockerfile.tmpl` ends
// `CMD ["node", "server.js"]` at the WORKDIR root, and neither the template nor
// `blueprint.yaml` has a placeholder for it. An app whose entry point is
// anywhere else builds cleanly and then exits immediately with
// `Cannot find module '/app/server.js'` — a green build and a dead container.
//
// It contains NO Dockerfile and NO .npmrc. D13 makes the build definition the
// blueprint's, and `assembleContext` writes both AFTER the app's tree, so a
// committed copy is overwritten rather than honoured.
import express from 'express'
import passport from 'passport'
import { MongoClient } from 'mongodb'
import { configureCwl, logoutUrl } from './auth/ubcshib.js'
import { sessionMiddleware } from './auth/session.js'
import { AI_ENABLED, configureAi } from './ai/llm.js'

/**
 * §8's platform rows, each read as a literal `process.env.NAME`.
 *
 * In one block, and literally, for the reason auth/ubcshib.js gives: §16's
 * injection-contract drift test reads this file's SOURCE and compares the names
 * it finds against what `renderInjection` produces. A `process.env[name]` helper
 * would hide every one of them.
 *
 * NOTHING HERE HAS A FALLBACK. The platform owns these values (§8); a default
 * turns "Manifest did not inject it" into "the app quietly used something else",
 * and `MONGODB_DB_NAME` is the worked example — every app deployed before
 * 2026-09-09 fell back to a database called `app` while its credentials were
 * minted for another one, and two tests that set the variable themselves passed
 * throughout.
 */
const RAW = {
  MANIFEST_ENV: process.env.MANIFEST_ENV,
  MANIFEST_APP_URL: process.env.MANIFEST_APP_URL,
  MANIFEST_PROJECT_SLUG: process.env.MANIFEST_PROJECT_SLUG,
  PORT: process.env.PORT,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
  // NOT USED AS A VALUE — only as the signal below. The platform renders §8's
  // SAML block for an app whose `auth.provider` is `cwl` and for no other, and
  // it renders the block whole: `renderInjection` refuses to produce a partial
  // one (INJECTION_SP_ENTITY_MISSING). So this variable's presence is exactly
  // "this app declared CWL", and reading a manifest.yaml at runtime to ask the
  // same question would be a second source of truth beside what §13 froze.
  SAML_ISSUER: process.env.SAML_ISSUER,
}

function required(name, hint) {
  const value = RAW[name]
  if (!value) {
    throw new Error(
      `${name} is required and was not injected (§8)` + (hint ? `. ${hint}` : ''),
    )
  }
  return value
}

const CWL_ENABLED = RAW.SAML_ISSUER !== undefined

// Mongo is not optional in `node-ts-mongo@1` — the name is the contract, and
// `provides.services: [mongo]` is what the blueprint binds. An app that declares
// no mongo service gets this message on its first boot rather than a container
// that runs and cannot store anything.
const client = new MongoClient(
  required(
    'MONGODB_URI',
    'node-ts-mongo@1 binds a mongo service; declare one in manifest.yaml under `services:`',
  ),
)
const db = () => client.db(required('MONGODB_DB_NAME'))

// §8's AI rows, for an app that declared models. Configured HERE, at startup, for
// configureCwl()'s reason: a missing or partial block fails the container's first
// boot rather than a person's first question. The import above is harmless for an
// app with no models; ai/llm.js's `ask`, `askStreaming` and `embed` are what an
// app's own routes call.
if (AI_ENABLED) configureAi()

const app = express()
app.use(express.urlencoded({ extended: false }))
// Sessions live in the app's OWN Mongo, not in this process: the platform replaces
// this container on every deploy (§11 Redeploys), and a session held in memory signs
// everybody out each time. `auth/session.js` reads SESSION_SECRET and MONGODB_DB_NAME
// itself, with no fallback, and is the one copy of this configuration — the proof app
// imports it too.
app.use(sessionMiddleware(client))
// Same reason: `secure: true` above is only honoured once Express believes the
// request arrived over HTTPS, which it learns from the edge's X-Forwarded-Proto.
app.set('trust proxy', 1)

/**
 * The blueprint descriptor's `health_path`, and the platform probes it — the
 * container HEALTHCHECK and the deploy's readiness gate through the edge both
 * point here. It must answer before any login: an app that only answers to an
 * authenticated request never becomes healthy and the deploy fails.
 *
 * It pings Mongo, because "the process is up" reports healthy for an app that
 * cannot serve a request.
 */
app.get('/healthz', async (_req, res) => {
  try {
    await db().command({ ping: 1 })
    res.json({ status: 'ok', mongo: true })
  } catch (error) {
    res.status(503).json({ status: 'error', message: String(error) })
  }
})

if (CWL_ENABLED) {
  app.use(passport.initialize())
  app.use(passport.session())
  // Every §8 SAML variable is read HERE, at startup — so a missing one fails the
  // container's first boot rather than the first login.
  const cwl = configureCwl()

  app.get('/login', cwl.login)
  // A POST: SAML's HTTP-POST binding is how the assertion comes back, and the
  // path must be the one registered as the ACS URL — which the platform derived
  // from `auth.callback` and injected as SAML_CALLBACK_URL. Change this path in
  // manifest.yaml, never here.
  app.post('/auth/ubcshib/callback', cwl.callback, (_req, res) => res.redirect('/'))
  app.get('/login/failed', (_req, res) =>
    res.status(401).json({ error: 'sign-in did not complete' }),
  )
  // `/auth/logout`, because that is `auth.logout`'s DEFAULT in §7's schema and
  // therefore the `SingleLogoutService` location the platform writes into this
  // app's `saml20_sp_remote` row. It served `/logout` until 2026-09-09, so every
  // app generated from this blueprint that took the default advertised a logout
  // endpoint it did not answer — invisible today because nothing initiates
  // IdP-side single logout, and a 404 in front of a real person the moment
  // anything does. Change it in manifest.yaml (`auth.logout`), never here.
  app.get('/auth/logout', (req, res) => {
    req.logout(() => {
      // Ends the IdP's session too, and comes back to this app's own base URL —
      // §8 injects both, so neither origin is written down here.
      const returnTo = encodeURIComponent(required('MANIFEST_APP_URL'))
      res.redirect(`${logoutUrl()}?ReturnTo=${returnTo}`)
    })
  })
}

/** The signed-in user, bridged to friendly names by auth/attributes.js. */
app.get('/me', (req, res) =>
  req.user ? res.json(req.user.user) : res.status(401).json({ error: 'not signed in' }),
)

app.get('/', async (_req, res) => {
  res.json({
    app: required('MANIFEST_PROJECT_SLUG'),
    env: required('MANIFEST_ENV'),
    url: required('MANIFEST_APP_URL'),
    auth: CWL_ENABLED ? 'cwl' : 'none',
    ai: AI_ENABLED,
    database: required('MONGODB_DB_NAME'),
  })
})

await client.connect()
// The platform chooses the port: it is what the container HEALTHCHECK probes and
// what the Caddy route uses as its upstream. An app that hardcodes the
// blueprint's `default_port` instead listens somewhere else and is unreachable
// behind a 502 for ever — the container runs and the route exists, which is why
// it took P3 a session to find.
const port = Number(required('PORT'))
app.listen(port, '0.0.0.0', () =>
  console.log(
    JSON.stringify({ level: 'info', msg: 'listening', port, auth: CWL_ENABLED }),
  ),
)
