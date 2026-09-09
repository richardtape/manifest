import sodium from 'libsodium-wrappers'

/**
 * §12: "Envelope-encrypted in Postgres (libsodium sealed box)."
 *
 * Two layers, and the reason is §20's: the PAYLOAD is encrypted with a fresh
 * per-secret data key, and only the DATA KEY is wrapped with the master key.
 * Rotation therefore re-wraps 32 bytes per secret and never touches the
 * ciphertext — "cheap enough to actually happen", which a scheme that
 * re-encrypts every plaintext is not.
 *
 * The wrap is a SEALED BOX, so wrapping needs only the master PUBLIC key. That
 * is not decoration: it means a future component that only writes secrets can
 * hold half the master key, and it costs nothing today.
 */
export interface SecretEnvelope {
  v: 1
  /** The data key, sealed to the master public key. base64. */
  wrappedKey: string
  /** secretbox nonce. base64. */
  nonce: string
  /** The payload under the data key. base64. */
  ciphertext: string
}

export interface MasterKeypair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

let ready: Promise<void> | undefined
/** libsodium is WASM and must be awaited once per process before any call. */
export async function sodiumReady(): Promise<void> {
  ready ??= sodium.ready
  return ready
}

export async function generateMasterKeypair(): Promise<MasterKeypair> {
  await sodiumReady()
  const kp = sodium.crypto_box_keypair()
  return { publicKey: kp.publicKey, privateKey: kp.privateKey }
}

export function sealSecret(
  plaintext: string,
  masterPublicKey: Uint8Array,
): SecretEnvelope {
  const dataKey = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES)
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    dataKey,
  )
  return {
    v: 1,
    wrappedKey: sodium.to_base64(
      sodium.crypto_box_seal(dataKey, masterPublicKey),
      sodium.base64_variants.ORIGINAL,
    ),
    nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
  }
}

export class SecretError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SecretError'
  }
}

function unwrap(envelope: SecretEnvelope, keys: MasterKeypair): Uint8Array {
  const b64 = (s: string) => sodium.from_base64(s, sodium.base64_variants.ORIGINAL)
  let dataKey: Uint8Array
  try {
    dataKey = sodium.crypto_box_seal_open(
      b64(envelope.wrappedKey),
      keys.publicKey,
      keys.privateKey,
    )
  } catch {
    // Distinguished from a decryption failure below, because the two mean
    // different things to an operator: this one is "wrong master key", which is
    // a configuration problem, and that one is "the row was altered".
    throw new SecretError(
      'SECRET_UNWRAP_FAILED',
      'could not unwrap the data key — this envelope was sealed for a different master key',
    )
  }
  return dataKey
}

export function openSecret(envelope: SecretEnvelope, keys: MasterKeypair): string {
  if (envelope.v !== 1) {
    throw new SecretError(
      'SECRET_VERSION_UNKNOWN',
      `unknown envelope version ${envelope.v}`,
    )
  }
  const b64 = (s: string) => sodium.from_base64(s, sodium.base64_variants.ORIGINAL)
  const dataKey = unwrap(envelope, keys)
  try {
    return sodium.to_string(
      sodium.crypto_secretbox_open_easy(
        b64(envelope.ciphertext),
        b64(envelope.nonce),
        dataKey,
      ),
    )
  } catch {
    throw new SecretError(
      'SECRET_DECRYPT_FAILED',
      'could not decrypt the secret — the stored ciphertext or nonce has been altered',
    )
  }
}

/** §20's rotation: re-wrap the data key, leave the ciphertext untouched. */
export function rewrapSecret(
  envelope: SecretEnvelope,
  from: MasterKeypair,
  toPublicKey: Uint8Array,
): SecretEnvelope {
  const dataKey = unwrap(envelope, from)
  return {
    ...envelope,
    wrappedKey: sodium.to_base64(
      sodium.crypto_box_seal(dataKey, toPublicKey),
      sodium.base64_variants.ORIGINAL,
    ),
  }
}
