import { createPublicKey, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeServer } from './server.js'

/**
 * THE CONTAINER'S ENTRY (Task 5): the environment → a fake on `FAKE_PORT`. Every value the
 * in-process `startFake()` generates is read here instead — the App's PUBLIC key, the
 * webhook secret and the developer token from read-only mounted files (`make up` mints
 * them into `infra/secrets/`), and the state from the `/data` volume.
 *
 * The App's PRIVATE key is never given to the fake: GitHub holds only the public half.
 */

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    console.error(`github-fake: ${name} is not set`)
    process.exit(1)
  }
  return value
}

function fileOf(name: string): string {
  const path = required(name)
  try {
    return readFileSync(path, 'utf8').trim()
  } catch (error) {
    console.error(
      `github-fake: cannot read ${name} (${path}): ${(error as Error).message}`,
    )
    process.exit(1)
  }
}

const dataDir = process.env.FAKE_DATA_DIR ?? '/data'
const port = Number(process.env.FAKE_PORT ?? '7110')
const plan = process.env.FAKE_PLAN === 'free' ? 'free' : 'team'
const apiUrl = required('FAKE_API_URL')
const gitUrl = required('FAKE_GIT_URL')

/**
 * The key installation tokens are signed with, kept in the volume beside the state: a token
 * the fake minted before a restart still verifies after it, as a GitHub token survives
 * GitHub's own restarts. Owner-only, and never logged.
 */
function tokenKey(): Buffer {
  const path = join(dataDir, 'token.key')
  if (!existsSync(path)) {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(path, randomBytes(32).toString('hex'), { mode: 0o600 })
  }
  return Buffer.from(readFileSync(path, 'utf8').trim(), 'hex')
}

const { server, state } = createFakeServer({
  dataDir,
  org: process.env.FAKE_ORG ?? 'manifest-apps',
  plan,
  appId: required('FAKE_APP_ID'),
  installationId: required('FAKE_INSTALLATION_ID'),
  appPublicKey: createPublicKey(fileOf('FAKE_APP_PUBLIC_KEY_FILE')),
  tokenKey: tokenKey(),
  developerToken: fileOf('FAKE_DEVELOPER_TOKEN_FILE'),
  urls: () => ({ apiUrl, gitUrl }),
})

server.listen(port, '0.0.0.0', () => {
  console.log(
    `github-fake: NOT GitHub — org ${state.org} (${plan}), ${Object.keys(state.repos).length} ` +
      `repositories, API ${apiUrl}, git ${gitUrl}, listening on ${port}`,
  )
})

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    server.closeAllConnections()
  })
}
