import type { KeyObject } from 'node:crypto'
import { SourceError } from '../git-driver.js'
import { appJwt } from './app-auth.js'

/** GitHub's answer: its status, and its JSON body (`undefined` for a `204` or no JSON). */
export interface GithubResponse {
  status: number
  json: unknown
}

export interface GithubClient {
  /** As the App itself — a JWT signed with its key, minted per call and never kept. */
  asApp(method: string, path: string, body?: unknown): Promise<GithubResponse>
  /** As an installation, with one of its tokens. */
  asToken(
    token: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<GithubResponse>
  /** `SOURCE_GITHUB_REFUSED`, from GitHub's own `message` alone — never its whole body. */
  refusal(operation: string, res: GithubResponse): SourceError
}

/**
 * THE REST CLIENT — a thin `fetch` wrapper, with no Octokit (the plan's Tech Stack). Paths
 * are relative to `apiUrl` (`https://api.github.com`, or the fake's `…/api/v3`).
 *
 * **A `fetch` that rejects is `SOURCE_UNREACHABLE`** — a refused connection, a name that does
 * not resolve, or GitHub not answering within ten seconds (Decision 18: `503`, never a stale
 * answer). Its message names the operation and the network's own code, never a header.
 */
export function createGithubClient(o: {
  apiUrl: string
  appId: string
  appKey: KeyObject
  fetch?: typeof fetch
  now?: () => Date
}): GithubClient {
  const doFetch = o.fetch ?? fetch
  const now = o.now ?? (() => new Date())

  async function call(
    authorization: string,
    method: string,
    path: string,
    body: unknown,
  ): Promise<GithubResponse> {
    let res: Response
    try {
      res = await doFetch(`${o.apiUrl}${path}`, {
        method,
        headers: {
          authorization,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          // GitHub refuses a request with no User-Agent.
          'user-agent': 'manifest-control-plane (D5 driver 2)',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (error) {
      const cause = (error as { cause?: { code?: unknown } }).cause?.code
      const why =
        typeof cause === 'string' ? cause : ((error as Error).name ?? 'no answer')
      throw new SourceError(
        'SOURCE_UNREACHABLE',
        `GitHub could not be reached (${method} ${path}): ${why}`,
      )
    }
    const text = await res.text()
    let json: unknown
    try {
      json = text.length === 0 ? undefined : JSON.parse(text)
    } catch {
      json = undefined
    }
    return { status: res.status, json }
  }

  return {
    asApp(method, path, body) {
      return call(
        `Bearer ${appJwt({ appId: o.appId, key: o.appKey, now: now() })}`,
        method,
        path,
        body,
      )
    },
    asToken(token, method, path, body) {
      return call(`token ${token}`, method, path, body)
    },
    refusal(operation, res) {
      const message = (res.json as { message?: unknown } | undefined)?.message
      const said = typeof message === 'string' ? message.slice(0, 200) : 'no message'
      return new SourceError(
        'SOURCE_GITHUB_REFUSED',
        `GitHub answered ${res.status} to ${operation}: ${said}`,
      )
    },
  }
}
