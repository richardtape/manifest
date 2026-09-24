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
    why: "§20's step-up re-authentication (P6a Task 8). A browser navigation that ends at the IdP and returns through the ACS; it re-proves a person rather than naming a resource, and its answer is a redirect rather than a representation.",
  },
  {
    method: 'POST',
    path: '/auth/saml/callback',
    why: "The ACS. Its URL is registered with the IdP in the platform's SP row (§9), so a prefix change would be an IdP registration change.",
  },
  {
    method: 'POST',
    path: '/auth/logout',
    why: "The console's own sign-out. Ends Manifest's session and answers where the browser goes next — the IdP's single logout, so the IdP's session ends too (P6b F10); not a resource.",
  },
  {
    method: 'GET',
    path: '/auth/logout',
    why: "The SLO URL registered beside the ACS (§9), reached by the IdP's HTTP-Redirect binding, which is a GET: the IdP's signed LogoutRequest, or its signed LogoutResponse to a console sign-out. Declared POST-only until P5c sitting 9 found that single logout therefore 404'd against Manifest's own SP.",
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
] as const satisfies readonly { method: 'GET' | 'POST'; path: string; why: string }[]
