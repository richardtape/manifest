# Authentication

Every request to Manifest’s API carries exactly one credential — a person’s session or a delegated token — and this page is how to get each, what each may do, and what the platform asks of a client that uses one. It is for a developer writing a client and for an agent working out why it was refused. Both at once is `400 CREDENTIAL_AMBIGUOUS`; neither is `401 UNAUTHENTICATED`.

## A session — a person, in a browser

A person signs in with CWL, UBC’s single sign-on, at `GET /auth/login?returnTo=<a path on this origin>`: the browser goes to the identity provider and comes back to that path with a `__Host-manifest_session` cookie — Secure, `Path=/` and set for that origin’s host alone, so no other site on the same domain (a deployed app among them) can set one. A cookie named plain `manifest_session` is not read on an https origin; it is the name on a loopback `http` origin only, such as the mock’s. A client that is not a browser sends the cookie itself, named for the origin it calls: `sessionCookieFor(origin)` in `@manifest/contract`. Call Manifest at an origin it serves — the console’s or the front-end’s, through the edge — never at the control plane’s own port: a request there is judged as the console’s https origin, so only `__Host-manifest_session` is read, whatever the URL’s scheme. The session carries the person’s platform role, can do everything that person may do, and expires on its own, twelve hours after sign-in. Signing out is `POST /auth/logout`, which answers where the browser goes next.

**Who may build is decided at each sign-in.** Manifest is for faculty, for now: signing in tells it the person’s CWL affiliation as of that moment, and `getMe`’s `mayBuild` says whether they may build — `true` for a faculty member and for a platform administrator. Anyone else may sign in and read the projects they are on, but `createProject` and `startIntakeSession` refuse them `403 BUILDING_NOT_OPEN`, and they cannot be added to a project (`409 MEMBER_MAY_NOT_BUILD`). A person who stops being faculty keeps the projects they are on; their next sign-in is what tells Manifest.

**Manifest signs a person in on two origins** — the console’s (`https://console.manifest.internal` on a laptop) and the faculty front-end’s (`https://app.manifest.internal`) — and judges each request by the origin it arrived on. A sign-in, a step-up or a sign-out begun on one completes on it, and its cookie is that origin’s alone: a session on one is not a session on the other, and signing out of one leaves the other signed in. Signing out of a deployed app reaches the console’s session only; a session on the front-end’s origin lasts until it expires. *Building a front-end* says what a front-end’s server may do with the session it receives.

**A mutation made with a session must carry `Origin`** naming the origin it is sent to, or it is refused `403 CSRF_ORIGIN_REFUSED` — the other Manifest origin included. A browser sends it itself. A program that holds a person’s session — a test, a script run by that person — sends it too; the generated client does, when it is given the cookie’s value:

<!-- example: example-session -->

```ts
import { createManifestClient, unwrap } from '@manifest/contract'

/**
 * Who is signed in. A browser sends its session cookie itself; a client that is not a browser
 * passes the cookie's value, and the client adds the `Origin` header a session needs.
 */
export async function whoAmI(
  origin: string,
  session: string,
): Promise<{ name: string; role: string }> {
  const client = createManifestClient({ origin, session })
  const me = unwrap(await client.GET('/v1/me'), 'getMe')
  return { name: me.displayName, role: me.role }
}
```

<!-- /example -->

**A browser refused at `/auth/…` is shown a page, not JSON.** A sign-in, step-up or sign-out that cannot complete answers a request that accepts `text/html` — every navigation — with a short page naming the refusal’s code and linking to sign in again; any other request is answered the error envelope. A client need not render these itself.

Some operations take a session and nothing else — among them `getMe`, `createProject`, minting, listing and revoking tokens, answering an agent’s question, a release’s approval and its preview, the sign-in rehearsal, recording UBC’s decisions, describing an app before it exists (`startIntakeSession`), and switching an app off, bringing it back or deleting it. Their `security` in the OpenAPI document names the session alone, and a token is refused them `403 TOKEN_CREDENTIAL_REFUSED`.

## Step-up — signing in again, for the most privileged actions

A few actions need the person to prove it is them again, within the last ten minutes: approving a release, deploying to production, running the pre-production rehearsal, managing members, changing a quota, setting a production secret’s value, switching an app off and deleting one — and confirming an agent’s request for any of them. Without it they are refused `403 STEP_UP_REQUIRED`. Send the person’s browser to `GET /auth/step-up?returnTo=<the page they are on>`; they complete CWL’s prompt and come back, and the same request succeeds for ten minutes. A token can never step up.

## A delegated token — an agent, a script or CI

A person mints a token in their own session, for **one project**, with a list of capabilities, a name, and an expiry of at most 365 days (`mintToken`). The answer carries the token’s `secret` — `mft_<id>_<secret>` — which is the credential: hand it to the agent, and keep it nowhere else. **It is in that answer and nowhere else** — Manifest keeps only a hash of it — so a mint retried with its `Idempotency-Key` is `409 TOKEN_ALREADY_MINTED`, naming the token and never its secret: if the first answer was lost, revoke that token (`revokeToken`) and mint again with a new key. Send it as `Authorization: Bearer mft_…`, with no cookie and no `Origin`.

A token acts as the person who minted it, on that project alone, with only the capabilities it holds. It can do the whole build loop: read everything about its project, commit code, set sandbox and staging secrets, build, release, deploy to sandbox and staging, and watch the event stream. It cannot create a project, and it sees no other.

**Four capabilities are never a token’s** — deploying to production (`release:promote`), reading a secret (`secret:read`), changing a quota (`quota:set`) and managing members (`members:manage`). A token that asks for one of those is answered `403 TOKEN_ACTION_PENDING` with a `pendingAction`: a question that a person who could do it themselves — an owner of the project, or for a quota a platform administrator — confirms or rejects in the console. Once it is confirmed, the identical request — the same method, path and body, from the same token — is let through exactly once, whatever its `Idempotency-Key`. *For an AI agent* has the loop.

Every token has its own rate limit, fixed when it is minted: past it, a request is `429 RATE_LIMITED` with `Retry-After`. `listTokens` shows a project’s tokens — never their secrets — each with `mintedBy`, the person who minted it, and `revokeToken` ends one at once. **Only a token’s minter may revoke it**: compare `mintedBy` with `getMe`’s `id` to know which of a project’s tokens a person may revoke; anyone else is answered `404 NOT_FOUND`. Revoking a token ends the questions it is waiting on a person to answer: they read `expired`, and the project’s stream says so with `pending_action.expired`. An expired or revoked token is `401 UNAUTHENTICATED`, and an event stream it holds open closes `4401` the moment it is revoked or expires. **A token does not outlive its minter’s place on the project**: removing a person from a project revokes every token they minted on it and ends their agent sessions there, so an agent working for somebody who has been removed is refused from its next request, and its waiting questions read `expired`.

## A Node client on the laptop

On a laptop, the platform’s addresses are served over TLS signed by Manifest’s own local certificate authority. Browsers and `curl` trust it through the keychain; **Node does not read the keychain**, so a Node client fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` until it is told:

```sh
export NODE_EXTRA_CA_CERTS=<the Manifest checkout>/infra/ca/manifest-root.crt
```
