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
  litellm_params?: { model?: unknown }
  model_info?: {
    id?: unknown
    max_classification?: unknown
    input_cost_per_token?: unknown
  }
}

const idOf = (d: Deployment): string => String(d.model_info?.id)
const modelOf = (d: Deployment): string | undefined =>
  typeof d.litellm_params?.model === 'string' ? d.litellm_params.model : undefined

/**
 * A price LiteLLM can charge. **A model it cannot price spends `$0` for ever**, so no agent
 * budget, session cap or intake month would ever bind on real money — measured at sitting 9a as
 * `0` for an `openai/*` model neither of its price maps knows, never `null`.
 */
const priced = (d: Deployment): boolean => {
  const cost = d.model_info?.input_cost_per_token
  return typeof cost === 'number' && Number.isFinite(cost) && cost > 0
}

async function deployments(client: LiteLlmClient): Promise<Deployment[]> {
  const body = await client.get<{ data?: Deployment[] }>('/model/info')
  return (body.data ?? []).filter((d) => d.model_name === CAPABLE_MODEL_NAME)
}

const remove = (client: LiteLlmClient, id: string) => client.post('/model/delete', { id })

/**
 * The cleanup after a registration that failed. `400` is LiteLLM's answer for an id its database
 * does not hold (measured) — nothing was saved, which is what the cleanup wants. Any other failure
 * is the OPERATOR's to see, and never replaces the error the caller is about to throw.
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

const unpricedReason = (model: string): string =>
  `${CAPABLE_MODEL_SETTING} names '${model}', which LiteLLM cannot price, so it was not registered: ` +
  'a model priced at $0 would never bind an agent budget, a session cap or the intake month. ' +
  'LiteLLM prices from the list it ships with and from the one it fetches at its own start when the ' +
  'network is on — restart LiteLLM with the network on (`docker restart manifest-litellm`), then this ' +
  `control plane; or name a model it prices. ${CAPABLE_MODEL_NAME} is unavailable meanwhile, and ` +
  'default-chat still serves.'

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
    only!.model_info?.max_classification === CAPABLE_CLASSIFICATION
  ) {
    if (priced(only!)) return { state: 'unchanged', model: setting }
    // Its price has gone — a LiteLLM restarted with the network off. Kept, it would spend $0.
    await remove(client, idOf(only!))
    return { state: 'refused', model: setting, reason: unpricedReason(setting) }
  }

  for (const d of ours) await remove(client, idOf(d))
  const id = `manifest-capable-${randomUUID()}`
  try {
    await client.post('/model/new', {
      model_name: CAPABLE_MODEL_NAME,
      litellm_params: { model: setting },
      model_info: { id, max_classification: CAPABLE_CLASSIFICATION },
    })
  } catch (error) {
    await removeIfSaved(client, id)
    throw error
  }

  const registered = (await deployments(client)).find((d) => idOf(d) === id)
  if (registered === undefined || !priced(registered)) {
    await removeIfSaved(client, id)
    return { state: 'refused', model: setting, reason: unpricedReason(setting) }
  }
  return { state: 'registered', model: setting }
}

/**
 * The boot's call (`index.ts`, before `listen`): the capable model is OPTIONAL, so nothing here stops
 * the platform — `default-chat` still serves (Decision: *an unpriced capable model must not take the
 * platform down*). But a refusal or a gateway that did not answer is ONE operator line naming the
 * setting, because a model nobody can see missing is indistinguishable from one never asked for. The
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
    console.error(
      `${said} could not be set to '${setting ?? '(unset)'}': ${code}. ` +
        `${CAPABLE_MODEL_NAME} is as LiteLLM last held it; default-chat still serves. Restart this ` +
        'control plane once LiteLLM answers (`make doctor`).',
    )
    return 'failed'
  }
}
