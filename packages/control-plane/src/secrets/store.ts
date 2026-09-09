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
