import { execFile } from 'node:child_process'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { loadAppKey } from './app-auth.js'
import type { GithubDriverOptions } from './driver.js'

const run = promisify(execFile)
const IMAGE = 'manifest-github-fake:local'

/**
 * THE FAKE'S IMAGE, for the Docker tier (the D5 plan's Task 8, extracted from Task 5's test,
 * which now uses it too). A THROWAWAY container from `manifest-github-fake:local` — not the
 * profile's service, so a test owns what it creates and removes it — with its own keypair,
 * webhook secret and developer token in a temp directory (all `600`), its own NAMED volume,
 * and a free port on the host's loopback.
 */
export interface FakeContainer {
  /** `http://127.0.0.1:<port>` — the host's view, which is what the fake advertises. */
  url: string
  /** The container's name, for `docker exec`. */
  name: string
  /** The App's PRIVATE key file, `600` — what `loadAppKey` reads. */
  appKeyPath: string
  /** Everything `createGithubSourceDriver` needs but its mirror root (and, from Task 9, its observer). */
  options: Pick<
    GithubDriverOptions,
    'apiUrl' | 'gitUrl' | 'org' | 'appId' | 'installationId' | 'appKey'
  >
  /** `faculty-dev`'s classic token — a PERSON pushing straight to GitHub. */
  developerToken: string
  /** `docker stop` — GitHub is gone; the container and its volume survive. */
  stop(): Promise<void>
  /** `docker start`, then wait for `/_fake/health`. */
  start(): Promise<void>
  /**
   * The container REPLACED on the same volume (`rm`, then `run`), which is what tells the
   * volume from the container's own layer — a `docker restart` keeps both (Task 5's ruling).
   */
  replace(): Promise<void>
  /** `docker rm -f -v`, the volume and the temp directory — `afterAll`. */
  remove(): Promise<void>
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const p = (server.address() as { port: number }).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return p
}

export async function startFakeContainer(): Promise<FakeContainer> {
  const tag = randomBytes(4).toString('hex')
  const name = `github-fake-docker-test-${tag}`
  const volume = `github-fake-docker-test-${tag}`
  const dir = await mkdtemp(join(tmpdir(), 'github-fake-image-'))
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const appKeyPath = join(dir, 'app.pem')
  await writeFile(appKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  await writeFile(
    join(dir, 'app.pub.pem'),
    publicKey.export({ type: 'spki', format: 'pem' }),
  )
  await writeFile(join(dir, 'webhook.secret'), randomBytes(32).toString('hex'))
  const developerToken = `ghp_${randomBytes(18).toString('hex')}`
  await writeFile(join(dir, 'developer.token'), developerToken)
  // loadAppKey holds the key to the master key's custody rule; the rest are `600` as
  // `make up` mints them.
  for (const f of ['app.pem', 'app.pub.pem', 'webhook.secret', 'developer.token'])
    await chmod(join(dir, f), 0o600)
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`

  async function healthy(): Promise<void> {
    for (let i = 0; i < 60; i++) {
      const ok = await fetch(`${url}/_fake/health`).then(
        (r) => r.ok,
        () => false,
      )
      if (ok) return
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const logs = await run('docker', ['logs', name]).then(
      (r) => r.stdout + r.stderr,
      () => '',
    )
    throw new Error(`the fake's container never answered /_fake/health:\n${logs}`)
  }

  async function runContainer(): Promise<void> {
    await run('docker', [
      'run',
      '-d',
      '--name',
      name,
      '-p',
      `127.0.0.1:${port}:7110`,
      '-v',
      `${volume}:/data`,
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
      `FAKE_API_URL=${url}/api/v3`,
      '-e',
      `FAKE_GIT_URL=${url}`,
      '-e',
      'FAKE_APP_PUBLIC_KEY_FILE=/run/fake/app.pub.pem',
      '-e',
      'FAKE_WEBHOOK_SECRET_FILE=/run/fake/webhook.secret',
      '-e',
      'FAKE_DEVELOPER_TOKEN_FILE=/run/fake/developer.token',
      IMAGE,
    ])
    await healthy()
  }

  async function removeContainer(): Promise<void> {
    await run('docker', ['rm', '-f', '-v', name]).catch((error: unknown) => {
      // A container that was never created is fine; anything else is an operator line.
      if (!String(error).includes('No such container'))
        console.error(`rm ${name}: ${String(error)}`)
    })
  }

  await runContainer()
  return {
    url,
    name,
    appKeyPath,
    options: {
      apiUrl: `${url}/api/v3`,
      gitUrl: url,
      org: 'manifest-apps',
      appId: '1000001',
      installationId: '2000001',
      appKey: await loadAppKey(appKeyPath),
    },
    developerToken,
    async stop() {
      await run('docker', ['stop', '-t', '2', name])
    },
    async start() {
      await run('docker', ['start', name])
      await healthy()
    },
    async replace() {
      await removeContainer()
      await runContainer()
    },
    async remove() {
      await removeContainer()
      await run('docker', ['volume', 'rm', '-f', volume]).catch((error: unknown) =>
        console.error(`volume rm ${volume}: ${String(error)}`),
      )
      await rm(dir, { recursive: true, force: true })
    },
  }
}
