import { describe, expect, it } from 'vitest'
import { verifySignature } from './webhook-signature.js'

describe('the webhook signature (§20: verified by HMAC before any processing)', () => {
  // GitHub's OWN test vector (docs.github.com, validating webhook deliveries; the D5 plan's
  // Read this first 6).
  const VECTOR = {
    secret: "It's a Secret to Everybody",
    body: 'Hello, World!',
    header: 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
  }
  const secret = Buffer.from(VECTOR.secret)
  const body = Buffer.from(VECTOR.body)

  it('accepts GitHub’s published vector — the positive control', () => {
    expect(verifySignature(secret, body, VECTOR.header)).toBe('valid')
  })
  it('refuses an ABSENT header as missing — and does not throw (timingSafeEqual would)', () => {
    expect(verifySignature(secret, body, undefined)).toBe('missing')
  })
  it.each([
    ['empty', ''],
    ['no prefix', '757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17'],
    ['sha1', 'sha1=' + 'a'.repeat(40)],
    ['short', 'sha256=abc'],
    ['uppercase', VECTOR.header.toUpperCase()],
    ['sent twice', [VECTOR.header, VECTOR.header]],
    ['joined by a proxy', `${VECTOR.header}, ${VECTOR.header}`],
  ])('refuses %s as malformed', (_label, header) => {
    expect(verifySignature(secret, body, header)).toBe('malformed')
  })
  it('refuses a well-formed signature over different bytes as invalid', () => {
    expect(verifySignature(secret, Buffer.from('Hello, World?'), VECTOR.header)).toBe(
      'invalid',
    )
  })
  it('refuses the right body under another secret as invalid', () => {
    expect(verifySignature(Buffer.from('another'), body, VECTOR.header)).toBe('invalid')
  })
})
