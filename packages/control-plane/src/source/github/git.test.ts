import { execFileSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startFake, type StartedFake } from '@manifest/github-fake/testing'
import { SourceError } from '../git-driver.js'
import { gitWithToken, isAuthRefusal, redactToken } from './git.js'

/** A token-shaped CANARY: if it is anywhere a person can read, a test says where. */
const CANARY = 'ghs_1000001_CANARYcanaryCANARYcanary0123456789'
const CANARY_B64 = Buffer.from(`x-access-token:${CANARY}`).toString('base64')

const failure = (p: Promise<unknown>) =>
  p.then(
    () => undefined,
    (e: unknown) => e,
  )

describe('git with a token (Decision 4, [M5])', () => {
  let fake: StartedFake
  let remote = ''
  beforeAll(async () => {
    fake = await startFake()
    const res = await fetch(`${fake.apiUrl}/orgs/${fake.org}/repos`, {
      method: 'POST',
      headers: {
        authorization: `token ${fake.developerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'strict', private: true }),
    })
    expect(res.status).toBe(201)
    remote = `${fake.gitUrl}/${fake.org}/strict.git`
  })
  afterAll(async () => {
    await fake.stop()
  })

  it('redacts a token, its x-access-token base64, and any Authorization: Basic value', () => {
    const text = `a ${CANARY} b ${CANARY_B64} c Authorization: Basic ZWxzZTp3aGVyZQ== d`
    const out = redactToken(text, CANARY)
    expect(out).not.toContain(CANARY)
    expect(out).not.toContain(CANARY_B64)
    expect(out).not.toContain('ZWxzZTp3aGVyZQ==')
    expect(out).toBe('a [token] b [token] c Authorization: Basic [token] d')
  })

  it('names an unreachable host by its code, with no form of the token in the message', async () => {
    const e = await failure(
      gitWithToken(['ls-remote', 'http://127.0.0.1:7196/o/r.git'], {
        cwd: tmpdir(),
        token: CANARY,
      }),
    )
    expect(e).toBeInstanceOf(SourceError)
    expect((e as SourceError).code).toBe('SOURCE_UNREACHABLE')
    const visible = `${(e as Error).message}\n${String(e)}\n${JSON.stringify(e)}`
    expect(visible).not.toContain(CANARY)
    expect(visible).not.toContain(CANARY_B64)
  })

  it('authenticates from the ENVIRONMENT against a server that checks — and a wrong token is refused as a refusal', async () => {
    // The positive control: the real token is SENT (form C authenticates), so "no leak"
    // below means git sent it and printed nothing, not that git never sent it.
    const out = await gitWithToken(['ls-remote', remote], {
      cwd: tmpdir(),
      token: fake.developerToken,
    })
    expect(out).toBe('') // an empty repository: no refs, and no error
    const refused = await failure(
      gitWithToken(['ls-remote', remote], { cwd: tmpdir(), token: CANARY }),
    )
    expect((refused as SourceError).code).toBe('SOURCE_GIT_FAILED')
    expect(isAuthRefusal(refused)).toBe(true)
    expect((refused as Error).message).not.toContain(CANARY)
    expect((refused as Error).message).not.toContain(CANARY_B64)
    // …and an unreachable host is NOT a refusal a fresh token could cure.
    const gone = await failure(
      gitWithToken(['ls-remote', 'http://127.0.0.1:7196/o/r.git'], { cwd: tmpdir() }),
    )
    expect(isAuthRefusal(gone)).toBe(false)
  })

  /**
   * `ps` shows every process's ARGUMENTS to every user on the machine, and no message test
   * can see them: git never prints its own argv, so a header moved into `-c` would leave
   * every other case here green (control (a), sitting 4). A `git` first on PATH records its
   * argv and hands on to the real one.
   */
  it('never puts the token in an argument — what `ps` shows every user', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'git-argv-'))
    const log = join(dir, 'argv.log')
    const real = execFileSync('/bin/sh', ['-c', 'command -v git']).toString().trim()
    await writeFile(
      join(dir, 'git'),
      `#!/bin/sh\nprintf '%s\\n' "$@" >> '${log}'\nexec '${real}' "$@"\n`,
    )
    await chmod(join(dir, 'git'), 0o755)
    const path = process.env.PATH
    process.env.PATH = `${dir}:${path ?? ''}`
    try {
      await gitWithToken(['ls-remote', remote], {
        cwd: tmpdir(),
        token: fake.developerToken,
      })
      const argv = await readFile(log, 'utf8')
      expect(argv).toContain('ls-remote') // the positive control: the recorder saw this call
      expect(argv).not.toContain(fake.developerToken)
      expect(argv).not.toContain(
        Buffer.from(`x-access-token:${fake.developerToken}`).toString('base64'),
      )
      expect(argv).not.toMatch(/extraHeader|Authorization/i)
    } finally {
      process.env.PATH = path
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('writes no form of the token to an inherited trace FILE, even with GIT_TRACE_REDACT=0 inherited ([M5], F3)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'git-trace-'))
    const trace = join(dir, 'curl.trace')
    const saved = {
      curl: process.env.GIT_TRACE_CURL,
      redact: process.env.GIT_TRACE_REDACT,
    }
    process.env.GIT_TRACE_CURL = trace
    process.env.GIT_TRACE_REDACT = '0'
    try {
      await failure(gitWithToken(['ls-remote', remote], { cwd: tmpdir(), token: CANARY }))
      const written = await readFile(trace, 'utf8')
      expect(written).toContain('Authorization: Basic') // the positive control: git traced the header
      expect(written).not.toContain(CANARY)
      expect(written).not.toContain(CANARY_B64)
    } finally {
      if (saved.curl === undefined) delete process.env.GIT_TRACE_CURL
      else process.env.GIT_TRACE_CURL = saved.curl
      if (saved.redact === undefined) delete process.env.GIT_TRACE_REDACT
      else process.env.GIT_TRACE_REDACT = saved.redact
      await rm(dir, { recursive: true, force: true })
    }
  })
})
