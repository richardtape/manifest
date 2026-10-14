// node-ts-mongo@1's error handler: what a person sees when a route throws.
//
// MOUNT IT LAST — `app.use(errorHandler)` after every route and middleware, in
// every `server.js`. Express runs an error handler only for what was mounted
// before it, and four arguments are what make it one.
//
// Without it a failed CWL sign-in — or any route that threw — showed the person
// Express's development error page: the stack trace, with this container's
// paths in it. The image sets NODE_ENV=production too, so Express's own handler
// would not show a stack either; this one says something a person can read, and
// writes the error where whoever looks after the app will find it.

/**
 * Writes the error to the app's log and answers one plain sentence: `500` for an
 * error of the app's own, and a client error's own status (a form too large is
 * `413`) with a sentence of its own. Never a stack, a path or the error's message
 * in the answer.
 *
 * NEVER A SECRET IN THE LOG: the method and the PATH — not the query string, the
 * cookies or the body, any of which can carry one (a SAML response is a
 * credential) — and the error's own stack.
 */
export function errorHandler(error, req, res, next) {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'a request failed',
      method: req.method,
      path: req.path,
      error: error instanceof Error ? (error.stack ?? String(error)) : String(error),
    }),
  )
  // The answer has begun: Express's own handler closes the connection.
  if (res.headersSent) return next(error)
  const status = Number(error?.status ?? error?.statusCode)
  if (status >= 400 && status < 500)
    return res.status(status).json({ error: 'This request could not be handled.' })
  return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' })
}
