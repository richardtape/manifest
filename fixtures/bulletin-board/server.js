// A COURSE BULLETIN BOARD — `make demo-authoring`'s app (the authoring API plan's
// Task 13). Students post questions; instructors reply; an instructor holding the
// board's admin code pins a question.
//
// It is written the way an agent writes an app on `node-ts-mongo@1`: the skeleton
// supplies `auth/`, `ai/`, `package.json` and `package-lock.json`, and this file
// replaces the skeleton's `server.js` — which is how the proof app is built too.
// There is no second copy of the auth component here: a forked one drifts from the
// blueprint's silently.
import { createHash, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express from 'express'
import passport from 'passport'
import { MongoClient, ObjectId } from 'mongodb'
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
  // Declared in manifest.yaml as `secret: true`: its value is set through Manifest's
  // API for each environment and never written in git. OPTIONAL HERE ON PURPOSE —
  // the platform refuses to deploy a release whose declared secret has no value
  // (RELEASE_SECRET_NOT_SET), and /api/status says whether it arrived, so an app
  // that crashed without it would hide the answer to exactly that question.
  BOARD_ADMIN_CODE: process.env.BOARD_ADMIN_CODE,
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
const posts = () => db().collection('posts')

const TITLE_MAX = 200
const BODY_MAX = 4000

const app = express()
app.use(express.json({ limit: '32kb' }))
// NOT OPTIONAL WITH CWL: the IdP's answer arrives by SAML's HTTP-POST binding, as a form. Without
// this the callback has no SAMLResponse to read, and every sign-in lands quietly on
// /login/failed — measured, on this app's first run.
app.use(express.urlencoded({ extended: false }))
// Sessions live in the app's own Mongo: a redeploy replaces this container.
app.use(sessionMiddleware(client))
app.set('trust proxy', 1)

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
// container's first boot rather than the first sign-in. This app declares CWL, so
// the block is always injected.
const cwl = configureCwl()
app.get('/login', cwl.login)
// The ACS path is manifest.yaml's `auth.callback`; change it there, never here.
app.post('/auth/ubcshib/callback', cwl.callback, (_req, res) => res.redirect('/'))
app.get('/login/failed', (_req, res) =>
  res.status(401).json({ error: 'sign-in did not complete' }),
)
app.get('/auth/logout', cwl.logout(required('MANIFEST_APP_URL')))

/** 401 rather than a redirect: the page and the demo both read the API. */
function signedIn(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not signed in' })
  next()
}

/**
 * The person as a post shows them: a name and whether they are an instructor —
 * NEVER their PUID, which is only what the session is keyed on. A person whose
 * names the IdP did not release is "A UBC user".
 */
function author(req) {
  const user = req.user.user
  const name =
    user.givenName && user.sn ? `${user.givenName} ${user.sn}` : 'A UBC user'
  const affiliations = [].concat(user.eduPersonAffiliation ?? [])
  return { name, instructor: affiliations.includes('faculty') }
}

function text(value, max) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : undefined
}

function postId(req, res) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(404).json({ error: 'no such post' })
    return undefined
  }
  return new ObjectId(req.params.id)
}

function shown(post) {
  return {
    id: post._id.toHexString(),
    title: post.title,
    body: post.body,
    author: post.author,
    pinned: post.pinned === true,
    createdAt: post.createdAt,
    replies: post.replies ?? [],
  }
}

app.get('/api/me', signedIn, (req, res) => res.json(author(req)))

/** Whether the admin code arrived — never the code. */
app.get('/api/status', (_req, res) =>
  res.json({ adminCodeConfigured: typeof RAW.BOARD_ADMIN_CODE === 'string' && RAW.BOARD_ADMIN_CODE !== '' }),
)

/** Every question, newest first, each with its replies and its author's name. */
app.get('/api/posts', signedIn, async (_req, res) => {
  const all = await posts().find({}).sort({ createdAt: -1 }).limit(200).toArray()
  res.json({ posts: all.map(shown) })
})

app.post('/api/posts', signedIn, async (req, res) => {
  const title = text(req.body?.title, TITLE_MAX)
  const body = text(req.body?.body, BODY_MAX)
  if (!title || !body)
    return res.status(400).json({ error: `a title (at most ${TITLE_MAX} characters) and a body (at most ${BODY_MAX}) are required` })
  const post = {
    title,
    body,
    author: author(req),
    pinned: false,
    createdAt: new Date().toISOString(),
    replies: [],
  }
  const { insertedId } = await posts().insertOne(post)
  res.status(201).json(shown({ ...post, _id: insertedId }))
})

app.post('/api/posts/:id/replies', signedIn, async (req, res) => {
  const id = postId(req, res)
  if (!id) return
  const body = text(req.body?.body, BODY_MAX)
  if (!body) return res.status(400).json({ error: `a body (at most ${BODY_MAX} characters) is required` })
  const reply = { body, author: author(req), createdAt: new Date().toISOString() }
  const { matchedCount } = await posts().updateOne({ _id: id }, { $push: { replies: reply } })
  if (matchedCount === 0) return res.status(404).json({ error: 'no such post' })
  res.status(201).json(reply)
})

/**
 * THE SECRET, COMPARED IN CONSTANT TIME. Both sides are hashed first, so the
 * comparison takes the same time whatever the code's length, and a wrong guess
 * learns nothing about how close it was.
 */
function isAdminCode(given) {
  const digest = (value) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(given), digest(RAW.BOARD_ADMIN_CODE))
}

app.post('/api/posts/:id/pin', signedIn, async (req, res) => {
  if (!RAW.BOARD_ADMIN_CODE)
    return res.status(503).json({ error: 'this board has no admin code configured' })
  const given = req.get('x-board-admin-code')
  if (typeof given !== 'string' || !isAdminCode(given))
    return res.status(403).json({ error: 'that is not the board’s admin code' })
  const id = postId(req, res)
  if (!id) return
  const { matchedCount } = await posts().updateOne({ _id: id }, { $set: { pinned: true } })
  if (matchedCount === 0) return res.status(404).json({ error: 'no such post' })
  res.json({ pinned: true })
})

// The page. Static, and LAST, so no API path can be shadowed by a file of the
// same name; resolved from this module, not the working directory.
app.use(express.static(join(dirname(fileURLToPath(import.meta.url)), 'public')))

await client.connect()
// The platform chooses the port.
const port = Number(required('PORT'))
app.listen(port, '0.0.0.0', () =>
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'bulletin board listening',
      port,
      adminCodeConfigured: Boolean(RAW.BOARD_ADMIN_CODE),
    }),
  ),
)
