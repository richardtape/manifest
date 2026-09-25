import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import {
  type CreatedRepository,
  type LocalGitDir,
  type RepoRef,
  type SeedFiles,
  SourceError,
  type SourceDriver,
} from './git-driver.js'
import { installPreReceiveHook } from './pre-receive.js'
import { assertNoSecrets, assertWritablePaths } from './scan-commits.js'

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

  /**
   * `main` — every branch — PROTECTED BY GIT ITSELF (the D5 plan's Task 12, Decision 13; `[M14]`
   * measured both): a person's force-push is refused `denying non-fast-forward`, a deletion
   * `denying ref deletion`. So a commit a release names cannot be rewritten away and then lost
   * to `gc` (sitting 2's F3's window, closed). Set at creation and at every boot.
   */
  async function protectHistory(path: string): Promise<void> {
    await git(path, ['config', 'receive.denyNonFastForwards', 'true'])
    await git(path, ['config', 'receive.denyDeletes', 'true'])
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

    async createRepository(
      projectSlug: string,
      seed: SeedFiles,
    ): Promise<CreatedRepository> {
      const path = pathFor(projectSlug)
      // Before ANYTHING is written (Task 11): a refused seed leaves no repository behind.
      assertWritablePaths(seed)
      assertNoSecrets(seed)
      await mkdir(repoRoot, { recursive: true })
      await git(repoRoot, ['init', '--bare', '--initial-branch=main', path])
      // The hook and git's protection BEFORE the first push, so every commit this repository
      // ever takes — the seed's too — has been through both (§20; Task 12, Decision 13).
      await installPreReceiveHook(path)
      await protectHistory(path)
      await commitThroughWorktree(path, seed, 'chore: seed from blueprint skeleton', true)
      return {
        ref: { projectSlug, provider: 'local' },
        link: {
          provider: 'local',
          // A laptop path is not an address (Decision 15): the slug, and no URL.
          fullName: projectSlug,
          webUrl: null,
          mainProtected: true,
          protectionDetail: null,
        },
      }
    },

    async commitFiles(repo, files, message) {
      const path = assertOwned(repo)
      assertWritablePaths(files)
      assertNoSecrets(files)
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

    /** Nothing to bring up to date: this bare repository IS the source (Task 9). */
    async sync(repo) {
      assertOwned(repo)
      return {
        projectSlug: repo.projectSlug,
        updated: [],
        rewritten: [],
        visibility: null,
        findings: [],
      }
    },

    async destroyRepository(repo) {
      const path = assertOwned(repo)
      await rm(path, { recursive: true, force: true })
    },

    /**
     * Every bare repository of driver 1's under the root gets the CURRENT hook and git's
     * protection of its history — so a repository made before Task 11 or 12, or before a
     * rule was added to the list, is today's from the next boot. **A driver-2 mirror in the same root is left alone**:
     * a laptop that switched drivers keeps both kinds side by side (Decision 3), and a mirror's
     * hook refuses EVERY push — replacing it would let a commit GitHub never saw into a
     * mirror. A mirror is known by the `manifest.fullName` its creation writes (Task 8).
     */
    async prepare() {
      let repositories = 0
      for (const dir of await ownRepositories(repoRoot, false)) {
        await installPreReceiveHook(dir)
        await protectHistory(dir)
        repositories += 1
      }
      return { repositories }
    },
  }
}

/**
 * The bare repositories under `root` that are — `mirrors: true` — or are not driver 2's
 * mirrors: a `<slug>.git` directory with a `HEAD`, told apart by the `manifest.fullName` a
 * mirror's creation writes. No root yet is none; any other failure to read it is thrown.
 */
export async function ownRepositories(root: string, mirrors: boolean): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as { code?: unknown }).code === 'ENOENT') return []
    throw error
  })
  const out: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith('.git')) continue
    if (!SLUG.test(entry.name.slice(0, -'.git'.length))) continue
    const dir = join(root, entry.name)
    if (!existsSync(join(dir, 'HEAD'))) continue
    // `config --get` exits 1 for a key that is not set, and only then is it "not a mirror".
    // Any other failure means the directory cannot be told apart, so NEITHER driver touches
    // it — and one broken directory never stops a boot — with an operator line.
    const isMirror = await run('git', [
      '--git-dir',
      dir,
      'config',
      '--local',
      '--get',
      'manifest.fullName',
    ]).then(
      () => true,
      (error: unknown) => {
        if ((error as { code?: unknown }).code === 1) return false
        console.error(
          `source: ${dir} could not be read as a repository (${String((error as { stderr?: unknown }).stderr ?? error).trim()}); it is left as it is`,
        )
        return undefined
      },
    )
    if (isMirror === mirrors) out.push(dir)
  }
  return out.sort()
}
