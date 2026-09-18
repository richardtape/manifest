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
