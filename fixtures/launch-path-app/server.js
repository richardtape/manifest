// OFFICE HOURS — `make demo-launch`'s app (the launch path plan's Task 15). A student signs in
// with CWL and books a slot; the page greets them by their given name and says where the
// confirmation goes.
//
// The demo writes this file and `manifest.yaml` through Manifest's API, the way an agent writes an
// app on `node-ts-mongo@1`: the skeleton supplies `auth/`, `ai/`, `package.json` and
// `package-lock.json`, and this file replaces the skeleton's `server.js`.
//
// WHAT IT READS OF A SIGNED-IN PERSON IS THE POINT. The registration package Manifest drafts for UBC
// IAM justifies each attribute by the lines of the app that read it: `ubcEduCwlPuid`, `givenName`
// and `mail` are read below, as properties of the person the blueprint's bridge hands over.
// `manifest.yaml` also asks for the surname, and NOTHING HERE READS IT — so the package flags it
// unused and warns before it is sent. Do not add a read of it: the demo asserts the warning.
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
const bookings = () => db().collection('bookings')

/** The week's slots. A booking takes one; nobody books two. */
const SLOTS = ['Monday 10:00', 'Tuesday 14:00', 'Thursday 11:00']

const app = express()
app.set('trust proxy', 1)

// NOT OPTIONAL WITH CWL: the IdP's answer arrives by SAML's HTTP-POST binding, as a form. Without
// this the callback has no SAMLResponse to read. The page's own form posts a booking the same way.
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
const cwl = configureCwl()
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

function page(body) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Office hours</title></head>
<body>
<h1>Office hours</h1>
${body}
</body>
</html>
`
}

app.get('/', async (req, res) => {
  if (!req.user)
    return res
      .type('html')
      .send(page('<p><a href="/login">Sign in with CWL</a> to book a slot.</p>'))
  const person = req.user.user
  const mine = await bookings().findOne({ puid: person.ubcEduCwlPuid })
  const taken = new Set((await bookings().find({}).toArray()).map((b) => b.slot))
  const choices = SLOTS.filter((s) => !taken.has(s))
    .map((s) => `<option>${escape(s)}</option>`)
    .join('')
  res.type('html').send(
    page(`<p>Hello, ${escape(person.givenName ?? 'there')}.</p>
${
  mine
    ? `<p>You are booked for ${escape(mine.slot)}. The confirmation went to ${escape(person.mail ?? 'nobody — CWL released no email')}.</p>`
    : `<form method="post" action="/bookings">
<label>Slot <select name="slot">${choices}</select></label>
<button>Book</button>
</form>`
}`),
  )
})

app.post('/bookings', async (req, res) => {
  if (!req.user) return res.status(401).type('text/plain').send('sign in first\n')
  const slot = typeof req.body?.slot === 'string' ? req.body.slot : ''
  if (!SLOTS.includes(slot)) return res.status(400).type('text/plain').send('no such slot\n')
  const puid = req.user.user.ubcEduCwlPuid
  if (await bookings().findOne({ $or: [{ puid }, { slot }] }))
    return res.status(409).type('text/plain').send('that slot, or a slot of yours, is booked\n')
  await bookings().insertOne({ puid, slot, bookedAt: new Date().toISOString() })
  res.redirect(303, '/')
})

await client.connect()
// The platform chooses the port.
const port = Number(required('PORT'))
app.listen(port, '0.0.0.0', () =>
  console.log(JSON.stringify({ level: 'info', msg: 'office hours listening', port })),
)
