import { createHmac } from 'node:crypto'
import type { Db } from '../db/index.js'
import {
  getSecret,
  putSecret,
  type EnvironmentKind,
  type MasterKeypair,
} from '../secrets/index.js'
import type { ServiceBinding } from '../runtime/index.js'

/** What a backing service is reached with. §12 stores it; P3 derived it. */
export interface ServiceCredentials {
  username: string
  password: string
  database: string
}

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
): ServiceCredentials {
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

/**
 * §12 stores service credentials; P3 DERIVED them by HMAC from
 * MANIFEST_MASTER_SECRET. The change-over cannot be a cut-over.
 *
 * A Mongo container's root password is fixed when the container is created and
 * nothing can change it afterwards, so storing a freshly generated password for
 * a service that already exists produces an authentication failure that reads
 * as a database fault — the exact trap config.ts warns about for the master
 * secret itself. So: stored if present, otherwise ADOPT the derived value and
 * store that. Within a deploy of every existing service the derivation is dead,
 * and `deriveCredentials` can then be removed — but not in this plan, and not
 * without checking.
 *
 * Note what this deliberately does NOT do: generate a random password for a
 * service that is genuinely new. Nothing at this layer can tell "new" from
 * "existing" — the container is the driver's knowledge, and threading it back
 * here would put a second producer on the value, which is the shape that cost
 * P3 seven defects in one session. Adopting the derived value for a new service
 * is exactly what P3 already did, so nothing is weaker than today; randomness
 * arrives for free once `deriveCredentials` is deleted.
 */
export async function ensureServiceCredentials(
  db: Db,
  keys: MasterKeypair,
  projectId: string,
  environmentKind: EnvironmentKind,
  binding: Pick<ServiceBinding, 'name' | 'type' | 'projectSlug'>,
  masterSecret: string,
): Promise<ServiceCredentials> {
  const name = `service:${binding.name}:password`
  const stored = await getSecret(db, { projectId, environmentKind, name }, keys)
  const derived = deriveCredentials(masterSecret, binding)
  if (stored !== undefined) return { ...derived, password: stored }

  await putSecret(db, { projectId, environmentKind, name, value: derived.password }, keys)
  return derived
}

/**
 * `ensureServiceCredentials` with its keys and master secret already bound.
 *
 * `releases/` takes THIS rather than a `MasterKeypair`, so the module that
 * deploys never holds key material and `ServerDeps` grows by one field instead
 * of three. Task 7's `SsoRegistrar` is bound the same way for the same reason.
 */
export interface ServiceCredentialResolver {
  forService(
    db: Db,
    input: {
      projectId: string
      environmentKind: EnvironmentKind
      binding: Pick<ServiceBinding, 'name' | 'type' | 'projectSlug'>
    },
  ): Promise<ServiceCredentials>
}

export function createServiceCredentials(
  keys: MasterKeypair,
  masterSecret: string,
): ServiceCredentialResolver {
  return {
    forService: (db, { projectId, environmentKind, binding }) =>
      ensureServiceCredentials(
        db,
        keys,
        projectId,
        environmentKind,
        binding,
        masterSecret,
      ),
  }
}
