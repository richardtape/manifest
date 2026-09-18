import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * `mft` — Manifest delegated token. A fixed, greppable prefix so a leaked credential is
 * recognisable in a log, a paste or a scanner, and so `parseToken` can refuse a session
 * cookie loudly rather than treating it as a malformed token (P5b Decision 1).
 */
export const TOKEN_PREFIX = 'mft'

/** 32 bytes of CSPRNG. See Decision 1 for why this is hashed and not KDF'd. */
const SECRET_BYTES = 32

export interface MintedToken {
  /** The ONLY moment this exists. Returned to the minter once and never stored. */
  plaintext: string
  secret: string
  tokenHash: string
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/**
 * `mft_<id without dashes>_<secret>` for the token row `id` — which the CALLER must go
 * on to store this token as, because `parseToken` reads the id back out of the plaintext
 * and Task 5 authenticates by looking that id up. `createToken` takes an `id` for
 * exactly this reason.
 */
export function mintToken(id: string): MintedToken {
  const secret = randomBytes(SECRET_BYTES).toString('base64url')
  return {
    plaintext: `${TOKEN_PREFIX}_${id.replaceAll('-', '')}_${secret}`,
    secret,
    tokenHash: hashSecret(secret),
  }
}

/**
 * ANCHORED, NOT SPLIT ON `_`. base64url's alphabet is `[A-Za-z0-9-_]`, so about half of
 * all 32-byte secrets contain an underscore: measured 2026-09-17, 974 of 2000. A parse
 * that split on `_` and demanded three parts refused 47.5% of the tokens `mintToken`
 * produces — a credential that fails to authenticate half the time, behind a test that
 * goes red half the time (P5b sitting 2, finding 1). The id is fixed-length hex, so
 * everything after the second separator is the secret however many separators it holds.
 *
 * `TOKEN_PREFIX` is a literal in this file, never anything a request carries, so
 * building the pattern from it is not an injection route — and it stops the prefix and
 * its parser drifting apart.
 */
const TOKEN_PATTERN = new RegExp(`^${TOKEN_PREFIX}_([0-9a-f]{32})_(.+)$`)

/**
 * Undefined for anything that is not one of ours — never a throw. This runs on every
 * request carrying an Authorization header, including requests from things that are not
 * clients of ours at all, so a malformed value is an ordinary answer, not an exception.
 */
export function parseToken(
  plaintext: string,
): { id: string; secret: string } | undefined {
  const match = TOKEN_PATTERN.exec(plaintext)
  if (match === null) return undefined
  const rawId = match[1]!
  const secret = match[2]!
  const id = [
    rawId.slice(0, 8),
    rawId.slice(8, 12),
    rawId.slice(12, 16),
    rawId.slice(16, 20),
    rawId.slice(20),
  ].join('-')
  return { id, secret }
}

/**
 * Constant-time by length AND content. `timingSafeEqual` throws on a length mismatch,
 * which would itself be a timing signal and a crash on malformed input, so the lengths
 * are compared first and a mismatch answers false.
 */
export function secretMatches(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
