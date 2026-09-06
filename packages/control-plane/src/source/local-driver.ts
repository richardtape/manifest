import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import {
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

  function assertOwned(repo: RepoRef): string {
    const expected = pathFor(repo.projectSlug)
    if (resolve(repo.path) !== expected) {
      throw new SourceError(
        'SOURCE_FOREIGN_REPO',
        `refusing to operate on '${repo.path}', which this driver did not create`,
      )
    }
    return expected
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

    async createRepository(projectSlug: string, seed: SeedFiles): Promise<RepoRef> {
      const path = pathFor(projectSlug)
      await mkdir(repoRoot, { recursive: true })
      await git(repoRoot, ['init', '--bare', '--initial-branch=main', path])
      await commitThroughWorktree(path, seed, 'chore: seed from blueprint skeleton', true)
      return { projectSlug, path, url: `file://${path}` }
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
      try {
        return await git(path, ['show', `${commitSha}:${filePath}`])
      } catch {
        // git exits non-zero for "path not in tree", which is a normal answer here.
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

    async destroyRepository(repo) {
      const path = assertOwned(repo)
      await rm(path, { recursive: true, force: true })
    },
  }
}
