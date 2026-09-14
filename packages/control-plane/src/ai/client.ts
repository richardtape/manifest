import { AI_CODES, AiError, mapLiteLlmError } from './errors.js'

/**
 * The LiteLLM ADMIN transport (P4b Task 5). Every call the control plane makes to
 * LiteLLM goes through here, and this is the one place that (a) attaches the master
 * key, (b) has a timeout, and (c) turns a failure into an `AiError` rather than a raw
 * body. Without (c), `mapLiteLlmError` is a module with no call site, and the first
 * caller to write `throw new Error(await res.text())` puts the key hash back into an
 * exception message (§14).
 *
 * `fetch`, not the OpenAI SDK: the admin API is ordinary JSON over the published
 * port. The SDK is the APP's concern, and P4a measured that it cannot be proxied.
 */
export interface LiteLlmClient {
  get<T>(path: string, query?: Record<string, string>): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
}

export class AiConfigError extends Error {
  readonly code = 'AI_MASTER_KEY_MISSING'
  constructor(message: string) {
    super(message)
    this.name = 'AiConfigError'
  }
}

/**
 * Long enough for LiteLLM's slowest admin call measured here (`/key/generate` writes
 * to Postgres), short enough that a dead gateway fails a deploy with a reason rather
 * than hanging it until the readiness timeout.
 */
const DEFAULT_TIMEOUT_MS = 10_000

export function createLiteLlmClient(opts: {
  baseUrl: string
  masterKey: string
  timeoutMs?: number
}): LiteLlmClient {
  // At CONSTRUCTION, in every environment. A missing key is not a degraded mode:
  // every call would be refused, and the refusal would arrive as an authentication
  // error at deploy time naming LiteLLM rather than the setting that is missing.
  if (!opts.masterKey) {
    throw new AiConfigError(
      'the LiteLLM admin client needs a master key. Set MANIFEST_LITELLM_MASTER_KEY — ' +
        "README's export block derives it from LITELLM_MASTER_KEY in .env.",
    )
  }
  const base = opts.baseUrl.replace(/\/+$/, '')
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    query: Record<string, string> | undefined,
    body: unknown,
  ): Promise<T> {
    const url = `${base}${path}${query ? `?${new URLSearchParams(query).toString()}` : ''}`
    let status: number
    let text: string
    try {
      const res = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${opts.masterKey}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        // Covers the body read below as well as the headers.
        signal: AbortSignal.timeout(timeoutMs),
      })
      status = res.status
      text = await res.text()
    } catch (error) {
      // Nothing answered in time, or nothing answered at all. The reason is one of
      // two fixed words — undici's cause carries an address, and the rule is that
      // nothing from outside this module reaches an AiError's fields.
      const timedOut =
        error instanceof DOMException &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      throw new AiError(AI_CODES.BACKEND_UNAVAILABLE, 0, {
        status: 0,
        reason: timedOut ? 'timeout' : 'unreachable',
      })
    }

    let parsed: unknown
    let parses = true
    try {
      parsed = JSON.parse(text)
    } catch {
      // A proxy in front of LiteLLM answers HTML. Node's SyntaxError QUOTES the text
      // it could not parse, so the parse error itself must never propagate.
      parses = false
    }
    if (status < 200 || status >= 300) throw mapLiteLlmError(status, parsed)
    if (!parses) throw new AiError(AI_CODES.UNMAPPED, status, { status })
    return parsed as T
  }

  return {
    get: <T>(path: string, query?: Record<string, string>) =>
      request<T>('GET', path, query, undefined),
    post: <T>(path: string, body: unknown) => request<T>('POST', path, undefined, body),
  }
}
