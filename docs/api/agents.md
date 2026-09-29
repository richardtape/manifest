# For an AI agent

This page is for an AI agent driving Manifest on a person’s behalf with a delegated token: the loop that turns a request into a running app, the rules that keep it correct, and the few things it must leave to a person. Read it before your first request. How to write an app for a blueprint — its conventions, its sign-in, its database — is the blueprint’s *knowledge pack* (`getKnowledgePack`); this page is how to drive the platform.

## What you hold

A delegated token, `mft_<id>_<secret>`, sent as `Authorization: Bearer …` on every request and with no cookie. It was minted by a person for **one project**, holds a list of capabilities, and expires. It acts as that person. You cannot create a project with it — a person does that and gives you its id. **If you were given the project's name instead, `listProjects` finds it**: a token sees exactly one project, so the list it answers is that one.

Your first calls:

1. `getDoc` with the slug `agents` — this page. `listDocs` lists the others; `getOpenApiDocument` is the whole API.
2. `getProject` for the project you were given (or `listProjects`, to find its id), and `getBlueprint` for its `blueprint`.
3. `getKnowledgePack` for that blueprint — how an app on it is written. The pack is prose; the blueprint's CODE — its skeleton, which the pack describes file by file — is already in your project, because a project starts as that skeleton: `getTree` lists it. **Read the pack before you replace a file of the skeleton**: an app that replaces `server.js` must keep what the pack says it keeps — `express.urlencoded` among it, without which CWL's sign-in answer is never read and nobody can sign in.

`getMe` is not one of them: it answers who a SESSION belongs to, and a token asking is refused `403 TOKEN_CREDENTIAL_REFUSED`. A token acts as the person who minted it.

### Your model key, and the models you may call

If you need a model, ask for a key with `startAgentSession` — your token must hold `agent:session` — with a name for the task, and optionally a cap (`capUsd`) and a life (`durationMinutes`). **The key is in that answer and nowhere else**, beside the `baseUrl` it is used at: send it as `Authorization: Bearer …` to that OpenAI-compatible API, keep it in memory, and never write it to a file, a commit or a log. It is charged to the person your token acts for, within their month and the session's cap; it never outlives your token; and it calls models and nothing else. A retry with the same `Idempotency-Key` is `409 AGENT_SESSION_ALREADY_STARTED`, naming the session and never the key — end that one and start another. `getAgentBudget` is the person's month and `listAgentSessions` what each session has spent — `null` with a reason, never `0`, when the gateway cannot say. **End the session when the work is done** (`endAgentSession`); it is ended for you if your token is revoked or the project is switched off. *Building a front-end* has the whole of it in code.

**The session's `models` lists every model the key may call. Read the names from there and never assume one**: the list follows the project's data classification, and a `confidential` project's key reaches the on-premise models — and the capable model too, while the platform lets the agent that BUILDS an app use it (it does by default).

- **`default-chat-large` is the capable model**, for work a small model cannot do well, such as writing an app. Use it when it is listed. It is listed wherever the platform offers one: on an `internal` or `public` project, and on a `confidential` one while the platform allows it. **It is for writing the app, never for the app's own AI**: a `confidential` app's `ai.models` in `manifest.yaml` must name on-premise models, and validation refuses anything else. Its own answers need the network, and every call costs the person real money.
- **When its provider cannot answer — the network off included — the platform's on-premise model answers `default-chat-large` in its place**, wherever the platform sets one (it does by default), charged to the same key at the on-premise model's price. Such an answer carries the response header `x-litellm-attempted-fallbacks: 1`, and its `model` names the on-premise model rather than the capable one: check the header before you rely on the answer's quality, because it is a smaller model's work. If no fallback is set, or it cannot answer either, the call fails like any other: choose another model from `models`.
- When it is not listed, use the others in `models`. `default-chat` is small, and it answers offline.

**When the project stops allowing a model your session holds, the session is ended.** A commit that raises the project's classification — `data.classification` in `manifest.yaml`, `internal` to `confidential` — ends every session holding a model the project no longer allows before the commit answers; so does a production deploy of a release classified higher than the project's manifest — a launch, or the administrator's pre-launch rehearsal, which deploys into production too. When the platform stops letting a `confidential` project's agent use the capable model, its sessions holding it are ended when the platform restarts with that setting. Each is ended with the reason `models_withdrawn`, and its key is refused for EVERY model, the on-premise ones included. Start a new session: its `models` are the new list.

## The loop

**Read → change → check → commit → build → deploy → read the result.**

1. **Read.** `getTree` lists the project’s files at `main` and answers the commit it read (`commitSha`). Keep it: every change you make is computed from it. Read a file with `getFile` at that commit (`ref`).
2. **Change and check.** Send the change as `createCommit` with `dryRun: true`. Nothing is written; you are told what the commit would change, whether manifest.yaml is valid, and whether it changes a field an administrator reviews at production (`spec.sensitiveDiff` — it changes nothing about committing, building, or deploying to sandbox and staging).
3. **Commit.** Send the same body without `dryRun`. The answer is the new commit.
4. **Build.** `startBuild` naming the commit you wrote. It answers `202` and the build `running`; watch the project’s event stream for `build.succeeded` or `build.failed`, then read the build.
5. **Deploy.** `createRelease` from a build that succeeded, then `deploy` it to staging (or sandbox). A deploy that never becomes ready is a `200` whose instance is `failed`; `listIncidents` says why.
6. **Read the result**, and go round again.

*Authoring* has the loop’s first three steps in full, with code.

## The rules

- **Switch on `code`, never on the message.** Every refusal is one envelope, `{ "error": { "code", "message", "hint", … } }`. `hint` says what to do; *Error codes* has every code’s remedy.
- **Never guess a path.** List the tree. A file you did not read is a file you do not know the contents of.
- **Always send `baseCommit`** — the commit you read. If `main` has moved since, the commit is refused `409 SOURCE_CONFLICT` and nothing is written: read the tree again, redo your change on what is there now, and commit again. The platform never merges for you.
- **One `Idempotency-Key` per action, reused on a retry.** If a request timed out, send it again with the same key and the same body: you are answered the first result, and nothing happens twice. The same key with a different body, or on another resource's path, is `409 IDEMPOTENCY_KEY_REUSED`.
- **manifest.yaml is checked before anything is written.** An invalid one is `422 SPEC_INVALID`, with every problem in `details` — its path, its code and a hint. Fix those paths; do not guess at others.
- **Name the commit you build.** `startBuild` with no `commitSha` builds the newest *recorded* validation’s commit, which is not necessarily `main`’s head.
- **A `Dockerfile` or `.npmrc` you commit is replaced by the blueprint’s at build.** The blueprint owns how an app is built; you declare what it needs in manifest.yaml.
- **Never put a secret in a file or a commit message.** A commit carrying something shaped like a credential is refused `409 SOURCE_SECRET_DETECTED`, nothing is written, and the refusal is recorded where the project’s people see it (`repository.secret_refused`). Declare it in manifest.yaml and ask the person to set its value — or set it yourself for sandbox and staging (`setAppSecret`) if your token holds `secret:write`.

## What waits for a person

**A privileged action waits for a person, and you must never try to get around it.** Deploying to production, reading a secret, changing a quota and managing members are never done by a token alone. Ask, and you are answered `403 TOKEN_ACTION_PENDING` with a `pendingAction` in the envelope: the question the person who minted your token answers in their own session.

- Tell the person what you asked for and why, and wait: `getPendingAction` says when they have answered.
- `confirmed` grants **one** retry of the identical request — the same body and the same `Idempotency-Key`.
- `rejected` is final; `pendingAction.reason` is their reason. Do not ask again for the same thing.
- `expired` means nobody answered in time.

Some things are a person’s alone, and a token that asks is refused outright with `403 TOKEN_CREDENTIAL_REFUSED` — no question is created, and none would change the answer: approving a release for production, recording UBC’s IAM registration or privacy assessment, minting a token, creating a project, switching an app off, bringing it back or deleting it, and setting a production secret’s value, which also asks the person to sign in again first (`STEP_UP_REQUIRED`). Reading who is signed in (`getMe`) and a project’s tokens (`listTokens`) are a session’s too. An operation’s description says when a token is refused.

<!-- example: example-pending -->

```ts
import {
  createManifestClient,
  ManifestApiError,
  unwrap,
  type Schemas,
} from '@manifest/contract'

/**
 * A privileged request from a token — production, reading a secret, a quota, members — is
 * answered `403 TOKEN_ACTION_PENDING`, and the envelope carries the question a person must
 * answer. This is the question, or undefined for any other refusal.
 */
export function pendingActionOf(error: unknown): Schemas['PendingAction'] | undefined {
  if (!(error instanceof ManifestApiError) || error.code !== 'TOKEN_ACTION_PENDING')
    return undefined
  return error.envelope?.error.pendingAction
}

/**
 * Wait for the person, then say what to do. `confirmed` grants ONE retry of the identical
 * request — the same body and the same Idempotency-Key; `rejected` is final and
 * `pendingAction.reason` says why; `expired` means nobody answered in time. Never retry a
 * pending request on a loop: it asks the person again.
 */
export async function waitForAPerson(
  origin: string,
  token: string,
  pendingActionId: string,
  options: { everyMs: number; forMs: number },
): Promise<Schemas['PendingAction']> {
  const client = createManifestClient({ origin, token })
  const until = Date.now() + options.forMs
  for (;;) {
    const action = unwrap(
      await client.GET('/v1/pending-actions/{pendingActionId}', {
        params: { path: { pendingActionId } },
      }),
      'getPendingAction',
    )
    if (action.state !== 'pending' || Date.now() >= until) return action
    await new Promise((resolve) => setTimeout(resolve, options.everyMs))
  }
}
```

<!-- /example -->

## When something goes wrong

- `401 UNAUTHENTICATED` — your token expired or was revoked — or the person switched the app off, which revokes every token of it. Ask the person for a new one; if they switched the app off, it has to be brought back first.
- `403 FORBIDDEN` — your token does not hold the capability. Ask for one that does; do not look for another route.
- `404 NOT_FOUND` — the id is wrong, or the resource is another project’s. A token sees one project.
- `429 RATE_LIMITED` — wait the seconds `Retry-After` gives, then retry. Your token’s limit was fixed when it was minted.
- A `409` from the source family — `SOURCE_CONFLICT`, `SOURCE_PATH_CONFLICT`, `SOURCE_PATH_NOT_FOUND`, `SOURCE_NOTHING_TO_COMMIT` — is about the code as it is now: read it again.
- `409 AGENT_BUDGET_EXHAUSTED` — the person’s month is spent. No key is issued; tell them when it resets (`getAgentBudget`).
- `403 INSTANCE_OUTPUT_STAGING` or `INSTANCE_OUTPUT_PRODUCTION` — only a sandbox instance’s output is readable. `409 INSTANCE_OUTPUT_UNAVAILABLE` — the instance no longer runs; its Incident has its last lines.
- `403 INCIDENT_LOG_CONFIDENTIAL` — the project is `confidential`, and while you may use the capable model a token is not answered its staging or production Incidents: their log tails can carry real people's input. Read the sandbox's Incidents, or ask the person to read that environment's in their own session and tell you what failed.
- Your model key suddenly refused by the gateway, for every model — its session was ended: read `listAgentSessions`. `models_withdrawn` means the project no longer allows a model it held — its classification was raised, or the platform now keeps a `confidential` project's agent on-premise; start a new session.

## Reading what your app printed

To debug an app, deploy it to the **sandbox** and read what it printed: `listInstances` for the sandbox environment says which instance is `serving`, and `getInstanceOutput` answers its last lines, oldest first, redacted — your token must hold `output:read`. Only a sandbox instance’s output is readable — staging and production serve real people, and each is refused by its own code — so deploy the release you are debugging to the sandbox. You are answered at most the `lines` you asked for (200 by default, at most 1000); a line longer than 4 KiB ends `…[cut: N bytes]`. Nothing is kept: read again to see newer lines, and read a failed instance’s Incident (`listIncidents`) once it no longer runs — on a `confidential` project, the sandbox's only (`403 INCIDENT_LOG_CONFIDENTIAL` for staging's and production's, while you may use the capable model). Never print a secret to find out whether it arrived: the redaction is a safety net, not a guarantee.

<!-- example: example-output -->

```ts
import {
  createManifestClient,
  ManifestApiError,
  unwrap,
  type Schemas,
} from '@manifest/contract'

export type AppOutput =
  | { read: true; instanceId: string; lines: Schemas['InstanceOutput']['lines'] }
  | { read: false; instanceId: string | null; code: string | null; next: string }

/**
 * What a running app printed: the last lines of the instance an environment's hostname reaches,
 * oldest first and redacted. Only a SANDBOX instance's output is readable — staging and
 * production serve real people, and each is refused by its own code — so to see what a staging
 * release prints, deploy the same release to the sandbox and read it there. Nothing is kept:
 * each read asks the running instance again.
 */
export async function whatTheAppPrinted(
  origin: string,
  token: string,
  environmentId: string,
  lines: number,
): Promise<AppOutput> {
  const client = createManifestClient({ origin, token })
  const list = unwrap(
    await client.GET('/v1/environments/{environmentId}/instances', {
      params: { path: { environmentId } },
    }),
    'listInstances',
  )
  // The one the hostname reaches now. A failed one stays listed after it is replaced.
  const serving = list.instances.find((i) => i.serving)
  if (serving === undefined)
    return {
      read: false,
      instanceId: null,
      code: null,
      next: 'Nothing is running here: deploy a release first.',
    }
  try {
    const output = unwrap(
      await client.GET('/v1/instances/{instanceId}/output', {
        // At most `lines` — a long line the runtime split counts as several.
        params: { path: { instanceId: serving.id }, query: { lines } },
      }),
      'getInstanceOutput',
    )
    return { read: true, instanceId: serving.id, lines: output.lines }
  } catch (error) {
    if (!(error instanceof ManifestApiError)) throw error
    switch (error.code) {
      case 'INSTANCE_OUTPUT_STAGING':
      case 'INSTANCE_OUTPUT_PRODUCTION':
        return {
          read: false,
          instanceId: serving.id,
          code: error.code,
          next: 'Deploy the same release to the sandbox and read it there, or read a failed instance’s Incident (listIncidents).',
        }
      case 'INSTANCE_OUTPUT_UNAVAILABLE':
        // It stopped between the two reads: its last lines are in its Incident.
        return {
          read: false,
          instanceId: serving.id,
          code: error.code,
          next: 'It no longer runs: read its Incident (listIncidents).',
        }
      default:
        throw error
    }
  }
}
```

<!-- /example -->
