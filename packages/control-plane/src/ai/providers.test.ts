import { describe, expect, it } from 'vitest'
import {
  GATEWAY_NUM_RETRIES,
  GATEWAY_TIMEOUT_S,
  gatewayKeyRef,
  resolveSetting,
  type Gateway,
} from './providers.js'

const GW: Gateway = {
  url: 'https://gw.example/v1',
  keyRef: gatewayKeyRef(),
  keyInEnv: true,
}

describe('where a model setting is answered (the UBC AI Gateway plan’s Task 2)', () => {
  it('passes a LiteLLM model string through unchanged — OpenAI direct still works', () => {
    expect(resolveSetting('MANIFEST_CAPABLE_MODEL', 'openai/gpt-6-luna', GW)).toEqual({
      params: { model: 'openai/gpt-6-luna' },
    })
  })

  it('sends a ubc-ai-gateway setting to the gateway, naming its key by REFERENCE only, with a timeout and its retries', () => {
    expect(
      resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/gpt-6-luna', GW),
    ).toEqual({
      params: {
        model: 'openai/gpt-6-luna',
        api_base: 'https://gw.example/v1',
        api_key: 'os.environ/UBC_AI_GATEWAY_API_KEY',
        timeout: GATEWAY_TIMEOUT_S,
        num_retries: GATEWAY_NUM_RETRIES,
      },
    })
  })

  it('bounds a black-holed gateway well inside LiteLLM’s 600 s, and above the longest answer measured (35.2 s)', () => {
    // (1 + retries) × timeout is how long a caller waits before the fallback answers ([M3], F12).
    expect(GATEWAY_TIMEOUT_S).toBeGreaterThan(35.2)
    expect((1 + GATEWAY_NUM_RETRIES) * GATEWAY_TIMEOUT_S).toBeLessThanOrEqual(120)
  })

  it('refuses a gateway setting when .env carried no key — FAILING CLOSED — and names the setting, never a value', () => {
    const r = resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/gpt-6-luna', {
      ...GW,
      keyInEnv: false,
    })
    expect(r).toEqual({
      refused: expect.stringContaining('UBC_AI_GATEWAY_API_KEY is not in .env'),
      failClosed: true,
    })
    expect(JSON.stringify(r)).toContain('MANIFEST_CAPABLE_MODEL')
  })

  it('refuses the prefix with no model after it, and a gateway setting with no gateway configured — neither fails closed', () => {
    expect(
      resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/', GW),
    ).not.toHaveProperty('failClosed')
    expect(
      resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/', GW),
    ).toHaveProperty('refused')
    expect(
      resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/x', undefined),
    ).toHaveProperty('refused')
    expect(
      resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/x', undefined),
    ).not.toHaveProperty('failClosed')
  })

  it('names a harmless variable when a test asks — the reference is a name, never a value', () => {
    expect(gatewayKeyRef()).toBe('os.environ/UBC_AI_GATEWAY_API_KEY')
    expect(gatewayKeyRef('MANIFEST_STUB_BEARER')).toBe('os.environ/MANIFEST_STUB_BEARER')
  })
})
