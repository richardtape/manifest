import { createHmac } from 'node:crypto'
import type { ServiceBinding } from '../runtime/index.js'

/**
 * TEMPORARY, and one call site wide on purpose. P4 replaces this with `secrets/`
 * (libsodium sealed boxes in Postgres, §12). Deriving instead of storing is what
 * makes `ensureService` idempotent all the way down: the second call produces the
 * same credentials, so the same handle really is the same handle.
 *
 * The binding name carries the environment (§11's serviceName), so a sandbox
 * cannot derive staging's password — §11's "a sandbox never receives staging or
 * production secrets", enforced by the key rather than by remembering.
 */
export function deriveCredentials(
  masterSecret: string,
  binding: Pick<ServiceBinding, 'name' | 'type' | 'projectSlug'>,
): { username: string; password: string; database: string } {
  const mac = (purpose: string) =>
    createHmac('sha256', masterSecret).update(`${purpose}:${binding.name}`).digest('hex')
  return {
    username: `app_${mac('user').slice(0, 12)}`,
    // Hex only: a password with `:`, `/` or `@` in it silently corrupts the URI
    // P4 builds from it, and the failure looks like an authentication problem.
    password: mac('pass').slice(0, 32),
    database: `${binding.projectSlug.replace(/-/g, '_')}`,
  }
}
