import { describe, expect, it } from 'vitest'
import {
  generateMasterKeypair,
  openSecret,
  rewrapSecret,
  sealSecret,
} from './envelope.js'

describe('envelope encryption (§12, §20)', () => {
  it('round-trips a secret', async () => {
    const keys = await generateMasterKeypair()
    const envelope = sealSecret('mongodb://app:hunter2@db:27017/x', keys.publicKey)
    expect(openSecret(envelope, keys)).toBe('mongodb://app:hunter2@db:27017/x')
  })

  it('never puts the plaintext in the envelope', async () => {
    const keys = await generateMasterKeypair()
    const envelope = sealSecret('STUDENT-PII-CANARY', keys.publicKey)
    // The whole envelope, not just the ciphertext field: a plaintext that leaks
    // into `nonce` or `wrappedKey` would be just as exposed and would still
    // round-trip.
    expect(JSON.stringify(envelope)).not.toContain('STUDENT-PII-CANARY')
  })

  it('uses a fresh data key per secret, so two seals of one value differ', async () => {
    const keys = await generateMasterKeypair()
    const a = sealSecret('same', keys.publicKey)
    const b = sealSecret('same', keys.publicKey)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.wrappedKey).not.toBe(b.wrappedKey)
  })

  it('uses a fresh data key per secret — one envelope’s key cannot open another', async () => {
    // The test above CANNOT FAIL on its own, and the negative control proved it:
    // hoist the data key out of `sealSecret` so every secret shares one, and both
    // its assertions stay green — `ciphertext` differs because the nonce is
    // random, and `wrappedKey` differs because a sealed box draws an ephemeral
    // keypair per call. Two seals of one value differ either way.
    //
    // This is the observable consequence of reuse: with a shared data key, A's
    // wrapped key opens B's ciphertext, and this hybrid envelope decrypts. With
    // per-secret keys it cannot.
    const keys = await generateMasterKeypair()
    const a = sealSecret('first', keys.publicKey)
    const b = sealSecret('second', keys.publicKey)
    expect(() => openSecret({ ...b, wrappedKey: a.wrappedKey }, keys)).toThrow(
      /could not decrypt/i,
    )
  })

  it('refuses to open an envelope wrapped for a different master key', async () => {
    const mine = await generateMasterKeypair()
    const theirs = await generateMasterKeypair()
    const envelope = sealSecret('secret', theirs.publicKey)
    expect(() => openSecret(envelope, mine)).toThrow(/could not unwrap/i)
  })

  it('refuses an envelope whose ciphertext has been tampered with', async () => {
    const keys = await generateMasterKeypair()
    const envelope = sealSecret('secret', keys.publicKey)
    const flipped = Buffer.from(envelope.ciphertext, 'base64')
    flipped.writeUInt8(flipped.readUInt8(0) ^ 0xff, 0)
    expect(() =>
      openSecret({ ...envelope, ciphertext: flipped.toString('base64') }, keys),
    ).toThrow(/could not decrypt/i)
  })

  // §20's rotation argument, asserted rather than assumed. If this test ever
  // needs `ciphertext` to change, envelope encryption has stopped being what
  // makes rotation cheap and the design has quietly reverted.
  it('re-wraps for a new master key WITHOUT touching the ciphertext', async () => {
    const oldKeys = await generateMasterKeypair()
    const newKeys = await generateMasterKeypair()
    const envelope = sealSecret('rotate me', oldKeys.publicKey)
    const rewrapped = rewrapSecret(envelope, oldKeys, newKeys.publicKey)

    expect(rewrapped.ciphertext).toBe(envelope.ciphertext)
    expect(rewrapped.nonce).toBe(envelope.nonce)
    expect(rewrapped.wrappedKey).not.toBe(envelope.wrappedKey)
    expect(openSecret(rewrapped, newKeys)).toBe('rotate me')
    expect(() => openSecret(rewrapped, oldKeys)).toThrow()
  })
})
