import { z } from 'zod/v4'
import { makeRedactor, publishEvent } from '../../observability/index.js'
import {
  actorPhrase,
  assertCapability,
  AuthorizationError,
  authorFor,
  getProject,
  madeThroughFor,
  repositoryOf,
  type Actor,
  type MadeThrough,
} from '../../projects/index.js'
import {
  secretFindings,
  secretRefusal,
  writesOf,
  type Change,
  type CommitResult,
  type RepoRef,
} from '../../source/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import type { ErrorCode } from '../error-codes.js'
import { SpecInvalidError } from '../errors.js'
import type { ServerDeps } from '../server.js'
import {
  sensitiveAgainstNewestValid,
  validateAndRecord,
  validateManifestText,
} from '../spec-validation.js'
import {
  CommitDetail,
  CommitList,
  CommitOutcome,
  CommitSha,
  CreateCommitRequest,
  Ref,
  SourceFile,
  SourceTree,
} from '../representations/source.js'

const ProjectParams = z.strictObject({
  projectId: z.uuid().describe('The project whose repository is read.'),
})

/** Every read's refusals: the project, its repository, and the ref (Decision 9). */
const READ_ERRORS: readonly ErrorCode[] = [
  'NOT_FOUND',
  'FORBIDDEN',
  'SOURCE_COMMIT_NOT_FOUND',
  'SOURCE_GIT_FAILED',
  'SOURCE_PROVIDER_MISMATCH',
  'SOURCE_UNREACHABLE',
]

/**
 * `project:read` first (a stranger learns nothing), then the project, then ITS repository —
 * through `repositoryOf`, so another driver's project is refused rather than guessed at (the
 * D5 plan's Decision 3).
 */
async function repositoryFor(
  deps: ServerDeps,
  actor: Parameters<typeof assertCapability>[1],
  projectId: string,
): Promise<RepoRef> {
  await assertCapability(deps.db, actor, projectId, 'project:read')
  const project = await getProject(deps.db, projectId)
  if (project === undefined) {
    throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)
  }
  return repositoryOf(deps, project)
}

const refQuery = Ref.default('main')

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>

/**
 * The `manifest.yaml` a commit would leave: the write's content, `''` if it deletes the file
 * (which validates as invalid — deleting the manifest is refused `SPEC_INVALID`), else the
 * base's, read exactly as `validateAndRecord` reads a commit's.
 */
async function manifestAfter(
  deps: ServerDeps,
  repo: RepoRef,
  base: string,
  changes: readonly Change[],
): Promise<string> {
  const change = changes.find((c) => c.path === 'manifest.yaml')
  if (change !== undefined) return change.op === 'write' ? change.content : ''
  return (await deps.source.readFile(repo, base, 'manifest.yaml')) ?? ''
}

/** A commit message's subject: its first line, cut at 72 characters. */
const subjectOf = (message: string): string => {
  const line = message.split('\n', 1)[0]!.trim()
  return line.length <= 72 ? line : `${line.slice(0, 71)}…`
}

/**
 * `repository.committed` (Decision 10): the platform's record of who made the commit — what
 * `madeThrough` is read from. Counts and ids in the detail; the subject, cut, in the sentence.
 */
async function publishCommitted(
  deps: ServerDeps,
  project: Project,
  actor: Actor,
  done: CommitResult,
  message: string,
): Promise<void> {
  const count = (status: string) => done.changes.filter((c) => c.status === status).length
  const n = done.changes.length
  await publishEvent(
    deps.db,
    deps.bus,
    {
      projectId: project.id,
      subject: `repository:${project.slug}`,
      type: 'repository.committed',
      machineDetail: {
        commitSha: done.commitSha!,
        parent: done.parent,
        added: count('added'),
        modified: count('modified'),
        deleted: count('deleted'),
        via: actor.credential,
        userId: actor.userId,
        tokenId: actor.credential === 'token' ? actor.tokenId : null,
      },
      humanMessage: `${await actorPhrase(deps.db, actor)} committed ${n} change${n === 1 ? '' : 's'} to main: ${subjectOf(message)}`,
    },
    makeRedactor([]),
  )
}

/**
 * `repository.secret_refused` (Decision 10): an owner learns an agent tried to commit a
 * credential. Where and which rule — NEVER THE VALUE — and never for a dry run.
 */
async function publishSecretRefused(
  deps: ServerDeps,
  project: Project,
  actor: Actor,
  findings: readonly { path: string; line: number; rule: string }[],
): Promise<void> {
  const where = findings.map((f) => `${f.path}:${f.line} (${f.rule})`).join(', ')
  await publishEvent(
    deps.db,
    deps.bus,
    {
      projectId: project.id,
      subject: `repository:${project.slug}`,
      type: 'repository.secret_refused',
      machineDetail: {
        findings: findings.map((f) => ({ path: f.path, line: f.line, rule: f.rule })),
      },
      humanMessage: `${await actorPhrase(deps.db, actor)} tried to commit a secret-shaped value to main, at ${where}; nothing was committed.`,
    },
    makeRedactor([]),
  )
}

/** What a commit changed, by path — as `getCommit` lists a commit's changes — not request order. */
const byPath = (changes: CommitResult['changes']) =>
  [...changes].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

/** A page's `madeThrough`, from the platform's record — one query for the page. */
async function attributed<C extends { commitSha: string }>(
  deps: ServerDeps,
  projectId: string,
  commits: readonly C[],
): Promise<(C & { madeThrough: MadeThrough | null })[]> {
  const made = await madeThroughFor(
    deps.db,
    projectId,
    commits.map((c) => c.commitSha),
  )
  return commits.map((c) => ({ ...c, madeThrough: made.get(c.commitSha) ?? null }))
}

/**
 * THE EXAMPLES — real answers from a project on the fixture blueprint after two commits to
 * `src/app.js` (captured through these routes, sitting 3), shortened, with every field kept.
 */
const HEAD = 'c2ac2119650fef9d6d37212ede7138ade14f0377'
const PARENT = 'f01a0cb5fe74b5ca6c817e85f2fb62d394f40241'
const SEED = '85418f2fa9748ca708ee1ca3725c5cac4a1018c6'
const HEAD_SUMMARY = {
  commitSha: HEAD,
  parents: [PARENT],
  subject: 'Greet the world',
  message: 'Greet the world',
  messageTruncated: false,
  authorName: "Ada Lovelace (via token 'claude-code')",
  authoredAt: '2026-09-26T06:23:51.000Z',
  madeThrough: { kind: 'agent', name: 'Ada Lovelace', tokenName: 'claude-code' },
}

/**
 * `createCommit`'s example — the answer captured through the route (sitting 4), with its ids
 * set to the chain the read examples above tell: `PARENT` → `HEAD`, the greeting changed.
 */
const COMMIT_EXAMPLES = {
  request: {
    baseCommit: PARENT,
    message: 'Greet the world',
    changes: [
      {
        op: 'write',
        path: 'src/app.js',
        content: "export const greeting = 'hello, world'\n",
      },
    ],
  },
  response: {
    dryRun: false,
    commitSha: HEAD,
    parent: PARENT,
    changes: [{ path: 'src/app.js', status: 'modified' }],
    spec: {
      appSpecId: 'f0f11f7a-f7e5-4358-bace-3619589b5114',
      sensitiveDiff: { sensitive: false, fields: [] },
    },
  },
}

/**
 * THE READ HALF OF AUTHORING (the authoring API plan's Task 5): a tree, a file, a page of
 * history and one commit, each at the commit a `ref` names NOW — and each answer says which
 * commit that was, so a client knows exactly what it read and can send it back as
 * `baseCommit` (Decision 3).
 */
export const sourceRoutes = [
  defineRoute({
    operationId: 'getTree',
    method: 'GET',
    path: '/v1/projects/{projectId}/tree',
    tag: 'source',
    summary: 'List the files of the project’s repository',
    description:
      'Every entry of the tree at `ref` — files, directories, symlinks and submodules — sorted by path, with the commit the ref resolved to. Past 10,000 entries the first 10,000 are listed and `truncated` is true. A binary file is marked, so a client can say so rather than try to read it.',
    params: ProjectParams,
    query: z.strictObject({ ref: refQuery }),
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The tree, and the commit it is of.',
      schema: SourceTree,
    },
    errors: [...READ_ERRORS, 'SOURCE_REF_NOT_FOUND'],
    examples: {
      response: {
        ref: 'main',
        commitSha: HEAD,
        entries: [
          {
            path: 'manifest.yaml',
            type: 'file',
            mode: '100644',
            size: 102,
            binary: false,
          },
          { path: 'server.js', type: 'file', mode: '100644', size: 2155, binary: false },
          { path: 'src', type: 'directory', mode: '040000', size: null, binary: null },
          { path: 'src/app.js', type: 'file', mode: '100644', size: 39, binary: false },
        ],
        truncated: false,
      },
    },
    handler: async ({ deps, actor, params, query }) => {
      const repo = await repositoryFor(deps, actor, params.projectId)
      const commitSha = await deps.source.resolveRef(repo, query.ref)
      return {
        ref: query.ref,
        commitSha,
        ...(await deps.source.listTree(repo, commitSha)),
      }
    },
  }),
  defineRoute({
    operationId: 'getFile',
    method: 'GET',
    path: '/v1/projects/{projectId}/file',
    tag: 'source',
    summary: 'Read one text file of the project’s repository',
    description:
      'The file at `path`, at `ref`, exactly as its UTF-8 bytes — with the commit it was read at and git’s id for its content. Only regular text files are read: a directory, symlink or submodule, a binary or non-UTF-8 file, and a file larger than 1 MiB are each refused with their own code.',
    params: ProjectParams,
    query: z.strictObject({
      path: z
        .string()
        .min(1)
        .max(1024)
        .describe('The file’s path from the repository root, `/`-separated.'),
      ref: refQuery,
    }),
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The file, and the commit it was read at.',
      schema: SourceFile,
    },
    errors: [
      ...READ_ERRORS,
      'SOURCE_REF_NOT_FOUND',
      'SOURCE_PATH_NOT_FOUND',
      'SOURCE_PATH_NOT_A_FILE',
      'SOURCE_FILE_TOO_LARGE',
      'SOURCE_FILE_NOT_TEXT',
    ],
    examples: {
      response: {
        ref: 'main',
        commitSha: HEAD,
        path: 'src/app.js',
        content: "export const greeting = 'hello, world'\n",
        size: 39,
        mode: '100644',
        blobSha: 'ab8ad63341ecd0ef59bca0c95797269774a62583',
      },
    },
    handler: async ({ deps, actor, params, query }) => {
      const repo = await repositoryFor(deps, actor, params.projectId)
      const commitSha = await deps.source.resolveRef(repo, query.ref)
      const file = await deps.source.readText(repo, commitSha, query.path)
      return { ref: query.ref, commitSha, ...file }
    },
  }),
  defineRoute({
    operationId: 'listCommits',
    method: 'GET',
    path: '/v1/projects/{projectId}/commits',
    tag: 'source',
    summary: 'The history of the project’s repository',
    description:
      'The history of `ref`, newest first, `limit` at a time: its FIRST-PARENT history — the commits the branch itself moved through, each merge once — so paging never skips a commit. `next` is the id to pass as `cursor` for the next page; the page starts AT the cursor, which must be a commit of this repository. The author is what git recorded, and is never an email address.',
    params: ProjectParams,
    query: z.strictObject({
      ref: refQuery,
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(30)
        .describe('How many commits to answer, 1 to 100.'),
      cursor: CommitSha.optional().describe(
        'The `next` of the previous page; the page starts at this commit.',
      ),
    }),
    body: NO_BODY,
    success: {
      status: 200,
      description: 'A page of the history, newest first.',
      schema: CommitList,
    },
    errors: [...READ_ERRORS, 'SOURCE_REF_NOT_FOUND'],
    examples: {
      response: {
        ref: 'main',
        commits: [
          HEAD_SUMMARY,
          {
            commitSha: PARENT,
            parents: [SEED],
            subject: 'Add the greeting module',
            message: 'Add the greeting module',
            messageTruncated: false,
            authorName: 'Ada Lovelace',
            authoredAt: '2026-09-26T06:23:51.000Z',
            madeThrough: { kind: 'person', name: 'Ada Lovelace', tokenName: null },
          },
        ],
        next: SEED,
      },
    },
    handler: async ({ deps, actor, params, query }) => {
      const repo = await repositoryFor(deps, actor, params.projectId)
      // A cursor is resolved exactly as a ref is — a commit of THIS repository, or refused.
      const from = await deps.source.resolveRef(repo, query.cursor ?? query.ref)
      const page = await deps.source.history(repo, from, query.limit)
      return {
        ref: query.ref,
        commits: await attributed(deps, params.projectId, page.commits),
        next: page.next,
      }
    },
  }),
  defineRoute({
    operationId: 'getCommit',
    method: 'GET',
    path: '/v1/projects/{projectId}/commits/{commitSha}',
    tag: 'source',
    summary: 'One commit, and what it changed',
    description:
      'The commit and every file it changed against its first parent, with git’s line counts and a unified diff per text file — until 256 KiB of diff has been given, after which `patchesTruncated` is true and later patches are null.',
    params: z.strictObject({
      projectId: z.uuid().describe('The project whose repository is read.'),
      commitSha: CommitSha.describe('The commit to describe.'),
    }),
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The commit and its changes.',
      schema: CommitDetail,
    },
    errors: READ_ERRORS,
    examples: {
      response: {
        ...HEAD_SUMMARY,
        changes: [
          {
            path: 'src/app.js',
            status: 'modified',
            binary: false,
            additions: 1,
            deletions: 1,
            patch:
              "diff --git a/src/app.js b/src/app.js\nindex c8ecfb6..ab8ad63 100644\n--- a/src/app.js\n+++ b/src/app.js\n@@ -1 +1 @@\n-export const greeting = 'hello'\n+export const greeting = 'hello, world'\n",
          },
        ],
        patchesTruncated: false,
      },
    },
    handler: async ({ deps, actor, params }) => {
      const repo = await repositoryFor(deps, actor, params.projectId)
      const commitSha = await deps.source.resolveRef(repo, params.commitSha)
      const [described] = await attributed(deps, params.projectId, [
        await deps.source.describeCommit(repo, commitSha),
      ])
      return described!
    },
  }),
  defineRoute({
    operationId: 'createCommit',
    method: 'POST',
    path: '/v1/projects/{projectId}/commits',
    tag: 'source',
    summary: 'Commit changes to main',
    description:
      'Writes and deletes text files on the project’s `main`, as one commit computed from `baseCommit`. Every change is checked before anything is written — the paths, the text, secret-shaped values in the files and in the message, the base, the tree, and the manifest.yaml the commit would leave, which must be valid. `dryRun: true` runs every check and writes nothing. A retry with the same Idempotency-Key answers the first commit again. Who made the commit is the platform’s own record (`madeThrough` on the history), never the commit’s text.',
    params: ProjectParams,
    query: NO_QUERY,
    body: CreateCommitRequest,
    // Decision 11: a file at the 1 MiB limit, JSON-escaped, is past Fastify's 1 MiB default.
    bodyLimit: 8 * 1024 * 1024,
    success: {
      status: 201,
      description: 'The commit, or what it would have been.',
      schema: CommitOutcome,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'SPEC_INVALID',
      'SOURCE_CONFLICT',
      'SOURCE_PATH_CONFLICT',
      'SOURCE_PATH_NOT_FOUND',
      'SOURCE_NOTHING_TO_COMMIT',
      'SOURCE_PATH_ESCAPE',
      'SOURCE_SECRET_DETECTED',
      'SOURCE_PROVIDER_MISMATCH',
      'SOURCE_UNREACHABLE',
      'SOURCE_GIT_FAILED',
      'AI_BACKEND_UNAVAILABLE',
      'AI_CATALOGUE_EMPTY',
    ],
    examples: COMMIT_EXAMPLES,
    /**
     * IN DECISION 6'S ORDER — shape (the request schema), `.git` and secrets, the base, the
     * planner, the manifest — and nothing written until every one has passed.
     */
    handler: async ({ deps, actor, params, body }) => {
      await assertCapability(deps.db, actor, params.projectId, 'source:write')
      const project = await getProject(deps.db, params.projectId)
      if (project === undefined) {
        throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      }
      const repo = await repositoryOf(deps, project)
      const dryRun = body.dryRun === true
      const changes: Change[] = body.changes
      // 1. Secrets — found HERE, as data, so the refusal is published without the value. The
      // MESSAGE too: it goes into git history and its subject into `repository.committed`'s
      // sentence, where the redactor's heuristics miss an AWS key id — and no driver scans it.
      const findings = secretFindings([
        ...writesOf(changes),
        { path: '(the commit message)', content: body.message },
      ])
      if (findings.length > 0) {
        if (!dryRun) await publishSecretRefused(deps, project, actor, findings)
        throw secretRefusal(findings)
      }
      // 2. The base, the planner and the tree — the driver's own dry run.
      const request = {
        base: body.baseCommit,
        changes,
        message: body.message,
        author: await authorFor(deps.db, actor),
      }
      const planned = await deps.source.commit(repo, { ...request, dryRun: true })
      // 3. The manifest the commit would leave, validated as a recorded validation is.
      const verdict = await validateManifestText(
        deps,
        project,
        await manifestAfter(deps, repo, body.baseCommit, changes),
      )
      if (!verdict.valid) throw new SpecInvalidError(verdict.errors)
      if (dryRun) {
        return {
          dryRun: true,
          commitSha: null,
          parent: planned.parent,
          changes: byPath(planned.changes),
          spec: {
            appSpecId: null,
            sensitiveDiff: await sensitiveAgainstNewestValid(
              deps.db,
              project.id,
              verdict.spec,
            ),
          },
        }
      }
      // 4. The commit — the driver checks the base again, and git refuses a race at the push.
      const done = await deps.source.commit(repo, request)
      const recorded = await validateAndRecord(deps, project, done.commitSha!)
      await publishCommitted(deps, project, actor, done, body.message)
      return {
        dryRun: false,
        commitSha: done.commitSha,
        parent: done.parent,
        changes: byPath(done.changes),
        spec: { appSpecId: recorded.appSpecId, sensitiveDiff: recorded.sensitiveDiff },
      }
    },
  }),
]
