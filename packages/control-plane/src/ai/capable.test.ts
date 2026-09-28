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

describe('the capable model (the front-end enablement plan’s Task 12a)', () => {
  it('registers default-chat-large at internal from the setting, naming no key', async () => {
    const lite = fakeLiteLlm()
    const result = await ensureCapableModel(lite, SETTING)
    expect(result).toEqual({ state: 'registered', model: SETTING })

    const creates = lite.calls.filter((c) => c.path === '/model/new')
    expect(creates).toHaveLength(1)
    const body = creates[0]!.body!
    expect(body).toEqual({
      model_name: 'default-chat-large',
      litellm_params: { model: SETTING },
      model_info: {
        id: expect.stringMatching(/^manifest-capable-/),
        max_classification: 'internal',
      },
    })
    // The provider's key is LiteLLM's alone: nothing this process sends may carry one.
    expect(JSON.stringify(body)).not.toMatch(/api_key/i)
    expect(capable(lite)).toHaveLength(1)
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

  it('repoints the ONE deployment when the setting changes', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, SETTING)
    const [old] = capable(lite)
    expect(await ensureCapableModel(lite, 'openai/gpt-6-sol')).toEqual({
      state: 'registered',
      model: 'openai/gpt-6-sol',
    })
    const now = capable(lite)
    expect(now).toHaveLength(1)
    expect(now[0]!.model).toBe('openai/gpt-6-sol')
    expect(now[0]!.id).not.toBe(old!.id)
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

  it('refuses, and removes, a registration whose price has gone — never keeps one spending $0', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, SETTING)
    // A LiteLLM restarted with the network off: the map that priced it was never fetched.
    lite.price(SETTING, 0)
    const result = await ensureCapableModel(lite, SETTING)
    expect(result.state).toBe('refused')
    expect(capable(lite)).toEqual([])
  })

  it('throws for a provider LiteLLM cannot serve — and deletes the row it saved anyway', async () => {
    const lite = fakeLiteLlm()
    // Measured: `unpriced/whatever` is a 500 whose row STAYS, absent from /model/info.
    await expect(ensureCapableModel(lite, 'unpriced/whatever')).rejects.toBeInstanceOf(
      AiError,
    )
    expect(capable(lite)).toEqual([])
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
})
