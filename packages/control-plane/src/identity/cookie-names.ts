import { LOGIN_COOKIE } from './login-state.js'
import { SESSION_COOKIE } from './session.js'
import { STEP_UP_COOKIE } from './step-up.js'

/**
 * THE COOKIES A SIGN-IN USES, NAMED BY THE SCHEME OF THE ORIGIN A REQUEST ARRIVED ON (FE-28; the
 * faculty-ready plan's Decision 7, approved by Rich 2026-09-30).
 *
 * WHY A PREFIX. Every deployed app is a sibling `<slug>.manifest.internal`, and a sibling can set
 * a cookie with `Domain=manifest.internal` that the console's and the front-end's origins then
 * receive: a session it read from its own visitor (planted in a colleague's browser), or a login
 * cookie carrying its own nonce, with which it auto-posts its own assertion through the victim's
 * browser to the CSRF-exempt ACS — signing the victim in as the attacker. A browser accepts a
 * `__Host-` cookie ONLY Secure, `Path=/` and with no `Domain`, so no sibling can set one, and an
 * https origin reads ONLY these names: a tossed plain cookie is not read at all (Decision 8 — a
 * leftover plain session from before the rename signs a browser out once, never refuses it).
 *
 * WHY NOT ON http. The plain names stay on loopback http, the Docker tier's control planes and the
 * mock's case, so nothing there changes. `[M1]` (2026-10-02) measured that Chrome 154 and curl
 * 8.7.1 DO keep a `__Host-` cookie on `http://127.0.0.1` and `http://localhost` — loopback is a
 * secure context to them — so this is no longer forced on loopback; Rich approved it per scheme,
 * and the recommendation recorded with that measurement is to keep it.
 *
 * EVERY SETTER, READER AND CLEARER asks this, from `originOf(request)` — the credential hook, CSRF's
 * `carriesSession`, and `routes/auth.ts`'s sign-in, step-up, callback and both sign-outs.
 */
export const HOST_SESSION_COOKIE = '__Host-manifest_session'
export const HOST_LOGIN_COOKIE = '__Host-manifest_login'
export const HOST_STEP_UP_COOKIE = '__Host-manifest_stepup'

export interface CookieNames {
  session: typeof SESSION_COOKIE | typeof HOST_SESSION_COOKIE
  login: typeof LOGIN_COOKIE | typeof HOST_LOGIN_COOKIE
  stepUp: typeof STEP_UP_COOKIE | typeof HOST_STEP_UP_COOKIE
}

/** The three names on `origin` — one of Manifest's configured origins, never a request's input. */
export function cookieNames(origin: string): CookieNames {
  return origin.startsWith('https://')
    ? {
        session: HOST_SESSION_COOKIE,
        login: HOST_LOGIN_COOKIE,
        stepUp: HOST_STEP_UP_COOKIE,
      }
    : { session: SESSION_COOKIE, login: LOGIN_COOKIE, stepUp: STEP_UP_COOKIE }
}
