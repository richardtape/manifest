import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceError } from './git-driver.js'
import {
  describeCommitIn,
  historyIn,
  listTreeIn,
  READ_LIMITS,
  readTextIn,
} from './reading.js'

/**
 * EVERY `git` `reading.ts` RUNS, by argv — so a test can say a blob was NEVER READ, which no
 * answer can show (the plan's Task 4, Step 2: a file past 1 MiB is refused from its SIZE).
 */
const calls = vi.hoisted(() => [] as string[][])
vi.mock('./plumbing.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./plumbing.js')>()
  return {
    ...real,
    runGit: (...args: Parameters<typeof real.runGit>) => {
      calls.push([...args[1]])
      return real.runGit(...args)
    },
  }
})

const ENV = {
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  LC_ALL: 'C',
  GIT_AUTHOR_NAME: 'Ada Lovelace',
  GIT_AUTHOR_EMAIL: 'ada@example.org',
  GIT_COMMITTER_NAME: 'Ada Lovelace',
  GIT_COMMITTER_EMAIL: 'ada@example.org',
}

let dir: string
let git: string
const g = (
  args: string[],
  input?: string | Buffer,
  env: Record<string, string> = {},
): string =>
  execFileSync('git', ['--git-dir', git, ...args], {
    env: { ...ENV, ...env },
    input: input ?? '',
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString('utf8')
    .trim()
const blob = (bytes: string | Buffer) => g(['hash-object', '-w', '--stdin'], bytes)
/** A tree from `mode type sha\tname` lines — one level; a subtree is its own `tree()`. */
const tree = (entries: [mode: string, sha: string, name: string][]) =>
  g(
    ['mktree', '-z'],
    entries
      .map(
        ([mode, sha, name]) =>
          `${mode} ${mode === '040000' ? 'tree' : mode === '160000' ? 'commit' : 'blob'} ${sha}\t${name}\0`,
      )
      .join(''),
  )
/** A commit; `at` (seconds) fixes its dates, which is what orders `git log`'s walk. */
const commit = (t: string, parents: string[], message: string, at?: number) =>
  g(
    ['commit-tree', t, ...parents.flatMap((p) => ['-p', p]), '-F', '-'],
    message,
    at === undefined
      ? {}
      : { GIT_AUTHOR_DATE: `@${at} +0000`, GIT_COMMITTER_DATE: `@${at} +0000` },
  )

const code = async (p: Promise<unknown>): Promise<string | undefined> => {
  try {
    await p
    return undefined
  } catch (e) {
    return e instanceof SourceError ? e.code : `not a SourceError: ${String(e)}`
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'manifest-reading-'))
  git = join(dir, 'r.git')
  execFileSync('git', ['init', '-q', '--bare', git], { env: ENV })
  calls.length = 0
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('readTextIn — the bytes, exactly, or a refusal by its own code (Task 4)', () => {
  it('refuses bytes that are not UTF-8 — a Latin-1 file is never decoded with replacement characters', async () => {
    const text = blob('plain\n')
    const latin1 = blob(Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a])) // "café\n" in Latin-1
    const c = commit(
      tree([
        ['100644', text, 'ok.txt'],
        ['100644', latin1, 'latin1.txt'],
      ]),
      [],
      'x',
    )
    // The positive control, in the same repository: a UTF-8 file reads.
    expect((await readTextIn(git, c, 'ok.txt')).content).toBe('plain\n')
    expect(await code(readTextIn(git, c, 'latin1.txt'))).toBe('SOURCE_FILE_NOT_TEXT')
  })

  it('keeps a byte-order mark and CRLF line endings — content is the bytes, exactly', async () => {
    const bytes = Buffer.from('﻿line one\r\nline two\r\n', 'utf8')
    const c = commit(tree([['100644', blob(bytes), 'bom.txt']]), [], 'x')
    const file = await readTextIn(git, c, 'bom.txt')
    expect(Buffer.from(file.content, 'utf8').equals(bytes)).toBe(true)
    expect(file.size).toBe(bytes.length)
  })

  it('refuses a file past 1 MiB from its SIZE — its blob is never read', async () => {
    const big = blob('a'.repeat(READ_LIMITS.fileBytes + 1))
    const small = blob('a'.repeat(READ_LIMITS.fileBytes))
    const c = commit(
      tree([
        ['100644', big, 'big.txt'],
        ['100644', small, 'limit.txt'],
      ]),
      [],
      'x',
    )
    calls.length = 0
    expect(await code(readTextIn(git, c, 'big.txt'))).toBe('SOURCE_FILE_TOO_LARGE')
    expect(calls.filter((a) => a.includes('cat-file'))).toEqual([])
    // The positive control: exactly 1 MiB reads, and IS read from its blob.
    expect((await readTextIn(git, c, 'limit.txt')).size).toBe(READ_LIMITS.fileBytes)
    expect(calls.filter((a) => a.includes('cat-file'))).toHaveLength(1)
  })

  it('reads EXACTLY the path asked — never a pathspec, another case, or a directory’s contents', async () => {
    const readme = blob('hi\n')
    const src = tree([['100644', blob('a\n'), 'index.js']])
    const c = commit(
      tree([
        ['100644', readme, 'README.md'],
        ['040000', src, 'src'],
      ]),
      [],
      'x',
    )
    expect((await readTextIn(git, c, 'README.md')).content).toBe('hi\n')
    // `ls-tree` reads a path as a pathspec unless told otherwise: `:(top)` is magic, and
    // `src/` lists what is IN `src` (measured, git 2.50.1). None of these is a file here.
    for (const path of [':(top)README.md', 'readme.md', '*.md', 'src/', 'src/*']) {
      expect(await code(readTextIn(git, c, path)), path).toBe('SOURCE_PATH_NOT_FOUND')
    }
    expect(await code(readTextIn(git, c, 'src'))).toBe('SOURCE_PATH_NOT_A_FILE')
  })
})

describe('listTreeIn — every entry, sorted by path, and bounded (Task 4)', () => {
  it('sorts by PATH, where git’s own order is not — `src.txt` before `src/` in a tree', async () => {
    const c = commit(
      tree([
        ['100644', blob('x'), 'src.txt'],
        ['040000', tree([['100644', blob('a\n'), 'a.js']]), 'src'],
      ]),
      [],
      'x',
    )
    const { entries } = await listTreeIn(git, c)
    expect(entries.map((e) => e.path)).toEqual(['src', 'src.txt', 'src/a.js'])
  })

  it('lists the first 10,000 entries by path, and says it stopped', async () => {
    const one = blob('x\n')
    const names = Array.from(
      { length: READ_LIMITS.treeEntries + 1 },
      (_, i) => `f${String(i).padStart(5, '0')}.txt`,
    )
    const c = commit(tree(names.map((n) => ['100644', one, n])), [], 'x')
    const { entries, truncated } = await listTreeIn(git, c)
    expect(truncated).toBe(true)
    expect(entries).toHaveLength(READ_LIMITS.treeEntries)
    expect(entries.at(-1)!.path).toBe(names[READ_LIMITS.treeEntries - 1])
  })

  it('flags binaries among the LISTED paths only — never a diff of the whole tree (F9)', async () => {
    // 12,000 files; the listing stops at 10,000. One binary file is listed, one is past the cut.
    const text = blob('x\n')
    const bytes = blob(Buffer.from([0x89, 0x50, 0x00, 0x01]))
    const names = Array.from({ length: 12_000 }, (_, i) => {
      const n = String(i).padStart(5, '0')
      return i === 5 || i === 11_000 ? `f${n}.png` : `f${n}.txt`
    })
    const c = commit(
      tree(names.map((n) => ['100644', n.endsWith('.png') ? bytes : text, n])),
      [],
      'x',
    )
    calls.length = 0
    const { entries, truncated } = await listTreeIn(git, c)
    expect(truncated).toBe(true)
    expect(entries).toHaveLength(READ_LIMITS.treeEntries)
    const byName = new Map(entries.map((e) => [e.path, e.binary]))
    expect(byName.get('f00005.png')).toBe(true) // listed, binary: flagged
    expect(byName.get('f00001.txt')).toBe(false)
    expect(byName.has('f11000.png')).toBe(false) // past the cut: not listed
    // Every numstat names its paths, and together they are exactly the listed files.
    const numstats = calls.filter((a) => a.includes('--numstat'))
    expect(numstats.length).toBeGreaterThan(0)
    const asked = numstats.flatMap((a) => {
      expect(a).toContain('--') // never the whole tree
      return a.slice(a.indexOf('--') + 1)
    })
    expect(asked.sort()).toEqual(entries.map((e) => e.path).sort())
    expect(asked).not.toContain('f11000.png')
  })

  it('names no path on this machine when listing the base fails (F10)', async () => {
    // The race F10 names: the repository gone between the commit's check and `ls-tree`. git's
    // own words then carry the directory — `not a git repository: '/…/r.git'`.
    const c = commit(tree([['100644', blob('x'), 'a.txt']]), [], 'x')
    rmSync(git, { recursive: true, force: true })
    let error: unknown
    try {
      await listTreeIn(git, c)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(SourceError)
    expect((error as SourceError).code).toBe('SOURCE_GIT_FAILED')
    expect((error as SourceError).message).toContain('<repository>') // git's words, scrubbed
    expect((error as SourceError).message).not.toContain(dir)
  })

  it('reports a submodule as one, with no size and no binary flag', async () => {
    const c = commit(tree([['160000', 'c'.repeat(40), 'vendor']]), [], 'x')
    expect((await listTreeIn(git, c)).entries).toEqual([
      { path: 'vendor', type: 'submodule', mode: '160000', size: null, binary: null },
    ])
  })
})

describe('historyIn — newest first, a page and a cursor, and never an address (Task 4)', () => {
  it('answers a root commit with no parents, and cuts a long message', async () => {
    const t = tree([['100644', blob('x'), 'a.txt']])
    const long = `subject line\n\n${'é'.repeat(READ_LIMITS.messageChars + 10)}`
    const root = commit(t, [], long)
    const { commits, next } = await historyIn(git, root, 30)
    expect(next).toBeNull()
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({
      commitSha: root,
      parents: [],
      subject: 'subject line',
      messageTruncated: true,
      authorName: 'Ada Lovelace',
    })
    expect([...commits[0]!.message]).toHaveLength(READ_LIMITS.messageChars)
    expect(JSON.stringify(commits)).not.toContain('ada@example.org')
  })

  it('pages a history with a merge to its end without losing a commit — the FIRST-PARENT walk', async () => {
    // main: base → a → merge(a, side); `side` branched from base and is NEWER than `a`, so a
    // walk of BOTH parents by date reads merge, side, a, base — and a page that ends at the
    // merge hands `side` as the cursor, whose own history never reaches `a` (sitting 3).
    const t = (name: string) => tree([['100644', blob(`${name}\n`), `${name}.txt`]])
    const base = commit(t('base'), [], 'base', 1_000)
    const a = commit(t('a'), [base], 'a', 2_000)
    const side = commit(t('side'), [base], 'side', 3_000)
    const merge = commit(t('merge'), [a, side], 'merge', 4_000)
    const whole = (await historyIn(git, merge, 100)).commits.map((c) => c.commitSha)
    const paged: string[] = []
    for (let from: string | null = merge; from !== null;) {
      const page = await historyIn(git, from, 1)
      paged.push(...page.commits.map((c) => c.commitSha))
      from = page.next
    }
    expect(paged).toEqual(whole)
    // …and the walk is main's own: each merge once, as `describeCommit` describes it.
    expect(whole).toEqual([merge, a, base])
  })

  it('refuses a starting point that is not a commit id before git sees it', async () => {
    const root = commit(tree([['100644', blob('x'), 'a.txt']]), [], 'x')
    expect((await historyIn(git, root, 1)).commits).toHaveLength(1)
    calls.length = 0
    expect(await code(historyIn(git, '--all', 1))).toBe('SOURCE_COMMIT_NOT_FOUND')
    expect(calls).toEqual([])
  })
})

describe('describeCommitIn — against the first parent, with a patch budget (Task 4)', () => {
  it('describes a merge against its FIRST parent', async () => {
    const base = commit(tree([['100644', blob('base\n'), 'a.txt']]), [], 'base')
    const ours = commit(
      tree([
        ['100644', blob('base\n'), 'a.txt'],
        ['100644', blob('ours\n'), 'ours.txt'],
      ]),
      [base],
      'ours',
    )
    const theirs = commit(
      tree([
        ['100644', blob('base\n'), 'a.txt'],
        ['100644', blob('theirs\n'), 'theirs.txt'],
      ]),
      [base],
      'theirs',
    )
    const merge = commit(
      tree([
        ['100644', blob('base\n'), 'a.txt'],
        ['100644', blob('ours\n'), 'ours.txt'],
        ['100644', blob('theirs\n'), 'theirs.txt'],
      ]),
      [ours, theirs],
      'merge',
    )
    const d = await describeCommitIn(git, merge)
    expect(d.parents).toEqual([ours, theirs])
    expect(d.changes.map((c) => [c.path, c.status])).toEqual([['theirs.txt', 'added']])
  })

  it('describes a root commit against the empty tree, and a binary file with no patch', async () => {
    const root = commit(
      tree([
        ['100644', blob('a\n'), 'a.txt'],
        ['100644', blob(Buffer.from([0x89, 0x50, 0x00, 0x01])), 'logo.png'],
      ]),
      [],
      'root',
    )
    const d = await describeCommitIn(git, root)
    expect(d.changes).toEqual([
      expect.objectContaining({
        path: 'a.txt',
        status: 'added',
        binary: false,
        additions: 1,
      }),
      {
        path: 'logo.png',
        status: 'added',
        binary: true,
        additions: null,
        deletions: null,
        patch: null,
      },
    ])
    expect(d.changes[0]!.patch).toContain('+a')
  })

  it('answers at most 1,000 changes, the first by path, and says it stopped (F9)', async () => {
    // Binary files, so no patch is read — only the listing and its counts are under test.
    const bytes = blob(Buffer.from([0x89, 0x50, 0x00, 0x01]))
    const names = Array.from(
      { length: 1_500 },
      (_, i) => `f${String(i).padStart(4, '0')}.png`,
    )
    const c = commit(tree(names.map((n) => ['100644', bytes, n])), [], 'x')
    calls.length = 0
    const d = await describeCommitIn(git, c)
    expect(d.truncated).toBe(true)
    expect(d.changes).toHaveLength(1_000)
    expect(d.changes.at(-1)!.path).toBe('f0999.png')
    expect(d.changes.every((ch) => ch.binary && ch.patch === null)).toBe(true)
    // The counts are read for the listed paths only.
    const asked = calls
      .filter((a) => a.includes('--numstat'))
      .flatMap((a) => a.slice(a.indexOf('--') + 1))
    expect(asked).toHaveLength(1_000)
    expect(asked).not.toContain('f1000.png')
    // The positive control: a commit of three says it did not stop.
    const small = commit(
      tree(names.slice(0, 3).map((n) => ['100644', bytes, n])),
      [],
      'y',
    )
    const s = await describeCommitIn(git, small)
    expect(s.truncated).toBe(false)
    expect(s.changes).toHaveLength(3)
  })

  it('reports a file that became a symlink as type_changed, and a deletion', async () => {
    const t1 = tree([
      ['100644', blob('a\n'), 'a.txt'],
      ['100644', blob('gone\n'), 'gone.txt'],
    ])
    const c1 = commit(t1, [], 'one')
    const c2 = commit(tree([['120000', blob('elsewhere'), 'a.txt']]), [c1], 'two')
    const d = await describeCommitIn(git, c2)
    expect(d.changes.map((c) => [c.path, c.status])).toEqual([
      ['a.txt', 'type_changed'],
      ['gone.txt', 'deleted'],
    ])
  })

  it('stops giving patches once 256 KiB of patch has been given, and says so', async () => {
    // Each file's patch is ~100 KiB: two fit the budget, the third does not — and the
    // fourth, small enough to fit what is left, gets none either: once spent, spent.
    const line = `${'x'.repeat(99)}\n`
    const big = line.repeat(1000) // 100,000 bytes
    const c1 = commit(tree([['100644', blob('0\n'), 'z-first.txt']]), [], 'one')
    const c2 = commit(
      tree([
        ['100644', blob(big), 'a.txt'],
        ['100644', blob(big), 'b.txt'],
        ['100644', blob(big), 'c.txt'],
        ['100644', blob('small\n'), 'd.txt'],
        ['100644', blob('0\n'), 'z-first.txt'],
      ]),
      [c1],
      'two',
    )
    const d = await describeCommitIn(git, c2)
    expect(d.patchesTruncated).toBe(true)
    expect(d.changes.map((c) => [c.path, c.patch === null])).toEqual([
      ['a.txt', false],
      ['b.txt', false],
      ['c.txt', true],
      ['d.txt', true],
    ])
    const given = d.changes.reduce((n, c) => n + Buffer.byteLength(c.patch ?? ''), 0)
    expect(given).toBeLessThanOrEqual(READ_LIMITS.patchBytes)
    // Counts are git's, budget or not.
    expect(d.changes[2]).toMatchObject({ additions: 1000, deletions: 0, binary: false })
  })
})
