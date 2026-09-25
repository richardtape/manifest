import { execFile } from 'node:child_process'
import { createPrivateKey } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { startFake, type StartedFake } from '@manifest/github-fake/testing'
import { describeSourceDriver } from '../driver-contract.js'
import { SourceError, type MirrorAdvance } from '../git-driver.js'
import { pushAsPerson, recordingObserver, rewriteAsPerson } from '../testing.js'
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
  /** The same GitHub, restarted: same data, same App key, same port — and a new token key. */
  restart(): Promise<void>
  cleanup(): Promise<void>
}

async function harness(options: Parameters<typeof startFake>[0] = {}): Promise<Harness> {
  const dataDir = await mkdtemp(join(tmpdir(), 'github-fake-data-'))
  const mirrorRoot = await mkdtemp(join(tmpdir(), 'manifest-mirror-'))
  const minted: string[] = []
  const mints: Mint[] = []
  let fake = await startFake({ ...options, dataDir })
  const observer = recordingObserver()
  // A spy on the wire. It never changes an answer.
  const spyFetch: typeof fetch = async (input, init) => {
    const res = await fetch(input, init)
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
let current: Harness
describeSourceDriver(
  'github',
  async () => {
    current = await harness()
    const h = current
    return {
      driver: h.driver,
      pushAsPerson: (slug, files, message) => pushAsPerson(h.fake, slug, files, message),
      cleanup: h.cleanup,
    }
  },
  (h) => {
    it("answers GitHub's head after a rewrite AND a normal push — never the mirror's frozen main (F6)", async () => {
      const repo = await h().driver.createRepository('chem-labs', {
        'manifest.yaml': 'manifest: 1\nname: chem-labs\n',
      })
      const first = await h().driver.headCommit(repo)
      const rewritten = await rewriteAsPerson(current.fake, 'chem-labs')
      expect(rewritten).not.toBe(first)
      expect(await h().driver.headCommit(repo)).toBe(rewritten)
      const pushed = await h().pushAsPerson(
        'chem-labs',
        { 'README.md': 'after the rewrite\n' },
        'a normal push',
      )
      expect(await h().driver.headCommit(repo)).toBe(pushed)
      expect(await h().driver.listBranches(repo)).toEqual(['main'])
      // The history keeper kept what a release may name (Decision 1), and it still builds.
      const mirror = join(current.mirrorRoot, 'chem-labs.git')
      const kept = await run('git', ['--git-dir', mirror, 'rev-parse', 'refs/heads/main'])
      expect(kept.stdout.trim()).toBe(first)
      expect((await h().driver.localGitDir(repo, first)).commitSha).toBe(first)
      // And Manifest's own commit lands on GitHub NOW, not on the frozen main — as written
      // first it was SOURCE_CONFLICT for ever, however often the caller retried.
      const mine = await h().driver.commitFiles(repo, { 'x.txt': 'x\n' }, 'after')
      expect(await h().driver.headCommit(repo)).toBe(mine)
      expect(await lsRemoteMain(current.fake, 'chem-labs')).toBe(mine)
    })
  },
)

describe('the GitHub driver keeps what only a REMOTE driver has to promise', () => {
  const SEED = { 'manifest.yaml': 'manifest: 1\nname: chem-labs\n' }
  const codeOf = (p: Promise<unknown>) =>
    p.then(
      () => 'resolved',
      (e: unknown) => (e instanceof SourceError ? e.code : String(e)),
    )

  it('never puts a token where a person can read it — the canary', async () => {
    const h = await harness()
    try {
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
      await h.driver.commitFiles(repo, { 'x.txt': 'x\n' }, 'one more')
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
      expect(await h.driver.headCommit(repo)).toMatch(/^[0-9a-f]{40}$/)
      expect(h.advances).toEqual([])
    } finally {
      await h.cleanup()
    }
  })

  it("reports a person's push ONCE, as updated from → to, and a quiet sync not at all", async () => {
    const h = await harness()
    try {
      const repo = await h.driver.createRepository('chem-labs', SEED)
      const seed = await h.driver.headCommit(repo)
      const pushed = await pushAsPerson(h.fake, 'chem-labs', { 'b.txt': 'b\n' }, 'a push')
      const advance = await h.driver.sync(repo)
      const expected = {
        projectSlug: 'chem-labs',
        updated: [{ ref: MAIN, from: seed, to: pushed }],
        rewritten: [],
        visibility: READ_PRIVATE,
      }
      expect(advance).toEqual(expected)
      expect(h.advances).toEqual([expected])
      // Nothing moved: an empty answer, and nothing handed to the observer.
      expect(await h.driver.sync(repo)).toEqual({
        projectSlug: 'chem-labs',
        updated: [],
        rewritten: [],
        visibility: READ_PRIVATE,
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
      const first = await h.driver.headCommit(repo)
      const rewritten = await rewriteAsPerson(h.fake, 'chem-labs')
      expect(await h.driver.sync(repo)).toEqual({
        projectSlug: 'chem-labs',
        updated: [],
        rewritten: [{ ref: MAIN, mirror: first, upstream: rewritten }],
        visibility: READ_PRIVATE,
      })
      const pushed = await pushAsPerson(h.fake, 'chem-labs', { 'c.txt': 'c\n' }, 'normal')
      expect(await h.driver.sync(repo)).toEqual({
        projectSlug: 'chem-labs',
        updated: [{ ref: MAIN, from: rewritten, to: pushed }],
        rewritten: [],
        visibility: READ_PRIVATE,
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
      const repo = await h.driver.createRepository('chem-labs', SEED)
      expect((await h.driver.sync(repo)).visibility).toEqual(PRIVATE)
      expect(h.advances).toEqual([])
    } finally {
      await h.cleanup()
    }
  })

  it('with NO webhook, a read’s sync finds it public and makes it private again, and reports it once', async () => {
    const h = await harness()
    try {
      const repo = await h.driver.createRepository('chem-labs', SEED)
      await makePublic(h.fake, 'chem-labs')
      await h.driver.headCommit(repo)
      expect(await isPrivate(h.fake, 'chem-labs')).toBe(true)
      expect(h.advances).toEqual([
        {
          projectSlug: 'chem-labs',
          updated: [],
          rewritten: [],
          visibility: { observed: 'public', enforced: true, result: 'private' },
        },
      ])
      const head = await h.driver.headCommit(repo)
      expect((await h.driver.localGitDir(repo, head)).commitSha).toBe(head)
      expect(h.advances).toHaveLength(1)
    } finally {
      await h.cleanup()
    }
  })

  it('a revert GitHub REFUSES stays still-public, and the mirror refuses a build — offline too — until a sync reads private', async () => {
    const quirks = { refusePrivatize: true }
    const h = await harness({ quirks })
    try {
      const repo = await h.driver.createRepository('chem-labs', SEED)
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
    } finally {
      await h.cleanup()
    }
  })
})
