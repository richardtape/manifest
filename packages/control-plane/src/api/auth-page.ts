import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * FE-17 (the front-end enablement plan's sitting 10): A REFUSAL AT `/auth/*` IS WHAT A PERSON SEES.
 * The IdP's auto-submitting form posts the callback, the IdP redirects to the single-logout
 * endpoint, and a client sends the browser to `/auth/step-up` — every one a NAVIGATION, so the
 * JSON envelope was a page of raw JSON. A browser is now answered a short page instead: what
 * happened, the code for whoever helps them, and a way to start again on the SAME origin.
 *
 * **Why a page and not a redirect to the origin's `/` with a code** (the option FE-17 offered
 * beside it): a page needs nothing from either front-end — the console and the faculty front-end
 * would both have had to render a new parameter — and the console's `/` sits behind sign-in, so a
 * refused sign-in sent there is sent straight back to the IdP. Every link on it is RELATIVE, so it
 * cannot send anyone to another host.
 *
 * **A browser is a request whose `Accept` names `text/html`** — every navigation's does, and no
 * script's by default (curl sends `*∕*`, `fetch` sends `*∕*`, the generated client
 * `application/json`) — so a caller that switches on the code keeps the envelope, byte for byte.
 */
export function wantsRefusalPage(request: FastifyRequest): boolean {
  if (!request.url.startsWith('/auth/')) return false
  const accept = request.headers.accept
  return typeof accept === 'string' && /(^|,)\s*text\/html\s*(;|,|$)/i.test(accept)
}

interface Refusal {
  code: string
  message: string
  hint?: string | undefined
}

const escape = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

/** The page, for the envelope's own words — nothing added that the envelope does not say. */
export function refusalPage(error: Refusal): string {
  const sentence = error.message.charAt(0).toUpperCase() + error.message.slice(1)
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Sign-in could not be completed — Manifest</title>',
    '<style>body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#1a1a1a}h1{font-size:1.4rem}code{background:#f2f2f2;padding:0 .25rem}a{color:#0055b7}</style>',
    '</head>',
    '<body>',
    '<main>',
    `<h1>${escape(sentence)}</h1>`,
    ...(error.hint === undefined ? [] : [`<p>${escape(error.hint)}</p>`]),
    '<p><a href="/auth/login">Sign in again</a> · <a href="/">Go to the start</a></p>',
    `<p><small>If you ask someone for help, tell them this code: <code>${escape(error.code)}</code></small></p>`,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

/** Answers the refusal as the page, with the envelope's own status. */
export function sendRefusalPage(reply: FastifyReply, status: number, error: Refusal) {
  return reply
    .status(status)
    .header('content-type', 'text/html; charset=utf-8')
    .header('cache-control', 'no-store')
    .header(
      'content-security-policy',
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    )
    .send(refusalPage(error))
}
