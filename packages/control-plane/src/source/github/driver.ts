import type { KeyObject } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import {
  type Change,
  type GitIdentity,
  type LocalGitDir,
  type MirrorAdvance,
  type RepositoryLink,
  type RepositoryVisibility,
  type RepoRef,
  SourceError,
  type SourceDriver,
  type SourceObserver,
} from '../git-driver.js'
import { ownRepositories } from '../local-driver.js'
import {
  type BuiltCommit,
  buildCommit,
  MANIFEST_COMMITTER,
  pushVerdict,
} from '../plumbing.js'
import {
  COMMIT_ID,
  describeCommitIn,
  historyIn,
  listTreeIn,
  readBytesIn,
  readTextIn,
  REF_NAME,
} from '../reading.js'
import {
  assertNoSecrets,
  assertWritablePaths,
  scanNewCommits,
  writesOf,
  type ScanLimits,
} from '../scan-commits.js'
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
  /**
   * REQUIRED, with no default (Task 9, Decision 11): every advance of the mirror is reported
   * here, and a driver built without one would advance silently. `src/index.ts` passes the
   * one that publishes Events; a test passes a recording one.
   */
  observer: SourceObserver
  /** A test's spy; production uses the global. */
  fetch?: typeof fetch
  now?: () => Date
  /**
   * The bounds of one batch of the mirror's scan — `SCAN_COMMIT_LIMIT` and `SCAN_OUTPUT_LIMIT`
   * unless a test makes a commit too large to scan without pushing 20 MiB (Task 12).
   */
  scanLimits?: ScanLimits
}

/** §7's slug rule, re-stated as driver 1 does: the traversal defence depends on no other module. */
const SLUG = /^[a-z][a-z0-9-]{2,38}$/

/** A build and a read name a COMMIT: a full 40-character id, never a revision expression. */
const COMMIT = /^[0-9a-f]{40}$/

/** Where the mirror keeps what GitHub has NOW (sitting 1's F6): forced, one per branch. */
const UPSTREAM = 'refs/manifest/upstream'

/**
 * Where the mirror PINS every commit it has handed the builder (Task 9): neither a rewrite
 * nor a branch deleted on GitHub can then make a built commit unreachable to `gc`.
 */
const KEPT = 'refs/manifest/kept'

/**
 * Where the mirror records, per branch, the last head whose new commits were SCANNED AND
 * REPORTED (Task 11, Decision 11): moved only after the observer resolves, so a finding is
 * reported at least once and never skipped. Compared against the SHADOW (`[M14]`), so one
 * force-push cannot switch scanning off.
 */
const SCANNED = 'refs/manifest/scanned'

/** One line of `git fetch --porcelain`: flag, old, new, local ref. The flag may be a SPACE. */
const PORCELAIN = /^([ +*!=t-]) ([0-9a-f]{40}) ([0-9a-f]{40}) (\S+)$/

/**
 * D5'S DRIVER 2 — an organisation on GitHub, behind a GitHub App, with a LOCAL MIRROR at the
 * path driver 1's bare repository has (Decision 1), so `build/` does not change and a mirrored
 * commit builds with the network off (C1).
 *
 * **Two sets of refs in the mirror** (sitting 1's F6, measured): `refs/heads/*` is fetched
 * NON-forced, so a rewritten upstream `main` can never take away the history an approved
 * release names — it is the HISTORY KEEPER, and nothing reads "what GitHub has now" from it.
 * `refs/manifest/upstream/*` is fetched FORCED, one fetch with both refspecs, and is what
 * `headCommit`, `listBranches` and `commit`'s base read. Without it one rewrite froze
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

  /** A ref's commit in the mirror, or `''` when it has none. */
  const commitOf = (mirror: string, ref: string) =>
    local(mirror, ['rev-parse', '--verify', '--quiet', ref]).then(
      (out) => out.trim(),
      () => '',
    )

  /**
   * EVERY ADVANCE OF THE MIRROR GOES THROUGH HERE (Decision 11). One fetch, two refspecs:
   * `refs/heads/*` non-forced (the history keeper) and `refs/manifest/upstream/*` forced
   * (GitHub now). Never `--prune`: a branch deleted on GitHub keeps its ref here, so nothing
   * a release built from becomes unreachable and is lost to `gc`.
   *
   * **WHAT MOVED IS READ FROM THE SHADOW'S LINES** (`[M14]`): after a rewrite, `refs/heads/<b>`
   * is refused (`!`) on EVERY later fetch, so reading it would report a rewrite on every push
   * for ever. The shadow's ` ` (fast-forward) and `*` (new) are `updated`; its `+` (forced) is
   * the rewrite, reported once, with what the history keeper kept. A refused
   * `refs/heads/<b>` is expected exactly when the shadow now holds the refused commit (sitting
   * 4's F3); git exits 1 for it, and any OTHER refusal is `SOURCE_GIT_FAILED`.
   */
  async function fetchInto(slug: string, mirror: string): Promise<MirrorAdvance> {
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
    const advance: MirrorAdvance = {
      projectSlug: slug,
      updated: [],
      rewritten: [],
      visibility: null,
      findings: [],
      unscannable: [],
    }
    const refused: string[] = []
    for (const line of out.split('\n')) {
      if (line.trim() === '') continue
      const m = PORCELAIN.exec(line)
      if (m === null) {
        if (line.startsWith('!')) refused.push(line.trim())
        continue
      }
      const [, flag, from, to, ref] = m as unknown as [
        string,
        string,
        string,
        string,
        string,
      ]
      if (ref.startsWith(`${UPSTREAM}/`)) {
        const branch = `refs/heads/${ref.slice(UPSTREAM.length + 1)}`
        if (flag === ' ' || flag === '*') {
          advance.updated.push({ ref: branch, from: flag === '*' ? null : from, to })
        } else if (flag === '+') {
          advance.rewritten.push({
            ref: branch,
            mirror: await commitOf(mirror, branch),
            upstream: to,
          })
        } else if (flag === '!') {
          refused.push(line.trim())
        }
        // `=` is up to date; `-` (pruned) and `t` (a tag) never happen with these refspecs.
      } else if (flag === '!') {
        const branch = ref.slice('refs/heads/'.length)
        if ((await commitOf(mirror, `${UPSTREAM}/${branch}`)) !== to)
          refused.push(line.trim())
      }
    }
    if (refused.length > 0) {
      throw new SourceError(
        'SOURCE_GIT_FAILED',
        `git fetch refused ${refused.length} ref(s) into ${slug}'s mirror: ${refused.join('; ')}`,
      )
    }
    return advance
  }

  /**
   * ONE THING AT A TIME PER MIRROR, in this process (sitting 4, measured): concurrent fetches
   * into one mirror race for git's ref locks, and after a push 50 of 60 concurrent reads
   * failed `SOURCE_GIT_FAILED` (`! … refs/manifest/upstream/main`). A job waits for the one
   * before it and then runs its OWN — a sync never reuses the previous one's answer, which
   * may predate a push the caller has been told about. A previous job's FAILURE is its own
   * caller's to report (that caller awaits it); it does not fail the next one.
   */
  const busy = new Map<string, Promise<unknown>>()
  function exclusively<T>(slug: string, job: () => Promise<T>): Promise<T> {
    const before = busy.get(slug) ?? Promise.resolve()
    const next = before.then(job, job)
    busy.set(slug, next)
    const done = () => {
      if (busy.get(slug) === next) busy.delete(slug)
    }
    next.then(done, done)
    return next
  }

  /**
   * A fetch, and — when something moved — the observer, BOTH inside the mirror's turn, so
   * advances are reported in the order they happened and a report that fails fails this
   * sync's caller rather than vanishing (Decision 11). `report: false` is the creation's own
   * first fetch alone: that commit is `repository.seeded`, which the route publishes LAST,
   * because an event row would stop `deleteProject` undoing a failed creation (audit rows
   * are `ON DELETE RESTRICT`).
   */
  function sync(
    slug: string,
    mirror: string,
    how: { report: boolean } = { report: true },
  ): Promise<MirrorAdvance> {
    return exclusively(slug, async () => {
      const advance = await fetchInto(slug, mirror)
      advance.visibility = await enforcePrivate(slug, mirror)
      if (!how.report) return advance
      const scan = await scanUnreported(slug, mirror)
      advance.findings = scan.findings
      advance.unscannable = scan.unscannable
      const moved = advance.updated.length > 0 || advance.rewritten.length > 0
      if (
        moved ||
        advance.visibility?.observed === 'public' ||
        advance.findings.length > 0 ||
        advance.unscannable.length > 0
      ) {
        await o.observer.advanced(advance)
      }
      // ONLY NOW, with the report made: an observer that throws leaves these where they
      // were, and the next sync scans and reports the same commits again — the ones it could
      // not read included (Task 12), which is what makes `unscannable` a report and not a skip.
      for (const [branch, sha] of scan.heads) {
        await local(mirror, ['update-ref', `${SCANNED}/${branch}`, sha])
      }
      return advance
    })
  }

  /** Every ref under `prefix`, by branch name. */
  async function refsUnder(mirror: string, prefix: string): Promise<Map<string, string>> {
    const out = await local(mirror, [
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      `${prefix}/`,
    ])
    const refs = new Map<string, string>()
    for (const line of out.split('\n')) {
      const [ref, sha] = line.trim().split(' ')
      if (ref !== undefined && sha !== undefined)
        refs.set(ref.slice(prefix.length + 1), sha)
    }
    return refs
  }

  /**
   * PUSH-TIME SECRET SCANNING, driver 2's half (Task 11, Decision 14 (c)): GitHub.com runs no
   * custom pre-receive hook, so a push made straight to GitHub cannot be blocked from here —
   * only found, as soon as Manifest learns of it, whatever taught it: a webhook, a read, or its
   * own commit. What is scanned is every commit the SHADOW has and no `scanned` ref reaches,
   * so a rewritten history is new content and is scanned too (`[M14]`).
   */
  async function scanUnreported(
    slug: string,
    mirror: string,
  ): Promise<{
    findings: MirrorAdvance['findings']
    unscannable: string[]
    heads: Map<string, string>
  }> {
    const heads = await refsUnder(mirror, UPSTREAM)
    const scanned = await refsUnder(mirror, SCANNED)
    const fresh = [...heads].filter(([branch, sha]) => scanned.get(branch) !== sha)
    if (fresh.length === 0) return { findings: [], unscannable: [], heads }
    // EVERY new commit, to the end (Task 12): paged, never capped — so a branch marked scanned
    // below has had every commit read, or named in `unscannable`.
    const scan = await scanNewCommits(
      mirror,
      fresh.map(([, sha]) => sha),
      [...scanned.values()],
      o.scanLimits,
    )
    if (scan.unscannable.length > 0) {
      console.error(
        `github driver: ${o.org}/${slug}: ${scan.unscannable.length} of ${scan.commits} new commits were too large to scan for secrets (${scan.unscannable.map((c) => c.slice(0, 12)).join(', ')}) — reported, and the build's gate still scans every tree it builds`,
      )
    }
    return { findings: scan.findings, unscannable: scan.unscannable, heads }
  }

  /**
   * The mirror's LAST READ of GitHub's visibility (`manifest.visibility`) — no network. `null`
   * for no mirror, a key never written, or anything but the two words `enforcePrivate` writes.
   */
  async function readVisibility(mirror: string): Promise<RepositoryVisibility | null> {
    const read = await local(mirror, ['config', 'manifest.visibility']).then(
      (v) => v.trim(),
      () => '',
    )
    return read === 'private' || read === 'public' ? read : null
  }

  /** What GitHub says of the repository's visibility NOW: `true` private, `false` public. */
  async function readPrivate(slug: string): Promise<boolean> {
    const res = await restAs(slug, { contents: 'read' }, 'GET', `/repos/${o.org}/${slug}`)
    if (res.status !== 200) throw client.refusal(`read ${o.org}/${slug}`, res)
    // FAIL CLOSED: only GitHub's own `true` is private; anything else is treated as public.
    return (res.json as { private?: unknown }).private === true
  }

  /**
   * ENFORCED PRIVATE (Task 10, Decision 12) — on EVERY sync, whatever caused it: a webhook's
   * `publicized`, a read, or Manifest's own commit, so a laptop's real App, which never
   * receives a delivery, enforces it too. Read; if PUBLIC, make it private again with an
   * `administration: write` token for this repository alone; then READ AGAIN, because what
   * counts is what GitHub now says, not what was asked (as `createRepository` does). The last
   * read is kept on the mirror (`manifest.visibility`), where `localGitDir` refuses a build
   * while it says public — offline too.
   *
   * **GitHub unreachable after the fetch** leaves the answer `null` and the mirror's last
   * read as it was. A refused revert is an operator line with GitHub's STATUS — never its
   * body — and `still-public`, which the observer reports and the build path refuses.
   */
  async function enforcePrivate(
    slug: string,
    mirror: string,
  ): Promise<MirrorAdvance['visibility']> {
    let isPrivate: boolean
    try {
      isPrivate = await readPrivate(slug)
    } catch (error) {
      if (error instanceof SourceError && error.code === 'SOURCE_UNREACHABLE') return null
      throw error
    }
    if (isPrivate) {
      await local(mirror, ['config', 'manifest.visibility', 'private'])
      return { observed: 'private', enforced: false, result: 'private' }
    }
    const patched = await restAs(
      slug,
      { administration: 'write' },
      'PATCH',
      `/repos/${o.org}/${slug}`,
      { private: true },
    )
    if (patched.status !== 200) {
      console.error(
        `github driver: ${o.org}/${slug} was found PUBLIC, and GitHub refused to make it private again (HTTP ${patched.status}); it will not be built while it is public`,
      )
    }
    const now = await readPrivate(slug).catch((error: unknown) => {
      console.error(
        `github driver: ${o.org}/${slug}: the read after the revert failed (${error instanceof Error ? error.message : String(error)}); treated as still PUBLIC`,
      )
      return false
    })
    await local(mirror, ['config', 'manifest.visibility', now ? 'private' : 'public'])
    return {
      observed: 'public',
      enforced: true,
      result: now ? 'private' : 'still-public',
    }
  }

  /**
   * THE ONE WRITE PATH, driver 2's half (the authoring API plan's Task 3): a commit built with
   * no worktree (`source/plumbing.ts`) — on `base`, borrowing the MIRROR's objects — and pushed
   * to GitHub NON-FORCED with a `contents: write` token for this repository alone, which stays
   * in git's environment (Decision 4). `gitWithToken` answers exit 1 as stdout, so the verdict
   * is read from porcelain's own line for `main`: a moved branch is `SOURCE_CONFLICT`, and any
   * other refusal — GH006, a hook — is never read as success.
   */
  async function buildAndPush(
    slug: string,
    input: { objects: string; base: string | null; changes: readonly Change[] },
    message: string,
    author: GitIdentity,
    push: boolean,
  ): Promise<Omit<BuiltCommit, 'gitDir' | 'dispose'>> {
    const built = await buildCommit({ ...input, message, author })
    try {
      if (push) {
        const said = await withToken(slug, { contents: 'write' }, (token) =>
          gitWithToken(
            [
              '--git-dir',
              built.gitDir,
              'push',
              '--porcelain',
              remote(slug),
              `${built.commit}:refs/heads/main`,
            ],
            { cwd: tmpdir(), token, acceptExit: [1] },
          ),
        )
        const { verdict, line } = pushVerdict(said)
        if (verdict === 'conflict') {
          throw new SourceError(
            'SOURCE_CONFLICT',
            "GitHub's main moved while this commit was being made; read the tree again and retry",
          )
        }
        if (verdict === 'refused') {
          // A MOVED BRANCH IS A CONFLICT however it is worded (driver 1 measured a race lost
          // inside receive-pack as `[remote rejected]`): GitHub's `main` is read, not its words.
          if (input.base !== null) {
            await sync(slug, input.objects)
            if (
              (await commitOf(input.objects, `${UPSTREAM}/main^{commit}`)) !== input.base
            ) {
              throw new SourceError(
                'SOURCE_CONFLICT',
                "GitHub's main moved while this commit was being made; read the tree again and retry",
              )
            }
          }
          console.error(
            `github driver: GitHub refused Manifest's own push to ${o.org}/${slug}: ${tokens.redact(line ?? said.trim().split('\n').slice(-3).join(' | '))}`,
          )
          throw new SourceError(
            'SOURCE_GIT_FAILED',
            'GitHub refused the push; nothing was committed',
          )
        }
      }
      return { commit: built.commit, parent: built.parent, changes: built.changes }
    } finally {
      await built.dispose()
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
    await writeMirrorHook(mirror, slug)
    await local(mirror, ['config', 'manifest.visibility', 'private'])
    // What GitHub ANSWERED it is called — never rebuilt from the configuration by hand — and
    // what tells a mirror from a driver-1 repository in a shared root (`prepare`, Task 11).
    await local(mirror, ['config', 'manifest.fullName', named.fullName])
    await local(mirror, ['config', 'manifest.webUrl', named.webUrl])
  }

  /** The mirror's hook: it refuses EVERY push. Written at creation and at every boot. */
  async function writeMirrorHook(mirror: string, slug: string): Promise<void> {
    const hook = join(mirror, 'hooks', 'pre-receive')
    await mkdir(dirname(hook), { recursive: true })
    await writeFile(
      hook,
      '#!/bin/sh\n' +
        `echo "manifest: this repository is a mirror of GitHub (${o.org}/${slug}); push to GitHub, not here" >&2\n` +
        'exit 1\n',
    )
    await chmod(hook, 0o755)
  }

  /**
   * `main` PROTECTED WHERE GITHUB WILL (Task 12, Decision 13) — against rewriting and deletion,
   * and nothing more: no required reviews and no push restrictions, so faculty keep pushing
   * `main`. The body is conformance C13's. GitHub's `200` is protected. Its `403`/`404` — a
   * PRIVATE repository on a FREE organisation (`[M10]`(b), measured by C13) — is RECORDED,
   * with GitHub's own words, and never claimed as protected; the route publishes
   * `repository.protection_unavailable` for it. Anything else refuses the creation, which is
   * then undone. The mirror's non-forced history keeps what a release names on either plan.
   */
  async function protectMain(
    slug: string,
  ): Promise<Pick<RepositoryLink, 'mainProtected' | 'protectionDetail'>> {
    const res = await restAs(
      slug,
      { administration: 'write' },
      'PUT',
      `/repos/${o.org}/${slug}/branches/main/protection`,
      {
        required_status_checks: null,
        enforce_admins: false,
        required_pull_request_reviews: null,
        restrictions: null,
        allow_force_pushes: false,
        allow_deletions: false,
      },
    )
    if (res.status === 200) return { mainProtected: true, protectionDetail: null }
    if (res.status === 403 || res.status === 404) {
      const said = (res.json as { message?: unknown } | undefined)?.message
      return {
        mainProtected: false,
        // GitHub's own sentence, as a person would read it on GitHub — bounded, and with no
        // control characters, because it is shown on the project.
        protectionDetail:
          typeof said === 'string' && said.trim() !== ''
            ? said
                .replace(/[\u0000-\u001f\u007f]+/g, ' ')
                .trim()
                .slice(0, 500)
            : `GitHub answered ${res.status} and gave no reason`,
      }
    }
    throw client.refusal(`protect main on ${o.org}/${slug}`, res)
  }

  /**
   * THE REPOSITORY GONE FROM GITHUB — and gone ALREADY is gone (the front-end enablement plan's Task
   * 12): a delete that stopped after this step runs it again on its retry. GitHub then answers
   * `404` to the `DELETE` — or, first, `422` to the token for a repository the installation no
   * longer has, IN C5b'S OWN WORDS (conformance's golden, measured on github.com 2026-09-24 and
   * 2026-09-25): *"does not exist or is not accessible"*. GitHub cannot tell this App the two apart —
   * an inaccessible repository answers it `404` everywhere — so either way it is gone from what
   * Manifest can reach. **Any OTHER `422` is real** (the whole-branch review's I4): a token refused
   * its PERMISSIONS, after an organisation's owner narrowed the App, leaves the private repository
   * on GitHub, and reading it as destroyed would free the slug over it.
   */
  async function deleteOnGithub(slug: string): Promise<void> {
    let res
    try {
      res = await restAs(
        slug,
        { administration: 'write' },
        'DELETE',
        `/repos/${o.org}/${slug}`,
      )
    } catch (error) {
      if (
        error instanceof SourceError &&
        error.hostStatus === 422 &&
        error.message.includes('does not exist or is not accessible')
      )
        return
      throw error
    }
    if (res.status === 404) return
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
      // Before ANYTHING is asked of GitHub (Task 11): once pushed, a value is on GitHub for ever.
      assertWritablePaths(Object.keys(seed))
      assertNoSecrets(Object.entries(seed).map(([p, content]) => ({ path: p, content })))
      // A mirror already here is a repository this machine made once and did not delete —
      // refused, never reused or removed (Decision 16).
      if (existsSync(mirror)) {
        throw new SourceError(
          'SOURCE_REPOSITORY_EXISTS',
          `${projectSlug} already has a mirror on this machine; it is never reused or removed by a create`,
        )
      }
      let link: RepositoryLink
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
        // No base, so nothing is borrowed — the mirror is made after this push.
        const { commit: seeded } = await buildAndPush(
          projectSlug,
          {
            objects: mirror,
            base: null,
            changes: Object.entries(seed).map(([p, content]) => ({
              op: 'write' as const,
              path: p,
              content,
            })),
          },
          'chore: seed from blueprint skeleton',
          MANIFEST_COMMITTER,
          true,
        )
        if (typeof body.full_name !== 'string' || typeof body.html_url !== 'string') {
          throw client.refusal(
            `create ${o.org}/${projectSlug} (no name in the answer)`,
            created,
          )
        }
        // After the seed push — protection names a branch that must exist — and before the
        // mirror's first sync.
        link = {
          provider: 'github',
          fullName: body.full_name,
          webUrl: body.html_url,
          ...(await protectMain(projectSlug)),
        }
        await makeMirror(mirror, projectSlug, {
          fullName: body.full_name,
          webUrl: body.html_url,
        })
        await sync(projectSlug, mirror, { report: false })
        // The seed was scanned before it left (`assertNoSecrets`), so it is marked scanned:
        // the first REPORTED sync scans only what came after it — a person's push in the
        // moment between, included.
        await exclusively(projectSlug, () =>
          local(mirror, ['update-ref', `${SCANNED}/main`, seeded]),
        )
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
      return { ref: { projectSlug, provider: 'github' }, link }
    },

    async commit(repo, request) {
      const mirror = mirrorOf(repo)
      assertWritablePaths(request.changes.map((c) => c.path))
      assertNoSecrets(writesOf(request.changes))
      await sync(repo.projectSlug, mirror)
      // GitHub NOW, from the shadow — never the mirror's `refs/heads/main`, which a rewrite
      // freezes (the D5 plan's F6).
      const head = await commitOf(mirror, `${UPSTREAM}/main^{commit}`)
      if (request.base !== head) {
        throw new SourceError(
          'SOURCE_CONFLICT',
          `GitHub's main is ${head.slice(0, 12) || 'absent'} now, and these changes were computed from ${request.base.slice(0, 12)}; read the tree again and retry`,
        )
      }
      // THE CLIENT'S BASE (driver 1's reason): with the check above lost, GitHub still
      // refuses a stale base non-fast-forward at the push.
      const built = await buildAndPush(
        repo.projectSlug,
        { objects: mirror, base: request.base, changes: request.changes },
        request.message,
        request.author,
        request.dryRun !== true,
      )
      if (request.dryRun !== true) await sync(repo.projectSlug, mirror)
      return {
        commitSha: request.dryRun === true ? null : built.commit,
        parent: request.base,
        changes: built.changes,
      }
    },

    /**
     * GitHub's branch NOW (Decision 18): a sync first, then the SHADOW's ref — never the
     * history keeper's, which a rewrite freezes (the D5 plan's F6). An id is `present` — fetched
     * if the mirror lacks it — and a name is checked before git sees it (Task 4).
     */
    async resolveRef(repo, ref) {
      const mirror = mirrorOf(repo)
      if (COMMIT_ID.test(ref)) {
        await present(repo, mirror, ref)
        return ref
      }
      const noBranch = () =>
        new SourceError(
          'SOURCE_REF_NOT_FOUND',
          `${repo.projectSlug} has no branch '${ref}' on GitHub`,
        )
      if (!REF_NAME.test(ref)) throw noBranch()
      await sync(repo.projectSlug, mirror)
      const head = await commitOf(mirror, `${UPSTREAM}/${ref}^{commit}`)
      if (head === '') throw noBranch()
      return head
    },

    async headCommit(repo, ref = 'main') {
      return driver.resolveRef(repo, ref)
    },

    /** The read primitives (Task 4): the commit `present` in the MIRROR, then `reading.ts`. */
    async listTree(repo, commitSha) {
      const mirror = mirrorOf(repo)
      await present(repo, mirror, commitSha)
      return listTreeIn(mirror, commitSha)
    },

    async readText(repo, commitSha, path) {
      const mirror = mirrorOf(repo)
      await present(repo, mirror, commitSha)
      return readTextIn(mirror, commitSha, path)
    },

    async readBytes(repo, commitSha, path) {
      const mirror = mirrorOf(repo)
      await present(repo, mirror, commitSha)
      return readBytesIn(mirror, commitSha, path)
    },

    async history(repo, from, limit) {
      const mirror = mirrorOf(repo)
      await present(repo, mirror, from)
      return historyIn(mirror, from, limit)
    },

    async describeCommit(repo, commitSha) {
      const mirror = mirrorOf(repo)
      await present(repo, mirror, commitSha)
      return describeCommitIn(mirror, commitSha)
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
      // NEVER BUILT PUBLIC (Task 10, Decision 12): the LAST read of GitHub's visibility,
      // kept on the mirror, so the refusal holds with the network off. FAIL CLOSED (the
      // authoring API plan's Task 12; the D5 plan's final review, minor 2): a mirror whose
      // visibility was never read is SYNCED first, and if GitHub cannot say, nothing is built.
      let visibility = await readVisibility(mirror)
      if (visibility === null) {
        await sync(repo.projectSlug, mirror)
        visibility = await readVisibility(mirror)
      }
      if (visibility === null) {
        throw new SourceError(
          'SOURCE_UNREACHABLE',
          `${o.org}/${repo.projectSlug}'s visibility on GitHub has never been read, and GitHub did not answer; nothing is built from it until a read says it is private`,
        )
      }
      if (visibility === 'public') {
        throw new SourceError(
          'SOURCE_REPOSITORY_PUBLIC',
          `${o.org}/${repo.projectSlug} was last read PUBLIC on GitHub, and a public repository is never built (§20). Make it private on GitHub; the next sync reads it again.`,
        )
      }
      // PINNED before it is handed out (Task 9): a commit a build used stays reachable
      // whatever GitHub does to its branches (§13 — a release's commit stays buildable).
      await exclusively(repo.projectSlug, () =>
        local(mirror, ['update-ref', `${KEPT}/${commitSha}`, commitSha]),
      )
      return { gitDir: mirror, commitSha }
    },

    async sync(repo) {
      return sync(repo.projectSlug, mirrorOf(repo))
    },

    async lastVisibility(repo) {
      return readVisibility(mirrorOf(repo))
    },

    async destroyRepository(repo) {
      // Not `mirrorOf`: a second destroy finds no mirror, and that is its end state (Task 12).
      const mirror = assertOwned(repo)
      await deleteOnGithub(repo.projectSlug)
      tokens.forget(repo.projectSlug)
      await rm(mirror, { recursive: true, force: true })
    },

    /**
     * Every MIRROR under the root gets its refusing hook again (Task 11) — and a driver-1
     * repository in the same root is left exactly as it is (Decision 3): replacing its
     * secret-scanning hook with a mirror's would refuse every push its owner makes.
     */
    async prepare() {
      let repositories = 0
      for (const dir of await ownRepositories(root, true)) {
        await writeMirrorHook(dir, basename(dir, '.git'))
        repositories += 1
      }
      return { repositories }
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
