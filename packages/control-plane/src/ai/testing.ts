import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { createCatalogueCache, type ModelCatalogue } from './catalogue.js'
import type { LiteLlmClient } from './client.js'
import { AI_CODES, AiError, mapLiteLlmError } from './errors.js'

/**
 * Probe keys for §16's AI-path tier (P4b Task 3). NOT `ai/keys.ts` — that is Task 7,
 * and this tier exists to establish what Task 7 must produce before it produces it.
 *
 * Minted through `fetch` from the host, against LiteLLM's published port, with the
 * master key `vitest.env.ts` derives from `.env`.
 */

/** The bootstrap catalogue P1 ships. Resolved from this file, never from the cwd. */
export const LITELLM_CONFIG = fileURLToPath(
  new URL('../../../../infra/litellm/config.yaml', import.meta.url),
)

/**
 * D17's catalogue for the unit tier, with no LiteLLM behind it — what `testDeps`
 * hands every API test (P4b Task 6).
 *
 * READ FROM `infra/litellm/config.yaml`, not written out here, and passed through the
 * REAL projection: a hand-written list in a harness is a second copy of the
 * catalogue, which is the defect Task 6 deletes from the route, and a fixture that
 * skipped `loadModelCatalogue` would let the API tier pass on entries the platform
 * would have refused. The config file carries no `mode` on a chat entry where the
 * live proxy answers `null`; the projection treats both as chat.
 */
export function declaredCatalogue(): ModelCatalogue {
  const declared = parse(readFileSync(LITELLM_CONFIG, 'utf8')) as {
    model_list: { model_name: string; model_info?: Record<string, unknown> }[]
  }
  const body = {
    data: declared.model_list.map((m) => ({
      model_name: m.model_name,
      model_info: m.model_info ?? {},
    })),
  }
  const client = {
    get: async () => body,
    post: async () => {
      throw new Error('declaredCatalogue() is read-only: it has no LiteLLM to write to')
    },
  } as unknown as LiteLlmClient
  return createCatalogueCache(client)
}

/** LiteLLM's published port: `infra/compose.yaml` maps 127.0.0.1:7106 to 4000. */
export function litellmUrl(): string {
  return process.env.MANIFEST_LITELLM_URL ?? 'http://127.0.0.1:7106'
}

/**
 * Read when it is used, never when this module loads: `secrets/scrub.ts` deletes the
 * name from `process.env` whenever the control plane boots in-process, and an empty
 * bearer reaches LiteLLM as a 401 that blames the key rather than its absence.
 */
export function litellmMasterKey(): string {
  const key = process.env.LITELLM_MASTER_KEY
  if (!key) {
    throw new Error(
      'LITELLM_MASTER_KEY is not set. vitest.env.ts derives it from .env, which `make seed` writes.',
    )
  }
  return key
}

async function admin(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${litellmUrl()}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${litellmMasterKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 300)}`)
  return JSON.parse(text) as Record<string, unknown>
}

/**
 * `/user/new` FIRST, and it is load-bearing for the NEGATIVE control rather than for
 * the positive one. S3 measured that a key whose `user_id` was auto-created by
 * `/key/generate` is refused on `/key/generate` with `401 … Your role=unknown`, so an
 * unconfined key under an auto-created user would look confined — the escalation
 * control would "pass" while proving nothing.
 *
 * `auto_create_key: false`, because LiteLLM 1.98.0 defaults it to TRUE. Measured
 * 2026-09-14: `/user/new` answered with a key alongside the user — no
 * `allowed_routes`, every model — so a probe user would leave behind an unconfined
 * key that no teardown knows exists.
 */
export async function ensureProbeUser(userId: string): Promise<void> {
  try {
    await admin('/user/new', {
      user_id: userId,
      max_budget: 5,
      budget_duration: '1mo',
      auto_create_key: false,
    })
  } catch (error) {
    // Already exists (409) is the desired end state. Any other failure must surface:
    // swallowing it would make every probe fail for an unrelated reason.
    if (!String(error).includes('already exists')) throw error
  }
}

/** The three routes an app key may call (§10). Task 7 makes this `ai/keys.ts`'s constant. */
export const PROBE_ALLOWED_ROUTES = [
  '/v1/chat/completions',
  '/v1/embeddings',
  '/v1/models',
]

export async function mintProbeKey(opts: {
  userId: string
  confined: boolean
}): Promise<string> {
  const body: Record<string, unknown> = {
    key_alias: `p4b-probe-${opts.confined ? 'confined' : 'open'}-${Date.now()}`,
    user_id: opts.userId,
    models: ['default-chat', 'default-embed'],
  }
  // The ONE difference between the two keys in the matched pair. S3 minted exactly
  // this pair under the same user and measured the escalation on the open one.
  if (opts.confined) body.allowed_routes = PROBE_ALLOWED_ROUTES
  const created = await admin('/key/generate', body)
  if (typeof created.key !== 'string') {
    throw new Error(
      `/key/generate answered without a key: ${JSON.stringify(created).slice(0, 200)}`,
    )
  }
  return created.key
}

export async function deleteProbeKey(key: string): Promise<void> {
  await admin('/key/delete', { keys: [key] })
}

/** For a key this process never saw: the child probe 14's unconfined key mints. */
export async function deleteProbeKeyByAlias(alias: string): Promise<void> {
  await admin('/key/delete', { key_aliases: [alias] })
}

/**
 * A RECORDING FAKE LiteLLM (the front-end enablement plan's Task 9): the unit tier's gateway for
 * agent and intake keys. It answers `LiteLlmClient`'s `get`/`post` from an in-memory map of users
 * and keys, records every call, and FAILS the way Task 5's client really fails — an `AiError` built
 * by `mapLiteLlmError` from the status — so a `409` on `/user/new` or a `404` on `/key/delete` is
 * recognised exactly as the real one is.
 *
 * `use(key)` is the MODEL route's half: it refuses a key the way `[M7]` measured 1.98.0 refusing —
 * `401 token_not_found_in_db` once deleted, `401 expired_key` past its `duration`, `429
 * budget_exceeded` over its own `max_budget` or its user's, `403 key_model_access_denied` for a
 * model outside its list. `testAiKeyService` stays for the tests that want no gateway at all.
 */
export interface FakeLiteLlmCall {
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  body?: Record<string, unknown>
  query?: Record<string, string>
}

interface FakeUser {
  maxBudget: number
  spend: number
}

/**
 * A deployment as `/model/info` lists it (the front-end enablement plan's Task 12a). The five
 * `config.yaml` entries are seeded as CONFIG-FILE deployments (`db_model: false`), which
 * `/model/delete` cannot remove, as a real gateway's cannot; `/model/new` adds DB-held ones.
 */
export interface FakeDeployment {
  id: string
  modelName: string
  /** `litellm_params.model` — the provider's model string, decrypted as `/model/info` answers it. */
  model: string
  modelInfo: Record<string, unknown>
  dbModel: boolean
  /**
   * False for a row LiteLLM SAVED but could not serve — an unknown provider, measured at sitting 9a:
   * `/model/new` answers `500` *"Model create was saved to the database, but … not live"*, and the
   * row is absent from `/model/info` until it is deleted by its id.
   */
  live: boolean
  /** False once `unreachable(modelName)` is called: listed, and never answering. */
  reachable?: boolean
  /**
   * A PINNED price — a config entry's own, or one `/model/new` was sent in `litellm_params` (measured at sitting
   * 9a: a pinned price overrides both of LiteLLM's maps and charges spend exactly); else `price()` or the fake's map.
   */
  inputCostPerToken?: number
  outputCostPerToken?: number
}

interface FakeKey {
  key: string
  alias: string
  userId: string
  models: string[]
  maxBudget: number
  expiresAt: number
  spend: number
  metadata: unknown
}

export interface FakeLiteLlm extends LiteLlmClient {
  readonly calls: FakeLiteLlmCall[]
  readonly users: ReadonlyMap<string, FakeUser>
  readonly keys: ReadonlyMap<string, FakeKey>
  /** Sets a user's month spent, in USD. */
  spend(litellmUserId: string, usd: number): void
  /**
   * `default-chat-large`'s fallbacks and every other model's, as LiteLLM's router holds them (the front-end
   * enablement plan's Task 12b): a model NAME to the names that answer for it, by `fallback_type`. Keyed by
   * name, never by deployment — measured at sitting 9b: an entry outlives its primary's deletion.
   */
  readonly fallbacks: ReadonlyMap<string, ReadonlyMap<string, string[]>>
  /**
   * Every deployment named `modelName` stops answering — its provider down, or the network off (sitting 9b
   * measured it with an `api_base` nothing listens on).
   */
  unreachable(modelName: string): void
  /** Charges one key (and its user) as a model call would. */
  charge(alias: string, usd: number): void
  /**
   * The next `n` calls to `path` fail with `status`, as the real gateway's would — and status `0` as
   * the real client's outage does (nothing answered).
   */
  fail(path: string, status: number, n?: number): void
  /**
   * Every call to `path` answers after `ms` — the real gateway's `/key/generate` writes to Postgres
   * and takes about 100 ms, and a race that window opens is invisible to a fake answering at once.
   */
  slow(path: string, ms: number): void
  /**
   * The model route: what calling it with `key` for `model` answers. When `model` cannot answer and a
   * `general` fallback is set, the fallback answers — naming ITS provider's model, with LiteLLM's
   * `x-litellm-attempted-fallbacks` — WITHOUT consulting the key's list of models (measured at sitting 9a
   * and again at 9b: a key holding only the primary is answered by the fallback).
   */
  use(
    key: string,
    model: string,
  ): { status: number; type?: string; model?: string; attemptedFallbacks?: number }
  /** Moves the fake's clock, in milliseconds. */
  advance(ms: number): void
  /** Every deployment the gateway holds, served or not, by id. */
  readonly deployments: ReadonlyMap<string, FakeDeployment>
  /**
   * What LiteLLM's price map answers for a provider's model string, in USD a token. Unset, an
   * `openai/*` model is priced at `1e-07` unless its name begins `openai/unpriced` — which reads `0`,
   * as `openai/gpt-6-terra` did at sitting 9a (neither of LiteLLM's maps knows it).
   */
  price(model: string, inputUsdPerToken: number): void
}

/** The providers the fake can serve; any other prefix is saved and never served, as 1.98.0 does. */
const FAKE_PROVIDERS = new Set(['openai', 'azure', 'anthropic', 'ollama', 'ollama_chat'])

/** `infra/litellm/config.yaml`'s entries, as a gateway loaded from it lists them. */
function configDeployments(): FakeDeployment[] {
  const declared = parse(readFileSync(LITELLM_CONFIG, 'utf8')) as {
    model_list: {
      model_name: string
      litellm_params: { model: string; input_cost_per_token?: number }
      model_info?: Record<string, unknown>
    }[]
  }
  return declared.model_list.map((m, i): FakeDeployment => ({
    id: `config-${i}-${m.model_name}`,
    modelName: m.model_name,
    model: m.litellm_params.model,
    modelInfo: { ...(m.model_info ?? {}) },
    dbModel: false,
    live: true,
    ...(m.litellm_params.input_cost_per_token === undefined
      ? {}
      : { inputCostPerToken: m.litellm_params.input_cost_per_token }),
  }))
}

export function fakeLiteLlm(): FakeLiteLlm {
  const calls: FakeLiteLlmCall[] = []
  const users = new Map<string, FakeUser>()
  const keys = new Map<string, FakeKey>()
  const failures = new Map<string, { status: number; n: number }>()
  const delays = new Map<string, number>()
  const wait = async (path: string) => {
    const ms = delays.get(path)
    if (ms !== undefined) await new Promise((resolve) => setTimeout(resolve, ms))
  }
  let clock = Date.now()
  let minted = 0
  const deployments = new Map<string, FakeDeployment>(
    configDeployments().map((d) => [d.id, d]),
  )
  const prices = new Map<string, number>()
  const fallbacks = new Map<string, Map<string, string[]>>([
    ['general', new Map()],
    ['context_window', new Map()],
    ['content_policy', new Map()],
  ])
  /** The router's model names: every LIVE deployment's (`llm_router.model_names`). */
  const routerNames = (): Set<string> =>
    new Set([...deployments.values()].filter((d) => d.live).map((d) => d.modelName))
  const fallbackType = (value: unknown): string => {
    const type = value === undefined ? 'general' : String(value)
    if (!fallbacks.has(type)) refuseDetail(422)
    return type
  }
  const mapPrices = (model: string): boolean =>
    model.startsWith('openai/') && !model.startsWith('openai/unpriced')
  const costOf = (d: FakeDeployment): number =>
    d.inputCostPerToken ?? prices.get(d.model) ?? (mapPrices(d.model) ? 1e-7 : 0)
  const outputCostOf = (d: FakeDeployment): number =>
    d.outputCostPerToken ??
    (prices.has(d.model) ? prices.get(d.model)! * 5 : mapPrices(d.model) ? 5e-7 : 0)

  const refuse = (status: number, type = 'internal_server_error'): never => {
    throw mapLiteLlmError(status, { error: { type, message: 'fake' } })
  }
  /** FastAPI's own envelope, `{"detail": {...}}` — how 1.98.0's `/fallback` refuses (measured at sitting 9b). */
  const refuseDetail = (status: number): never => {
    throw mapLiteLlmError(status, { detail: { error: 'fake' } })
  }
  const failIfAsked = (path: string) => {
    const f = failures.get(path)
    if (f === undefined || f.n <= 0) return
    f.n -= 1
    // Status 0 is NOTHING answering, which the real client (`ai/client.ts`) throws as its own
    // AI_BACKEND_UNAVAILABLE — never a mapped body (sitting 9b: mapped, it read AI_UNMAPPED).
    if (f.status === 0) {
      throw new AiError(AI_CODES.BACKEND_UNAVAILABLE, 0, {
        status: 0,
        reason: 'unreachable',
      })
    }
    refuse(f.status)
  }
  const seconds = (duration: unknown): number => {
    const m = typeof duration === 'string' ? /^(\d+)s$/.exec(duration) : null
    if (!m) refuse(400, 'bad_request_error')
    return Number(m![1])
  }

  async function post<T>(path: string, raw: unknown): Promise<T> {
    const body = (raw ?? {}) as Record<string, unknown>
    calls.push({ method: 'POST', path, body })
    await wait(path)
    failIfAsked(path)
    switch (path) {
      case '/user/new': {
        const id = String(body.user_id)
        if (users.has(id)) refuse(409)
        users.set(id, { maxBudget: Number(body.max_budget), spend: 0 })
        return { user_id: id } as T
      }
      case '/user/delete': {
        // As 1.98.0 answers (sitting 9): a list naming ANY user it does not hold is `404` and
        // deletes nothing; otherwise every named user goes, and their keys with them.
        const ids = (body.user_ids as string[] | undefined) ?? []
        if (ids.length === 0 || ids.some((id) => !users.has(id)))
          refuse(404, 'not_found_error')
        for (const id of ids) {
          users.delete(id)
          for (const k of [...keys.values()]) if (k.userId === id) keys.delete(k.key)
        }
        return ids.length as T
      }
      case '/user/update': {
        const user = users.get(String(body.user_id))
        if (user === undefined) refuse(404)
        user!.maxBudget = Number(body.max_budget)
        return {} as T
      }
      case '/key/generate': {
        const userId = String(body.user_id)
        // S3: a key under an auto-created user is refused — the fake requires the user first.
        if (!users.has(userId)) refuse(401, 'auth_error')
        const alias = String(body.key_alias)
        if ([...keys.values()].some((k) => k.alias === alias))
          refuse(400, 'bad_request_error')
        const key = `sk-fake-${++minted}`
        keys.set(key, {
          key,
          alias,
          userId,
          models: (body.models as string[]) ?? [],
          maxBudget: Number(body.max_budget),
          expiresAt: clock + seconds(body.duration) * 1000,
          spend: 0,
          metadata: body.metadata,
        })
        return { key, key_alias: alias } as T
      }
      case '/model/new': {
        const info = { ...((body.model_info ?? {}) as Record<string, unknown>) }
        const id = typeof info.id === 'string' ? info.id : `fake-model-${++minted}`
        const params = (body.litellm_params ?? {}) as {
          model?: unknown
          input_cost_per_token?: unknown
          output_cost_per_token?: unknown
        }
        const model = String(params.model)
        const live = FAKE_PROVIDERS.has(model.split('/')[0] ?? '')
        deployments.set(id, {
          id,
          modelName: String(body.model_name),
          model,
          modelInfo: { ...info, id },
          dbModel: true,
          live,
          ...(typeof params.input_cost_per_token === 'number'
            ? { inputCostPerToken: params.input_cost_per_token }
            : {}),
          ...(typeof params.output_cost_per_token === 'number'
            ? { outputCostPerToken: params.output_cost_per_token }
            : {}),
        })
        // Measured: an unknown provider's row is SAVED and then refused as not live.
        if (!live) refuse(500)
        return {
          model_id: id,
          model_name: body.model_name,
          model_info: { ...info, id },
        } as T
      }
      case '/model/delete': {
        const d = deployments.get(String(body.id))
        // Measured: an id the database does not hold — gone, or a config entry — is `400`.
        if (d === undefined || !d.dbModel) refuse(400, 'auth_error')
        deployments.delete(d!.id)
        return { message: `Model: ${d!.id} deleted successfully` } as T
      }
      case '/fallback': {
        // As 1.98.0's fallback_management_endpoints.py answers, in its order (read at sitting 9b).
        const model = String(body.model)
        const names = routerNames()
        if (!names.has(model)) refuseDetail(404)
        const list = (body.fallback_models as string[] | undefined) ?? []
        if (list.some((m) => !names.has(m)) || list.includes(model)) refuseDetail(400)
        const byType = fallbacks.get(fallbackType(body.fallback_type))!
        const updated = byType.has(model)
        byType.set(model, [...list])
        return {
          model,
          fallback_models: list,
          fallback_type: body.fallback_type ?? 'general',
          message: `Fallback configuration ${updated ? 'updated' : 'created'} successfully`,
        } as T
      }
      case '/key/delete': {
        const aliases = (body.key_aliases as string[] | undefined) ?? []
        const values = (body.keys as string[] | undefined) ?? []
        const doomed = [...keys.values()].filter(
          (k) => aliases.includes(k.alias) || values.includes(k.key),
        )
        if (doomed.length === 0) refuse(404, 'not_found_error')
        for (const k of doomed) keys.delete(k.key)
        return { deleted_keys: doomed.map((k) => k.alias) } as T
      }
      default:
        return refuse(404, 'not_found_error')
    }
  }

  /** `/fallback/{model}` — the model named in the path, as LiteLLM routes it. */
  const fallbackPath = (path: string): string | undefined =>
    path.startsWith('/fallback/')
      ? decodeURIComponent(path.slice('/fallback/'.length))
      : undefined

  async function get<T>(path: string, query?: Record<string, string>): Promise<T> {
    calls.push({ method: 'GET', path, ...(query === undefined ? {} : { query }) })
    failIfAsked(path)
    const fallbackOf = fallbackPath(path)
    if (fallbackOf !== undefined) {
      const type = fallbackType(query?.fallback_type)
      const list = fallbacks.get(type)!.get(fallbackOf)
      // Measured: none set (or an empty list) is `404` "No general fallbacks configured".
      if (list === undefined || list.length === 0) refuseDetail(404)
      return { model: fallbackOf, fallback_models: [...list!], fallback_type: type } as T
    }
    if (path === '/model/info') {
      return {
        data: [...deployments.values()]
          .filter((d) => d.live)
          .map((d) => ({
            model_name: d.modelName,
            litellm_params: {
              model: d.model,
              ...(d.dbModel && d.inputCostPerToken !== undefined
                ? { input_cost_per_token: d.inputCostPerToken }
                : {}),
              ...(d.dbModel && d.outputCostPerToken !== undefined
                ? { output_cost_per_token: d.outputCostPerToken }
                : {}),
            },
            model_info: {
              ...d.modelInfo,
              id: d.id,
              db_model: d.dbModel,
              input_cost_per_token: costOf(d),
              output_cost_per_token: outputCostOf(d),
            },
          })),
      } as T
    }
    if (path !== '/user/info') return refuse(404, 'not_found_error')
    const id = query?.user_id ?? ''
    const user = users.get(id)
    if (user === undefined) return refuse(404, 'not_found_error')
    const reset = new Date(clock)
    const next = new Date(Date.UTC(reset.getUTCFullYear(), reset.getUTCMonth() + 1, 1))
    return {
      user_id: id,
      user_info: {
        spend: user.spend,
        max_budget: user.maxBudget,
        budget_reset_at: next.toISOString(),
      },
      keys: [...keys.values()]
        .filter((k) => k.userId === id)
        .map((k) => ({
          key_alias: k.alias,
          spend: k.spend,
          max_budget: k.maxBudget,
          expires: new Date(k.expiresAt).toISOString(),
          // LiteLLM answers the key's HASH here; the fake answers a marker, so a test can assert
          // no caller ever carries it.
          token: `hash-of-${k.alias}`,
        })),
    } as T
  }

  async function del<T>(path: string, query?: Record<string, string>): Promise<T> {
    calls.push({ method: 'DELETE', path, ...(query === undefined ? {} : { query }) })
    failIfAsked(path)
    const model = fallbackPath(path)
    if (model === undefined) return refuse(404, 'not_found_error')
    const type = fallbackType(query?.fallback_type)
    // Measured: DELETE never consults the router — an entry whose model is gone is still removed.
    if (!fallbacks.get(type)!.delete(model)) refuseDetail(404)
    return {
      model,
      fallback_type: type,
      message: 'Fallback configuration deleted successfully',
    } as T
  }

  /** The deployments that would answer `name`, as the router picks them. */
  const answering = (name: string): FakeDeployment | undefined =>
    [...deployments.values()].find(
      (d) => d.live && d.modelName === name && d.reachable !== false,
    )

  return {
    calls,
    users,
    keys,
    get,
    post,
    delete: del,
    fallbacks,
    unreachable: (modelName) => {
      for (const d of deployments.values())
        if (d.modelName === modelName) d.reachable = false
    },
    spend: (id, usd) => {
      const user = users.get(id)
      if (user === undefined) throw new Error(`fakeLiteLlm: no user '${id}'`)
      user.spend = usd
    },
    charge: (alias, usd) => {
      const k = [...keys.values()].find((x) => x.alias === alias)
      if (k === undefined) throw new Error(`fakeLiteLlm: no key '${alias}'`)
      k.spend += usd
      users.get(k.userId)!.spend += usd
    },
    fail: (path, status, n = 1) => failures.set(path, { status, n }),
    slow: (path, ms) => delays.set(path, ms),
    use: (key, model) => {
      const k = keys.get(key)
      if (k === undefined) return { status: 401, type: 'token_not_found_in_db' }
      if (clock >= k.expiresAt) return { status: 401, type: 'expired_key' }
      if (!k.models.includes(model))
        return { status: 403, type: 'key_model_access_denied' }
      const user = users.get(k.userId)!
      if (k.spend >= k.maxBudget || user.spend >= user.maxBudget) {
        return { status: 429, type: 'budget_exceeded' }
      }
      const listed = [...deployments.values()].some(
        (d) => d.live && d.modelName === model,
      )
      if (!listed || answering(model) !== undefined) return { status: 200 }
      // The primary cannot answer: the router tries its general fallbacks, in order, and never asks
      // whether the key may call them (measured).
      for (const name of fallbacks.get('general')!.get(model) ?? []) {
        const d = answering(name)
        if (d !== undefined) return { status: 200, model: d.model, attemptedFallbacks: 1 }
      }
      // Measured at sitting 9a: `500` "Connection error. No fallback model group found".
      return { status: 500 }
    },
    advance: (ms) => {
      clock += ms
    },
    deployments,
    price: (model, usd) => {
      prices.set(model, usd)
    },
  }
}
