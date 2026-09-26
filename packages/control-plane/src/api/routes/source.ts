import { z } from 'zod/v4'
import {
  assertCapability,
  AuthorizationError,
  getProject,
  repositoryOf,
} from '../../projects/index.js'
import type { RepoRef } from '../../source/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import type { ErrorCode } from '../error-codes.js'
import type { ServerDeps } from '../server.js'
import {
  CommitDetail,
  CommitList,
  CommitSha,
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
  authorName: 'Ada Lovelace',
  authoredAt: '2026-09-26T06:23:51.000Z',
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
          },
        ],
        next: SEED,
      },
    },
    handler: async ({ deps, actor, params, query }) => {
      const repo = await repositoryFor(deps, actor, params.projectId)
      // A cursor is resolved exactly as a ref is — a commit of THIS repository, or refused.
      const from = await deps.source.resolveRef(repo, query.cursor ?? query.ref)
      return { ref: query.ref, ...(await deps.source.history(repo, from, query.limit)) }
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
      return deps.source.describeCommit(repo, commitSha)
    },
  }),
]
