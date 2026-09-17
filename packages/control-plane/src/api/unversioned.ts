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
    method: 'POST',
    path: '/auth/saml/callback',
    why: "The ACS. Its URL is registered with the IdP in the platform's SP row (§9), so a prefix change would be an IdP registration change.",
  },
  {
    method: 'POST',
    path: '/auth/logout',
    why: "The SLO URL registered beside the ACS (§9). Ends the browser's session; not a resource.",
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
