import { randomUUID } from 'node:crypto'
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

/**
 * Rich, 2026-09-27: `internal` — the classification §7's catalogue already gives `default-chat`
 * (*"may route off-prem"*). `confidential` never leaves on-premise hardware.
 */
const CAPABLE_CLASSIFICATION = 'internal'

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

/**
 * The boot's call (`index.ts`, straight AFTER `listen` — a boot that fails anywhere before it serves
 * changes nothing in the shared gateway; the review's I3): the capable model is OPTIONAL, so nothing
 * here stops the platform — `default-chat` still serves (Decision: *an unpriced capable model must not
 * take the platform down*). But a refusal or a gateway that did not answer is ONE operator line naming
 * the setting, because a model nobody can see missing is indistinguishable from one never asked for. The
 * state is the boot line's `capableModel`. `console.error`: this server runs `logger: false`.
 */
export async function capableModelAtBoot(
  client: LiteLlmClient,
  setting: string | undefined,
): Promise<CapableModelResult['state'] | 'failed'> {
  const said = `[boot] the capable model (${CAPABLE_MODEL_SETTING})`
  try {
    const result = await ensureCapableModel(client, setting)
    if (result.state === 'refused') console.error(`${said} was refused: ${result.reason}`)
    return result.state
  } catch (error) {
    // The code alone: an AiError's fields never carry the gateway's body (§14), and anything else
    // is named by its class rather than a message that might quote one.
    const code = error instanceof AiError ? error.code : (error as Error).name
    const heard = answered(error)
      ? `LiteLLM answered HTTP ${error.status} — \`docker logs manifest-litellm\` says why`
      : 'LiteLLM did not answer — `make doctor` says whether it is up'
    console.error(
      `${said} could not be set to '${setting ?? '(unset)'}': ${code}; ${heard}. ` +
        `${CAPABLE_MODEL_NAME} may still be as it was before this boot, and the next boot tries again.`,
    )
    return 'failed'
  }
}
