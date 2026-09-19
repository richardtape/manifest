import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  hashSecret,
  mintToken,
  parseToken,
  secretMatches,
  TOKEN_PREFIX,
} from './token.js'

const ID = '7c841b6e-4e60-4b96-9002-964cd3baa83c'
const RAW = '7c841b6e4e604b969002964cd3baa83c'

describe('a delegated token’s shape (D24, Decision 1)', () => {
  it('is prefix, id and secret, and the id round-trips', () => {
    const minted = mintToken(ID)
    expect(minted.plaintext.startsWith(`${TOKEN_PREFIX}_`)).toBe(true)
    const parsed = parseToken(minted.plaintext)
    expect(parsed?.id).toBe(ID)
    expect(parsed?.secret).toBe(minted.secret)
  })

  /**
   * FIFTY, not one, and this is the reason: base64url's alphabet is `[A-Za-z0-9-_]`, so
   * about half of all 32-byte secrets contain an underscore (974 of 2000, measured
   * 2026-09-17). One mint-and-parse would have passed half the time against a parser
   * that split on `_` — a flaky test that reads as a harness problem rather than the
   * credential defect it is (P5b sitting 2, finding 1).
   */
  it('round-trips EVERY secret base64url can produce, underscores and all', () => {
    const minted = Array.from({ length: 50 }, () => mintToken(ID))
    for (const one of minted) {
      const parsed = parseToken(one.plaintext)
      expect(parsed?.id, one.plaintext).toBe(ID)
      expect(parsed?.secret, one.plaintext).toBe(one.secret)
      expect(secretMatches(parsed!.secret, one.tokenHash)).toBe(true)
    }
    // The property above is only worth asserting if the risky case actually occurred.
    expect(minted.some((one) => one.secret.includes('_'))).toBe(true)
  })

  it('round-trips a secret holding the separator, stated rather than left to chance', () => {
    const parsed = parseToken(`${TOKEN_PREFIX}_${RAW}_ab_cd-ef_gh`)
    expect(parsed?.id).toBe(ID)
    expect(parsed?.secret).toBe('ab_cd-ef_gh')
  })

  it('stores a hash, never the secret', () => {
    const minted = mintToken(ID)
    expect(minted.tokenHash).toBe(hashSecret(minted.secret))
    expect(minted.tokenHash).not.toContain(minted.secret)
    expect(minted.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('mints a different secret every time', () => {
    const secrets = new Set(Array.from({ length: 50 }, () => mintToken(ID).secret))
    expect(secrets.size).toBe(50)
  })

  it('refuses the right secret against another token’s hash, in both directions', () => {
    const a = mintToken(ID)
    const b = mintToken(ID)
    expect(secretMatches(a.secret, a.tokenHash)).toBe(true)
    expect(secretMatches(a.secret, b.tokenHash)).toBe(false)
    // A hash that is not hex at all, which is what a truncated column would hold.
    expect(secretMatches(a.secret, 'not-a-hash')).toBe(false)
  })

  // Every one of these is a string an agent, a shell or a log rotation could hand us.
  it.each([
    ['empty', ''],
    ['no prefix', 'abc_def'],
    ['wrong prefix', `ghp_${RAW}_x`],
    ['prefix only', TOKEN_PREFIX],
    ['no secret', `${TOKEN_PREFIX}_${RAW}`],
    ['an empty secret', `${TOKEN_PREFIX}_${RAW}_`],
    ['id not hex', `${TOKEN_PREFIX}_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_x`],
    ['id wrong length', `${TOKEN_PREFIX}_7c841b6e_x`],
    ['id too long', `${TOKEN_PREFIX}_${RAW}ff_x`],
    ['uppercase id', `${TOKEN_PREFIX}_${RAW.toUpperCase()}_x`],
    ['a session cookie', 'eyJ1c2VySWQiOiJ4In0.c2ln'],
    ['a newline before it', `\n${TOKEN_PREFIX}_${RAW}_x`],
  ])('refuses %s without throwing', (_name, input) => {
    expect(parseToken(input)).toBeUndefined()
  })
})

/**
 * COMMENTS OUT, STRING BODIES KEPT — the scanner `spec/injection-drift.test.ts` and
 * `packages/journey/src/boundary.test.ts` both carry, for the reason the latter records:
 * a comment satisfies an English-shaped pattern, and this file's comment above
 * `secretMatches` names `timingSafeEqual` in prose. Reading the comments would make the
 * assertion below true of a function that no longer calls it.
 */
function executableSource(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const two = text.slice(i, i + 2)
    if (two === '//') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (two === '/*') {
      i += 2
      while (i < text.length && text.slice(i, i + 2) !== '*/') i++
      i += 2
      continue
    }
    out += text[i]
    i++
  }
  return out
}

/**
 * WHY THIS IS A SOURCE-LEVEL TEST, which is not this codebase's habit.
 *
 * P5b sitting 9 measured it: replacing `secretMatches`'s body with `hashSecret(secret) ===
 * storedHash` leaves **all 1342 unit tests green and `make demo-token` green through all
 * nine steps**. Constant-time comparison has no observable behaviour — that is the whole
 * point of it — so the only deterministic assertion available is about the code, and the
 * alternative Task 13 offered was to record the property as asserted by nothing at all.
 *
 * It is the last line between a stolen token-id and an offline search for its secret: the
 * id is in the plaintext in front of `_`, so an attacker who can time this call learns the
 * stored hash a byte at a time. A timing test would be the behavioural version and is not
 * written, because a wall-clock threshold on a laptop under Docker is a flake generator.
 */
describe('the secret comparison is constant-time (§14, P5b sitting 9)', () => {
  it('compares with timingSafeEqual, and never with === on the hash', async () => {
    const source = executableSource(
      await readFile(new URL('./token.ts', import.meta.url), 'utf8'),
    )
    const start = source.indexOf('export function secretMatches')
    expect(start, 'secretMatches was not found — has it been renamed?').toBeGreaterThan(
      -1,
    )
    const body = source.slice(start, source.indexOf('\n}', start))

    expect(body, 'secretMatches no longer calls timingSafeEqual').toContain(
      'timingSafeEqual(',
    )
    // The positive control this test needs: a stripper that ate the file would leave an
    // empty body, and an empty body contains no `===` either. `hashSecret` is what the
    // function is for, so its presence says the body really was read.
    expect(body, 'the scanner read no body at all').toContain('hashSecret(')
    expect(body, 'the hash is compared with an ordinary string equality').not.toMatch(
      /[!=]==\s*storedHash|storedHash\s*[!=]==/,
    )
  })

  it('reads the code and not the sentences about it', () => {
    const source = executableSource(
      [
        '/** Constant-time: it uses timingSafeEqual rather than ===. */',
        'export function secretMatches(secret: string, storedHash: string): boolean {',
        '  return hashSecret(secret) === storedHash // not timingSafeEqual( at all',
        '}',
      ].join('\n'),
    )
    expect(source).not.toContain('timingSafeEqual(')
    expect(source).toContain('hashSecret(')
    expect(source).toMatch(/[!=]==\s*storedHash|storedHash\s*[!=]==/)
  })
})
