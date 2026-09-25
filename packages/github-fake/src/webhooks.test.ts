import { execFile } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { expectGitHubShape } from './schemas.js'
import { startFake, type StartedFake } from './testing.js'
import { sign } from './webhooks.js'

// The fake's WEBHOOKS (the D5 plan's Task 9): after every push it accepts, one signed `push`
// per ref that moved, as GitHub sends them. The receiver here is a bare HTTP server that
// records what arrived — the bytes, not a parse — so the signature is checked over exactly
// what was sent.

const run = promisify(execFile)
const IDENTITY = [
  '-c',
  'user.name=Fake Test',
  '-c',
  'user.email=fake@test.invalid',
  '-c',
  'commit.gpgsign=false',
]
const ZERO = '0'.repeat(40)

interface Received {
  headers: IncomingHttpHeaders
  body: Buffer
}

describe('the fake’s signer', () => {
  it('reproduces GitHub’s published test vector (docs.github.com, validating webhook deliveries)', () => {
    expect(sign("It's a Secret to Everybody", Buffer.from('Hello, World!')).sha256).toBe(
      'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
    )
  })
})

describe('the fake delivers a signed push after every push it accepts', () => {
  let fake: StartedFake
  let work: string
  let receiver: Server
  let received: Received[]
  let answer: number
  let receiverUrl: string

  beforeEach(async () => {
    received = []
    answer = 202
    receiver = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        received.push({ headers: req.headers, body: Buffer.concat(chunks) })
        res.writeHead(answer, { 'content-type': 'application/json' })
        res.end('{}')
      })
    })
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
    receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/webhooks/github`
    fake = await startFake({ webhookUrl: receiverUrl })
    work = mkdtempSync(join(tmpdir(), 'github-fake-hooks-'))
  })
  afterEach(async () => {
    await fake.stop()
    await new Promise<void>((resolve) => receiver.close(() => resolve()))
    rmSync(work, { recursive: true, force: true })
  })

  /** git as `faculty-dev`, a PERSON, with the token in the environment only. */
  async function git(args: string[], cwd = work): Promise<string> {
    const basic = Buffer.from(`x-access-token:${fake.developerToken}`).toString('base64')
    const { stdout } = await run('git', args, {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: work,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.extraHeader',
        GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
      },
    })
    return stdout
  }
  async function createRepo(name: string): Promise<void> {
    const res = await fetch(`${fake.apiUrl}/orgs/${fake.org}/repos`, {
      method: 'POST',
      headers: {
        authorization: `token ${fake.developerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name, private: true }),
    })
    expect(res.status).toBe(201)
  }
  /** A commit on `main` in a local clone at `dir`, pushed; returns the commit. */
  async function commitAndPush(dir: string, file: string, text: string, force = false) {
    writeFileSync(join(dir, file), text)
    await git(['add', file], dir)
    await git([...IDENTITY, 'commit', '-qm', `write ${file}`], dir)
    await git(['push', '-q', ...(force ? ['--force'] : []), 'origin', 'HEAD:main'], dir)
    return (await git(['rev-parse', 'HEAD'], dir)).trim()
  }
  interface Push extends Record<string, unknown> {
    before: string
    after: string
    forced: boolean
    created: boolean
    commits: { id: string }[]
  }
  const payload = (r: Received) => JSON.parse(r.body.toString('utf8')) as Push

  it('sends ONE push, signed over the exact bytes, GitHub-shaped, and records the answer', async () => {
    await createRepo('app')
    const dir = join(work, 'app')
    await git(['clone', '-q', `${fake.gitUrl}/${fake.org}/app.git`, dir])
    const sha = await commitAndPush(dir, 'manifest.yaml', 'manifest: 1\n')
    await fake.webhooksIdle()

    expect(received).toHaveLength(1)
    const [r] = received as [Received]
    expect(r.headers['content-type']).toBe('application/json')
    expect(r.headers['x-github-event']).toBe('push')
    expect(r.headers['x-github-delivery']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(r.headers['user-agent']).toMatch(/^GitHub-Hookshot\//)
    // Both signatures, each over the bytes that arrived — SHA-256 and the legacy SHA-1.
    expect(r.headers['x-hub-signature-256']).toBe(
      `sha256=${createHmac('sha256', fake.webhookSecret).update(r.body).digest('hex')}`,
    )
    expect(r.headers['x-hub-signature']).toBe(
      `sha1=${createHmac('sha1', fake.webhookSecret).update(r.body).digest('hex')}`,
    )
    const p = payload(r)
    expectGitHubShape('webhook push', p)
    expect(p).toMatchObject({
      ref: 'refs/heads/main',
      before: ZERO,
      after: sha,
      created: true,
      deleted: false,
      forced: false,
      base_ref: null,
      repository: { full_name: `${fake.org}/app`, private: true },
      pusher: { name: 'faculty-dev' },
      sender: { login: 'faculty-dev' },
      installation: { id: Number(fake.installationId) },
    })
    expect(p.commits).toHaveLength(1)
    expect(p.commits[0]).toMatchObject({ id: sha, added: ['manifest.yaml'] })
    expect(p.head_commit).toMatchObject({ id: sha })

    // The log: the answer the receiver gave — its status AND its body, so a caller can tell a
    // `200 { duplicate: true }` from any other 200 (the D5 plan's Task 15) — the id and the event.
    expect(fake.deliveries()).toEqual([
      expect.objectContaining({
        id: r.headers['x-github-delivery'],
        event: 'push',
        status: 202,
        answer: '{}',
      }),
    ])
  })

  it('names the commits a push added, and says when it was FORCED', async () => {
    await createRepo('app')
    const dir = join(work, 'app')
    await git(['clone', '-q', `${fake.gitUrl}/${fake.org}/app.git`, dir])
    const first = await commitAndPush(dir, 'a.txt', 'a\n')
    const second = await commitAndPush(dir, 'b.txt', 'b\n')
    await git([...IDENTITY, 'commit', '-q', '--amend', '-m', 'rewritten'], dir)
    await git(['push', '-q', '--force', 'origin', 'HEAD:main'], dir)
    const rewritten = (await git(['rev-parse', 'HEAD'], dir)).trim()
    await fake.webhooksIdle()

    const pushes = received.map(payload)
    expect(pushes.map((p) => [p.before, p.after, p.forced, p.created])).toEqual([
      [ZERO, first, false, true],
      [first, second, false, false],
      [second, rewritten, true, false],
    ])
    expect(pushes[1]!.commits.map((c) => c.id)).toEqual([second])
    for (const p of pushes) expectGitHubShape('webhook push', p)
  })

  it('redelivers with the SAME delivery id — the fake’s choice, unmeasured against GitHub (Decision 10)', async () => {
    await createRepo('app')
    const dir = join(work, 'app')
    await git(['clone', '-q', `${fake.gitUrl}/${fake.org}/app.git`, dir])
    await commitAndPush(dir, 'a.txt', 'a\n')
    await fake.webhooksIdle()
    const [first] = fake.deliveries()
    const res = await fetch(`${fake.url}/_fake/deliveries/${first!.id}/redeliver`, {
      method: 'POST',
    })
    expect(res.status).toBe(200)
    await fake.webhooksIdle()
    expect(received).toHaveLength(2)
    expect(received[1]!.headers['x-github-delivery']).toBe(first!.id)
    expect(received[1]!.body.equals(received[0]!.body)).toBe(true)
    // …and GET /_fake/deliveries is the same log the in-process handle reads.
    const listed = (await (await fetch(`${fake.url}/_fake/deliveries`)).json()) as {
      id: string
    }[]
    expect(listed.map((d) => d.id)).toEqual([first!.id, first!.id])
  })

  // The D5 plan's Task 15: `make demo-github` stops the fake's CONTAINER (step 6) and then asks
  // it to redeliver step 4's delivery (step 10). GitHub keeps three days of an App's deliveries
  // and redelivers any of them whatever it has restarted in between; an in-memory log did not.
  it('keeps its delivery log across a RESTART, as GitHub keeps three days of it — and redelivers from it', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'github-fake-restart-'))
    const first = await startFake({ dataDir, webhookUrl: receiverUrl })
    try {
      const res = await fetch(`${first.apiUrl}/orgs/${first.org}/repos`, {
        method: 'POST',
        headers: {
          authorization: `token ${first.developerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'kept', private: true }),
      })
      expect(res.status).toBe(201)
      // A publicize is one delivery with no git involved.
      await fetch(`${first.apiUrl}/repos/${first.org}/kept`, {
        method: 'PATCH',
        headers: {
          authorization: `token ${first.developerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ private: false }),
      })
      await first.webhooksIdle()
    } finally {
      await first.stop()
    }
    const [sent] = received
    const again = await startFake({ dataDir, webhookUrl: receiverUrl })
    try {
      const [logged] = again.deliveries()
      expect(logged).toMatchObject({ event: 'repository', status: 202, answer: '{}' })
      const res = await fetch(`${again.url}/_fake/deliveries/${logged!.id}/redeliver`, {
        method: 'POST',
      })
      expect(res.status).toBe(200)
      await again.webhooksIdle()
      expect(received).toHaveLength(2)
      expect(received[1]!.headers['x-github-delivery']).toBe(logged!.id)
      expect(received[1]!.body.equals(sent!.body)).toBe(true)
      expect(again.deliveries().map((d) => d.id)).toEqual([logged!.id, logged!.id])
    } finally {
      await again.stop()
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('records a receiver that is down, and the push still succeeds', async () => {
    await createRepo('app')
    await new Promise<void>((resolve) => receiver.close(() => resolve()))
    const dir = join(work, 'app')
    await git(['clone', '-q', `${fake.gitUrl}/${fake.org}/app.git`, dir])
    const sha = await commitAndPush(dir, 'a.txt', 'a\n')
    await fake.webhooksIdle()
    const [d] = fake.deliveries()
    expect(d).toMatchObject({ event: 'push', status: null })
    expect(d!.error).toMatch(/.+/)
    expect((await git(['ls-remote', 'origin', 'main'], dir)).split('\t')[0]).toBe(sha)
    // Re-listen so afterEach can close it.
    receiver = createServer()
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
  })

  it('delivers nothing while no webhook URL is set, and delivers once one is', async () => {
    await createRepo('app')
    fake.setWebhookUrl(undefined)
    const dir = join(work, 'app')
    await git(['clone', '-q', `${fake.gitUrl}/${fake.org}/app.git`, dir])
    await commitAndPush(dir, 'a.txt', 'a\n')
    await fake.webhooksIdle()
    expect(received).toHaveLength(0)
    expect(fake.deliveries()).toHaveLength(0)
    fake.setWebhookUrl(receiverUrl)
    await commitAndPush(dir, 'b.txt', 'b\n')
    await fake.webhooksIdle()
    expect(received).toHaveLength(1)
  })
})

describe('the fake delivers `repository` when a visibility change lands (Task 10)', () => {
  let received: Received[]
  let receiver: Server
  let url: string
  beforeEach(async () => {
    received = []
    receiver = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        received.push({ headers: req.headers, body: Buffer.concat(chunks) })
        res.writeHead(202)
        res.end()
      })
    })
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/webhooks/github`
  })
  afterEach(async () => {
    await new Promise<void>((resolve) => receiver.close(() => resolve()))
  })
  async function asPerson(
    fake: StartedFake,
    method: string,
    path: string,
    body?: unknown,
  ) {
    return fetch(`${fake.apiUrl}${path}`, {
      method,
      headers: {
        authorization: `token ${fake.developerToken}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  it('sends publicized, then privatized, GitHub-shaped — and nothing for a PATCH that changes nothing', async () => {
    const fake = await startFake({ webhookUrl: url })
    try {
      expect(
        (
          await asPerson(fake, 'POST', `/orgs/${fake.org}/repos`, {
            name: 'app',
            private: true,
          })
        ).status,
      ).toBe(201)
      expect(
        (await asPerson(fake, 'PATCH', `/repos/${fake.org}/app`, { private: false }))
          .status,
      ).toBe(200)
      expect(
        (await asPerson(fake, 'PATCH', `/repos/${fake.org}/app`, { private: false }))
          .status,
      ).toBe(200)
      expect(
        (await asPerson(fake, 'PATCH', `/repos/${fake.org}/app`, { private: true }))
          .status,
      ).toBe(200)
      await fake.webhooksIdle()
      expect(received.map((r) => r.headers['x-github-event'])).toEqual([
        'repository',
        'repository',
      ])
      const [publicized, privatized] = received.map(
        (r) => JSON.parse(r.body.toString('utf8')) as Record<string, unknown>,
      )
      expectGitHubShape('webhook repository-publicized', publicized)
      expect(publicized).toMatchObject({
        action: 'publicized',
        repository: { full_name: `${fake.org}/app`, private: false },
        sender: { login: 'faculty-dev' },
      })
      expect(privatized).toMatchObject({
        action: 'privatized',
        repository: { private: true },
      })
    } finally {
      await fake.stop()
    }
  })

  it('refusePrivatize (TEST-ONLY): a PATCH to private is refused 422, it stays public, and nothing is delivered', async () => {
    const fake = await startFake({ webhookUrl: url, quirks: { refusePrivatize: true } })
    try {
      await asPerson(fake, 'POST', `/orgs/${fake.org}/repos`, {
        name: 'app',
        private: true,
      })
      await asPerson(fake, 'PATCH', `/repos/${fake.org}/app`, { private: false })
      const refused = await asPerson(fake, 'PATCH', `/repos/${fake.org}/app`, {
        private: true,
      })
      expect(refused.status).toBe(422)
      const read = await asPerson(fake, 'GET', `/repos/${fake.org}/app`)
      expect(((await read.json()) as { private: boolean }).private).toBe(false)
      await fake.webhooksIdle()
      expect(received.map((r) => JSON.parse(r.body.toString('utf8')).action)).toEqual([
        'publicized',
      ])
    } finally {
      await fake.stop()
    }
  })
})
