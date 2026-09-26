import {
  type CommitDetail,
  type CommitInfo,
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

/** The paths git calls binary in `<from>..<to>`: numstat's `-\t-\t<path>`. */
async function binaryPaths(gitDir: string, from: string, to: string) {
  const out = await read(gitDir, [...DIFF, '--numstat', '-z', from, to])
  const counts = new Map<string, { additions: number | null; deletions: number | null }>()
  for (const rec of out.split('\0')) {
    if (rec === '') continue
    const [a, d] = rec.split('\t', 2) as [string, string]
    const path = rec.slice(a.length + d.length + 2)
    counts.set(path, {
      additions: a === '-' ? null : Number(a),
      deletions: d === '-' ? null : Number(d),
    })
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
  const counts = await binaryPaths(gitDir, EMPTY_TREE, commit)
  const all: SourceEntry[] = [...base]
    .map(([path, e]) => {
      const type = typeOf(e)
      return {
        path,
        type,
        mode: e.mode,
        size: type === 'file' || type === 'symlink' ? e.size : null,
        binary: type === 'file' ? counts.get(path)?.additions === null : null,
      }
    })
    .sort(byPath)
  return {
    entries: all.slice(0, READ_LIMITS.treeEntries),
    truncated: all.length > READ_LIMITS.treeEntries,
  }
}

/**
 * ONE TEXT FILE AT A COMMIT, exactly (Decision 4): its UTF-8 bytes decoded with nothing
 * replaced and nothing stripped — a byte-order mark stays. Refused, each by its own code: no
 * such path; a directory, symlink or submodule (NEVER followed); past 1 MiB, from the SIZE
 * `ls-tree` reports, before the blob is read; binary (a NUL in the first 8000 bytes, git's own
 * rule) or not UTF-8.
 */
export async function readTextIn(
  gitDir: string,
  commit: string,
  path: string,
): Promise<TextFile> {
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
      `'${path}' is ${what}; the API reads regular text files`,
    )
  }
  if (Number(found.size) > READ_LIMITS.fileBytes) {
    throw new SourceError(
      'SOURCE_FILE_TOO_LARGE',
      `'${path}' is ${found.size} bytes; the API carries at most ${READ_LIMITS.fileBytes} in one file`,
    )
  }
  const blob = await runGit(gitDir, ['cat-file', 'blob', found.sha])
  if (blob.code !== 0) {
    throw new SourceError('SOURCE_GIT_FAILED', `git cat-file failed (${blob.code})`)
  }
  const notText = () =>
    new SourceError(
      'SOURCE_FILE_NOT_TEXT',
      `'${path}' is binary or not UTF-8, which the API does not read or write in v1`,
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
  return { path, content, size: blob.bytes.length, mode: found.mode, blobSha: found.sha }
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
 * every path, by path, with git's counts; a unified diff per text file, one `git diff` each,
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
  const counts = await binaryPaths(gitDir, parent, commit)
  const listed: Omit<FileChange, 'patch'>[] = []
  for (let i = 0; i + 1 < names.length; i += 2) {
    const path = names[i + 1]!
    const c = counts.get(path) ?? { additions: null, deletions: null }
    listed.push({
      path,
      status: STATUS[names[i]!] ?? 'modified',
      binary: c.additions === null,
      additions: c.additions,
      deletions: c.deletions,
    })
  }
  listed.sort(byPath)
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
  return { ...info, changes, patchesTruncated }
}
