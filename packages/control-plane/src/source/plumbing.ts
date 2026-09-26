import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type Change,
  type ChangeStatus,
  type GitIdentity,
  SourceError,
} from './git-driver.js'

/** Manifest commits as itself; a PERSON is the author (the authoring API plan's Decision 5). */
export const MANIFEST_COMMITTER: GitIdentity = {
  name: 'Manifest',
  email: 'manifest@manifest.internal',
}

const ZERO = '0'.repeat(40)
const REGULAR = new Set(['100644', '100755'])

/** One entry of `git ls-tree -r -t -l -z`: a tree, a blob (a file or a symlink) or a submodule. */
export interface BaseEntry {
  mode: string
  type: 'tree' | 'blob' | 'commit'
  sha: string
  /** Bytes, for a blob; null for a tree or a submodule. */
  size: number | null
}

export interface PlannedChange {
  path: string
  status: ChangeStatus
  /** The mode written — or, for a deletion, the mode removed. */
  mode: string
  /** A write's exact bytes. */
  bytes?: Buffer
}

function kind(e: BaseEntry): string {
  if (e.type === 'tree') return 'a directory'
  if (e.type === 'commit') return 'a submodule'
  return e.mode === '120000' ? 'a symlink' : 'a file'
}

function ancestors(path: string): string[] {
  const parts = path.split('/')
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))
}

const conflict = (message: string): never => {
  throw new SourceError('SOURCE_PATH_CONFLICT', message)
}

/**
 * THE CONTROL (the authoring API plan's Decision 2). `update-index --index-info` REPLACES where
 * a person would expect a refusal — a file named `src` deleted the directory `src/`, and a write
 * under a symlink turned the symlink into a directory (measured, the plan's *Read this first* 3)
 * — so every such shape is refused HERE, against the base's own listing, before the index is
 * touched. Evaluated against the BASE only: deleting `out` and writing `out/x` in one commit is
 * refused, and two commits do it.
 */
export function planChanges(
  base: ReadonlyMap<string, BaseEntry>,
  changes: readonly Change[],
): PlannedChange[] {
  const named = new Set<string>()
  // The callback's return type is DECLARED: inferred, `status` widens to `string`, and `tsc`
  // refuses `string[]` where `ChangeStatus` belongs — a Vitest run would not notice.
  return changes.map((change): PlannedChange => {
    if (named.has(change.path)) conflict(`'${change.path}' is named twice in one commit`)
    named.add(change.path)
    const here = base.get(change.path)
    if (change.op === 'delete') {
      if (here === undefined) {
        throw new SourceError(
          'SOURCE_PATH_NOT_FOUND',
          `'${change.path}' is not in the base commit, so there is nothing to delete`,
        )
      }
      if (here.type !== 'blob') {
        conflict(
          `'${change.path}' is ${kind(here)}; Manifest deletes files, one path at a time`,
        )
      }
      return { path: change.path, status: 'deleted', mode: here.mode }
    }
    for (const a of ancestors(change.path)) {
      const e = base.get(a)
      if (e !== undefined && e.type !== 'tree') {
        conflict(
          `'${change.path}' cannot be written: '${a}' is ${kind(e)} in the base commit, not a directory`,
        )
      }
    }
    if (here !== undefined && !(here.type === 'blob' && REGULAR.has(here.mode))) {
      conflict(
        `'${change.path}' is ${kind(here)} in the base commit; Manifest writes regular text files only`,
      )
    }
    return {
      path: change.path,
      status: here === undefined ? 'added' : 'modified',
      mode: here?.mode ?? '100644',
      bytes: Buffer.from(change.content, 'utf8'),
    }
  })
}

/**
 * git with NOTHING inherited but PATH: an inherited `GIT_DIR`, `GIT_INDEX_FILE`,
 * `GIT_CONFIG_PARAMETERS` or `GIT_OBJECT_DIRECTORY` would point this at another repository or
 * configure it (the D5 plan's review, minor 5, for the same reason). ANSWERS the exit code rather
 * than throwing, so a caller can never read a refusal as success by forgetting a `catch`; `must`
 * is the throwing form.
 */
export function runGit(
  gitDir: string,
  args: readonly string[],
  o: { input?: string | Buffer; env?: Record<string, string> } = {},
): Promise<{ stdout: string; code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['--git-dir', gitDir, ...args], {
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        LC_ALL: 'C',
        ...o.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const out: Buffer[] = []
    let err = ''
    child.stdout.on('data', (b: Buffer) => out.push(b))
    child.stderr.on('data', (b: Buffer) => (err += b.toString()))
    child.on('error', reject)
    child.on('close', (code) =>
      resolve({
        stdout: Buffer.concat(out).toString('utf8'),
        code: code ?? 1,
        stderr: err,
      }),
    )
    child.stdin.end(o.input ?? '')
  })
}

/**
 * The throwing form. A failure's message names the verb and git's last words, with the scratch
 * directory's path replaced — the message goes on the wire, and a laptop path is not an answer.
 */
async function must(
  gitDir: string,
  args: readonly string[],
  o: Parameters<typeof runGit>[2] & { scratch?: string } = {},
): Promise<string> {
  const r = await runGit(gitDir, args, o)
  if (r.code === 0) return r.stdout
  const said = r.stderr.trim().split('\n').slice(-2).join(' | ')
  const clean = o.scratch === undefined ? said : said.split(o.scratch).join('<scratch>')
  throw new SourceError(
    'SOURCE_GIT_FAILED',
    `git ${args[0]} failed (${r.code}): ${clean}`,
  )
}

/** Every entry of a commit's tree, trees included — what the planner reads. */
export async function listBase(
  gitDir: string,
  commit: string,
): Promise<Map<string, BaseEntry>> {
  const out = await must(gitDir, [
    'ls-tree',
    '-r',
    '-t',
    '-l',
    '-z',
    '--full-tree',
    commit,
  ])
  const map = new Map<string, BaseEntry>()
  for (const rec of out.split('\0')) {
    if (rec === '') continue
    const tab = rec.indexOf('\t')
    const [mode, type, sha, size] = rec.slice(0, tab).split(/ +/) as [
      string,
      BaseEntry['type'],
      string,
      string,
    ]
    map.set(rec.slice(tab + 1), {
      mode,
      type,
      sha,
      size: size === '-' ? null : Number(size),
    })
  }
  return map
}

export interface BuiltCommit {
  /** The scratch repository that holds the new objects — push FROM here. */
  gitDir: string
  commit: string
  parent: string | null
  changes: { path: string; status: ChangeStatus }[]
  dispose(): Promise<void>
}

/**
 * THE ONE WRITE PATH (the authoring API plan's Decision 1): no worktree, so no file of the
 * repository is ever written at its own path — nothing for a symlink to redirect, no
 * `.git/config` to replace, no `fsmonitor`, no filter, no hook. `objects` is the git dir whose
 * objects hold `base` (driver 1's bare repository, driver 2's mirror); the scratch repository
 * BORROWS them through `alternates`, so nothing is copied. With no base (a new repository's
 * seed) there is nothing to borrow, and `objects` need not exist yet — driver 2 builds its seed
 * before its mirror is made. The caller pushes `commit` from `gitDir`, non-forced, and disposes.
 */
export async function buildCommit(input: {
  objects: string
  base: string | null
  changes: readonly Change[]
  message: string
  author: GitIdentity
}): Promise<BuiltCommit> {
  const scratch = await mkdtemp(join(tmpdir(), 'manifest-commit-'))
  const dispose = () => rm(scratch, { recursive: true, force: true })
  try {
    const gitDir = join(scratch, 'r.git')
    // `init` names the directory it creates as its own `--git-dir` (measured: it creates it).
    await must(gitDir, ['init', '-q', '--bare', gitDir], { scratch })
    if (input.base !== null) {
      await writeFile(
        join(gitDir, 'objects', 'info', 'alternates'),
        `${join(input.objects, 'objects')}\n`,
      )
    }
    const index = { GIT_INDEX_FILE: join(scratch, 'index') }
    const base =
      input.base === null
        ? new Map<string, BaseEntry>()
        : await listBase(gitDir, input.base)
    const plan = planChanges(base, input.changes)
    // Every blob in ONE process, from NUMBERED files — never at the file's own path.
    const writes = plan.filter((c) => c.bytes !== undefined)
    const shas = new Map<string, string>()
    if (writes.length > 0) {
      await mkdir(join(scratch, 'blobs'))
      const files = await Promise.all(
        writes.map(async (c, i) => {
          const f = join(scratch, 'blobs', String(i))
          await writeFile(f, c.bytes!)
          return f
        }),
      )
      const out = (
        await must(gitDir, ['hash-object', '-w', '--no-filters', '--stdin-paths'], {
          input: files.join('\n') + '\n',
          scratch,
        })
      )
        .trim()
        .split('\n')
      writes.forEach((c, i) => shas.set(c.path, out[i]!))
    }
    // A write that changes nothing is not a change (Decision 2).
    const effective = plan.filter((c) => {
      if (c.status !== 'modified') return true
      const was = base.get(c.path)!
      return !(was.sha === shas.get(c.path) && was.mode === c.mode)
    })
    if (effective.length === 0) {
      throw new SourceError(
        'SOURCE_NOTHING_TO_COMMIT',
        'these changes leave every file as it was in the base commit, so there is nothing to commit',
      )
    }
    if (input.base !== null) {
      await must(gitDir, ['read-tree', input.base], { env: index, scratch })
    }
    const lines = effective
      .map((c) =>
        c.status === 'deleted'
          ? `0 ${ZERO}\t${c.path}\0`
          : `${c.mode} ${shas.get(c.path)!}\t${c.path}\0`,
      )
      .join('')
    await must(gitDir, ['update-index', '-z', '--index-info'], {
      input: lines,
      env: index,
      scratch,
    })
    const tree = (await must(gitDir, ['write-tree'], { env: index, scratch })).trim()
    await assertTreeIs(gitDir, tree, base, effective, shas)
    const commit = (
      await must(
        gitDir,
        [
          'commit-tree',
          tree,
          ...(input.base === null ? [] : ['-p', input.base]),
          '-F',
          '-',
        ],
        {
          input: input.message,
          env: {
            GIT_AUTHOR_NAME: input.author.name,
            GIT_AUTHOR_EMAIL: input.author.email,
            GIT_COMMITTER_NAME: MANIFEST_COMMITTER.name,
            GIT_COMMITTER_EMAIL: MANIFEST_COMMITTER.email,
          },
          scratch,
        },
      )
    ).trim()
    return {
      gitDir,
      commit,
      parent: input.base,
      changes: effective.map(({ path, status }) => ({ path, status })),
      dispose,
    }
  } catch (error) {
    await dispose()
    throw error
  }
}

/**
 * BELT AND BRACES (Decision 2): the tree written must be the base's files, minus the deletions,
 * plus the writes — by path, mode and blob. A planner defect becomes a refusal, never a silent
 * deletion of somebody's directory.
 */
async function assertTreeIs(
  gitDir: string,
  tree: string,
  base: ReadonlyMap<string, BaseEntry>,
  changes: readonly PlannedChange[],
  shas: ReadonlyMap<string, string>,
): Promise<void> {
  const expected = new Map<string, string>()
  for (const [p, e] of base) if (e.type !== 'tree') expected.set(p, `${e.mode} ${e.sha}`)
  for (const c of changes) {
    if (c.status === 'deleted') expected.delete(c.path)
    else expected.set(c.path, `${c.mode} ${shas.get(c.path)!}`)
  }
  const actual = new Map<string, string>()
  for (const [p, e] of await listBase(gitDir, tree))
    if (e.type !== 'tree') actual.set(p, `${e.mode} ${e.sha}`)
  const wrong = [...new Set([...expected.keys(), ...actual.keys()])].filter(
    (p) => expected.get(p) !== actual.get(p),
  )
  if (wrong.length === 0) return
  console.error(
    `[source] a planned commit's tree differs from its plan at ${wrong.slice(0, 5).join(', ')}; nothing was committed`,
  )
  throw new SourceError(
    'SOURCE_GIT_FAILED',
    'the tree written did not match the changes asked for, so nothing was committed',
  )
}

/**
 * What `git push --porcelain` said of ONE ref, read from its STDOUT, where porcelain puts the
 * verdict (measured, git 2.50.1: a refusal is `!\t<sha>:<ref>\t[rejected] (non-fast-forward)` on
 * stdout, with only `failed to push` and hints on stderr). `ok` is a flag of ` ` (fast-forward),
 * `*` (new) or `=` (already there); `conflict` is git's own refusal of a moved branch; anything
 * else — a hook's `[remote rejected]`, GitHub's GH006, no line at all — is `refused`. **Driver 2
 * reads its push through this**: `gitWithToken` answers exit 1 as stdout, so the exit code is
 * not there to read.
 */
export function pushVerdict(
  stdout: string,
  ref = 'refs/heads/main',
): { verdict: 'ok' | 'conflict' | 'refused'; line: string | null } {
  const line =
    stdout.split('\n').find((l) => {
      const fields = l.split('\t')
      return fields.length >= 3 && fields[1]!.endsWith(`:${ref}`)
    }) ?? null
  if (line === null) return { verdict: 'refused', line }
  const flag = line[0]
  if (flag === ' ' || flag === '*' || flag === '=') return { verdict: 'ok', line }
  if (flag === '!' && /\[rejected\] \((non-fast-forward|fetch first)\)/.test(line)) {
    return { verdict: 'conflict', line }
  }
  return { verdict: 'refused', line }
}
