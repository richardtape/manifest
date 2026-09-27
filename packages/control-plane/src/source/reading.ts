import { BINARY_FILE_BYTES } from './binary.js'
import {
  type CommitDetail,
  type CommitInfo,
  type FileBytes,
  type FileChange,
  type FileChangeStatus,
  type SourceEntry,
  SourceError,
  type TextFile,
} from './git-driver.js'
import { type BaseEntry, listBase, runGit } from './plumbing.js'

/**
 * WHAT ONE READ MAY CARRY (the authoring API plan's Task 4; `[M10]` measured a 10,000-entry
 * listing at 0.02 s and ~760 KB, so the cap bounds the ANSWER, not the time).
 */
export const READ_LIMITS = {
  treeEntries: 10_000,
  /** A commit's `changes`, the first by path (the authoring API plan's sitting 10, F9). */
  commitChanges: 1000,
  fileBytes: 1024 * 1024,
  messageChars: 4096,
  patchBytes: 256 * 1024,
} as const

/** git's id for the tree with nothing in it — a root commit's "parent" for a diff. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** A full commit id: what every read below is handed, never a revision expression. */
export const COMMIT_ID = /^[0-9a-f]{40}$/

/**
 * A BRANCH NAME a client may send (Decision 9) — checked by the route's query schema AND by
 * each driver before git sees it, because a name beginning `-` in git's argv is an option.
 */
export const REF_NAME = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,255}$/

/**
 * Every path given to git below is LITERAL (measured, git 2.50.1, sitting 3): without it
 * `ls-tree -- ':(top)README.md'` reads pathspec magic and answers `README.md`, and a glob
 * would match what the client did not name. The answer is then matched by exact path too.
 */
const LITERAL = { GIT_LITERAL_PATHSPECS: '1' }

/** git's options for a diff that runs nothing of a repository's own and is read by code. */
const DIFF = ['diff', '--no-renames', '--no-color', '--no-ext-diff', '--no-textconv']

/**
 * A read that failed. The message names the verb and git's last words, with the repository's
 * own path replaced — it goes on the wire, and a laptop path is not an answer.
 */
async function read(
  gitDir: string,
  args: readonly string[],
  env?: Record<string, string>,
): Promise<string> {
  const r = await runGit(gitDir, args, env === undefined ? {} : { env })
  if (r.code === 0) return r.stdout
  const said = r.stderr.trim().split('\n').slice(-2).join(' | ')
  throw new SourceError(
    'SOURCE_GIT_FAILED',
    `git ${args[0]} failed (${r.code}): ${said.split(gitDir).join('<repository>')}`,
  )
}

function assertCommitId(commit: string): void {
  if (!COMMIT_ID.test(commit)) {
    throw new SourceError(
      'SOURCE_COMMIT_NOT_FOUND',
      `'${commit}' is not a commit id — a read names a full 40-character commit`,
    )
  }
}

function typeOf(e: BaseEntry): SourceEntry['type'] {
  if (e.type === 'tree') return 'directory'
  if (e.type === 'commit') return 'submodule'
  return e.mode === '120000' ? 'symlink' : 'file'
}

/** Paths as a client compares them — git's tree order puts `src.txt` before `src/`. */
const byPath = (a: { path: string }, b: { path: string }) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0

/**
 * The most bytes of paths one git command line carries: `ARG_MAX` is 1 MiB here (`[M12]`), and
 * the environment and the other arguments share it.
 */
const PATH_ARG_BYTES = 256 * 1024

/** `paths` in runs whose bytes stay under `PATH_ARG_BYTES`, each at least one path long. */
function inRuns(paths: readonly string[]): string[][] {
  const runs: string[][] = []
  let run: string[] = []
  let bytes = 0
  for (const path of paths) {
    const size = Buffer.byteLength(path, 'utf8') + 1
    if (run.length > 0 && bytes + size > PATH_ARG_BYTES) {
      runs.push(run)
      run = []
      bytes = 0
    }
    run.push(path)
    bytes += size
  }
  if (run.length > 0) runs.push(run)
  return runs
}

/**
 * The counts of `paths` in `<from>..<to>`, and which git calls binary: numstat's `-\t-\t<path>`.
 * **Only the paths named** (the authoring API plan's sitting 10, F9; the front-end enablement
 * plan's Decision 12): numstat reads every text blob it is given to count its lines, so a diff of
 * a whole 200,000-file tree for a listing that stops at 10,000 read what nobody asked for. `git
 * diff` has no `--pathspec-from-file` (`[M12]`), so they go as LITERAL arguments in runs under
 * `ARG_MAX`. No paths is no call — `git diff A B --` alone would be the whole diff again.
 */
async function countsOf(
  gitDir: string,
  from: string,
  to: string,
  paths: readonly string[],
) {
  const counts = new Map<string, { additions: number | null; deletions: number | null }>()
  for (const run of inRuns(paths)) {
    const out = await read(
      gitDir,
      [...DIFF, '--numstat', '-z', from, to, '--', ...run],
      LITERAL,
    )
    for (const rec of out.split('\0')) {
      if (rec === '') continue
      const [a, d] = rec.split('\t', 2) as [string, string]
      const path = rec.slice(a.length + d.length + 2)
      counts.set(path, {
        additions: a === '-' ? null : Number(a),
        deletions: d === '-' ? null : Number(d),
      })
    }
  }
  return counts
}

/**
 * A COMMIT'S TREE: every entry, trees included, SORTED BY PATH — the first
 * `READ_LIMITS.treeEntries` of them, and `truncated` past it. `binary` is git's own flag, read
 * from one `diff --numstat` against the empty tree, for a file only.
 */
export async function listTreeIn(
  gitDir: string,
  commit: string,
): Promise<{ entries: SourceEntry[]; truncated: boolean }> {
  assertCommitId(commit)
  const base = await listBase(gitDir, commit)
  const all = [...base].map(([path, e]) => ({ path, e, type: typeOf(e) })).sort(byPath)
  const listed = all.slice(0, READ_LIMITS.treeEntries)
  const counts = await countsOf(
    gitDir,
    EMPTY_TREE,
    commit,
    listed.filter((l) => l.type === 'file').map((l) => l.path),
  )
  return {
    entries: listed.map(({ path, e, type }) => ({
      path,
      type,
      mode: e.mode,
      size: type === 'file' || type === 'symlink' ? e.size : null,
      binary: type === 'file' ? counts.get(path)?.additions === null : null,
    })),
    truncated: all.length > READ_LIMITS.treeEntries,
  }
}

/**
 * ONE REGULAR FILE'S BLOB AT A COMMIT, read no further than `limit` bytes — THE LOOKUP BOTH READS
 * SHARE (the text read, and since the front-end enablement plan's Task 4 the byte read). Refused,
 * each by its own code: no such path; a directory, symlink or submodule (NEVER followed); past
 * `limit`, from the SIZE `ls-tree` reports, before the blob is read.
 */
async function blobAt(
  gitDir: string,
  commit: string,
  path: string,
  limit: number,
): Promise<{ bytes: Buffer; mode: string; sha: string }> {
  assertCommitId(commit)
  const notFound = () =>
    new SourceError(
      'SOURCE_PATH_NOT_FOUND',
      `'${path}' is not in commit ${commit.slice(0, 12)}`,
    )
  // A NUL cannot reach git's argv (spawn refuses it), and no path in a tree contains one.
  if (path === '' || path.includes('\0')) throw notFound()
  const out = await read(
    gitDir,
    ['ls-tree', '-l', '-z', '--full-tree', commit, '--', path],
    LITERAL,
  )
  let found: { mode: string; type: string; sha: string; size: string } | undefined
  for (const rec of out.split('\0')) {
    const tab = rec.indexOf('\t')
    if (tab < 0 || rec.slice(tab + 1) !== path) continue
    const [mode, type, sha, size] = rec.slice(0, tab).split(/ +/) as [
      string,
      string,
      string,
      string,
    ]
    found = { mode, type, sha, size }
  }
  if (found === undefined) throw notFound()
  if (found.type !== 'blob' || found.mode === '120000') {
    const what =
      found.type === 'tree'
        ? 'a directory'
        : found.type === 'commit'
          ? 'a submodule'
          : 'a symlink'
    throw new SourceError(
      'SOURCE_PATH_NOT_A_FILE',
      `'${path}' is ${what}; the API reads regular files`,
    )
  }
  if (Number(found.size) > limit) {
    throw new SourceError(
      'SOURCE_FILE_TOO_LARGE',
      `'${path}' is ${found.size} bytes; the API carries at most ${limit} in one file`,
    )
  }
  const blob = await runGit(gitDir, ['cat-file', 'blob', found.sha])
  if (blob.code !== 0) {
    throw new SourceError('SOURCE_GIT_FAILED', `git cat-file failed (${blob.code})`)
  }
  return { bytes: blob.bytes, mode: found.mode, sha: found.sha }
}

/**
 * ONE TEXT FILE AT A COMMIT, exactly (Decision 4): its UTF-8 bytes decoded with nothing
 * replaced and nothing stripped — a byte-order mark stays. `blobAt`'s refusals at 1 MiB, then
 * binary (a NUL in the first 8000 bytes, git's own rule) or not UTF-8.
 */
export async function readTextIn(
  gitDir: string,
  commit: string,
  path: string,
): Promise<TextFile> {
  const blob = await blobAt(gitDir, commit, path, READ_LIMITS.fileBytes)
  const notText = () =>
    new SourceError(
      'SOURCE_FILE_NOT_TEXT',
      `'${path}' is binary or not UTF-8, so it is not read as text — read it with encoding=base64`,
    )
  if (blob.bytes.subarray(0, 8000).includes(0)) throw notText()
  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      blob.bytes,
    )
  } catch {
    throw notText()
  }
  return { path, content, size: blob.bytes.length, mode: blob.mode, blobSha: blob.sha }
}

/**
 * ONE REGULAR FILE AT A COMMIT, AS BYTES (the front-end enablement plan's Task 4): text or binary,
 * at most `BINARY_FILE_BYTES`, exactly as git holds it — `blobAt`'s refusals and neither text rule.
 */
export async function readBytesIn(
  gitDir: string,
  commit: string,
  path: string,
): Promise<FileBytes> {
  const blob = await blobAt(gitDir, commit, path, BINARY_FILE_BYTES)
  return {
    path,
    content: blob.bytes,
    size: blob.bytes.length,
    mode: blob.mode,
    blobSha: blob.sha,
  }
}

/** A message's first `READ_LIMITS.messageChars` CODE POINTS — never half a surrogate pair. */
function cut(message: string): { message: string; messageTruncated: boolean } {
  const points = [...message]
  return points.length > READ_LIMITS.messageChars
    ? {
        message: points.slice(0, READ_LIMITS.messageChars).join(''),
        messageTruncated: true,
      }
    : { message, messageTruncated: false }
}

/**
 * THE HISTORY FROM A COMMIT, newest first: `limit` commits, and `next` — the id of the one
 * after, which a client passes back as `cursor` and the next page starts AT — or null.
 * **Never the author's address**: git's can be a person's own. `authoredAt` is UTC.
 *
 * **THE FIRST-PARENT WALK** (sitting 3, measured): a walk of every parent by date can end a page
 * at a merge's SIDE parent, and a page started AT that cursor never reaches the first-parent
 * line — `base → a → merge(a, side)` paged one at a time lost `a`. Walking first parents only,
 * the cursor continues exactly where the page stopped, and the history is main's own: each merge
 * once, as `describeCommitIn` describes it, against its first parent.
 *
 * The fixed-shape fields come first in the format and the free text last, so a separator in a
 * hand-made author name moves text into the message rather than moving the date.
 */
export async function historyIn(
  gitDir: string,
  from: string,
  limit: number,
): Promise<{ commits: CommitInfo[]; next: string | null }> {
  assertCommitId(from)
  const out = await read(gitDir, [
    'log',
    '-z',
    '--no-color',
    '--first-parent',
    '--format=%H%x1f%P%x1f%aI%x1f%an%x1f%B',
    `--max-count=${limit + 1}`,
    '--end-of-options',
    from,
    '--',
  ])
  const all = out
    .split('\0')
    .filter((rec) => rec !== '')
    .map((rec): CommitInfo => {
      const [sha, parents, at, name, ...rest] = rec.split('\x1f') as [
        string,
        string,
        string,
        string,
        ...string[],
      ]
      const whole = rest.join('\x1f')
      return {
        commitSha: sha,
        parents: parents === '' ? [] : parents.split(' '),
        subject: whole.split('\n', 1)[0]!,
        ...cut(whole),
        authorName: name,
        authoredAt: new Date(at).toISOString(),
      }
    })
  return { commits: all.slice(0, limit), next: all[limit]?.commitSha ?? null }
}

const STATUS: Record<string, FileChangeStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  T: 'type_changed',
}

/**
 * ONE COMMIT AND WHAT IT CHANGED, against its FIRST parent (the empty tree for a root commit):
 * every path — the first `READ_LIMITS.commitChanges` by path, and `truncated` past it — with
 * git's counts; a unified diff per text file, one `git diff` each,
 * until `READ_LIMITS.patchBytes` have been given — then every later `patch` is null and
 * `patchesTruncated` says so. A binary file has no patch and no counts.
 */
export async function describeCommitIn(
  gitDir: string,
  commit: string,
): Promise<CommitDetail> {
  const [info] = (await historyIn(gitDir, commit, 1)).commits
  if (info === undefined) {
    throw new SourceError('SOURCE_COMMIT_NOT_FOUND', `no commit ${commit.slice(0, 12)}`)
  }
  const parent = info.parents[0] ?? EMPTY_TREE
  const names = (
    await read(gitDir, [...DIFF, '-z', '--name-status', parent, commit])
  ).split('\0')
  const all: { path: string; status: FileChangeStatus }[] = []
  for (let i = 0; i + 1 < names.length; i += 2) {
    all.push({ path: names[i + 1]!, status: STATUS[names[i]!] ?? 'modified' })
  }
  all.sort(byPath)
  // The first `commitChanges` by path, and their counts only (F9): a person's 200,000-file
  // commit is otherwise an unbounded answer any `project:read` token can ask for.
  const first = all.slice(0, READ_LIMITS.commitChanges)
  const counts = await countsOf(
    gitDir,
    parent,
    commit,
    first.map((c) => c.path),
  )
  const listed: Omit<FileChange, 'patch'>[] = first.map(({ path, status }) => {
    const c = counts.get(path) ?? { additions: null, deletions: null }
    return {
      path,
      status,
      binary: c.additions === null,
      additions: c.additions,
      deletions: c.deletions,
    }
  })
  let budget: number = READ_LIMITS.patchBytes
  let patchesTruncated = false
  const changes: FileChange[] = []
  for (const change of listed) {
    if (change.binary || patchesTruncated) {
      changes.push({ ...change, patch: null })
      continue
    }
    const patch = await read(
      gitDir,
      [...DIFF, '-U3', parent, commit, '--', change.path],
      LITERAL,
    )
    const bytes = Buffer.byteLength(patch)
    if (bytes > budget) {
      patchesTruncated = true
      changes.push({ ...change, patch: null })
      continue
    }
    budget -= bytes
    changes.push({ ...change, patch })
  }
  return {
    ...info,
    changes,
    truncated: all.length > READ_LIMITS.commitChanges,
    patchesTruncated,
  }
}
