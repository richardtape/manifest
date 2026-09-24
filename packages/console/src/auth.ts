/**
 * THE ONLY FILE IN THE CONSOLE THAT MAY NAME `fetch` OR A `/auth/` PATH (D22, Decision 5).
 *
 * Signing in is the browser's and the IdP's business, not the versioned API's — D23.8, and
 * the control plane's own `api/unversioned.ts` lists both of these endpoints with the
 * reason each is outside `/v1`:
 *
 *   GET  /auth/login    a browser-mediated sign-in whose URL the Manifest IdP completes (§9)
 *   GET  /auth/step-up  §20's re-authentication, the same round trip with ForceAuthn (P6a)
 *   POST /auth/logout   the console's sign-out, which answers where to go next: the IdP's
 *                       single logout, so CWL forgets the person too (P6b F10)
 *
 * Everything else the console does goes through `api.ts` and `@manifest/contract`.
 * `boundary.test.ts` asserts both halves of that sentence.
 */

/**
 * Leaves the page. `returnTo` is a same-origin PATH; the callback lands back on it.
 *
 * Task 1's M6 measured both directions of the check on the other side: a legitimate
 * `/projects/deep/path` round-trips intact, and a protocol-relative `//evil.example.com/x`
 * falls back to `/`. It also measured that `manifest_login` carries `Max-Age=600`, so a
 * sign-in left sitting at the IdP for more than ten minutes loses its return path.
 */
export function signIn(returnTo: string = location.pathname + location.search): void {
  window.location.href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
}

/**
 * §20's STEP-UP, as a URL (P6a Task 18) — the link `<Refusal>` renders for
 * `403 STEP_UP_REQUIRED`. `GET /auth/step-up` sends the browser to the IdP with `ForceAuthn`,
 * which asks for a password AGAIN even though the person is signed in (measured on a warm
 * cookie jar, P6a sitting 6), and lands back on `returnTo` with the claim on the SAME
 * session for ten minutes. The request the person was making is NOT replayed: they press
 * the button again, which is the point — they chose to.
 *
 * A URL and not a navigation, because it is rendered as a LINK a person follows, never as a
 * redirect fired by a refusal. `returnTo` is re-checked server-side by `safeReturnTo`, exactly
 * as `/auth/login`'s is, so the console does not have to be trusted about it.
 */
export function stepUpUrl(returnTo: string): string {
  return `/auth/step-up?returnTo=${encodeURIComponent(returnTo)}`
}

/**
 * Ends the session — Manifest's AND the IdP's — and leaves the page. `POST /auth/logout`
 * clears Manifest's session and answers `200 { redirectTo }`: the IdP's SingleLogoutService
 * with a signed LogoutRequest, which ends CWL's session and comes back to `/`; or `/` itself
 * for a session the IdP gave no handle for. Until 2026-09-24 it answered 204 and the console
 * went to `/`, so the IdP kept its session and the next *Sign in with CWL* returned the
 * previous person without asking for a password (P6b F10).
 *
 * `POST /auth/logout` is NOT exempt from §20's origin check —
 * only the SAML callback is — and a browser sends `Origin` itself, which is why the console
 * must be reached at `console.manifest.internal` and never at `127.0.0.1:7104`.
 *
 * IT ASSERTS THE SHAPE OF THE ANSWER, NOT THAT AN ANSWER ARRIVED (Task 4). The first draft
 * awaited the POST and left for `/` whatever came back, so a refused sign-out reloaded the
 * page, `getMe` succeeded, and the person was STILL SIGNED IN with nothing saying so — this
 * codebase's most productive defect shape (ORIENTATION §4, the swallowed catch).
 *
 * `response.ok` would not be enough either. Measured 2026-09-18 at `127.0.0.1:7104`: the
 * console's own Vite server answers every GET under `/v1` with `index.html` and **200**, and
 * a POST under `/auth` with 404 — so an `ok` check calls a sign-out that never reached the
 * control plane a success. The route answers **200 with a `redirectTo`** and nothing else —
 * and the destination must be a same-origin path or an https URL, so an answer can never
 * navigate to a `javascript:` URL or off to a protocol-relative host.
 */
export async function signOut(): Promise<void> {
  const response = await fetch('/auth/logout', { method: 'POST' })
  if (response.status !== 200) {
    throw new Error(
      `sign-out was refused: POST /auth/logout answered ${response.status}, not 200`,
    )
  }
  let redirectTo: unknown
  try {
    redirectTo = ((await response.json()) as { redirectTo?: unknown }).redirectTo
  } catch {
    redirectTo = undefined
  }
  if (
    typeof redirectTo !== 'string' ||
    !(/^\/(?!\/)/.test(redirectTo) || redirectTo.startsWith('https://'))
  ) {
    throw new Error(
      'sign-out was refused: POST /auth/logout did not say where to go next, so the IdP may still hold the session',
    )
  }
  window.location.href = redirectTo
}
