// COURSE NOTICES — `make demo-load`'s app (the load rehearsal plan's Task 8a). A large course's front
// page: the newest notices, and a greeting for whoever has signed in with CWL. The page everyone opens
// the minute an assignment is released, which is the arrival the load rehearsal puts on it.
//
// The demo writes this file, `manifest.yaml` and `load-app.json` through Manifest's API, the way an
// agent writes an app on `node-ts-mongo@1`: the skeleton supplies `auth/`, `ai/`, `package.json` and
// `package-lock.json`, and this file replaces the skeleton's `server.js`.
//
// IT CAN FALL OVER, BY ITS OWN COMMITTED SWITCH. When `load-app.json` says `"fallOver": true`, the front
// page takes SLOW_MS to answer and answers `503` to any request beyond AT_ONCE in flight — an app that
// cannot take a crowd, made so honestly by its own code. `/healthz` is left alone, so Docker's health
// check and the edge's active one stay green and the first rule the rehearsal sees broken is the share
// of requests answered. The switch is a FILE, not a secret: a secret changes no image digest, so the
// release — and the launch checklist's item — would not change; a commit builds a new candidate.
import { readFileSync } from 'node:fs'
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

/** Whether this release falls over under a crowd — `load-app.json`, committed beside this file. */
const { fallOver } = JSON.parse(
  readFileSync(new URL('./load-app.json', import.meta.url), 'utf8'),
)
if (typeof fallOver !== 'boolean') throw new Error('load-app.json: fallOver is true or false')

/**
 * HOW IT FALLS OVER. By Little's law an instance's requests in flight are its arrival rate times its
 * answer time. The rehearsal asks for its three paths in turn, so a third of a member's requests are
 * this page; at the synchronised profile's 75 then 50 a second over three members that is about 8 then
 * 5.6 a second of it each — about 5 then 3.3 in flight at 600 ms, if the edge spreads them evenly. So
 * it answers TWO at once and refuses the rest: well over a third of the page refused, however the
 * edge happens to spread it, while every answer it does give stays far under the 2 s p95 mark.
 */
const SLOW_MS = 600
const AT_ONCE = 2
let inFlight = 0

const client = new MongoClient(
  required(
    'MONGODB_URI',
    'node-ts-mongo@1 binds a mongo service; declare one in manifest.yaml under `services:`',
  ),
)
const db = () => client.db(required('MONGODB_DB_NAME'))
const notices = () => db().collection('notices')

const app = express()
app.set('trust proxy', 1)

// NOT OPTIONAL WITH CWL: the IdP's answer arrives by SAML's HTTP-POST binding, as a form.
app.use(express.urlencoded({ extended: false }))
// Sessions live in the app's own Mongo: a redeploy replaces this container.
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
const cwl = configureCwl(client)
app.get('/login', cwl.login)
// The ACS path is manifest.yaml's `auth.callback`; change it there, never here.
app.post('/auth/ubcshib/callback', cwl.callback, (_req, res) => res.redirect('/'))
app.get('/login/failed', (_req, res) =>
  res.status(401).type('text/plain').send('sign-in did not complete\n'),
)
app.get('/auth/logout', cwl.logout(required('MANIFEST_APP_URL')))

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Every value from outside is text, never markup. */
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c])

/** The front page: the five newest notices — read from the app's own Mongo on every request — and who is reading. */
async function frontPage(req, res) {
  const newest = await notices().find({}).sort({ postedAt: -1 }).limit(5).toArray()
  const list =
    newest.length === 0
      ? '<p>No notices yet.</p>'
      : `<ul>${newest.map((n) => `<li>${escape(n.text)}</li>`).join('')}</ul>`
  const who = req.user
    ? `<p>Hello, ${escape(req.user.user.givenName ?? 'there')}.</p>`
    : '<p><a href="/login">Sign in with CWL</a> to see your course’s notices.</p>'
  res.type('html').send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Course notices</title></head>
<body>
<h1>Course notices</h1>
${who}
${list}
</body>
</html>
`)
}

app.get('/', async (req, res) => {
  if (!fallOver) return frontPage(req, res)
  if (inFlight >= AT_ONCE)
    return res.status(503).type('text/plain').send('too many people at once\n')
  inFlight += 1
  try {
    await new Promise((resolve) => setTimeout(resolve, SLOW_MS))
    await frontPage(req, res)
  } finally {
    inFlight -= 1
  }
})

await client.connect()
// The platform chooses the port.
const port = Number(required('PORT'))
app.listen(port, '0.0.0.0', () =>
  console.log(
    JSON.stringify({ level: 'info', msg: 'course notices listening', port, fallOver }),
  ),
)
