import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SAMPLE_SECRETS } from '../build/testing.js'
import { SourceError, type SourceDriver } from './git-driver.js'
import { writeFiles } from './testing.js'

/** What one driver's run of the suite is handed (this plan's Task 2). */
export interface SourceDriverHarness {
  driver: SourceDriver
  /** Pushes a commit to `main` the way a PERSON would, outside the driver. Returns its sha. */
  pushAsPerson(
    slug: string,
    files: Record<string, string>,
    message: string,
  ): Promise<string>
  /**
   * A PERSON rewriting `main` (an amend, force-pushed) and deleting it, outside the driver —
   * each answering whether the host TOOK it, and what it said (Task 12).
   */
  forcePushMainAsPerson(slug: string): Promise<{ ok: boolean; said: string }>
  deleteMainAsPerson(slug: string): Promise<{ ok: boolean; said: string }>
  /**
   * A PERSON pushing a SYMLINK to `main` — `path` → `target` — outside the driver (the
   * authoring API plan's Task 3). Returns the commit.
   */
  pushSymlinkAsPerson(
    slug: string,
    path: string,
    target: string,
    message: string,
  ): Promise<string>
  cleanup(): Promise<void>
}

const ADA = { name: 'Ada Lovelace', email: 'u1@users.manifest.internal' }

const SEED = {
  'manifest.yaml':
    'manifest: 1\nname: chem-labs\nblueprint: fixture-node@1\nruntime:\n  port: 3000\n',
  'src/index.js': "console.log('hello')\n",
}

/** The code a driver refused with — or which non-`SourceError` it threw, or none. */
async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p
    return undefined
  } catch (e) {
    return e instanceof SourceError ? e.code : `not a SourceError: ${String(e)}`
  }
}

/**
 * THE D5 SEAM'S CONTRACT (the D5 plan's Task 2). Every source driver runs it — driver 1 in
 * `local-driver.test.ts`, driver 2 in `github/driver.test.ts` against the in-process fake.
 * A case here is a promise the CONTROL PLANE relies on; a driver-specific promise goes in
 * that driver's own file.
 *
 * **`extra` is where a case only one driver can keep goes** — Task 7 adds driver 2's
 * *"after a rewrite and a normal push, `headCommit` answers the push"* (sitting 1's F6)
 * there, inside this `describe`, so it runs with the same harness and the same cleanup.
 */
export function describeSourceDriver(
  name: string,
  make: () => Promise<SourceDriverHarness>,
  extra?: (harness: () => SourceDriverHarness) => void,
): void {
  describe(`the ${name} source driver keeps D5's contract`, () => {
    let h: SourceDriverHarness
    beforeEach(async () => {
      h = await make()
    })
    afterEach(async () => {
      await h.cleanup()
    })

    it('creates a repository seeded with the files it was given, and names it by slug and provider', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      expect(repo).toEqual({ projectSlug: 'chem-labs', provider: h.driver.name })
      const sha = await h.driver.headCommit(repo)
      expect(sha).toMatch(/^[0-9a-f]{40}$/)
      expect(await h.driver.readFile(repo, sha, 'manifest.yaml')).toContain(
        'name: chem-labs',
      )
      expect(await h.driver.readFile(repo, sha, 'not-there.yaml')).toBeNull()
    })

    /**
     * THE REPOSITORY LINK (Task 12, Decision 15): where the code lives, for a client — and
     * whether `main` is protected there, which on this suite's hosts it is: git's own
     * configuration on driver 1, a team-plan organisation on driver 2.
     */
    it('answers a LINK with the repository: its provider, its name, and main protected (Task 12)', async () => {
      const created = await h.driver.createRepository('chem-labs', SEED)
      expect(created.link).toEqual({
        provider: h.driver.name,
        fullName: expect.stringMatching(/chem-labs$/),
        webUrl:
          h.driver.name === 'local'
            ? null
            : expect.stringMatching(/^https?:\/\/.+chem-labs$/),
        mainProtected: true,
        protectionDetail: null,
      })
    })

    /**
     * §13's buildable history, where the code lives (Decision 13): a person can NEITHER rewrite
     * `main` NOR delete it — refused by git's configuration on driver 1 and by the host's
     * branch protection on driver 2 — and a normal push still lands (the positive control).
     */
    it('a person cannot force-push main, or delete it — and a normal push still lands (Task 12)', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const head = await h.driver.headCommit(repo)
      const forced = await h.forcePushMainAsPerson('chem-labs')
      expect(forced.ok, forced.said).toBe(false)
      const deleted = await h.deleteMainAsPerson('chem-labs')
      expect(deleted.ok, deleted.said).toBe(false)
      expect(await h.driver.headCommit(repo)).toBe(head)
      const pushed = await h.pushAsPerson('chem-labs', { 'n.txt': 'n\n' }, 'normal')
      expect(await h.driver.headCommit(repo)).toBe(pushed)
    })

    it('names a repository it already made the same way it named it at creation', async () => {
      const { ref: created } = await h.driver.createRepository('chem-labs', SEED)
      expect(h.driver.repositoryFor('chem-labs')).toEqual(created)
    })

    it('reads a file AT a commit, not at HEAD', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const first = await h.driver.headCommit(repo)
      const second = await writeFiles(
        h.driver,
        repo,
        { 'manifest.yaml': 'manifest: 1\nname: renamed\n' },
        'edit',
      )
      expect(second).not.toBe(first)
      expect(await h.driver.headCommit(repo)).toBe(second)
      expect(await h.driver.readFile(repo, first, 'manifest.yaml')).toContain(
        'name: chem-labs',
      )
      expect(await h.driver.readFile(repo, second, 'manifest.yaml')).toContain(
        'name: renamed',
      )
    })

    it('sees a commit a PERSON pushed outside the driver', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const before = await h.driver.headCommit(repo)
      const pushed = await h.pushAsPerson(
        'chem-labs',
        { 'README.md': 'by hand\n' },
        'a person pushed this',
      )
      expect(pushed).not.toBe(before)
      expect(await h.driver.headCommit(repo)).toBe(pushed)
      expect(await h.driver.readFile(repo, pushed, 'README.md')).toBe('by hand\n')
    })

    it('hands the builder a local bare repository that holds the commit', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const sha = await h.driver.headCommit(repo)
      const local = await h.driver.localGitDir(repo, sha)
      expect(local.commitSha).toBe(sha)
      // What the builder runs (build/context.ts): it must succeed against this directory.
      expect(
        execFileSync('git', ['--git-dir', local.gitDir, 'cat-file', '-t', sha])
          .toString()
          .trim(),
      ).toBe('commit')
    })

    it('refuses a commit the repository does not have, with its code', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      expect(await code(h.driver.localGitDir(repo, 'f'.repeat(40)))).toBe(
        'SOURCE_COMMIT_NOT_FOUND',
      )
    })

    /**
     * A build names a COMMIT, and the builder archives what it is told. A revision
     * expression such as `main` would build whatever `main` points at when the build
     * starts, rather than what was validated — so only a full commit id is a commit id.
     */
    it('refuses a symbolic name where a commit id belongs', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const head = await h.driver.headCommit(repo)
      expect((await h.driver.localGitDir(repo, head)).commitSha).toBe(head) // positive control
      for (const name of [
        'main',
        'HEAD',
        'HEAD~0',
        head.slice(0, 12),
        `${head}^{commit}`,
      ])
        expect(await code(h.driver.localGitDir(repo, name))).toBe(
          'SOURCE_COMMIT_NOT_FOUND',
        )
    })

    /**
     * A read at a commit the repository does not have is NOT "no such file" (the D5 plan's
     * Task 7). Answered as `null`, the validate route would record an invalid spec for a
     * commit it never read — and on driver 2 a commit GitHub has and the mirror lacks is
     * exactly that. A symbolic name is refused as `localGitDir` refuses it: on driver 2,
     * `main` in the mirror is the history keeper, which a rewrite freezes (sitting 1's F6).
     */
    it('refuses to read at a commit the repository does not have, and at a name that is not a commit', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const head = await h.driver.headCommit(repo)
      expect(await h.driver.readFile(repo, head, 'manifest.yaml')).toContain('chem-labs') // positive control
      expect(await code(h.driver.readFile(repo, 'f'.repeat(40), 'manifest.yaml'))).toBe(
        'SOURCE_COMMIT_NOT_FOUND',
      )
      for (const name of ['main', 'HEAD', head.slice(0, 12)])
        expect(await code(h.driver.readFile(repo, name, 'manifest.yaml'))).toBe(
          'SOURCE_COMMIT_NOT_FOUND',
        )
    })

    it('lists the default branch', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      expect(await h.driver.listBranches(repo)).toEqual(['main'])
    })

    it('refuses a slug that could escape, and a path that could', async () => {
      for (const slug of ['../escape', 'a/b', '..', '.', 'Chem', 'has_underscore', ''])
        expect(await code(h.driver.createRepository(slug, SEED))).toBe(
          'SOURCE_INVALID_SLUG',
        )
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      expect(
        await code(writeFiles(h.driver, repo, { '../outside.txt': 'x' }, 'escape')),
      ).toBe('SOURCE_PATH_ESCAPE')
    })

    /**
     * THE WORKTREE'S OWN `.git` IS NOT A PLACE TO WRITE (the D5 plan's final review, Important
     * 1). A path that stays INSIDE the worktree can still be `.git/config`, and
     * `core.fsmonitor = <command>` there runs as the control plane on the very next `git add`.
     * macOS's filesystem ignores case, so `.GIT/…` is the same file. Nothing supplies an
     * arbitrary path yet; the authoring API's commits will.
     */
    it('refuses a path into the worktree’s own .git, in any case, and writes nothing', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const before = await h.driver.headCommit(repo)
      for (const path of [
        '.git/config',
        '.GIT/hooks/post-commit',
        'sub/.git/config',
        '.Git',
      ]) {
        expect(
          await code(
            writeFiles(h.driver, repo, { [path]: '[core]\n\tfsmonitor = true\n' }, 'x'),
          ),
          path,
        ).toBe('SOURCE_PATH_ESCAPE')
      }
      expect(
        await code(h.driver.createRepository('chem-seed', { '.git/config': 'x' })),
      ).toBe('SOURCE_PATH_ESCAPE')
      expect(await h.driver.headCommit(repo)).toBe(before)
      // The positive control: names that merely START with `.git` are ordinary files.
      const sha = await writeFiles(
        h.driver,
        repo,
        { '.gitignore': 'node_modules\n', '.github/CODEOWNERS': '* @x\n' },
        'dotfiles',
      )
      expect(await h.driver.readFile(repo, sha, '.github/CODEOWNERS')).toBe('* @x\n')
    })

    /**
     * §20, as applied (Spec action 1, option (a)): *a push Manifest makes is scanned before it
     * leaves and refused*. Refused with its OWN code before anything is written — on driver 1
     * the repository's hook would refuse the push anyway, but as `SOURCE_GIT_FAILED` carrying
     * git's stderr; the early scan is what makes it a `409` a client can act on, the same on
     * both drivers (the D5 plan's Task 11).
     */
    it('refuses to commit a secret, and the head does not move (Task 11, §20)', async () => {
      const key = SAMPLE_SECRETS['an AWS access key id']
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const head = await h.driver.headCommit(repo)
      const refused = await writeFiles(
        h.driver,
        repo,
        { 'config/keys.js': `const a = 1\nconst k = '${key}'\n` },
        'oops',
      ).then(
        () => undefined,
        (e: unknown) => e,
      )
      expect(refused).toBeInstanceOf(SourceError)
      expect((refused as SourceError).code).toBe('SOURCE_SECRET_DETECTED')
      expect((refused as SourceError).message).toContain('config/keys.js:2')
      expect((refused as SourceError).message).toContain('an AWS access key id')
      expect((refused as SourceError).message).not.toContain(key)
      expect(await h.driver.headCommit(repo)).toBe(head)
      // The positive control: the same commit without the key moves the head.
      const clean = await writeFiles(
        h.driver,
        repo,
        { 'config/keys.js': 'const a = 1\n' },
        'ok',
      )
      expect(await h.driver.headCommit(repo)).toBe(clean)
      // A SEED carrying one is refused the same way — and leaves NOTHING behind, so the same
      // slug is then created cleanly.
      expect(
        await code(
          h.driver.createRepository('bio-labs', { ...SEED, '.env': `AWS=${key}\n` }),
        ),
      ).toBe('SOURCE_SECRET_DETECTED')
      const { ref: created } = await h.driver.createRepository('bio-labs', SEED)
      expect(created).toEqual({ projectSlug: 'bio-labs', provider: h.driver.name })
    })

    it('commits writes and deletions against main, and answers the commit and what changed (Task 3)', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const base = await h.driver.headCommit(repo)
      const r = await h.driver.commit(repo, {
        base,
        changes: [
          { op: 'write', path: 'src/new.js', content: 'n\n' },
          { op: 'delete', path: 'src/index.js' },
        ],
        message: 'add new.js, remove index.js',
        author: ADA,
      })
      expect(r.commitSha).toMatch(/^[0-9a-f]{40}$/)
      expect(r.parent).toBe(base)
      expect(r.changes).toEqual([
        { path: 'src/new.js', status: 'added' },
        { path: 'src/index.js', status: 'deleted' },
      ])
      expect(await h.driver.headCommit(repo)).toBe(r.commitSha)
      expect(await h.driver.readFile(repo, r.commitSha!, 'src/index.js')).toBeNull()
      expect(await h.driver.readFile(repo, r.commitSha!, 'src/new.js')).toBe('n\n')
    })

    it('refuses a stale base with SOURCE_CONFLICT, and main does not move', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const base = await h.driver.headCommit(repo)
      const moved = await h.pushAsPerson('chem-labs', { 'b.txt': 'b\n' }, 'a person')
      expect(
        await code(
          h.driver.commit(repo, {
            base,
            changes: [{ op: 'write', path: 'c.txt', content: 'c' }],
            message: 'm',
            author: ADA,
          }),
        ),
      ).toBe('SOURCE_CONFLICT')
      expect(await h.driver.headCommit(repo)).toBe(moved)
    })

    it('refuses a write under a symlink a person pushed, and writes nothing outside (Read this first 1)', async () => {
      const outside = mkdtempSync(join(tmpdir(), 'mf-outside-'))
      try {
        const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
        const head = await h.pushSymlinkAsPerson(
          'chem-labs',
          'out',
          outside,
          'a symlink out',
        )
        expect(
          await code(
            h.driver.commit(repo, {
              base: head,
              changes: [{ op: 'write', path: 'out/pwned.txt', content: 'x' }],
              message: 'm',
              author: ADA,
            }),
          ),
        ).toBe('SOURCE_PATH_CONFLICT')
        expect(existsSync(join(outside, 'pwned.txt'))).toBe(false)
        expect(await h.driver.headCommit(repo)).toBe(head)
      } finally {
        rmSync(outside, { recursive: true, force: true })
      }
    })

    it('refuses a write through a symlink to .git, and runs no command (Read this first 1)', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'mf-marker-'))
      const marker = join(dir, 'FSMONITOR-RAN')
      try {
        const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
        const head = await h.pushSymlinkAsPerson(
          'chem-labs',
          'meta',
          '.git',
          'a symlink to .git',
        )
        const config = `[core]\n\tfsmonitor = touch ${marker}; false\n`
        expect(
          await code(
            h.driver.commit(repo, {
              base: head,
              changes: [{ op: 'write', path: 'meta/config', content: config }],
              message: 'm',
              author: ADA,
            }),
          ),
        ).toBe('SOURCE_PATH_CONFLICT')
        // And a commit that DOES land afterwards runs nothing either — no worktree, no git add.
        await h.driver.commit(repo, {
          base: head,
          changes: [{ op: 'write', path: 'ok.txt', content: 'ok' }],
          message: 'm',
          author: ADA,
        })
        expect(existsSync(marker)).toBe(false)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('refuses a file where a directory is and a directory where a file is — which --index-info would have done by deleting (Read this first 3)', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const head = await h.driver.headCommit(repo)
      expect(
        await code(
          h.driver.commit(repo, {
            base: head,
            changes: [{ op: 'write', path: 'src', content: 'x' }],
            message: 'm',
            author: ADA,
          }),
        ),
      ).toBe('SOURCE_PATH_CONFLICT')
      expect(
        await code(
          h.driver.commit(repo, {
            base: head,
            changes: [{ op: 'write', path: 'manifest.yaml/x', content: 'x' }],
            message: 'm',
            author: ADA,
          }),
        ),
      ).toBe('SOURCE_PATH_CONFLICT')
      expect(await h.driver.headCommit(repo)).toBe(head)
      expect(await h.driver.readFile(repo, head, 'src/index.js')).not.toBeNull()
    })

    it('a dry run answers what would change and moves nothing', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const head = await h.driver.headCommit(repo)
      const r = await h.driver.commit(repo, {
        base: head,
        changes: [{ op: 'write', path: 'd.txt', content: 'd' }],
        message: 'm',
        author: ADA,
        dryRun: true,
      })
      expect(r).toEqual({
        commitSha: null,
        parent: head,
        changes: [{ path: 'd.txt', status: 'added' }],
      })
      expect(await h.driver.headCommit(repo)).toBe(head)
    })

    it('loses a race at the push as SOURCE_CONFLICT — exactly one of two commits lands', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const base = await h.driver.headCommit(repo)
      const one = (p: string) =>
        h.driver.commit(repo, {
          base,
          changes: [{ op: 'write', path: p, content: p }],
          message: p,
          author: ADA,
        })
      const results = await Promise.allSettled([one('a.txt'), one('b.txt')])
      const landed = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      const refused = results.flatMap((r) =>
        r.status === 'rejected' && r.reason instanceof SourceError ? [r.reason.code] : [],
      )
      expect(landed).toHaveLength(1)
      expect(refused).toEqual(['SOURCE_CONFLICT'])
      expect(await h.driver.headCommit(repo)).toBe(landed[0]!.commitSha)
    })

    /**
     * THE READ PRIMITIVES (the authoring API plan's Task 4) — what an agent reads before it
     * writes. A tree is listed AT a commit, a symlink a person pushed is reported as one and
     * never followed, and a binary file is marked so a client can say so rather than show it.
     */
    it('lists a commit’s tree — files, directories, a symlink a person pushed — and marks a binary file (Task 4)', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      await h.pushAsPerson(
        'chem-labs',
        { 'img/logo.bin': 'PNG\u0000\u0001' },
        'a binary file',
      )
      const head = await h.pushSymlinkAsPerson(
        'chem-labs',
        'link',
        'src/index.js',
        'a symlink',
      )
      const { entries, truncated } = await h.driver.listTree(repo, head)
      expect(truncated).toBe(false)
      const by = new Map(entries.map((e) => [e.path, e]))
      expect(by.get('src')).toMatchObject({ type: 'directory', size: null, binary: null })
      expect(by.get('src/index.js')).toMatchObject({
        type: 'file',
        mode: '100644',
        size: "console.log('hello')\n".length,
        binary: false,
      })
      expect(by.get('img/logo.bin')).toMatchObject({ type: 'file', binary: true })
      expect(by.get('link')).toMatchObject({
        type: 'symlink',
        mode: '120000',
        size: 'src/index.js'.length,
        binary: null,
      })
      expect(entries.map((e) => e.path)).toEqual([...entries.map((e) => e.path)].sort())
    })

    it('reads a text file, and refuses what is not one, each by its own code (Task 4)', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      await h.pushAsPerson(
        'chem-labs',
        { 'img/logo.bin': 'PNG\u0000\u0001', 'latin1.txt': 'é' },
        'x',
      )
      const head = await h.pushSymlinkAsPerson(
        'chem-labs',
        'link',
        'src/index.js',
        'a symlink',
      )
      expect(await h.driver.resolveRef(repo, 'main')).toBe(head)
      const file = await h.driver.readText(repo, head, 'src/index.js')
      expect(file).toMatchObject({
        path: 'src/index.js',
        content: "console.log('hello')\n",
        size: 21,
        mode: '100644',
        blobSha: expect.stringMatching(/^[0-9a-f]{40}$/),
      })
      // `pushAsPerson` writes a string as UTF-8, so `é` IS text: the positive control beside
      // the refusals (the invalid-UTF-8 refusal is `reading.test.ts`'s, which writes raw bytes).
      expect((await h.driver.readText(repo, head, 'latin1.txt')).content).toBe('é')
      expect(await code(h.driver.readText(repo, head, 'nope.txt'))).toBe(
        'SOURCE_PATH_NOT_FOUND',
      )
      expect(await code(h.driver.readText(repo, head, 'src'))).toBe(
        'SOURCE_PATH_NOT_A_FILE',
      )
      // A symlink is reported, never followed — its target's text is not what is at `link`.
      expect(await code(h.driver.readText(repo, head, 'link'))).toBe(
        'SOURCE_PATH_NOT_A_FILE',
      )
      expect(await code(h.driver.readText(repo, head, 'img/logo.bin'))).toBe(
        'SOURCE_FILE_NOT_TEXT',
      )
    })

    /**
     * BYTES, EXACTLY (the front-end enablement plan's Task 4, Review Focus 5). `[M11]` measured
     * today's write turning an 18,403-byte PNG into a 33,360-byte blob — every invalid UTF-8
     * sequence became U+FFFD — so the proof is git's own id for the bytes, read back by a person
     * with git, and the bytes themselves.
     */
    it('writes bytes exactly, and a person reads them back with git (the front-end enablement plan’s Task 4)', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const base = await h.driver.headCommit(repo)
      // A PNG's head, then every byte value — most of them no UTF-8 sequence at all.
      const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from(Array.from({ length: 4096 }, (_, i) => 255 - (i % 256))),
      ])
      const r = await h.driver.commit(repo, {
        base,
        changes: [{ op: 'write', path: 'img/logo.png', content: new Uint8Array(png) }],
        message: 'the logo',
        author: ADA,
      })
      expect(r.changes).toEqual([{ path: 'img/logo.png', status: 'added' }])
      const sha = r.commitSha!
      const { gitDir } = await h.driver.localGitDir(repo, sha)
      const git = (args: string[], input?: Buffer) =>
        execFileSync('git', args, {
          ...(input === undefined ? {} : { input }),
          env: {
            PATH: process.env.PATH ?? '/usr/bin:/bin',
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: '/dev/null',
          },
        })
      const blob = git(['--git-dir', gitDir, 'rev-parse', `${sha}:img/logo.png`])
        .toString()
        .trim()
      expect(blob).toBe(git(['hash-object', '--stdin'], png).toString().trim())
      expect(
        git(['--git-dir', gitDir, 'cat-file', 'blob', blob]).equals(png),
        'the blob is the bytes',
      ).toBe(true)
      // …and the driver reads them back the same: bytes, size, mode and id.
      const read = await h.driver.readBytes(repo, sha, 'img/logo.png')
      expect(read.content.equals(png)).toBe(true)
      expect(read).toMatchObject({
        path: 'img/logo.png',
        size: png.length,
        mode: '100644',
        blobSha: blob,
      })
      const { entries } = await h.driver.listTree(repo, sha)
      expect(entries.find((e) => e.path === 'img/logo.png')).toMatchObject({
        type: 'file',
        binary: true,
      })
      // A TEXT write is still its UTF-8 bytes — the positive control beside the bytes.
      const text = await writeFiles(h.driver, repo, { 'src/é.js': 'é\n' }, 'text')
      expect(
        (await h.driver.readBytes(repo, text, 'src/é.js')).content.equals(
          Buffer.from('é\n', 'utf8'),
        ),
      ).toBe(true)
    })

    /**
     * A BINARY WRITE IS SCANNED BY ITS PRINTABLE RUNS (Decision 10). Neither push-time scan reads
     * a binary file — it has no hunk (`scan-commits.ts`, and driver 1's hook) — so each driver's
     * own scan before it writes is what refuses a key pasted into a PDF.
     */
    it('refuses a key in a binary write’s printable text, and the head does not move (Task 4)', async () => {
      const key = SAMPLE_SECRETS['an AWS access key id']
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const base = await h.driver.headCommit(repo)
      const pdf = (inside: string) =>
        new Uint8Array(
          Buffer.concat([
            Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'),
            Buffer.from([0]),
            Buffer.from(inside, 'latin1'),
            Buffer.from([0, 0xff]),
          ]),
        )
      const write = (content: Uint8Array) =>
        h.driver.commit(repo, {
          base,
          changes: [{ op: 'write', path: 'docs/syllabus.pdf', content }],
          message: 'the syllabus',
          author: ADA,
        })
      const refused = await write(pdf(`aws_key ${key} end`)).then(
        () => undefined,
        (e: unknown) => e,
      )
      expect(refused).toBeInstanceOf(SourceError)
      expect((refused as SourceError).code).toBe('SOURCE_SECRET_DETECTED')
      expect((refused as SourceError).message).toContain('docs/syllabus.pdf:1')
      expect((refused as SourceError).message).toContain('an AWS access key id')
      expect((refused as SourceError).message).not.toContain(key)
      expect(await h.driver.headCommit(repo)).toBe(base)
      // The positive control: the same PDF without the key is written.
      const ok = await write(pdf('a syllabus for chemistry 101'))
      expect(await h.driver.headCommit(repo)).toBe(ok.commitSha)
    })

    it('reads any file as bytes up to 2 MiB, and refuses what is not a file or is larger (Task 4)', async () => {
      const MiB = 1024 * 1024
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      await h.pushAsPerson(
        'chem-labs',
        { 'exact.txt': 'a'.repeat(2 * MiB), 'over.txt': 'b'.repeat(2 * MiB + 1) },
        'two large files',
      )
      const head = await h.pushSymlinkAsPerson(
        'chem-labs',
        'link',
        'src/index.js',
        'a symlink',
      )
      // At the limit is read — the positive control beside the refusal one byte past it.
      expect((await h.driver.readBytes(repo, head, 'exact.txt')).size).toBe(2 * MiB)
      expect(await code(h.driver.readBytes(repo, head, 'over.txt'))).toBe(
        'SOURCE_FILE_TOO_LARGE',
      )
      expect(await code(h.driver.readBytes(repo, head, 'nope.bin'))).toBe(
        'SOURCE_PATH_NOT_FOUND',
      )
      expect(await code(h.driver.readBytes(repo, head, 'src'))).toBe(
        'SOURCE_PATH_NOT_A_FILE',
      )
      expect(await code(h.driver.readBytes(repo, head, 'link'))).toBe(
        'SOURCE_PATH_NOT_A_FILE',
      )
      expect(await code(h.driver.readBytes(repo, 'f'.repeat(40), 'src/index.js'))).toBe(
        'SOURCE_COMMIT_NOT_FOUND',
      )
    })

    it('pages the history newest first, and describes one commit’s changes with a patch (Task 4)', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const seed = await h.driver.headCommit(repo)
      const a = await writeFiles(h.driver, repo, { 'a.txt': 'a\n' }, 'add a')
      const b = await writeFiles(h.driver, repo, { 'a.txt': 'a\nb\n' }, 'change a')
      const first = await h.driver.history(repo, b, 1)
      expect(first.commits.map((c) => c.commitSha)).toEqual([b])
      expect(first.next).toBe(a)
      expect(first.commits[0]).toMatchObject({
        subject: 'change a',
        message: 'change a',
        messageTruncated: false,
        parents: [a],
        authorName: 'A Test',
        authoredAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/),
      })
      // Never the author's address: git's can be a person's own.
      expect(JSON.stringify(first)).not.toContain('@')
      const rest = await h.driver.history(repo, first.next!, 30)
      expect(rest.commits.map((c) => c.commitSha)).toEqual([a, seed])
      expect(rest.next).toBeNull()
      expect(rest.commits[1]!.parents).toEqual([])
      const detail = await h.driver.describeCommit(repo, b)
      expect(detail).toMatchObject({
        commitSha: b,
        subject: 'change a',
        patchesTruncated: false,
      })
      expect(detail.changes).toEqual([
        expect.objectContaining({
          path: 'a.txt',
          status: 'modified',
          binary: false,
          additions: 1,
          deletions: 0,
        }),
      ])
      expect(detail.changes[0]!.patch).toContain('+b')
    })

    it('resolves a branch to GitHub’s NOW on driver 2 and to the ref on driver 1, and refuses one that does not exist (Task 4)', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const pushed = await h.pushAsPerson('chem-labs', { 'b.txt': 'b\n' }, 'a person')
      expect(await h.driver.resolveRef(repo, 'main')).toBe(pushed)
      expect(await h.driver.resolveRef(repo, pushed)).toBe(pushed)
      expect(await code(h.driver.resolveRef(repo, 'no-such-branch'))).toBe(
        'SOURCE_REF_NOT_FOUND',
      )
      // A name that begins `-` never reaches git's argv as an option.
      expect(await code(h.driver.resolveRef(repo, '-x'))).toBe('SOURCE_REF_NOT_FOUND')
      expect(await code(h.driver.resolveRef(repo, 'main^'))).toBe('SOURCE_REF_NOT_FOUND')
      expect(await code(h.driver.resolveRef(repo, 'f'.repeat(40)))).toBe(
        'SOURCE_COMMIT_NOT_FOUND',
      )
    })

    it('refuses a reference another provider made', async () => {
      const other = h.driver.name === 'local' ? 'github' : 'local'
      expect(
        await code(h.driver.headCommit({ projectSlug: 'chem-labs', provider: other })),
      ).toBe('SOURCE_PROVIDER_MISMATCH')
      expect(
        await code(h.driver.sync({ projectSlug: 'chem-labs', provider: other })),
      ).toBe('SOURCE_PROVIDER_MISMATCH')
    })

    it('syncs a repository nothing has moved to an EMPTY advance that names it (Task 9)', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      // What visibility reads is the DRIVER's (Task 10): null on driver 1, whose repository has
      // none, and GitHub's answer on driver 2 — asserted in that driver's own file.
      expect(await h.driver.sync(repo)).toMatchObject({
        projectSlug: 'chem-labs',
        updated: [],
        rewritten: [],
      })
    })

    it('destroys a repository, after which it has no head', async () => {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      await h.driver.destroyRepository(repo)
      // A SourceError, not merely a throw: a driver that crashed on the missing repository
      // would satisfy `toBeDefined()` with 'not a SourceError: …'. And NOT a missing branch
      // (the authoring API plan's sitting 3): a repository that is not there has no branches
      // to be missing, and `SOURCE_REF_NOT_FOUND` would send a client looking for a typo.
      expect(await code(h.driver.headCommit(repo))).toBe('SOURCE_GIT_FAILED')
      expect(await code(h.driver.resolveRef(repo, 'main'))).toBe('SOURCE_GIT_FAILED')
    })

    extra?.(() => h)
  })
}
