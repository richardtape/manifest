// The session, kept in the app's OWN database — not in this container's memory.
//
// WHY IT IS NOT MemoryStore. The platform replaces an app's container on every deploy
// (§11 Redeploys), and `express-session`'s default store lives in the process: measured
// 2026-09-15, every redeploy signed every user out — the first request to the new
// container answered 401 while the platform was carefully keeping SESSION_SECRET stable
// so that exactly that would not happen. express-session's own authors say MemoryStore
// is not for production.
//
// One module, imported by the skeleton's server.js AND by §16's proof app, because §20
// calls the blueprint a security multiplier: a forked copy of session handling drifts,
// and a session bug in it is a session bug in every generated application.
import session from 'express-session'
import MongoStore from 'connect-mongo'

/**
 * §8's rows, read as literals so §16's injection-drift test can see them, and with NO
 * fallback: the platform owns these values, and a default turns "Manifest did not inject
 * it" into "the app quietly used something else" — which is what `MONGODB_DB_NAME` cost
 * before 2026-09-09.
 */
const RAW = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
}

function required(name) {
  const value = RAW[name]
  if (!value) throw new Error(`${name} is required and was not injected (§8)`)
  return value
}

/** Eight hours, refreshed at most every five minutes. Eight because that is
 *  passport-saml's own request-id expiry and a working day; the refresh window keeps a
 *  read-only request from writing to the database on every page. */
const TTL_SECONDS = 8 * 60 * 60
const TOUCH_AFTER_SECONDS = 5 * 60

/**
 * The app's session middleware, over the SAME MongoClient the app already holds — one
 * connection, one set of credentials, and the sessions land in the app's own database
 * beside its own collections.
 *
 * Call it BEFORE `client.connect()` if you like: connect-mongo 6.0.0 creates its expiry
 * index as soon as the store is constructed, and the mongodb driver connects on that
 * first operation by itself. A database that cannot be reached therefore fails the
 * container's boot, exactly as `client.connect()` would.
 */
export function sessionMiddleware(client) {
  return session({
    // Stored per app+environment by the platform and stable across deploys: a
    // regenerated secret signs everyone out, which is the failure this module exists to
    // prevent from the other direction.
    secret: required('SESSION_SECRET'),
    resave: false,
    saveUninitialized: false,
    // The platform terminates TLS at the edge and speaks HTTP to the container, so
    // express-session must be told the connection was secure or it refuses to set a
    // `secure` cookie and no session survives the redirect back from the IdP.
    proxy: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: true },
    store: MongoStore.create({
      client,
      dbName: required('MONGODB_DB_NAME'),
      collectionName: 'sessions',
      ttl: TTL_SECONDS,
      touchAfter: TOUCH_AFTER_SECONDS,
      // Mongo expires them itself, so an app that is asleep is not accumulating rows.
      // connect-mongo's default too; stated, because the alternative — a timer in this
      // process — is exactly the kind of state a redeploy throws away.
      autoRemove: 'native',
    }),
  })
}
