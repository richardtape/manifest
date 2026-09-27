# Authentication

Every request to Manifest’s API carries exactly one credential — a person’s session or a delegated token — and this page is how to get each, what each may do, and what the platform asks of a client that uses one. It is for a developer writing a client and for an agent working out why it was refused. Both at once is `400 CREDENTIAL_AMBIGUOUS`; neither is `401 UNAUTHENTICATED`.

## A session — a person, in a browser

A person signs in with CWL, UBC’s single sign-on, at `GET /auth/login?returnTo=<a path on the console>`: the browser goes to the identity provider and comes back to that path with a `manifest_session` cookie. The session carries the person’s platform role, can do everything that person may do, and expires on its own. Signing out is `POST /auth/logout`, which answers where the browser goes next.

**A mutation made with a session must carry `Origin`** naming the console’s origin, or it is refused `403 CSRF_ORIGIN_REFUSED`. A browser sends it itself. A program that holds a person’s session — a test, a script run by that person — sends it too; the generated client does, when it is given the cookie’s value:

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

Some operations take a session and nothing else — among them `getMe`, `createProject`, minting, listing and revoking tokens, answering an agent’s question, a release’s approval and its preview, the sign-in rehearsal, and recording UBC’s decisions. Their `security` in the OpenAPI document names the session alone, and a token is refused them `403 TOKEN_CREDENTIAL_REFUSED`.

## Step-up — signing in again, for the most privileged actions

A few actions need the person to prove it is them again, within the last ten minutes: approving a release, deploying to production, managing members, changing a quota, setting a production secret’s value — and confirming an agent’s request for any of them. Without it they are refused `403 STEP_UP_REQUIRED`. Send the person’s browser to `GET /auth/step-up?returnTo=<the page they are on>`; they complete CWL’s prompt and come back, and the same request succeeds for ten minutes. A token can never step up.

## A delegated token — an agent, a script or CI

A person mints a token in their own session, for **one project**, with a list of capabilities, a name, and an expiry of at most 365 days (`mintToken`). The answer carries the token’s `secret` — `mft_<id>_<secret>` — which is the credential: hand it to the agent, and keep it nowhere else. Send it as `Authorization: Bearer mft_…`, with no cookie and no `Origin`.

A token acts as the person who minted it, on that project alone, with only the capabilities it holds. It can do the whole build loop: read everything about its project, commit code, set sandbox and staging secrets, build, release, deploy to sandbox and staging, and watch the event stream. It cannot create a project, and it sees no other.

**Four capabilities are never a token’s** — deploying to production (`release:promote`), reading a secret (`secret:read`), changing a quota (`quota:set`) and managing members (`members:manage`). A token that asks for one of those is answered `403 TOKEN_ACTION_PENDING` with a `pendingAction`: a question the person who minted it confirms or rejects in the console. A confirmation grants one retry of that identical request. *For an AI agent* has the loop.

Every token has its own rate limit, fixed when it is minted: past it, a request is `429 RATE_LIMITED` with `Retry-After`. `listTokens` shows a project’s tokens — never their secrets — and `revokeToken` ends one at once. An expired or revoked token is `401 UNAUTHENTICATED`.

## A Node client on the laptop

On a laptop, the platform’s addresses are served over TLS signed by Manifest’s own local certificate authority. Browsers and `curl` trust it through the keychain; **Node does not read the keychain**, so a Node client fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` until it is told:

```sh
export NODE_EXTRA_CA_CERTS=<the Manifest checkout>/infra/ca/manifest-root.crt
```
