# @manifest/contract

Manifest's public API (spec §22), as two generated files and a thin client over them:

- **`openapi.json`** — the OpenAPI 3.1 document, generated from the control plane's route
  definitions (`packages/control-plane/src/api/routes/index.ts`). Nothing else describes a
  route.
- **`src/schema.d.ts`** — TypeScript types generated from that document by
  `openapi-typescript` 7.13.0.
- **`src/client.ts`** — `createManifestClient`, which is `openapi-fetch` 0.17.0 over those
  types, plus `unwrap` and `ManifestApiError` for the D23.7 error envelope.

**A client of Manifest imports this package and nothing else.** The journey
(`packages/journey`) does, and so will the reference console and, in Phase 3, the MCP
server (§22, §16 *API completeness*). The journey's boundary is held by a test and a lint
rule, each watched failing.

## Regenerating

Both generated files are checked in, and each is held by a drift test that names the
command to run:

```bash
pnpm contract:write      # openapi.json from the route definitions
pnpm contract:generate   # src/schema.d.ts from openapi.json
```

Run them in that order after changing a route, and commit all three changes together.
`pnpm contract:write` runs under the control plane's `unit` Vitest project, so it
**truncates the control plane's tables**, exactly as `pnpm test` does.

## Versions

`/v1` in the path is the major version (D23.8); a breaking change is a new prefix beside
it. `info.version` in `openapi.json` and this package's `version` move together — a test on
each side holds them equal. Until P5c's console has proved the contract they stay `0.x`:
additive changes bump the minor, and response objects may gain fields, so **a client ignores
fields it does not know**.

## Calling it

```ts
import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

const client = createManifestClient({ origin: 'https://console.manifest.internal', session })
const me = unwrap(await client.GET('/v1/me'), 'getMe')
```

**A client that is not a browser sends two headers**, and `createManifestClient` adds both:

- **the session** — `cookie: manifest_session=<value>`, the value a CWL sign-in set. A
  browser sends its own cookie.
- **`Origin`** — the console's own. Node's `fetch` sends none unless told to, and a request
  that carries a session and changes something without the console's `Origin` is refused as
  `403 CSRF_ORIGIN_REFUSED` (§20). A browser sets it itself.

**`Idempotency-Key` is supplied per call, not by the client.** Every mutation requires it
(D23.6), and the generated types make each call site pass one. Make one per user action
with `idempotencyKey()` and **reuse it when retrying that action** — a key made fresh on
every attempt would turn a retry into a second action.

A refusal throws `ManifestApiError` from `unwrap`, carrying `status`, `code` (switch on
it), the `envelope` and the `operation`. `code` is `UNPARSEABLE` when the body was not an
envelope at all: Caddy's empty `502` when the control plane is down, or the edge's refusal
of a source it does not allow.

## The event stream

`WS /v1/projects/{projectId}/events` is how a client learns that anything changed — builds
and their log lines, instance state, incidents, and every other audit event for the project
(D23.2). OpenAPI cannot describe a WebSocket, so the document describes the handshake at
that path and puts the conversation in `x-manifest-websocket`: every message is a
**`StreamFrame`**, as JSON.

```ts
import { subscribe, type StreamFrame } from '@manifest/contract'

const frames: StreamFrame[] = []
const stream = subscribe({ origin, session, projectId, onFrame: (f) => frames.push(f) })
await stream.ready // the replay has arrived
```

- **Switch on `kind`, then `type`.** `event` is an audit Event, whose `machineDetail` has
  one shape per `type` — the generated types narrow on it, and the platform refuses to
  record a detail that is not its type's. `log` is one line of a build's output. `control`
  is the ready frame.
- **Replay, then ready, then live.** A new connection is sent the project's newest 50
  events, oldest first, then the ready frame (`manifest.stream.ready`); everything after it
  is live. Log lines are never replayed — `GET /v1/builds/{buildId}/logs` has them.
  `ready` resolves as the ready frame is handed to `onFrame`.
- **The same two headers.** Outside a browser, `subscribe` sends the session and the
  console's `Origin` on the upgrade; an upgrade that carries a session and no `Origin` is
  refused.
- **A refused upgrade rejects `ready`**, closing `1006`: a WebSocket client is shown no
  HTTP status. A plain `GET` of the same URL with the same session answers the refusal
  (`UNAUTHENTICATED`, `NOT_FOUND`) in the envelope, or `426` if nothing is wrong.
- **Close codes.** `1001` — the edge reloaded and its grace period ran out; `1013` — the
  client fell behind; `1011` — the stream could not be opened. **Reconnect after any of
  them**: the replay carries the newest 50 events, so a short gap loses nothing that was
  recorded — a client away for longer than 50 events reads the resources themselves. `4403` and
  `4404` are refusals after the upgrade, and reconnecting will not help.

Node does not read the macOS keychain, so a Node process calling
`https://console.manifest.internal` needs `NODE_EXTRA_CA_CERTS` pointing at the platform CA
(`infra/ca/manifest-root.crt`); without it `fetch` fails as `fetch failed`, and the stream
never becomes ready.

This README states no status. The plan that built the package, and what it has run, are in
`docs/superpowers/`.
