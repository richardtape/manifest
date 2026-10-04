import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateSpec, type ValidationContext } from '../spec/index.js'
import { CAPABLE_MODEL_NAME, ensureCapableModel } from './capable.js'
import { loadModelCatalogue, type CatalogueSnapshot } from './catalogue.js'
import {
  ensureGatewayModels,
  gatewayModelsAtBoot,
  platformModelsAtBoot,
  type GatewayModel,
} from './gateway-models.js'
import { agentModelsFor } from './models.js'
import { gatewayKeyRef, type Gateway } from './providers.js'
import { fakeLiteLlm, type FakeLiteLlm } from './testing.js'

const GW: Gateway = {
  url: 'https://gw.example/v1',
  keyRef: gatewayKeyRef(),
  keyInEnv: true,
}

const ONPREM: GatewayModel = {
  name: 'ubc-onprem',
  setting: 'ubc-ai-gateway/qwen-x',
  classification: 'confidential',
}
const MINI: GatewayModel = {
  name: 'ubc-mini',
  setting: 'ubc-ai-gateway/gpt-6-mini',
  classification: 'internal',
}

/** Every deployment this module made — its ids begin `manifest-gateway-`. */
const gatewayDeployments = (lite: FakeLiteLlm) =>
  [...lite.deployments.values()].filter((d) => d.id.startsWith('manifest-gateway-'))

/** The config file's entries, as the fake seeds them — which the module must never touch. */
const configEntries = (lite: FakeLiteLlm) =>
  [...lite.deployments.values()].filter((d) => !d.dbModel)

describe('UBC’s AI Gateway’s own models (the UBC AI Gateway plan’s Task 3)', () => {
  it('registers each entry at its own classification, at the gateway’s address, the key by reference', async () => {
    const lite = fakeLiteLlm()
    lite.price('openai/qwen-x', 2e-7)
    const r = await ensureGatewayModels(lite, [ONPREM, MINI], GW)
    expect(r.models).toEqual([
      { name: 'ubc-onprem', state: 'registered', model: 'ubc-ai-gateway/qwen-x' },
      { name: 'ubc-mini', state: 'registered', model: 'ubc-ai-gateway/gpt-6-mini' },
    ])
    const made = gatewayDeployments(lite)
    expect(made.map((d) => d.modelName).sort()).toEqual(['ubc-mini', 'ubc-onprem'])
    for (const d of made) {
      expect(d.apiBase).toBe(GW.url)
      expect(d.apiKey).toBe('os.environ/UBC_AI_GATEWAY_API_KEY')
    }
    const byName = (n: string) => made.find((d) => d.modelName === n)!
    expect(byName('ubc-onprem').modelInfo.max_classification).toBe('confidential')
    expect(byName('ubc-onprem').model).toBe('openai/qwen-x')
    expect(byName('ubc-mini').modelInfo.max_classification).toBe('internal')
    // And unchanged on the next boot: one /model/info read, nothing made or removed.
    const before = lite.calls.length
    expect(
      (await ensureGatewayModels(lite, [ONPREM, MINI], GW)).models.map((m) => m.state),
    ).toEqual(['unchanged', 'unchanged'])
    expect(lite.calls.slice(before).map((c) => c.path)).toEqual(['/model/info'])
  })

  it('pins an unpriced CONFIDENTIAL entry at default-chat-onprem’s price — and refuses an unpriced internal one (Review Focus 4)', async () => {
    const lite = fakeLiteLlm()
    lite.price('openai/qwen-x', 0)
    lite.price('openai/alias-y', 0)
    const r = await ensureGatewayModels(
      lite,
      [
        {
          name: 'ubc-onprem',
          setting: 'ubc-ai-gateway/qwen-x',
          classification: 'confidential',
        },
        {
          name: 'ubc-alias',
          setting: 'ubc-ai-gateway/alias-y',
          classification: 'internal',
        },
      ],
      GW,
    )
    expect(r.models).toEqual([
      { name: 'ubc-onprem', state: 'registered', model: 'ubc-ai-gateway/qwen-x' },
      expect.objectContaining({ name: 'ubc-alias', state: 'refused' }),
    ])
    expect(r.models[1]!.reason).toContain('cannot price')
    const onprem = gatewayDeployments(lite).find((d) => d.modelName === 'ubc-onprem')!
    // infra/litellm/config.yaml's default-chat-onprem: $1 / $3 a million, the on-premise stand-in's synthetic price.
    expect([onprem.inputCostPerToken, onprem.outputCostPerToken]).toEqual([1e-6, 3e-6])
    expect(
      gatewayDeployments(lite).filter((d) => d.modelName === 'ubc-alias'),
    ).toHaveLength(0)
  })

  it('pins an unpriced very-high entry — the U1 name — at the stand-in’s price, as confidential (U1 plan Task 1, C1)', async () => {
    for (const level of ['very-high', 'confidential'] as const) {
      const lite = fakeLiteLlm()
      lite.price('openai/qwen-x', 0)
      const r = await ensureGatewayModels(
        lite,
        [{ name: 'ubc-onprem', setting: 'ubc-ai-gateway/qwen-x', classification: level }],
        GW,
      )
      expect(r.models[0]?.state, level).toBe('registered')
      const d = gatewayDeployments(lite).find((x) => x.modelName === 'ubc-onprem')!
      expect([d.inputCostPerToken, d.outputCostPerToken], level).toEqual([1e-6, 3e-6])
    }
  })

  it('FAILS CLOSED: every manifest-gateway- deployment is REMOVED when .env no longer carries the key (Decision 4, C1)', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, 'openai/gpt-6-luna', GW, 'medium')
    await ensureGatewayModels(lite, [ONPREM, MINI], GW)
    expect(gatewayDeployments(lite)).toHaveLength(2)
    const configBefore = configEntries(lite).length
    const r = await ensureGatewayModels(lite, [ONPREM, MINI], { ...GW, keyInEnv: false })
    for (const m of r.models) {
      expect(m.state, m.name).toBe('refused')
      expect(m.reason, m.name).toContain('UBC_AI_GATEWAY_API_KEY is not in .env')
    }
    expect(gatewayDeployments(lite)).toHaveLength(0)
    // The capable model and every config entry untouched.
    expect(
      [...lite.deployments.values()].filter((d) => d.modelName === CAPABLE_MODEL_NAME),
    ).toHaveLength(1)
    expect(configEntries(lite)).toHaveLength(configBefore)
  })

  it('refuses a name the catalogue already holds — default-chat-onprem stays Ollama — and registers nothing for it', async () => {
    const lite = fakeLiteLlm()
    const r = await ensureGatewayModels(
      lite,
      [
        {
          name: 'default-chat-onprem',
          setting: 'ubc-ai-gateway/qwen-x',
          classification: 'confidential',
        },
      ],
      GW,
    )
    expect(r.models).toEqual([
      expect.objectContaining({ name: 'default-chat-onprem', state: 'refused' }),
    ])
    expect(r.models[0]!.reason).toContain('already')
    expect(
      [...lite.deployments.values()].filter((d) => d.modelName === 'default-chat-onprem'),
    ).toHaveLength(1)
    expect(lite.calls.filter((c) => c.path === '/model/new')).toHaveLength(0)
  })

  it('removes an entry the setting no longer lists, and never touches the capable model or a config entry', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, 'openai/gpt-6-luna', GW, 'medium')
    await ensureGatewayModels(lite, [ONPREM, MINI], GW)
    const configBefore = configEntries(lite).length
    const r = await ensureGatewayModels(lite, [MINI], GW)
    expect(r.models).toEqual([
      { name: 'ubc-mini', state: 'unchanged', model: 'ubc-ai-gateway/gpt-6-mini' },
    ])
    expect(gatewayDeployments(lite).map((d) => d.modelName)).toEqual(['ubc-mini'])
    expect(
      [...lite.deployments.values()].filter((d) => d.modelName === CAPABLE_MODEL_NAME),
    ).toHaveLength(1)
    expect(configEntries(lite)).toHaveLength(configBefore)
  })

  it('removes every manifest-gateway- deployment when the setting is empty', async () => {
    const lite = fakeLiteLlm()
    await ensureGatewayModels(lite, [ONPREM, MINI], GW)
    expect(gatewayDeployments(lite)).toHaveLength(2)
    expect(await ensureGatewayModels(lite, [], GW)).toEqual({ models: [] })
    expect(gatewayDeployments(lite)).toHaveLength(0)
  })

  it('a confidential project’s agent gets the confidential entry; an internal entry is never given to it', async () => {
    const lite = fakeLiteLlm()
    await ensureGatewayModels(lite, [ONPREM, MINI], GW)
    const snapshot = await loadModelCatalogue(lite)
    const confidential = agentModelsFor(snapshot, 'confidential', 'on-premise')
    expect(confidential).toContain('ubc-onprem')
    expect(confidential).not.toContain('ubc-mini')
    // A positive control: an internal project's agent is given both.
    expect(agentModelsFor(snapshot, 'internal', 'on-premise')).toEqual(
      expect.arrayContaining(['ubc-onprem', 'ubc-mini']),
    )
  })
})

describe('UBC’s AI Gateway’s own models at boot — never fatal, never silent (Task 3)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  const lines = () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    return () => spy.mock.calls.map((call) => String(call[0]))
  }

  it('answers each entry’s state, and writes nothing when every one registered', async () => {
    const written = lines()
    expect(await gatewayModelsAtBoot(fakeLiteLlm(), [MINI], GW)).toEqual([
      { name: 'ubc-mini', state: 'registered' },
    ])
    expect(written()).toEqual([])
  })

  it('writes one operator line per refused entry naming MANIFEST_GATEWAY_MODELS and the entry, and goes on', async () => {
    const written = lines()
    const lite = fakeLiteLlm()
    lite.price('openai/alias-y', 0)
    expect(
      await gatewayModelsAtBoot(
        lite,
        [
          {
            name: 'ubc-alias',
            setting: 'ubc-ai-gateway/alias-y',
            classification: 'internal',
          },
          MINI,
        ],
        GW,
      ),
    ).toEqual([
      { name: 'ubc-alias', state: 'refused' },
      { name: 'ubc-mini', state: 'registered' },
    ])
    expect(written()).toHaveLength(1)
    expect(written()[0]).toMatch(
      /^\[boot\] a gateway model \(MANIFEST_GATEWAY_MODELS\) 'ubc-alias' was refused: /,
    )
    expect(written()[0]).not.toContain('probe-not-a-key')
  })

  it('a gateway that does not answer is ONE line, and never fatal', async () => {
    const written = lines()
    const lite = fakeLiteLlm()
    lite.fail('/model/info', 0)
    expect(await gatewayModelsAtBoot(lite, [ONPREM, MINI], GW)).toBe('failed')
    expect(written()).toHaveLength(1)
    expect(written()[0]).toMatch(
      /^\[boot\] the gateway models \(MANIFEST_GATEWAY_MODELS\)/,
    )
    expect(written()[0]).toContain('LiteLLM did not answer')
  })

  it('at boot, gateway models are registered BEFORE the capable model’s fallback is set — so the fallback may name one (I5)', async () => {
    const written = lines()
    const lite = fakeLiteLlm()
    expect(
      await platformModelsAtBoot(
        lite,
        {
          gatewayModels: [ONPREM],
          capableModel: 'ubc-ai-gateway/gpt-6-luna',
          capableFallback: 'ubc-onprem',
          capableClassification: 'medium',
        },
        GW,
      ),
    ).toEqual({
      gatewayModels: [{ name: 'ubc-onprem', state: 'registered' }],
      capableModel: 'registered',
      capableFallback: 'set',
    })
    expect(lite.fallbacks.get('general')?.get(CAPABLE_MODEL_NAME)).toEqual(['ubc-onprem'])
    expect(written()).toEqual([])
  })

  it('a gateway-models step that fails never stops the capable model’s', async () => {
    const written = lines()
    const lite = fakeLiteLlm()
    lite.fail('/model/info', 0, 1)
    const r = await platformModelsAtBoot(
      lite,
      {
        gatewayModels: [MINI],
        capableModel: 'openai/gpt-6-luna',
        capableFallback: undefined,
        capableClassification: 'medium',
      },
      GW,
    )
    expect(r.gatewayModels).toBe('failed')
    expect(r.capableModel).toBe('registered')
    expect(written()).toHaveLength(1)
  })
})

/** A setting the fake prices — `capable.test.ts`'s own. */
const SETTING = 'openai/gpt-6-luna'

/** A `high` app that names `model` in its `ai.models`. */
const highAppUsing = (model: string) =>
  `manifest: 1\nname: chem-lab-scheduler\nblueprint: node-ts-mongo@2\nruntime:\n  port: 3000\nai:\n  models: [${model}]\n` +
  `  budget:\n    project_monthly_usd: 10\ndata:\n  classification: high\n`
const validationContextFor = (s: CatalogueSnapshot): ValidationContext => ({
  projectSlug: 'chem-lab-scheduler',
  attributeWhitelist: ['ubcEduCwlPuid'],
  serviceCatalogue: [],
  modelCatalogue: s.models,
  unclassifiedModels: s.unclassified,
  aiEnabled: true,
  quota: { maxCpu: 2, maxMemoryMi: 2048, maxServices: 3, aiMonthlyUsd: 100 },
  projectBlueprint: 'node-ts-mongo@2',
})
const errorCodes = (text: string, c: ValidationContext) => {
  const r = validateSpec(text, c)
  return r.valid ? [] : r.errors.map((e) => e.code)
}

describe('registration by level — never kept above the level asked for (U1 plan Task 4)', () => {
  it('a level LOWERED while its re-registration is refused leaves the catalogue — never kept higher (I1; Review Focus 3)', async () => {
    const lite = fakeLiteLlm()
    lite.price('openai/gpt-x', 1e-6)
    await ensureGatewayModels(
      lite,
      [{ name: 'gw-zdr', setting: 'ubc-ai-gateway/gpt-x', classification: 'high' }],
      GW,
    )
    expect(
      (await loadModelCatalogue(lite)).models.find((m) => m.name === 'gw-zdr')
        ?.maxClassification,
    ).toBe('high')
    lite.price('openai/gpt-x', 0) // LiteLLM restarted offline: it prices gpt-* at 0 (registration.ts's `pinned`)
    const r = await ensureGatewayModels(
      lite,
      [{ name: 'gw-zdr', setting: 'ubc-ai-gateway/gpt-x', classification: 'medium' }],
      GW,
    )
    expect(r.models).toEqual([
      expect.objectContaining({ name: 'gw-zdr', state: 'refused' }),
    ])
    const after = await loadModelCatalogue(lite)
    expect(after.models.map((m) => m.name)).not.toContain('gw-zdr')
    // A high app is refused it — unknown now, which fails closed (Decision 6).
    expect(errorCodes(highAppUsing('gw-zdr'), validationContextFor(after))).toEqual([
      'SPEC_MODEL_UNKNOWN',
    ])
  })

  it('a refusal KEEPS a working registration at or below the level asked for — the positive control', async () => {
    const lite = fakeLiteLlm()
    lite.price('openai/gpt-y', 1e-6)
    await ensureGatewayModels(
      lite,
      [{ name: 'gw-y', setting: 'ubc-ai-gateway/gpt-y', classification: 'medium' }],
      GW,
    )
    lite.price('openai/gpt-y', 0)
    const r = await ensureGatewayModels(
      lite,
      [{ name: 'gw-y', setting: 'ubc-ai-gateway/gpt-y', classification: 'high' }],
      GW,
    )
    expect(r.models[0]?.state).toBe('refused')
    expect(
      (await loadModelCatalogue(lite)).models.find((m) => m.name === 'gw-y')
        ?.maxClassification,
    ).toBe('medium')
  })

  it('a new high session is never given the removed entry; a live one is not narrowed for it — LiteLLM no longer serves it (M6)', async () => {
    const lite = fakeLiteLlm()
    lite.price('openai/gpt-x', 1e-6)
    await ensureGatewayModels(
      lite,
      [{ name: 'gw-zdr', setting: 'ubc-ai-gateway/gpt-x', classification: 'high' }],
      GW,
    )
    expect(agentModelsFor(await loadModelCatalogue(lite), 'high', 'capable')).toContain(
      'gw-zdr',
    )
    lite.price('openai/gpt-x', 0)
    await ensureGatewayModels(
      lite,
      [{ name: 'gw-zdr', setting: 'ubc-ai-gateway/gpt-x', classification: 'medium' }],
      GW,
    )
    const after = await loadModelCatalogue(lite)
    expect(agentModelsFor(after, 'high', 'capable')).not.toContain('gw-zdr')
    // The agent sweep's rule: only a name the catalogue still SERVES is withdrawn from a live key.
    expect([...after.models.map((m) => m.name), ...after.unclassified]).not.toContain(
      'gw-zdr',
    )
  })

  it('platformModelsAtBoot registers the capable model at MANIFEST_CAPABLE_MODEL_CLASSIFICATION’s level — the boot’s thread (I3)', async () => {
    const lite = fakeLiteLlm()
    await platformModelsAtBoot(
      lite,
      {
        gatewayModels: [],
        capableModel: SETTING,
        capableFallback: 'default-chat-onprem',
        capableClassification: 'high',
      },
      GW,
    )
    const listed = (await loadModelCatalogue(lite)).models.find(
      (m) => m.name === CAPABLE_MODEL_NAME,
    )
    expect(listed?.maxClassification).toBe('high')
  })
})
