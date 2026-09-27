# For an AI agent

This page is for an AI agent driving Manifest on a person’s behalf with a delegated token: the loop that turns a request into a running app, the rules that keep it correct, and the few things it must leave to a person. Read it before your first request. How to write an app for a blueprint — its conventions, its sign-in, its database — is the blueprint’s *knowledge pack* (`getKnowledgePack`); this page is how to drive the platform.

## What you hold

A delegated token, `mft_<id>_<secret>`, sent as `Authorization: Bearer …` on every request and with no cookie. It was minted by a person for **one project**, holds a list of capabilities, and expires. It acts as that person. You cannot create a project with it — a person does that and gives you its id.

Your first calls:

1. `getDoc` with the slug `agents` — this page. `listDocs` lists the others; `getOpenApiDocument` is the whole API.
2. `getProject` for the project you were given, and `getBlueprint` for its `blueprint`.
3. `getKnowledgePack` for that blueprint — how an app on it is written.

## The loop

**Read → change → check → commit → build → deploy → read the result.**

1. **Read.** `getTree` lists the project’s files at `main` and answers the commit it read (`commitSha`). Keep it: every change you make is computed from it. Read a file with `getFile` at that commit (`ref`).
2. **Change and check.** Send the change as `createCommit` with `dryRun: true`. Nothing is written; you are told what the commit would change, whether manifest.yaml is valid, and whether it changes a field an administrator reviews at production.
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

Some things are a person’s alone, and a token that asks is refused outright with `403 TOKEN_CREDENTIAL_REFUSED` — no question is created, and none would change the answer: approving a release for production, recording UBC’s IAM registration or privacy assessment, minting a token, creating a project, and setting a production secret’s value, which also asks the person to sign in again first (`STEP_UP_REQUIRED`). An operation’s description says when a token is refused.

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

- `401 UNAUTHENTICATED` — your token expired or was revoked. Ask the person for a new one.
- `403 FORBIDDEN` — your token does not hold the capability. Ask for one that does; do not look for another route.
- `404 NOT_FOUND` — the id is wrong, or the resource is another project’s. A token sees one project.
- `429 RATE_LIMITED` — wait the seconds `Retry-After` gives, then retry. Your token’s limit was fixed when it was minted.
- A `409` from the source family — `SOURCE_CONFLICT`, `SOURCE_PATH_CONFLICT`, `SOURCE_PATH_NOT_FOUND`, `SOURCE_NOTHING_TO_COMMIT` — is about the code as it is now: read it again.

Reading a running app’s own output is not available yet; *The journey* says what is planned.
