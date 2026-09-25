import type { GithubClient } from './client.js'
import { redactToken } from './git.js'

export type TokenPermissions = Partial<
  Record<'contents' | 'administration', 'read' | 'write'>
>

export interface TokenCache {
  /** One repository, the least permission; cached until five minutes before it expires. */
  forRepository(repository: string, permissions: TokenPermissions): Promise<string>
  /** Decision 4's ONE exception: creating a repository. NEVER cached. */
  installationWide(permissions: { administration: 'write' }): Promise<string>
  /** After GitHub refuses one of this repository's tokens: the next call re-mints. */
  forget(repository: string): void
  /** `text` with every token this process holds, or has held and not seen expire, removed. */
  redact(text: string): string
}

/**
 * INSTALLATION TOKENS, IN MEMORY AND NOWHERE ELSE (Decision 4). Minted per repository and
 * per purpose — `contents: read` to fetch, `contents: write` to push, `administration: write`
 * to change visibility or protection, or delete — and never written to a row, a file, an
 * argument, a URL, a message or a log line. Postgres would put a live credential in a backup.
 *
 * **What a per-repository `administration: write` token can do is wider than its name**:
 * GitHub does not confine creation to a token's repositories (measured 2026-09-24, conformance
 * C7s; §20's git-driver bullet 1 as corrected), so every such token can create a repository in
 * the organisation. It is why none of them ever leaves this process — Decision 20.
 */
export function createTokenCache(i: {
  client: GithubClient
  installationId: string
  now: () => Date
}): TokenCache {
  const cache = new Map<string, { token: string; expiresAt: number }>()
  /** Every token minted and not yet seen expired — what `redact` removes. */
  const held = new Map<string, number>()
  const key = (repository: string, p: TokenPermissions) =>
    `${repository} ${JSON.stringify(Object.entries(p).sort())}`

  async function mint(
    body: Record<string, unknown>,
  ): Promise<{ token: string; expiresAt: number }> {
    const res = await i.client.asApp(
      'POST',
      `/app/installations/${i.installationId}/access_tokens`,
      body,
    )
    if (res.status !== 201) throw i.client.refusal('mint an installation token', res)
    const b = res.json as { token?: unknown; expires_at?: unknown }
    const expiresAt = typeof b.expires_at === 'string' ? Date.parse(b.expires_at) : NaN
    if (typeof b.token !== 'string' || b.token.length === 0 || Number.isNaN(expiresAt)) {
      throw i.client.refusal('mint an installation token (no token in the answer)', res)
    }
    held.set(b.token, expiresAt)
    return { token: b.token, expiresAt }
  }

  return {
    async forRepository(repository, permissions) {
      const k = key(repository, permissions)
      const hit = cache.get(k)
      if (hit !== undefined && hit.expiresAt - i.now().getTime() > 5 * 60_000) {
        return hit.token
      }
      const fresh = await mint({ repositories: [repository], permissions })
      cache.set(k, fresh)
      return fresh.token
    },
    // A token cannot name a repository that does not exist yet (conformance C5b: 422), so
    // creation alone is installation-wide: administration and nothing else, one call, never
    // kept.
    async installationWide(permissions) {
      return (await mint({ permissions })).token
    },
    forget(repository) {
      for (const k of [...cache.keys()])
        if (k.startsWith(`${repository} `)) cache.delete(k)
    },
    redact(text) {
      const t = i.now().getTime()
      let out = text
      for (const [token, expiresAt] of [...held]) {
        if (expiresAt <= t) held.delete(token)
        out = redactToken(out, token)
      }
      return redactToken(out, undefined)
    },
  }
}
