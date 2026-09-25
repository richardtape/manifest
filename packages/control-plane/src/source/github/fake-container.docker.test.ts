import { execFile } from 'node:child_process'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { describeDocker } from '../../runtime/testing.js'
import { appJwt, loadAppKey } from './app-auth.js'

/**
 * THE IMAGE, NOT THE IN-PROCESS COPY (the D5 plan, Task 5). A THROWAWAY container from
 * `manifest-github-fake:local` — not the profile's service, so this test owns what it
 * creates and removes it — with its own keypair, secret and token in a temp directory, and
 * its own named volume. It asserts the four things only the image can answer:
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
const IMAGE = 'manifest-github-fake:local'
const TAG = randomBytes(4).toString('hex')
const NAME = `github-fake-docker-test-${TAG}`
const VOLUME = `github-fake-docker-test-${TAG}`
const IDENTITY = [
  '-c',
  'user.name=Fake Test',
  '-c',
  'user.email=fake@test.invalid',
  '-c',
  'commit.gpgsign=false',
]

let dir = ''
let port = 0
let base = ''
let keyPath = ''

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const p = (server.address() as { port: number }).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return p
}

async function startContainer(): Promise<void> {
  await run('docker', [
    'run',
    '-d',
    '--name',
    NAME,
    '-p',
    `127.0.0.1:${port}:7110`,
    '-v',
    `${VOLUME}:/data`,
    '-v',
    `${join(dir, 'app.pub.pem')}:/run/fake/app.pub.pem:ro`,
    '-v',
    `${join(dir, 'webhook.secret')}:/run/fake/webhook.secret:ro`,
    '-v',
    `${join(dir, 'developer.token')}:/run/fake/developer.token:ro`,
    '-e',
    'FAKE_ORG=manifest-apps',
    '-e',
    'FAKE_APP_ID=1000001',
    '-e',
    'FAKE_INSTALLATION_ID=2000001',
    '-e',
    `FAKE_API_URL=${base}/api/v3`,
    '-e',
    `FAKE_GIT_URL=${base}`,
    '-e',
    'FAKE_APP_PUBLIC_KEY_FILE=/run/fake/app.pub.pem',
    '-e',
    'FAKE_WEBHOOK_SECRET_FILE=/run/fake/webhook.secret',
    '-e',
    'FAKE_DEVELOPER_TOKEN_FILE=/run/fake/developer.token',
    IMAGE,
  ])
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${base}/_fake/health`).then(
      (r) => r.ok,
      () => false,
    )
    if (ok) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const logs = await run('docker', ['logs', NAME]).then(
    (r) => r.stdout + r.stderr,
    () => '',
  )
  throw new Error(`the fake's container never answered /_fake/health:\n${logs}`)
}

async function removeContainer(): Promise<void> {
  await run('docker', ['rm', '-f', '-v', NAME]).catch((error: unknown) => {
    // A container that was never created is fine; anything else is an operator line.
    if (!String(error).includes('No such container'))
      console.error(`rm ${NAME}: ${String(error)}`)
  })
}

async function jwt(): Promise<string> {
  return appJwt({ appId: '1000001', key: await loadAppKey(keyPath) })
}

async function mint(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${base}/api/v3/app/installations/2000001/access_tokens`, {
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
    dir = await mkdtemp(join(tmpdir(), 'github-fake-image-'))
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    keyPath = join(dir, 'app.pem')
    await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }))
    await chmod(keyPath, 0o600) // loadAppKey holds it to the master key's custody rule
    await writeFile(
      join(dir, 'app.pub.pem'),
      publicKey.export({ type: 'spki', format: 'pem' }),
    )
    await writeFile(join(dir, 'webhook.secret'), randomBytes(32).toString('hex'))
    await writeFile(
      join(dir, 'developer.token'),
      `ghp_${randomBytes(18).toString('hex')}`,
    )
    for (const f of ['app.pub.pem', 'webhook.secret', 'developer.token'])
      await chmod(join(dir, f), 0o600)
    port = await freePort()
    base = `http://127.0.0.1:${port}`
    await startContainer()
  })
  afterAll(async () => {
    await removeContainer()
    await run('docker', ['volume', 'rm', '-f', VOLUME]).catch((error: unknown) =>
      console.error(`volume rm ${VOLUME}: ${String(error)}`),
    )
    await rm(dir, { recursive: true, force: true })
  })

  it('accepts the control plane’s own appJwt — and refuses a JWT signed by another key', async () => {
    const app = await fetch(`${base}/api/v3/app`, {
      headers: { authorization: `Bearer ${await jwt()}` },
    })
    expect(app.status).toBe(200)
    expect(((await app.json()) as { id: number }).id).toBe(1000001)
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    const forged = appJwt({ appId: '1000001', key: other })
    const refused = await fetch(`${base}/api/v3/app`, {
      headers: { authorization: `Bearer ${forged}` },
    })
    expect(refused.status).toBe(401)
  })

  it('lets a token minted that way push over git, and a clone gets the commit back', async () => {
    const admin = await mint({ permissions: { administration: 'write' } })
    const created = await fetch(`${base}/api/v3/orgs/manifest-apps/repos`, {
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
    await git(['push', '-q', `${base}/manifest-apps/image-app.git`, 'main'], {
      cwd: src,
      token: write,
    })
    await git(
      ['clone', '-q', `${base}/manifest-apps/image-app.git`, join(dir, 'clone')],
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
    const { stdout } = await run('docker', ['exec', NAME, 'id', '-u'])
    expect(stdout.trim()).not.toBe('0')
    expect(stdout.trim()).toBe('1000') // `node`, the Dockerfile's USER
  })

  it('keeps the repository in its VOLUME when the container is replaced — and a token minted before still verifies', async () => {
    const before = await mint({
      repositories: ['image-app'],
      permissions: { contents: 'read' },
    })
    const head = (
      await git(['ls-remote', `${base}/manifest-apps/image-app.git`, 'main'], {
        token: before,
      })
    ).stdout
    expect(head).toMatch(/^[0-9a-f]{40}\trefs\/heads\/main/)
    await removeContainer()
    await startContainer()
    const after = (
      await git(['ls-remote', `${base}/manifest-apps/image-app.git`, 'main'], {
        token: before,
      })
    ).stdout
    expect(after).toBe(head)
  })
})
