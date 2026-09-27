import { readdir } from 'node:fs/promises'
import { ManifestApiError } from '@manifest/contract'
/**
 * THE MOCK BY ITS PATH, NOT ITS PACKAGE NAME: naming `@manifest/mock` as this package's
 * devDependency needs a `pnpm install`, and pnpm 11's supply-chain check of the whole lockfile
 * refuses one offline (the authoring API plan's Task 11). This file is a test, which `tsc`
 * excludes here, so no `rootDir` is crossed; the examples themselves import only the contract.
 */
import { createMockServer, fixtures } from '../../mock/src/index.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildAndWatch } from './example-build.js'
import { checkManifest } from './example-check.js'
import { commitAChange } from './example-commit.js'
import { commitOnWhatIsThere } from './example-conflict.js'
import { releaseToStaging } from './example-deploy.js'
import { whatALaunchNeeds } from './example-launch.js'
import { pendingActionOf, waitForAPerson } from './example-pending.js'
import { readAFile } from './example-read.js'
import { setStagingSecret } from './example-secret.js'
import { whoAmI } from './example-session.js'
import { mintATokenForAnAgent } from './example-token.js'

/**
 * EVERY CODE EXAMPLE IN THE GUIDES IS A REAL FILE, TYPE-CHECKED AND RUN (the authoring API plan's
 * Task 11, Decision 16). `pnpm docs:write` inlines each `example-*.ts` into its guide; `pnpm
 * typecheck` compiles them against the generated client; and this file runs each against
 * `manifest-mock`, asserting the answer its guide describes. An example nothing runs is the drift
 * this project has paid for, in prose.
 *
 * **What this cannot see**: the mock validates RESPONSES, not requests, so a request field an
 * example gets wrong is `pnpm typecheck`'s to find — the generated client's types are the gate for
 * what an example sends.
 */
const { PROJECT_ID, CONFIRMED_ACTION_ID, PENDING_ACTION_ID } = fixtures
const TOKEN = 'mft_mock_token-the-mock-accepts-any-bearer'
const SESSION = 'mock-session'
/** What an agent would write — the mock validates no manifest, so any text is answered valid. */
const MANIFEST = 'manifest: 1\nname: mock-app\nblueprint: node-ts-mongo@1\n'

let origin: string
let server: ReturnType<typeof createMockServer>
beforeAll(async () => {
  // A short scan window, so the build's scripted end arrives in a second rather than ten.
  server = createMockServer({ scanSilenceMs: 50 })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

/** Which example files a case below ran — held to the directory at the end. */
const ran = new Set<string>()

describe('the guides’ examples, run against manifest-mock (Decision 16)', () => {
  it('example-session: who is signed in', async () => {
    ran.add('example-session')
    expect(await whoAmI(origin, SESSION)).toEqual({
      name: fixtures.ME.displayName,
      role: fixtures.ME.role,
    })
  })

  it('example-token: a person mints a token and the agent uses it', async () => {
    ran.add('example-token')
    const minted = await mintATokenForAnAgent(origin, SESSION, PROJECT_ID)
    expect(minted.tokenId).toBe(fixtures.MINTED_TOKEN.token.id)
    expect(minted.secret).toMatch(/^mft_/)
    expect(minted.projectSlug).toBe(fixtures.PROJECT.slug)
  })

  it('example-read: the tree, then a file at the commit the tree was read at', async () => {
    ran.add('example-read')
    const read = await readAFile(origin, TOKEN, PROJECT_ID, 'src/app.js')
    expect(read.commitSha).toMatch(/^[0-9a-f]{40}$/)
    expect(read.paths).toContain('manifest.yaml')
    expect(read.text.length).toBeGreaterThan(0)
    // A path the tree does not list is refused before any request for it is sent.
    await expect(readAFile(origin, TOKEN, PROJECT_ID, 'no/such.js')).rejects.toThrow(
      'is not a text file',
    )
  })

  it('example-commit: a commit against the commit read', async () => {
    ran.add('example-commit')
    expect(await commitAChange(origin, TOKEN, PROJECT_ID)).toMatch(/^[0-9a-f]{40}$/)
  })

  it('example-check: a valid manifest, and an invalid one with each problem to act on', async () => {
    ran.add('example-check')
    expect(await checkManifest(origin, TOKEN, PROJECT_ID, MANIFEST)).toEqual({
      valid: true,
      sensitiveFields: expect.any(Array),
    })
    const emptied = await checkManifest(origin, TOKEN, PROJECT_ID, '')
    expect(emptied.valid).toBe(false)
    if (emptied.valid) return
    expect(emptied.problems.length).toBeGreaterThan(0)
    for (const problem of emptied.problems)
      expect(problem).toEqual({
        code: expect.stringMatching(/^SPEC_/),
        path: expect.any(String),
        message: expect.any(String),
        hint: expect.any(String),
      })
  })

  it('example-conflict: main moved since the read — read again, redo the change, commit once', async () => {
    ran.add('example-conflict')
    const bases: string[] = []
    // The PARENT of the document's commit: main was there, and has moved since.
    const stale = 'f01a0cb5fe74b5ca6c817e85f2fb62d394f40241'
    const done = await commitOnWhatIsThere(
      origin,
      TOKEN,
      PROJECT_ID,
      stale,
      async (at) => {
        bases.push(at)
        return [{ op: 'write', path: 'src/app.js', content: `// on ${at}\n` }]
      },
    )
    expect(done.attempts).toBe(2)
    expect(bases[0]).toBe(stale)
    expect(bases[1]).toMatch(/^[0-9a-f]{40}$/)
    expect(bases[1]).not.toBe(stale)
  })

  it('example-secret: a staging value set, and the name read back — never the value', async () => {
    ran.add('example-secret')
    const status = await setStagingSecret(
      origin,
      TOKEN,
      PROJECT_ID,
      'SIS_API_KEY',
      'a-value-long-enough',
    )
    // The mock keeps no state, so its list still says `set: false`; the platform's says true.
    expect(status.declared).toBe(true)
  })

  it('example-build: started, watched on the stream to its end, and read', async () => {
    ran.add('example-build')
    const built = await buildAndWatch(
      origin,
      TOKEN,
      PROJECT_ID,
      '5f3c1b8e2a4d6f7c9b0e1a2d3c4b5a6978e9f0a1',
    )
    expect(built.status).toBe('succeeded')
    expect(built.logLines).toBeGreaterThan(0)
  }, 30_000)

  it('example-deploy: released and deployed to staging, its state read', async () => {
    ran.add('example-deploy')
    const deployed = await releaseToStaging(origin, TOKEN, PROJECT_ID, fixtures.BUILD_ID)
    expect(deployed.state).toBe(fixtures.INSTANCE.state)
    expect(deployed.url).toBe(fixtures.STAGING.url)
  })

  it('example-launch: the blocking items a first launch still needs', async () => {
    ran.add('example-launch')
    const needs = await whatALaunchNeeds(origin, TOKEN, PROJECT_ID)
    const expected = fixtures.LAUNCH_READINESS.items.filter(
      (i) => i.blocking && i.state !== 'met',
    )
    expect(needs.ready).toBe(fixtures.LAUNCH_READINESS.ready)
    expect(needs.todo.map((t) => t.title)).toEqual(expected.map((i) => i.title))
    expect(needs.todo.length).toBeGreaterThan(0)
  })

  it('example-pending: the question read from the refusal, and the person waited for', async () => {
    ran.add('example-pending')
    const refused = new ManifestApiError(
      403,
      {
        error: {
          code: 'TOKEN_ACTION_PENDING',
          message: 'a person must confirm this',
          pendingAction: fixtures.PENDING_ACTION,
        },
      },
      'deploy',
    )
    expect(pendingActionOf(refused)).toEqual(fixtures.PENDING_ACTION)
    expect(
      pendingActionOf(new ManifestApiError(403, undefined, 'deploy')),
      'only TOKEN_ACTION_PENDING carries a question',
    ).toBeUndefined()
    const confirmed = await waitForAPerson(origin, TOKEN, CONFIRMED_ACTION_ID, {
      everyMs: 10,
      forMs: 1_000,
    })
    expect(confirmed.state).toBe('confirmed')
    const waiting = await waitForAPerson(origin, TOKEN, PENDING_ACTION_ID, {
      everyMs: 10,
      forMs: 50,
    })
    expect(waiting.state).toBe('pending')
  })

  it('ran every example file in this directory', async () => {
    const files = (await readdir(new URL('.', import.meta.url)))
      .filter((f) => /^example-.*\.ts$/.test(f) && !f.endsWith('.test.ts'))
      .map((f) => f.replace(/\.ts$/, ''))
      .sort()
    expect(files.length).toBeGreaterThan(0)
    expect([...ran].sort()).toEqual(files)
  })
})
