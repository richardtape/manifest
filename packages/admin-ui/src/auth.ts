/**
 * THE ONLY FILE IN THIS CONSOLE THAT MAY NAME `fetch` OR AN `/auth/` PATH (D22; `boundary.test.ts`
 * asserts both halves). Signing in is the browser's and the IdP's business, not the versioned
 * API's — D23.8 lists `/auth/login` and `/auth/step-up` outside `/v1` — so, as in the reference
 * console (`packages/console/src/auth.ts`), the round trips live here and everything else goes
 * through `api.ts`. The approval pane's step-up joins this file when it is built.
 */

/**
 * Leaves the page for the sign-in round trip, which lands back on `returnTo` — a same-origin PATH
 * the platform re-checks (`safeReturnTo`: any same-origin path up to 512 characters), and the
 * mock's `/auth/login` honours too. So an ended session comes back to the URL it was on.
 */
export function signIn(returnTo: string): void {
  window.location.assign(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`)
}
