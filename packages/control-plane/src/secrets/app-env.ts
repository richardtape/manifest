import { and, eq, like } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { secrets } from '../db/index.js'
import type { MasterKeypair } from './envelope.js'
import {
  deleteSecret,
  putSecret,
  secretValuesFor,
  type EnvironmentKind,
} from './store.js'

/**
 * AN APP'S OWN DECLARED SECRETS (the authoring API plan's Task 8, Decision 13) — the values of
 * the `env` entries its `manifest.yaml` marks `secret: true`: *"value held by Manifest, never in
 * git"* (§7).
 *
 * **THE THIRD NAMESPACE IN `secrets`**, beside `app:` (`SESSION_SECRET`) and `service:<name>:`
 * (a backing service's password), scoped by the store's own (project, environment KIND). Stored
 * there rather than in a table of their own because §14's redactor already reads every secret
 * in that scope (`AppSecretResolver.secretValues`), so a value set here is redacted from an
 * Incident with no further change — and a second table would be a second thing to keep in step.
 *
 * **WRITE-ONLY.** Nothing here answers a value to a caller outside `releases/`: the route sets,
 * clears and lists NAMES, and only `deployRelease` reads values, through the resolver, to hand
 * them to `renderInjection`. `secret:read` stays out of `Capability` (D24; P5b Decision 14).
 */
const PREFIX = 'env:'

export interface AppEnvScope {
  projectId: string
  environmentKind: EnvironmentKind
}

/** What the platform will say about one name — never its value. */
export interface AppSecretState {
  name: string
  /** The environment's newest valid manifest declares it `secret: true`. */
  declared: boolean
  /** A value is stored. */
  set: boolean
  /** When the value last CHANGED (`putSecret`'s `rotatedAt`), or was first set; null if unset. */
  updatedAt: Date | null
}

/**
 * Stores one value, and answers when it last changed. `putSecret` moves `rotatedAt` only when
 * the plaintext differs — an unchanged value set again keeps its time, which is what
 * *updated at* should mean.
 */
export async function setAppSecret(
  db: Db,
  keys: MasterKeypair,
  scope: AppEnvScope,
  name: string,
  value: string,
): Promise<Date> {
  const row = await putSecret(db, { ...scope, name: `${PREFIX}${name}`, value }, keys)
  return row.rotatedAt ?? row.createdAt
}

/** Removes one value. `false` when there was none — clearing is idempotent. */
export async function clearAppSecret(
  db: Db,
  scope: AppEnvScope,
  name: string,
): Promise<boolean> {
  return deleteSecret(db, { ...scope, name: `${PREFIX}${name}` })
}

/**
 * Every name DECLARED or SET, sorted — never a value, so no key is needed and none is opened.
 * A declared name with no value is the state that stops the next deploy
 * (`RELEASE_SECRET_NOT_SET`); a set name nobody declares is stored and never rendered.
 */
export async function appSecretStatuses(
  db: Db,
  scope: AppEnvScope,
  declared: readonly string[],
): Promise<AppSecretState[]> {
  const rows = await db
    .select({
      name: secrets.name,
      createdAt: secrets.createdAt,
      rotatedAt: secrets.rotatedAt,
    })
    .from(secrets)
    .where(
      and(
        eq(secrets.projectId, scope.projectId),
        eq(secrets.environmentKind, scope.environmentKind),
        like(secrets.name, `${PREFIX}%`),
      ),
    )
  const stored = new Map(
    rows.map((row) => [row.name.slice(PREFIX.length), row.rotatedAt ?? row.createdAt]),
  )
  const wanted = new Set(declared)
  return [...new Set([...declared, ...stored.keys()])].sort().map((name) => ({
    name,
    declared: wanted.has(name),
    set: stored.has(name),
    updatedAt: stored.get(name) ?? null,
  }))
}

/** Every value stored for one app+environment, by NAME (the prefix removed) — for the deploy. */
export async function appEnvSecretValues(
  db: Db,
  keys: MasterKeypair,
  scope: AppEnvScope,
): Promise<Map<string, string>> {
  const all = await secretValuesFor(db, scope, keys)
  return new Map(
    [...all]
      .filter(([name]) => name.startsWith(PREFIX))
      .map(([name, value]) => [name.slice(PREFIX.length), value] as const),
  )
}
