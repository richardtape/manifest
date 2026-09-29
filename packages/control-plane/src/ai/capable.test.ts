import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiError } from './errors.js'
import { loadModelCatalogue } from './catalogue.js'
import {
  CAPABLE_MODEL_NAME,
  capableModelAtBoot,
  ensureCapableFallback,
  ensureCapableModel,
} from './capable.js'
import { agentModelsFor } from './models.js'
import { fakeLiteLlm, type FakeLiteLlm } from './testing.js'

const SETTING = 'openai/gpt-6-luna'

/** The deployments named `default-chat-large`, as the gateway holds them — served or not. */
const capable = (lite: FakeLiteLlm) =>
  [...lite.deployments.values()].filter((d) => d.modelName === CAPABLE_MODEL_NAME)

/** A registration as sitting 9a's first commit left one: priced by LiteLLM's map, not pinned. */
async function unpinned(lite: FakeLiteLlm, model: string): Promise<void> {
  await lite.post('/model/new', {
    model_name: CAPABLE_MODEL_NAME,
    litellm_params: { model },
    model_info: { id: 'manifest-capable-unpinned', max_classification: 'internal' },
  })
}

describe('the capable model (the front-end enablement plan’s Task 12a)', () => {
  it('registers default-chat-large at internal from the setting, naming no key', async () => {
    const lite = fakeLiteLlm()
    const result = await ensureCapableModel(lite, SETTING)
    expect(result).toEqual({ state: 'registered', model: SETTING })

    const creates = lite.calls.filter((c) => c.path === '/model/new')
    expect(creates.length).toBeGreaterThan(0)
    for (const create of creates) {
      expect(create.body).toMatchObject({
        model_name: 'default-chat-large',
        litellm_params: { model: SETTING },
        model_info: {
          id: expect.stringMatching(/^manifest-capable-/),
          max_classification: 'internal',
        },
      })
      // The provider's key is LiteLLM's alone: nothing this process sends may carry one.
      expect(JSON.stringify(create.body)).not.toMatch(/api_key/i)
    }
    expect(capable(lite)).toHaveLength(1)
  })

  it('pins the price LiteLLM reported onto what it registers — so an offline restart of LiteLLM cannot unprice it', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, SETTING)
    const [registered] = capable(lite)
    expect(registered!.inputCostPerToken).toBe(1e-7)
    expect(registered!.outputCostPerToken).toBe(5e-7)
    // A LiteLLM restarted with the network off: its map no longer prices the model.
    lite.price(SETTING, 0)
    expect(await ensureCapableModel(lite, SETTING)).toEqual({
      state: 'unchanged',
      model: SETTING,
    })
    const listed = await lite.get<{
      data: { model_name: string; model_info: { input_cost_per_token: number } }[]
    }>('/model/info')
    const entry = listed.data.find((d) => d.model_name === CAPABLE_MODEL_NAME)
    expect(entry!.model_info.input_cost_per_token).toBe(1e-7)
  })

  it('changes nothing when it is already registered as the setting says', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, SETTING)
    const before = lite.calls.length
    expect(await ensureCapableModel(lite, SETTING)).toEqual({
      state: 'unchanged',
      model: SETTING,
    })
    expect(lite.calls.slice(before).map((c) => c.path)).toEqual(['/model/info'])
  })

  it('re-registers, pinned, a registration LiteLLM prices but that was never pinned', async () => {
    const lite = fakeLiteLlm()
    await unpinned(lite, SETTING)
    expect(await ensureCapableModel(lite, SETTING)).toEqual({
      state: 'registered',
      model: SETTING,
    })
    const now = capable(lite)
    expect(now).toHaveLength(1)
    expect(now[0]!.id).not.toBe('manifest-capable-unpinned')
    expect(now[0]!.inputCostPerToken).toBe(1e-7)
  })

  it('repoints the ONE deployment when the setting changes — the new one pinned BEFORE the old one goes', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, SETTING)
    const [old] = capable(lite)
    const before = lite.calls.length
    expect(await ensureCapableModel(lite, 'openai/gpt-6-sol')).toEqual({
      state: 'registered',
      model: 'openai/gpt-6-sol',
    })
    const now = capable(lite)
    expect(now).toHaveLength(1)
    expect(now[0]!.model).toBe('openai/gpt-6-sol')
    expect(now[0]!.id).not.toBe(old!.id)
    const calls = lite.calls.slice(before)
    const pinnedAt = calls.findIndex(
      (c) =>
        c.path === '/model/new' &&
        (c.body?.litellm_params as { input_cost_per_token?: number })
          .input_cost_per_token !== undefined,
    )
    const oldGoneAt = calls.findIndex(
      (c) => c.path === '/model/delete' && c.body?.id === old!.id,
    )
    expect(pinnedAt).toBeGreaterThanOrEqual(0)
    expect(oldGoneAt).toBeGreaterThan(pinnedAt)
  })

  it('removes it when the setting is empty, and answers absent when there was nothing', async () => {
    const lite = fakeLiteLlm()
    expect(await ensureCapableModel(lite, undefined)).toEqual({ state: 'absent' })
    await ensureCapableModel(lite, SETTING)
    expect(await ensureCapableModel(lite, undefined)).toEqual({
      state: 'removed',
      model: SETTING,
    })
    expect(capable(lite)).toEqual([])
    // The catalogue config.yaml declares is untouched.
    expect([...lite.deployments.values()].filter((d) => !d.dbModel)).toHaveLength(5)
  })

  it('refuses a model LiteLLM cannot price — deletes what it registered, and says so', async () => {
    const lite = fakeLiteLlm()
    // `openai/gpt-6-terra`'s shape, measured: registered, and priced at 0.
    const result = await ensureCapableModel(lite, 'openai/unpriced-model')
    expect(result.state).toBe('refused')
    expect(result.model).toBe('openai/unpriced-model')
    expect(result.reason).toContain('MANIFEST_CAPABLE_MODEL')
    expect(result.reason).toContain('cannot price')
    expect(capable(lite)).toEqual([])
    const listed = await lite.get<{ data: { model_name: string }[] }>('/model/info')
    expect(listed.data.map((d) => d.model_name)).not.toContain(CAPABLE_MODEL_NAME)
  })

  it('refuses, and removes, an UNPINNED registration whose price has gone — never keeps one spending $0', async () => {
    const lite = fakeLiteLlm()
    await unpinned(lite, SETTING)
    // A LiteLLM restarted with the network off: the map that priced it was never fetched.
    lite.price(SETTING, 0)
    const result = await ensureCapableModel(lite, SETTING)
    expect(result.state).toBe('refused')
    expect(capable(lite)).toEqual([])
  })

  it('refuses a provider LiteLLM will not serve — deletes the row it saved anyway, and names the model', async () => {
    const lite = fakeLiteLlm()
    // Measured: `unpriced/whatever` is a 500 whose row STAYS, absent from /model/info. The gateway
    // ANSWERED, so this is the setting's fault, not an outage.
    const result = await ensureCapableModel(lite, 'unpriced/whatever')
    expect(result.state).toBe('refused')
    expect(result.reason).toContain("'unpriced/whatever'")
    expect(result.reason).toContain('MANIFEST_CAPABLE_MODEL')
    expect(capable(lite)).toEqual([])
  })

  it('keeps the working model when a repoint names a model LiteLLM will not serve or cannot price, and says so', async () => {
    for (const typo of ['opneai/gpt-6-sol', 'openai/unpriced-model']) {
      const lite = fakeLiteLlm()
      await ensureCapableModel(lite, SETTING)
      const result = await ensureCapableModel(lite, typo)
      expect(result.state, typo).toBe('refused')
      expect(result.reason, typo).toContain(`'${SETTING}' is kept`)
      const left = capable(lite)
      expect(
        left.map((d) => [d.model, d.live]),
        typo,
      ).toEqual([[SETTING, true]])
    }
  })

  it('throws, keeping the working model, when the gateway stops answering mid-repoint', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, SETTING)
    lite.fail('/model/new', 0)
    await expect(ensureCapableModel(lite, 'openai/gpt-6-sol')).rejects.toBeInstanceOf(
      AiError,
    )
    expect(capable(lite).map((d) => d.model)).toEqual([SETTING])
  })

  it('throws when the gateway does not answer — never swallowed', async () => {
    const lite = fakeLiteLlm()
    lite.fail('/model/info', 503)
    await expect(ensureCapableModel(lite, SETTING)).rejects.toBeInstanceOf(AiError)
  })

  it('gives an agent on an internal project the capable model, and one on a confidential project only while the builder setting allows it', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, SETTING)
    const snapshot = await loadModelCatalogue(lite)
    expect(snapshot.models).toContainEqual({
      name: 'default-chat-large',
      maxClassification: 'internal',
      kind: 'chat',
    })
    expect(agentModelsFor(snapshot, 'internal', 'on-premise')).toContain(
      'default-chat-large',
    )
    expect(agentModelsFor(snapshot, 'public', 'on-premise')).toContain(
      'default-chat-large',
    )
    // Spec action 10 (Task 14a): a confidential project's BUILDER may call it while the setting is
    // `capable` (the default), and never under `on-premise`.
    expect(agentModelsFor(snapshot, 'confidential', 'capable')).toContain(
      'default-chat-large',
    )
    const onPremise = agentModelsFor(snapshot, 'confidential', 'on-premise')
    expect(onPremise).not.toContain('default-chat-large')
    // A positive control: the confidential floor still gets the on-premise models.
    expect(onPremise).toContain('default-chat-onprem')
  })
})

describe('the capable model at boot — never fatal, never silent', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  const lines = () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    return () => spy.mock.calls.map((call) => String(call[0]))
  }

  it('answers the state, and writes nothing when it registered', async () => {
    const written = lines()
    expect(
      (await capableModelAtBoot(fakeLiteLlm(), SETTING, undefined)).capableModel,
    ).toBe('registered')
    expect(written()).toEqual([])
  })

  it('writes ONE operator line naming the setting when the model is refused, and goes on', async () => {
    const written = lines()
    expect(
      (await capableModelAtBoot(fakeLiteLlm(), 'openai/unpriced-model', undefined))
        .capableModel,
    ).toBe('refused')
    expect(written()).toHaveLength(1)
    expect(written()[0]).toMatch(/^\[boot\] the capable model \(MANIFEST_CAPABLE_MODEL\)/)
    expect(written()[0]).toContain('cannot price')
  })

  it('writes ONE operator line with the code when the gateway fails, and goes on', async () => {
    const written = lines()
    const lite = fakeLiteLlm()
    lite.fail('/model/info', 503)
    expect((await capableModelAtBoot(lite, SETTING, undefined)).capableModel).toBe(
      'failed',
    )
    expect(written()).toHaveLength(1)
    expect(written()[0]).toMatch(/^\[boot\] the capable model \(MANIFEST_CAPABLE_MODEL\)/)
    expect(written()[0]).toContain('AI_BACKEND_UNAVAILABLE')
  })

  it('says LiteLLM did not answer only when it did not — an answered refusal is not an outage', async () => {
    const written = lines()
    const lite = fakeLiteLlm()
    lite.fail('/model/info', 0)
    expect((await capableModelAtBoot(lite, SETTING, undefined)).capableModel).toBe(
      'failed',
    )
    expect(written()[0]).toContain('LiteLLM did not answer')

    const refused = fakeLiteLlm()
    expect(
      (await capableModelAtBoot(refused, 'unpriced/whatever', undefined)).capableModel,
    ).toBe('refused')
    expect(written()[1]).not.toContain('did not answer')
    expect(written()[1]).toContain("'unpriced/whatever'")
  })
})

const FALLBACK = 'default-chat-onprem'
const FALLBACK_SETTING = 'MANIFEST_CAPABLE_MODEL_FALLBACK'

/** What LiteLLM's router holds as `default-chat-large`'s general fallback. */
const fallbackOf = (lite: FakeLiteLlm) =>
  lite.fallbacks.get('general')!.get(CAPABLE_MODEL_NAME)

/** A catalogue entry an operator added through the admin API — never answered, only listed. */
async function entry(
  lite: FakeLiteLlm,
  name: string,
  info: Record<string, unknown>,
): Promise<void> {
  await lite.post('/model/new', {
    model_name: name,
    litellm_params: { model: 'ollama_chat/qwen3.5:4b' },
    model_info: { id: `probe-${name}`, ...info },
  })
}

/** A gateway holding the capable model, registered as the boot registers it. */
async function withCapable(): Promise<FakeLiteLlm> {
  const lite = fakeLiteLlm()
  await ensureCapableModel(lite, SETTING)
  return lite
}

describe('the capable model’s fallback (the front-end enablement plan’s Task 12b)', () => {
  it('sets the on-premise model as default-chat-large’s general fallback, through LiteLLM’s own /fallback', async () => {
    const lite = await withCapable()
    expect(await ensureCapableFallback(lite, FALLBACK)).toEqual({
      state: 'set',
      fallback: FALLBACK,
    })
    const posted = lite.calls.filter((c) => c.method === 'POST' && c.path === '/fallback')
    expect(posted.map((c) => c.body)).toEqual([
      {
        model: 'default-chat-large',
        fallback_models: ['default-chat-onprem'],
        fallback_type: 'general',
      },
    ])
    expect(fallbackOf(lite)).toEqual([FALLBACK])
  })

  it('changes nothing when it is already set as the setting says', async () => {
    const lite = await withCapable()
    await ensureCapableFallback(lite, FALLBACK)
    const before = lite.calls.length
    expect(await ensureCapableFallback(lite, FALLBACK)).toEqual({
      state: 'unchanged',
      fallback: FALLBACK,
    })
    expect(lite.calls.slice(before).every((c) => c.method === 'GET')).toBe(true)
  })

  it('replaces it in place when the setting names another catalogue entry', async () => {
    const lite = await withCapable()
    await ensureCapableFallback(lite, FALLBACK)
    expect(await ensureCapableFallback(lite, 'default-chat-onprem-reasoning')).toEqual({
      state: 'set',
      fallback: 'default-chat-onprem-reasoning',
    })
    expect(fallbackOf(lite)).toEqual(['default-chat-onprem-reasoning'])
  })

  it('removes it when the setting is empty, and answers absent when there was nothing', async () => {
    const lite = await withCapable()
    expect(await ensureCapableFallback(lite, undefined)).toEqual({ state: 'absent' })
    await ensureCapableFallback(lite, FALLBACK)
    expect(await ensureCapableFallback(lite, undefined)).toEqual({ state: 'removed' })
    expect(fallbackOf(lite)).toBeUndefined()
  })

  it('removes it with the capable model — an entry outlives its primary and would re-attach to the next registration (measured)', async () => {
    const lite = await withCapable()
    await ensureCapableFallback(lite, FALLBACK)
    await ensureCapableModel(lite, undefined)
    expect(await ensureCapableFallback(lite, FALLBACK)).toEqual({ state: 'removed' })
    expect(fallbackOf(lite)).toBeUndefined()
    // A positive control: with no capable model, nothing is set either — and nothing is asked to be.
    expect(await ensureCapableFallback(lite, FALLBACK)).toEqual({ state: 'absent' })
    expect(lite.calls.some((c) => c.method === 'POST' && c.path === '/fallback')).toBe(
      true,
    )
    const before = lite.calls.length
    await ensureCapableFallback(lite, FALLBACK)
    expect(lite.calls.slice(before).some((c) => c.method === 'POST')).toBe(false)
  })

  it('refuses a fallback whose classification is below the capable model’s, an unclassified one, an embedding one, one the catalogue lacks and the capable model itself — setting nothing', async () => {
    const cases: [string, (lite: FakeLiteLlm) => Promise<void>, string][] = [
      [
        'probe-public-chat',
        (lite) => entry(lite, 'probe-public-chat', { max_classification: 'public' }),
        "classified 'public'",
      ],
      [
        'probe-unclassified',
        (lite) => entry(lite, 'probe-unclassified', {}),
        'max_classification',
      ],
      ['default-embed', async () => undefined, 'embedding'],
      ['default-chat-onprme', async () => undefined, 'not in the model catalogue'],
      [CAPABLE_MODEL_NAME, async () => undefined, 'itself'],
    ]
    for (const [setting, prepare, phrase] of cases) {
      const lite = await withCapable()
      await prepare(lite)
      const result = await ensureCapableFallback(lite, setting)
      expect(result.state, setting).toBe('refused')
      expect(result.fallback, setting).toBe(setting)
      expect(result.reason, setting).toContain(FALLBACK_SETTING)
      expect(result.reason, setting).toContain(`'${setting}'`)
      expect(result.reason, setting).toContain(phrase)
      expect(
        lite.calls.some((c) => c.method === 'POST' && c.path === '/fallback'),
        setting,
      ).toBe(false)
      expect(fallbackOf(lite), setting).toBeUndefined()
    }
    // A positive control: the same gateway sets a CONFIDENTIAL-rank on-premise chat model.
    const lite = await withCapable()
    expect((await ensureCapableFallback(lite, FALLBACK)).state).toBe('set')
  })

  it('refuses a public-rank fallback because the gateway falls back without consulting a key’s list of models', async () => {
    const lite = await withCapable()
    await entry(lite, 'probe-public-chat', { max_classification: 'public' })
    const result = await ensureCapableFallback(lite, 'probe-public-chat')
    expect(result.reason).toContain("below 'internal'")
    expect(result.reason).toContain('without consulting')
  })

  it('keeps a working fallback that still validates when a new setting is refused, and says so', async () => {
    const lite = await withCapable()
    await ensureCapableFallback(lite, FALLBACK)
    const result = await ensureCapableFallback(lite, 'default-chat-onprme')
    expect(result.state).toBe('refused')
    expect(result.reason).toContain(`'${FALLBACK}' is kept`)
    expect(fallbackOf(lite)).toEqual([FALLBACK])
    expect(lite.calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('removes a fallback that no longer validates — never calls it unchanged, never keeps it', async () => {
    for (const setting of ['probe-public-chat', 'default-chat-onprme']) {
      const lite = await withCapable()
      await entry(lite, 'probe-public-chat', { max_classification: 'public' })
      // Set at the gateway by hand, or by an older setting before the catalogue changed.
      await lite.post('/fallback', {
        model: CAPABLE_MODEL_NAME,
        fallback_models: ['probe-public-chat'],
        fallback_type: 'general',
      })
      const result = await ensureCapableFallback(lite, setting)
      expect(result.state, setting).toBe('refused')
      expect(result.reason, setting).not.toContain('is kept')
      expect(fallbackOf(lite), setting).toBeUndefined()
    }
  })

  it('answers a /fallback refusal the gateway GAVE as refused, naming its status', async () => {
    const lite = await withCapable()
    lite.fail('/fallback', 400)
    const result = await ensureCapableFallback(lite, FALLBACK)
    expect(result.state).toBe('refused')
    expect(result.reason).toContain('HTTP 400')
    expect(result.reason).toContain(FALLBACK_SETTING)
  })

  it('throws when the gateway does not answer — never swallowed', async () => {
    const lite = await withCapable()
    lite.fail('/model/info', 0)
    await expect(ensureCapableFallback(lite, FALLBACK)).rejects.toBeInstanceOf(AiError)
    const again = await withCapable()
    again.fail(`/fallback/${CAPABLE_MODEL_NAME}`, 0)
    await expect(ensureCapableFallback(again, FALLBACK)).rejects.toBeInstanceOf(AiError)
  })

  it('a key holding ONLY the capable model is answered by the fallback when its provider cannot answer (the fake copying the measurement)', async () => {
    const lite = await withCapable()
    await ensureCapableFallback(lite, FALLBACK)
    await lite.post('/user/new', { user_id: 'mf-person-u', max_budget: 1 })
    const { key } = await lite.post<{ key: string }>('/key/generate', {
      user_id: 'mf-person-u',
      key_alias: 'mf-agent-a',
      models: [CAPABLE_MODEL_NAME],
      duration: '600s',
      max_budget: 0.5,
    })
    expect(lite.use(key, CAPABLE_MODEL_NAME)).toEqual({ status: 200 })
    lite.unreachable(CAPABLE_MODEL_NAME)
    expect(lite.use(key, CAPABLE_MODEL_NAME)).toEqual({
      status: 200,
      model: 'ollama_chat/qwen3.5:4b',
      attemptedFallbacks: 1,
    })
    // The key may not call the fallback by NAME — only the gateway's fallback reaches it.
    expect(lite.use(key, FALLBACK)).toMatchObject({ status: 403 })
    await ensureCapableFallback(lite, undefined)
    expect(lite.use(key, CAPABLE_MODEL_NAME)).toEqual({ status: 500 })
  })
})

describe('the capable model and its fallback at boot — never fatal, never silent', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  const lines = () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    return () => spy.mock.calls.map((call) => String(call[0]))
  }

  it('answers both states, and writes nothing when both were set', async () => {
    const written = lines()
    expect(await capableModelAtBoot(fakeLiteLlm(), SETTING, FALLBACK)).toEqual({
      capableModel: 'registered',
      capableFallback: 'set',
    })
    expect(written()).toEqual([])
  })

  it('writes ONE operator line naming the fallback’s setting when it is refused, and goes on', async () => {
    const written = lines()
    expect(await capableModelAtBoot(fakeLiteLlm(), SETTING, 'default-embed')).toEqual({
      capableModel: 'registered',
      capableFallback: 'refused',
    })
    expect(written()).toHaveLength(1)
    expect(written()[0]).toMatch(
      /^\[boot\] the capable model's fallback \(MANIFEST_CAPABLE_MODEL_FALLBACK\)/,
    )
    expect(written()[0]).toContain('embedding')
  })

  it('does not try the fallback when the capable model’s own step failed — ONE line, which says so', async () => {
    const written = lines()
    const lite = fakeLiteLlm()
    lite.fail('/model/info', 503)
    expect(await capableModelAtBoot(lite, SETTING, FALLBACK)).toEqual({
      capableModel: 'failed',
      capableFallback: 'failed',
    })
    expect(written()).toHaveLength(1)
    expect(written()[0]).toContain('its fallback')
    expect(lite.calls.some((c) => c.path.startsWith('/fallback'))).toBe(false)
  })

  it('writes ONE line with the code when the fallback’s own step fails, the capable model registered', async () => {
    const written = lines()
    const lite = fakeLiteLlm()
    lite.fail(`/fallback/${CAPABLE_MODEL_NAME}`, 0)
    expect(await capableModelAtBoot(lite, SETTING, FALLBACK)).toEqual({
      capableModel: 'registered',
      capableFallback: 'failed',
    })
    expect(written()).toHaveLength(1)
    expect(written()[0]).toMatch(
      /^\[boot\] the capable model's fallback \(MANIFEST_CAPABLE_MODEL_FALLBACK\)/,
    )
    expect(written()[0]).toContain('AI_BACKEND_UNAVAILABLE')
    expect(written()[0]).toContain('LiteLLM did not answer')
  })

  it('with the capable model unset, removes both and says nothing', async () => {
    const written = lines()
    const lite = fakeLiteLlm()
    await capableModelAtBoot(lite, SETTING, FALLBACK)
    expect(await capableModelAtBoot(lite, undefined, FALLBACK)).toEqual({
      capableModel: 'removed',
      capableFallback: 'removed',
    })
    expect(fallbackOf(lite)).toBeUndefined()
    expect(written()).toEqual([])
  })
})
