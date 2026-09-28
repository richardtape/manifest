# Getting started

The shortest correct path from nothing to an app running in staging, for a developer writing a client and for an agent a person has handed a token. Each step points to the page that explains it; the operations are named so you can find each in the reference.

## 1. A person signs in and creates the project

A person signs in with CWL in a browser — the console at `https://console.manifest.internal` on a laptop — and creates the project: its slug, which its addresses are made from (`checkSlug` says whether one is free), a name people read if it should be other than the slug, the blueprint it is built from (`listBlueprints`), and who it is for. `createProject` answers the project, its three environments — sandbox, staging and production — and a repository seeded with the blueprint’s skeleton and a valid manifest.yaml. Creating a project needs a person’s session; a token cannot.

## 2. The person gives their agent a token

In the same session, the person mints a delegated token for that one project (`mintToken`), holding the capabilities the work needs, and hands its secret to the agent. *Authentication* has the whole story.

<!-- example: example-token -->

```ts
import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

/**
 * A person mints a delegated token for their agent — in their own session, for ONE project,
 * holding the build loop's capabilities and nothing more — and the agent uses it.
 */
export async function mintATokenForAnAgent(
  origin: string,
  session: string,
  projectId: string,
): Promise<{ tokenId: string; secret: string; projectSlug: string }> {
  const person = createManifestClient({ origin, session })
  const minted = unwrap(
    await person.POST('/v1/projects/{projectId}/tokens', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        name: 'claude-code',
        capabilities: [
          'project:read',
          'source:write',
          'secret:write',
          'build:create',
          'release:create',
          'release:deploy',
        ],
        expiresInDays: 7,
      },
    }),
    'mintToken',
  )
  // `secret` is the credential. Hand it to the agent now and keep it nowhere else; revoke the
  // token (`revokeToken`) the moment it is no longer needed.
  const agent = createManifestClient({ origin, token: minted.secret })
  const project = unwrap(
    await agent.GET('/v1/projects/{projectId}', { params: { path: { projectId } } }),
    'getProject',
  )
  return { tokenId: minted.token.id, secret: minted.secret, projectSlug: project.slug }
}
```

<!-- /example -->

## 3. Read the code, and change it

Read the tree and the files you are changing, at one commit. Check a change with a dry run, then commit it against the commit you read. *Authoring* is the whole of this step.

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

## 4. Set the secrets it declares

If manifest.yaml declares a secret, set its value for the environment before deploying there — a deploy of a release whose declared secret has no value is refused. *Secrets*.

## 5. Build, release and deploy to staging

Build the commit you wrote, watch it end on the project’s event stream, release the build and deploy the release. *Events* explains the stream.

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

<!-- example: example-deploy -->

```ts
import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

/**
 * Release a build that succeeded, and deploy the release to staging. A deploy that never
 * becomes ready is still a `200` — its instance's `state` is `failed` and an Incident says
 * why — so read the state, never the status code alone.
 */
export async function releaseToStaging(
  origin: string,
  token: string,
  projectId: string,
  buildId: string,
): Promise<{ releaseId: string; url: string; state: string }> {
  const client = createManifestClient({ origin, token })
  const release = unwrap(
    await client.POST('/v1/projects/{projectId}/releases', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: { buildId },
    }),
    'createRelease',
  )
  const environments = unwrap(
    await client.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId } },
    }),
    'listEnvironments',
  )
  const staging = environments.find((e) => e.kind === 'staging')
  if (staging === undefined) throw new Error('every project has a staging environment')
  const instance = unwrap(
    await client.POST('/v1/environments/{environmentId}/deploy', {
      params: {
        path: { environmentId: staging.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { releaseId: release.id },
    }),
    'deploy',
  )
  return { releaseId: release.id, url: staging.url, state: instance.state }
}
```

<!-- /example -->

## 6. Production

A first production launch has a checklist, a rehearsal of the CWL sign-in, and an administrator’s approval; deploying to production is a privileged action a person confirms. *Launching*.

## Where to go next

- *Conventions* — idempotency keys, the error envelope, paging and limits, which every client needs.
- *For an AI agent* — the loop and its rules, for an agent.
- *The journey* — every step there is, and which operations serve it.
