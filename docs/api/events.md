# Events

The project’s event stream: every build, log line, instance change, incident and audit event, live, over one WebSocket — how to open it, what it sends, and how to reconnect. For a developer showing progress and for an agent waiting for its build to end without polling.

## Opening it

`GET /v1/projects/{projectId}/events` is a WebSocket upgrade (`wss://` on the console’s origin). A session-bearing upgrade carries `Origin`, as any session mutation does; a delegated token of the project sends `Authorization: Bearer …` and no `Origin`. A plain `GET` of the same URL is `426 EVENTS_UPGRADE_REQUIRED`. The generated client’s `subscribe` does all of this.

<!-- example: example-build -->

```ts
import {
  createManifestClient,
  idempotencyKey,
  subscribe,
  unwrap,
  type EventFrame,
} from '@manifest/contract'

/**
 * Start a build of the commit you wrote — naming it, so the build uses THAT commit's
 * manifest.yaml — and watch it end on the project's event stream rather than polling. The
 * answer is `202` with the build `running`: the answer that arrived is not the outcome.
 */
export async function buildAndWatch(
  origin: string,
  token: string,
  projectId: string,
  commitSha: string,
): Promise<{ buildId: string; status: string; logLines: number }> {
  const client = createManifestClient({ origin, token })
  let logLines = 0
  let ended: (frame: EventFrame) => void = () => undefined
  const end = new Promise<EventFrame>((resolve) => (ended = resolve))
  let buildId: string | undefined
  // Subscribe FIRST, so nothing the build says is missed; the stream replays what came before.
  const stream = subscribe({
    origin,
    token,
    projectId,
    onFrame(frame) {
      if (frame.kind === 'log') logLines += 1
      if (
        frame.kind === 'event' &&
        frame.subject === `build:${buildId}` &&
        (frame.type === 'build.succeeded' || frame.type === 'build.failed')
      )
        ended(frame)
    },
  })
  await stream.ready
  try {
    const build = unwrap(
      await client.POST('/v1/projects/{projectId}/builds', {
        params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
        body: { commitSha },
      }),
      'startBuild',
    )
    buildId = build.id
    await end
    // The stream says it ended; the build itself says how. Read it before releasing it.
    const done = unwrap(
      await client.GET('/v1/builds/{buildId}', {
        params: { path: { buildId: build.id } },
      }),
      'getBuild',
    )
    return { buildId: done.id, status: done.status, logLines }
  } finally {
    stream.close()
  }
}
```

<!-- /example -->

## What it sends

Every message is one JSON frame, of three kinds:

- **`event`** — something happened: its `type`, the `subject` it is about (`build:<id>`, `instance:<id>`, `project:<id>`), a `humanMessage` for a person, and a `machineDetail` to act on. Every event is also a line in the project’s audit trail, which nothing can change or remove.
- **`log`** — one line of a build’s log, in order.
- **`control`** — about the stream itself.

On opening, the stream **replays the newest 50 events**, then sends one `control` frame of type `manifest.stream.ready`, then everything live. Subscribe before you start the thing you are watching, and nothing is missed.

## Closing, and reconnecting

The stream closes with a code that says what to do:

| Code | What happened | What to do |
|---|---|---|
| `1001` | The platform’s edge reloaded. | Reconnect: the replay carries what you missed. |
| `1006` | The upgrade was refused — unauthenticated, not found, or a session from another origin — or the connection dropped. A WebSocket client is shown no status. | `GET` the same URL with the same credential to see the refusal; otherwise reconnect. |
| `1011` | The stream could not be opened. | Reconnect. |
| `1013` | The client fell behind — more than 1 MiB queued. | Reconnect, to be replayed. |
| `4403` | The upgrade carried a session from another origin. | Send the console’s origin. |
| `4404` | Not found — or not yours. | Check the project id and the credential. |

## Every event type

Each type, and the one sentence that says what it means; *Event types* has an example of each one’s `machineDetail`.

<!-- event-types -->

| Type | What happened |
|---|---|
| `sso.registered` | The app’s SAML Service Provider registration with the identity provider was written for one environment (§9). |
| `sso.acs_changed` | Where the app receives CWL sign-in assertions moved (§9). Worth a person’s attention: it is where a sign-in is sent. |
| `build.started` | A build began (§14). Its log lines follow on the stream as LogFrames, and `build.succeeded` or `build.failed` ends it. |
| `build.succeeded` | A build finished and passed every gate (§12); create a release from it next. |
| `build.failed` | A build failed. `reason` says why, and `getBuildLog` has the whole output to correct it from. |
| `instance.provisioning` | A deploy made an instance and is binding its services — the first step of a deploy (§11). |
| `instance.starting` | The instance’s services are bound and the runtime is starting it, beside the one already serving (§11). |
| `instance.healthy` | The instance passed its health check and now serves the environment; a deploy has succeeded (§11). |
| `instance.failed` | The instance never became healthy — whatever was already serving keeps serving — and an Incident records why (§11, §14). |
| `incident.opened` | An Incident was recorded for a failed instance (§14): its logs, redacted, and a prompt an agent can work from. |
| `ai.key_rotated` | The app’s AI key was replaced by a deploy that became healthy (§10). The key itself is never in an event. |
| `instance.retiring` | An instance a deploy replaced is finishing the requests it already had, before it stops (§11). |
| `instance.retired` | A replaced instance finished: its container is gone and its AI key is revoked (§11). |
| `instance.retire_failed` | A replaced instance could not be retired, and will be tried again — never silently (§11). |
| `project.created` | A project and its three environments were created (§22). `repository.seeded` and `spec.validated` follow. |
| `repository.seeded` | The project’s repository was created and its first commit made, from the blueprint’s skeleton and starter (§25). |
| `spec.validated` | manifest.yaml at a commit was validated — by a commit through the API, a push, or `validateSpec` — valid or not (§7). |
| `token.minted` | A person minted a delegated token for this project (D24). Never carries the token or its hash. |
| `pending_action.created` | A delegated token asked for one of D24’s privileged actions, and a person must confirm or reject it in the console. |
| `pending_action.confirmed` | A person confirmed a token’s pending action, which grants that one request exactly one retry (D24). |
| `pending_action.rejected` | A person rejected a token’s pending action; a retry of it is refused `TOKEN_ACTION_REJECTED` (D24). |
| `iam_registration.recorded` | An administrator recorded what UBC IAM registered for the app’s production sign-in (§9). |
| `privacy_assessment.recorded` | An administrator recorded what UBC’s Privacy Office said of the app’s privacy impact assessment (§9). |
| `rehearsal.completed` | A production-shaped rehearsal of the app’s CWL sign-in ran for the release serving staging, and passed or did not (D21). |
| `release.approved` | An administrator approved a release for production, bound to the image digest it froze (§13). |
| `release.approval_rejected` | An administrator rejected a release for production, which is final for that release (§13); the sentence carries their reason. |
| `project.launched` | The app’s first production launch became healthy (§13 D9). Published once per project, ever. |
| `repository.pushed` | A branch moved on GitHub and Manifest’s copy took it (D5). Commit ids only — never an author or a message. |
| `repository.history_rewritten` | A branch’s history was rewritten on GitHub; Manifest kept the history its releases name, and reads GitHub’s for what comes next (§13). |
| `repository.visibility_enforced` | The repository was found public on GitHub, and was made private again or could not be (§20). |
| `repository.secret_detected` | A commit pushed to GitHub adds a value shaped like a secret (§20). Never the value; the commit is never deployed with it. |
| `repository.scan_incomplete` | Commits pushed to GitHub were too large for Manifest to scan for secrets (§20). Nothing in them was read; a build of any commit still scans the whole tree it builds. |
| `repository.protection_unavailable` | GitHub would not protect the new repository’s `main`, so a person can rewrite or delete it there; `getProject`’s repository says so too. |
| `repository.committed` | A commit was made through Manifest’s API (`createCommit`) — the platform’s own record of who made it, which `listCommits` reads as `madeThrough`. |
| `repository.secret_refused` | A commit Manifest was asked to make carried a value shaped like a secret, and was refused (§20). Never the value. |
| `app_secret.set` | A value was set for one of the app’s secrets in one environment; the next deploy there renders it. Never the value. |
| `app_secret.cleared` | A secret’s value was removed from one environment; deploying a release that declares it there is refused until it is set again. |
| `project.renamed` | The project’s name — what people call it — changed. Its slug, and so every hostname it has, did not. |
| `member.added` | A person was added to the project, or their role on it changed (§13). Not published when nothing changed. |
| `member.removed` | A person was taken off the project (§13). Not published for somebody who was not a member. |
| `agent_session.started` | An agent was given a model key for this project, charged to the person who started it (§10). The key itself is never published. |
| `agent_session.ended` | An agent session’s key was revoked at the gateway (§10). |
| `sso.deregistered` | The app’s SAML Service Provider registration with the Manifest identity provider was removed for one environment — its project was switched off (§9, §11). |
| `project.archived` | The project was switched off by its owner (§11): each of its names answers a page saying so, its instances are retired and its services stopped. Its code, data, secrets and records are kept, and it can be restored. |
| `project.restored` | A switched-off project was restored (§11). Nothing started: its names answer the switched-off page until its next deploy brings the app back on its kept data. Its delegated tokens stay revoked. |

<!-- /event-types -->
