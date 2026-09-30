import { execFile } from 'node:child_process'
import { createSign } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startFake, type StartedFake, type StartFakeOptions } from './testing.js'

// Git over HTTP, driven by the host's real git. **Tokens travel through `GIT_CONFIG_*` in
// these tests too** — never an argument or a URL — because a test that puts a token in a
// URL teaches the next reader to (the plan's Read this first 3).

const run = promisify(execFile)
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
const IDENTITY = [
  '-c',
  'user.name=Fake Test',
  '-c',
  'user.email=fake@test.invalid',
  '-c',
  'commit.gpgsign=false',
]

describe('the fake serves git over HTTP with GitHub’s scope and permission rules', () => {
  let fake: StartedFake
  let work: string
  /** Read by the fake at each request: a test sets one, and the next test starts with none. */
  const quirks: NonNullable<StartFakeOptions['quirks']> = {}
  beforeEach(async () => {
    delete quirks.notFoundAfterCreate
    fake = await startFake({ quirks })
    work = mkdtempSync(join(tmpdir(), 'github-fake-git-'))
  })
  afterEach(async () => {
    await fake.stop()
    rmSync(work, { recursive: true, force: true })
  })

  function appJwt(): string {
    const t = Math.floor(Date.now() / 1000)
    const u = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: fake.appId, iat: t - 60, exp: t + 540 })}`
    return `${u}.${createSign('RSA-SHA256').update(u).sign(fake.appKeyPem).toString('base64url')}`
  }
  async function token(body: Record<string, unknown>): Promise<string> {
    const res = await fetch(
      `${fake.apiUrl}/app/installations/${fake.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${appJwt()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
    expect(res.status).toBe(201)
    return (await res.json()).token
  }
  async function createRepo(name: string): Promise<void> {
    const res = await fetch(`${fake.apiUrl}/orgs/${fake.org}/repos`, {
      method: 'POST',
      headers: {
        authorization: `token ${await token({ permissions: { administration: 'write' } })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name, private: true }),
    })
    expect(res.status).toBe(201)
  }

  /** git with the token in the ENVIRONMENT only, no system/global config, no prompts. */
  async function git(args: string[], opts: { cwd?: string; token?: string } = {}) {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: work,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
    }
    if (opts.token !== undefined) {
      const basic = Buffer.from(`x-access-token:${opts.token}`).toString('base64')
      Object.assign(env, {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.extraHeader',
        GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
      })
    }
    try {
      const { stdout, stderr } = await run('git', args, { cwd: opts.cwd ?? work, env })
      return { code: 0, stdout, stderr }
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string }
      return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
    }
  }
  const remote = (name: string) => `${fake.gitUrl}/${fake.org}/${name}.git`

  /** A local repository with one commit on `main`, carrying `app.txt`. */
  async function localCommit(dir: string, text: string): Promise<string> {
    const path = join(work, dir)
    expect((await git(['init', '-q', '-b', 'main', path])).code).toBe(0)
    writeFileSync(join(path, 'app.txt'), text)
    expect((await git(['add', 'app.txt'], { cwd: path })).code).toBe(0)
    expect((await git([...IDENTITY, 'commit', '-qm', 'first'], { cwd: path })).code).toBe(
      0,
    )
    return (await git(['rev-parse', 'HEAD'], { cwd: path })).stdout.trim()
  }

  it('pushes a commit with a contents: write token scoped to the repository, and ls-remote shows it', async () => {
    await createRepo('app')
    const sha = await localCommit('src', 'hello\n')
    const t = await token({ repositories: ['app'], permissions: { contents: 'write' } })
    const push = await git(['push', '-q', remote('app'), 'main'], {
      cwd: join(work, 'src'),
      token: t,
    })
    expect(push).toMatchObject({ code: 0 })
    const ls = await git(['ls-remote', remote('app')], { token: t })
    expect(ls.stdout).toContain(`${sha}\trefs/heads/main`)
    expect(ls.stdout).toContain(`${sha}\tHEAD`) // HEAD names main — [M4]'s F2
  })

  it('clones with the same token, and the clone HAS the commit and its file', async () => {
    await createRepo('app')
    const sha = await localCommit('src', 'hello from the fake\n')
    const t = await token({ repositories: ['app'], permissions: { contents: 'write' } })
    expect(
      (
        await git(['push', '-q', remote('app'), 'main'], {
          cwd: join(work, 'src'),
          token: t,
        })
      ).code,
    ).toBe(0)
    const clone = await git(['clone', '-q', remote('app'), join(work, 'clone')], {
      token: t,
    })
    expect(clone.code).toBe(0)
    // A clone of a bare repository whose HEAD names `master` EXITS 0 WITH NOTHING checked
    // out ([M4], F2) — so the content is the assertion, never the exit code.
    expect(readFileSync(join(work, 'clone', 'app.txt'), 'utf8')).toBe(
      'hello from the fake\n',
    )
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: join(work, 'clone'),
    })
    const head = await git(['rev-parse', 'HEAD'], { cwd: join(work, 'clone') })
    expect([branch.stdout.trim(), head.stdout.trim()]).toEqual(['main', sha])
  })

  it('refuses a push with a contents: read token — in GitHub’s measured words', async () => {
    await createRepo('app')
    await localCommit('src', 'x\n')
    const t = await token({ repositories: ['app'], permissions: { contents: 'read' } })
    const push = await git(['push', '-q', remote('app'), 'main'], {
      cwd: join(work, 'src'),
      token: t,
    })
    expect(push.code).not.toBe(0)
    // GitHub's line to an App's token, measured 2026-09-24 (conformance C11).
    expect(push.stderr).toMatch(/remote: Write access to repository not granted\./)
    // …while the same token CAN read: the refusal is the permission, not the token.
    expect((await git(['ls-remote', remote('app')], { token: t })).code).toBe(0)
  })

  it('answers a token scoped to another repository with Repository not found', async () => {
    await createRepo('app')
    await createRepo('other')
    const t = await token({ repositories: ['other'], permissions: { contents: 'write' } })
    const ls = await git(['ls-remote', remote('app')], { token: t })
    expect(ls.code).not.toBe(0)
    expect(ls.stderr).toMatch(/Repository not found/)
    expect((await git(['ls-remote', remote('other')], { token: t })).code).toBe(0)
  })

  it('challenges a request with no credential, which git cannot answer with prompts disabled', async () => {
    await createRepo('app')
    const ls = await git(['ls-remote', remote('app')])
    expect(ls.code).not.toBe(0)
    expect(ls.stderr).toMatch(/terminal prompts disabled/)
  })

  it('lets faculty-dev’s personal access token push — a PERSON pushing to GitHub directly', async () => {
    await createRepo('app')
    const sha = await localCommit('src', 'by hand\n')
    const push = await git(['push', '-q', remote('app'), 'main'], {
      cwd: join(work, 'src'),
      token: fake.developerToken,
    })
    expect(push).toMatchObject({ code: 0 })
    const t = await token({ repositories: ['app'], permissions: { contents: 'read' } })
    expect(
      (await git(['ls-remote', remote('app'), 'main'], { token: t })).stdout,
    ).toContain(sha)
  })

  /**
   * FE-41 (the launch path plan's Task 6a, measured on real GitHub 2026-09-29): a repository GitHub
   * created seconds before was answered NOT FOUND over git for 2–4 s. The test-only quirk answers a
   * new repository's first requests the way GitHub did, and REAL git must then say what the driver
   * matches — GitHub's `Repository not found.` relayed as `remote:` and git's own
   * `fatal: repository '…' not found` — or, when only a push's SECOND request is refused, exit 1
   * with `Done` and no line for the ref, which is lp-starter-g's answer from real GitHub; and when
   * only a fetch's second request is, git's `RPC failed; HTTP 404` (the fix round's item 1).
   */
  it('notFoundAfterCreate: a new repository’s first git requests are answered Repository not found, as GitHub did in FE-41 — and then served', async () => {
    quirks.notFoundAfterCreate = { push: 1, pushPack: 1, fetch: 1, fetchPack: 1 }
    await createRepo('app')
    const sha = await localCommit('src', 'hello\n')
    const t = await token({ repositories: ['app'], permissions: { contents: 'write' } })
    const push = () =>
      git(['push', '--porcelain', remote('app'), 'main'], {
        cwd: join(work, 'src'),
        token: t,
      })
    const notFound = await push()
    expect(notFound.code).toBe(128)
    expect(notFound.stderr).toContain('remote: Repository not found.')
    expect(notFound.stderr).toContain(`fatal: repository '${remote('app')}/' not found`)
    // The advertisement answered, the pack refused: no line for the ref at all.
    expect(await push()).toMatchObject({
      code: 1,
      stdout: 'Done\n',
      stderr: expect.stringContaining('error: RPC failed; HTTP 404'),
    })
    const landed = await push()
    expect(landed.code).toBe(0)
    expect(landed.stdout).toMatch(/^\*\t\S+:refs\/heads\/main\t\[new branch\]$/m)

    const ls = () => git(['ls-remote', remote('app')], { token: t })
    const unseen = await ls()
    expect(unseen.code).toBe(128)
    expect(unseen.stderr).toContain('remote: Repository not found.')
    expect(unseen.stderr).toContain(`fatal: repository '${remote('app')}/' not found`)
    expect((await ls()).stdout).toContain(`${sha}\trefs/heads/main`)
    // A FETCH, whose second request — the pack — is refused: git's second-leg 404.
    const into = join(work, 'into.git')
    expect((await git(['init', '-q', '--bare', '-b', 'main', into])).code).toBe(0)
    const fetch = () =>
      git(['fetch', '--porcelain', remote('app'), 'refs/heads/*:refs/heads/*'], {
        cwd: into,
        token: t,
      })
    const unpacked = await fetch()
    expect(unpacked.code).toBe(128)
    expect(unpacked.stderr).toContain('error: RPC failed; HTTP 404')
    expect(unpacked.stderr).toContain('fatal: the remote end hung up unexpectedly')
    expect((await fetch()).code).toBe(0)
    // Read at each request: raised mid-run, it refuses the NEXT one — then serves again.
    quirks.notFoundAfterCreate.fetch = 2
    expect((await ls()).code).toBe(128)
    expect((await ls()).stdout).toContain(`${sha}\trefs/heads/main`)
  })
})
