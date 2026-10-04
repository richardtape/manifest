/**
 * WHERE A MODEL SETTING IS ANSWERED (§7, §21, §26 as the UBC AI Gateway plan's Spec action 1 amended them;
 * that plan's Task 2). A setting that begins `ubc-ai-gateway/` names a model UBC's AI Gateway serves — a
 * LiteLLM proxy LTIC runs — and LiteLLM reaches it at the gateway's address with the gateway's key. THE KEY
 * TRAVELS AS A REFERENCE, `os.environ/<name>`, which LiteLLM resolves from its OWN environment per call
 * (measured, `[M3]`: `/model/info` lists no `api_key`, and the stored row decrypts to the reference), so
 * neither this process nor LiteLLM's database ever holds the value. Every other setting is a LiteLLM model
 * string, passed through unchanged — `openai/<model>` still reaches OpenAI directly with LiteLLM's
 * `OPENAI_API_KEY`, which stays as a backup (Rich, 2026-10-03). `openai/`, not `litellm_proxy/`, because
 * every behaviour of the fallback guard and F8 was measured on LiteLLM's OpenAI provider, and `[M7]` found
 * `litellm_proxy/` no safer: both send `OPENAI_API_KEY` for a reference that resolves to nothing (Decision 2).
 */
export const GATEWAY_PREFIX = 'ubc-ai-gateway/'

/** The key's NAME in LiteLLM's environment — `infra/compose.yaml` hands it to LiteLLM alone. Never its value. */
export const GATEWAY_KEY_ENV = 'UBC_AI_GATEWAY_API_KEY'

/**
 * How long LiteLLM waits for the gateway, per ATTEMPT, before the fallback answers (Decision 12). Without it a
 * black-holed route holds a caller up to LiteLLM's 600 s a try. The longest legitimate answer measured is
 * 35.2 s — `gpt-6-luna`, ~1,500 words not streamed, 2,963 tokens (`[M2]`, 2026-10-03) — and a stream's first
 * frame came at 13.0 s; 60 s is that with ~70% headroom.
 *
 * THE TRADE-OFF (accepted by the coordinator, the plan's sitting 2): at `[M2]`'s ~85 tokens a second, a
 * NON-streamed answer longer than about 5,000 tokens is cut off and answered by the on-premise fallback instead.
 * The faculty front-end's agents STREAM, where the wait is for the stream's start (13.0 s measured) rather than
 * its whole — that a healthy stream longer than 60 s in all is never cut is NOT measured. An app's own
 * non-streamed calls are the ones it can cut. And with no retries (below), one transient gateway 5xx goes
 * straight to the fallback.
 */
export const GATEWAY_TIMEOUT_S = 60

/**
 * Retries per call, set WITH the timeout (`[M3]`, F12): LiteLLM retries twice by default and `timeout` is per
 * attempt, so a stalled gateway held a caller ~3× the timeout (`timeout: 2` → `408` after ~10.8 s; with
 * `num_retries: 0`, ~2.05 s). None: the capable model's fallback IS the retry, and it is on other hardware.
 */
export const GATEWAY_NUM_RETRIES = 0

export const gatewayKeyRef = (envName: string = GATEWAY_KEY_ENV): string =>
  `os.environ/${envName}`

export interface Gateway {
  /** `MANIFEST_UBC_AI_GATEWAY_URL`: where LiteLLM reaches it, `/v1` included. */
  url: string
  /** What a registration names as its key: `gatewayKeyRef()` in production; a test names a harmless variable. */
  keyRef: string
  /** Whether `.env` carried a non-empty key when this process started. The value is never kept. */
  keyInEnv: boolean
}

/** What a registration sends as `litellm_params` beside any price. */
export interface ProviderParams {
  model: string
  api_base?: string
  api_key?: string
  timeout?: number
  num_retries?: number
}

/**
 * `failClosed`: the caller REMOVES every gateway registration it owns rather than keeping it (Decision 4) — a
 * gateway registration with no key can only fail silently (a `401` the fallback hides), or send LiteLLM's
 * other provider key to UBC (`[M7]`: an empty or unresolved reference sends `OPENAI_API_KEY`).
 */
export type Resolved = { params: ProviderParams } | { refused: string; failClosed?: true }

export const viaGateway = (setting: string): boolean => setting.startsWith(GATEWAY_PREFIX)

export function resolveSetting(
  settingName: string,
  setting: string,
  gateway?: Gateway,
): Resolved {
  if (!viaGateway(setting)) return { params: { model: setting } }
  const name = setting.slice(GATEWAY_PREFIX.length)
  if (name === '') {
    return { refused: `${settingName} names UBC's AI Gateway but no model on it.` }
  }
  if (gateway === undefined) {
    return {
      refused: `${settingName} names '${setting}', and this control plane has no AI Gateway configured.`,
    }
  }
  if (!gateway.keyInEnv) {
    return {
      refused:
        `${settingName} names '${setting}', but ${GATEWAY_KEY_ENV} is not in .env, so every gateway ` +
        'registration is removed rather than kept — LiteLLM would reach the gateway with no key of its own — ' +
        'add it to .env, run `make up` so LiteLLM is created with it, then restart this control plane.',
      failClosed: true,
    }
  }
  return {
    params: {
      model: `openai/${name}`,
      api_base: gateway.url,
      api_key: gateway.keyRef,
      timeout: GATEWAY_TIMEOUT_S,
      num_retries: GATEWAY_NUM_RETRIES,
    },
  }
}
