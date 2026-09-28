import { randomUUID } from 'node:crypto'
import { CLASSIFICATION_RANK, type Classification } from '../spec/index.js'
import {
  CatalogueError,
  loadModelCatalogue,
  type CatalogueSnapshot,
} from './catalogue.js'
import type { LiteLlmClient } from './client.js'
import { AiError } from './errors.js'

/**
 * THE CAPABLE MODEL (§7, §21, §26 as Spec action 7 amended them; the front-end enablement plan's
 * Task 12a): ONE logical name for the agent and app work a small model cannot do. Which model
 * answers it is `MANIFEST_CAPABLE_MODEL` — a LiteLLM model string, `openai/<model>` today — so
 * repointing it changes no app, key or manifest. `default-chat` is never repointed: it is the
 * offline floor every demo runs on (C1).
 */
export const CAPABLE_MODEL_NAME = 'default-chat-large'

/** The setting, named in every refusal an operator reads. */
export const CAPABLE_MODEL_SETTING = 'MANIFEST_CAPABLE_MODEL'

/** Its fallback's setting (Spec action 8; Task 12b), named in every refusal an operator reads. */
export const CAPABLE_FALLBACK_SETTING = 'MANIFEST_CAPABLE_MODEL_FALLBACK'

/**
 * Rich, 2026-09-27: `internal` — the classification §7's catalogue already gives `default-chat`
 * (*"may route off-prem"*). `confidential` never leaves on-premise hardware.
 */
const CAPABLE_CLASSIFICATION: Classification = 'internal'

export interface CapableModelResult {
  state: 'registered' | 'unchanged' | 'removed' | 'absent' | 'refused'
  model?: string
  reason?: string
}

/** The part of `/model/info` this module reads (measured, LiteLLM 1.98.0, sitting 9a). */
interface Deployment {
  model_name: string
  litellm_params?: {
    model?: unknown
    input_cost_per_token?: unknown
    output_cost_per_token?: unknown
  }
  model_info?: {
    id?: unknown
    max_classification?: unknown
    input_cost_per_token?: unknown
    output_cost_per_token?: unknown
  }
}

const idOf = (d: Deployment): string => String(d.model_info?.id)
const modelOf = (d: Deployment): string | undefined =>
  typeof d.litellm_params?.model === 'string' ? d.litellm_params.model : undefined
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * A price LiteLLM can charge. **A model it cannot price spends `$0` for ever**, so no agent
 * budget, session cap or intake month would ever bind on real money — measured at sitting 9a as
 * `0` for an `openai/*` model neither of its price maps knows, never `null`.
 */
const priced = (d: Deployment): boolean => positive(d.model_info?.input_cost_per_token)

/**
 * THE PRICE IS THE DEPLOYMENT'S OWN (sitting 9a's review, I1). LiteLLM prices `gpt-6-*` only from the
 * list it downloads at its own start with the network on, so a LiteLLM restarted OFFLINE under a
 * running control plane would serve the model at `$0` once the network came back. A price sent in
 * `litellm_params` overrides both of its lists, shows in `/model/info` and charges spend exactly
 * (measured: 19 × 5e-05 + 2 × 1e-04 = 0.00115). So what is registered carries the price LiteLLM itself
 * reported for the model — never a price this platform invents — and no restart can take it away.
 */
const pinned = (d: Deployment): boolean =>
  positive(d.litellm_params?.input_cost_per_token)

async function deployments(client: LiteLlmClient): Promise<Deployment[]> {
  const body = await client.get<{ data?: Deployment[] }>('/model/info')
  return (body.data ?? []).filter((d) => d.model_name === CAPABLE_MODEL_NAME)
}

const remove = (client: LiteLlmClient, id: string) => client.post('/model/delete', { id })

/**
 * The cleanup after a registration that failed, or a stand-in no longer needed. `400` is LiteLLM's answer
 * for an id its database does not hold (measured) — nothing was saved, which is what the cleanup wants.
 * Any other failure is the OPERATOR's to see, and never replaces the error the caller is about to throw.
 */
async function removeIfSaved(client: LiteLlmClient, id: string): Promise<void> {
  try {
    await remove(client, id)
  } catch (error) {
    if (error instanceof AiError && (error.status === 400 || error.status === 404)) return
    console.error(
      JSON.stringify({
        level: 'error',
        msg: `a failed registration of ${CAPABLE_MODEL_NAME} may have left a deployment in LiteLLM's database`,
        id,
        code: error instanceof AiError ? error.code : 'UNKNOWN',
        fix: `POST /model/delete {"id":"${id}"} on LiteLLM's admin port`,
      }),
    )
  }
}

/**
 * Whether the gateway ANSWERED. Status `0` is the client's own *timeout* or *unreachable*
 * (`ai/client.ts`) — an outage; anything else is LiteLLM refusing what it was asked, which for
 * `/model/new` is the SETTING's fault (the review's I2: an unknown provider is a measured `500`).
 */
const answered = (error: unknown): error is AiError =>
  error instanceof AiError && error.status > 0

type Created = { entry: Deployment; id: string } | { refusedWith: number }

/**
 * One `/model/new` under an id this process chooses, read back from `/model/info`. A refusal the
 * gateway ANSWERED is returned, its saved-anyway row removed; an outage is thrown.
 */
async function create(
  client: LiteLlmClient,
  setting: string,
  price?: { input_cost_per_token: number; output_cost_per_token?: number },
): Promise<Created> {
  const id = `manifest-capable-${randomUUID()}`
  try {
    await client.post('/model/new', {
      model_name: CAPABLE_MODEL_NAME,
      litellm_params: { model: setting, ...price },
      model_info: { id, max_classification: CAPABLE_CLASSIFICATION },
    })
  } catch (error) {
    await removeIfSaved(client, id)
    if (answered(error)) return { refusedWith: error.status }
    throw error
  }
  const entry = (await deployments(client)).find((d) => idOf(d) === id)
  if (entry === undefined) {
    await removeIfSaved(client, id)
    return { refusedWith: 0 }
  }
  return { entry, id }
}

const unavailable = (kept: Deployment[]): string => {
  const model = kept.map(modelOf).find((m) => m !== undefined)
  return model === undefined
    ? ` ${CAPABLE_MODEL_NAME} is unavailable meanwhile, and default-chat still serves.`
    : ` '${model}' is kept as ${CAPABLE_MODEL_NAME} until the setting names a model LiteLLM serves and prices.`
}

const unpricedReason = (model: string, kept: Deployment[]): string =>
  `${CAPABLE_MODEL_SETTING} names '${model}', which LiteLLM cannot price, so it was not registered: ` +
  'a model priced at $0 would never bind an agent budget, a session cap or the intake month. ' +
  'LiteLLM prices from the list it ships with and from the one it fetches at its own start when the ' +
  'network is on — restart LiteLLM with the network on (`docker restart manifest-litellm`), then this ' +
  'control plane; or name a model it prices.' +
  unavailable(kept)

const unservedReason = (model: string, status: number, kept: Deployment[]): string =>
  `${CAPABLE_MODEL_SETTING} names '${model}', which LiteLLM would not serve` +
  (status > 0 ? ` (it answered HTTP ${status})` : '') +
  ": check the provider prefix — `openai/<model>` today — and that LiteLLM holds that provider's key " +
  '(`docker logs manifest-litellm` says why).' +
  unavailable(kept)

/**
 * Makes LiteLLM's catalogue hold exactly what `MANIFEST_CAPABLE_MODEL` says — called at every boot.
 *
 * **Registered through the admin API, never an `infra/litellm/config.yaml` line**: a config-file
 * deployment cannot be deleted through the admin API (S3 §Evidence 7), and it would put a model that
 * cannot answer into every agent key on a machine with no provider key. **It names no `api_key`**:
 * the provider's key is LiteLLM's environment alone (`infra/compose.yaml`), measured to be read for
 * a DB-held deployment (sitting 9a, Step 1 (e)).
 *
 * **Registered under an id this process CHOOSES**, because an unknown provider is a `500` whose row
 * LiteLLM saves anyway and `/model/info` never lists — measured — so only that id can remove it.
 * **Registered twice**: once as the setting says, to read the price LiteLLM gives it, then PINNED at that
 * price (the review's I1). **The new one is in place before the old one goes** (I2): a setting LiteLLM
 * will not serve or cannot price is refused and the working model KEPT — unless the working model is
 * itself unpriced, which is never kept, because it would spend `$0`.
 *
 * Never a `.catch(() => undefined)`: a gateway that does not answer is THROWN, and the boot turns it
 * into its operator line.
 */
export async function ensureCapableModel(
  client: LiteLlmClient,
  setting: string | undefined,
): Promise<CapableModelResult> {
  const ours = await deployments(client)

  if (setting === undefined) {
    if (ours.length === 0) return { state: 'absent' }
    for (const d of ours) await remove(client, idOf(d))
    const previous = modelOf(ours[0]!)
    return { state: 'removed', ...(previous === undefined ? {} : { model: previous }) }
  }

  const [only] = ours
  if (
    ours.length === 1 &&
    modelOf(only!) === setting &&
    only!.model_info?.max_classification === CAPABLE_CLASSIFICATION &&
    pinned(only!) &&
    priced(only!)
  ) {
    return { state: 'unchanged', model: setting }
  }

  // What a refusal keeps: the working registrations, never one that spends $0.
  const refuse = async (reason: (kept: Deployment[]) => string) => {
    const kept = ours.filter(priced)
    for (const d of ours.filter((x) => !priced(x))) await remove(client, idOf(d))
    return { state: 'refused' as const, model: setting, reason: reason(kept) }
  }

  const asSet = await create(client, setting)
  if ('refusedWith' in asSet) {
    const status = asSet.refusedWith
    return refuse((kept) => unservedReason(setting, status, kept))
  }
  const cost = asSet.entry.model_info
  if (!priced(asSet.entry)) {
    await removeIfSaved(client, asSet.id)
    return refuse((kept) => unpricedReason(setting, kept))
  }
  const output = cost?.output_cost_per_token
  const atPrice = await create(client, setting, {
    input_cost_per_token: cost!.input_cost_per_token as number,
    ...(typeof output === 'number' && Number.isFinite(output) && output >= 0
      ? { output_cost_per_token: output }
      : {}),
  })
  await removeIfSaved(client, asSet.id)
  if ('refusedWith' in atPrice) {
    const status = atPrice.refusedWith
    return refuse((kept) => unservedReason(setting, status, kept))
  }
  if (!pinned(atPrice.entry) || !priced(atPrice.entry)) {
    await removeIfSaved(client, atPrice.id)
    return refuse((kept) => unpricedReason(setting, kept))
  }
  for (const d of ours) await remove(client, idOf(d))
  return { state: 'registered', model: setting }
}

export interface CapableFallbackResult {
  state: 'set' | 'unchanged' | 'removed' | 'absent' | 'refused'
  fallback?: string
  reason?: string
}

/** LiteLLM's own fallback endpoint for the capable model — only `general` fallbacks are ever set. */
const FALLBACK_PATH = `/fallback/${CAPABLE_MODEL_NAME}`
const GENERAL = { fallback_type: 'general' }

/** What the router answers the capable model with now; `[]` for none, which 1.98.0 answers `404` (measured). */
async function currentFallback(client: LiteLlmClient): Promise<string[]> {
  try {
    const body = await client.get<{ fallback_models?: unknown }>(FALLBACK_PATH, GENERAL)
    return Array.isArray(body.fallback_models)
      ? body.fallback_models.filter((m): m is string => typeof m === 'string')
      : []
  } catch (error) {
    if (error instanceof AiError && error.status === 404) return []
    throw error
  }
}

/** True when one was removed; `404` is *none configured* (measured), which is what removing wants. */
async function removeFallback(client: LiteLlmClient): Promise<boolean> {
  try {
    await client.delete(FALLBACK_PATH, GENERAL)
    return true
  } catch (error) {
    if (error instanceof AiError && error.status === 404) return false
    throw error
  }
}

const rank = (c: Classification): number => CLASSIFICATION_RANK[c]

/**
 * The most sensitive data a call to the capable model may carry: its own classification as the catalogue
 * lists it, and never less than the one this module registers.
 */
function capableFloor(snapshot: CatalogueSnapshot): Classification {
  return snapshot.models
    .filter((m) => m.name === CAPABLE_MODEL_NAME)
    .map((m) => m.maxClassification)
    .reduce((a, b) => (rank(b) > rank(a) ? b : a), CAPABLE_CLASSIFICATION)
}

/**
 * Why `name` may not answer for the capable model, or `undefined` when it may. **THE CLASSIFICATION IS THE
 * PLATFORM'S TO ENFORCE** (Spec action 8): LiteLLM falls back WITHOUT consulting a key's list of models —
 * measured at sittings 9a and 9b, a key holding only the primary was answered by the fallback — so a
 * fallback ranked below the capable model would carry its data where no key was allowed to send it. Every
 * deployment of the name must pass, because the router may pick any of them.
 */
function unfit(snapshot: CatalogueSnapshot, name: string): string | undefined {
  if (name === CAPABLE_MODEL_NAME) {
    return 'the capable model itself, which cannot fall back to itself'
  }
  if (snapshot.unclassified.includes(name)) {
    return 'which has no valid max_classification in the catalogue, so D17 refuses it to everyone'
  }
  const entries = snapshot.models.filter((m) => m.name === name)
  if (entries.length === 0) {
    return (
      'which is not in the model catalogue — name an entry of `infra/litellm/config.yaml` ' +
      "(`default-chat-onprem`, the on-premise model, is the default), or one LiteLLM's /model/info lists"
    )
  }
  if (entries.some((m) => m.kind === 'embedding')) {
    return 'an embedding model, which a chat cannot fall back to'
  }
  const floor = capableFloor(snapshot)
  const low = entries.find((m) => rank(m.maxClassification) < rank(floor))
  if (low !== undefined) {
    return (
      `classified '${low.maxClassification}' — below '${floor}', the capable model's. The gateway falls ` +
      "back without consulting a key's list of models, so it would carry " +
      `${floor} data where no key was allowed to send it`
    )
  }
  return undefined
}

/**
 * Makes LiteLLM answer `default-chat-large` with what `MANIFEST_CAPABLE_MODEL_FALLBACK` names whenever its
 * provider fails — the network off included (§7, §21, §26 as Spec action 8 amended them; the front-end
 * enablement plan's Task 12b). Called at every boot, straight AFTER `ensureCapableModel`, because LiteLLM
 * refuses a fallback for a model its router does not hold (`404`, measured).
 *
 * **With LiteLLM's own `POST /fallback`**, a `general` fallback held in its database — measured at sitting
 * 9b to survive `docker restart manifest-litellm`, to update in place, and to survive a repoint of the
 * primary, because it is keyed by NAME. **Never a `config.yaml` line**, for the capable model's own
 * reason. `context_window` and `content_policy` fallbacks are never set.
 *
 * **Removed whenever the setting is empty or the capable model is absent**, by `DELETE`: the entry
 * OUTLIVES its primary (measured), so a fallback left behind would re-attach silently to the next
 * registration of the name.
 *
 * **Reads the catalogue itself** rather than trusting `ensureCapableModel`'s state: a refused repoint
 * KEEPS the working model (sitting 9a's I2), so only the catalogue can say whether the name is served.
 * A setting that may not answer for it is refused and the working fallback KEPT if it still passes the
 * same check — never one that does not, which is removed, so the call fails rather than leaks. A
 * gateway that does not answer is THROWN.
 */
export async function ensureCapableFallback(
  client: LiteLlmClient,
  setting: string | undefined,
): Promise<CapableFallbackResult> {
  const snapshot = await loadModelCatalogue(client)
  const served =
    snapshot.models.some((m) => m.name === CAPABLE_MODEL_NAME) ||
    snapshot.unclassified.includes(CAPABLE_MODEL_NAME)
  if (setting === undefined || !served) {
    return (await removeFallback(client)) ? { state: 'removed' } : { state: 'absent' }
  }

  const current = await currentFallback(client)
  const refuse = async (why: string): Promise<CapableFallbackResult> => {
    const keep =
      current.length > 0 && current.every((m) => unfit(snapshot, m) === undefined)
    if (!keep && current.length > 0) await removeFallback(client)
    return {
      state: 'refused',
      fallback: setting,
      reason:
        `${CAPABLE_FALLBACK_SETTING} names '${setting}', ${why}.` +
        (keep
          ? ` '${current.join("', '")}' is kept as ${CAPABLE_MODEL_NAME}'s fallback until the setting names ` +
            'an entry that may answer for it.'
          : ` ${CAPABLE_MODEL_NAME} has no fallback meanwhile: when its provider fails, the call fails.`),
    }
  }

  const why = unfit(snapshot, setting)
  if (why !== undefined) return refuse(why)
  if (current.length === 1 && current[0] === setting) {
    return { state: 'unchanged', fallback: setting }
  }
  try {
    await client.post('/fallback', {
      model: CAPABLE_MODEL_NAME,
      fallback_models: [setting],
      fallback_type: 'general',
    })
  } catch (error) {
    if (!answered(error)) throw error
    return refuse(
      `which LiteLLM would not set as ${CAPABLE_MODEL_NAME}'s fallback (it answered HTTP ${error.status}) — ` +
        '`docker logs manifest-litellm` says why',
    )
  }
  return { state: 'set', fallback: setting }
}

/** What the boot did to the capable model and to its fallback — both on the boot line. */
export interface CapableAtBoot {
  capableModel: CapableModelResult['state'] | 'failed'
  capableFallback: CapableFallbackResult['state'] | 'failed'
}

/**
 * The code alone, and who failed to answer: an AiError's fields never carry the gateway's body (§14), and
 * anything else is named by its class rather than a message that might quote one.
 */
function failure(error: unknown): string {
  if (error instanceof CatalogueError) {
    return `${error.code}; LiteLLM listed no models — \`make doctor\` says whether it is up`
  }
  const code = error instanceof AiError ? error.code : (error as Error).name
  const heard = answered(error)
    ? `LiteLLM answered HTTP ${error.status} — \`docker logs manifest-litellm\` says why`
    : 'LiteLLM did not answer — `make doctor` says whether it is up'
  return `${code}; ${heard}`
}

/**
 * The boot's call (`index.ts`, straight AFTER `listen` — a boot that fails anywhere before it serves
 * changes nothing in the shared gateway; the review's I3): the capable model, then its fallback. Both are
 * OPTIONAL, so nothing here stops the platform — `default-chat` still serves (Decision: *an unpriced
 * capable model must not take the platform down*). But a refusal or a gateway that did not answer is ONE
 * operator line naming the setting, because a model nobody can see missing is indistinguishable from one
 * never asked for. **When the capable model's own step fails, its fallback is not tried** — the gateway
 * that did not answer one will not answer the other — and the one line says both may be as they were.
 * The states are the boot line's `capableModel` and `capableFallback`. `console.error`: this server runs
 * `logger: false`.
 */
export async function capableModelAtBoot(
  client: LiteLlmClient,
  setting: string | undefined,
  fallbackSetting: string | undefined,
): Promise<CapableAtBoot> {
  const said = `[boot] the capable model (${CAPABLE_MODEL_SETTING})`
  let capableModel: CapableModelResult['state']
  try {
    const result = await ensureCapableModel(client, setting)
    if (result.state === 'refused') console.error(`${said} was refused: ${result.reason}`)
    capableModel = result.state
  } catch (error) {
    console.error(
      `${said} could not be set to '${setting ?? '(unset)'}': ${failure(error)}. ` +
        `${CAPABLE_MODEL_NAME} and its fallback may still be as they were before this boot, and the next ` +
        'boot tries again.',
    )
    return { capableModel: 'failed', capableFallback: 'failed' }
  }

  const fell = `[boot] the capable model's fallback (${CAPABLE_FALLBACK_SETTING})`
  try {
    const result = await ensureCapableFallback(client, fallbackSetting)
    if (result.state === 'refused') console.error(`${fell} was refused: ${result.reason}`)
    return { capableModel, capableFallback: result.state }
  } catch (error) {
    console.error(
      `${fell} could not be set to '${fallbackSetting ?? '(none)'}': ${failure(error)}. ` +
        `${CAPABLE_MODEL_NAME}'s fallback may still be as it was before this boot, and the next boot tries again.`,
    )
    return { capableModel, capableFallback: 'failed' }
  }
}
