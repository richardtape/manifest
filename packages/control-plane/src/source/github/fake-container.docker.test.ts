import { execFile } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { describeDocker } from '../../runtime/testing.js'
import { appJwt, loadAppKey } from './app-auth.js'
import { startFakeContainer, type FakeContainer } from './testing.js'

/**
 * THE IMAGE, NOT THE IN-PROCESS COPY (the D5 plan, Task 5). A THROWAWAY container from
 * `manifest-github-fake:local` — `startFakeContainer()`, extracted from this file by Task 8 —
 * with its own keypair, secret and token, and its own named volume. It asserts the four
 * things only the image can answer:
 *
 *  - **the control plane's own `appJwt` (Task 3) is accepted by the IMAGE** — the first
 *    cross-check between the two sides that was not written in one file;
 *  - a token minted that way pushes over git, and a clone gets the commit back — git is
 *    in the image (`apk add git`, which needs the network at `make seed`);
 *  - the process is not root;
 *  - replacing the container keeps the repository, because it lives in the VOLUME — and a
 *    token minted before still verifies after, because its key does too.
 *
 * **It imports nothing from `@manifest/github-fake`**: it talks to the image over HTTP and
 * git, as the driver will.
 */

const run = promisify(execFile)
const IDENTITY = [
  '-c',
  'user.name=Fake Test',
  '-c',
  'user.email=fake@test.invalid',
  '-c',
  'commit.gpgsign=false',
]

let fake: FakeContainer
let dir = ''

async function jwt(): Promise<string> {
  return appJwt({ appId: '1000001', key: await loadAppKey(fake.appKeyPath) })
}

async function mint(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${fake.url}/api/v3/app/installations/2000001/access_tokens`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await jwt()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { token: string }).token
}

/** git with the token in the ENVIRONMENT only (the plan's Read this first 3). */
async function git(args: string[], opts: { cwd?: string; token?: string } = {}) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: dir,
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
  return run('git', args, { cwd: opts.cwd ?? dir, env })
}

describeDocker('the GitHub fake’s IMAGE (the D5 plan, Task 5)', () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'github-fake-image-work-'))
    fake = await startFakeContainer()
  })
  afterAll(async () => {
    await fake.remove()
    await rm(dir, { recursive: true, force: true })
  })

  it('accepts the control plane’s own appJwt — and refuses a JWT signed by another key', async () => {
    const app = await fetch(`${fake.url}/api/v3/app`, {
      headers: { authorization: `Bearer ${await jwt()}` },
    })
    expect(app.status).toBe(200)
    expect(((await app.json()) as { id: number }).id).toBe(1000001)
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    const forged = appJwt({ appId: '1000001', key: other })
    const refused = await fetch(`${fake.url}/api/v3/app`, {
      headers: { authorization: `Bearer ${forged}` },
    })
    expect(refused.status).toBe(401)
  })

  it('lets a token minted that way push over git, and a clone gets the commit back', async () => {
    const admin = await mint({ permissions: { administration: 'write' } })
    const created = await fetch(`${fake.url}/api/v3/orgs/manifest-apps/repos`, {
      method: 'POST',
      headers: { authorization: `token ${admin}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'image-app', private: true }),
    })
    expect(created.status).toBe(201)
    const src = join(dir, 'src')
    await git(['init', '-q', '-b', 'main', src])
    await writeFile(join(src, 'app.txt'), 'from the image test\n')
    await git(['add', 'app.txt'], { cwd: src })
    await git([...IDENTITY, 'commit', '-qm', 'first'], { cwd: src })
    const sha = (await git(['rev-parse', 'HEAD'], { cwd: src })).stdout.trim()
    const write = await mint({
      repositories: ['image-app'],
      permissions: { contents: 'write' },
    })
    await git(['push', '-q', `${fake.url}/manifest-apps/image-app.git`, 'main'], {
      cwd: src,
      token: write,
    })
    await git(
      ['clone', '-q', `${fake.url}/manifest-apps/image-app.git`, join(dir, 'clone')],
      { token: write },
    )
    // The CONTENT, never the exit code: a clone of a HEAD naming `master` exits 0 empty ([M4]).
    expect(await readFile(join(dir, 'clone', 'app.txt'), 'utf8')).toBe(
      'from the image test\n',
    )
    expect(
      (await git(['rev-parse', 'HEAD'], { cwd: join(dir, 'clone') })).stdout.trim(),
    ).toBe(sha)
  })

  it('runs its process as a user that is not root', async () => {
    const { stdout } = await run('docker', ['exec', fake.name, 'id', '-u'])
    expect(stdout.trim()).not.toBe('0')
    expect(stdout.trim()).toBe('1000') // `node`, the Dockerfile's USER
  })

  it('keeps the repository in its VOLUME when the container is replaced — and a token minted before still verifies', async () => {
    const before = await mint({
      repositories: ['image-app'],
      permissions: { contents: 'read' },
    })
    const head = (
      await git(['ls-remote', `${fake.url}/manifest-apps/image-app.git`, 'main'], {
        token: before,
      })
    ).stdout
    expect(head).toMatch(/^[0-9a-f]{40}\trefs\/heads\/main/)
    await fake.replace()
    const after = (
      await git(['ls-remote', `${fake.url}/manifest-apps/image-app.git`, 'main'], {
        token: before,
      })
    ).stdout
    expect(after).toBe(head)
  })
})
