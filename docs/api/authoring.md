# Authoring

How to read and change an app’s code through the API — the tree, a file, the history and one commit; a commit and its dry run; what is refused and why; and who a commit is attributed to. For a developer building an editor and for an agent writing an app.

## Reading

- **`getTree`** lists every entry at a ref — `main` unless you name another branch or a full commit id — and answers the commit it read (`commitSha`). Each entry says whether it is a `file`, a `directory`, a `symlink` or a `submodule`, and a file whether it is `binary`.
- **`getFile`** answers one text file’s content. `path` and `ref` are QUERY parameters (`?path=server.js&ref=<commit>`). Read it at the commit the tree was read at (`ref`), so the two agree. A binary file, or one that is not UTF-8, is `409 SOURCE_FILE_NOT_TEXT`; one over 1 MiB is `409 SOURCE_FILE_TOO_LARGE`; a path that is not a file is `409 SOURCE_PATH_NOT_A_FILE`.
- **`listCommits`** is `main`’s history, newest first, paged; **`getCommit`** is one commit and what it changed — each file with its line counts and a unified diff.

<!-- example: example-read -->

```ts
import { createManifestClient, unwrap } from '@manifest/contract'

/**
 * Read the tree at `main`, then one file AT THE COMMIT THE TREE WAS READ AT — so the file and
 * the listing agree even if somebody pushes in between, and that commit is the `baseCommit` of
 * the change you make next.
 */
export async function readAFile(
  origin: string,
  token: string,
  projectId: string,
  path: string,
): Promise<{ commitSha: string; paths: string[]; text: string }> {
  const client = createManifestClient({ origin, token })
  const tree = unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId } },
    }),
    'getTree',
  )
  // Never guess a path: list the tree. A binary file is listed and cannot be read as text.
  const entry = tree.entries.find((e) => e.path === path && e.type === 'file')
  if (entry === undefined || entry.binary === true) {
    throw new Error(`${path} is not a text file at ${tree.commitSha}`)
  }
  const file = unwrap(
    await client.GET('/v1/projects/{projectId}/file', {
      params: { path: { projectId }, query: { path, ref: tree.commitSha } },
    }),
    'getFile',
  )
  return {
    commitSha: tree.commitSha,
    paths: tree.entries.filter((e) => e.type === 'file').map((e) => e.path),
    text: file.content,
  }
}
```

<!-- /example -->

## Committing

**`createCommit`** writes and deletes text files on `main` as one commit. Its body names:

- **`baseCommit`** — the commit you read, and computed your change from. Required.
- **`message`** — the commit message; its first line is what the history shows.
- **`changes`** — each `{ "op": "write", "path", "content" }` or `{ "op": "delete", "path" }`.

Every change is checked before anything is written, in this order: the request’s shape, the paths, secrets in the files and in the message, the base, the tree, and the manifest.yaml the commit would leave. Only when all pass is anything written. The answer is the new commit, what changed, and its manifest’s validation.

<!-- example: example-commit -->

```ts
import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

/**
 * Commit a change: read the tree, then commit against exactly the commit it was read at. A
 * retry after a timeout reuses the same Idempotency-Key, and is answered the first commit.
 */
export async function commitAChange(
  origin: string,
  token: string,
  projectId: string,
): Promise<string> {
  const client = createManifestClient({ origin, token })
  // 1. Read what you are changing — and keep the commit it was read at.
  const tree = unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId } },
    }),
    'getTree',
  )
  // 2. Commit against exactly that commit. One key for this action, reused on a retry.
  const key = idempotencyKey()
  const outcome = unwrap(
    await client.POST('/v1/projects/{projectId}/commits', {
      params: { path: { projectId }, header: { 'Idempotency-Key': key } },
      body: {
        baseCommit: tree.commitSha,
        message: 'Count the replies to each post',
        changes: [
          {
            op: 'write',
            path: 'src/replies.js',
            content: 'export const countReplies = (post) => post.replies.length\n',
          },
        ],
      },
    }),
    'createCommit',
  )
  if (outcome.commitSha === null)
    throw new Error('a commit that is not a dry run has an id')
  return outcome.commitSha
}
```

<!-- /example -->

## The dry run

The same body with **`dryRun: true`** runs every check and writes nothing. It answers what the commit would change, its `commitSha` `null`, and whether the manifest it would leave changes a field an administrator reviews before production — `spec.sensitiveDiff`, which changes nothing about committing, building, or deploying to sandbox and staging: a production release that changes one of those fields waits for an administrator (*Launching*). The `warnings` in its `spec` — on a real commit's answer too, and in `validateSpec`'s — are what the validation says without refusing: `SPEC_FIELD_NOT_ENFORCED` for a field Manifest records but does not enforce yet, such as `ai.budget.per_user_monthly_usd`. A warning never stops a commit; tell the person, and carry on. Check before you commit; a check is a new `Idempotency-Key` every time. *Conventions* has the envelope a refusal comes in.

## When `main` has moved

If `main` is no longer at `baseCommit` — a person pushed, or another agent committed — the commit is refused `409 SOURCE_CONFLICT` and nothing is written, whether the base was stale when you sent it or the race was lost at the last moment. **Read the tree again, redo your change on what is there now, and commit against the new commit.** The platform never merges for you: a change applied to code nobody has seen is a change nobody reviewed.

<!-- example: example-conflict -->

```ts
import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type Schemas,
} from '@manifest/contract'

type Change = Schemas['CreateCommitRequest']['changes'][number]

/**
 * Commit against the commit you read, and when `main` has moved since — somebody pushed, or
 * another agent committed — read it again and redo the change on what is there now. The
 * platform never merges for you: a change nobody has seen against the new code is a change
 * nobody reviewed. `changesOn` is your own step that reads the files it changes at a commit.
 */
export async function commitOnWhatIsThere(
  origin: string,
  token: string,
  projectId: string,
  readAt: string,
  changesOn: (commitSha: string) => Promise<Change[]>,
): Promise<{ commitSha: string; attempts: number }> {
  const client = createManifestClient({ origin, token })
  let base = readAt
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const outcome = unwrap(
        await client.POST('/v1/projects/{projectId}/commits', {
          params: {
            path: { projectId },
            header: { 'Idempotency-Key': idempotencyKey() },
          },
          body: {
            baseCommit: base,
            message: 'Show the newest posts first',
            changes: await changesOn(base),
          },
        }),
        'createCommit',
      )
      if (outcome.commitSha === null)
        throw new Error('a commit that is not a dry run has an id')
      return { commitSha: outcome.commitSha, attempts: attempt }
    } catch (error) {
      if (!(error instanceof ManifestApiError) || error.code !== 'SOURCE_CONFLICT')
        throw error
      // `main` moved. Read it again; the next attempt redoes the change on the new commit.
      const tree = unwrap(
        await client.GET('/v1/projects/{projectId}/tree', {
          params: { path: { projectId } },
        }),
        'getTree',
      )
      base = tree.commitSha
    }
  }
  throw new Error(
    'main kept moving; stop and tell the person rather than retrying for ever',
  )
}
```

<!-- /example -->

## What is refused, and why

- **Paths.** Relative and `/`-separated; at most 1024 bytes, 255 per part and 32 parts deep; no empty, `.` or `..` part, no backslash, no control character; and nothing inside `.git`, in any case. Each is `400 REQUEST_INVALID`, naming the change and the rule.
- **Text only.** A write’s `content` is well-formed Unicode with no NUL, written as its UTF-8 bytes exactly — at most 1 MiB of it per file, 500 changes per commit, 8 MiB per request. A new file is created as an ordinary file; an existing one keeps its mode.
- **The tree.** A write where a directory is, or under a file, a symbolic link or a submodule; a write to a symbolic link; deleting a directory; or naming one path twice — each is `409 SOURCE_PATH_CONFLICT`. Deleting a path that is not there is `409 SOURCE_PATH_NOT_FOUND`. A commit that changes nothing is `409 SOURCE_NOTHING_TO_COMMIT`.
- **Secrets.** Content or a message carrying something shaped like a credential is `409 SOURCE_SECRET_DETECTED`, naming the file, the line and the rule — never the value. Declare the secret in manifest.yaml and set its value with `setAppSecret` (*Secrets*).
- **The manifest.** A commit that would leave manifest.yaml invalid — deleting it included — is `422 SPEC_INVALID`, with every problem in `details`. manifest.yaml must name the project’s own blueprint.
- **A `Dockerfile` or `.npmrc`** is accepted and committed, and **replaced by the blueprint’s at build**: the blueprint owns how an app is built, and an app declares what it needs in manifest.yaml.

## Who made a commit

A commit made through the API has the person as its author — their name and an address in the platform’s own zone that is nobody’s mailbox — or, for a token, the person’s name with the token’s: *Ada Lovelace (via token 'claude-code')*. **But who made a commit is the platform’s own record, never the commit’s text**, which anyone who can push can write. `listCommits` and `getCommit` answer `madeThrough`: the person or the agent, read from the audit trail, for every commit made through Manifest — and `null` for one pushed with git, whose author is only what git was told.

## Building what you wrote

`startBuild` builds a commit **with that commit’s own manifest.yaml**. Name the commit you wrote; with no `commitSha` it builds the newest *recorded* validation’s commit, which is not necessarily `main`’s head. A commit nobody has validated is validated first, and an invalid one is refused `422 SPEC_INVALID`.
