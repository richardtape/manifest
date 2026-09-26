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
      // would satisfy `toBeDefined()` with 'not a SourceError: …'.
      expect(await code(h.driver.headCommit(repo))).toMatch(/^SOURCE_[A-Z_]+$/)
    })

    extra?.(() => h)
  })
}
