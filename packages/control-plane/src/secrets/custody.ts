import { stat } from 'node:fs/promises'
import { SecretError } from './envelope.js'

/**
 * §20: the GitHub App's private key is held "in the same custody class as the master key"
 * — so this is the ONE rule, and every loader calls it (the D5 plan's Decision 5):
 * `loadMasterKeypair` at every boot, and `loadAppKey` and `loadWebhookSecret` (Task 9) on
 * driver 2. A key its group or
 * others can read is a key any other account on the machine, and anything running as it,
 * can copy; a key another user owns is one somebody else can loosen.
 *
 * `SecretError` for each, carrying the code the caller names, so the boot line says WHICH
 * key — a refusal that names the wrong file sends the operator to the wrong file. Each is a
 * boot-time refusal and never reaches the wire: `SecretError` is not one of the classes
 * `toErrorResponse` answers as itself, so none of the codes is in `api/error-codes.ts`.
 *
 * **Any group or other bit refuses**, execute included: a key file has no reason to carry
 * one. The owner check is read from the code rather than tested, because a file another
 * user owns cannot be made without `sudo`.
 */
export async function assertOwnerOnly(
  path: string,
  code:
    | 'SECRET_MASTER_KEY_PERMISSIONS'
    | 'SECRET_GITHUB_APP_KEY_PERMISSIONS'
    | 'SECRET_GITHUB_WEBHOOK_SECRET_PERMISSIONS',
): Promise<void> {
  const s = await stat(path)
  const loose = s.mode & 0o077
  if (loose !== 0 || (process.getuid !== undefined && s.uid !== process.getuid())) {
    throw new SecretError(
      code,
      `'${path}' is mode ${(s.mode & 0o777).toString(8)}, owner ${s.uid}: a key must be ` +
        `readable by its owner alone (chmod 600 '${path}'), because anything that can ` +
        'read it can act as the platform (§20)',
    )
  }
}
