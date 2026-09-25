import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import {
  type LocalGitDir,
  type RepoRef,
  type SeedFiles,
  SourceError,
  type SourceDriver,
} from './git-driver.js'

const run = promisify(execFile)

/**
 * §7's slug rule, re-stated because this module turns a slug into a path. Not
 * imported from spec/: this is a different input on a different path, and the
 * traversal defence must not depend on somebody else having checked something else.
 */
const SLUG = /^[a-z][a-z0-9-]{2,38}$/

/** Deterministic authorship so a seeded repo is reproducible across machines. */
const GIT_IDENTITY = [
  '-c',
  'user.name=Manifest',
  '-c',
  'user.email=manifest@manifest.internal',
  '-c',
  'commit.gpgsign=false',
]

export { SourceError } from './git-driver.js'
export type { RepoRef, SourceDriver } from './git-driver.js'

export function createLocalSourceDriver(root: string): SourceDriver {
  const repoRoot = resolve(root)

  function pathFor(projectSlug: string): string {
    if (!SLUG.test(projectSlug)) {
      throw new SourceError(
        'SOURCE_INVALID_SLUG',
        `invalid project slug '${projectSlug}' — must match ${SLUG.source}`,
      )
    }
    const path = resolve(repoRoot, `${projectSlug}.git`)
    // Belt and braces: even with the regex above, never operate outside the root.
    if (path !== repoRoot && !path.startsWith(repoRoot + sep)) {
      throw new SourceError(
        'SOURCE_PATH_ESCAPE',
        `'${projectSlug}' resolves outside the repo root`,
      )
    }
    return path
  }

  /**
   * A reference is this driver's when it names THIS provider and a slug this driver could
   * have made — and the path is derived from the slug, never read off the reference (the
   * D5 plan's Task 2). A GitHub-made reference is refused rather than guessed at: treating
   * a mirror as a repository, or the reverse, is exactly what Decision 3 forbids.
   */
  function assertOwned(repo: RepoRef): string {
    if (repo.provider !== 'local') {
      throw new SourceError(
        'SOURCE_PROVIDER_MISMATCH',
        `'${repo.projectSlug}' is a ${repo.provider} repository and this is the local driver`,
      )
    }
    return pathFor(repo.projectSlug)
  }

  /**
   * A full commit id the repository has — or `SOURCE_COMMIT_NOT_FOUND`. Checked BEFORE git
   * sees it: `cat-file -e` accepts any revision expression, so `main` or `HEAD~3` would pass
   * it, and the builder would archive whatever that names when the build starts rather than
   * the commit that was validated. `localGitDir` and `readFile` both name a COMMIT.
   */
  async function assertCommit(path: string, repo: RepoRef, commitSha: string) {
    if (!/^[0-9a-f]{40}$/.test(commitSha)) {
      throw new SourceError(
        'SOURCE_COMMIT_NOT_FOUND',
        `'${commitSha}' is not a commit id — a build names a full 40-character commit`,
      )
    }
    try {
      await run('git', ['--git-dir', path, 'cat-file', '-e', `${commitSha}^{commit}`])
    } catch {
      throw new SourceError(
        'SOURCE_COMMIT_NOT_FOUND',
        `${repo.projectSlug} has no commit ${commitSha.slice(0, 12)}`,
      )
    }
  }

  async function git(cwd: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await run('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 })
      return stdout
    } catch (error) {
      throw new SourceError(
        'SOURCE_GIT_FAILED',
        `git ${args[0]} failed: ${String(error)}`,
      )
    }
  }

  /** Writes files in a throwaway worktree and pushes them into the bare repo. */
  async function commitThroughWorktree(
    bare: string,
    files: SeedFiles,
    message: string,
    firstCommit: boolean,
  ): Promise<string> {
    const work = await mkdtemp(join(tmpdir(), 'manifest-worktree-'))
    try {
      if (firstCommit) {
        await git(work, ['init', '--initial-branch=main', '.'])
        await git(work, ['remote', 'add', 'origin', bare])
      } else {
        await git(work, ['clone', '--branch', 'main', bare, '.'])
      }
      for (const [relative, content] of Object.entries(files)) {
        const target = resolve(work, relative)
        if (!target.startsWith(resolve(work) + sep)) {
          throw new SourceError(
            'SOURCE_PATH_ESCAPE',
            `seed path '${relative}' escapes the worktree`,
          )
        }
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, content, 'utf8')
      }
      await git(work, ['add', '-A'])
      await git(work, [...GIT_IDENTITY, 'commit', '-m', message])
      await git(work, ['push', 'origin', 'main'])
      return (await git(work, ['rev-parse', 'HEAD'])).trim()
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  }

  return {
    name: 'local',

    repositoryFor(projectSlug: string): RepoRef {
      pathFor(projectSlug)
      return { projectSlug, provider: 'local' }
    },

    async createRepository(projectSlug: string, seed: SeedFiles): Promise<RepoRef> {
      const path = pathFor(projectSlug)
      await mkdir(repoRoot, { recursive: true })
      await git(repoRoot, ['init', '--bare', '--initial-branch=main', path])
      await commitThroughWorktree(path, seed, 'chore: seed from blueprint skeleton', true)
      return { projectSlug, provider: 'local' }
    },

    async commitFiles(repo, files, message) {
      const path = assertOwned(repo)
      return commitThroughWorktree(path, files, message, false)
    },

    async headCommit(repo, ref = 'main') {
      const path = assertOwned(repo)
      return (await git(path, ['rev-parse', ref])).trim()
    },

    async readFile(repo, commitSha, filePath) {
      const path = assertOwned(repo)
      // The COMMIT first, then the path (the D5 plan's Task 7): `git show` says
      // `path '<p>' does not exist in '<sha>'` for a missing path AND for a missing commit —
      // the same words, both exit 128 (measured, git 2.50.1) — so its stderr cannot tell a
      // file that is not there from a commit that is not.
      await assertCommit(path, repo, commitSha)
      try {
        return await git(path, ['show', `${commitSha}:${filePath}`])
      } catch {
        // The commit is here, so git's non-zero exit is "path not in tree" — a normal answer.
        return null
      }
    },

    async listBranches(repo) {
      const path = assertOwned(repo)
      const stdout = await git(path, [
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/heads/',
      ])
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    },

    /**
     * Driver 1's repository IS the bare repository the builder reads, so there is nothing
     * to fetch: the commit is checked to be there, and the directory handed back.
     */
    async localGitDir(repo, commitSha): Promise<LocalGitDir> {
      const path = assertOwned(repo)
      await assertCommit(path, repo, commitSha)
      return { gitDir: path, commitSha }
    },

    async describeRepository(repo) {
      assertOwned(repo)
      return { fullName: repo.projectSlug, webUrl: null }
    },

    async destroyRepository(repo) {
      const path = assertOwned(repo)
      await rm(path, { recursive: true, force: true })
    },
  }
}
