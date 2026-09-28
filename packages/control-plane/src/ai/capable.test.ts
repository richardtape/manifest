import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiError } from './errors.js'
import { loadModelCatalogue } from './catalogue.js'
import { CAPABLE_MODEL_NAME, capableModelAtBoot, ensureCapableModel } from './capable.js'
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

  it('gives an agent on an internal project the capable model, and one on a confidential project never', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, SETTING)
    const snapshot = await loadModelCatalogue(lite)
    expect(snapshot.models).toContainEqual({
      name: 'default-chat-large',
      maxClassification: 'internal',
      kind: 'chat',
    })
    expect(agentModelsFor(snapshot, 'internal')).toContain('default-chat-large')
    expect(agentModelsFor(snapshot, 'public')).toContain('default-chat-large')
    const confidential = agentModelsFor(snapshot, 'confidential')
    expect(confidential).not.toContain('default-chat-large')
    // A positive control: the confidential floor still gets the on-premise models.
    expect(confidential).toContain('default-chat-onprem')
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
    expect(await capableModelAtBoot(fakeLiteLlm(), SETTING)).toBe('registered')
    expect(written()).toEqual([])
  })

  it('writes ONE operator line naming the setting when the model is refused, and goes on', async () => {
    const written = lines()
    expect(await capableModelAtBoot(fakeLiteLlm(), 'openai/unpriced-model')).toBe(
      'refused',
    )
    expect(written()).toHaveLength(1)
    expect(written()[0]).toMatch(/^\[boot\] the capable model \(MANIFEST_CAPABLE_MODEL\)/)
    expect(written()[0]).toContain('cannot price')
  })

  it('writes ONE operator line with the code when the gateway fails, and goes on', async () => {
    const written = lines()
    const lite = fakeLiteLlm()
    lite.fail('/model/info', 503)
    expect(await capableModelAtBoot(lite, SETTING)).toBe('failed')
    expect(written()).toHaveLength(1)
    expect(written()[0]).toMatch(/^\[boot\] the capable model \(MANIFEST_CAPABLE_MODEL\)/)
    expect(written()[0]).toContain('AI_BACKEND_UNAVAILABLE')
  })

  it('says LiteLLM did not answer only when it did not — an answered refusal is not an outage', async () => {
    const written = lines()
    const lite = fakeLiteLlm()
    lite.fail('/model/info', 0)
    expect(await capableModelAtBoot(lite, SETTING)).toBe('failed')
    expect(written()[0]).toContain('LiteLLM did not answer')

    const refused = fakeLiteLlm()
    expect(await capableModelAtBoot(refused, 'unpriced/whatever')).toBe('refused')
    expect(written()[1]).not.toContain('did not answer')
    expect(written()[1]).toContain("'unpriced/whatever'")
  })
})
