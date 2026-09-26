/**
 * D23.8: every resource route and the event stream are served under `/v1/`. These are
 * the endpoints that are NOT resources, and the contract says so rather than omitting
 * them silently (Task 6 writes this list into the OpenAPI document).
 *
 * Adding a route outside `/v1` means adding it here WITH ITS REASON — which is the
 * review `versioning.test.ts` forces.
 */
export const UNVERSIONED = [
  {
    method: 'GET',
    path: '/auth/login',
    why: 'Browser-mediated sign-in. Its URL is part of the flow the Manifest IdP completes (§9), not a resource.',
  },
  {
    method: 'GET',
    path: '/auth/step-up',
    why: "§20's step-up re-authentication. A browser navigation that ends at the IdP and returns through the ACS; it re-proves a person rather than naming a resource, and its answer is a redirect rather than a representation.",
  },
  {
    method: 'POST',
    path: '/auth/saml/callback',
    why: "The ACS. Its URL is registered with the IdP in the platform's SP row (§9), so a prefix change would be an IdP registration change.",
  },
  {
    method: 'POST',
    path: '/auth/logout',
    why: "The console's own sign-out. Ends Manifest's session and answers where the browser goes next — the IdP's single logout, so the IdP's session ends too; not a resource.",
  },
  // Declared POST-only until P5c sitting 9 found that single logout therefore 404'd against
  // Manifest's own SP. (Each `why` is PUBLISHED — `x-manifest-unversioned` — so its history
  // lives here, in a comment, and the published text names no plan: docs.test.ts.)
  {
    method: 'GET',
    path: '/auth/logout',
    why: "The SLO URL registered beside the ACS (§9), reached by the IdP's HTTP-Redirect binding, which is a GET: the IdP's signed LogoutRequest, or its signed LogoutResponse to a console sign-out.",
  },
  {
    method: 'GET',
    path: '/internal/registry/token',
    why: 'The registry token realm (§13). Its callers are the Docker daemon and BuildKit speaking the distribution token protocol, never a Manifest client.',
  },
  {
    method: 'POST',
    path: '/internal/registry/token',
    why: 'The registry token realm, OAuth2 form grant. Same callers, same reason.',
  },
  {
    method: 'POST',
    path: '/webhooks/github',
    why: "GitHub's deliveries (D5's GitHub driver): its caller is GitHub, never a Manifest client, and its credential is the delivery's HMAC signature rather than a session or a token (§20). Reached at 127.0.0.1:7100 directly, as the edge itself reaches the control plane — never through the edge, which forwards only /v1/* and /auth/*. On driver 1 it answers every delivery 404 WEBHOOKS_NOT_CONFIGURED.",
  },
] as const satisfies readonly { method: 'GET' | 'POST'; path: string; why: string }[]
