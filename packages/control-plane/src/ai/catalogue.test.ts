import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiteLlmClient } from './client.js'
import {
  CatalogueError,
  createCatalogueCache,
  disabledCatalogue,
  loadModelCatalogue,
} from './catalogue.js'

/** Trimmed from a real /model/info, 2026-09-07. The real one has 115 keys per entry. */
const RESPONSE = {
  data: [
    {
      model_name: 'default-chat',
      model_info: {
        max_classification: 'internal',
        mode: null,
        db_model: false,
        id: 'cf16',
        input_cost_per_token: 1e-6,
      },
    },
    {
      model_name: 'default-chat-onprem',
      model_info: {
        max_classification: 'confidential',
        mode: null,
        db_model: false,
        id: '86ec',
      },
    },
    {
      model_name: 'default-embed',
      model_info: {
        max_classification: 'internal',
        mode: 'embedding',
        db_model: false,
        id: '450e',
      },
    },
  ],
}

// `as unknown as`: `LiteLlmClient.get` is generic, and a `vi.fn(async () => body)`
// returns `unknown` where it wants `T` — TS2345 under `tsc`, invisible to Vitest,
// which strips types (pre-flight 35).
const clientReturning = (body: unknown) =>
  ({ get: vi.fn(async () => body), post: vi.fn() }) as unknown as LiteLlmClient

afterEach(() => {
  vi.useRealTimers()
})

describe('D17 model catalogue', () => {
  it('reads max_classification and calls a null-mode entry a CHAT model', async () => {
    // Measured 2026-09-07: both chat entries return mode: null. `mode === 'chat'`
    // yields an EMPTY catalogue, every spec then fails SPEC_MODEL_UNKNOWN, and the
    // symptom reads as a LiteLLM outage rather than a filter bug.
    const entries = await loadModelCatalogue(clientReturning(RESPONSE))
    expect(entries).toEqual([
      { name: 'default-chat', maxClassification: 'internal', kind: 'chat' },
      { name: 'default-chat-onprem', maxClassification: 'confidential', kind: 'chat' },
      { name: 'default-embed', maxClassification: 'internal', kind: 'embedding' },
    ])
  })

  it('projects THREE fields and carries nothing else', async () => {
    // The real response holds every api_base and every per-token cost. Handing
    // that object to checkPolicy would put the provider topology inside a
    // validation context, and from there into an error hint.
    const [entry] = await loadModelCatalogue(clientReturning(RESPONSE))
    expect(Object.keys(entry!).sort()).toEqual(['kind', 'maxClassification', 'name'])
  })

  it('REFUSES an entry with no max_classification rather than defaulting one', async () => {
    // Fail closed. P4a spent a task on `core:AttributeLimit` failing open; a
    // defaulted classification here lets a `confidential` app resolve an
    // off-premise model, which §7 calls "a privacy incident at runtime".
    const body = { data: [{ model_name: 'rogue', model_info: { mode: null } }] }
    // The CODE, not a regex over the message: the plan's `toThrow(/AI_CATALOGUE_…/)`
    // was RED against its own CatalogueError, whose message carries no code (sitting
    // 4, finding 44) — and the message reaches a client's error envelope, beside the
    // code rather than prefixed with it.
    await expect(loadModelCatalogue(clientReturning(body))).rejects.toMatchObject({
      code: 'AI_CATALOGUE_UNCLASSIFIED',
    })
  })

  it('refuses a classification that is not one of §7’s three', async () => {
    // A typo in config.yaml — `confidental` — is as unclassified as no value at all.
    const body = {
      data: [{ model_name: 'typo', model_info: { max_classification: 'confidental' } }],
    }
    await expect(loadModelCatalogue(clientReturning(body))).rejects.toMatchObject({
      code: 'AI_CATALOGUE_UNCLASSIFIED',
    })
  })

  it('refuses an empty catalogue rather than returning one', async () => {
    // An empty catalogue is indistinguishable from "no models are permitted" and
    // makes every spec fail with a message blaming the faculty member.
    await expect(loadModelCatalogue(clientReturning({ data: [] }))).rejects.toMatchObject(
      { code: 'AI_CATALOGUE_EMPTY' },
    )
  })

  it('caches, and does not cache a failure', async () => {
    // Validation happens on every spec push; a fetch per push is a fetch per
    // keystroke in a console. But caching a transient failure would keep an app
    // un-deployable after the gateway came back.
    const client = { get: vi.fn().mockResolvedValueOnce(RESPONSE), post: vi.fn() }
    const cache = createCatalogueCache(client as never, 60_000)
    await cache.get()
    await cache.get()
    expect(client.get).toHaveBeenCalledTimes(1)

    const flaky = {
      get: vi
        .fn()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce(RESPONSE),
      post: vi.fn(),
    }
    const second = createCatalogueCache(flaky as never, 60_000)
    await expect(second.get()).rejects.toThrow()
    await expect(second.get()).resolves.toHaveLength(3)
  })

  it('reads again once the TTL has passed', async () => {
    // A model added through the admin API has to become usable without a restart.
    vi.useFakeTimers()
    const client = { get: vi.fn().mockResolvedValue(RESPONSE), post: vi.fn() }
    const cache = createCatalogueCache(client as never, 60_000)
    await cache.get()
    vi.advanceTimersByTime(60_001)
    await cache.get()
    expect(client.get).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight read between concurrent callers', async () => {
    const client = { get: vi.fn().mockResolvedValue(RESPONSE), post: vi.fn() }
    const cache = createCatalogueCache(client as never, 60_000)
    await Promise.all([cache.get(), cache.get(), cache.get()])
    expect(client.get).toHaveBeenCalledTimes(1)
  })
})

describe('a control plane with AI switched off (MANIFEST_AI_ENABLED=0)', () => {
  it('says so, and REFUSES to be read rather than answering with no models', async () => {
    // Sitting 4's decision (finding 38). A disabled catalogue that resolved to []
    // would reach checkPolicy as "no model is permitted" and fail every spec
    // declaring one with SPEC_MODEL_UNKNOWN and "Available models: " — blaming the
    // faculty member for a platform setting. The caller checks `enabled`; one that
    // forgets fails loudly here instead.
    const catalogue = disabledCatalogue()
    expect(catalogue.enabled).toBe(false)
    await expect(catalogue.get()).rejects.toBeInstanceOf(CatalogueError)
    await expect(catalogue.get()).rejects.toMatchObject({ code: 'AI_CATALOGUE_DISABLED' })
  })

  it('an ENABLED catalogue says so too', () => {
    expect(createCatalogueCache(clientReturning(RESPONSE)).enabled).toBe(true)
  })
})
