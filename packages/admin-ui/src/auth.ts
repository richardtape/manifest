/**
 * THE ONLY FILE IN THIS CONSOLE THAT MAY NAME `fetch` OR AN `/auth/` PATH (D22; `boundary.test.ts`
 * asserts both halves). Signing in is the browser's and the IdP's business, not the versioned
 * API's — D23.8 lists `/auth/login`, `/auth/step-up` and `POST /auth/logout` outside `/v1` — so, as
 * in the reference console (`packages/console/src/auth.ts`), the round trips live here and everything
 * else goes through `api.ts`. Three round trips live here: sign-in, sign-out and the approval
 * pane's step-up.
 */

/**
 * Leaves the page for the sign-in round trip, which lands back on `returnTo` — a same-origin PATH
 * the platform re-checks (`safeReturnTo`: any same-origin path up to 512 characters), and the
 * mock's `/auth/login` honours too. So an ended session comes back to the URL it was on.
 */
export function signIn(returnTo: string): void {
  window.location.assign(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`)
}

/**
 * Ends the session — Manifest's AND the IdP's — and leaves the page: the rail's *Sign out*. The
 * reference console's `signOut`, whole (P6b F10): `POST /auth/logout` clears Manifest's session and
 * answers `200 { redirectTo }` — the IdP's single logout, so CWL forgets the person too, or `/` for a
 * session the IdP gave no handle for (the mock's answer). IT ASSERTS THE SHAPE OF THE ANSWER, NOT
 * THAT AN ANSWER ARRIVED: a Vite server answers what it does not proxy with `index.html`, so a status
 * or `response.ok` alone would call a sign-out that never reached the platform a success, and the
 * person would still be signed in with nothing saying so. The destination must be a same-origin path
 * or an https URL — never a `javascript:` URL or a protocol-relative host.
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
  window.location.assign(redirectTo)
}

/**
 * WHERE A DECISION ANSWERED `403 STEP_UP_REQUIRED` SENDS THE OPERATOR (§20; Review Focus 3): a fresh
 * CWL sign-in that comes back to THIS pane and THIS preview — its id in the return path, which the
 * router keeps (`Route`'s `preview`) — so the operator lands where they were, the preview restored
 * by `getApprovalPreview` and their reason by `sessionStorage`. The return path is encoded whole, as
 * the reference console encodes it, so its `?` and `=` are never read as the step-up's own query.
 */
export function stepUpUrl(releaseId: string, previewId: string): string {
  return (
    '/auth/step-up?returnTo=' +
    encodeURIComponent('/releases/' + releaseId + '/approval?preview=' + previewId)
  )
}
