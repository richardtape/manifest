import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { createFakeServer } from './server.js'

/**
 * AN IN-PROCESS FAKE for the unit tier: a fresh App keypair, token key, developer token and
 * webhook secret per call, a temporary data directory unless given one, and a random port on
 * loopback. `main.ts` is the container's equivalent, reading the same values from files.
 */
export interface StartedFake {
  /** `http://127.0.0.1:<port>` */
  url: string
  /** `${url}/api/v3` — GitHub Enterprise Server's layout. */
  apiUrl: string
  /** `${url}` — clone URLs are `${gitUrl}/<org>/<repo>.git`. */
  gitUrl: string
  /** `'manifest-apps'` */
  org: string
  /** `'1000001'` */
  appId: string
  /** `'2000001'` */
  installationId: string
  /** The App's PRIVATE key, generated per fake — what the control plane holds. */
  appKeyPem: string
  /** What both sides hold (Task 9 signs with it). */
  webhookSecret: string
  /** A classic `ghp_` PAT for `faculty-dev`, an org member with admin — a PERSON. */
  developerToken: string
  /** Decision 13: `free` refuses protection on a private repository, as GitHub does (Task 12). */
  plan: 'free' | 'team'
  /** Where the fake keeps its state and its bare repositories. */
  dataDir: string
  stop(): Promise<void>
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** `ghp_` and 36 alphanumerics — the classic personal-access-token shape. */
function classicPat(): string {
  const bytes = randomBytes(36)
  return `ghp_${[...bytes].map((b) => ALNUM[b % ALNUM.length]).join('')}`
}

export async function startFake(
  options: { dataDir?: string; plan?: 'free' | 'team' } = {},
): Promise<StartedFake> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const ownsDir = options.dataDir === undefined
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'github-fake-'))
  const plan = options.plan ?? 'team'
  const org = 'manifest-apps'
  const appId = '1000001'
  const installationId = '2000001'
  const developerToken = classicPat()
  let url = ''
  const { server } = createFakeServer({
    dataDir,
    org,
    plan,
    appId,
    installationId,
    appPublicKey: publicKey,
    tokenKey: randomBytes(32),
    developerToken,
    urls: () => ({ apiUrl: `${url}/api/v3`, gitUrl: url }),
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    url,
    apiUrl: `${url}/api/v3`,
    gitUrl: url,
    org,
    appId,
    installationId,
    appKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    webhookSecret: randomBytes(32).toString('hex'),
    developerToken,
    plan,
    dataDir,
    async stop() {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      if (ownsDir) rmSync(dataDir, { recursive: true, force: true })
    },
  }
}
