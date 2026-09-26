import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SourceError } from './git-driver.js'
import {
  buildCommit,
  MANIFEST_COMMITTER,
  pathProblem,
  planChanges,
  pushVerdict,
  type BaseEntry,
} from './plumbing.js'

const blob = (mode = '100644'): BaseEntry => ({
  mode,
  type: 'blob',
  sha: 'a'.repeat(40),
  size: 1,
})
const tree: BaseEntry = { mode: '040000', type: 'tree', sha: 'b'.repeat(40), size: null }
const BASE = new Map<string, BaseEntry>([
  ['README.md', blob()],
  ['run.sh', blob('100755')],
  ['src', tree],
  ['src/a.js', blob()],
  ['out', blob('120000')], // a symlink a person pushed
  ['meta', blob('120000')], // a symlink to .git a person pushed
  ['vendor', { mode: '160000', type: 'commit', sha: 'c'.repeat(40), size: null }],
])
const refused = (f: () => unknown): string | undefined => {
  try {
    f()
    return undefined
  } catch (e) {
    return e instanceof SourceError ? e.code : String(e)
  }
}

describe('planChanges — every shape --index-info would silently replace is refused FIRST (Decision 2)', () => {
  it('plans an ordinary write, a new file and a deletion, and keeps an executable file executable', () => {
    const plan = planChanges(BASE, [
      { op: 'write', path: 'README.md', content: 'hi\n' },
      { op: 'write', path: 'src/b.js', content: 'b\n' },
      { op: 'write', path: 'run.sh', content: '#!/bin/sh\n' },
      { op: 'delete', path: 'src/a.js' },
    ])
    expect(plan.map((c) => [c.path, c.status, c.mode])).toEqual([
      ['README.md', 'modified', '100644'],
      ['src/b.js', 'added', '100644'],
      ['run.sh', 'modified', '100755'],
      ['src/a.js', 'deleted', '100644'],
    ])
  })

  it('refuses a write UNDER a symlink — the escape of Read this first 1 — and under a file', () => {
    expect(
      refused(() =>
        planChanges(BASE, [{ op: 'write', path: 'out/pwned', content: 'x' }]),
      ),
    ).toBe('SOURCE_PATH_CONFLICT')
    expect(
      refused(() =>
        planChanges(BASE, [{ op: 'write', path: 'meta/config', content: 'x' }]),
      ),
    ).toBe('SOURCE_PATH_CONFLICT')
    expect(
      refused(() =>
        planChanges(BASE, [{ op: 'write', path: 'README.md/inner', content: 'x' }]),
      ),
    ).toBe('SOURCE_PATH_CONFLICT')
  })

  it('refuses a FILE where a directory is — which --index-info answered by deleting the directory', () => {
    expect(
      refused(() => planChanges(BASE, [{ op: 'write', path: 'src', content: 'x' }])),
    ).toBe('SOURCE_PATH_CONFLICT')
  })

  it('refuses to overwrite a symlink or a submodule — v1 writes regular text files only', () => {
    expect(
      refused(() => planChanges(BASE, [{ op: 'write', path: 'out', content: 'x' }])),
    ).toBe('SOURCE_PATH_CONFLICT')
    expect(
      refused(() => planChanges(BASE, [{ op: 'write', path: 'vendor', content: 'x' }])),
    ).toBe('SOURCE_PATH_CONFLICT')
  })

  it('refuses to delete what is not there, a directory, or a submodule — and allows deleting a symlink', () => {
    expect(refused(() => planChanges(BASE, [{ op: 'delete', path: 'nope.txt' }]))).toBe(
      'SOURCE_PATH_NOT_FOUND',
    )
    expect(refused(() => planChanges(BASE, [{ op: 'delete', path: 'src' }]))).toBe(
      'SOURCE_PATH_CONFLICT',
    )
    expect(refused(() => planChanges(BASE, [{ op: 'delete', path: 'vendor' }]))).toBe(
      'SOURCE_PATH_CONFLICT',
    )
    expect(planChanges(BASE, [{ op: 'delete', path: 'out' }])[0]).toMatchObject({
      status: 'deleted',
      mode: '120000',
    })
  })

  it('refuses a path named twice in one commit', () => {
    expect(
      refused(() =>
        planChanges(BASE, [
          { op: 'write', path: 'README.md', content: 'a' },
          { op: 'delete', path: 'README.md' },
        ]),
      ),
    ).toBe('SOURCE_PATH_CONFLICT')
  })
})

describe('pathProblem — Decision 4’s path rules, one function the request schema reads (Task 6)', () => {
  it('accepts an ordinary path — spaces, non-ASCII, deep — the positive control', () => {
    expect(pathProblem('src/a b/é.js')).toBeNull()
    expect(pathProblem('README.md')).toBeNull()
    expect(pathProblem(Array.from({ length: 32 }, () => 'd').join('/'))).toBeNull()
    expect(pathProblem('a'.repeat(255))).toBeNull()
    // Exactly 1024 bytes, in five components of 204.
    expect(
      pathProblem(Array.from({ length: 5 }, () => 'a'.repeat(204)).join('/')),
    ).toBeNull()
    expect(pathProblem('.gitignore')).toBeNull()
    expect(pathProblem('src/.github/x.yml')).toBeNull()
  })

  it('refuses each rule by its own sentence', () => {
    const cases: [string, RegExp][] = [
      ['a'.repeat(1025), /at most 1024 bytes/],
      [`${'é'.repeat(513)}`, /at most 1024 bytes/], // 1026 bytes, 513 characters
      ['/etc/passwd', /relative/],
      ['src/', /relative/],
      ['src\\a.js', /backslash/],
      ['src/a\u0000.js', /control character/],
      ['src/a\n.js', /control character/],
      ['src/a\u007f.js', /control character/],
      [Array.from({ length: 33 }, () => 'd').join('/'), /32 components/],
      ['a//b', /empty, \. or \.\. component/],
      ['./a', /empty, \. or \.\. component/],
      ['../outside.txt', /empty, \. or \.\. component/],
      ['a/../../b', /empty, \. or \.\. component/],
      ['a'.repeat(256), /component is at most 255 bytes/],
      ['.git/config', /\.git/],
      ['sub/.GIT/hooks/pre-commit', /\.git/],
      ['.Git', /\.git/],
    ]
    for (const [path, rule] of cases) {
      expect(pathProblem(path), JSON.stringify(path)).toMatch(rule)
    }
  })
})

/** git with the test's own identity, ignoring the machine's configuration (Global Constraints). */
const ENV = {
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
}
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, env: ENV }).toString()
const at = (gitDir: string, ...args: string[]): Buffer =>
  execFileSync('git', ['--git-dir', gitDir, ...args], { env: ENV })
const ADA = { name: 'Ada Lovelace', email: 'u1@users.manifest.internal' }
const scratchDirs = () =>
  new Set(readdirSync(tmpdir()).filter((n) => n.startsWith('manifest-commit-')))

describe('buildCommit — no worktree, the objects borrowed, the tree exactly the plan (Decision 1)', () => {
  let root: string
  let bare: string
  let base: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mf-plumbing-'))
    bare = join(root, 'r.git')
    const work = join(root, 'work')
    git(root, 'init', '-q', '--bare', '--initial-branch=main', bare)
    git(root, 'init', '-q', '--initial-branch=main', work)
    writeFileSync(join(work, 'README.md'), 'readme\n')
    execFileSync('mkdir', ['-p', join(work, 'src')])
    writeFileSync(join(work, 'src', 'a.js'), 'a\n')
    writeFileSync(join(work, 'run.sh'), '#!/bin/sh\n')
    chmodSync(join(work, 'run.sh'), 0o755)
    writeFileSync(join(work, '.gitattributes'), '* text eol=crlf filter=evil\n')
    git(work, 'add', '-A')
    git(
      work,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.org',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      'base',
    )
    git(work, 'push', '-q', bare, 'HEAD:refs/heads/main')
    base = at(bare, 'rev-parse', 'refs/heads/main').toString().trim()
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('builds a commit whose tree is exactly the plan, from a bare repository whose objects it borrows', async () => {
    const built = await buildCommit({
      objects: bare,
      base,
      changes: [
        { op: 'write', path: 'README.md', content: 'changed\n' },
        { op: 'write', path: 'src/b.js', content: 'b\n' },
        { op: 'delete', path: 'src/a.js' },
      ],
      message: 'three changes',
      author: ADA,
    })
    try {
      expect(built.parent).toBe(base)
      expect(built.changes).toEqual([
        { path: 'README.md', status: 'modified' },
        { path: 'src/b.js', status: 'added' },
        { path: 'src/a.js', status: 'deleted' },
      ])
      const tree = at(built.gitDir, 'ls-tree', '-r', built.commit)
        .toString()
        .trim()
        .split('\n')
        .map((line) => {
          const [meta, path] = line.split('\t') as [string, string]
          return `${meta.split(' ')[0]} ${path}`
        })
      expect(tree).toEqual([
        '100644 .gitattributes',
        '100644 README.md',
        '100755 run.sh',
        '100644 src/b.js',
      ])
      expect(at(built.gitDir, 'show', `${built.commit}:README.md`).toString()).toBe(
        'changed\n',
      )
      expect(
        at(built.gitDir, 'log', '-1', '--format=%P|%an <%ae>|%cn <%ce>|%s', built.commit)
          .toString()
          .trim(),
      ).toBe(
        `${base}|${ADA.name} <${ADA.email}>|${MANIFEST_COMMITTER.name} <${MANIFEST_COMMITTER.email}>|three changes`,
      )
      // BUILDING PUSHES NOTHING: the repository's main has not moved, and it lacks the commit.
      expect(at(bare, 'rev-parse', 'refs/heads/main').toString().trim()).toBe(base)
      expect(() => at(bare, 'cat-file', '-e', `${built.commit}^{commit}`)).toThrow()
      // NOTHING COPIED: the scratch repository names the repository's objects as its alternate,
      // and holds no copy of the base commit — while still reading it.
      expect(
        readFileSync(join(built.gitDir, 'objects', 'info', 'alternates'), 'utf8'),
      ).toBe(`${join(bare, 'objects')}\n`)
      expect(
        existsSync(join(built.gitDir, 'objects', base.slice(0, 2), base.slice(2))),
      ).toBe(false)
      expect(at(built.gitDir, 'cat-file', '-t', base).toString().trim()).toBe('commit')
    } finally {
      await built.dispose()
    }
    expect(existsSync(built.gitDir)).toBe(false)
  })

  it('refuses a commit that changes nothing, and leaves no scratch directory behind', async () => {
    const before = scratchDirs()
    const refused = await buildCommit({
      objects: bare,
      base,
      changes: [{ op: 'write', path: 'README.md', content: 'readme\n' }],
      message: 'nothing',
      author: ADA,
    }).then(
      () => undefined,
      (e: unknown) => (e instanceof SourceError ? e.code : String(e)),
    )
    expect(refused).toBe('SOURCE_NOTHING_TO_COMMIT')
    expect([...scratchDirs()].filter((d) => !before.has(d))).toEqual([])
    // THE PAIR: a build that succeeds DOES hold a scratch directory, until it is disposed.
    const built = await buildCommit({
      objects: bare,
      base,
      changes: [{ op: 'write', path: 'README.md', content: 'other\n' }],
      message: 'something',
      author: ADA,
    })
    expect(existsSync(built.gitDir)).toBe(true)
    await built.dispose()
    expect([...scratchDirs()].filter((d) => !before.has(d))).toEqual([])
  })

  it('writes the exact UTF-8 bytes it was given — no filter, no line-ending change', async () => {
    // The base's own `.gitattributes` asks for `text eol=crlf` and a filter: a worktree's `git
    // add` would normalise CRLF to LF. The bytes written must be the bytes given, exactly.
    const crlf = 'a\r\nb\r\n'
    const accented = 'é — ünïcode\n'
    const built = await buildCommit({
      objects: bare,
      base,
      changes: [
        { op: 'write', path: 'crlf.txt', content: crlf },
        { op: 'write', path: 'src/é.txt', content: accented },
      ],
      message: 'bytes',
      author: ADA,
    })
    try {
      expect(at(built.gitDir, 'show', `${built.commit}:crlf.txt`)).toEqual(
        Buffer.from(crlf, 'utf8'),
      )
      expect(at(built.gitDir, 'show', `${built.commit}:src/é.txt`)).toEqual(
        Buffer.from(accented, 'utf8'),
      )
    } finally {
      await built.dispose()
    }
  })
})

/**
 * F10 (sitting 2): driver 2 cannot read git's exit code — `gitWithToken` answers exit 1 as stdout
 * — so a refused push must be read from porcelain's own line for the ref, and a `[remote
 * rejected]` (a hook, GitHub's GH006, a ref lock lost) must never read as a success.
 */
describe('pushVerdict — what `git push --porcelain` said of main', () => {
  const S = 'a'.repeat(40)
  const said = (line: string) => `To https://git.example/org/app.git\n${line}\nDone\n`
  it('reads a new branch, a fast-forward and an up-to-date ref as ok', () => {
    expect(pushVerdict(said(`*\t${S}:refs/heads/main\t[new branch]`)).verdict).toBe('ok')
    expect(pushVerdict(said(` \t${S}:refs/heads/main\t1111111..2222222`)).verdict).toBe(
      'ok',
    )
    expect(pushVerdict(said(`=\t${S}:refs/heads/main\t[up to date]`)).verdict).toBe('ok')
  })
  it('reads git’s refusal of a moved branch as a conflict', () => {
    expect(
      pushVerdict(said(`!\t${S}:refs/heads/main\t[rejected] (non-fast-forward)`)).verdict,
    ).toBe('conflict')
    expect(
      pushVerdict(said(`!\t${S}:refs/heads/main\t[rejected] (fetch first)`)).verdict,
    ).toBe('conflict')
  })
  it('reads a REMOTE rejection, and a missing line, as refused — never as ok', () => {
    for (const reason of [
      'pre-receive hook declined',
      'protected branch hook declined',
      'failed to update ref',
    ])
      expect(
        pushVerdict(said(`!\t${S}:refs/heads/main\t[remote rejected] (${reason})`))
          .verdict,
        reason,
      ).toBe('refused')
    expect(pushVerdict('error: failed to push some refs\n').verdict).toBe('refused')
    // Another ref's line is not main's verdict.
    expect(pushVerdict(said(`*\t${S}:refs/heads/other\t[new branch]`)).verdict).toBe(
      'refused',
    )
  })
})
