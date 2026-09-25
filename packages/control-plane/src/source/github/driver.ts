import type { KeyObject } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import {
  type LocalGitDir,
  type RepoRef,
  type SeedFiles,
  SourceError,
  type SourceDriver,
} from '../git-driver.js'
import { createGithubClient } from './client.js'
import { gitWithToken, isAuthRefusal } from './git.js'
import { createTokenCache, type TokenPermissions } from './tokens.js'

export interface GithubDriverOptions {
  /** `config.reposRoot` — the mirror lives where driver 1's repositories do (Decision 1). */
  mirrorRoot: string
  apiUrl: string
  gitUrl: string
  org: string
  appId: string
  installationId: string
  appKey: KeyObject
  /** A test's spy; production uses the global. */
  fetch?: typeof fetch
  now?: () => Date
}

/** §7's slug rule, re-stated as driver 1 does: the traversal defence depends on no other module. */
const SLUG = /^[a-z][a-z0-9-]{2,38}$/

/** A build and a read name a COMMIT: a full 40-character id, never a revision expression. */
const COMMIT = /^[0-9a-f]{40}$/

/** Deterministic authorship, driver 1's, so a seeded repository is reproducible. */
const GIT_IDENTITY = [
  '-c',
  'user.name=Manifest',
  '-c',
  'user.email=manifest@manifest.internal',
  '-c',
  'commit.gpgsign=false',
]

/** Where the mirror keeps what GitHub has NOW (sitting 1's F6): forced, one per branch. */
const UPSTREAM = 'refs/manifest/upstream'

/**
 * D5'S DRIVER 2 — an organisation on GitHub, behind a GitHub App, with a LOCAL MIRROR at the
 * path driver 1's bare repository has (Decision 1), so `build/` does not change and a mirrored
 * commit builds with the network off (C1).
 *
 * **Two sets of refs in the mirror** (sitting 1's F6, measured): `refs/heads/*` is fetched
 * NON-forced, so a rewritten upstream `main` can never take away the history an approved
 * release names — it is the HISTORY KEEPER, and nothing reads "what GitHub has now" from it.
 * `refs/manifest/upstream/*` is fetched FORCED, one fetch with both refspecs, and is what
 * `headCommit`, `listBranches` and `commitFiles`' base read. Without it one rewrite froze
 * `main` for good: every later push was refused as another rewrite, and `headCommit` answered
 * the frozen head as current — the stale answer Decision 18 forbids.
 *
 * **Tokens never leave the process** (Decision 4, 20): per repository and per purpose, in
 * memory, handed to git only through the environment (`git.ts`), and every `SourceError` this
 * driver lets out is redacted with every token it holds.
 *
 * **Offline** (Decision 18): what the mirror has keeps working; anything that needs GitHub —
 * `headCommit`, a commit the mirror lacks, `createRepository` — is `SOURCE_UNREACHABLE`,
 * never the mirror's last answer presented as current.
 */
export function createGithubSourceDriver(o: GithubDriverOptions): SourceDriver {
  const root = resolve(o.mirrorRoot)
  const now = o.now ?? (() => new Date())
  const client = createGithubClient({
    apiUrl: o.apiUrl,
    appId: o.appId,
    appKey: o.appKey,
    ...(o.fetch === undefined ? {} : { fetch: o.fetch }),
    now,
  })
  const tokens = createTokenCache({ client, installationId: o.installationId, now })
  const remote = (slug: string) => `${o.gitUrl}/${o.org}/${slug}.git`
  /** Local git on the mirror — no token, no network. */
  const local = (mirror: string, args: readonly string[]) =>
    gitWithToken(args, { cwd: mirror })

  function pathFor(projectSlug: string): string {
    if (!SLUG.test(projectSlug)) {
      throw new SourceError(
        'SOURCE_INVALID_SLUG',
        `invalid project slug '${projectSlug}' — must match ${SLUG.source}`,
      )
    }
    const path = resolve(root, `${projectSlug}.git`)
    if (path !== root && !path.startsWith(root + sep)) {
      throw new SourceError(
        'SOURCE_PATH_ESCAPE',
        `'${projectSlug}' resolves outside the repo root`,
      )
    }
    return path
  }

  /** Task 2's contract: a reference another driver made is refused, never guessed at (Decision 3). */
  function assertOwned(repo: RepoRef): string {
    if (repo.provider !== 'github') {
      throw new SourceError(
        'SOURCE_PROVIDER_MISMATCH',
        `'${repo.projectSlug}' is a ${repo.provider} repository and this is the GitHub driver`,
      )
    }
    return pathFor(repo.projectSlug)
  }

  /** The mirror of a repository this driver made — or a refusal naming its absence. */
  function mirrorOf(repo: RepoRef): string {
    const mirror = assertOwned(repo)
    if (!existsSync(mirror)) {
      throw new SourceError(
        'SOURCE_GIT_FAILED',
        `${repo.projectSlug} has no mirror on this machine; it was not created by this control plane, or it was destroyed`,
      )
    }
    return mirror
  }

  /**
   * One repository's token for one purpose — re-minted ONCE if GitHub refuses it (a token
   * revoked, or a restarted fake that forgot its key), and never retried beyond that.
   */
  async function withToken<T>(
    slug: string,
    permissions: TokenPermissions,
    use: (token: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await use(await tokens.forRepository(slug, permissions))
    } catch (error) {
      if (!isAuthRefusal(error)) throw error
      tokens.forget(slug)
      return use(await tokens.forRepository(slug, permissions))
    }
  }

  /** A REST call with a repository token, re-minted once on GitHub's `401`. */
  async function restAs(
    slug: string,
    permissions: TokenPermissions,
    method: string,
    path: string,
    body?: unknown,
  ) {
    let res = await client.asToken(
      await tokens.forRepository(slug, permissions),
      method,
      path,
      body,
    )
    if (res.status === 401) {
      tokens.forget(slug)
      res = await client.asToken(
        await tokens.forRepository(slug, permissions),
        method,
        path,
        body,
      )
    }
    return res
  }

  async function hasCommit(mirror: string, sha: string): Promise<boolean> {
    try {
      await local(mirror, ['cat-file', '-e', `${sha}^{commit}`])
      return true
    } catch {
      return false
    }
  }

  /**
   * EVERY ADVANCE OF THE MIRROR GOES THROUGH HERE (Decision 11). One fetch, two refspecs:
   * `refs/heads/*` non-forced (the history keeper) and `refs/manifest/upstream/*` forced
   * (GitHub now). Never `--prune`: a branch deleted on GitHub keeps its ref here, so nothing
   * a release built from becomes unreachable and is lost to `gc`.
   *
   * git exits 1 when it refused a ref and updated the others. A refusal of `refs/heads/<b>`
   * whose shadow now holds the refused commit is a REWRITE, kept out of history on purpose —
   * Task 9 reports it; until then it is not an error. Any other refusal is.
   */
  async function sync(slug: string, mirror: string): Promise<void> {
    const out = await withToken(slug, { contents: 'read' }, (token) =>
      gitWithToken(
        [
          'fetch',
          '--porcelain',
          '--no-write-fetch-head',
          remote(slug),
          'refs/heads/*:refs/heads/*',
          `+refs/heads/*:${UPSTREAM}/*`,
        ],
        { cwd: mirror, token, acceptExit: [1] },
      ),
    )
    const refused: string[] = []
    for (const line of out.split('\n')) {
      const m = /^! [0-9a-f]+ ([0-9a-f]+) refs\/heads\/(.+)$/.exec(line.trim())
      if (m === null) {
        if (line.startsWith('!')) refused.push(line.trim())
        continue
      }
      const [, to, branch] = m as unknown as [string, string, string]
      const upstream = await local(mirror, [
        'rev-parse',
        '--verify',
        '--quiet',
        `${UPSTREAM}/${branch}`,
      ]).then(
        (s) => s.trim(),
        () => '',
      )
      if (upstream !== to) refused.push(line.trim())
    }
    if (refused.length > 0) {
      throw new SourceError(
        'SOURCE_GIT_FAILED',
        `git fetch refused ${refused.length} ref(s) into ${slug}'s mirror: ${refused.join('; ')}`,
      )
    }
  }

  /** Writes files in a throwaway worktree, commits, and pushes `main` to GitHub, non-forced. */
  async function commitAndPush(
    slug: string,
    base: { mirror: string } | undefined,
    files: SeedFiles,
    message: string,
  ): Promise<string> {
    const work = await mkdtemp(join(tmpdir(), 'manifest-worktree-'))
    const git = (args: readonly string[]) => gitWithToken(args, { cwd: work })
    try {
      await git(['init', '-q', '--initial-branch=main', '.'])
      if (base !== undefined) {
        // GitHub NOW, from the shadow — never the mirror's `refs/heads/main`, which a
        // rewrite freezes (F6): a commit on that would be refused non-fast-forward for ever.
        await git([
          'fetch',
          '-q',
          '--no-write-fetch-head',
          base.mirror,
          `+${UPSTREAM}/main:refs/remotes/base/main`,
        ])
        await git(['checkout', '-q', '-B', 'main', 'refs/remotes/base/main'])
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
      await git(['add', '-A'])
      await git([...GIT_IDENTITY, 'commit', '-q', '-m', message])
      await withToken(slug, { contents: 'write' }, (token) =>
        gitWithToken(['push', '-q', remote(slug), 'HEAD:refs/heads/main'], {
          cwd: work,
          token,
        }),
      )
      return (await git(['rev-parse', 'HEAD'])).trim()
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  }

  /**
   * The mirror: bare, `main`, and REFUSING EVERY PUSH — a commit pushed into it would be one
   * GitHub never saw (the plan's *Read this first* 15). Hooks do not run on fetch, so `sync`
   * is unaffected (`[M14]`).
   */
  async function makeMirror(
    mirror: string,
    slug: string,
    named: { fullName: string; webUrl: string },
  ): Promise<void> {
    await mkdir(root, { recursive: true })
    await gitWithToken(['init', '-q', '--bare', '--initial-branch=main', mirror], {
      cwd: root,
    })
    const hook = join(mirror, 'hooks', 'pre-receive')
    await writeFile(
      hook,
      '#!/bin/sh\n' +
        `echo "manifest: this repository is a mirror of GitHub (${o.org}/${slug}); push to GitHub, not here" >&2\n` +
        'exit 1\n',
    )
    await chmod(hook, 0o755)
    await local(mirror, ['config', 'manifest.visibility', 'private'])
    // What GitHub ANSWERED it is called — read back by `describeRepository` for the
    // project's row (Task 8), never rebuilt from the configuration by hand.
    await local(mirror, ['config', 'manifest.fullName', named.fullName])
    await local(mirror, ['config', 'manifest.webUrl', named.webUrl])
  }

  async function deleteOnGithub(slug: string): Promise<void> {
    const res = await restAs(
      slug,
      { administration: 'write' },
      'DELETE',
      `/repos/${o.org}/${slug}`,
    )
    if (res.status !== 204) throw client.refusal(`delete ${o.org}/${slug}`, res)
  }

  const driver: SourceDriver = {
    name: 'github',

    repositoryFor(projectSlug) {
      pathFor(projectSlug)
      return { projectSlug, provider: 'github' }
    },

    async createRepository(projectSlug, seed) {
      const mirror = pathFor(projectSlug)
      // A mirror already here is a repository this machine made once and did not delete —
      // refused, never reused or removed (Decision 16).
      if (existsSync(mirror)) {
        throw new SourceError(
          'SOURCE_REPOSITORY_EXISTS',
          `${projectSlug} already has a mirror on this machine; it is never reused or removed by a create`,
        )
      }
      const admin = await tokens.installationWide({ administration: 'write' })
      const created = await client.asToken(admin, 'POST', `/orgs/${o.org}/repos`, {
        name: projectSlug,
        private: true,
        auto_init: false,
      })
      if (created.status === 422 && nameTaken(created.json)) {
        // NEVER ADOPTED (Decision 16): on GitHub it can be anybody's code and history.
        throw new SourceError(
          'SOURCE_REPOSITORY_EXISTS',
          `${o.org}/${projectSlug} already exists on GitHub; Manifest never adopts a repository it did not create`,
        )
      }
      if (created.status !== 201) {
        throw client.refusal(`create ${o.org}/${projectSlug}`, created)
      }
      try {
        const body = created.json as {
          private?: unknown
          visibility?: unknown
          html_url?: unknown
          full_name?: unknown
        }
        // ENFORCED PRIVATE starts here (Decision 12): GitHub's default is PUBLIC, and what
        // it answered is what counts, not what was asked.
        if (body.private !== true || body.visibility !== 'private') {
          throw new SourceError(
            'SOURCE_REPOSITORY_NOT_PRIVATE',
            `GitHub created ${o.org}/${projectSlug} ${String(body.visibility ?? 'without a visibility')}; it has been deleted`,
          )
        }
        await commitAndPush(
          projectSlug,
          undefined,
          seed,
          'chore: seed from blueprint skeleton',
        )
        if (typeof body.full_name !== 'string' || typeof body.html_url !== 'string') {
          throw client.refusal(
            `create ${o.org}/${projectSlug} (no name in the answer)`,
            created,
          )
        }
        await makeMirror(mirror, projectSlug, {
          fullName: body.full_name,
          webUrl: body.html_url,
        })
        await sync(projectSlug, mirror)
      } catch (error) {
        await deleteOnGithub(projectSlug).catch((cleanup: unknown) => {
          // An orphan on GitHub is never silent: the next create of this slug is refused.
          console.error(
            `github driver: ${o.org}/${projectSlug} was created and could not be deleted after a failed create: ${tokens.redact(String(cleanup))}`,
          )
        })
        await rm(mirror, { recursive: true, force: true })
        throw error
      }
      return { projectSlug, provider: 'github' }
    },

    async commitFiles(repo, files, message) {
      const mirror = mirrorOf(repo)
      await sync(repo.projectSlug, mirror)
      const sha = await commitAndPush(repo.projectSlug, { mirror }, files, message)
      await sync(repo.projectSlug, mirror)
      return sha
    },

    async headCommit(repo, ref = 'main') {
      const mirror = mirrorOf(repo)
      await sync(repo.projectSlug, mirror)
      try {
        return (
          await local(mirror, [
            'rev-parse',
            '--verify',
            '--quiet',
            `${UPSTREAM}/${ref}^{commit}`,
          ])
        ).trim()
      } catch {
        throw new SourceError(
          'SOURCE_GIT_FAILED',
          `${repo.projectSlug} has no branch '${ref}' on GitHub`,
        )
      }
    },

    async readFile(repo, commitSha, path) {
      const mirror = mirrorOf(repo)
      await present(repo, mirror, commitSha)
      try {
        return await local(mirror, ['show', `${commitSha}:${path}`])
      } catch {
        // The commit is here (checked above), so this is a path not in its tree.
        return null
      }
    },

    async listBranches(repo) {
      const mirror = mirrorOf(repo)
      await sync(repo.projectSlug, mirror)
      const out = await local(mirror, [
        'for-each-ref',
        '--format=%(refname:lstrip=3)',
        `${UPSTREAM}/`,
      ])
      return out
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    },

    async localGitDir(repo, commitSha): Promise<LocalGitDir> {
      const mirror = mirrorOf(repo)
      await present(repo, mirror, commitSha)
      return { gitDir: mirror, commitSha }
    },

    async describeRepository(repo) {
      const mirror = mirrorOf(repo)
      const read = (key: string) => local(mirror, ['config', key]).then((v) => v.trim())
      return {
        fullName: await read('manifest.fullName'),
        webUrl: await read('manifest.webUrl'),
      }
    },

    async destroyRepository(repo) {
      const mirror = mirrorOf(repo)
      await deleteOnGithub(repo.projectSlug)
      tokens.forget(repo.projectSlug)
      await rm(mirror, { recursive: true, force: true })
    },
  }

  /**
   * The commit, in the mirror — fetched if it is not. The 40-hex check comes FIRST, before any
   * sync (Task 2's contract): a name such as `main` would resolve in the mirror to the history
   * keeper, which a rewrite freezes. **A sync that is `SOURCE_UNREACHABLE` propagates as that
   * code**: a commit that may exist on GitHub is never reported as one that does not.
   */
  async function present(
    repo: RepoRef,
    mirror: string,
    commitSha: string,
  ): Promise<void> {
    if (!COMMIT.test(commitSha)) {
      throw new SourceError(
        'SOURCE_COMMIT_NOT_FOUND',
        `'${commitSha}' is not a commit id — a build names a full 40-character commit`,
      )
    }
    if (await hasCommit(mirror, commitSha)) return
    await sync(repo.projectSlug, mirror)
    if (await hasCommit(mirror, commitSha)) return
    throw new SourceError(
      'SOURCE_COMMIT_NOT_FOUND',
      `${repo.projectSlug} has no commit ${commitSha.slice(0, 12)}`,
    )
  }

  /**
   * Every `SourceError` out of this driver is redacted with every token it holds (Decision
   * 4) — belt and braces over `git.ts`'s own redaction, for a message some other layer built.
   */
  const redacting = {} as SourceDriver
  for (const [name, value] of Object.entries(driver)) {
    ;(redacting as unknown as Record<string, unknown>)[name] =
      typeof value !== 'function'
        ? value
        : (...args: unknown[]) => {
            const redact = (error: unknown) => {
              if (error instanceof SourceError)
                error.message = tokens.redact(error.message)
              throw error
            }
            try {
              const result = (value as (...a: unknown[]) => unknown).apply(driver, args)
              return result instanceof Promise ? result.catch(redact) : result
            } catch (error) {
              return redact(error)
            }
          }
  }
  return redacting
}

/** GitHub's `422` for a name that is taken names the FIELD, not the name (sitting 3's F5). */
function nameTaken(json: unknown): boolean {
  const errors = (json as { errors?: unknown } | undefined)?.errors
  return (
    Array.isArray(errors) &&
    errors.some(
      (e) =>
        (e as { field?: unknown }).field === 'name' &&
        /already exists/i.test(String((e as { message?: unknown }).message)),
    )
  )
}
