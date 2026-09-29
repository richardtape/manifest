// READING RESPONSES — `make demo-frontend`'s app (the front-end enablement plan's Task
// 15). A student signs in with CWL and posts a response to the week's reading; the page
// lists every response stored in the app's own Mongo, each under its author's name.
//
// A faculty front-end's server writes it through Manifest's API, on a delegated token: this
// file and `manifest.yaml` as TEXT, and `logo.png` — which the demo makes, a 1×1 PNG — as
// BYTES. It is written the way an agent writes an app on `node-ts-mongo@1`: the skeleton
// supplies `auth/`, `ai/`, `package.json` and `package-lock.json`, and this file replaces the
// skeleton's `server.js`. There is no second copy of the auth component here: a forked one
// drifts from the blueprint's silently.
//
// ONE OUTPUT LINE PER REQUEST, AND IT PRINTS THE APP'S OWN `MONGODB_URI` — ON PURPOSE. The
// demo reads that line back with `getInstanceOutput`, and the platform must answer
// `[REDACTED]` where the database's password was and never the URI (§14: an app's output is
// redacted before it leaves the control plane). A real app never prints a credential; this one
// does so that the redaction is shown working on a real line from a real container.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express from 'express'
import passport from 'passport'
import { MongoClient } from 'mongodb'
import { configureCwl } from './auth/ubcshib.js'
import { sessionMiddleware } from './auth/session.js'

/**
 * §8's platform rows, each read as a literal `process.env.NAME` and none of them
 * with a fallback — the rule the blueprint's own `server.js` states at length.
 */
const RAW = {
  MANIFEST_APP_URL: process.env.MANIFEST_APP_URL,
  PORT: process.env.PORT,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
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

const client = new MongoClient(
  required(
    'MONGODB_URI',
    'node-ts-mongo@1 binds a mongo service; declare one in manifest.yaml under `services:`',
  ),
)
const db = () => client.db(required('MONGODB_DB_NAME'))
const responses = () => db().collection('responses')

const RESPONSE_MAX = 2000
/** This module's directory — where `logo.png` sits in the image, whatever the working directory. */
const HERE = dirname(fileURLToPath(import.meta.url))

const app = express()
app.set('trust proxy', 1)

// THE REQUEST'S LINE, FIRST, so a request that fails further on has still printed one. Not the
// platform's health checks: one every few seconds would bury what a person did.
app.use((req, _res, next) => {
  if (req.path !== '/healthz')
    console.log(
      JSON.stringify({
        marker: 'reading-responses request',
        method: req.method,
        path: req.originalUrl,
        // DELIBERATE — see the head of this file. The platform must redact it.
        mongo: RAW.MONGODB_URI,
      }),
    )
  next()
})

// NOT OPTIONAL WITH CWL (the front-end enablement plan's Task 5, the authoring API's F1): the
// IdP's answer arrives by SAML's HTTP-POST binding, as a form. Without this the callback has
// no SAMLResponse to read, and every sign-in lands quietly on /login/failed. The page's own
// form posts a response the same way.
app.use(express.urlencoded({ extended: false }))
// Sessions live in the app's own Mongo: a redeploy replaces this container, and an archive
// keeps the data.
app.use(sessionMiddleware(client))

app.get('/healthz', async (_req, res) => {
  try {
    await db().command({ ping: 1 })
    res.json({ status: 'ok', mongo: true })
  } catch (error) {
    res.status(503).json({ status: 'error', message: String(error) })
  }
})

app.use(passport.initialize())
app.use(passport.session())
// Every §8 SAML variable is read here, at startup, so a missing one fails the
// container's first boot rather than the first sign-in.
const cwl = configureCwl()
app.get('/login', cwl.login)
// The ACS path is manifest.yaml's `auth.callback`; change it there, never here.
app.post('/auth/ubcshib/callback', cwl.callback, (_req, res) => res.redirect('/'))
app.get('/login/failed', (_req, res) =>
  res.status(401).type('text/plain').send('sign-in did not complete\n'),
)
app.get('/auth/logout', cwl.logout(required('MANIFEST_APP_URL')))

/** The course's logo — BYTES the agent committed with `encoding: 'base64'`. */
app.get('/logo.png', (_req, res) => res.sendFile(join(HERE, 'logo.png')))

/**
 * The person as a response shows them: a name — NEVER their PUID, which is only what
 * the session is keyed on. A person whose names the IdP did not release is "A UBC user".
 */
function nameOf(req) {
  const user = req.user.user
  return user.givenName && user.sn ? `${user.givenName} ${user.sn}` : 'A UBC user'
}

app.get('/api/me', (req, res) =>
  req.user ? res.json({ name: nameOf(req) }) : res.status(401).json({ error: 'not signed in' }),
)

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Every value a person typed is text, never markup. */
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c])

function page(body) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Reading responses</title></head>
<body>
<h1><img src="/logo.png" alt="" width="16" height="16"> Reading responses</h1>
${body}
</body>
</html>
`
}

/** The page: every response, newest first, for a person who has signed in. */
app.get('/', async (req, res) => {
  if (!req.user)
    return res
      .type('html')
      .send(page('<p><a href="/login">Sign in with CWL</a> to read and post responses.</p>'))
  const all = await responses().find({}).sort({ createdAt: -1 }).limit(200).toArray()
  const items = all
    .map((r) => `<li><strong>${escape(r.author)}</strong>: ${escape(r.text)}</li>`)
    .join('\n')
  res.type('html').send(
    page(`<p>Signed in as ${escape(nameOf(req))}.</p>
<form method="post" action="/responses">
<label>Your response to this week's reading <textarea name="text" maxlength="${RESPONSE_MAX}" required></textarea></label>
<button>Post</button>
</form>
<ul>
${items}
</ul>`),
  )
})

app.post('/responses', async (req, res) => {
  if (!req.user) return res.status(401).type('text/plain').send('sign in first\n')
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (text.length === 0 || text.length > RESPONSE_MAX)
    return res
      .status(400)
      .type('text/plain')
      .send(`a response is 1 to ${RESPONSE_MAX} characters\n`)
  await responses().insertOne({ text, author: nameOf(req), createdAt: new Date().toISOString() })
  res.redirect(303, '/')
})

await client.connect()
// The platform chooses the port.
const port = Number(required('PORT'))
app.listen(port, '0.0.0.0', () =>
  console.log(JSON.stringify({ level: 'info', msg: 'reading responses listening', port })),
)
