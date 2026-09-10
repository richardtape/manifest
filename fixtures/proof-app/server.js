// §16's PROOF APP — the application that proves this platform authenticates a
// real person and keeps their data theirs.
//
// It is generated from `node-ts-mongo@1` the way a faculty member's agent would
// generate it: the blueprint's skeleton supplies `auth/`, `package.json` and
// `package-lock.json` — §20's "security multiplier", written once and inherited
// — and this file replaces the skeleton's `server.js`. There is deliberately no
// second copy of the auth component here: a forked one drifts from the
// blueprint's silently, and a vulnerability in it would then be fixed in one
// place and live on in the other.
//
// P4a builds the identity half. `GET /api/ai` is a stub that says so, and P4b
// replaces it with a real LLM answer.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express from 'express'
import session from 'express-session'
import passport from 'passport'
import { MongoClient } from 'mongodb'
import { configureCwl, logoutUrl } from './auth/ubcshib.js'
import { endUserId } from './identity.js'

/**
 * §8's platform rows, each read as a literal `process.env.NAME` and NONE of
 * them with a fallback — the same rule the blueprint's own `server.js` states
 * at length. `MONGODB_DB_NAME` is the worked example: every app deployed before
 * 2026-09-09 fell back to a database called `app` while its credentials were
 * minted for another one, and the tests that set the variable themselves passed
 * throughout.
 */
const RAW = {
  MANIFEST_ENV: process.env.MANIFEST_ENV,
  MANIFEST_APP_URL: process.env.MANIFEST_APP_URL,
  MANIFEST_PROJECT_SLUG: process.env.MANIFEST_PROJECT_SLUG,
  PORT: process.env.PORT,
  SESSION_SECRET: process.env.SESSION_SECRET,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
  // Presence is the signal "this app declared CWL", never a value. The platform
  // renders §8's SAML block whole or not at all (INJECTION_SP_ENTITY_MISSING),
  // so asking a manifest.yaml at runtime would be a second source of truth
  // beside what §13 froze.
  SAML_ISSUER: process.env.SAML_ISSUER,
  // Declared in manifest.yaml under `env:`. Not a platform row — it is here to
  // show what an app-supplied variable looks like beside injected ones.
  COURSE_CODE: process.env.COURSE_CODE,
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

const client = new MongoClient(
  required(
    'MONGODB_URI',
    'node-ts-mongo@1 binds a mongo service; declare one in manifest.yaml under `services:`',
  ),
)
const db = () => client.db(required('MONGODB_DB_NAME'))
const notes = () => db().collection('notes')

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(
  session({
    secret: required('SESSION_SECRET'),
    resave: false,
    saveUninitialized: false,
    // The platform terminates TLS at the edge and speaks HTTP to the container,
    // so express-session must be told the connection was secure or it refuses
    // to set a `secure` cookie and no session survives the redirect back.
    proxy: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: true },
  }),
)
app.set('trust proxy', 1)

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
  // Every §8 SAML variable is read here, at startup, so a missing one fails the
  // container's first boot rather than somebody's first login.
  const cwl = configureCwl()

  app.get('/login', cwl.login)
  // A POST, at the path the platform registered as the ACS URL and injected as
  // SAML_CALLBACK_URL. Change it in manifest.yaml (`auth.callback`), never here:
  // the IdP posts the assertion to whatever its own row says.
  app.post('/auth/ubcshib/callback', cwl.callback, (_req, res) => res.redirect('/'))
  app.get('/login/failed', (_req, res) =>
    res.status(401).json({ error: 'sign-in did not complete' }),
  )
  // The path `auth.logout` declares, which is what the platform wrote into this
  // app's SingleLogoutService. The blueprint's default is `/auth/logout`, so
  // that is the path served.
  app.get('/auth/logout', (req, res) => {
    req.logout(() => {
      const returnTo = encodeURIComponent(required('MANIFEST_APP_URL'))
      res.redirect(`${logoutUrl()}?ReturnTo=${returnTo}`)
    })
  })
}

/** 401 rather than a redirect: everything below is an API a script drives. */
function signedIn(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not signed in' })
  next()
}

/**
 * Who the IdP said you are, bridged from OIDs to friendly names by the
 * blueprint's `auth/attributes.js`.
 *
 * `attributes` is exactly what §9 let through — an attribute the Service
 * Provider row does not declare is never sent at all, so a shortened
 * `auth.attributes` shows up here as a missing key rather than an empty one.
 * That is the platform's attribute-release control, visible from the outside.
 */
app.get('/api/me', signedIn, (req, res) => {
  const user = req.user.user
  res.json({
    attributes: user,
    // Present when the IdP released the names; ABSENT when it did not, which is
    // what negative control (c) makes visible.
    displayName:
      user.givenName && user.sn ? `${user.givenName} ${user.sn}` : undefined,
    affiliation: user.eduPersonAffiliation,
    // The key this person's notes are stored under. Returned so the acceptance
    // can assert that two people are two different keys, without either of them
    // ever seeing the other's.
    endUserId: endUserId(user.ubcEduCwlPuid),
    course: required('COURSE_CODE'),
  })
})

/** Write a note. It belongs to whoever is signed in and to nobody else. */
app.post('/api/notes', signedIn, async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) return res.status(400).json({ error: 'text is required' })
  const owner = endUserId(req.user.user.ubcEduCwlPuid)
  const note = { owner, text, createdAt: new Date().toISOString() }
  await notes().insertOne(note)
  res.status(201).json({ text: note.text, createdAt: note.createdAt })
})

/**
 * YOUR notes. THE FILTER IS THE ACCEPTANCE.
 *
 * `{ owner }` is the whole of §16's proof: two people sign in to one deployment
 * of one application and each sees only what they wrote. Widening this query —
 * or keying a note on anything that is not derived from the assertion — is what
 * negative control (d) does, and the instructor then sees the student's note.
 */
app.get('/api/notes', signedIn, async (req, res) => {
  const owner = endUserId(req.user.user.ubcEduCwlPuid)
  const mine = await notes()
    .find({ owner })
    .sort({ createdAt: 1 })
    .project({ _id: 0, owner: 0 })
    .toArray()
  res.json({ notes: mine })
})

/**
 * P4b's half, stubbed rather than omitted so the shape is visible now.
 * It answers 501 and names what will fill it: `blueprint.yaml`'s `provides.ai`
 * is `false` today (Decision 12) and `renderInjection` REFUSES a spec declaring
 * `ai.models`, so this app cannot be given an LLM key until both change.
 */
app.get('/api/ai', signedIn, (req, res) => {
  res.status(501).json({
    error: 'the AI half of the proof app is P4b',
    detail:
      'node-ts-mongo@1 declares provides.ai: false, so no LLM_* variables are ' +
      'injected. P4b flips that, adds skeleton/ai/llm.js and answers here.',
    // Proof that the identifier P4b needs is already computed, and correctly.
    wouldUseEndUserId: endUserId(req.user.user.ubcEduCwlPuid),
  })
})

// The human-facing page. Static, and LAST, so no API path can be shadowed by a
// file that happens to share its name. The directory is resolved from this
// module rather than from the process's working directory: `express.static`
// takes a CWD-relative path, and a container started from anywhere but /app
// would serve nothing and report no error.
app.use(express.static(join(dirname(fileURLToPath(import.meta.url)), 'public')))

await client.connect()
// The platform chooses the port. An app that hardcodes the blueprint's
// default_port instead is unreachable behind a 502 for ever.
const port = Number(required('PORT'))
app.listen(port, '0.0.0.0', () =>
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'proof app listening',
      port,
      auth: CWL_ENABLED ? 'cwl' : 'none',
      env: RAW.MANIFEST_ENV,
    }),
  ),
)
