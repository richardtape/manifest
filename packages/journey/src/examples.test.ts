import { readdir } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { ManifestApiError } from '@manifest/contract'
/**
 * THE MOCK BY ITS PATH, NOT ITS PACKAGE NAME: naming `@manifest/mock` as this package's
 * devDependency needs a `pnpm install`, and pnpm 11's supply-chain check of the whole lockfile
 * refuses one offline (the authoring API plan's Task 11). This file is a test, which `tsc`
 * excludes here, so no `rootDir` is crossed; the examples themselves import only the contract.
 */
import { createMockServer, fixtures } from '../../mock/src/index.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  askTheModel,
  endTheSession,
  startAModelSession,
  whatItHasSpent,
} from './example-agent-session.js'
import { bringBack, deleteForGood, switchOff } from './example-archive.js'
import { bodySha256, questionAbout } from './example-body-hash.js'
import { commitAFile, readBytes } from './example-binary.js'
import { buildAndWatch } from './example-build.js'
import { checkManifest } from './example-check.js'
import { commitAChange } from './example-commit.js'
import { commitOnWhatIsThere } from './example-conflict.js'
import { releaseToStaging } from './example-deploy.js'
import { startDescribing, stopDescribing } from './example-intake.js'
import { whatALaunchNeeds } from './example-launch.js'
import { whatTheAppPrinted } from './example-output.js'
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

/** A second mock in one of its scripted states (`MockOptions`), for as long as `use` runs. */
async function withMock<T>(
  options: Parameters<typeof createMockServer>[0],
  use: (origin: string) => Promise<T>,
): Promise<T> {
  const other = createMockServer(options)
  await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve))
  try {
    return await use(`http://127.0.0.1:${(other.address() as { port: number }).port}`)
  } finally {
    await new Promise((resolve) => other.close(resolve))
  }
}

interface Heard {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: string
}

/**
 * A STAND-IN FOR WHAT THE MOCK DOES NOT PLAY — the model gateway, step-up, a teardown that stops
 * part way: it answers each request with the next of `answers` (the last repeats) and keeps what
 * it heard, so a case can assert what an example SENT.
 */
async function withStandIn<T>(
  answers: { status: number; body: unknown; headers?: Record<string, string> }[],
  use: (origin: string, heard: Heard[]) => Promise<T>,
): Promise<T> {
  const heard: Heard[] = []
  const standIn = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    req.on('end', () => {
      heard.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body,
      })
      const answer = answers[Math.min(heard.length, answers.length) - 1]!
      res.writeHead(answer.status, {
        'content-type': 'application/json',
        ...(answer.headers ?? {}),
      })
      res.end(JSON.stringify(answer.body))
    })
  })
  await new Promise<void>((resolve) => standIn.listen(0, '127.0.0.1', resolve))
  try {
    return await use(
      `http://127.0.0.1:${(standIn.address() as { port: number }).port}`,
      heard,
    )
  } finally {
    await new Promise((resolve) => standIn.close(resolve))
  }
}

const refusal = (code: string, message: string) => ({ error: { code, message } })

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

  it('example-output: the serving sandbox instance’s last lines, redacted and cut — staging refused by its own code', async () => {
    ran.add('example-output')
    const sandbox = await whatTheAppPrinted(origin, TOKEN, fixtures.SANDBOX_ID, 50)
    if (!sandbox.read) throw new Error(`expected the sandbox's lines: ${sandbox.next}`)
    expect(sandbox.instanceId).toBe(fixtures.SANDBOX_INSTANCE_ID)
    expect(sandbox.lines.map((l) => l.text)).toContain(
      'GET /healthz 200 — session store connected with [REDACTED]',
    )
    expect(sandbox.lines.some((l) => /…\[cut: \d+ bytes\]$/.test(l.text))).toBe(true)
    // `lines` is at most what was asked, the newest kept.
    const two = await whatTheAppPrinted(origin, TOKEN, fixtures.SANDBOX_ID, 2)
    expect(two.read && two.lines.length).toBe(2)
    // Staging and production serve real people: each is refused by its own code.
    const staging = await whatTheAppPrinted(origin, TOKEN, fixtures.STAGING.id, 50)
    expect(staging).toEqual({
      read: false,
      instanceId: fixtures.INSTANCE_ID,
      code: 'INSTANCE_OUTPUT_STAGING',
      next: expect.stringContaining('sandbox'),
    })
    // Nothing has run in production, so there is nothing to ask for.
    expect(await whatTheAppPrinted(origin, TOKEN, fixtures.PRODUCTION_ID, 50)).toEqual({
      read: false,
      instanceId: null,
      code: null,
      next: expect.stringContaining('deploy'),
    })
  })

  it('example-agent-session: the month read, a key answered once, the model asked, what it spent, and the session ended', async () => {
    ran.add('example-agent-session')
    const started = await startAModelSession(
      origin,
      TOKEN,
      PROJECT_ID,
      'Build the bulletin board',
    )
    if (!started.started) throw new Error(`expected a key: ${started.why}`)
    expect(started.key).toBe(fixtures.MOCK_MODEL_KEY)
    // The capable model, because the session lists it.
    expect(started.model).toBe('default-chat-large')
    // The gateway is a stand-in answering as the platform's does when the on-premise model
    // answered in the capable model's place.
    const answer = await withStandIn(
      [
        {
          status: 200,
          body: {
            model: 'default-chat-onprem',
            choices: [{ message: { content: 'Hello.' } }],
          },
          headers: { 'x-litellm-attempted-fallbacks': '1' },
        },
      ],
      async (gateway, heard) => {
        const said = await askTheModel(
          { ...started, baseUrl: `${gateway}/v1` },
          'Say hello.',
        )
        expect(heard[0]).toMatchObject({ method: 'POST', url: '/v1/chat/completions' })
        expect(heard[0]!.headers.authorization).toBe(`Bearer ${fixtures.MOCK_MODEL_KEY}`)
        expect(JSON.parse(heard[0]!.body)).toMatchObject({ model: 'default-chat-large' })
        return said
      },
    )
    expect(answer).toEqual({
      text: 'Hello.',
      answeredBy: 'default-chat-onprem',
      fellBack: true,
    })
    expect(
      await whatItHasSpent(origin, TOKEN, PROJECT_ID, fixtures.AGENT_SESSION_ID),
    ).toBe('$0.40 so far · $9.35 left this month')
    expect(await endTheSession(origin, TOKEN, started.sessionId)).toBe('ended')
  })

  it('example-agent-session: a spent month is said plainly and no key is asked for; unknown spend is never $0', async () => {
    await withMock({ agentBudget: 'exhausted' }, async (spent) => {
      expect(
        await startAModelSession(spent, TOKEN, PROJECT_ID, 'Fix the sign-in page'),
      ).toEqual({
        started: false,
        why: expect.stringMatching(
          /^This month’s \$10\.00 of agent budget is spent; it resets /,
        ),
      })
    })
    await withMock({ agentBudget: 'unavailable' }, async (unknown) => {
      expect(
        await whatItHasSpent(unknown, TOKEN, PROJECT_ID, fixtures.AGENT_SESSION_ID),
      ).toBe('spend not known right now · the month not known right now')
    })
  })

  it('example-intake: a person describing an app is given the platform’s model for minutes; a paused day is said plainly', async () => {
    ran.add('example-intake')
    const started = await startDescribing(origin, SESSION)
    if (!started.started) throw new Error(`expected a key: ${started.why}`)
    expect(started).toMatchObject({
      key: fixtures.MOCK_MODEL_KEY,
      baseUrl: fixtures.MODEL_BASE_URL,
      model: 'default-chat',
    })
    expect(await stopDescribing(origin, SESSION, started.intakeSessionId)).toBe('ended')
    await withMock({ intake: 'daily-limit' }, async (paused) => {
      expect(await startDescribing(paused, SESSION)).toEqual({
        started: false,
        code: 'INTAKE_DAILY_LIMIT_REACHED',
        why: expect.stringContaining('10 intake sessions'),
      })
    })
  })

  it('example-binary: an image committed as its bytes, and a file read back as bytes', async () => {
    ran.add('example-binary')
    // A PNG's first bytes are what the platform recognises it by.
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
    ])
    expect(
      await commitAFile(
        origin,
        TOKEN,
        PROJECT_ID,
        'public/logo.png',
        png,
        'Add the course logo',
      ),
    ).toMatch(/^[0-9a-f]{40}$/)
    // Any file reads as bytes — text too — so the bytes of the one the mock holds are its text.
    const text = await readAFile(origin, TOKEN, PROJECT_ID, 'src/app.js')
    const bytes = await readBytes(origin, TOKEN, PROJECT_ID, 'src/app.js', text.commitSha)
    expect(new TextDecoder().decode(bytes)).toBe(text.text)
  })

  it('example-archive: switched off, brought back, and a never-launched app deleted — each refusal with what to do next', async () => {
    ran.add('example-archive')
    const here = '/projects/mock-app'
    expect(await switchOff(origin, SESSION, PROJECT_ID, here)).toEqual({
      done: true,
      state: 'archived',
    })
    expect(await bringBack(origin, SESSION, PROJECT_ID)).toEqual({
      done: true,
      state: 'active',
    })
    expect(await deleteForGood(origin, SESSION, PROJECT_ID, here)).toEqual({
      done: true,
      state: 'deleted',
    })
    await withMock({ launched: true }, async (launched) => {
      expect(await deleteForGood(launched, SESSION, PROJECT_ID, here)).toEqual({
        done: false,
        refused: 'PROJECT_LAUNCHED_NOT_DELETABLE',
        next: expect.stringContaining('Switch it off instead'),
      })
    })
    // The mock plays no step-up: a stand-in refuses as the platform does without a recent one.
    await withStandIn(
      [{ status: 403, body: refusal('STEP_UP_REQUIRED', 'sign in again first') }],
      async (platform) => {
        expect(await switchOff(platform, SESSION, PROJECT_ID, here)).toEqual({
          done: false,
          stepUpAt: '/auth/step-up?returnTo=%2Fprojects%2Fmock-app',
        })
      },
    )
    // A delete that stops part way is finished by the SAME request — the same key — never restored.
    await withStandIn(
      [
        {
          status: 500,
          body: refusal('PROJECT_TEARDOWN_INCOMPLETE', 'stopped at release-names'),
        },
        {
          status: 200,
          body: {
            id: PROJECT_ID,
            slug: 'mock-app',
            state: 'deleted',
            deletedAt: '2026-09-28T16:00:00.000Z',
          },
        },
      ],
      async (platform, heard) => {
        expect(await deleteForGood(platform, SESSION, PROJECT_ID, here)).toEqual({
          done: true,
          state: 'deleted',
        })
        expect(heard.map((h) => h.method)).toEqual(['DELETE', 'DELETE'])
        expect(heard[1]!.headers['idempotency-key']).toBe(
          heard[0]!.headers['idempotency-key'],
        )
        // A bodyless DELETE carries no Content-Type (Conventions).
        expect(heard[0]!.headers['content-type']).toBeUndefined()
      },
    )
  })

  it('example-body-hash: the platform’s canonical hash of a body, and the question about a request', async () => {
    ran.add('example-body-hash')
    // THE SAME THREE VECTORS as the platform's own `tokens/pending.test.ts` — its hash, not a copy.
    expect(await bodySha256({ b: [2, 1], a: { d: undefined, c: 'x' } })).toBe(
      '938ba65323cc63ca467b83df32d11c44b6ae4306205b6d91900297d9c946b621',
    )
    expect(await bodySha256(undefined)).toBe(
      '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    )
    expect(
      await bodySha256({ n: 1.5, body: { value: 'é ✓', environmentKind: 'production' } }),
    ).toBe('4d081fb3e5378c1c58d4e3caa85fa846abb3d462003d7c3cb0db1f814c3150e5')
    const asked = fixtures.PENDING_ACTION
    expect(
      questionAbout(
        [fixtures.CONFIRMED_ACTION, asked],
        asked.method,
        asked.path,
        asked.bodySha256,
      ),
    ).toBe(asked)
    expect(
      questionAbout([asked], asked.method, asked.path, '0'.repeat(64)),
    ).toBeUndefined()
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
