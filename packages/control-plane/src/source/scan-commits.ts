import { spawn } from 'node:child_process'
import { scanText } from '../build/index.js'
import { type CommitFinding, SourceError } from './git-driver.js'

export type { CommitFinding } from './git-driver.js'

/** How many new commits one scan reads; past it the scan says `truncated` rather than stall. */
export const SCAN_COMMIT_LIMIT = 1000

/** How much of `git log -p` one scan reads; past it, `truncated`, and what arrived is scanned. */
export const SCAN_OUTPUT_LIMIT = 20 * 1024 * 1024

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
 * from `heads` and from none of `exclude` — what is new since the last scan. At most
 * `SCAN_COMMIT_LIMIT` commits, newest first, and at most `SCAN_OUTPUT_LIMIT` of patch; past
 * either, `truncated`, and what was read is scanned. The revisions go on STDIN, so a repository
 * with many branches never meets an argument-length limit.
 */
export async function scanNewCommits(
  gitDir: string,
  heads: readonly string[],
  exclude: readonly string[],
): Promise<{ findings: CommitFinding[]; commits: number; truncated: boolean }> {
  if (heads.length === 0) return { findings: [], commits: 0, truncated: false }
  const revs = [...heads, '--not', ...exclude].join('\n') + '\n'
  const count = Number(
    (await gitRead(gitDir, ['rev-list', '--count', '--stdin'], revs, 1024)).stdout.trim(),
  )
  if (count === 0) return { findings: [], commits: 0, truncated: false }
  const patch = await gitRead(
    gitDir,
    [...PATCH_ARGS, `--max-count=${SCAN_COMMIT_LIMIT}`, '--stdin'],
    revs,
    SCAN_OUTPUT_LIMIT,
  )
  return {
    findings: findingsInPatch(patch.stdout),
    commits: Math.min(count, SCAN_COMMIT_LIMIT),
    truncated: patch.truncated || count > SCAN_COMMIT_LIMIT,
  }
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
 * THE WORKTREE'S OWN `.git` IS NEVER WRITTEN (the D5 plan's final review, Important 1): a path
 * that stays inside the worktree can still be `.git/config`, and `core.fsmonitor = <command>`
 * there is a command the control plane runs on its very next `git add`. Refused — before
 * anything is written, on both drivers, beside the secret scan — when ANY component is `.git`
 * in any case, because macOS's filesystem folds case and `.GIT/config` is the same file. Each
 * driver's own check that a path stays inside the worktree is the other half.
 */
export function assertWritablePaths(files: Readonly<Record<string, string>>): void {
  const into = Object.keys(files).filter((path) =>
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

export function assertNoSecrets(files: Readonly<Record<string, string>>): void {
  const found = Object.entries(files).flatMap(([path, content]) =>
    scanText(content, path),
  )
  if (found.length === 0) return
  throw new SourceError(
    'SOURCE_SECRET_DETECTED',
    `Manifest never commits a secret-shaped value (§20), and nothing was committed: ${found
      .map((f) => `${f.path}:${f.line} looks like ${f.rule}`)
      .join('; ')}. Remove it and commit again; if it is a real secret, rotate it.`,
  )
}
