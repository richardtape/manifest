import type { Db } from '../db/index.js'
import {
  deleteSecret,
  getSecret,
  putSecret,
  type EnvironmentKind,
  type MasterKeypair,
} from '../secrets/index.js'
import type { LiteLlmClient } from './client.js'
import { AI_CODES, AiError } from './errors.js'

/**
 * §10, and NOT a parameter (P4b Decision 8). Every key Manifest mints is confined to
 * these three routes. S3's matched pair: two keys under the same LiteLLM user,
 * identical but for this list — the unconfined one minted a child key that answered
 * 200 after its parent was deleted and answered 401.
 *
 * Frozen as well as typed readonly, so widening it at run time throws instead of
 * quietly succeeding.
 */
export const AI_ALLOWED_ROUTES: readonly string[] = Object.freeze([
  '/v1/chat/completions',
  '/v1/embeddings',
  '/v1/models',
])

/**
 * Every budget window this module sets: a calendar month, never a count of days.
 * S3 measured that `budget_duration` aligns to a calendar boundary, so a day-count
 * window is not rolling — and a week behaved as one day.
 */
const MONTHLY = '1mo'

/**
 * Where an app's current key is stored. P4a's `app:` namespace — `SESSION_SECRET`
 * is `app:sessionSecret` — rather than the variable name §8 injects it as.
 */
export const LLM_API_KEY_SECRET = 'app:llmApiKey'

/**
 * Keyed on the project UUID, never the slug. A slug is a rename away from being a
 * different string, and the LiteLLM user carries the app's monthly spend — losing it
 * silently resets the budget to zero spent.
 */
export function aiUserId(projectId: string, kind: EnvironmentKind): string {
  return `mf-${projectId}-${kind}`
}

/**
 * The LiteLLM user an app's keys live under, carrying the app's monthly budget
 * (§10). Budgets go on the USER and not on the key: a key rotates every deploy, and
 * a monthly ceiling that resets on every deploy is not a monthly ceiling (S3
 * Evidence 3).
 */
export async function ensureAiUser(
  client: LiteLlmClient,
  input: { projectId: string; kind: EnvironmentKind; monthlyUsd: number },
): Promise<string> {
  const userId = aiUserId(input.projectId, input.kind)
  const budget = { max_budget: input.monthlyUsd, budget_duration: MONTHLY }
  try {
    // `auto_create_key: false`. LiteLLM 1.98.0 defaults it to TRUE, and the key it
    // mints carries no allowed_routes and every model — so the call that sets the
    // budget would hand every app an unconfined key beside the confined one this
    // module mints (sitting 2, finding 19).
    await client.post('/user/new', { user_id: userId, ...budget, auto_create_key: false })
  } catch (error) {
    // 409 is "already exists": the state every redeploy finds. Recognised by the
    // STATUS, because the client carries none of LiteLLM's text into an error (§14)
    // — a message match never matches, and every redeploy threw (sitting 3,
    // finding 28). Anything else is a real failure.
    if (!(error instanceof AiError && error.status === 409)) throw error
    // UPDATED rather than left alone: the budget may have changed in manifest.yaml
    // since, and a create-only path keeps last month's ceiling for ever.
    await client.post('/user/update', { user_id: userId, ...budget })
  }
  return userId
}

/**
 * §10's "rotated every deploy", with no moment at which a live call can fail (Rich,
 * 2026-09-14) — and, since P4c, no moment at which two instances cannot both answer.
 *
 * The one-call rotation this replaces minted, stored and revoked before the new
 * container existed, so the running app's calls failed from the revoke until the edge
 * route moved (P4b pre-flight 71). P4b split it into mint / commit / discard; P4c
 * deletes the commit, because a redeploy now runs the new instance BESIDE the one
 * serving and each holds its own key — `storeInstanceKey` at the mint,
 * `revokeInstanceKey` when that instance is retired, after its drain.
 *
 * There is deliberately no `revokeAppKey`. §10 also says "revoked on archive", and
 * Phase 1 has no archive operation, so it would be a function with no caller.
 */
export interface MintAppKeyInput {
  projectId: string
  projectSlug: string
  kind: EnvironmentKind
  models: readonly string[]
  monthlyUsd: number
}

/**
 * Ensures the budgeted user and mints ONE confined key. Stores nothing and revokes
 * nothing: every instance already running keeps the key it was given, and this one is
 * recorded by `storeInstanceKey` under the instance that is about to hold it.
 */
export async function mintAppKey(
  client: LiteLlmClient,
  input: MintAppKeyInput,
): Promise<string> {
  // To LiteLLM an EMPTY model list is not "no models" — it is EVERY model. Measured
  // 2026-09-14 on 1.98.0: a key minted with `models: []` listed all three catalogue
  // entries and embedded with a model it was never given, while the same key with
  // ['default-chat'] listed one and was refused the other with 403. A key minted for
  // an app that declared nothing would reach models above its classification, which
  // is D17 undone at run time. Refused before anything is created.
  if (input.models.length === 0) {
    throw new Error(
      'mintAppKey needs at least one model: LiteLLM reads an empty model list as ' +
        'every model, so a key minted with none would not be confined to the app’s ' +
        'declaration. Mint a key only for an app whose ai.models is non-empty.',
    )
  }

  const userId = await ensureAiUser(client, input)
  const minted = await client.post<{ key?: unknown }>('/key/generate', {
    user_id: userId,
    models: [...input.models],
    allowed_routes: [...AI_ALLOWED_ROUTES],
    // S3 Evidence 2: `metadata` round-trips, which is what lets spend be joined to
    // Manifest's own entities with no side table. No budget here — see ensureAiUser.
    metadata: {
      manifest_project: input.projectId,
      manifest_environment: input.kind,
      manifest_slug: input.projectSlug,
    },
  })
  if (typeof minted.key !== 'string' || minted.key === '') {
    // A 2xx with no key in it. Nothing from the body is carried (§14).
    throw new AiError(AI_CODES.UNMAPPED, 200, { status: 200 })
  }
  return minted.key
}

/**
 * An instance's own key (P4c Task 6).
 *
 * P4b stored ONE key per app and environment and revoked the previous one at the
 * commit — which is the moment the previous container is still serving, so the revoke
 * had to wait for a drain that did not exist. P4c starts the new instance BESIDE the
 * one serving and drains the old one, so both hold a live key at once. A key stored
 * under its instance's id is revoked exactly when that instance is retired, and a key
 * whose instance failed is still recorded, so the next retire cleans it up rather than
 * losing the only reference to a live key.
 */
export const instanceKeySecretName = (instanceId: string): string =>
  `${LLM_API_KEY_SECRET}:${instanceId}`

export interface InstanceKeyScope {
  projectId: string
  kind: EnvironmentKind
  instanceId: string
}

const instanceScope = (input: InstanceKeyScope) => ({
  projectId: input.projectId,
  environmentKind: input.kind,
  name: instanceKeySecretName(input.instanceId),
})

/** Records the key this instance holds. Revokes nothing: every other instance's key
 *  stays live, which is what lets the old container answer while it drains. */
export async function storeInstanceKey(
  db: Db,
  keys: MasterKeypair,
  input: InstanceKeyScope & { key: string },
): Promise<void> {
  await putSecret(db, { ...instanceScope(input), value: input.key }, keys)
}

/**
 * Revokes the key this instance held and forgets it. `false` when it held none.
 *
 * THE REVOKE COMES FIRST. A failure then leaves the secret recorded, so the next
 * retire tries again; deleting first and failing at the gateway would leave a live key
 * with nothing in the platform referencing it — a key nobody can revoke and nobody
 * can find.
 */
export async function revokeInstanceKey(
  db: Db,
  client: LiteLlmClient,
  keys: MasterKeypair,
  input: InstanceKeyScope,
): Promise<boolean> {
  const scope = instanceScope(input)
  const key = await getSecret(db, scope, keys)
  if (key === undefined) return false
  await revokeKey(client, key)
  await deleteSecret(db, scope)
  return true
}

/**
 * The same for P4b's environment-level `app:llmApiKey`, which every app deployed
 * before P4c holds.
 *
 * Called only once the environment's serving instance has a `Route` record — until
 * then that key is the one the RUNNING container is using, and revoking it fails
 * every question a student asks of an app this platform has not redeployed yet.
 */
export async function revokeLegacyAppKey(
  db: Db,
  client: LiteLlmClient,
  keys: MasterKeypair,
  input: { projectId: string; kind: EnvironmentKind },
): Promise<boolean> {
  const scope = {
    projectId: input.projectId,
    environmentKind: input.kind,
    name: LLM_API_KEY_SECRET,
  }
  const key = await getSecret(db, scope, keys)
  if (key === undefined) return false
  await revokeKey(client, key)
  await deleteSecret(db, scope)
  return true
}

/**
 * Revokes a minted key that was never RECORDED: `storeInstanceKey` itself failed, so
 * nothing in the platform references it and the only way to name it is by value. Every
 * other failed deploy revokes by instance id instead, which survives a retry.
 */
export async function discardAppKey(client: LiteLlmClient, key: string): Promise<void> {
  await revokeKey(client, key)
}

async function revokeKey(client: LiteLlmClient, key: string): Promise<void> {
  try {
    await client.post('/key/delete', { keys: [key] })
  } catch (error) {
    // 404 is "No keys found": LiteLLM no longer holds the key — its database was
    // reset, or somebody deleted it — which is the end state this call wants (P4b
    // pre-flight 43). Any other failure is real, and surfaces.
    if (!(error instanceof AiError && error.status === 404)) throw error
  }
}

/**
 * The three steps with the client and the master keypair bound — what `deployRelease`
 * receives, so `releases/` never holds the LiteLLM master key or key material. `db`
 * stays a per-call argument because it may be a transaction. The same shape as P4a's
 * `createSsoRegistrar(pool, keys)`.
 *
 * `enabled` is read by `deployRelease` beside `ModelCatalogue.enabled`: two
 * independent reads of `MANIFEST_AI_ENABLED`, which is the shape a guard needs.
 */
export interface AiKeyService {
  readonly enabled: boolean
  mintAppKey(input: MintAppKeyInput): Promise<string>
  /** Only for a key `storeInstanceKey` could not record: revoked by VALUE. */
  discardAppKey(key: string): Promise<void>
  /** P4c: the key this instance holds, recorded under its own id. */
  storeInstanceKey(db: Db, input: InstanceKeyScope & { key: string }): Promise<void>
  /** P4c: revoked when THAT instance is retired, never when its replacement starts. */
  revokeInstanceKey(db: Db, input: InstanceKeyScope): Promise<boolean>
  /** P4c: P4b's environment-level key, once the serving instance has a Route record. */
  revokeLegacyAppKey(
    db: Db,
    input: { projectId: string; kind: EnvironmentKind },
  ): Promise<boolean>
}

export function createAiKeyService(
  client: LiteLlmClient,
  keys: MasterKeypair,
): AiKeyService {
  return {
    enabled: true,
    mintAppKey: (input) => mintAppKey(client, input),
    discardAppKey: (key) => discardAppKey(client, key),
    storeInstanceKey: (db, input) => storeInstanceKey(db, keys, input),
    revokeInstanceKey: (db, input) => revokeInstanceKey(db, client, keys, input),
    revokeLegacyAppKey: (db, input) => revokeLegacyAppKey(db, client, keys, input),
  }
}

/**
 * `MANIFEST_AI_ENABLED=0`: there is no client, so there is nothing to mint with.
 *
 * `deployRelease` refuses an AI release before it gets here, with a code that names
 * the setting. This is the backstop behind that guard, so that removing it fails
 * loudly and says why — rather than as a `TypeError` on `undefined`, or as an app
 * rendered with an empty `LLM_API_KEY` that starts healthy and fails its first
 * question.
 */
export function disabledAiKeyService(): AiKeyService {
  const refuse = (): Promise<never> =>
    Promise.reject(
      new Error(
        'AI is switched off on this control plane (MANIFEST_AI_ENABLED=0), so no AI ' +
          'key can be minted, stored, discarded or revoked. Check ' +
          '`enabled` first.',
      ),
    )
  return {
    enabled: false,
    mintAppKey: refuse,
    discardAppKey: refuse,
    storeInstanceKey: refuse,
    revokeInstanceKey: refuse,
    revokeLegacyAppKey: refuse,
  }
}
