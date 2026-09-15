import type { Db } from '../db/index.js'
import {
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
 * §10's "rotated every deploy", in THREE STEPS rather than one (Rich, 2026-09-14):
 * no live AI call may fail because a deploy revoked its key.
 *
 * The one-call rotation this replaces minted, stored and revoked before the new
 * container existed, so the running app's calls failed from the revoke until the
 * edge route moved (P4b pre-flight 71). So a deploy now MINTS before the instance
 * starts — the container needs the key in its environment — COMMITS only once the
 * instance is healthy, and DISCARDS the minted key if it never gets that far. The
 * previous key stays valid, and stays the stored one, until the commit.
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
 * nothing: until `commitAppKey`, the app's stored key — and the key its running
 * container holds — is still the previous one.
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

export interface CommitAppKeyInput {
  projectId: string
  kind: EnvironmentKind
  /** A key `mintAppKey` returned, now held by an instance that has passed health. */
  key: string
}

/**
 * Makes `key` the app's current key, then revokes the one it replaces.
 *
 * STORED BEFORE THE OLD KEY IS REVOKED. The other order has a window in which the
 * old key is dead while the new one exists only in this process — and a failure
 * inside it leaves nothing recorded to recover from.
 */
export async function commitAppKey(
  db: Db,
  client: LiteLlmClient,
  keys: MasterKeypair,
  input: CommitAppKeyInput,
): Promise<void> {
  const scope = {
    projectId: input.projectId,
    environmentKind: input.kind,
    name: LLM_API_KEY_SECRET,
  }
  const previous = await getSecret(db, scope, keys)
  await putSecret(db, { ...scope, value: input.key }, keys)
  // Never the key being committed. A commit repeated with the same key — a retry —
  // would otherwise revoke the key the healthy instance has just been given.
  if (previous !== undefined && previous !== input.key) {
    await revokeKey(client, previous)
  }
}

/**
 * Revokes a minted key that was never committed: its instance failed to start or
 * never passed health. The stored key is untouched, so it is still the previous one,
 * and the previous container still holds it.
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
  commitAppKey(db: Db, input: CommitAppKeyInput): Promise<void>
  discardAppKey(key: string): Promise<void>
}

export function createAiKeyService(
  client: LiteLlmClient,
  keys: MasterKeypair,
): AiKeyService {
  return {
    enabled: true,
    mintAppKey: (input) => mintAppKey(client, input),
    commitAppKey: (db, input) => commitAppKey(db, client, keys, input),
    discardAppKey: (key) => discardAppKey(client, key),
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
          'key can be minted, committed or discarded. Check `enabled` first.',
      ),
    )
  return {
    enabled: false,
    mintAppKey: refuse,
    commitAppKey: refuse,
    discardAppKey: refuse,
  }
}
