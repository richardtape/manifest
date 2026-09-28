# Authoring

How to read and change an app’s code through the API — the tree, a file, the history and one commit; a commit and its dry run; images, PDFs and fonts as bytes; what is refused and why; and who a commit is attributed to. For a developer building an editor and for an agent writing an app.

## Reading

- **`getTree`** lists every entry at a ref — `main` unless you name another branch or a full commit id — and answers the commit it read (`commitSha`). Each entry says whether it is a `file`, a `directory`, a `symlink` or a `submodule`, and a file whether it is `binary`.
- **`getFile`** answers one file’s content — as text, or as bytes with `encoding=base64`. `path`, `ref` and `encoding` are QUERY parameters (`?path=server.js&ref=<commit>`). Read it at the commit the tree was read at (`ref`), so the two agree. As text, a binary file, or one that is not UTF-8, is `409 SOURCE_FILE_NOT_TEXT` — read it as bytes — and one over 1 MiB is `409 SOURCE_FILE_TOO_LARGE`; as bytes, any file up to 2 MiB is read. A path that is not a file is `409 SOURCE_PATH_NOT_A_FILE`. Every answer says its `encoding`.
- **`listCommits`** is `main`’s history, newest first, paged; **`getCommit`** is one commit and what it changed — each file with its line counts and a unified diff, at most 1000 files, the first by path, with `truncated: true` when it changed more (read the rest with git).

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
  // Never guess a path: list the tree. A binary file is listed too — read it as bytes, with
  // `encoding=base64`, never as text.
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

**`createCommit`** writes and deletes files on `main` as one commit — text, or an image, a PDF or a font as its bytes (*Images, PDFs and fonts*, below). Its body names:

- **`baseCommit`** — the commit you read, and computed your change from. Required.
- **`message`** — the commit message; its first line is what the history shows. Well-formed Unicode with no control character but a line break and a tab.
- **`changes`** — each `{ "op": "write", "path", "content" }` (with `"encoding": "base64"` for bytes) or `{ "op": "delete", "path" }`.

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

## Images, PDFs and fonts

A write carries a file’s bytes with `encoding: 'base64'`: canonical base64 of at most 2 MiB, at a path ending in `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.ico`, `.pdf`, `.woff`, `.woff2`, `.ttf` or `.otf`, whose first bytes are one of those ten kinds. The kind is recognised from the bytes — so a PNG named `.jpg` is accepted, as a PNG — and anything else sent as bytes is refused `400 REQUEST_INVALID`, **text included: send text as text**. Two 2 MiB files fit in one commit’s 8 MiB request. Read any file back as bytes with `getFile` and `encoding=base64`.

<!-- example: example-binary -->

```ts
import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

/**
 * Commit an image, a PDF or a font as its BYTES: `encoding: 'base64'` on the write, the bytes as
 * canonical base64, at most 2 MiB, at a path ending in one of the ten kinds' extensions. Text is
 * never sent as bytes — it is refused; send it as text. In a browser, base64 a `File` with
 * `FileReader.readAsDataURL` and keep what follows the comma.
 */
export async function commitAFile(
  origin: string,
  token: string,
  projectId: string,
  path: string,
  bytes: Uint8Array,
  message: string,
): Promise<string> {
  const client = createManifestClient({ origin, token })
  const tree = unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId } },
    }),
    'getTree',
  )
  const outcome = unwrap(
    await client.POST('/v1/projects/{projectId}/commits', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        baseCommit: tree.commitSha,
        message,
        changes: [
          {
            op: 'write',
            path,
            content: Buffer.from(bytes).toString('base64'),
            encoding: 'base64',
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

/**
 * Read any file as bytes — an image, or text — up to 2 MiB: `getFile` with `encoding=base64`.
 * `getTree` marks a binary file `binary: true`; read those this way.
 */
export async function readBytes(
  origin: string,
  token: string,
  projectId: string,
  path: string,
  ref: string,
): Promise<Uint8Array> {
  const client = createManifestClient({ origin, token })
  const file = unwrap(
    await client.GET('/v1/projects/{projectId}/file', {
      params: { path: { projectId }, query: { path, ref, encoding: 'base64' } },
    }),
    'getFile',
  )
  return new Uint8Array(Buffer.from(file.content, 'base64'))
}
```

<!-- /example -->

## What is refused, and why

- **Paths.** Relative and `/`-separated; at most 1024 bytes, 255 per part and 32 parts deep; no empty, `.` or `..` part, no backslash, no control character; and nothing inside `.git`, in any case. Each is `400 REQUEST_INVALID`, naming the change and the rule.
- **Text, or one of ten kinds of bytes.** A text write’s `content` is well-formed Unicode with no NUL, written as its UTF-8 bytes exactly — at most 1 MiB of it per file; a write in bytes is one of the ten kinds above, at most 2 MiB. At most 500 changes per commit, and 8 MiB per request. A new file is created as an ordinary file; an existing one keeps its mode.
- **The message.** A NUL, a carriage return, an escape or any other control character but a line break and a tab is `400 REQUEST_INVALID`, checked with the request’s shape — before the secret scan.
- **The tree.** A write where a directory is, or under a file, a symbolic link or a submodule; a write to a symbolic link; deleting a directory; naming one path twice; or a file and a directory at one path in the same commit (`docs` and `docs/intro.md`) — each is `409 SOURCE_PATH_CONFLICT`. Deleting a path that is not there is `409 SOURCE_PATH_NOT_FOUND`. A commit that changes nothing is `409 SOURCE_NOTHING_TO_COMMIT`.
- **Secrets.** Content or a message carrying something shaped like a credential is `409 SOURCE_SECRET_DETECTED`, naming the file, the line and the rule — never the value. Declare the secret in manifest.yaml and set its value with `setAppSecret` (*Secrets*). **A file in bytes is scanned by its printable text only**, and its `line` counts those runs of text: text a PDF stores compressed, text in UTF-16 and a PNG’s compressed text chunks are not scanned — so never put a credential in one.
- **The manifest.** A commit that would leave manifest.yaml invalid — deleting it included — is `422 SPEC_INVALID`, with every problem in `details`. manifest.yaml must name the project’s own blueprint.
- **A `Dockerfile` or `.npmrc`** is accepted and committed, and **replaced by the blueprint’s at build**: the blueprint owns how an app is built, and an app declares what it needs in manifest.yaml.

## Who made a commit

A commit made through the API has the person as its author — their name and an address in the platform’s own zone that is nobody’s mailbox — or, for a token, the person’s name with the token’s: *Ada Lovelace (via token 'claude-code')*. **But who made a commit is the platform’s own record, never the commit’s text**, which anyone who can push can write. `listCommits` and `getCommit` answer `madeThrough`: the person or the agent, read from the audit trail, for every commit made through Manifest — and `null` for one pushed with git, whose author is only what git was told.

## Building what you wrote

`startBuild` builds a commit **with that commit’s own manifest.yaml**. Name the commit you wrote; with no `commitSha` it builds the newest *recorded* validation’s commit, which is not necessarily `main`’s head. A commit nobody has validated is validated first, and an invalid one is refused `422 SPEC_INVALID`.
