import { z } from 'zod/v4'
import {
  BINARY_FILE_BYTES,
  isText,
  mediaTypeOf,
  pathProblem,
} from '../../source/index.js'
import {
  ManifestErrorSchema,
  representation,
  request,
  Timestamp,
  Uuid,
} from '../contract/schemas.js'
import { SensitiveDiff } from './specs.js'

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
      'Whether git calls this file binary — read it with `getFile`’s `encoding=base64`, and write it with `encoding: base64`. Null for anything that is not a file.',
    ),
})

export const SourceTree = representation(
  'SourceTree',
  z
    .object({
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
    })
    .describe(
      'Every path in the repository at one commit — the files an API client can read and write.',
    ),
)

export const SourceFile = representation(
  'SourceFile',
  z
    .object({
      ref: Ref,
      commitSha: CommitSha.describe('The commit the file was read at.'),
      path: z.string().describe('The file’s path from the repository root.'),
      content: z
        .string()
        .describe(
          'The file’s content, whole: its text exactly (`encoding: utf8`, at most 1 MiB), or its bytes as canonical base64 (`encoding: base64`, at most 2 MiB decoded).',
        ),
      encoding: z
        .enum(['utf8', 'base64'])
        .describe(
          'How `content` carries the file: `utf8` — text, the default read — or `base64`, when the read asked for `encoding=base64`.',
        ),
      size: z.number().int().nonnegative().describe('The file’s size in bytes.'),
      mode: Mode.describe(
        '`100644`, or `100755` for an executable file — kept when the file is changed.',
      ),
      blobSha: z
        .string()
        .regex(/^[0-9a-f]{40}$/)
        .describe("git's id for this content; equal ids mean equal bytes."),
    })
    .describe('One file at one commit, whole — as text, or as base64 bytes.'),
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
  madeThrough: z
    .object({
      kind: z
        .enum(['person', 'agent'])
        .describe(
          'A person in a session, or a person’s agent through a delegated token.',
        ),
      name: z
        .string()
        .describe('The person’s name — for an agent, the person who minted its token.'),
      tokenName: z
        .string()
        .nullable()
        .describe('The token’s name, for an agent; null for a person.'),
    })
    .nullable()
    .describe(
      'Who made this commit through Manifest, from the platform’s own record — a person, or a person’s agent through a delegated token. Null for a commit pushed any other way, whose author is only what the pusher’s git said.',
    ),
}

export const CommitSummary = representation(
  'CommitSummary',
  z
    .object(summaryShape)
    .describe('One commit on the branch — who, when and why, without its changes.'),
)

export const CommitList = representation(
  'CommitList',
  z
    .object({
      ref: Ref,
      commits: z.array(CommitSummary).describe('Newest first.'),
      next: CommitSha.nullable().describe(
        'Pass as `cursor` for the next page; null on the last page.',
      ),
    })
    .describe('A page of the branch’s history, following first parents, newest first.'),
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
  z
    .object({
      ...summaryShape,
      changes: z.array(FileChange).describe('Every file the commit changed, by path.'),
      patchesTruncated: z
        .boolean()
        .describe('True when some `patch` is null because the 256 KiB budget was spent.'),
    })
    .describe(
      'One commit and every file it changed against its first parent, with patches.',
    ),
)

/**
 * COMMITTING (the authoring API plan's Task 6): Decision 4's rules, each the REQUEST's —
 * `400 REQUEST_INVALID`, naming the change's index and the rule — because each is a property of
 * the request alone. The path rules are `pathProblem`'s, stated once; the byte limit is a
 * refinement on UTF-8 bytes, since a string's `max` counts UTF-16 units.
 */
export const RepoPath = z
  .string()
  .min(1)
  .superRefine((p, ctx) => {
    const problem = pathProblem(p)
    if (problem !== null) ctx.addIssue({ code: 'custom', message: problem })
  })
  .describe(
    'A relative path, `/`-separated: at most 1024 bytes, 255 per component and 32 components; no empty, `.` or `..` component, no leading or trailing `/`, no backslash, no control character, and no `.git` component.',
  )

/** A lone surrogate: `JSON.parse` accepts one, and it would be written as U+FFFD, silently. */
export const LONE_SURROGATE = /\p{Surrogate}/u

/** Decision 9's refusal, in the words a person reads — one sentence beside `BINARY_KINDS`. */
export const BINARY_KINDS_SENTENCE =
  'only images (PNG, JPEG, GIF, WebP, ICO), PDF and fonts (WOFF, WOFF2, TTF, OTF) may be written as bytes'

/**
 * WHAT A WRITE'S `content` BREAKS, by its `encoding` — null when nothing does. TEXT (the default):
 * the authoring API's three rules, unchanged. BYTES (the front-end enablement plan's Task 4,
 * Decisions 7–9): canonical base64, at most 2 MiB decoded, NOT text (or base64 is a way past the
 * text rules, the diff and the push-time scan's hunk reader), and one of the ten kinds by its
 * first bytes. The route decodes a base64 write again (`bytesOf`) — twice 2 MiB at most.
 */
export function contentProblems(
  path: string,
  content: string,
  encoding: 'utf8' | 'base64' | undefined,
): string[] {
  if (encoding !== 'base64') {
    const problems: string[] = []
    if (LONE_SURROGATE.test(content)) {
      problems.push('content is not well-formed Unicode (a lone surrogate)')
    }
    if (content.includes('\u0000')) {
      problems.push(
        'content contains a NUL character; text is written with no NUL — send bytes with encoding: base64',
      )
    }
    if (Buffer.byteLength(content, 'utf8') > 1024 * 1024) {
      problems.push('content is larger than 1 MiB of UTF-8')
    }
    return problems
  }
  const bytes = Buffer.from(content, 'base64')
  // Node decodes leniently — whitespace, `-` and `_`, missing padding — so the ROUND TRIP is the
  // rule: the only string accepted for these bytes is the one Node would write for them.
  if (bytes.toString('base64') !== content) {
    return [
      'content is not canonical base64 — the standard alphabet with its padding, and no whitespace or line break',
    ]
  }
  if (bytes.length > BINARY_FILE_BYTES) {
    return [`content decodes to ${bytes.length} bytes; a binary file is at most 2 MiB`]
  }
  if (isText(bytes)) return [`'${path}' is text; send it with encoding: 'utf8'`]
  if (mediaTypeOf(bytes) === null) {
    return [`'${path}' is not a kind the API writes: ${BINARY_KINDS_SENTENCE}`]
  }
  return []
}

const WriteChange = z
  .strictObject({
    op: z.literal('write').describe('Create the file, or replace its content.'),
    path: RepoPath,
    content: z
      .string()
      .describe(
        'The whole new content of the file. As text (the default): at most 1 MiB of UTF-8, with no NUL character. With `encoding: base64`: the file’s bytes as canonical base64, at most 2 MiB decoded — an image (PNG, JPEG, GIF, WebP, ICO), a PDF or a font (WOFF, WOFF2, TTF, OTF), recognised by its bytes, never its name. A new file is mode `100644`; an existing file keeps its mode.',
      ),
    encoding: z
      .enum(['utf8', 'base64'])
      .optional()
      .describe(
        'How `content` carries the file: `utf8` (the default) for text, `base64` for bytes. Text sent as base64 is refused — send it as text.',
      ),
  })
  .superRefine((change, ctx) => {
    for (const message of contentProblems(change.path, change.content, change.encoding)) {
      ctx.addIssue({ code: 'custom', path: ['content'], message })
    }
  })

const DeleteChange = z.strictObject({
  op: z.literal('delete').describe('Remove the file. It must exist in `baseCommit`.'),
  path: RepoPath,
})

export const CreateCommitRequest = request(
  'CreateCommitRequest',
  z
    .strictObject({
      baseCommit: CommitSha.describe(
        'The commit these changes were computed from — `commitSha` from the tree or file you read. `main` must still be exactly this commit, or the request is refused `SOURCE_CONFLICT`.',
      ),
      message: z
        .string()
        .min(1)
        .max(4096)
        .describe('The commit message. Its first line is its subject.'),
      changes: z
        .array(z.discriminatedUnion('op', [WriteChange, DeleteChange]))
        .min(1)
        .max(500)
        .describe('At most 500 writes and deletions, each naming a different path.'),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          'Run every check the commit would, write nothing, and answer what would have happened.',
        ),
    })
    .describe(
      'Changes to make on `main`, computed from `baseCommit`: whole-file writes — text, or an image, PDF or font as base64 — and deletions.',
    ),
)

export const CommitOutcome = representation(
  'CommitOutcome',
  z
    .object({
      dryRun: z.boolean().describe('True when nothing was written.'),
      commitSha: CommitSha.nullable().describe(
        'The new commit on `main`; null for a dry run.',
      ),
      parent: CommitSha.describe(
        'The commit this one follows — the request’s `baseCommit`.',
      ),
      changes: z
        .array(
          z.object({
            path: z.string().describe('The file’s path.'),
            status: z
              .enum(['added', 'modified', 'deleted'])
              .describe('What the commit did to it.'),
          }),
        )
        .describe(
          'What changed, by path. A write that left a file as it was is not listed.',
        ),
      spec: z
        .object({
          appSpecId: Uuid.nullable().describe(
            'The recorded validation of the new commit; null for a dry run — and for a commit that landed when its validation could not be recorded, which a build of it then makes first.',
          ),
          sensitiveDiff: SensitiveDiff,
          warnings: z
            .array(ManifestErrorSchema)
            .describe(
              'What validating the new manifest.yaml said without refusing — a field validated but not enforced yet (`SPEC_FIELD_NOT_ENFORCED`). The commit is made regardless.',
            ),
        })
        .describe(
          "The new commit's manifest.yaml — always valid, because an invalid one is refused `SPEC_INVALID` before anything is written.",
        ),
    })
    .describe('The commit made — or, for a dry run, the one that would have been.'),
)
