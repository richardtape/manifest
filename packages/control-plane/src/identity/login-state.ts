import { randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * A sign-in, bound to the browser that started it (P5a Decision 16).
 *
 * node-saml's `InResponseTo` check proves an assertion answers a request THIS PROCESS
 * made. It does not prove the request was made by THIS BROWSER: anyone can start their
 * own sign-in, finish it at the IdP, and post the resulting assertion through a victim's
 * browser — which then holds the attacker's session (login CSRF). So `/auth/login` sets
 * a cookie holding a nonce, sends the same nonce as SAML `RelayState`, and the callback
 * refuses an assertion whose `RelayState` is not the cookie's.
 *
 * The RETURN PATH rides in the cookie, not in `RelayState`: SAML Bindings §3.4.3 caps
 * `RelayState` at 80 bytes, which a path does not fit. It is re-checked on the way out,
 * because a cookie is the client's input too.
 */
export const LOGIN_COOKIE = 'manifest_login'
export const LOGIN_TTL_SECONDS = 600

/** A same-origin path: one leading slash, no second, no whitespace, no backslash. */
const RETURN_TO = /^\/(?!\/)[^\s\\]{0,511}$/

export function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && RETURN_TO.test(value) ? value : '/'
}

/** 24 random bytes, base64url: 32 characters, inside RelayState's 80. */
export function newLoginNonce(): string {
  return randomBytes(24).toString('base64url')
}

export function encodeLoginCookie(nonce: string, returnTo: string): string {
  return `${nonce}.${Buffer.from(safeReturnTo(returnTo), 'utf8').toString('base64url')}`
}

export function readLoginCookie(
  value: string | undefined,
): { nonce: string; returnTo: string } | undefined {
  if (value === undefined) return undefined
  const dot = value.indexOf('.')
  if (dot <= 0) return undefined
  const nonce = value.slice(0, dot)
  const returnTo = Buffer.from(value.slice(dot + 1), 'base64url').toString('utf8')
  return { nonce, returnTo: safeReturnTo(returnTo) }
}

/**
 * Constant-time for equal lengths, and never true for an empty nonce — two empty strings
 * are equal and bind nothing. The callback cannot reach that case today (`readLoginCookie`
 * refuses an empty nonce), which is exactly why it is refused here rather than trusted to
 * a caller.
 */
export function sameNonce(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right)
}
