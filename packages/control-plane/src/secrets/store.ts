import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { secrets } from '../db/index.js'
import {
  openSecret,
  sealSecret,
  SecretError,
  sodiumReady,
  type MasterKeypair,
  type SecretEnvelope,
} from './envelope.js'

export type EnvironmentKind = 'sandbox' | 'staging' | 'production'

export interface SecretScope {
  projectId: string
  environmentKind: EnvironmentKind
  name: string
}

export interface Secret {
  id: string
  projectId: string
  environmentKind: EnvironmentKind
  name: string
  createdAt: Date
  rotatedAt: Date | null
}

/** The row without its ciphertext. Nothing that holds a Secret needs the envelope. */
function withoutCiphertext(row: {
  id: string
  projectId: string
  environmentKind: EnvironmentKind
  name: string
  createdAt: Date
  rotatedAt: Date | null
}): Secret {
  return {
    id: row.id,
    projectId: row.projectId,
    environmentKind: row.environmentKind,
    name: row.name,
    createdAt: row.createdAt,
    rotatedAt: row.rotatedAt,
  }
}

const scopeWhere = (scope: SecretScope) =>
  and(
    eq(secrets.projectId, scope.projectId),
    eq(secrets.environmentKind, scope.environmentKind),
    eq(secrets.name, scope.name),
  )

/**
 * Store a secret, idempotently on (project, environment kind, name).
 *
 * `rotatedAt` is set only when the VALUE changed, and that cannot be decided by
 * comparing ciphertext: `sealSecret` draws a fresh data key every call, so the
 * same plaintext seals differently every time. So the stored envelope is opened
 * and the plaintexts compared. A store that compared ciphertext would report a
 * rotation on every deploy, which makes the field useless for the one question
 * it exists to answer — when did this credential last actually change.
 */
export async function putSecret(
  db: Db,
  input: SecretScope & { value: string },
  keys: MasterKeypair,
): Promise<Secret> {
  await sodiumReady()
  const { value, ...scope } = input
  const [existing] = await db.select().from(secrets).where(scopeWhere(scope))

  if (existing !== undefined) {
    const unchanged = openSecret(existing.ciphertext as SecretEnvelope, keys) === value
    if (unchanged) return withoutCiphertext(existing as Secret & { ciphertext: unknown })
    const [updated] = await db
      .update(secrets)
      .set({ ciphertext: sealSecret(value, keys.publicKey), rotatedAt: new Date() })
      .where(scopeWhere(scope))
      .returning()
    return withoutCiphertext(updated as Secret & { ciphertext: unknown })
  }

  const [created] = await db
    .insert(secrets)
    .values({ ...scope, ciphertext: sealSecret(value, keys.publicKey) })
    .returning()
  return withoutCiphertext(created as Secret & { ciphertext: unknown })
}

export async function getSecret(
  db: Db,
  scope: SecretScope,
  keys: MasterKeypair,
): Promise<string | undefined> {
  await sodiumReady()
  const [row] = await db.select().from(secrets).where(scopeWhere(scope))
  if (row === undefined) return undefined
  return openSecret(row.ciphertext as SecretEnvelope, keys)
}

/**
 * Removes one secret. `false` when there was none (P4c Task 6).
 *
 * A retire of an instance that never minted a key is not an error — an app with no
 * `ai.models` has none, and every retire calls this — so an absent row answers rather
 * than throwing. Scoped to (project, kind, name) like every other read here: a delete
 * by name alone would take the sibling instance's key, and that instance is the one
 * still serving.
 */
export async function deleteSecret(db: Db, scope: SecretScope): Promise<boolean> {
  const deleted = await db.delete(secrets).where(scopeWhere(scope)).returning({
    id: secrets.id,
  })
  return deleted.length > 0
}

/**
 * Every secret in one scope, as plaintext — the input Task 8's redactor needs.
 *
 * Scoped to the environment KIND rather than the project, because a redactor
 * built from every environment's secrets would be both wrong and dangerous: it
 * would redact staging's password out of a sandbox event (misleading) while
 * telling nobody that the sandbox's own secret set was what mattered.
 */
export async function secretValuesFor(
  db: Db,
  scope: { projectId: string; environmentKind: EnvironmentKind },
  keys: MasterKeypair,
): Promise<Map<string, string>> {
  await sodiumReady()
  const rows = await db
    .select()
    .from(secrets)
    .where(
      and(
        eq(secrets.projectId, scope.projectId),
        eq(secrets.environmentKind, scope.environmentKind),
      ),
    )
  return new Map(
    rows.map((row) => [row.name, openSecret(row.ciphertext as SecretEnvelope, keys)]),
  )
}

/** §8's `SESSION_SECRET`, under one name so nothing has to agree about it. */
const SESSION_SECRET_NAME = 'app:sessionSecret'

/**
 * §8: `SESSION_SECRET` — "generated per app+environment".
 *
 * Get-or-create, because the value must be STABLE: a secret regenerated on each
 * deploy invalidates every signed cookie the app issued, so every user of a
 * redeployed app is silently logged out. That is the same failure mode
 * `config.ts` describes for a regenerated `MANIFEST_MASTER_SECRET`, and the same
 * reason `ensureServiceCredentials` adopts rather than replaces.
 *
 * 32 bytes of `randomBytes`, hex — not derived from anything. There is no
 * existing value to stay compatible with (nothing injected this before), so the
 * migration `services/credentials.ts` needs does not apply here.
 */
export async function ensureSessionSecret(
  db: Db,
  scope: { projectId: string; environmentKind: EnvironmentKind },
  keys: MasterKeypair,
): Promise<string> {
  const name = SESSION_SECRET_NAME
  const existing = await getSecret(db, { ...scope, name }, keys)
  if (existing !== undefined) return existing
  const value = randomBytes(32).toString('hex')
  await putSecret(db, { ...scope, name, value }, keys)
  return value
}

/**
 * `ensureSessionSecret` with the master keypair already bound.
 *
 * `releases/` holds a resolver rather than key material, exactly as it does for
 * service credentials and for the SP registrar — three bound objects, none of
 * which lets the module that deploys read the secret store directly.
 */
export interface AppSecretResolver {
  sessionSecret(
    db: Db,
    scope: { projectId: string; environmentKind: EnvironmentKind },
  ): Promise<string>
  /**
   * Every secret stored for one app+environment, as plaintext: the exact-match half of
   * §14's redactor for what `releases/` records about the app — an Incident (P4b Task
   * 13). VALUES, not `secretValuesFor`'s Map: a Map is iterable too, as `[name, value]`
   * pairs, and a redactor built over those matches nothing (P4b sitting 1, divergence 5).
   */
  secretValues(
    db: Db,
    scope: { projectId: string; environmentKind: EnvironmentKind },
  ): Promise<string[]>
}

export function createAppSecrets(keys: MasterKeypair): AppSecretResolver {
  return {
    sessionSecret: (db, scope) => ensureSessionSecret(db, scope, keys),
    secretValues: async (db, scope) => [
      ...(await secretValuesFor(db, scope, keys)).values(),
    ],
  }
}

interface MasterKeyFile {
  v: 1
  publicKey: string
  privateKey: string
}

/**
 * Read the master keypair from disk. `infra/lib/ensure-master-key.sh` mints it.
 *
 * Every failure here names the FILE, because the alternative — a stack trace
 * about base64 or JSON — sends the reader to the database, which is where this
 * project has repeatedly lost mornings. §20 keeps this file in separate custody
 * from the rows it opens, so "the key is wrong" and "the row is wrong" are
 * genuinely different problems and must read differently.
 */
export async function loadMasterKeypair(path: string): Promise<MasterKeypair> {
  await sodiumReady()
  let parsed: MasterKeyFile
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as MasterKeyFile
  } catch {
    throw new SecretError(
      'SECRET_MASTER_KEY_UNREADABLE',
      `cannot read the secrets master key at '${path}'. Run \`make up\`, which calls ` +
        'infra/lib/ensure-master-key.sh.',
    )
  }
  const decode = (field: 'publicKey' | 'privateKey'): Uint8Array => {
    const value = parsed[field]
    if (typeof value !== 'string') {
      throw new SecretError(
        'SECRET_MASTER_KEY_INVALID',
        `the secrets master key at '${path}' has no '${field}'`,
      )
    }
    try {
      return Uint8Array.from(Buffer.from(value, 'base64'))
    } catch {
      throw new SecretError(
        'SECRET_MASTER_KEY_INVALID',
        `the secrets master key at '${path}' has an unreadable '${field}'`,
      )
    }
  }
  const publicKey = decode('publicKey')
  const privateKey = decode('privateKey')
  // Length is checked here rather than at first use: a truncated key fails inside
  // libsodium with a message about box sizes, at whatever moment the first secret
  // is read, which is never where the mistake was made.
  if (publicKey.length !== 32 || privateKey.length !== 32) {
    throw new SecretError(
      'SECRET_MASTER_KEY_INVALID',
      `the secrets master key at '${path}' is not a curve25519 keypair ` +
        `(public ${publicKey.length} bytes, private ${privateKey.length}; both must be 32)`,
    )
  }
  return { publicKey, privateKey }
}
