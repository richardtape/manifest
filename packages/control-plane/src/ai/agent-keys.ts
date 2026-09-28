import type { LiteLlmClient } from './client.js'
import { AI_CODES, AiError } from './errors.js'
import { AI_ALLOWED_ROUTES } from './keys.js'

/**
 * §10's two keys that are not an app's (the front-end enablement plan's Tasks 9–10; Spec actions 1
 * and 5): an AGENT key, for one person's agent on one project and charged to that person, and an
 * INTAKE key, for one person describing an app before any project exists and paid for by the
 * platform. Both are capped, short-lived and confined like every key this platform mints; neither
 * is ever stored — the caller answers it once and keeps no copy (Decision 20).
 *
 * **TWO BUDGETS AT TWO LEVELS** (Decision 21). The month is on a LiteLLM USER — the person's, or the
 * platform's intake user — because a monthly ceiling that lived on a key would reset with every
 * key. The session's cap and its life are on the KEY, because D8's *"a looping agent burns its own
 * cap"* is one session's. `[M7]` measured both binding on 1.98.0: a key's cap refuses the second
 * call at once, and a user's month refuses under a key whose own cap is higher.
 *
 * **A KEY IS NAMED BY ITS ALIAS, NEVER BY ITS VALUE.** The alias is derived from the session's id, so
 * it cannot disagree with the row, and `/key/delete { key_aliases }` revokes it (`[M7]`) without the
 * platform ever holding the key.
 */

/** Every budget window this module sets — a calendar month, as `ensureAiUser`'s (S3). */
const MONTHLY = '1mo'

/** A person's agent budget: ONE LiteLLM user per person, whatever project their agents work on. */
export const personAiUserId = (userId: string): string => `mf-person-${userId}`

/**
 * THE PLATFORM'S intake budget (Spec action 5): one LiteLLM user for every intake key, independent
 * of every person's and every app's. `scripts/litellm-orphans.sh` holds it as it holds a person's.
 */
export const INTAKE_AI_USER = 'mf-platform-intake'

export const agentKeyAlias = (sessionId: string): string => `mf-agent-${sessionId}`
export const intakeKeyAlias = (sessionId: string): string => `mf-intake-${sessionId}`

/**
 * Creates the budgeted user, or updates its month — `ensureAiUser`'s shape exactly
 * (`ai/keys.ts`): `auto_create_key: false`, because 1.98.0 would otherwise mint an unconfined key
 * beside it, and a `409` recognised by its STATUS, because the client carries none of LiteLLM's
 * text into an error (§14).
 */
async function ensureBudgetedUser(
  client: LiteLlmClient,
  litellmUserId: string,
  monthlyUsd: number,
): Promise<string> {
  const budget = { max_budget: monthlyUsd, budget_duration: MONTHLY }
  try {
    await client.post('/user/new', {
      user_id: litellmUserId,
      ...budget,
      auto_create_key: false,
    })
  } catch (error) {
    if (!(error instanceof AiError && error.status === 409)) throw error
    // UPDATED rather than left alone: the setting may have changed since the user was made.
    await client.post('/user/update', { user_id: litellmUserId, ...budget })
  }
  return litellmUserId
}

export function ensurePersonBudget(
  client: LiteLlmClient,
  input: { userId: string; monthlyUsd: number },
): Promise<string> {
  return ensureBudgetedUser(client, personAiUserId(input.userId), input.monthlyUsd)
}

export function ensureIntakeBudget(
  client: LiteLlmClient,
  input: { monthlyUsd: number },
): Promise<string> {
  return ensureBudgetedUser(client, INTAKE_AI_USER, input.monthlyUsd)
}

/** What every capped key is minted from: the user its month is on, and the alias it is named by. */
export interface CappedKeyInput {
  litellmUserId: string
  alias: string
  models: readonly string[]
  capUsd: number
  seconds: number
  metadata: Record<string, string | null>
}

/**
 * ONE confined key with a cap and a life — shared by the agent key and the intake key (sitting 7's
 * instruction: the user and the alias are parameters, so the two kinds cannot drift apart).
 */
export async function mintCappedKey(
  client: LiteLlmClient,
  input: CappedKeyInput,
): Promise<string> {
  // To LiteLLM an EMPTY model list is EVERY model (`[M7]`, re-measured by Task 1 reaching
  // `default-chat-onprem-reasoning`). Refused before anything is created — `ai/keys.ts:117`'s rule.
  if (input.models.length === 0) {
    throw new Error(
      'a key needs at least one model: LiteLLM reads an empty model list as every model, so a ' +
        'key minted with none would not be confined to what D17 allows.',
    )
  }
  // A key with no life, or no cap, is not the bounded credential §10 describes: `duration` and
  // `max_budget` are what make it expire and stop on their own, whatever the control plane does.
  if (!Number.isInteger(input.seconds) || input.seconds < 1) {
    throw new Error(
      `a key's life must be a whole number of seconds, at least 1 (was ${input.seconds})`,
    )
  }
  if (!(input.capUsd > 0)) {
    throw new Error(`a key's cap must be more than $0 (was ${input.capUsd})`)
  }
  const minted = await client.post<{ key?: unknown }>('/key/generate', {
    user_id: input.litellmUserId,
    key_alias: input.alias,
    models: [...input.models],
    allowed_routes: [...AI_ALLOWED_ROUTES],
    duration: `${input.seconds}s`,
    max_budget: input.capUsd,
    metadata: input.metadata,
  })
  if (typeof minted.key !== 'string' || minted.key === '') {
    // A 2xx with no key in it. Nothing from the body is carried (§14).
    throw new AiError(AI_CODES.UNMAPPED, 200, { status: 200 })
  }
  return minted.key
}

/** An agent session's key: on the PERSON's user, so its spend is theirs (Decision 21). */
export function mintAgentKey(
  client: LiteLlmClient,
  input: {
    sessionId: string
    userId: string
    projectId: string
    tokenId: string | null
    models: readonly string[]
    capUsd: number
    seconds: number
  },
): Promise<string> {
  return mintCappedKey(client, {
    litellmUserId: personAiUserId(input.userId),
    alias: agentKeyAlias(input.sessionId),
    models: input.models,
    capUsd: input.capUsd,
    seconds: input.seconds,
    metadata: {
      manifest_project: input.projectId,
      manifest_agent_session: input.sessionId,
      manifest_person: input.userId,
      manifest_token: input.tokenId,
    },
  })
}

/** An intake session's key: on the PLATFORM's user, one model, never the person's budget (Spec action 5). */
export function mintIntakeKey(
  client: LiteLlmClient,
  input: {
    sessionId: string
    userId: string
    model: string
    capUsd: number
    seconds: number
  },
): Promise<string> {
  return mintCappedKey(client, {
    litellmUserId: INTAKE_AI_USER,
    alias: intakeKeyAlias(input.sessionId),
    models: [input.model],
    capUsd: input.capUsd,
    seconds: input.seconds,
    metadata: { manifest_intake_session: input.sessionId, manifest_person: input.userId },
  })
}

/**
 * Revokes a key by its alias. `404` is done: LiteLLM holds no such key — already revoked, or its
 * database reset — which is the end state wanted (`revokeKey`'s rule in `ai/keys.ts`). Any other
 * failure is real and surfaces: a live key nobody can end is the one outcome worse than a refusal.
 */
export async function revokeKeyByAlias(
  client: LiteLlmClient,
  alias: string,
): Promise<void> {
  try {
    await client.post('/key/delete', { key_aliases: [alias] })
  } catch (error) {
    if (!(error instanceof AiError && error.status === 404)) throw error
  }
}

export const revokeAgentKey = (client: LiteLlmClient, sessionId: string): Promise<void> =>
  revokeKeyByAlias(client, agentKeyAlias(sessionId))

export const revokeIntakeKey = (
  client: LiteLlmClient,
  sessionId: string,
): Promise<void> => revokeKeyByAlias(client, intakeKeyAlias(sessionId))

/**
 * What a budgeted user has spent this month, and each of its live keys (FE-23): ONE `/user/info`,
 * whose `keys[]` are LiteLLM's rows for every key the user still holds (1.98.0,
 * `_process_keys_for_user_info`). A deleted key is not among them — an ended session's spend is
 * recorded on its row when it ends.
 */
export interface BudgetSpend {
  spentUsd: number
  /** When LiteLLM resets the month (`[M8]`: the first of the next month, 00:00 UTC). */
  resetsAt: string | null
  /** Spend by key alias, for the keys the user still holds. */
  byAlias: ReadonlyMap<string, number>
}

interface UserInfoResponse {
  user_info?: { spend?: unknown; budget_reset_at?: unknown } | null
  keys?: { key_alias?: unknown; spend?: unknown }[] | null
}

/**
 * **NEVER 0 FOR "UNKNOWN"** (Decision 24): a gateway that does not answer, or answers without a
 * spend, THROWS — the caller answers `null` with a reason. A `404` is different: LiteLLM has no such
 * user, so nothing has been spent on it this month — a known zero (a person who has never started a
 * session; or one whose user the orphan script reclaimed, which resets their month by design,
 * Decision 26).
 */
export async function budgetSpend(
  client: LiteLlmClient,
  litellmUserId: string,
): Promise<BudgetSpend> {
  let info: UserInfoResponse
  try {
    info = await client.get<UserInfoResponse>('/user/info', { user_id: litellmUserId })
  } catch (error) {
    if (error instanceof AiError && error.status === 404) {
      return { spentUsd: 0, resetsAt: null, byAlias: new Map() }
    }
    throw error
  }
  const spend = info.user_info?.spend
  if (typeof spend !== 'number' || !Number.isFinite(spend)) {
    // A 2xx without the field `[M8]` recorded: the gateway has moved. Nothing from the body is carried.
    throw new AiError(AI_CODES.UNMAPPED, 200, { status: 200 })
  }
  const reset = info.user_info?.budget_reset_at
  const byAlias = new Map<string, number>()
  for (const key of info.keys ?? []) {
    if (typeof key.key_alias === 'string' && typeof key.spend === 'number') {
      byAlias.set(key.key_alias, key.spend)
    }
  }
  return { spentUsd: spend, resetsAt: typeof reset === 'string' ? reset : null, byAlias }
}

export const personSpend = (
  client: LiteLlmClient,
  userId: string,
): Promise<BudgetSpend> => budgetSpend(client, personAiUserId(userId))

export const intakeSpend = (client: LiteLlmClient): Promise<BudgetSpend> =>
  budgetSpend(client, INTAKE_AI_USER)
