import type { FastifyRequest } from 'fastify'
import { cookieNames } from '../identity/index.js'

/**
 * §20: "CSRF protection on every state-changing route" — as an ORIGIN check (P5a
 * Decision 15), applied to every request that carries the session cookie.
 *
 * WHY THIS AND WHY HERE. The console and the API share `console.manifest.internal`, and
 * every deployed app is SAME-SITE with it (`<slug>.staging.manifest.internal` locally,
 * `<slug>.manifest.apps.ltic.ubc.ca` at UBC). `SameSite=Lax` sends the session cookie on
 * a same-site form POST, so untrusted app code could act as whoever visits it. Browsers
 * send `Origin` on every POST and every WebSocket handshake; a script sets it (Node 24's
 * fetch sends none unless told — P5a Task 1, M5).
 *
 * A request WITHOUT the cookie is not asked: there is nothing to forge with, and its
 * refusal is authentication's (401), not this. A cookie that does not verify still
 * counts as carrying one — the check does not depend on the session being valid.
 */
export class CsrfRefusedError extends Error {
  readonly code = 'CSRF_ORIGIN_REFUSED'
  constructor(
    readonly received: string | undefined,
    readonly expected: string,
  ) {
    super(
      received === undefined
        ? 'a request carrying a Manifest session must say which origin it came from, and this one did not'
        : `a request carrying a Manifest session came from '${received.slice(0, 100)}', not '${expected}'`,
    )
    this.name = 'CsrfRefusedError'
  }
}

/**
 * Whether the request carries `origin`'s session cookie — by THAT origin's name (FE-28): a plain
 * `manifest_session` on an https origin is no credential there (the credential hook does not read
 * it), so there is nothing to forge with and nothing to check.
 */
export function carriesSession(request: FastifyRequest, origin: string): boolean {
  return request.cookies[cookieNames(origin).session] !== undefined
}

/** Throws `CsrfRefusedError` unless a session-bearing request came from `origin`. */
export function assertSameOrigin(request: FastifyRequest, origin: string): void {
  if (!carriesSession(request, origin)) return
  const received = request.headers.origin
  if (received !== origin) {
    throw new CsrfRefusedError(
      typeof received === 'string' ? received : undefined,
      origin,
    )
  }
}
