import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'manifest_session'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export interface Session {
  userId: string
  puid: string
  role: 'admin' | 'member'
  /** epoch milliseconds */
  issuedAt: number
  /** epoch milliseconds */
  expiresAt: number
  /**
   * §20's step-up re-authentication (P6a Task 8, Decision 8). When this person last
   * completed a SECOND authentication round trip — a `ForceAuthn` AuthnRequest the IdP
   * re-prompted for — in epoch milliseconds.
   *
   * A UNION WITH null, not an optional property: absence is a fact every reader must
   * handle, and `exactOptionalPropertyTypes` makes an optional one awkward at every
   * construction site.
   *
   * **It inherits the divergence §20 records with its cost**: Phase 1 sessions are
   * stateless signed cookies with no server-side store, so a stepped-up session **cannot
   * be revoked before its own expiry** — which is why `STEP_UP_TTL_MS` is short and is
   * enforced at ASSERT time rather than at issue time. The store §20 defers is what would
   * fix it.
   */
  steppedUpAt: number | null
  /**
   * THE IdP'S HANDLE ON THIS SIGN-IN — what a console sign-out quotes back to the IdP so
   * it ends the session it holds, not only Manifest's (P6b F10, fixed 2026-09-24). Without
   * it the IdP kept its session and the next *Sign in with CWL* returned the previous
   * person with no password asked — on a shared lab machine, somebody else's session.
   *
   * Carried in the signed cookie because Phase 1 sessions have no server-side store (§20).
   * None of it is a secret: a transient NameID and a SessionIndex identify a session to
   * the IdP that issued them and authenticate nobody. `null` for a cookie an older build
   * signed, whose sign-out then ends Manifest's session alone and says so by landing on `/`.
   */
  idp: IdpSessionHandle | null
}

/** The NameID and SessionIndex an assertion carried — SAML's name for a session at the IdP. */
export interface IdpSessionHandle {
  nameID: string
  nameIDFormat: string
  sessionIndex: string | null
  nameQualifier: string | null
  spNameQualifier: string | null
}

export function issueSession(
  user: { id: string; ubcCwlPuid: string; role: 'admin' | 'member' },
  now: number = Date.now(),
  idp: IdpSessionHandle | null = null,
): Session {
  return {
    userId: user.id,
    puid: user.ubcCwlPuid,
    role: user.role,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
    // NEVER stepped up at sign-in. §20 asks for a SECOND round trip, and a sign-in that
    // counted as one would make `assertStepUp` a check on having a session at all.
    steppedUpAt: null,
    idp,
  }
}

/**
 * A handle out of a signed cookie — VALIDATED, NOT TRUSTED, for `steppedUpAt`'s reason:
 * the payload is signed, but an older build wrote no such field and a newer one could
 * write anything. Anything that is not a handle becomes `null`, never a refusal.
 */
function readIdpHandle(value: unknown): IdpSessionHandle | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const text = (x: unknown) => (typeof x === 'string' && x.length > 0 ? x : null)
  const nameID = text(v.nameID)
  const nameIDFormat = text(v.nameIDFormat)
  if (nameID === null || nameIDFormat === null) return null
  return {
    nameID,
    nameIDFormat,
    sessionIndex: text(v.sessionIndex),
    nameQualifier: text(v.nameQualifier),
    spNameQualifier: text(v.spNameQualifier),
  }
}

function mac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signSession(session: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  return `${payload}.${mac(payload, secret)}`
}

/**
 * Returns null for anything that is not a currently valid session — a bad
 * signature, a tampered payload, an expired session, or malformed input.
 * It never throws, because it runs on untrusted request data.
 */
export function verifySession(
  token: string,
  secret: string,
  now: number = Date.now(),
): Session | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, signature] = parts as [string, string]
  if (payload.length === 0 || signature.length === 0) return null

  const expected = mac(payload, secret)
  const given = Buffer.from(signature)
  const want = Buffer.from(expected)
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null

  let session: Session
  try {
    session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session
  } catch {
    return null
  }
  if (typeof session.expiresAt !== 'number' || session.expiresAt <= now) return null
  if (session.role !== 'admin' && session.role !== 'member') return null
  if (typeof session.userId !== 'string' || session.userId.length === 0) return null
  /**
   * §20's step-up claim: VALIDATED, NOT TRUSTED (P6a Task 8).
   *
   * The payload is signed, so a client cannot forge this — but a cookie signed by an
   * OLDER build has no such field, and one written by a future build could carry
   * anything. A non-number becomes `null` rather than a refusal, because an old cookie
   * is a valid session that simply is not stepped up: refusing would sign everybody on
   * this machine out the moment the control plane restarted, including the administrator
   * who is about to approve something.
   */
  const steppedUpAt =
    typeof session.steppedUpAt === 'number' && Number.isFinite(session.steppedUpAt)
      ? session.steppedUpAt
      : null
  return { ...session, steppedUpAt, idp: readIdpHandle(session.idp) }
}
