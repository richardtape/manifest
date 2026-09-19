/**
 * THE ONLY FILE IN THE CONSOLE THAT MAY NAME `fetch` OR A `/auth/` PATH (D22, Decision 5).
 *
 * Signing in is the browser's and the IdP's business, not the versioned API's — D23.8, and
 * the control plane's own `api/unversioned.ts` lists both of these endpoints with the
 * reason each is outside `/v1`:
 *
 *   GET  /auth/login    a browser-mediated sign-in whose URL the Manifest IdP completes (§9)
 *   POST /auth/logout   the SLO URL registered beside the ACS (§9)
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
 * Ends the session and reloads. `POST /auth/logout` is NOT exempt from §20's origin check —
 * only the SAML callback is — and a browser sends `Origin` itself, which is why the console
 * must be reached at `console.manifest.internal` and never at `127.0.0.1:7104`.
 */
export async function signOut(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST' })
  window.location.href = '/'
}
