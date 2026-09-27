import { spawn } from 'node:child_process'
import { scanText } from '../build/index.js'
import { printableRuns } from './binary.js'
import { type Change, type CommitFinding, SourceError } from './git-driver.js'

export type { CommitFinding } from './git-driver.js'

/** How many commits one BATCH of a scan names; a scan reads as many batches as there are. */
export const SCAN_COMMIT_LIMIT = 1000

/**
 * How much of `git log -p` one batch may produce. Past it the batch is split and read again;
 * ONE commit whose own patch is past it is `unscannable`, named and reported, never read.
 */
export const SCAN_OUTPUT_LIMIT = 20 * 1024 * 1024

/** The bounds one `git log -p` of a scan reads within — a batch of commits, and its patch. */
export interface ScanLimits {
  /** How many commits one batch names. */
  commits: number
  /** How much patch one batch may produce; past it the batch is split, down to one commit. */
  bytes: number
}

/**
 * The patch options BOTH copies of the walk use — this one and driver 1's rendered hook
 * (`pre-receive.ts`) — so the two read the same lines. `--cc` shows a MERGE's own additions
 * (lines in neither parent — an evil merge) and not the lines its parents brought, which their
 * own commits already showed: each added line is scanned once. The explicit prefixes, and
 * everything turned off, keep a person's own git configuration (the hook runs in THEIR
 * environment) from changing what is read. `--diff-filter` is deliberately absent: a deletion
 * adds no line, so it only ever hid type changes.
 */
export const PATCH_ARGS: readonly string[] = [
  '-c',
  'core.quotePath=false',
  'log',
  '-p',
  '--cc',
  '-U0',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--no-renames',
  '--no-relative',
  '--src-prefix=a/',
  '--dst-prefix=b/',
  '--format=%x00%H',
]

/** `@@ -a,b +c,d @@`, or a combined `@@@ -a,b -c,d +e,f @@@`: the RESULT's first line. */
export const HUNK = /^(@{2,}) .*?\+(\d+)(?:,\d+)? \1/

/** git's C-quoting of a path it could not print plainly (`"b/a\"b"`), undone. */
function unquote(path: string): string {
  if (!path.startsWith('"')) return path
  const bytes: number[] = []
  for (let i = 1; i < path.length - 1; i++) {
    const c = path[i]!
    if (c !== '\\') {
      bytes.push(...Buffer.from(c, 'utf8'))
      continue
    }
    const next = path[++i]!
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(path.slice(i, i + 3), 8))
      i += 2
    } else {
      bytes.push(
        ({ n: 10, t: 9, r: 13, '"': 34, '\\': 92 } as Record<string, number>)[next] ??
          next.charCodeAt(0),
      )
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/**
 * READS `git log -p --cc -U0` and hands back every secret-shaped ADDED line, at its line in
 * the file as the commit left it. A line is added when every one of its parent columns says
 * `+`; one with a `-` in any column is not in the result and does not move the count. A binary
 * file has no hunk, so it is skipped. The same walk, in plain JavaScript, is driver 1's hook.
 */
export function findingsInPatch(patch: string): CommitFinding[] {
  const out: CommitFinding[] = []
  let commit = ''
  let path: string | undefined
  let header = false
  let parents = 1
  let lineNo = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('\0')) {
      commit = line.slice(1).trim()
      path = undefined
      header = false
      continue
    }
    if (line.startsWith('diff ')) {
      path = undefined
      header = true
      continue
    }
    if (header) {
      if (line.startsWith('+++ ')) {
        const target = unquote(line.slice(4))
        path = target.startsWith('b/') ? target.slice(2) : undefined
        continue
      }
      const m = HUNK.exec(line)
      if (m === null) continue
      header = false
      parents = m[1]!.length - 1
      lineNo = Number(m[2])
      continue
    }
    const m = HUNK.exec(line)
    if (m !== null) {
      parents = m[1]!.length - 1
      lineNo = Number(m[2])
      continue
    }
    if (path === undefined || line.startsWith('\\')) continue
    const columns = line.slice(0, parents)
    if (columns.length < parents || columns.includes('-')) continue
    if (/^\++$/.test(columns)) {
      for (const f of scanText(line.slice(parents), path)) {
        out.push({ ...f, line: lineNo, commit })
      }
    }
    lineNo += 1
  }
  return out
}

/** git in a repository of this machine's, reading `input` — no token, no network. */
function gitRead(
  gitDir: string,
  args: readonly string[],
  input: string,
  limit: number,
): Promise<{ stdout: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['--git-dir', gitDir, ...args], {
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    let size = 0
    let truncated = false
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      if (truncated) return
      if (size + chunk.length > limit) {
        chunks.push(chunk.subarray(0, limit - size))
        truncated = true
        child.kill()
        return
      }
      chunks.push(chunk)
      size += chunk.length
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0 || truncated) {
        resolve({ stdout: Buffer.concat(chunks).toString('utf8'), truncated })
      } else {
        const what = args.find((a) => !a.startsWith('-') && !a.includes('=')) ?? ''
        const said = stderr.trim().split('\n').slice(-3).join(' | ')
        // Never swallowed: a scan that could not run fails the sync that asked for it, so
        // the commits are scanned by the next one rather than marked scanned unread.
        reject(
          new SourceError('SOURCE_GIT_FAILED', `git ${what} failed (${code}): ${said}`),
        )
      }
    })
    child.stdin.end(input)
  })
}

/**
 * THE MIRROR'S SCAN (Decision 14 (c)): every secret-shaped line ADDED by a commit reachable
 * from `heads` and from none of `exclude` — what is new since the last scan — and **EVERY such
 * commit, to the end** (the authoring API plan's Task 12, the D5 plan's final review's
 * Important 3). Until then one scan read the newest 1000 commits and 20 MiB of patch and the
 * caller marked the branch scanned, so whatever lay past the cap was never read by anything.
 *
 * `rev-list --reverse --topo-order` lists the new commits oldest first; they are read in
 * batches of `limits.commits` with `log -p --no-walk` over each batch's ids. A batch whose patch
 * passes `limits.bytes` is split in half and read again; **a single commit whose own patch
 * passes it is `unscannable`** — named, so the caller reports it, and never counted as read.
 * The revisions and the ids go on STDIN, so no list meets an argument-length limit.
 */
export async function scanNewCommits(
  gitDir: string,
  heads: readonly string[],
  exclude: readonly string[],
  limits: ScanLimits = { commits: SCAN_COMMIT_LIMIT, bytes: SCAN_OUTPUT_LIMIT },
): Promise<{ findings: CommitFinding[]; commits: number; unscannable: string[] }> {
  if (heads.length === 0) return { findings: [], commits: 0, unscannable: [] }
  const revs = [...heads, '--not', ...exclude].join('\n') + '\n'
  // Every id, whatever the count: the list is 41 bytes a commit, and paging needs all of it.
  const listed = await gitRead(
    gitDir,
    ['rev-list', '--reverse', '--topo-order', '--stdin'],
    revs,
    Number.POSITIVE_INFINITY,
  )
  const ids = listed.stdout.split('\n').filter((line) => line.length > 0)
  const findings: CommitFinding[] = []
  const unscannable: string[] = []
  const read = async (batch: readonly string[]): Promise<void> => {
    const patch = await gitRead(
      gitDir,
      [...PATCH_ARGS, '--no-walk=unsorted', '--stdin'],
      batch.join('\n') + '\n',
      limits.bytes,
    )
    if (!patch.truncated) {
      findings.push(...findingsInPatch(patch.stdout))
      return
    }
    if (batch.length === 1) {
      unscannable.push(batch[0]!)
      return
    }
    const half = Math.ceil(batch.length / 2)
    await read(batch.slice(0, half))
    await read(batch.slice(half))
  }
  for (let i = 0; i < ids.length; i += limits.commits) {
    await read(ids.slice(i, i + limits.commits))
  }
  return { findings, commits: ids.length, unscannable }
}

/**
 * THE PRE-PUSH SCAN (Decision 14 (a)): Manifest's OWN commits — a seed, and the authoring API's
 * commits after this plan — are scanned before anything is written, on both drivers, and
 * refused with a code of their own. On driver 1 the repository's hook would refuse the push
 * anyway, but as `SOURCE_GIT_FAILED` carrying git's stderr; on driver 2 nothing would, and the
 * value would be on GitHub for ever. The message names `path:line` and the rule — never the
 * value, because it goes on the wire.
 */
/**
 * A PATH NAMES A FILE INSIDE THE REPOSITORY, and never its `.git` — refused before anything is
 * built, on both drivers, beside the secret scan.
 *
 * **Inside**: relative to the root, `/`-separated, with no empty, `.` or `..` component and no
 * NUL (which would end a record of `update-index -z`). Until the authoring API plan's Task 3
 * each driver's worktree answered this with `resolve()`; with no worktree it is stated here, so
 * `../outside.txt` is still `SOURCE_PATH_ESCAPE` rather than whatever git makes of it.
 *
 * **Never `.git`, in any case** (the D5 plan's final review, Important 1): with a worktree,
 * `.git/config` was a command the control plane ran on its next `git add`. There is no worktree
 * now, and `.git` in a TREE is still a path every clone of it would refuse — so it is refused
 * by name, as the request schema refuses it first (the authoring API plan's Decision 4).
 */
export function assertWritablePaths(paths: readonly string[]): void {
  const outside = paths.filter(
    (path) =>
      path.includes('\0') ||
      path.startsWith('/') ||
      path.split('/').some((part) => part === '' || part === '.' || part === '..'),
  )
  if (outside.length > 0) {
    throw new SourceError(
      'SOURCE_PATH_ESCAPE',
      `a path names a file inside the repository, relative to its root, with no empty, '.' or '..' component, and nothing was committed: ${outside
        .map((p) => `'${p.replace(/\0/g, '\\0')}'`)
        .join(', ')}`,
    )
  }
  const into = paths.filter((path) =>
    path.split('/').some((part) => part.toLowerCase() === '.git'),
  )
  if (into.length === 0) return
  throw new SourceError(
    'SOURCE_PATH_ESCAPE',
    `Manifest never writes inside a repository's own .git directory, and nothing was committed: ${into
      .map((p) => `'${p}'`)
      .join(', ')}`,
  )
}

/**
 * The writes of a set of changes, as the secret scan reads them: a text write's content, and a
 * BINARY write's printable runs (the front-end enablement plan's Decision 10), one per line — so
 * `createCommit`'s scan and each driver's `assertNoSecrets` read a key pasted into a PDF with the
 * rules they already have. **These are the only scans a binary write meets**: both push-time
 * scans skip a file with no hunk. A finding's `line` then counts runs, not lines.
 */
export const writesOf = (
  changes: readonly Change[],
): { path: string; content: string }[] =>
  changes.flatMap((c) =>
    c.op === 'write'
      ? [
          {
            path: c.path,
            content: typeof c.content === 'string' ? c.content : printableRuns(c.content),
          },
        ]
      : [],
  )

/** Every secret-shaped line of `files`, as data: where, and which rule — never the value. */
export function secretFindings(
  files: readonly { path: string; content: string }[],
): { path: string; line: number; rule: string }[] {
  return files.flatMap(({ path, content }) => scanText(content, path))
}

/**
 * THE REFUSAL, built from the findings — so `createCommit`, which publishes them first
 * (`repository.secret_refused`), and each driver refuse in the same words (the authoring API
 * plan's Task 6). The message names `path:line` and the rule; it goes on the wire.
 */
export function secretRefusal(
  findings: readonly { path: string; line: number; rule: string }[],
): SourceError {
  return new SourceError(
    'SOURCE_SECRET_DETECTED',
    `Manifest never commits a secret-shaped value (§20), and nothing was committed: ${findings
      .map((f) => `${f.path}:${f.line} looks like ${f.rule}`)
      .join('; ')}. Remove it and commit again; if it is a real secret, rotate it.`,
  )
}

export function assertNoSecrets(
  files: readonly { path: string; content: string }[],
): void {
  const found = secretFindings(files)
  if (found.length > 0) throw secretRefusal(found)
}
