import createClient, { type Client } from 'openapi-fetch'
import type { components, paths } from './schema.js'
import { ManifestApiError, type ErrorEnvelope } from './errors.js'

export const SESSION_COOKIE = 'manifest_session'

export type Schemas = components['schemas']
export type ManifestClient = Client<paths>

export interface ManifestClientOptions {
  /** The console's origin — `https://console.manifest.internal` on a laptop. No path. */
  origin: string
  /**
   * The `manifest_session` cookie's VALUE, for a client that is not a browser. A browser
   * sends its own cookie and its own Origin, and may set neither.
   */
  session?: string
  /**
   * A delegated token's plaintext — `mft_<id>_<secret>` — for an agent (D24, P5b Task 5).
   * Mutually exclusive with `session`.
   */
  token?: string
  fetch?: typeof globalThis.fetch
}

const inBrowser = typeof (globalThis as { document?: unknown }).document !== 'undefined'

/**
 * `openapi-fetch` over the generated `paths` (Rich, 2026-09-16), plus the two headers a
 * non-browser client owes the API: the session, and §20's Origin — Node sends none unless
 * told (P5a Task 1, M5), and a session-bearing mutation without it is refused.
 *
 * Idempotency-Key is NOT added here. The document makes it a required header parameter of
 * every mutation, so the generated types make each call site supply one — and a key made
 * per call would defeat D23.6, whose whole point is that a RETRY reuses it.
 */
export function createManifestClient(options: ManifestClientOptions): ManifestClient {
  // EXACTLY ONE CREDENTIAL, enforced here as well as by the server (D24): the API answers
  // a request carrying both `400 CREDENTIAL_AMBIGUOUS`, which a caller cannot act on from
  // the far end of a network — the mistake is in the construction, and so is this.
  if (options.session !== undefined && options.token !== undefined) {
    throw new Error(
      'a Manifest client carries either a session or a delegated token, never both',
    )
  }
  const origin = new URL(options.origin).origin
  return createClient<paths>({
    baseUrl: origin,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(inBrowser
      ? {}
      : {
          headers: {
            // A TOKEN CLIENT SENDS NO ORIGIN. §20's CSRF control protects a browser
            // credential, the API exempts a bearer request from it (P5b Task 5), and
            // sending the console's origin from an agent would be stating something
            // untrue about where the request came from.
            ...(options.token === undefined ? { origin } : {}),
            ...(options.session === undefined
              ? {}
              : { cookie: `${SESSION_COOKIE}=${options.session}` }),
            ...(options.token === undefined
              ? {}
              : { authorization: `Bearer ${options.token}` }),
          },
        }),
  })
}

/** One per user action; reuse it when retrying that action (D23.6). */
export function idempotencyKey(): string {
  return globalThis.crypto.randomUUID()
}

/** The data of a successful call, or a `ManifestApiError` carrying the envelope. */
export function unwrap<T>(
  result: { data?: T; error?: unknown; response: Response },
  operation: string,
): T {
  if (result.error !== undefined || !result.response.ok) {
    const envelope =
      typeof result.error === 'object' && result.error !== null && 'error' in result.error
        ? (result.error as ErrorEnvelope)
        : undefined
    throw new ManifestApiError(result.response.status, envelope, operation)
  }
  return result.data as T
}
