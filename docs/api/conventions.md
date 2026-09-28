# Conventions

The rules every operation follows — versioning, idempotency keys, the error envelope, asynchronous work and the stream, paging, and limits — so that a client written against one operation is right about the rest. For a developer writing a client and for an agent deciding what to do with an answer.

## Versions

Every resource route is under `/v1`. Within `/v1` the API only grows: an answer may gain fields, and **a client ignores fields it does not know**. A change that would break a client is a new prefix beside `/v1`, never a change inside it. The OpenAPI document (`GET /v1/openapi.json`) says which version of `/v1` it describes in `info.version`; the generated TypeScript client, `@manifest/contract`, is built from it.

## Idempotency keys

**Every mutation carries an `Idempotency-Key` header** — a new random value of at least eight characters, a UUID, for each action a person or an agent takes. Without one it is `400 IDEMPOTENCY_KEY_REQUIRED`.

- **Reuse the key when you retry the same action.** A request that timed out may have succeeded; send it again with the same key and exactly the same body, and you are answered the first result — the commit made once, the project created once. **The exception is an answer that carries a credential, which is answered to the first request alone**: minting a token (a retry is `409 TOKEN_ALREADY_MINTED`, naming the token — [Authentication](authentication.md)), and starting an agent or intake session (`409 AGENT_SESSION_ALREADY_STARTED`, `409 INTAKE_SESSION_ALREADY_STARTED`, naming the session). If that first answer was lost, end or revoke what the refusal names, and start again with a new key.
- **A refused request is not remembered.** Nothing is recorded for a request that failed, so once you have dealt with the refusal you may send it again with the same key — and a failure the platform asks you to repeat, such as `500 PROJECT_TEARDOWN_INCOMPLETE`, is repeated with the same key and body.
- **A new action is a new key.** The same key with a different body — or on another resource, such as another environment's secret — is `409 IDEMPOTENCY_KEY_REUSED`.
- **A dry run is a new key every time**: it writes nothing, so a replay protects nothing, and would answer a check made before the code moved.
- A retry that spans the platform rotating its session secret is `409 IDEMPOTENCY_KEY_REUSED`: send it again with a new key.

## Errors

Every refusal is one shape:

```json
{ "error": { "code": "SOURCE_CONFLICT", "message": "…", "hint": "…" } }
```

- **Switch on `code`**, which is stable; never parse `message`, which is for a person.
- **`hint`** says what to do, where there is something to say. *Error codes* gives every code’s meaning and remedy, and so does the OpenAPI document’s `x-manifest-errors`.
- **`details`** comes with `422 SPEC_INVALID`: one entry per problem in manifest.yaml, each with its `path`, its own `code`, a `message` and a `hint`.
- **`pendingAction`** comes with `403 TOKEN_ACTION_PENDING` and `TOKEN_ACTION_REJECTED`: the question a person answers.
- **`launchReadiness`** comes with `409 RELEASE_PRODUCTION_GATE_UNAVAILABLE`, a first production launch refused: everything the launch still needs.

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
    // Valid — and whether it changes a field an administrator reviews at production (§13).
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

## Paging

A list that can be long takes `cursor` and answers `next`: pass `next` as `cursor` for the following page, until `next` is `null`. The history of a project’s commits (`listCommits`) pages this way. **A list that is bounded instead** answers at most its bound and says `truncated: true` when there was more: an environment’s instances (`listInstances`) and a project’s agent sessions (`listAgentSessions`), newest first, at most 50 each; one commit’s changed files (`getCommit`), at most 1000.

## Limits

- **A request body is at most 1 MiB**, except a commit’s (`createCommit`), which is at most 8 MiB; larger is `413 REQUEST_BODY_TOO_LARGE`.
- **A request with no body carries no `Content-Type`** — a `GET`; every `DELETE`, none of which takes a body (`clearAppSecret`, `revokeToken`, `removeMember`, `endAgentSession`, `endIntakeSession`, `deleteProject`); and the three `POST`s that take none (`startIntakeSession`, `runRehearsal`, `createApprovalPreview`). Sent with `Content-Type: application/json` and no body, it is `400 REQUEST_INVALID`. The generated client already omits it; a `curl` must too.
- A body is JSON, sent as `Content-Type: application/json`; anything else is `415 REQUEST_MEDIA_TYPE_UNSUPPORTED`.
- A delegated token has its own rate limit (*Authentication*).
- A path that matches no route is `404 ROUTE_NOT_FOUND`.
