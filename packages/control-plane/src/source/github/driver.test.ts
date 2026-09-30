import { execFile } from 'node:child_process'
import { createPrivateKey } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import {
  startFake,
  type StartedFake,
  type StartFakeOptions,
} from '@manifest/github-fake/testing'
import { assembleContext, runMandatoryGates } from '../../build/index.js'
import { SAMPLE_SECRETS } from '../../build/testing.js'
import { describeSourceDriver } from '../driver-contract.js'
import { SourceError, type MirrorAdvance } from '../git-driver.js'
import type { ScanLimits } from '../scan-commits.js'
import {
  pushAsPerson,
  pushGitlinkAsPerson,
  pushSymlinkAsPerson,
  recordingObserver,
  rewriteAsPerson,
  tryDeleteMainAsPerson,
  tryForcePushMainAsPerson,
  writeFiles,
} from '../testing.js'
import { createGithubSourceDriver } from './driver.js'
import { gitWithToken } from './git.js'

const run = promisify(execFile)

interface Mint {
  repositories: string[] | undefined
  permissions: Record<string, string>
}

interface Harness {
  fake: StartedFake
  mirrorRoot: string
  /** Every installation token GitHub handed the driver, so a test can look for it anywhere. */
  minted: string[]
  /** What each mint ASKED for — the scope rule's evidence. */
  mints: Mint[]
  driver: ReturnType<typeof createGithubSourceDriver>
  /** Every advance the driver reported to its ONE observer (Task 9), in order. */
  advances: MirrorAdvance[]
  /** Makes the observer throw from now on (`undefined` stops it). */
  failObserver(error: Error | undefined): void
  /**
   * GitHub's REST read of a repository fails as a network failure, while git, token mints and
   * every other call still answer — a GitHub partly down (the authoring API plan's Task 12).
   */
  failRepositoryReads(on: boolean): void
  /**
   * Every token mint answers THIS instead of GitHub's answer, until `undefined` — a narrowed App —
   * and every call with a token this process already holds answers `401`, so the driver mints again.
   */
  refuseMints(answer: { status: number; message: string } | undefined): void
  /**
   * Runs once GitHub has answered `201` to a repository's creation, before the driver hears it —
   * where a test does to the new repository what nothing else can reach in time (FE-41's Task 6a).
   */
  onCreated(run: ((name: string) => Promise<void>) | undefined): void
  /** The same GitHub, restarted: same data, same App key, same port — and a new token key. */
  restart(): Promise<void>
  cleanup(): Promise<void>
}

async function harness(
  options: Parameters<typeof startFake>[0] = {},
  driverOptions: {
    scanLimits?: ScanLimits
    createRetryDelaysMs?: readonly number[]
  } = {},
): Promise<Harness> {
  const dataDir = await mkdtemp(join(tmpdir(), 'github-fake-data-'))
  const mirrorRoot = await mkdtemp(join(tmpdir(), 'manifest-mirror-'))
  const minted: string[] = []
  const mints: Mint[] = []
  let fake = await startFake({ ...options, dataDir })
  const observer = recordingObserver()
  let repositoryReadsFail = false
  let mintRefusal: { status: number; message: string } | undefined
  let created: ((name: string) => Promise<void>) | undefined
  // A spy on the wire. It never changes an answer — unless a test fails the repository read.
  const spyFetch: typeof fetch = async (input, init) => {
    if (
      repositoryReadsFail &&
      (init?.method ?? 'GET') === 'GET' &&
      /\/repos\/[^/]+\/[^/]+$/.test(String(input))
    ) {
      throw new TypeError('fetch failed')
    }
    if (mintRefusal !== undefined && String(input).endsWith('/access_tokens')) {
      return new Response(JSON.stringify({ message: mintRefusal.message }), {
        status: mintRefusal.status,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (mintRefusal !== undefined && /\/repos\//.test(String(input))) {
      return new Response(JSON.stringify({ message: 'Bad credentials' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }
    const res = await fetch(input, init)
    if (
      created !== undefined &&
      res.status === 201 &&
      init?.method === 'POST' &&
      String(input).endsWith(`/orgs/${fake.org}/repos`)
    ) {
      await created((JSON.parse(String(init.body)) as { name: string }).name)
    }
    if (String(input).endsWith('/access_tokens')) {
      const asked = JSON.parse(String(init?.body ?? '{}')) as Partial<Mint>
      if (res.status === 201) {
        mints.push({
          repositories: asked.repositories,
          permissions: asked.permissions ?? {},
        })
        minted.push(((await res.clone().json()) as { token: string }).token)
      }
    }
    return res
  }
  const driver = createGithubSourceDriver({
    mirrorRoot,
    apiUrl: fake.apiUrl,
    gitUrl: fake.gitUrl,
    org: fake.org,
    appId: fake.appId,
    installationId: fake.installationId,
    appKey: createPrivateKey(fake.appKeyPem),
    fetch: spyFetch,
    observer,
    ...driverOptions,
  })
  const h: Harness = {
    get fake() {
      return fake
    },
    mirrorRoot,
    minted,
    mints,
    driver,
    advances: observer.advances,
    failObserver: (error) => observer.fail(error),
    failRepositoryReads: (on) => {
      repositoryReadsFail = on
    },
    refuseMints: (answer) => {
      mintRefusal = answer
    },
    onCreated: (run) => {
      created = run
    },
    async restart() {
      const port = Number(new URL(fake.url).port)
      await fake.stop()
      fake = await startFake({ ...options, dataDir, port, appKeyPem: fake.appKeyPem })
    },
    async cleanup() {
      await fake.stop()
      await rm(dataDir, { recursive: true, force: true })
      await rm(mirrorRoot, { recursive: true, force: true })
    },
  }
  return h
}

/** git as `faculty-dev`, a PERSON, with their own token — outside Manifest. */
const asPerson = (fake: StartedFake, cwd: string) => ({ cwd, token: fake.developerToken })
const PERSON = [
  '-c',
  'user.name=person',
  '-c',
  'user.email=person@example.org',
  '-c',
  'commit.gpgsign=false',
]

async function createAsPerson(fake: StartedFake, slug: string): Promise<void> {
  const res = await fetch(`${fake.apiUrl}/orgs/${fake.org}/repos`, {
    method: 'POST',
    headers: {
      authorization: `token ${fake.developerToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: slug, private: true }),
  })
  expect(res.status).toBe(201)
}

async function getAsPerson(fake: StartedFake, slug: string): Promise<number> {
  const res = await fetch(`${fake.apiUrl}/repos/${fake.org}/${slug}`, {
    headers: { authorization: `token ${fake.developerToken}` },
  })
  return res.status
}

async function lsRemoteMain(fake: StartedFake, slug: string): Promise<string> {
  const out = await gitWithToken(
    ['ls-remote', `${fake.gitUrl}/${fake.org}/${slug}.git`, 'refs/heads/main'],
    asPerson(fake, tmpdir()),
  )
  return out.split('\t')[0]!.trim()
}

// D5's contract, UNCHANGED (Task 2), against the in-process fake — plus the one case only a
// remote driver can meet (sitting 1's F6), inside the same describe and harness.
describeSourceDriver(
  'github',
  async () => {
    const h = await harness()
    return {
      driver: h.driver,
      pushAsPerson: (slug, files, message) => pushAsPerson(h.fake, slug, files, message),
      forcePushMainAsPerson: (slug) => tryForcePushMainAsPerson(h.fake, slug),
      deleteMainAsPerson: (slug) => tryDeleteMainAsPerson(h.fake, slug),
      pushSymlinkAsPerson: (slug, path, target, message) =>
        pushSymlinkAsPerson(h.fake, slug, path, target, message),
      pushGitlinkAsPerson: (slug, path, commit, message) =>
        pushGitlinkAsPerson(h.fake, slug, path, commit, message),
      cleanup: h.cleanup,
    }
  },
  () => {
    // A rewrite GitHub TAKES needs a FREE organisation, where a private repository's main
    // cannot be protected (Read this first 8): the suite's own harness is a team plan, whose
    // main is protected since Task 12 — so this case brings its own GitHub.
    it("answers GitHub's head after a rewrite AND a normal push — never the mirror's frozen main (F6)", async () => {
      const g = await harness({ plan: 'free' })
      try {
        const { ref: repo } = await g.driver.createRepository('chem-labs', {
          'manifest.yaml': 'manifest: 1\nname: chem-labs\n',
        })
        const first = await g.driver.headCommit(repo)
        const rewritten = await rewriteAsPerson(g.fake, 'chem-labs')
        expect(rewritten).not.toBe(first)
        expect(await g.driver.headCommit(repo)).toBe(rewritten)
        const pushed = await pushAsPerson(
          g.fake,
          'chem-labs',
          { 'README.md': 'after the rewrite\n' },
          'a normal push',
        )
        expect(await g.driver.headCommit(repo)).toBe(pushed)
        expect(await g.driver.listBranches(repo)).toEqual(['main'])
        // The history keeper kept what a release may name (Decision 1), and it still builds.
        const mirror = join(g.mirrorRoot, 'chem-labs.git')
        const kept = await run('git', [
          '--git-dir',
          mirror,
          'rev-parse',
          'refs/heads/main',
        ])
        expect(kept.stdout.trim()).toBe(first)
        expect((await g.driver.localGitDir(repo, first)).commitSha).toBe(first)
        // And Manifest's own commit lands on GitHub NOW, not on the frozen main — as written
        // first it was SOURCE_CONFLICT for ever, however often the caller retried.
        const mine = await writeFiles(g.driver, repo, { 'x.txt': 'x\n' }, 'after')
        expect(await g.driver.headCommit(repo)).toBe(mine)
        expect(await lsRemoteMain(g.fake, 'chem-labs')).toBe(mine)
      } finally {
        await g.cleanup()
      }
    })
  },
)

describe('the GitHub driver keeps what only a REMOTE driver has to promise', () => {
  const SEED = { 'manifest.yaml': 'manifest: 1\nname: chem-labs\n' }

  /**
   * THE DELETE READS ONE 422 AS GONE, AND ONLY ONE (the front-end enablement plan's Task 12; its
   * whole-branch review's I4): GitHub refuses a token for a repository the installation lacks with
   * C5b's words — *"does not exist or is not accessible"* — and that is the retry of a delete whose
   * repository already went. A token refused for any OTHER reason — the App's permissions narrowed by
   * an organisation's owner — must not be read as the repository destroyed: it is still on GitHub,
   * private, and the delete says so and keeps the mirror, so its retry can finish it.
   */
  it('refuses to call a repository destroyed when GitHub refuses the token for any reason but its absence', async () => {
    const h = await harness()
    try {
      const { ref } = await h.driver.createRepository('chem-labs', SEED)
      h.refuseMints({
        status: 422,
        message: 'The permissions requested are not granted to this installation.',
      })
      await expect(h.driver.destroyRepository(ref)).rejects.toMatchObject({
        code: 'SOURCE_GITHUB_REFUSED',
      })
      expect(existsSync(join(h.mirrorRoot, 'chem-labs.git'))).toBe(true)
      // The positive control: C5b's own words ARE the repository gone — and so is a real delete.
      h.refuseMints({
        status: 422,
        message:
          'There is at least one repository that does not exist or is not accessible to the parent installation.',
      })
      await h.driver.destroyRepository(ref)
      expect(existsSync(join(h.mirrorRoot, 'chem-labs.git'))).toBe(false)
    } finally {
      await h.cleanup()
    }
  })

  /**
   * Decision 13, WHERE GITHUB WILL NOT (`[M10]`(b), measured by conformance C13): a FREE
   * organisation cannot protect a private repository's branch. The link says so in GitHub's own
   * words — never a protection GitHub refused — and a rewrite GitHub TAKES is still refused by
   * the mirror, so the history a release names holds on the free plan too.
   */
  it('free plan: main is recorded NOT protected, in GitHub’s words — and a force-push GitHub takes is still refused by the mirror', async () => {
    const h = await harness({ plan: 'free' })
    try {
      const created = await h.driver.createRepository('chem-labs', SEED)
      expect(created.link).toEqual({
        provider: 'github',
        fullName: `${h.fake.org}/chem-labs`,
        webUrl: expect.stringMatching(/\/chem-labs$/),
        mainProtected: false,
        protectionDetail:
          'Upgrade to GitHub Pro or make this repository public to enable this feature.',
        apiHost: new URL(h.fake.apiUrl).host,
      })
      const first = await h.driver.headCommit(created.ref)
      const forced = await tryForcePushMainAsPerson(h.fake, 'chem-labs')
      expect(forced).toEqual({ ok: true, said: '' }) // GitHub took it
      await h.driver.sync(created.ref)
      const mirror = join(h.mirrorRoot, 'chem-labs.git')
      const kept = await run('git', ['--git-dir', mirror, 'rev-parse', 'refs/heads/main'])
      expect(kept.stdout.trim()).toBe(first)
      expect((await h.driver.localGitDir(created.ref, first)).commitSha).toBe(first)
    } finally {
      await h.cleanup()
    }
  })

  it('team plan: GitHub’s own GH006 is what refuses a person’s force-push and deletion of main', async () => {
    const h = await harness({ plan: 'team' })
    try {
      await h.driver.createRepository('chem-labs', SEED)
      const forced = await tryForcePushMainAsPerson(h.fake, 'chem-labs')
      expect(forced.ok).toBe(false)
      expect(forced.said).toContain(
        'GH006: Protected branch update failed for refs/heads/main',
      )
      const deleted = await tryDeleteMainAsPerson(h.fake, 'chem-labs')
      expect(deleted.ok).toBe(false)
      expect(deleted.said).toContain('GH006')
    } finally {
      await h.cleanup()
    }
  })
  const codeOf = (p: Promise<unknown>) =>
    p.then(
      () => 'resolved',
      (e: unknown) => (e instanceof SourceError ? e.code : String(e)),
    )

  it('never puts a token where a person can read it — the canary', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      expect(h.minted.length).toBeGreaterThan(0) // the positive control: tokens WERE minted
      await h.fake.stop() // GitHub goes away mid-life
      const failure = await h.driver.headCommit(repo).catch((e: unknown) => e)
      expect(failure).toBeInstanceOf(SourceError)
      expect((failure as SourceError).code).toBe('SOURCE_UNREACHABLE')
      const visible = `${(failure as Error).message}\n${String(failure)}\n${JSON.stringify(failure)}`
      for (const t of h.minted) {
        expect(visible).not.toContain(t)
        expect(visible).not.toContain(
          Buffer.from(`x-access-token:${t}`).toString('base64'),
        )
      }
      expect(visible).not.toMatch(/ghs_\d+_/)
    } finally {
      await h.cleanup()
    }
  })

  it('scopes every token to ONE repository and the least permission, except the one that creates it', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      await writeFiles(h.driver, repo, { 'x.txt': 'x\n' }, 'one more')
      await h.driver.destroyRepository(repo)
      const wide = h.mints.filter((m) => m.repositories === undefined)
      expect(wide).toEqual([
        { repositories: undefined, permissions: { administration: 'write' } },
      ])
      const scoped = h.mints.filter((m) => m.repositories !== undefined)
      for (const m of scoped) {
        expect(m.repositories).toEqual(['chem-labs'])
        expect(Object.keys(m.permissions)).toHaveLength(1)
      }
      // The positive control: all three purposes were minted, each for its own step.
      expect(new Set(scoped.map((m) => JSON.stringify(m.permissions)))).toEqual(
        new Set([
          JSON.stringify({ contents: 'write' }),
          JSON.stringify({ contents: 'read' }),
          JSON.stringify({ administration: 'write' }),
        ]),
      )
    } finally {
      await h.cleanup()
    }
  })

  it('never adopts an orphan: a repository GitHub already has is SOURCE_REPOSITORY_EXISTS, and it is left alone', async () => {
    const h = await harness()
    try {
      await createAsPerson(h.fake, 'chem-labs')
      const theirs = await pushAsPerson(
        h.fake,
        'chem-labs',
        { 'theirs.txt': 'someone else\n' },
        'their work',
      )
      expect(await codeOf(h.driver.createRepository('chem-labs', SEED))).toBe(
        'SOURCE_REPOSITORY_EXISTS',
      )
      expect(await lsRemoteMain(h.fake, 'chem-labs')).toBe(theirs) // untouched
      expect(existsSync(join(h.mirrorRoot, 'chem-labs.git'))).toBe(false)
      // The positive control: a name nobody holds is created.
      expect(await codeOf(h.driver.createRepository('bio-labs', SEED))).toBe('resolved')
    } finally {
      await h.cleanup()
    }
  })

  it('refuses a repository GitHub did not make private, and deletes it', async () => {
    const h = await harness({ quirks: { createPublic: true } }) // the fake misbehaving on purpose
    try {
      expect(await codeOf(h.driver.createRepository('chem-labs', SEED))).toBe(
        'SOURCE_REPOSITORY_NOT_PRIVATE',
      )
      expect(await getAsPerson(h.fake, 'chem-labs')).toBe(404)
      expect(existsSync(join(h.mirrorRoot, 'chem-labs.git'))).toBe(false)
    } finally {
      await h.cleanup()
    }
  })

  it('records where GitHub says the repository lives, for the project row (Task 8)', async () => {
    const h = await harness()
    try {
      await h.driver.createRepository('chem-labs', SEED)
      const { stdout } = await run('git', [
        '--git-dir',
        join(h.mirrorRoot, 'chem-labs.git'),
        'config',
        'manifest.webUrl',
      ])
      expect(stdout.trim()).toBe(`${h.fake.url}/${h.fake.org}/chem-labs`)
    } finally {
      await h.cleanup()
    }
  })

  it('offline: a mirrored commit still builds, and HEAD is 503, never stale', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const head = await h.driver.headCommit(repo)
      await h.fake.stop()
      expect((await h.driver.localGitDir(repo, head)).commitSha).toBe(head)
      expect(await h.driver.readFile(repo, head, 'manifest.yaml')).toContain('chem-labs')
      expect(await codeOf(h.driver.headCommit(repo))).toBe('SOURCE_UNREACHABLE')
      expect(await codeOf(h.driver.localGitDir(repo, 'e'.repeat(40)))).toBe(
        'SOURCE_UNREACHABLE',
      )
    } finally {
      await h.cleanup()
    }
  })

  it('the mirror refuses a push, so it can never hold a commit GitHub has not seen', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const before = await h.driver.headCommit(repo)
      const mirror = join(h.mirrorRoot, 'chem-labs.git')
      const work = await mkdtemp(join(tmpdir(), 'mirror-push-'))
      try {
        await run('git', ['clone', '-q', mirror, work])
        await writeFile(join(work, 'sneaked.txt'), 'not on GitHub\n')
        await run('git', ['add', '-A'], { cwd: work })
        await run('git', [...PERSON, 'commit', '-qm', 'sneaked'], { cwd: work })
        const pushed = await run('git', ['push', '-q', 'origin', 'HEAD:main'], {
          cwd: work,
        }).then(
          () => 'accepted',
          (e: { stderr?: string }) => String(e.stderr),
        )
        expect(pushed).toContain('mirror of GitHub')
      } finally {
        await rm(work, { recursive: true, force: true })
      }
      expect(await h.driver.headCommit(repo)).toBe(before)
    } finally {
      await h.cleanup()
    }
  })

  it('re-mints once after GitHub forgets a token (a restarted fake), and succeeds', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const head = await h.driver.headCommit(repo)
      const read = JSON.stringify({ contents: 'read' })
      const readsBefore = h.mints.filter(
        (m) => JSON.stringify(m.permissions) === read,
      ).length
      await h.restart() // a new token key: every token minted before is now refused
      const pushed = await pushAsPerson(h.fake, 'chem-labs', { 'b.txt': 'b\n' }, 'after')
      expect(pushed).not.toBe(head)
      expect(await h.driver.headCommit(repo)).toBe(pushed)
      const readsAfter = h.mints.filter(
        (m) => JSON.stringify(m.permissions) === read,
      ).length
      expect(readsAfter - readsBefore).toBe(1)
    } finally {
      await h.cleanup()
    }
  })

  /**
   * ONE SYNC AT A TIME PER MIRROR (sitting 4, measured before it was fixed): after a push,
   * six concurrent reads of one project — what a validate and a build side by side are —
   * failed 50 times in 60 with SOURCE_GIT_FAILED, because every fetch tried to move the same
   * refs and all but one lost git's ref lock (`! … refs/manifest/upstream/main`).
   */
  it('serialises its syncs: concurrent reads after a push all answer the push', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const pushed = await pushAsPerson(h.fake, 'chem-labs', { 'b.txt': 'b\n' }, 'a push')
      const heads = await Promise.allSettled(
        Array.from({ length: 6 }, () => h.driver.headCommit(repo)),
      )
      expect(
        heads.map((x) =>
          x.status === 'fulfilled' ? x.value : (x.reason as SourceError).code,
        ),
      ).toEqual(Array(6).fill(pushed))
    } finally {
      await h.cleanup()
    }
  })

  it('refuses a stale mirror directory rather than deleting it', async () => {
    const h = await harness()
    try {
      const stale = join(h.mirrorRoot, 'chem-labs.git')
      await mkdir(stale)
      await writeFile(join(stale, 'marker'), 'somebody’s\n')
      expect(await codeOf(h.driver.createRepository('chem-labs', SEED))).toBe(
        'SOURCE_REPOSITORY_EXISTS',
      )
      expect(existsSync(join(stale, 'marker'))).toBe(true)
      expect(await getAsPerson(h.fake, 'chem-labs')).toBe(404) // nothing made on GitHub
    } finally {
      await h.cleanup()
    }
  })
})

describe('the GitHub driver reports every advance of its mirror, once, to ONE observer (Task 9, Decision 11)', () => {
  const SEED = { 'manifest.yaml': 'manifest: 1\nname: chem-labs\n' }
  const MAIN = 'refs/heads/main'
  /** What every sync reads since Task 10: GitHub says private, and nothing was done. */
  const READ_PRIVATE = { observed: 'private', enforced: false, result: 'private' }
  const gitIn = (mirror: string, args: string[]) =>
    run('git', ['--git-dir', mirror, ...args]).then((r) => r.stdout.trim())

  it("does not report the creation's own first fetch — `repository.seeded` is that event, published LAST", async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      expect(await h.driver.headCommit(repo)).toMatch(/^[0-9a-f]{40}$/)
      expect(h.advances).toEqual([])
    } finally {
      await h.cleanup()
    }
  })

  it("reports a person's push ONCE, as updated from → to, and a quiet sync not at all", async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const seed = await h.driver.headCommit(repo)
      const pushed = await pushAsPerson(h.fake, 'chem-labs', { 'b.txt': 'b\n' }, 'a push')
      const advance = await h.driver.sync(repo)
      const expected = {
        projectSlug: 'chem-labs',
        updated: [{ ref: MAIN, from: seed, to: pushed }],
        rewritten: [],
        visibility: READ_PRIVATE,
        findings: [],
        unscannable: [],
      }
      expect(advance).toEqual(expected)
      expect(h.advances).toEqual([expected])
      // Nothing moved: an empty answer, and nothing handed to the observer.
      expect(await h.driver.sync(repo)).toEqual({
        projectSlug: 'chem-labs',
        updated: [],
        rewritten: [],
        visibility: READ_PRIVATE,
        findings: [],
        unscannable: [],
      })
      expect(await h.driver.headCommit(repo)).toBe(pushed)
      expect(h.advances).toHaveLength(1)
    } finally {
      await h.cleanup()
    }
  })

  it('reports a rewrite ONCE, as rewritten — and the next normal push as updated, never as another rewrite ([M14])', async () => {
    const h = await harness({ plan: 'free' })
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const first = await h.driver.headCommit(repo)
      const rewritten = await rewriteAsPerson(h.fake, 'chem-labs')
      expect(await h.driver.sync(repo)).toEqual({
        projectSlug: 'chem-labs',
        updated: [],
        rewritten: [{ ref: MAIN, mirror: first, upstream: rewritten }],
        visibility: READ_PRIVATE,
        findings: [],
        unscannable: [],
      })
      const pushed = await pushAsPerson(h.fake, 'chem-labs', { 'c.txt': 'c\n' }, 'normal')
      expect(await h.driver.sync(repo)).toEqual({
        projectSlug: 'chem-labs',
        updated: [{ ref: MAIN, from: rewritten, to: pushed }],
        rewritten: [],
        visibility: READ_PRIVATE,
        findings: [],
        unscannable: [],
      })
      expect(h.advances.map((a) => [a.updated.length, a.rewritten.length])).toEqual([
        [0, 1],
        [1, 0],
      ])
      // The history keeper still holds what a release may name (Task 7's control (f)).
      const mirror = join(h.mirrorRoot, 'chem-labs.git')
      expect(await gitIn(mirror, ['rev-parse', MAIN])).toBe(first)
    } finally {
      await h.cleanup()
    }
  })

  it('pins every commit it hands the builder: one GitHub rewrote away still builds after gc', async () => {
    const h = await harness({ plan: 'free' })
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      // X is GitHub's main after a rewrite: reachable in the mirror only through the shadow.
      const x = await rewriteAsPerson(h.fake, 'chem-labs')
      expect((await h.driver.localGitDir(repo, x)).commitSha).toBe(x)
      const mirror = join(h.mirrorRoot, 'chem-labs.git')
      expect(await gitIn(mirror, ['rev-parse', `refs/manifest/kept/${x}`])).toBe(x)
      // GitHub rewrites again: the shadow moves off X, and gc runs in the mirror.
      await rewriteAsPerson(h.fake, 'chem-labs')
      await h.driver.sync(repo)
      await gitIn(mirror, ['reflog', 'expire', '--expire=now', '--all'])
      await gitIn(mirror, ['gc', '-q', '--prune=now'])
      expect((await h.driver.localGitDir(repo, x)).commitSha).toBe(x)
    } finally {
      await h.cleanup()
    }
  })

  it('an observer that fails fails the read that synced — a report is never swallowed', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      await pushAsPerson(h.fake, 'chem-labs', { 'b.txt': 'b\n' }, 'a push')
      h.failObserver(new Error('the database is down'))
      await expect(h.driver.headCommit(repo)).rejects.toThrow('the database is down')
    } finally {
      await h.cleanup()
    }
  })
})

describe('the GitHub driver keeps every repository PRIVATE — found public, made private again, never built public (Task 10, Decision 12)', () => {
  const SEED = { 'manifest.yaml': 'manifest: 1\nname: chem-labs\n' }
  const PRIVATE = { observed: 'private', enforced: false, result: 'private' }
  const codeOf = (p: Promise<unknown>) =>
    p.then(
      () => 'resolved',
      (e: unknown) => (e instanceof SourceError ? e.code : String(e)),
    )
  /** A PERSON changing visibility on GitHub, as anyone with admin can. */
  async function makePublic(fake: StartedFake, slug: string): Promise<void> {
    const res = await fetch(`${fake.apiUrl}/repos/${fake.org}/${slug}`, {
      method: 'PATCH',
      headers: {
        authorization: `token ${fake.developerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ private: false }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { private: boolean }).private).toBe(false)
  }
  async function isPrivate(fake: StartedFake, slug: string): Promise<boolean> {
    const res = await fetch(`${fake.apiUrl}/repos/${fake.org}/${slug}`, {
      headers: { authorization: `token ${fake.developerToken}` },
    })
    return ((await res.json()) as { private: boolean }).private
  }

  it('reads visibility on every sync — a repository nobody touched reads private, and nothing is reported (the positive control)', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      expect((await h.driver.sync(repo)).visibility).toEqual(PRIVATE)
      expect(h.advances).toEqual([])
    } finally {
      await h.cleanup()
    }
  })

  it('with NO webhook, a read’s sync finds it public and makes it private again, and reports it once', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      await makePublic(h.fake, 'chem-labs')
      await h.driver.headCommit(repo)
      expect(await isPrivate(h.fake, 'chem-labs')).toBe(true)
      expect(h.advances).toEqual([
        {
          projectSlug: 'chem-labs',
          updated: [],
          rewritten: [],
          visibility: { observed: 'public', enforced: true, result: 'private' },
          findings: [],
          unscannable: [],
        },
      ])
      const head = await h.driver.headCommit(repo)
      expect((await h.driver.localGitDir(repo, head)).commitSha).toBe(head)
      expect(h.advances).toHaveLength(1)
    } finally {
      await h.cleanup()
    }
  })

  it('a mirror whose visibility was NEVER READ is read before it is built — and refused SOURCE_UNREACHABLE when GitHub cannot say (the authoring API plan’s Task 12)', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const head = await h.driver.headCommit(repo)
      const mirror = join(h.mirrorRoot, 'chem-labs.git')
      const unset = () =>
        run('git', ['--git-dir', mirror, 'config', '--unset', 'manifest.visibility'])
      await unset()
      expect(await h.driver.lastVisibility(repo)).toBeNull()
      // GitHub answers: the build path reads it first — private — and builds (the positive control).
      expect((await h.driver.localGitDir(repo, head)).commitSha).toBe(head)
      expect(await h.driver.lastVisibility(repo)).toBe('private')
      // GitHub's git answers and its API does not: the sync FETCHES and still cannot read the
      // visibility — the case the refusal after the sync exists for. (Offline, below, the sync
      // itself refuses first; control (h) of sitting 9 found that case alone could not see it.)
      await unset()
      h.failRepositoryReads(true)
      expect(await codeOf(h.driver.localGitDir(repo, head))).toBe('SOURCE_UNREACHABLE')
      expect(await h.driver.lastVisibility(repo)).toBeNull()
      h.failRepositoryReads(false)
      // GitHub gone and nothing read (the key is still unset): FAIL CLOSED, rather than build
      // what may be public.
      await h.fake.stop()
      expect(await codeOf(h.driver.localGitDir(repo, head))).toBe('SOURCE_UNREACHABLE')
    } finally {
      await h.cleanup()
    }
  })

  it('a revert GitHub REFUSES stays still-public, and the mirror refuses a build — offline too — until a sync reads private', async () => {
    const quirks = { refusePrivatize: true }
    const h = await harness({ quirks })
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const head = await h.driver.headCommit(repo)
      await makePublic(h.fake, 'chem-labs')
      expect((await h.driver.sync(repo)).visibility).toEqual({
        observed: 'public',
        enforced: true,
        result: 'still-public',
      })
      expect(await isPrivate(h.fake, 'chem-labs')).toBe(false)
      expect(await codeOf(h.driver.localGitDir(repo, head))).toBe(
        'SOURCE_REPOSITORY_PUBLIC',
      )
      // What a client is told (Task 12, minor 3): the mirror's last read, not "private".
      expect(await h.driver.lastVisibility(repo)).toBe('public')
      // GitHub gone: the LAST KNOWN state holds — a build needs no network to be refused.
      await h.fake.stop()
      expect(await codeOf(h.driver.localGitDir(repo, head))).toBe(
        'SOURCE_REPOSITORY_PUBLIC',
      )
      // GitHub back, and the organisation's policy lifted: the next sync makes it private.
      quirks.refusePrivatize = false
      await h.restart()
      expect((await h.driver.sync(repo)).visibility).toEqual({
        observed: 'public',
        enforced: true,
        result: 'private',
      })
      expect((await h.driver.localGitDir(repo, head)).commitSha).toBe(head)
      expect(await h.driver.lastVisibility(repo)).toBe('private')
    } finally {
      await h.cleanup()
    }
  })
})

describe('the GitHub driver scans every commit its mirror learns of, and reports what it finds at least once (Task 11, Decision 14 (c))', () => {
  const SEED = { 'manifest.yaml': 'manifest: 1\nname: chem-labs\n' }
  const KEY = SAMPLE_SECRETS['an AWS access key id']
  const BLUEPRINT_DIR = fileURLToPath(
    new URL('../../../../../blueprints/fixture-node/', import.meta.url),
  )
  /** A person pushing a key STRAIGHT TO GITHUB — which GitHub.com lets them do (§20). */
  const pushKey = (h: Harness, path = 'config/aws.js') =>
    pushAsPerson(
      h.fake,
      'chem-labs',
      { [path]: `// config\nmodule.exports = '${KEY}'\n` },
      'a key',
    )

  it('names the commit, the path, the line and the rule — never the key — and a second sync reports nothing new', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const pushed = await pushKey(h)
      const advance = await h.driver.sync(repo)
      expect(advance.findings).toEqual([
        { commit: pushed, path: 'config/aws.js', line: 2, rule: 'an AWS access key id' },
      ])
      expect(JSON.stringify(advance)).not.toContain(KEY)
      expect(h.advances).toEqual([advance])
      // Scanned once: the next sync finds nothing new, and reports nothing.
      expect((await h.driver.sync(repo)).findings).toEqual([])
      expect(h.advances).toHaveLength(1)
    } finally {
      await h.cleanup()
    }
  })

  it('reports it even when NO webhook arrived — a read’s sync found it', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const pushed = await pushKey(h)
      expect(await h.driver.headCommit(repo)).toBe(pushed)
      expect(h.advances.flatMap((a) => a.findings)).toEqual([
        { commit: pushed, path: 'config/aws.js', line: 2, rule: 'an AWS access key id' },
      ])
    } finally {
      await h.cleanup()
    }
  })

  it('reports AT LEAST ONCE: an observer that fails leaves the commit unscanned, and the next sync reports it again', async () => {
    const h = await harness()
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const pushed = await pushKey(h)
      h.failObserver(new Error('the database is down'))
      await expect(h.driver.sync(repo)).rejects.toThrow('the database is down')
      h.failObserver(undefined)
      // Nothing MOVED on this sync — the fetch took the push the first time — and the finding
      // is reported anyway, because the scan is against what was last REPORTED.
      const again = await h.driver.sync(repo)
      expect(again.updated).toEqual([])
      expect(again.findings.map((f) => f.commit)).toEqual([pushed])
      expect(h.advances).toHaveLength(1)
    } finally {
      await h.cleanup()
    }
  })

  it('names a commit TOO LARGE TO SCAN — reported on its own, at least once, and never marked scanned before the report (the authoring API plan’s Task 12)', async () => {
    // A 4 KiB batch, so an ~11 KiB commit is past it without pushing 20 MiB to the fake.
    const h = await harness({}, { scanLimits: { commits: 1000, bytes: 4096 } })
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const long = Array.from(
        { length: 300 },
        (_, i) => `line ${i} of a file too large to scan`,
      )
      const big = await pushAsPerson(
        h.fake,
        'chem-labs',
        { 'big.txt': long.join('\n') + '\n' },
        'a large file',
      )
      h.failObserver(new Error('the database is down'))
      await expect(h.driver.sync(repo)).rejects.toThrow('the database is down')
      h.failObserver(undefined)
      // Nothing moved on this sync and nothing was FOUND — reported because of the commit the
      // scan could not read, which the failed report left unmarked.
      const again = await h.driver.sync(repo)
      expect(again).toMatchObject({ updated: [], findings: [], unscannable: [big] })
      expect(h.advances).toEqual([again])
      // Reported once: marked after the report, so the next sync names nothing.
      expect((await h.driver.sync(repo)).unscannable).toEqual([])
      expect(h.advances).toHaveLength(1)
    } finally {
      await h.cleanup()
    }
  })

  it('a secret pushed to main AFTER a rewrite is reported — one force-push does not switch scanning off ([M14])', async () => {
    const h = await harness({ plan: 'free' })
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      await rewriteAsPerson(h.fake, 'chem-labs')
      await h.driver.sync(repo)
      const pushed = await pushKey(h, 'after-rewrite.js')
      const advance = await h.driver.sync(repo)
      expect(advance.findings).toEqual([
        {
          commit: pushed,
          path: 'after-rewrite.js',
          line: 2,
          rule: 'an AWS access key id',
        },
      ])
    } finally {
      await h.cleanup()
    }
  })

  it('a commit GitHub has with a key in it still cannot be DEPLOYED: the build’s gate refuses its tree', async () => {
    const h = await harness()
    const work = await mkdtemp(join(tmpdir(), 'mf-gate-'))
    try {
      const { ref: repo } = await h.driver.createRepository('chem-labs', SEED)
      const clean = await h.driver.headCommit(repo)
      const pushed = await pushKey(h)
      const secrets = async (sha: string) => {
        const local = await h.driver.localGitDir(repo, sha)
        const context = await assembleContext({
          repoPath: local.gitDir,
          commitSha: local.commitSha,
          blueprintDir: BLUEPRINT_DIR,
          workDir: await mkdtemp(join(work, 'w-')),
        })
        return (
          await runMandatoryGates(context, { lockfile: 'package-lock.json' })
        ).filter((f) => f.gate === 'secret')
      }
      expect(await secrets(clean)).toEqual([]) // the positive control
      expect(await secrets(pushed)).toEqual([
        expect.objectContaining({
          path: 'config/aws.js',
          line: 2,
          message: 'looks like an AWS access key id',
        }),
      ])
    } finally {
      await rm(work, { recursive: true, force: true })
      await h.cleanup()
    }
  })

  it('prepare() re-writes each MIRROR’s refusing hook and leaves a driver-1 repository alone', async () => {
    const h = await harness()
    try {
      await h.driver.createRepository('chem-labs', SEED)
      const hook = join(h.mirrorRoot, 'chem-labs.git', 'hooks', 'pre-receive')
      const refusing = await readFile(hook, 'utf8')
      await rm(hook)
      // A driver-1 repository in the same root (a laptop that switched drivers): not a mirror.
      const local = join(h.mirrorRoot, 'bio-labs.git')
      await run('git', ['init', '-q', '--bare', '-b', 'main', local])
      await writeFile(join(local, 'hooks', 'pre-receive'), '#!/bin/sh\nexit 0\n', {
        mode: 0o755,
      })
      expect(await h.driver.prepare()).toEqual({ repositories: 1 })
      expect(await readFile(hook, 'utf8')).toBe(refusing)
      expect(await readFile(join(local, 'hooks', 'pre-receive'), 'utf8')).toBe(
        '#!/bin/sh\nexit 0\n',
      )
    } finally {
      await h.cleanup()
    }
  })

  /**
   * A MIRROR OF ANOTHER GITHUB IS LEFT ALONE AT BOOT (the launch path plan's Task 2, `[M1]`: Task
   * 1's F1). The real App's first boot counted the FAKE's two orphaned mirrors
   * (`frontend-github.git`, `manifest.webUrl` `http://127.0.0.1:7110/…`) and rewrote their hooks as
   * its own: nothing on disk told a fake-made mirror from a real one. A mirror's `manifest.webUrl`
   * is what GitHub answered at creation, so its host is the GitHub that made it.
   */
  it('prepare() leaves a mirror of ANOTHER GitHub alone — and still prepares its own', async () => {
    const h = await harness()
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await h.driver.createRepository('chem-labs', SEED)
      await h.driver.createRepository('bio-labs', SEED)
      const hookOf = (slug: string) =>
        join(h.mirrorRoot, `${slug}.git`, 'hooks', 'pre-receive')
      const refusing = await readFile(hookOf('chem-labs'), 'utf8')
      // `bio-labs` becomes a mirror some OTHER GitHub made — the fake's, seen from a real App.
      await run('git', [
        '--git-dir',
        join(h.mirrorRoot, 'bio-labs.git'),
        'config',
        'manifest.webUrl',
        'http://127.0.0.1:1/manifest-apps/bio-labs',
      ])
      const foreign = '#!/bin/sh\necho "another GitHub\'s mirror" >&2\nexit 1\n'
      await writeFile(hookOf('bio-labs'), foreign, { mode: 0o755 })
      await rm(hookOf('chem-labs'))

      expect(await h.driver.prepare()).toEqual({ repositories: 1 })
      expect(await readFile(hookOf('bio-labs'), 'utf8')).toBe(foreign) // left alone
      expect(await readFile(hookOf('chem-labs'), 'utf8')).toBe(refusing) // the positive control
      // Said, naming the directory and both hosts — a skip nobody can see is indistinguishable
      // from a boot that never looked.
      const line = said.mock.calls
        .map((c) => c.map(String).join(' '))
        .find((l) => l.includes('bio-labs.git'))
      expect(line).toContain('127.0.0.1:1')
      expect(line).toContain(new URL(h.fake.gitUrl).host)
    } finally {
      said.mockRestore()
      await h.cleanup()
    }
  })
})

/**
 * FE-41 (the launch path plan's Task 6a, measured on real GitHub 2026-09-29): a repository GitHub
 * had created seconds before was answered NOT FOUND over git — the seed push, or the creation's
 * first fetch, with or without a starter — for roughly 2–4 s, and the same token's next try landed.
 * The fake's `notFoundAfterCreate` quirk answers the same way, in git's same words. The driver's
 * CREATION tries those two steps again, bounded, and says so each time — and nothing else does.
 */
describe('the GitHub driver absorbs GitHub’s lag on a repository it has just made — and only there (FE-41, Task 6a)', () => {
  const SEED = { 'manifest.yaml': 'manifest: 1\nname: chem-labs\n' }
  /** Six attempts and no waiting: the default's shape without its 30 s. */
  const FAST = { createRetryDelaysMs: [0, 0, 0, 0, 0] }
  const AUTHOR = { name: 'person', email: 'person@example.org' }
  /** The retry's operator lines — each one names FE-41. */
  const retries = (said: { mock: { calls: unknown[][] } }) =>
    said.mock.calls
      .map((c) => c.map(String).join(' '))
      .filter((line) => line.includes('FE-41'))
  const upstreamMain = (h: Harness, slug: string) =>
    run('git', [
      '--git-dir',
      join(h.mirrorRoot, `${slug}.git`),
      'rev-parse',
      'refs/manifest/upstream/main',
    ]).then((r) => r.stdout.trim())
  const codeOf = (p: Promise<unknown>) =>
    p.then(
      () => 'resolved',
      (e: unknown) => (e instanceof SourceError ? e.code : String(e)),
    )

  it('a seed push GitHub answers not found TWICE is tried again: the repository is made, seeded and mirrored, and the lag is said', async () => {
    const h = await harness({ quirks: { notFoundAfterCreate: { push: 2 } } }, FAST)
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { ref } = await h.driver.createRepository('chem-labs', SEED)
      const onGithub = await lsRemoteMain(h.fake, 'chem-labs')
      expect(onGithub).toMatch(/^[0-9a-f]{40}$/)
      // Synced by the creation itself, before anything else asked.
      expect(await upstreamMain(h, 'chem-labs')).toBe(onGithub)
      expect(await h.driver.readFile(ref, onGithub, 'manifest.yaml')).toBe(
        SEED['manifest.yaml'],
      )
      const lines = retries(said)
      expect(lines).toHaveLength(2)
      expect(lines[0]).toContain(`${h.fake.org}/chem-labs`)
      expect(lines[0]).toContain('the seed push')
      expect(lines[0]).toContain('attempt 1 of 6')
      expect(lines[0]).toContain('remote: Repository not found.')
      expect(lines[1]).toContain('attempt 2 of 6')
      expect(h.minted.length).toBeGreaterThan(0)
      for (const token of h.minted) expect(lines.join('\n')).not.toContain(token)
    } finally {
      said.mockRestore()
      await h.cleanup()
    }
  })

  it('a seed push answered with NO line for main — lp-starter-g’s `Done` — is tried again, and lands', async () => {
    const h = await harness({ quirks: { notFoundAfterCreate: { pushPack: 1 } } }, FAST)
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { ref } = await h.driver.createRepository('chem-labs', SEED)
      const onGithub = await lsRemoteMain(h.fake, 'chem-labs')
      expect(await upstreamMain(h, 'chem-labs')).toBe(onGithub)
      expect(await h.driver.headCommit(ref)).toBe(onGithub)
      const lines = retries(said)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain('the seed push')
      expect(lines[0]).toContain('no line for refs/heads/main')
      expect(lines[0]).toContain('Done')
      // Absorbed, so never reported as the refusal it would have been.
      expect(
        said.mock.calls.flat().some((l) => String(l).includes('refused Manifest')),
      ).toBe(false)
    } finally {
      said.mockRestore()
      await h.cleanup()
    }
  })

  it('a first fetch GitHub answers not found is tried again, and the mirror holds what GitHub has', async () => {
    const h = await harness({ quirks: { notFoundAfterCreate: { fetch: 1 } } }, FAST)
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await h.driver.createRepository('chem-labs', SEED)
      expect(await upstreamMain(h, 'chem-labs')).toBe(
        await lsRemoteMain(h.fake, 'chem-labs'),
      )
      const lines = retries(said)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain(`${h.fake.org}/chem-labs`)
      expect(lines[0]).toContain('the first fetch')
      expect(lines[0]).toContain('attempt 1 of 6')
      expect(lines[0]).toContain('remote: Repository not found.')
    } finally {
      said.mockRestore()
      await h.cleanup()
    }
  })

  it('past the bound it fails as it always did — SOURCE_GIT_FAILED — and leaves nothing on GitHub or here', async () => {
    const quirks: NonNullable<StartFakeOptions['quirks']> = {
      notFoundAfterCreate: { push: 99 },
    }
    const h = await harness({ quirks }, { createRetryDelaysMs: [0, 0] })
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      // The seed push: git's own words, from the LAST attempt.
      await expect(h.driver.createRepository('chem-labs', SEED)).rejects.toMatchObject({
        code: 'SOURCE_GIT_FAILED',
        message: expect.stringContaining('Repository not found'),
      })
      // The first fetch: the mirror was made before it, and goes with the repository.
      quirks.notFoundAfterCreate = { fetch: 99 }
      await expect(h.driver.createRepository('bio-labs', SEED)).rejects.toMatchObject({
        code: 'SOURCE_GIT_FAILED',
        message: expect.stringContaining('Repository not found'),
      })
      // The push that never answers for main: its refusal, exactly as before.
      quirks.notFoundAfterCreate = { pushPack: 99 }
      await expect(h.driver.createRepository('geo-labs', SEED)).rejects.toMatchObject({
        code: 'SOURCE_GIT_FAILED',
        message: 'GitHub refused the push; nothing was committed',
      })
      for (const slug of ['chem-labs', 'bio-labs', 'geo-labs']) {
        expect(await getAsPerson(h.fake, slug)).toBe(404)
        expect(existsSync(join(h.mirrorRoot, `${slug}.git`))).toBe(false)
      }
      // Two retries each (attempts 1 and 2 of 3); the third attempt's failure is the answer.
      const lines = retries(said)
      expect(lines).toHaveLength(6)
      expect(lines.filter((l) => l.includes('attempt 2 of 3'))).toHaveLength(3)
    } finally {
      said.mockRestore()
      await h.cleanup()
    }
  })

  it('ONLY a creation is retried: the same answer to a later read or commit fails at once, and is not said as a retry', async () => {
    const quirks: NonNullable<StartFakeOptions['quirks']> = {}
    const h = await harness({ quirks }, FAST)
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { ref } = await h.driver.createRepository('chem-labs', SEED)
      const head = await h.driver.headCommit(ref)
      // Outside the creation, not found means gone or out of reach — never waited out.
      quirks.notFoundAfterCreate = { fetch: 1 }
      await expect(h.driver.headCommit(ref)).rejects.toMatchObject({
        code: 'SOURCE_GIT_FAILED',
        message: expect.stringContaining('Repository not found'),
      })
      expect(await h.driver.headCommit(ref)).toBe(head) // the one refusal is spent
      quirks.notFoundAfterCreate = { fetch: 1, push: 1 }
      const change = {
        base: head,
        changes: [{ op: 'write' as const, path: 'b.txt', content: 'b\n' }],
        message: 'b',
        author: AUTHOR,
      }
      await expect(h.driver.commit(ref, change)).rejects.toMatchObject({
        code: 'SOURCE_GIT_FAILED',
        message: expect.stringContaining('Repository not found'),
      })
      expect((await h.driver.commit(ref, change)).commitSha).toMatch(/^[0-9a-f]{40}$/)
      expect(retries(said)).toEqual([])
    } finally {
      said.mockRestore()
      await h.cleanup()
    }
  })

  /**
   * A REFUSAL WITH A VERDICT IS A VERDICT: a line for `main` — `[remote rejected]`, GH006, GH013 —
   * is GitHub deciding, not GitHub not yet knowing the repository, and is never tried again. The
   * fake's own hook refuses only a rewrite or a deletion, which a first push is not, so the test
   * puts a refusing `pre-receive` — the mechanism the fake's GH006 is made of — into the new
   * repository the moment GitHub answers `201`; the line is real git's.
   */
  it('a seed push GitHub REFUSES with a line for main is not tried again — it fails at once, and is undone', async () => {
    const h = await harness({}, FAST)
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      h.onCreated(async (name) => {
        await writeFile(
          join(
            h.fake.dataDir,
            h.fake.org.toLowerCase(),
            `${name}.git`,
            'hooks',
            'pre-receive',
          ),
          '#!/bin/sh\necho "error: GH013: Repository rule violations found for refs/heads/main." >&2\nexit 1\n',
          { mode: 0o755 },
        )
      })
      expect(await codeOf(h.driver.createRepository('chem-labs', SEED))).toBe(
        'SOURCE_GIT_FAILED',
      )
      const refused = said.mock.calls
        .map((c) => c.map(String).join(' '))
        .filter((l) => l.includes('refused Manifest'))
      expect(refused).toHaveLength(1)
      expect(refused[0]).toContain('[remote rejected]')
      expect(retries(said)).toEqual([])
      expect(await getAsPerson(h.fake, 'chem-labs')).toBe(404)
      expect(existsSync(join(h.mirrorRoot, 'chem-labs.git'))).toBe(false)
      // The positive control: the same driver, the hook gone, creates.
      h.onCreated(undefined)
      expect(await codeOf(h.driver.createRepository('bio-labs', SEED))).toBe('resolved')
    } finally {
      said.mockRestore()
      await h.cleanup()
    }
  })
})
