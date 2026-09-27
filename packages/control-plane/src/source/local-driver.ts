import { execFile } from 'node:child_process'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import {
  type CreatedRepository,
  type LocalGitDir,
  type RepoRef,
  type SeedFiles,
  SourceError,
  type SourceDriver,
} from './git-driver.js'
import { type BuiltCommit, buildCommit, MANIFEST_COMMITTER, runGit } from './plumbing.js'
import {
  COMMIT_ID,
  describeCommitIn,
  historyIn,
  listTreeIn,
  readTextIn,
  REF_NAME,
} from './reading.js'
import { installPreReceiveHook } from './pre-receive.js'
import { assertNoSecrets, assertWritablePaths, writesOf } from './scan-commits.js'

const run = promisify(execFile)

/**
 * §7's slug rule, re-stated because this module turns a slug into a path. Not
 * imported from spec/: this is a different input on a different path, and the
 * traversal defence must not depend on somebody else having checked something else.
 */
const SLUG = /^[a-z][a-z0-9-]{2,38}$/

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

  /**
   * Pushes a built commit into the bare repository, NON-FORCED, so its `pre-receive` runs (the
   * D5 plan's Task 11) and a moved `main` is refused by git itself (the authoring API plan's
   * Decision 3). `--porcelain` puts the verdict on STDOUT — measured: a refusal is exit 1 with
   * `!\t<sha>:refs/heads/main\t[rejected] (non-fast-forward)` on stdout, and only `failed to
   * push` and hints on stderr — so it is stdout that is read. **A push git refused never reads
   * as success**: `runGit` answers the exit code, and this returns only on `0`.
   */
  async function pushInto(bare: string, built: BuiltCommit): Promise<void> {
    const r = await runGit(built.gitDir, [
      'push',
      '--porcelain',
      bare,
      `${built.commit}:refs/heads/main`,
    ])
    if (r.code === 0) return
    // A MOVED BRANCH IS A CONFLICT, however git words it: `[rejected]` when the client saw it
    // move, and — when two pushes race inside receive-pack — the loser's `[remote rejected]
    // (failed to update ref)`, `cannot lock ref 'refs/heads/main': is at X but expected <base>`
    // (sitting 2, measured 3 of 3). So the branch itself is read rather than the words.
    const now = await runGit(bare, [
      'rev-parse',
      '--verify',
      '--quiet',
      'refs/heads/main',
    ])
    if (
      /\[rejected\] \((non-fast-forward|fetch first)\)/.test(r.stdout) ||
      now.stdout.trim() !== (built.parent ?? '')
    ) {
      throw new SourceError(
        'SOURCE_CONFLICT',
        'main moved while this commit was being made; read the tree again and retry',
      )
    }
    // `[remote rejected] (pre-receive hook declined)`: the hook is the backstop behind the
    // pre-push scan, and reaching it means the two disagree — an operator's problem, said once.
    console.error(
      `[source] the repository refused Manifest's own push: ${`${r.stdout}\n${r.stderr}`
        .trim()
        .split('\n')
        .slice(-4)
        .join(' | ')}`,
    )
    throw new SourceError(
      'SOURCE_GIT_FAILED',
      'the repository refused the push; nothing was committed',
    )
  }

  /**
   * A branch name or a full commit id, as the commit it names (the authoring API plan's Task 4).
   * A NAME is only ever read as `refs/heads/<name>` — never a revision expression — and is
   * checked before git sees it; an id must be a commit this repository has.
   */
  async function resolveRef(repo: RepoRef, ref: string): Promise<string> {
    const path = assertOwned(repo)
    if (COMMIT_ID.test(ref)) {
      await assertCommit(path, repo, ref)
      return ref
    }
    const noBranch = () =>
      new SourceError(
        'SOURCE_REF_NOT_FOUND',
        `${repo.projectSlug} has no branch '${ref}'`,
      )
    if (!REF_NAME.test(ref)) throw noBranch()
    // A repository that is not there has no branches to be missing — driver 2 says the same of
    // a mirror (`mirrorOf`). `SOURCE_REF_NOT_FOUND` here would send a client looking for a typo.
    if (!existsSync(join(path, 'HEAD'))) {
      throw new SourceError(
        'SOURCE_GIT_FAILED',
        `${repo.projectSlug} has no repository on this machine`,
      )
    }
    const r = await runGit(path, [
      'rev-parse',
      '--verify',
      '--quiet',
      `refs/heads/${ref}^{commit}`,
    ])
    if (r.code !== 0) throw noBranch()
    return r.stdout.trim()
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
      assertWritablePaths(Object.keys(seed))
      assertNoSecrets(Object.entries(seed).map(([p, content]) => ({ path: p, content })))
      await mkdir(repoRoot, { recursive: true })
      await git(repoRoot, ['init', '--bare', '--initial-branch=main', path])
      // The hook and git's protection BEFORE the first push, so every commit this repository
      // ever takes — the seed's too — has been through both (§20; Task 12, Decision 13).
      await installPreReceiveHook(path)
      await protectHistory(path)
      // The seed through THE write path (Task 3): no base, and pushed like any other commit, so
      // the hook sees it too.
      const built = await buildCommit({
        objects: path,
        base: null,
        changes: Object.entries(seed).map(([p, content]) => ({
          op: 'write' as const,
          path: p,
          content,
        })),
        message: 'chore: seed from blueprint skeleton',
        author: MANIFEST_COMMITTER,
      })
      try {
        await pushInto(path, built)
      } finally {
        await built.dispose()
      }
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

    /**
     * THE ONE WRITE (the authoring API plan's Task 3): checked, then built with no worktree
     * (`source/plumbing.ts`), then pushed non-forced into the bare repository.
     */
    async commit(repo, request) {
      const path = assertOwned(repo)
      assertWritablePaths(request.changes.map((c) => c.path))
      assertNoSecrets(writesOf(request.changes))
      const head = (
        await git(path, ['rev-parse', '--verify', 'refs/heads/main^{commit}'])
      ).trim()
      if (request.base !== head) {
        throw new SourceError(
          'SOURCE_CONFLICT',
          `main is ${head.slice(0, 12)} now, and these changes were computed from ${request.base.slice(0, 12)}; read the tree again and retry`,
        )
      }
      // THE CLIENT'S BASE, never the head read above: were the check above ever lost, a commit
      // built on the head would replay stale changes over a person's push; built on the base,
      // git refuses it non-fast-forward at the push — two layers, each able to fail alone.
      const built = await buildCommit({
        objects: path,
        base: request.base,
        changes: request.changes,
        message: request.message,
        author: request.author,
      })
      try {
        if (request.dryRun !== true) await pushInto(path, built)
        return {
          commitSha: request.dryRun === true ? null : built.commit,
          parent: request.base,
          changes: built.changes,
        }
      } finally {
        await built.dispose()
      }
    },

    resolveRef,

    async headCommit(repo, ref = 'main') {
      return resolveRef(repo, ref)
    },

    /** The read primitives (Task 4): the commit checked to be here, then `reading.ts`. */
    async listTree(repo, commitSha) {
      const path = assertOwned(repo)
      await assertCommit(path, repo, commitSha)
      return listTreeIn(path, commitSha)
    },

    async readText(repo, commitSha, filePath) {
      const path = assertOwned(repo)
      await assertCommit(path, repo, commitSha)
      return readTextIn(path, commitSha, filePath)
    },

    async history(repo, from, limit) {
      const path = assertOwned(repo)
      await assertCommit(path, repo, from)
      return historyIn(path, from, limit)
    },

    async describeCommit(repo, commitSha) {
      const path = assertOwned(repo)
      await assertCommit(path, repo, commitSha)
      return describeCommitIn(path, commitSha)
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
        unscannable: [],
      }
    },

    /** A repository on this machine has no visibility: it is nobody's to publish (Task 12). */
    async lastVisibility(repo) {
      assertOwned(repo)
      return null
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
