import type { Classification } from '../spec/index.js'
import { capableModelAtBoot, type CapableAtBoot } from './capable.js'
import type { LiteLlmClient } from './client.js'
import { resolveSetting, type Gateway } from './providers.js'
import {
  ensureRegistered,
  failureOf,
  idOf,
  listDeployments,
  refuseKeeping,
  remove,
  unavailable,
  type Deployment,
  type Price,
  type RegistrationResult,
} from './registration.js'

/**
 * UBC'S AI GATEWAY'S OWN MODELS IN THE CATALOGUE (§7, §21, §26 as the UBC AI Gateway plan's Spec action 1 amended
 * them; that plan's Task 3 — Rich's Q1, 2026-10-03: *"New names from one setting"*). `MANIFEST_GATEWAY_MODELS` names
 * each as `<name>=ubc-ai-gateway/<model>@<classification>`, and every boot makes LiteLLM hold exactly those: each
 * registered through `ensureRegistered` under its own name and classification, at the gateway's address with its key
 * by reference (`ai/providers.ts`), and every one the setting no longer lists removed. **D17 then hands each to
 * whoever its classification allows**, with no code here (`ai/models.ts`): a `confidential` entry reaches a
 * `confidential` project's agent. **`default-chat-onprem` stays Ollama** — the capable model's fallback and the
 * offline floor — so a name the catalogue already holds is refused. **An entry has NO fallback**: with the network
 * off, a call to it fails.
 */

/** The setting, named in every refusal an operator reads. */
export const GATEWAY_MODELS_SETTING = 'MANIFEST_GATEWAY_MODELS'

/** What every id this module chooses begins with, so its cleanup never touches the capable model or a config entry. */
export const ID_PREFIX = 'manifest-gateway-'

/** The on-premise stand-in whose price a `confidential` gateway model LiteLLM cannot price is pinned at. */
const STAND_IN = 'default-chat-onprem'

/** One `MANIFEST_GATEWAY_MODELS` entry, as `loadConfig` parses it. */
export interface GatewayModel {
  name: string
  setting: string
  classification: Classification
}

export interface GatewayModelResult {
  name: string
  state: RegistrationResult['state']
  model?: string
  reason?: string
}

const ours = (d: Deployment): boolean => idOf(d).startsWith(ID_PREFIX)

/**
 * The on-premise stand-in's price, read from its CONFIG entry (`model_info.db_model === false`) — so no second
 * constant exists: `infra/litellm/config.yaml`'s `$1` / `$3` a million, synthetic, because an on-premise model has no
 * per-token price and `$0` binds no budget (its `:23-27`). `undefined` when the entry is missing or unpriced.
 */
export function standInPrice(listed: Deployment[]): Price | undefined {
  const entry = listed.find(
    (d) => d.model_name === STAND_IN && d.model_info?.db_model === false,
  )
  const input = entry?.model_info?.input_cost_per_token
  const output = entry?.model_info?.output_cost_per_token
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0) return undefined
  return {
    input_cost_per_token: input,
    ...(typeof output === 'number' && Number.isFinite(output) && output >= 0
      ? { output_cost_per_token: output }
      : {}),
  }
}

/**
 * Makes LiteLLM hold exactly `entries` — called at every boot, BEFORE the capable model's (so its fallback may name
 * one; the plan's I5). Every `manifest-gateway-` deployment whose name the setting no longer lists goes first. Then,
 * per entry: a name a deployment it does not own already holds is refused (and any of its own under that name
 * removed, so the router never shares the name); a setting `resolveSetting` refuses is refused — and on `failClosed`
 * (no key in `.env`) that entry's deployments are REMOVED rather than kept (Decision 4); otherwise it is registered,
 * pinned, and a `confidential` one LiteLLM cannot price pinned at the stand-in's price (Decision 6). One `/model/info`
 * read a call when nothing changes. A gateway that does not answer is THROWN.
 */
export async function ensureGatewayModels(
  client: LiteLlmClient,
  entries: GatewayModel[],
  gateway?: Gateway,
): Promise<{ models: GatewayModelResult[] }> {
  const listed = await listDeployments(client)
  const wanted = new Set(entries.map((e) => e.name))
  for (const d of listed.filter((x) => ours(x) && !wanted.has(x.model_name))) {
    await remove(client, idOf(d))
  }

  const models: GatewayModelResult[] = []
  for (const e of entries) {
    const owned = listed.filter((d) => d.model_name === e.name && ours(d))
    const said = (r: RegistrationResult): GatewayModelResult => ({ name: e.name, ...r })

    if (listed.some((d) => d.model_name === e.name && !ours(d))) {
      for (const d of owned) await remove(client, idOf(d))
      models.push({
        name: e.name,
        state: 'refused',
        model: e.setting,
        reason:
          `${GATEWAY_MODELS_SETTING} names '${e.name}', which the catalogue already holds — ` +
          '`infra/litellm/config.yaml`, or the capable model — so nothing was registered for it: name the ' +
          'gateway model something of its own.',
      })
      continue
    }

    const resolved = resolveSetting(GATEWAY_MODELS_SETTING, e.setting, gateway)
    if ('refused' in resolved) {
      let kept = owned
      if (resolved.failClosed === true) {
        for (const d of owned) await remove(client, idOf(d))
        kept = []
      }
      models.push(
        said(
          await refuseKeeping(
            client,
            kept,
            e.setting,
            (k) => resolved.refused + unavailable(e.name, k),
          ),
        ),
      )
      continue
    }

    const unpriced =
      e.classification === 'confidential' ? standInPrice(listed) : undefined
    models.push(
      said(
        await ensureRegistered(
          client,
          {
            name: e.name,
            owns: (d) => d.model_name === e.name && ours(d),
            idPrefix: ID_PREFIX,
            settingName: GATEWAY_MODELS_SETTING,
            setting: e.setting,
            params: resolved.params,
            classification: e.classification,
            ...(unpriced === undefined ? {} : { unpriced }),
          },
          owned,
        ),
      ),
    )
  }
  return { models }
}

/** What the boot did to the gateway's models — the boot line's `gatewayModels`. */
export type GatewayModelsAtBoot =
  { name: string; state: GatewayModelResult['state'] }[] | 'failed'

/**
 * The boot's call, in `capableModelAtBoot`'s shape: never fatal — `default-chat` still serves — and never silent: ONE
 * `[boot]` line per refused entry naming the setting and the entry, and ONE for a gateway that did not answer.
 * `console.error`: this server runs `logger: false`.
 */
export async function gatewayModelsAtBoot(
  client: LiteLlmClient,
  entries: GatewayModel[],
  gateway: Gateway,
): Promise<GatewayModelsAtBoot> {
  try {
    const { models } = await ensureGatewayModels(client, entries, gateway)
    for (const m of models) {
      if (m.state === 'refused') {
        console.error(
          `[boot] a gateway model (${GATEWAY_MODELS_SETTING}) '${m.name}' was refused: ${m.reason}`,
        )
      }
    }
    return models.map((m) => ({ name: m.name, state: m.state }))
  } catch (error) {
    console.error(
      `[boot] the gateway models (${GATEWAY_MODELS_SETTING}) could not be set: ${failureOf(error)}. They may ` +
        'still be as they were before this boot, and the next boot tries again.',
    )
    return 'failed'
  }
}

/** The platform's own models at boot: the gateway's, then the capable model and its fallback. */
export interface PlatformModelsAtBoot extends CapableAtBoot {
  gatewayModels: GatewayModelsAtBoot
}

/**
 * THE ORDER IS LOAD-BEARING (the plan's I5): the gateway's models FIRST, because `capableModelAtBoot` sets the
 * capable model's fallback and refuses a name not yet in the catalogue — so a gateway model registered after it
 * could never be that fallback on a fresh boot. A gateway-models step that fails never stops the capable model's.
 * `index.ts` calls this, straight after `listen`.
 */
export async function platformModelsAtBoot(
  client: LiteLlmClient,
  settings: {
    gatewayModels: GatewayModel[]
    capableModel: string | undefined
    capableFallback: string | undefined
  },
  gateway: Gateway,
): Promise<PlatformModelsAtBoot> {
  const gatewayModels = await gatewayModelsAtBoot(client, settings.gatewayModels, gateway)
  const capable = await capableModelAtBoot(
    client,
    settings.capableModel,
    settings.capableFallback,
    gateway,
  )
  return { gatewayModels, ...capable }
}
