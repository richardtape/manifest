import { describe, expect, it } from 'vitest'
import { SourceError } from '../git-driver.js'
import type { GithubClient, GithubResponse } from './client.js'
import { createTokenCache } from './tokens.js'

/**
 * A client that mints a numbered token per call, expiring an hour after `now` — so what the
 * cache sends and keeps is visible without a server. It is the cache under test, not GitHub.
 */
function mintingClient(now: () => Date) {
  const asked: unknown[] = []
  let n = 0
  const client: GithubClient = {
    async asApp(_method, _path, body) {
      asked.push(body)
      n += 1
      return {
        status: 201,
        json: {
          token: `ghs_1000001_token${n}`,
          expires_at: new Date(now().getTime() + 60 * 60_000).toISOString(),
        },
      }
    },
    async asToken() {
      throw new Error('the cache never uses a token itself')
    },
    refusal: (operation: string, res: GithubResponse) =>
      new SourceError('SOURCE_GITHUB_REFUSED', `${res.status} to ${operation}`),
  }
  return { client, asked }
}

describe('installation tokens, in memory (Decision 4)', () => {
  it('keeps one token per repository AND purpose until five minutes before it expires', async () => {
    let t = Date.parse('2026-09-24T12:00:00Z')
    const now = () => new Date(t)
    const { client, asked } = mintingClient(now)
    const tokens = createTokenCache({ client, installationId: '2000001', now })
    const a = await tokens.forRepository('chem-labs', { contents: 'read' })
    expect(await tokens.forRepository('chem-labs', { contents: 'read' })).toBe(a)
    const write = await tokens.forRepository('chem-labs', { contents: 'write' })
    const other = await tokens.forRepository('bio-labs', { contents: 'read' })
    expect(new Set([a, write, other]).size).toBe(3)
    expect(asked).toEqual([
      { repositories: ['chem-labs'], permissions: { contents: 'read' } },
      { repositories: ['chem-labs'], permissions: { contents: 'write' } },
      { repositories: ['bio-labs'], permissions: { contents: 'read' } },
    ])
    t += 54 * 60_000 // six minutes left: still kept
    expect(await tokens.forRepository('chem-labs', { contents: 'read' })).toBe(a)
    t += 2 * 60_000 // four minutes left: re-minted
    expect(await tokens.forRepository('chem-labs', { contents: 'read' })).not.toBe(a)
  })

  it('never keeps the installation-wide token, and asks for administration alone', async () => {
    const now = () => new Date('2026-09-24T12:00:00Z')
    const { client, asked } = mintingClient(now)
    const tokens = createTokenCache({ client, installationId: '2000001', now })
    const first = await tokens.installationWide({ administration: 'write' })
    expect(await tokens.installationWide({ administration: 'write' })).not.toBe(first)
    expect(asked).toEqual([
      { permissions: { administration: 'write' } },
      { permissions: { administration: 'write' } },
    ])
  })

  it("forgets one repository's tokens and no other's", async () => {
    const now = () => new Date('2026-09-24T12:00:00Z')
    const { client } = mintingClient(now)
    const tokens = createTokenCache({ client, installationId: '2000001', now })
    const chem = await tokens.forRepository('chem-labs', { contents: 'read' })
    const chemistry = await tokens.forRepository('chem-labs-2', { contents: 'read' })
    tokens.forget('chem-labs')
    expect(await tokens.forRepository('chem-labs', { contents: 'read' })).not.toBe(chem)
    expect(await tokens.forRepository('chem-labs-2', { contents: 'read' })).toBe(
      chemistry,
    )
  })

  it('redacts every token it has handed out, including the one it never kept', async () => {
    const now = () => new Date('2026-09-24T12:00:00Z')
    const { client } = mintingClient(now)
    const tokens = createTokenCache({ client, installationId: '2000001', now })
    const kept = await tokens.forRepository('chem-labs', { contents: 'read' })
    const wide = await tokens.installationWide({ administration: 'write' })
    const out = tokens.redact(`failed with ${kept} and ${wide}`)
    expect(out).not.toContain(kept)
    expect(out).not.toContain(wide)
  })

  it('answers a refused mint as SOURCE_GITHUB_REFUSED, never as a token', async () => {
    const now = () => new Date('2026-09-24T12:00:00Z')
    const client: GithubClient = {
      asApp: async () => ({ status: 401, json: { message: 'Bad credentials' } }),
      asToken: async () => ({ status: 500, json: undefined }),
      refusal: (operation, res) =>
        new SourceError('SOURCE_GITHUB_REFUSED', `${res.status} to ${operation}`),
    }
    const tokens = createTokenCache({ client, installationId: '2000001', now })
    await expect(
      tokens.forRepository('chem-labs', { contents: 'read' }),
    ).rejects.toMatchObject({ code: 'SOURCE_GITHUB_REFUSED' })
  })
})
