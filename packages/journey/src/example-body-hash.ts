import type { Schemas } from '@manifest/contract'

/**
 * The platform's canonical form of a request body: object keys sorted at every depth, a
 * property whose value is `undefined` dropped, arrays in their order, every other value as
 * `JSON.stringify` writes it — and no body at all as `null`.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
  return `{${entries.join(',')}}`
}

/**
 * `PendingAction.bodySha256`, computed from a request you sent: the SHA-256 of the body's
 * canonical form, as lower-case hex. WebCrypto, so it runs in a browser as well as a server.
 */
export async function bodySha256(body: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(body ?? null))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Which WAITING question is about a request your agent sent — its method, its path without the
 * query string, and its body's hash — so you can show the person exactly what was asked. An
 * earlier question about the same request may be answered already: skip it.
 */
export function questionAbout(
  questions: Schemas['PendingAction'][],
  method: string,
  path: string,
  hash: string,
): Schemas['PendingAction'] | undefined {
  return questions.find(
    (q) =>
      q.state === 'pending' &&
      q.method === method &&
      q.path === path &&
      q.bodySha256 === hash,
  )
}
