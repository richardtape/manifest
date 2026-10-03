# Conventions

The rules every operation follows — versioning, idempotency keys, an administrator's reason, the error envelope, asynchronous work and the stream, paging, and limits — so that a client written against one operation is right about the rest. For a developer writing a client and for an agent deciding what to do with an answer.

## Versions

Every resource route is under `/v1`. Within `/v1` the API only grows: an answer may gain fields, and **a client ignores fields it does not know**. A change that would break a client is a new prefix beside `/v1`, never a change inside it. The OpenAPI document (`GET /v1/openapi.json`) says which version of `/v1` it describes in `info.version`; the generated TypeScript client, `@manifest/contract`, is built from it.

## Idempotency keys

**Every mutation carries an `Idempotency-Key` header** — a new random value of at least eight characters, a UUID, for each action a person or an agent takes. Without one it is `400 IDEMPOTENCY_KEY_REQUIRED`.

- **Reuse the key when you retry the same action.** A request that timed out may have succeeded; send it again with the same key and exactly the same body, and you are answered the first result — the commit made once, the project created once. **The exception is an answer that carries a credential, which is answered to the first request alone**: minting a token (a retry is `409 TOKEN_ALREADY_MINTED`, naming the token — [Authentication](authentication.md)), and starting an agent or intake session (`409 AGENT_SESSION_ALREADY_STARTED`, `409 INTAKE_SESSION_ALREADY_STARTED`, naming the session). If that first answer was lost, end or revoke what the refusal names, and start again with a new key.
- **A refused request is not remembered.** Nothing is recorded for a request that failed, so once you have dealt with the refusal you may send it again with the same key — and a failure the platform asks you to repeat, such as `500 PROJECT_TEARDOWN_INCOMPLETE`, is repeated with the same key and body.
- **A new action is a new key.** The same key with a different body — or on another resource, such as another environment's secret — is `409 IDEMPOTENCY_KEY_REUSED`.
- **A dry run is a new key every time**: it writes nothing, so a replay protects nothing, and would answer a check made before the code moved.
- A retry that spans the platform rotating its session secret is `409 IDEMPOTENCY_KEY_REUSED`: send it again with a new key.

## An administrator acting on somebody else's project

**A platform administrator who is not a member of a project, changing it with an owner's capability, says why** — in a `Manifest-Admin-Reason` header on the request. Without one it is `400 ADMIN_REASON_REQUIRED`, and its `hint` says what to send. The operations that can ask list the header and the code in the OpenAPI document; they are every change an owner can make: renaming, committing, setting or clearing a secret, adding or removing a person, building, validating, releasing, deploying, the launch records' drafts and sends, asking for sign-off, the rehearsal, archiving, restoring or deleting, starting or ending an agent session, minting a token, and answering an agent's question.

- **The reason is 1 to 500 characters once trimmed.** A header carries only Latin-1 text, and a browser's `fetch` and Node's refuse to send anything else, so **percent-encode it as UTF-8 (`encodeURIComponent`) when it is not plain ASCII**; the platform decodes it.
- **Nobody else is asked**: the project's owner and collaborators, an administrator who is a member, an administrator doing their own duty — approving or rejecting a release, recording what UBC answered, or answering an agent's question about a quota — and anyone reading. A header sent when none is asked is ignored.
- **It is part of the request.** A retry with the same `Idempotency-Key` sends the same reason; another reason under the same key is `409 IDEMPOTENCY_KEY_REUSED`.
- **A token is asked once, at its mint.** An administrator minting a token on somebody else's project gives the reason then; the token's later actions are not asked, and the stream names them as that person's agent.
- **The project's people see it.** The reason is stored with the audit event beside the administrator's name, redacted like every event, and every event the change causes carries it in `actor` ([Events](events.md)).

## Errors

Every refusal is one shape:

```json
{ "error": { "code": "SOURCE_CONFLICT", "message": "…", "hint": "…", "requestId": "0b7c1a52-3f0e-4d21-9a6e-2c3d4e5f6a7b" } }
```

- **Switch on `code`**, which is stable; never parse `message`, which is for a person.
- **`requestId`** is on every refusal, and the same id is the `x-request-id` header on every answer — a success too. **Show a refusal’s id to the person and keep it in your own log**: quoted in a report, it finds the platform’s own record of that refusal. A success’s id is yours to log beside your own; the platform records refusals, not successes. An id you send in a request header is ignored. A generated-client call's `ManifestApiError` carries it as `requestId` — from the envelope, else the header, else `null` (an answer that never reached the platform has none).
- **`hint`** says what to do, where there is something to say. *Error codes* gives every code’s meaning and remedy, and so does the OpenAPI document’s `x-manifest-errors`.
- **`details`** comes with `422 SPEC_INVALID`: one entry per problem in manifest.yaml, each with its `path`, its own `code`, a `message` and a `hint`.
- **`pendingAction`** comes with `403 TOKEN_ACTION_PENDING` and `TOKEN_ACTION_REJECTED`: the question a person answers.
- **`launchReadiness`** comes with `409 RELEASE_PRODUCTION_GATE_UNAVAILABLE`, a first production launch refused: everything the launch still needs.
- **`limit`** comes with a refusal about a limit — `409 AGENT_BUDGET_EXHAUSTED`, `INTAKE_BUDGET_EXHAUSTED` and `INTAKE_DAILY_LIMIT_REACHED`: whose it is (`scope`, the person's or the platform's), over what `period`, how much (`amountUsd` for a budget, `count` for the day), and when it lifts (`resetsAt`, `null` when the AI gateway does not say). Tell the person when, from `resetsAt`; never parse the sentence.
- **`session`** comes with `409 AGENT_SESSION_ALREADY_STARTED` and `INTAKE_SESSION_ALREADY_STARTED`: the session that request already started — its `id`, to end it, and its `name` (`null` for an intake session).

The same code always comes with the same status. Several different refusals are a `403` — `FORBIDDEN`, `TOKEN_CREDENTIAL_REFUSED`, `TOKEN_ACTION_PENDING`, `TOKEN_ACTION_REJECTED`, `STEP_UP_REQUIRED` — and each needs something different of you, which is why the status alone is never enough.

A generated-client call throws a `ManifestApiError` carrying the status, the envelope and its `code`:

<!-- example: example-check -->

```ts
import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type Schemas,
} from '@manifest/contract'

export type ManifestCheck =
  | { valid: true; sensitiveFields: string[] }
  | { valid: false; problems: Schemas['ManifestError'][] }

/**
 * Check a new manifest.yaml WITHOUT WRITING ANYTHING: the commit, as a dry run. It runs every
 * check the commit would, in the same order, and answers what the commit would do — or
 * `422 SPEC_INVALID` with each problem in `details`: its path, its code, and a hint.
 */
export async function checkManifest(
  origin: string,
  token: string,
  projectId: string,
  manifest: string,
): Promise<ManifestCheck> {
  const client = createManifestClient({ origin, token })
  const tree = unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId } },
    }),
    'getTree',
  )
  try {
    const outcome = unwrap(
      await client.POST('/v1/projects/{projectId}/commits', {
        // A dry run writes nothing, so a fresh key each time: a replay would answer a check
        // made before main moved.
        params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
        body: {
          baseCommit: tree.commitSha,
          message: 'Check manifest.yaml',
          changes: [{ op: 'write', path: 'manifest.yaml', content: manifest }],
          dryRun: true,
        },
      }),
      'createCommit',
    )
    // Valid — and whether it changes a field an administrator reviews before production.
    return { valid: true, sensitiveFields: outcome.spec.sensitiveDiff.fields }
  } catch (error) {
    // Switch on the CODE, never the message: `details` is there to act on.
    if (error instanceof ManifestApiError && error.code === 'SPEC_INVALID') {
      return { valid: false, problems: error.envelope?.error.details ?? [] }
    }
    throw error
  }
}
```

<!-- /example -->

## Asynchronous work, and the stream

An operation that starts something long answers **`202`** with the thing in its first state — `startBuild` answers the build `running`. The answer that arrived is not the outcome. Watch the project’s event stream (*Events*) for the end, then read the resource. A deploy is the exception: it answers when the instance is ready or has failed, as a `200` whose instance `state` says which.

## Dates and waits

An instant is an ISO 8601 date-time in UTC (`2026-10-01T19:00:00.000Z`). A field named for a day a person gave — `sentAt` — is a `YYYY-MM-DD` day in Vancouver, and the platform stamps it at **noon in Vancouver** on that day. So a record sent today can carry a `submittedAt` hours ahead of now: **count a wait in Vancouver days**, from the day of `since` to the day of now, never as now minus `since`. A field that says **`since`** is when a wait began — a record sent to UBC, a sign-off request — or, on a met item, when it was met; `null` when there is nothing to date.

## Paging

A list that can be long takes `cursor` and answers `next`: pass `next` as `cursor` for the following page, until `next` is `null`. The history of a project’s commits (`listCommits`) pages this way. **A list that is bounded instead** answers at most its bound and says `truncated: true` when there was more: an environment’s instances (`listInstances`, the one seen most recently first) and a project’s agent sessions (`listAgentSessions`, newest first), at most 50 each; one commit’s changed files (`getCommit`), at most 1000.

## Limits

- **A request body is at most 1 MiB**, except a commit’s (`createCommit`), which is at most 8 MiB; larger is `413 REQUEST_BODY_TOO_LARGE`.
- **A request with no body carries no `Content-Type`** — a `GET`; every `DELETE`, none of which takes a body (`clearAppSecret`, `revokeToken`, `removeMember`, `endAgentSession`, `endIntakeSession`, `deleteProject`); and the three `POST`s that take none (`startIntakeSession`, `runRehearsal`, `createApprovalPreview`). Sent with `Content-Type: application/json` and no body, it is `400 REQUEST_INVALID`. The generated client already omits it; a `curl` must too.
- A body is JSON, sent as `Content-Type: application/json`; anything else is `415 REQUEST_MEDIA_TYPE_UNSUPPORTED`.
- A delegated token has its own rate limit (*Authentication*).
- A path that matches no route is `404 ROUTE_NOT_FOUND`.
