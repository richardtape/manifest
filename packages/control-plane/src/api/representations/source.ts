import { z } from 'zod/v4'
import { representation, Timestamp } from '../contract/schemas.js'

/**
 * A PROJECT'S SOURCE, READ (the authoring API plan's Task 5): a tree, a file, a page of history
 * and one commit — each naming the COMMIT it was read at, which is what a client sends back as
 * `baseCommit` when it writes (Decision 3). Every field is described, for the reference.
 */
export const CommitSha = z
  .string()
  .regex(/^[0-9a-f]{40}$/)
  .describe('A full 40-character commit id.')

/**
 * A branch name, or a full commit id (Decision 9). The same rule `source/reading.ts`'s
 * `REF_NAME` applies again in each driver: a name beginning `-` in git's argv is an option.
 */
export const Ref = z
  .string()
  .regex(/^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,255}$/)
  .describe('A branch name, or a full 40-character commit id. Defaults to `main`.')

const Mode = z.string().regex(/^[0-7]{6}$/)

const Entry = z.object({
  path: z.string().describe('The path from the repository root, `/`-separated.'),
  type: z
    .enum(['file', 'directory', 'symlink', 'submodule'])
    .describe('What git records at this path. The API reads and writes `file`s only.'),
  mode: Mode.describe(
    "git's mode: `100644` a file, `100755` an executable file, `120000` a symlink, `040000` a directory, `160000` a submodule.",
  ),
  size: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe('Bytes, for a file or a symlink; null otherwise.'),
  binary: z
    .boolean()
    .nullable()
    .describe(
      'Whether git calls this file binary — such a file is not readable or writable through the API in v1. Null for anything that is not a file.',
    ),
})

export const SourceTree = representation(
  'SourceTree',
  z.object({
    ref: Ref,
    commitSha: CommitSha.describe(
      'The commit the ref resolved to — what this listing is OF. Send it as `baseCommit` when committing changes computed from it.',
    ),
    entries: z.array(Entry).describe('Every entry of the tree, sorted by path.'),
    truncated: z
      .boolean()
      .describe(
        'True when the tree has more than 10,000 entries and only the first 10,000, by path, are listed.',
      ),
  }),
)

export const SourceFile = representation(
  'SourceFile',
  z.object({
    ref: Ref,
    commitSha: CommitSha.describe('The commit the file was read at.'),
    path: z.string().describe('The file’s path from the repository root.'),
    content: z.string().describe('The file’s text, exactly — UTF-8, at most 1 MiB.'),
    size: z.number().int().nonnegative().describe('The file’s size in bytes.'),
    mode: Mode.describe(
      '`100644`, or `100755` for an executable file — kept when the file is changed.',
    ),
    blobSha: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .describe("git's id for this content; equal ids mean equal bytes."),
  }),
)

const summaryShape = {
  commitSha: CommitSha,
  parents: z
    .array(CommitSha)
    .describe('Its parents, first parent first; empty for the first commit.'),
  subject: z.string().describe('The first line of the commit message.'),
  message: z.string().describe('The whole commit message, cut at 4096 characters.'),
  messageTruncated: z.boolean().describe('True when `message` was cut.'),
  authorName: z
    .string()
    .describe(
      "The author git recorded. For a commit made through the API this is the person's name; for any other push it is whatever the pusher's git said, and is not verified.",
    ),
  authoredAt: Timestamp.describe('When git says the commit was authored, in UTC.'),
}

export const CommitSummary = representation('CommitSummary', z.object(summaryShape))

export const CommitList = representation(
  'CommitList',
  z.object({
    ref: Ref,
    commits: z.array(CommitSummary).describe('Newest first.'),
    next: CommitSha.nullable().describe(
      'Pass as `cursor` for the next page; null on the last page.',
    ),
  }),
)

const FileChange = z.object({
  path: z.string().describe('The file’s path.'),
  status: z
    .enum(['added', 'modified', 'deleted', 'type_changed'])
    .describe("What happened to it, against the commit's first parent."),
  binary: z
    .boolean()
    .describe(
      'Whether git calls the file binary; a binary file has no patch and no line counts.',
    ),
  additions: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe('Lines added; null for a binary file.'),
  deletions: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe('Lines removed; null for a binary file.'),
  patch: z
    .string()
    .nullable()
    .describe(
      'A unified diff with three lines of context; null for a binary file, or once 256 KiB of patch has been given.',
    ),
})

export const CommitDetail = representation(
  'CommitDetail',
  z.object({
    ...summaryShape,
    changes: z.array(FileChange).describe('Every file the commit changed, by path.'),
    patchesTruncated: z
      .boolean()
      .describe('True when some `patch` is null because the 256 KiB budget was spent.'),
  }),
)
