import { CLASSIFICATION_RANK, type Classification } from '../spec/index.js'
import type { LiteLlmClient } from './client.js'

/**
 * D17's catalogue (P4b Task 6): which logical models exist, and the most sensitive
 * data each may process. Read from LiteLLM's `/model/info` — the only surface that
 * carries `max_classification` — with the master key.
 *
 * `api/routes/projects.ts` used to restate this as an array. That was a second
 * source of truth for the check that turns "a privacy incident at runtime" (§7) into
 * a validation message, so it is gone, and this is the one producer.
 */
export interface ModelEntry {
  name: string
  maxClassification: Classification
  kind: 'chat' | 'embedding'
}

/**
 * What `ServerDeps` holds. `enabled` is false only under `MANIFEST_AI_ENABLED=0`
 * (sitting 4's decision, finding 38), and a caller reads it BEFORE `get()`: the
 * disabled catalogue refuses to be read rather than answering with no models.
 */
export interface ModelCatalogue {
  readonly enabled: boolean
  get(): Promise<ModelEntry[]>
}

export const CATALOGUE_CODES = {
  UNCLASSIFIED: 'AI_CATALOGUE_UNCLASSIFIED',
  EMPTY: 'AI_CATALOGUE_EMPTY',
  DISABLED: 'AI_CATALOGUE_DISABLED',
} as const

export class CatalogueError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint: string,
  ) {
    super(message)
    this.name = 'CatalogueError'
  }
}

/**
 * The part of `/model/info` this module reads. Everything else — 115 keys per
 * entry, measured 2026-09-07, including every `api_base` and per-token cost — is
 * dropped here and never passed on.
 */
interface ModelInfoResponse {
  data?: {
    model_name: string
    model_info?: { max_classification?: unknown; mode?: unknown }
  }[]
}

export async function loadModelCatalogue(client: LiteLlmClient): Promise<ModelEntry[]> {
  const body = await client.get<ModelInfoResponse>('/model/info')
  const entries = (body.data ?? []).map((row): ModelEntry => {
    const classification = row.model_info?.max_classification
    // An OWN key of the rank table — not a truthiness test, and not `in`, which finds
    // `toString` on the prototype. A typo in config.yaml is as unclassified as no
    // value at all, and defaulting either is failing open.
    if (
      typeof classification !== 'string' ||
      !Object.hasOwn(CLASSIFICATION_RANK, classification)
    ) {
      throw new CatalogueError(
        CATALOGUE_CODES.UNCLASSIFIED,
        `the model '${row.model_name}' carries no max_classification`,
        'Every catalogue entry needs `model_info.max_classification` (D17). Add it in ' +
          'infra/litellm/config.yaml, or on the model in the admin API. The platform ' +
          'refuses to guess: a wrong guess sends personal information off-premise.',
      )
    }
    return {
      name: row.model_name,
      maxClassification: classification as Classification,
      // NOT `mode === 'chat'`. Measured 2026-09-07: LiteLLM 1.98.0 returns
      // `mode: null` for a chat entry; only `default-embed` names its mode.
      kind: row.model_info?.mode === 'embedding' ? 'embedding' : 'chat',
    }
  })
  if (entries.length === 0) {
    throw new CatalogueError(
      CATALOGUE_CODES.EMPTY,
      'the model catalogue is empty',
      'LiteLLM returned no models. Check `make doctor`; if the platform is up, ' +
        'infra/litellm/config.yaml declares the bootstrap set and `make up` loads it. ' +
        'An empty catalogue is refused rather than returned, because returning it ' +
        'fails every spec with a message that blames the faculty member.',
    )
  }
  return entries
}

/**
 * Long enough that a console validating on every keystroke is one read a minute;
 * short enough that a model added through the admin API is usable without a restart.
 */
const DEFAULT_TTL_MS = 60_000

export function createCatalogueCache(
  client: LiteLlmClient,
  ttlMs: number = DEFAULT_TTL_MS,
): ModelCatalogue {
  let cached: { entries: ModelEntry[]; at: number } | undefined
  let inFlight: Promise<ModelEntry[]> | undefined

  return {
    enabled: true,
    get(): Promise<ModelEntry[]> {
      if (cached !== undefined && Date.now() - cached.at < ttlMs) {
        return Promise.resolve(cached.entries)
      }
      // A FAILURE IS NEVER CACHED: only a resolved read is stored, and the in-flight
      // promise is cleared either way, so the next caller after an outage reads again.
      inFlight ??= loadModelCatalogue(client)
        .then((entries) => {
          // Frozen: every validation shares this array, and one caller sorting it in
          // place would reorder the catalogue for all of them.
          const frozen = Object.freeze(entries.map((entry) => Object.freeze(entry)))
          cached = { entries: frozen as ModelEntry[], at: Date.now() }
          return cached.entries
        })
        .finally(() => {
          inFlight = undefined
        })
      return inFlight
    },
  }
}

/**
 * `MANIFEST_AI_ENABLED=0`: no client exists, so nothing can be fetched. A spec that
 * declares `ai.models` is refused at validation with `SPEC_AI_DISABLED`, which
 * names the platform setting rather than the faculty member's manifest.
 */
export function disabledCatalogue(): ModelCatalogue {
  return {
    enabled: false,
    get: () =>
      Promise.reject(
        new CatalogueError(
          CATALOGUE_CODES.DISABLED,
          'AI is switched off on this control plane',
          'MANIFEST_AI_ENABLED=0. Check `catalogue.enabled` before reading: a disabled ' +
            'catalogue is not an empty one.',
        ),
      ),
  }
}
