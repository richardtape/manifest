import type { Session } from './session.js'

/**
 * §20's step-up re-authentication, bound to the browser that started it — the same shape
 * `login-state.ts` uses for a sign-in, and for the same reason: proving an assertion
 * answers a request THIS PROCESS made does not prove THIS BROWSER made it (P5a Decision
 * 16).
 *
 * Its OWN cookie rather than reusing `manifest_login`, because the two flows differ in
 * what the callback must then do, and a callback that guessed from one cookie would have
 * to guess right every time (P6a Decision 17). `path=/auth`, like the login cookie;
 * `SameSite=None` on https for the same measured reason — the IdP's auto-submitting POST
 * is cross-site.
 */
export const STEP_UP_COOKIE = 'manifest_stepup'

/** How long the browser may take to finish the round trip. The login cookie's number. */
export const STEP_UP_TTL_SECONDS = 600

/**
 * HOW FRESH A STEP-UP MUST BE when it is asserted (P6a Decision 8). Ten minutes: long
 * enough to read a release diff and decide, short enough that a stolen cookie is rarely
 * stepped up.
 *
 * Enforced at ASSERT time, never at issue time — because a Phase 1 session cannot be
 * revoked before its own expiry (§20), so the only lever is how old the claim may be
 * when it is used.
 */
export const STEP_UP_TTL_MS = 10 * 60 * 1000

/**
 * The claim stamped onto a session that has just completed the second round trip.
 *
 * It returns a NEW session rather than mutating: the caller re-signs it, and the
 * signature is what makes the claim unforgeable. Nothing but `/auth/saml/callback`'s
 * step-up branch calls this on a real cookie — `api/testing.ts` calls it for a test that
 * needs a stepped-up actor without a SAML round trip, and Task 9's *a fresh sign-in is
 * not a step-up* is what proves the route cannot be got at any other way.
 */
export function stepUpSession(session: Session, now: number = Date.now()): Session {
  return { ...session, steppedUpAt: now }
}

/**
 * Is this claim fresh enough to act on? Takes the VALUE rather than the actor, so the
 * session layer can answer it without knowing what an actor is.
 */
export function isSteppedUp(
  steppedUpAt: number | null,
  now: number = Date.now(),
): boolean {
  // `> 0` as well as non-null: a zero would be an epoch instant that is always stale, and
  // `.map(fn)` handing a mapper the ARRAY INDEX is exactly how a zero gets into a field
  // like this one (P5b sitting 7, F4). Refusing it costs nothing and closes that door.
  return steppedUpAt !== null && steppedUpAt > 0 && now - steppedUpAt < STEP_UP_TTL_MS
}
