// §16's PROOF APP — the application that proves this platform authenticates a
// real person, keeps their data theirs, and answers them through a model it can
// account for.
//
// It is generated from `node-ts-mongo@1` the way a faculty member's agent would
// generate it: the blueprint's skeleton supplies `auth/`, `ai/`, `package.json` and
// `package-lock.json` — §20's "security multiplier", written once and inherited —
// and this file replaces the skeleton's `server.js`. There is deliberately no
// second copy of the auth component, the AI component or the end-user identifier
// here: a forked one drifts from the blueprint's silently, and a vulnerability in
// it would then be fixed in one place and live on in the other.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express from 'express'
import session from 'express-session'
import passport from 'passport'
import { MongoClient } from 'mongodb'
import { configureCwl, logoutUrl } from './auth/ubcshib.js'
// The AI half. The BLUEPRINT's component, not the toolkit: that is where
// `encoding_format: 'float'` and the namespaced end-user identifier live, and §20's
// "the blueprint is a security multiplier" is only true while apps actually use it.
// `endUserId` comes from it too — this app's own copy was deleted in P4b Task 16, so
// the key every note is stored under and the key every question is charged to are
// one string with one producer.
import { askStreaming, configureAi, embed, endUserId } from './ai/llm.js'

/**
 * §8's platform rows, each read as a literal `process.env.NAME` and NONE of
 * them with a fallback — the same rule the blueprint's own `server.js` states
 * at length. `MONGODB_DB_NAME` is the worked example: every app deployed before
 * 2026-09-09 fell back to a database called `app` while its credentials were
 * minted for another one, and the tests that set the variable themselves passed
 * throughout. §8's AI rows are read in `ai/llm.js`, for the same reason.
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

// THIS APP NEEDS ITS AI HALF, so it is configured UNCONDITIONALLY — unlike the
// skeleton, which serves apps that may declare no models and asks `AI_ENABLED`
// first. A deploy of this app without `ai.models` therefore fails its FIRST BOOT,
// and §14's Incident carries llm.js's sentence naming the fix, rather than a
// student meeting it at their first question.
configureAi()

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
    // The key this person's notes are stored under AND the identifier their
    // questions are charged to (§10). Returned so the acceptances can assert that
    // two people are two different keys, without either ever seeing the other's.
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

/** How many of the asker's most recent notes are candidates for a question's context. */
const CONTEXT_CANDIDATES = 20

function cosine(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB)
}

/**
 * The OpenAI SDK's OWN messages for a request that never got an HTTP answer. Measured
 * 2026-09-15 inside this app's container on `ubc-genai-toolkit-llm` 0.7.0 (P4b sitting
 * 10): a gateway that cannot be reached surfaces as the toolkit's `APIError` with `code`
 * 500 — the default for "no status" — `message` 'Connection error.' and
 * `details.type` 'Error'. The type is 'Error' for EVERY SDK failure, because the SDK's
 * error classes do not set `name`, so it cannot tell a dead connection from a 500 the
 * gateway sent. These two strings can: they are the SDK's constants, never text from
 * the gateway, so matching them cannot carry a key's hash anywhere.
 */
const NO_ANSWER_MESSAGES = new Set(['Connection error.', 'Request timed out.'])

/**
 * A failed AI call as a sentence a faculty member can act on — never a stack trace,
 * and never the gateway's own text, which for a refused key carries the key's hash
 * (§14). The toolkit wraps every SDK failure as an `APIError` whose `code` is the HTTP
 * status, so the class of failure is read from that and from the SDK's two fixed
 * no-answer messages above.
 */
function aiFailure(error) {
  const status = typeof error?.code === 'number' ? error.code : undefined
  if (status === 500 && NO_ANSWER_MESSAGES.has(error?.message)) {
    return {
      status: 503,
      code: 'AI_BACKEND_UNAVAILABLE',
      error:
        'The AI service could not be reached from this application. Nothing was lost — ' +
        'try again in a minute, and if it keeps happening, tell the project’s owner.',
    }
  }
  if (status === 429) {
    return {
      status: 429,
      code: 'AI_BUDGET_EXCEEDED',
      error:
        'This application has used its AI allowance for the month, or is sending too many ' +
        'questions at once. The project’s owner can raise ai.budget in manifest.yaml.',
    }
  }
  if (status === 401 || status === 403) {
    return {
      status: 503,
      code: 'AI_ACCESS_REFUSED',
      error:
        'The AI service refused this application’s access key. Redeploying the application ' +
        'issues a new one.',
    }
  }
  return {
    status: 502,
    code: 'AI_UNAVAILABLE',
    error: 'The AI service could not answer this question. Try again — nothing was lost.',
  }
}

/**
 * Ask a question, answered with ONE OF YOUR OWN NOTES as context. §16's third proof.
 *
 * Both declared models do real work: the question is embedded beside the asker's
 * recent notes (default-embed) to choose the most relevant one, and the answer is
 * STREAMED (default-chat). The response reports the shape of what came back —
 * the chunk count and the embedding's dimension — because S3 ran six checks, all
 * green, while one returned 192 numbers where 768 belonged.
 */
app.post('/api/ask', signedIn, async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : ''
  if (!question) return res.status(400).json({ error: 'question is required' })
  // The PUID comes from the SESSION, never from the request body. An app that takes
  // an end-user identifier from its own client lets one student spend another's
  // allowance — the identifier is also the budget key (§10) — and `make demo-ai`'s
  // negative control (c) watches the spend land on the student somebody else named.
  const puid = req.user.user.ubcEduCwlPuid
  const owner = endUserId(puid)
  // ONLY THE ASKER'S OWN NOTES can become context: the same `{ owner }` filter as
  // GET /api/notes. A model is never handed anything this person could not already
  // read, which is what the PIA will say reaches it.
  const candidates = await notes()
    .find({ owner })
    .sort({ createdAt: -1 })
    .limit(CONTEXT_CANDIDATES)
    .project({ _id: 0, text: 1 })
    .toArray()

  let reply
  try {
    // ONE embedding call, for the question and every candidate — charged to the asker,
    // like the answer: it is spend on their behalf.
    const vectors = await embed([question, ...candidates.map((note) => note.text)], puid)
    const dimensions = vectors[0]?.length ?? 0
    // One vector per input, all one non-zero length. A ragged or short reply is
    // refused here; a uniformly WRONG length — S3's 192 — is reported below, where
    // the acceptance compares it with the model's real 768.
    if (
      vectors.length !== candidates.length + 1 ||
      dimensions === 0 ||
      vectors.some((vector) => vector.length !== dimensions)
    ) {
      throw new Error(`malformed embeddings: ${vectors.length} for ${candidates.length + 1} inputs`)
    }
    let best = -1
    let bestScore = -Infinity
    vectors.slice(1).forEach((vector, i) => {
      const score = cosine(vectors[0], vector)
      if (score > bestScore) {
        best = i
        bestScore = score
      }
    })
    const context = best === -1 ? undefined : candidates[best].text

    let streamedChunks = 0
    const response = await askStreaming(
      context === undefined
        ? question
        : `${question}\n\nOne note I wrote earlier, which may be relevant:\n${context}`,
      puid,
      () => {
        streamedChunks += 1
      },
    )
    reply = {
      answer: response.content,
      streamedChunks,
      embeddingDimensions: dimensions,
      context: context ?? null,
      attributedTo: owner,
    }
  } catch (error) {
    const failure = aiFailure(error)
    // For the operator: the error's class and status diagnose it, and the message is
    // left out because a gateway's message can carry a key's hash (§14).
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'ai call failed',
        type: error?.details?.type ?? error?.name,
        status: error?.code,
      }),
    )
    return res.status(failure.status).json({ error: failure.error, code: failure.code })
  }
  // A THINKING model streams ZERO content frames, with no error, at any token budget
  // (S3). An empty answer is a failure, not an answer.
  if (!reply.answer) {
    return res.status(502).json({
      error: 'The model returned an empty answer. Try again; if it persists, the model this app uses needs changing.',
      code: 'AI_EMPTY_ANSWER',
    })
  }
  res.json(reply)
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
      ai: true,
      env: RAW.MANIFEST_ENV,
    }),
  ),
)
