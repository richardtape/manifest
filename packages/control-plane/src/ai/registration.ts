import { randomUUID } from 'node:crypto'
import type { Classification } from '../spec/index.js'
import type { LiteLlmClient } from './client.js'
import { AiError } from './errors.js'
import { viaGateway, type ProviderParams } from './providers.js'

/**
 * ONE WAY A MODEL THE PLATFORM CHOOSES ENTERS LiteLLM'S CATALOGUE (the UBC AI Gateway plan's Task 3, moved out of
 * `capable.ts` unchanged): the capable model and each of `MANIFEST_GATEWAY_MODELS`' entries go through
 * `ensureRegistered`, by name and classification. **Registered through the admin API, never a
 * `infra/litellm/config.yaml` line** — a config-file deployment cannot be deleted through the admin API (S3
 * §Evidence 7). **Under an id this process CHOOSES**, because an unknown provider is a `500` whose row LiteLLM saves
 * anyway and `/model/info` never lists — measured — so only that id can remove it. **Registered twice**: once as the
 * setting says, to read the price LiteLLM gives it, then PINNED at that price (the front-end enablement plan's
 * review, I1). **The new one is in place before the old one goes** (I2): a setting LiteLLM will not serve or cannot
 * price is refused and the working registration KEPT — unless it is itself unpriced, which is never kept, because it
 * would spend `$0`.
 */

/** The part of `/model/info` this module reads (measured, LiteLLM 1.98.0, the front-end enablement plan's sitting 9a). */
export interface Deployment {
  model_name: string
  litellm_params?: {
    model?: unknown
    /** The provider's address — a gateway registration names one; a direct one never does (`[M3]`). */
    api_base?: unknown
    input_cost_per_token?: unknown
    output_cost_per_token?: unknown
  }
  model_info?: {
    id?: unknown
    max_classification?: unknown
    db_model?: unknown
    input_cost_per_token?: unknown
    output_cost_per_token?: unknown
  }
}

/** A price as `litellm_params` carries it, in USD a token. */
export interface Price {
  input_cost_per_token: number
  output_cost_per_token?: number
}

/** What to make LiteLLM hold under one name. */
export interface Registration {
  /** The catalogue name: `default-chat-large`, or a `MANIFEST_GATEWAY_MODELS` entry's. */
  name: string
  /** Whether a listed deployment is one THIS registration manages — kept, replaced or removed by it. */
  owns: (d: Deployment) => boolean
  /** What every id this registration chooses begins with. */
  idPrefix: string
  /** The setting, named in every refusal an operator reads. */
  settingName: string
  /** The setting's own words, named in every refusal and answered as `model`. */
  setting: string
  /** What `/model/new` is sent as `litellm_params`, beside a price (`ai/providers.ts`'s `resolveSetting`). */
  params: ProviderParams
  classification: Classification
  /**
   * The price to pin when LiteLLM prices the model at `0` — set only where a `$0` price is the platform's to
   * replace (a `confidential` gateway model: on-premise hardware has no per-token price). Absent, `0` is refused.
   */
  unpriced?: Price
}

export interface RegistrationResult {
  state: 'registered' | 'unchanged' | 'refused'
  model: string
  reason?: string
}

export const idOf = (d: Deployment): string => String(d.model_info?.id)
export const modelOf = (d: Deployment): string | undefined =>
  typeof d.litellm_params?.model === 'string' ? d.litellm_params.model : undefined
export const apiBaseOf = (d: Deployment): string | undefined =>
  typeof d.litellm_params?.api_base === 'string' ? d.litellm_params.api_base : undefined
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * A price LiteLLM can charge. **A model it cannot price spends `$0` for ever**, so no agent
 * budget, session cap or intake month would ever bind on real money — measured at sitting 9a as
 * `0` for an `openai/*` model neither of its price maps knows, never `null`.
 */
export const priced = (d: Deployment): boolean =>
  positive(d.model_info?.input_cost_per_token)

/**
 * THE PRICE IS THE DEPLOYMENT'S OWN (sitting 9a's review, I1). LiteLLM prices `gpt-6-*` only from the
 * list it downloads at its own start with the network on, so a LiteLLM restarted OFFLINE under a
 * running control plane would serve the model at `$0` once the network came back. A price sent in
 * `litellm_params` overrides both of its lists, shows in `/model/info` and charges spend exactly
 * (measured: 19 × 5e-05 + 2 × 1e-04 = 0.00115). So what is registered carries the price LiteLLM itself
 * reported for the model — never a price this platform invents — and no restart can take it away.
 */
export const pinned = (d: Deployment): boolean =>
  positive(d.litellm_params?.input_cost_per_token)

/** Every deployment `/model/info` lists, served ones only (a saved-but-not-live row is never listed). */
export async function listDeployments(client: LiteLlmClient): Promise<Deployment[]> {
  const body = await client.get<{ data?: Deployment[] }>('/model/info')
  return body.data ?? []
}

export const remove = (client: LiteLlmClient, id: string) =>
  client.post('/model/delete', { id })

/**
 * The cleanup after a registration that failed, or a stand-in no longer needed. `400` is LiteLLM's answer
 * for an id its database does not hold (measured) — nothing was saved, which is what the cleanup wants.
 * Any other failure is the OPERATOR's to see, and never replaces the error the caller is about to throw.
 */
async function removeIfSaved(
  client: LiteLlmClient,
  name: string,
  id: string,
): Promise<void> {
  try {
    await remove(client, id)
  } catch (error) {
    if (error instanceof AiError && (error.status === 400 || error.status === 404)) return
    console.error(
      JSON.stringify({
        level: 'error',
        msg: `a failed registration of ${name} may have left a deployment in LiteLLM's database`,
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
export const answered = (error: unknown): error is AiError =>
  error instanceof AiError && error.status > 0

type Created = { entry: Deployment; id: string } | { refusedWith: number }

/**
 * One `/model/new` under an id this process chooses, read back from `/model/info`. A refusal the
 * gateway ANSWERED is returned, its saved-anyway row removed; an outage is thrown.
 */
async function create(
  client: LiteLlmClient,
  r: Registration,
  price?: Price,
): Promise<Created> {
  const id = `${r.idPrefix}${randomUUID()}`
  try {
    await client.post('/model/new', {
      model_name: r.name,
      litellm_params: { ...r.params, ...price },
      model_info: { id, max_classification: r.classification },
    })
  } catch (error) {
    await removeIfSaved(client, r.name, id)
    if (answered(error)) return { refusedWith: error.status }
    throw error
  }
  const entry = (await listDeployments(client)).find((d) => idOf(d) === id)
  if (entry === undefined) {
    await removeIfSaved(client, r.name, id)
    return { refusedWith: 0 }
  }
  return { entry, id }
}

/** What a refusal's last sentence says about the registration it kept, or that there is none. */
export const unavailable = (name: string, kept: Deployment[]): string => {
  const model = kept.map(modelOf).find((m) => m !== undefined)
  return model === undefined
    ? ` ${name} is unavailable meanwhile, and default-chat still serves.`
    : ` '${model}' is kept as ${name} until the setting names a model LiteLLM serves and prices.`
}

const unpricedReason = (r: Registration, kept: Deployment[]): string =>
  `${r.settingName} names '${r.setting}', which LiteLLM cannot price, so it was not registered: ` +
  'a model priced at $0 would never bind an agent budget, a session cap or the intake month. ' +
  'LiteLLM prices from the list it ships with and from the one it fetches at its own start when the ' +
  'network is on — restart LiteLLM with the network on (`docker restart manifest-litellm`), then this ' +
  'control plane; or name a model it prices.' +
  (viaGateway(r.setting)
    ? " LiteLLM prices a gateway model by the gateway's own name for it: the gateway's administrator " +
      'exposes it under its vendor name.'
    : '') +
  unavailable(r.name, kept)

const unservedReason = (r: Registration, status: number, kept: Deployment[]): string =>
  `${r.settingName} names '${r.setting}', which LiteLLM would not serve` +
  (status > 0 ? ` (it answered HTTP ${status})` : '') +
  ': check the provider prefix — `openai/<model>` direct, or `ubc-ai-gateway/<model>` — and that LiteLLM ' +
  "holds that provider's key " +
  '(`docker logs manifest-litellm` says why).' +
  unavailable(r.name, kept)

/**
 * What a refusal keeps: the working registrations, never one that spends `$0`, which is removed. `ours` is what the
 * registration owns NOW.
 */
export async function refuseKeeping(
  client: LiteLlmClient,
  ours: Deployment[],
  model: string,
  reason: (kept: Deployment[]) => string,
): Promise<RegistrationResult> {
  const kept = ours.filter(priced)
  for (const d of ours.filter((x) => !priced(x))) await remove(client, idOf(d))
  return { state: 'refused', model, reason: reason(kept) }
}

/**
 * Makes LiteLLM hold exactly `r` under `r.name`, given `ours` — the deployments `r.owns`, as just read from
 * `/model/info` (one read per call: the caller has already made it). `unchanged` when the one owned deployment is
 * already that model at that ADDRESS, at that classification, pinned and priced; otherwise registered, pinned, and
 * the old ones removed only after. Never a `.catch(() => undefined)`: a gateway that does not answer is THROWN.
 */
export async function ensureRegistered(
  client: LiteLlmClient,
  r: Registration,
  ours: Deployment[],
): Promise<RegistrationResult> {
  const refuse = (reason: (kept: Deployment[]) => string) =>
    refuseKeeping(client, ours, r.setting, reason)

  const [only] = ours
  if (
    ours.length === 1 &&
    modelOf(only!) === r.params.model &&
    apiBaseOf(only!) === r.params.api_base &&
    only!.model_info?.max_classification === r.classification &&
    pinned(only!) &&
    priced(only!)
  ) {
    return { state: 'unchanged', model: r.setting }
  }

  const asSet = await create(client, r)
  if ('refusedWith' in asSet) {
    const status = asSet.refusedWith
    return refuse((kept) => unservedReason(r, status, kept))
  }
  const cost = asSet.entry.model_info
  if (!priced(asSet.entry)) {
    await removeIfSaved(client, r.name, asSet.id)
    return refuse((kept) => unpricedReason(r, kept))
  }
  const output = cost?.output_cost_per_token
  const atPrice = await create(client, r, {
    input_cost_per_token: cost!.input_cost_per_token as number,
    ...(typeof output === 'number' && Number.isFinite(output) && output >= 0
      ? { output_cost_per_token: output }
      : {}),
  })
  await removeIfSaved(client, r.name, asSet.id)
  if ('refusedWith' in atPrice) {
    const status = atPrice.refusedWith
    return refuse((kept) => unservedReason(r, status, kept))
  }
  if (!pinned(atPrice.entry) || !priced(atPrice.entry)) {
    await removeIfSaved(client, r.name, atPrice.id)
    return refuse((kept) => unpricedReason(r, kept))
  }
  for (const d of ours) await remove(client, idOf(d))
  return { state: 'registered', model: r.setting }
}
