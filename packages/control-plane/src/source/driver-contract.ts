import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SourceError, type SourceDriver } from './git-driver.js'

/** What one driver's run of the suite is handed (this plan's Task 2). */
export interface SourceDriverHarness {
  driver: SourceDriver
  /** Pushes a commit to `main` the way a PERSON would, outside the driver. Returns its sha. */
  pushAsPerson(
    slug: string,
    files: Record<string, string>,
    message: string,
  ): Promise<string>
  cleanup(): Promise<void>
}

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
      const repo = await h.driver.createRepository('chem-labs', SEED)
      expect(repo).toEqual({ projectSlug: 'chem-labs', provider: h.driver.name })
      const sha = await h.driver.headCommit(repo)
      expect(sha).toMatch(/^[0-9a-f]{40}$/)
      expect(await h.driver.readFile(repo, sha, 'manifest.yaml')).toContain(
        'name: chem-labs',
      )
      expect(await h.driver.readFile(repo, sha, 'not-there.yaml')).toBeNull()
    })

    it('names a repository it already made the same way it named it at creation', async () => {
      const created = await h.driver.createRepository('chem-labs', SEED)
      expect(h.driver.repositoryFor('chem-labs')).toEqual(created)
    })

    it('reads a file AT a commit, not at HEAD', async () => {
      const repo = await h.driver.createRepository('chem-labs', SEED)
      const first = await h.driver.headCommit(repo)
      const second = await h.driver.commitFiles(
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
      expect(await h.driver.listBranches(repo)).toEqual(['main'])
    })

    it('refuses a slug that could escape, and a path that could', async () => {
      for (const slug of ['../escape', 'a/b', '..', '.', 'Chem', 'has_underscore', ''])
        expect(await code(h.driver.createRepository(slug, SEED))).toBe(
          'SOURCE_INVALID_SLUG',
        )
      const repo = await h.driver.createRepository('chem-labs', SEED)
      expect(
        await code(h.driver.commitFiles(repo, { '../outside.txt': 'x' }, 'escape')),
      ).toBe('SOURCE_PATH_ESCAPE')
    })

    it('refuses a reference another provider made', async () => {
      const other = h.driver.name === 'local' ? 'github' : 'local'
      expect(
        await code(h.driver.headCommit({ projectSlug: 'chem-labs', provider: other })),
      ).toBe('SOURCE_PROVIDER_MISMATCH')
    })

    it('destroys a repository, after which it has no head', async () => {
      const repo = await h.driver.createRepository('chem-labs', SEED)
      await h.driver.destroyRepository(repo)
      // A SourceError, not merely a throw: a driver that crashed on the missing repository
      // would satisfy `toBeDefined()` with 'not a SourceError: …'.
      expect(await code(h.driver.headCommit(repo))).toMatch(/^SOURCE_[A-Z_]+$/)
    })

    extra?.(() => h)
  })
}
