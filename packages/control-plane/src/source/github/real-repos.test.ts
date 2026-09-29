import { createPrivateKey, generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startFake, type StartedFake } from '@manifest/github-fake/testing'
import {
  ownershipOf,
  ownershipWords,
  parseOwnershipRows,
  realRepos,
  type OwnershipRow,
} from './real-repos.js'

/**
 * `scripts/github-real-repos.sh`'s program (the launch path plan's Task 2) — WITHOUT real GitHub:
 * the ownership join as a pure function, and the whole list-and-delete flow against the in-process
 * fake. The controller's Step 6 runs the script against github.com, at Rich's yes.
 */

describe('who owns a repository (the ownership join)', () => {
  const rows: OwnershipRow[] = [
    { fullName: 'Manifest-local-dev/lp-real-a', projectId: 'p-a', state: 'active' },
    { fullName: 'Manifest-local-dev/lp-archived', projectId: 'p-b', state: 'archived' },
    { fullName: 'Manifest-local-dev/lp-gone', projectId: 'p-c', state: 'deleted' },
    // A slug freed by a delete and taken again (the D5 plan's Task 12): the tombstone, then the new one.
    { fullName: 'Manifest-local-dev/lp-again', projectId: 'p-old', state: 'deleted' },
    { fullName: 'Manifest-local-dev/lp-again', projectId: 'p-new', state: 'active' },
  ]

  it('is a live project’s, a deleted one’s, or nobody’s — matched whatever the case', () => {
    expect(ownershipWords(ownershipOf('manifest-local-dev/LP-REAL-A', rows))).toBe(
      'live p-a',
    )
    expect(ownershipWords(ownershipOf('Manifest-local-dev/lp-archived', rows))).toBe(
      'live p-b',
    )
    expect(ownershipWords(ownershipOf('Manifest-local-dev/lp-gone', rows))).toBe(
      'deleted',
    )
    expect(ownershipWords(ownershipOf('Manifest-local-dev/lp-again', rows))).toBe(
      'live p-new',
    )
    expect(ownershipWords(ownershipOf('Manifest-local-dev/lp-nobody', rows))).toBe('NONE')
    // Another organisation's repository of the same name is not this one.
    expect(ownershipWords(ownershipOf('manifest-apps/lp-real-a', rows))).toBe('NONE')
  })

  it('reads psql’s rows, and refuses a row it cannot read rather than guessing', () => {
    expect(parseOwnershipRows('Org/a|p-1|active\n\nOrg/b|p-2|deleted\n')).toEqual([
      { fullName: 'Org/a', projectId: 'p-1', state: 'active' },
      { fullName: 'Org/b', projectId: 'p-2', state: 'deleted' },
    ])
    expect(parseOwnershipRows('')).toEqual([])
    expect(() => parseOwnershipRows('Org/a|p-1')).toThrow(/full_name\|project_id\|state/)
    expect(() => parseOwnershipRows('Org/a|p-1|active|more')).toThrow(/full_name/)
  })
})

/**
 * THE FLOW, AGAINST THE FAKE. The fake does not serve `GET /installation/repositories` — no
 * driver calls it, and a route no conformance step holds would be the fake guessing at GitHub — so
 * the spy answers THAT ONE path from the fake's own state file, in GitHub's shape (`total_count`,
 * `repositories`, paged), and only for a token the fake minted. Every other call — the App's JWT,
 * each token mint, the delete — is the fake's own answer.
 */
describe('github-real-repos: list, and delete only what no project holds (against the fake)', () => {
  let fake: StartedFake
  let dataDir: string
  const minted: string[] = []
  const said: string[] = []
  let asked = 0

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'github-fake-data-'))
    fake = await startFake({ dataDir })
    minted.length = 0
    said.length = 0
    asked = 0
    for (const slug of ['lp-live', 'lp-tomb', 'lp-none']) {
      const res = await fetch(`${fake.apiUrl}/orgs/${fake.org}/repos`, {
        method: 'POST',
        headers: {
          authorization: `token ${fake.developerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: slug, private: true }),
      })
      expect(res.status).toBe(201)
    }
  })
  afterEach(async () => {
    await fake.stop()
    await rm(dataDir, { recursive: true, force: true })
  })

  const spy: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/installation/repositories')) {
      const auth = new Headers(init?.headers).get('authorization') ?? ''
      if (!minted.some((t) => auth === `token ${t}`)) {
        return Response.json({ message: 'Bad credentials' }, { status: 401 })
      }
      const state = JSON.parse(await readFile(join(dataDir, 'state.json'), 'utf8')) as {
        repos: Record<string, { name: string; private: boolean }>
      }
      const all = Object.values(state.repos).sort((a, b) => a.name.localeCompare(b.name))
      const perPage = Number(url.searchParams.get('per_page'))
      const page = Number(url.searchParams.get('page'))
      return Response.json({
        total_count: all.length,
        repository_selection: 'all',
        repositories: all.slice((page - 1) * perPage, page * perPage).map((r) => ({
          name: r.name,
          full_name: `${fake.org}/${r.name}`,
          private: r.private,
        })),
      })
    }
    const res = await fetch(input, init)
    if (url.pathname.endsWith('/access_tokens') && res.status === 201) {
      minted.push(((await res.clone().json()) as { token: string }).token)
    }
    return res
  }

  const rows = (): OwnershipRow[] => [
    { fullName: `${fake.org}/lp-live`, projectId: 'p-live', state: 'active' },
    // GitHub's capitals, not ours: matched case-insensitively.
    {
      fullName: `${fake.org.toUpperCase()}/LP-TOMB`,
      projectId: 'p-tomb',
      state: 'deleted',
    },
  ]

  const run = (deleteName?: string, answer = 'yes', perPage?: number) =>
    realRepos({
      github: {
        apiUrl: fake.apiUrl,
        org: fake.org,
        appId: fake.appId,
        installationId: fake.installationId,
        appKey: createPrivateKey(fake.appKeyPem),
        fetch: spy,
      },
      rows: rows(),
      ...(deleteName === undefined ? {} : { deleteName }),
      ask: async () => {
        asked += 1
        return answer
      },
      say: (line) => said.push(line),
      ...(perPage === undefined ? {} : { perPage }),
    })

  const onGithub = async (slug: string) =>
    (
      await fetch(`${fake.apiUrl}/repos/${fake.org}/${slug}`, {
        headers: { authorization: `token ${fake.developerToken}` },
      })
    ).status

  it('lists every repository beside its owner — live, deleted or NONE — and prints no token', async () => {
    expect(await run()).toBe(0)
    expect(said[0]).toBe(`${fake.org} on ${new URL(fake.apiUrl).host}: 3 repositories`)
    expect(said.slice(1).map((l) => l.trim().split(/\s+/))).toEqual([
      ['lp-live', 'live', 'p-live'],
      ['lp-none', 'NONE'],
      ['lp-tomb', 'deleted'],
    ])
    expect(minted.length).toBeGreaterThan(0)
    for (const line of said) {
      for (const token of minted) expect(line).not.toContain(token)
      expect(line).not.toMatch(/ghs_|BEGIN/)
    }
  })

  it('reads every page, and says the count GitHub gave', async () => {
    expect(await run(undefined, 'yes', 2)).toBe(0)
    expect(said[0]).toMatch(/: 3 repositories$/)
    expect(said).toHaveLength(4)
  })

  it('never deletes a repository a live project owns, or a deleted project’s — and never asks', async () => {
    expect(await run('lp-live')).toBe(1)
    expect(said.at(-1)).toMatch(
      /^FAIL manifest-apps\/lp-live reads 'live p-live': a live project owns it/,
    )
    expect(await run('LP-TOMB')).toBe(1)
    expect(said.at(-1)).toMatch(/reads 'deleted': a deleted project’s row names it/)
    expect(asked).toBe(0)
    expect(await onGithub('lp-live')).toBe(200)
    expect(await onGithub('lp-tomb')).toBe(200)
  })

  it('deletes a NONE repository only after yes — the positive control deletes it', async () => {
    expect(await run('lp-none', 'no')).toBe(1)
    expect(said.at(-1)).toBe(`Not deleted: the answer was not 'yes'.`)
    expect(await run('lp-none', '')).toBe(1) // EOF, or an empty line, is not yes
    expect(await onGithub('lp-none')).toBe(200)
    expect(asked).toBe(2)
    // THE POSITIVE CONTROL: the same repository, `yes` — gone on GitHub, and from the next list.
    expect(await run('lp-none', 'yes')).toBe(0)
    expect(said.at(-1)).toBe(
      `Deleted ${fake.org}/lp-none on ${new URL(fake.apiUrl).host}.`,
    )
    expect(await onGithub('lp-none')).toBe(404)
    said.length = 0
    expect(await run()).toBe(0)
    expect(said[0]).toMatch(/: 2 repositories$/)
    expect(said.join('\n')).not.toContain('lp-none')
  })

  it('refuses a name that is not in the organisation, or is not a name — and deletes nothing', async () => {
    expect(await run(`nope-${randomUUID().slice(0, 8)}`)).toBe(1)
    expect(said.at(-1)).toMatch(/is not in the list above; nothing was deleted$/)
    expect(await run('../lp-none')).toBe(1)
    expect(said.at(-1)).toMatch(/is not a repository name; nothing was deleted$/)
    expect(asked).toBe(0)
    expect(await onGithub('lp-none')).toBe(200)
  })

  it('a refused mint is said, redacted, and ends it — never swallowed', async () => {
    // Another App's key: the fake refuses the JWT it signs, as GitHub would.
    const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    const code = await realRepos({
      github: {
        apiUrl: fake.apiUrl,
        org: fake.org,
        appId: fake.appId,
        installationId: fake.installationId,
        appKey: wrongKey,
        fetch: spy,
      },
      rows: rows(),
      ask: async () => 'yes',
      say: (line) => said.push(line),
    })
    expect(code).toBe(1)
    expect(said).toEqual([
      expect.stringMatching(
        /^FAIL GitHub answered 401 to mint a token to list the organisation/,
      ),
    ])
  })
})
