import { execFile } from 'node:child_process'
import { createPrivateKey } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { startFake, type StartedFake } from '@manifest/github-fake/testing'
import { describeSourceDriver } from '../driver-contract.js'
import { SourceError } from '../git-driver.js'
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
  })
  const h: Harness = {
    get fake() {
      return fake
    },
    mirrorRoot,
    minted,
    mints,
    driver,
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

/** A person pushing straight to GitHub. Returns the commit. */
async function pushAsPerson(
  fake: StartedFake,
  slug: string,
  files: Record<string, string>,
  message: string,
): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'person-'))
  const as = asPerson(fake, work)
  try {
    await gitWithToken(['clone', '-q', `${fake.gitUrl}/${fake.org}/${slug}.git`, '.'], as)
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(work, path)), { recursive: true })
      await writeFile(join(work, path), content)
    }
    await gitWithToken(['add', '-A'], as)
    await gitWithToken([...PERSON, 'commit', '-qm', message], as)
    await gitWithToken(['push', '-q', 'origin', 'HEAD:main'], as)
    return (await gitWithToken(['rev-parse', 'HEAD'], as)).trim()
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/**
 * A person REWRITING GitHub's `main` — an amend and a force-push, which a free organisation
 * cannot stop on a private repository (`[M10]`). Returns the rewritten head.
 */
async function rewriteAsPerson(fake: StartedFake, slug: string): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'person-'))
  const as = asPerson(fake, work)
  try {
    await gitWithToken(['clone', '-q', `${fake.gitUrl}/${fake.org}/${slug}.git`, '.'], as)
    await gitWithToken([...PERSON, 'commit', '-q', '--amend', '-m', 'rewritten'], as)
    await gitWithToken(['push', '-q', '--force', 'origin', 'HEAD:main'], as)
    return (await gitWithToken(['rev-parse', 'HEAD'], as)).trim()
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

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
