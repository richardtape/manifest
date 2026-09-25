import { createHmac, timingSafeEqual } from 'node:crypto'

export type SignatureVerdict = 'valid' | 'missing' | 'malformed' | 'invalid'

/**
 * GitHub's `X-Hub-Signature-256`: `sha256=` and 64 lowercase hex characters, the HMAC-SHA256
 * of the RAW body under the App's webhook secret (docs.github.com; its own test vector is in
 * the test).
 *
 * FOUR ANSWERS, NOT TWO (the D5 plan's Decision 9). An ABSENT header is its own answer — the
 * 2026-09-24 SLO defect was a verifier that checked a signature when one was there and
 * accepted a message without one. The legacy SHA-1 `X-Hub-Signature` is never read: a
 * delivery carrying only that is `missing`. Two headers is `malformed` — as an array, or as
 * Node joins a repeated header, `a, b` — because an ambiguity resolved silently is the shape
 * of a confused deputy (`api/server.ts`, CREDENTIAL_AMBIGUOUS).
 *
 * Constant time, and only between EQUAL LENGTHS: `timingSafeEqual` throws on a length
 * mismatch (the plan's Read this first 6), and the regex fixes the length before it is called.
 */
export function verifySignature(
  secret: Buffer,
  body: Buffer,
  header: string | string[] | undefined,
): SignatureVerdict {
  if (header === undefined) return 'missing'
  if (Array.isArray(header)) return 'malformed'
  const m = /^sha256=([0-9a-f]{64})$/.exec(header)
  if (m === null) return 'malformed'
  const given = Buffer.from(m[1]!, 'hex')
  const want = createHmac('sha256', secret).update(body).digest()
  return given.length === want.length && timingSafeEqual(given, want)
    ? 'valid'
    : 'invalid'
}
