import { createPrivateKey, createSign, type KeyObject } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { assertOwnerOnly } from '../../secrets/index.js'
import { SourceError } from '../git-driver.js'

/**
 * The GitHub App's PRIVATE key, in the master key's custody class (§20, the D5 plan's
 * Decision 5): read, then held to `assertOwnerOnly`, then parsed. It mints a JWT that can
 * mint a token for EVERY installation of its App, so it lives in `infra/secrets/` and in
 * this process's memory, and nowhere else. §20 puts it in Vault/KMS on UBC infrastructure
 * — that is Phase 5's, and this loader is the one place it changes.
 *
 * **No caller in production until Task 7** (the GitHub driver), by Rich's split of the
 * sittings; its tests are its only callers until then.
 */
export async function loadAppKey(path: string): Promise<KeyObject> {
  let pem: string
  try {
    pem = await readFile(path, 'utf8')
  } catch {
    throw new SourceError(
      'SOURCE_GITHUB_KEY_UNREADABLE',
      `cannot read the GitHub App key at '${path}'. For the fake, \`make up\` mints it; ` +
        `for a real App, see the D5 plan's "What Rich does".`,
    )
  }
  await assertOwnerOnly(path, 'SECRET_GITHUB_APP_KEY_PERMISSIONS')
  let key: KeyObject
  try {
    key = createPrivateKey(pem)
  } catch {
    // node:crypto's own message is dropped: it says nothing the operator needs, and this
    // message goes on the wire if a caller ever lets it.
    throw new SourceError(
      'SOURCE_GITHUB_KEY_UNREADABLE',
      `'${path}' is not a PEM private key; a GitHub App key is the .pem GitHub generates`,
    )
  }
  if (key.asymmetricKeyType !== 'rsa') {
    throw new SourceError(
      'SOURCE_GITHUB_KEY_UNREADABLE',
      `'${path}' is a ${key.asymmetricKeyType} key; a GitHub App key is RSA`,
    )
  }
  return key
}

const b64url = (v: unknown) =>
  Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

/**
 * GitHub's App JWT: RS256, `iss` the App ID, `iat` 60 s in the past (GitHub's own advice for
 * clock drift), `exp` nine minutes out — GitHub refuses one more than ten. Minted per call and
 * never stored: it authenticates as the App, which can mint a token for every installation.
 */
export function appJwt({
  appId,
  key,
  now = new Date(),
}: {
  appId: string
  key: KeyObject
  now?: Date
}): string {
  const t = Math.floor(now.getTime() / 1000)
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: appId, iat: t - 60, exp: t + 540 })}`
  return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url')}`
}
