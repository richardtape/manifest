import { describe, expect, it } from 'vitest'
import { PLATFORM_EGRESS_BASELINE, proxyEnvironment, renderAllowlist } from './egress.js'

describe('egress allowlist rendering (D18)', () => {
  it('always includes the platform baseline §12 names', () => {
    const rendered = renderAllowlist([])
    for (const entry of PLATFORM_EGRESS_BASELINE) expect(rendered).toContain(entry)
    expect(PLATFORM_EGRESS_BASELINE).toContain('^manifest-verdaccio$')
    expect(PLATFORM_EGRESS_BASELINE).toContain('^manifest-litellm$')
  })

  it('anchors and escapes every declared host', () => {
    expect(renderAllowlist(['api.ubc.ca'])).toContain('^api\\.ubc\\.ca$')
  })

  // THE ATTACK this anchoring exists for. Unanchored, `api.ubc.ca` matches
  // `api.ubc.ca.evil.example` and the app's egress policy is decorative.
  it('does not let a declared host match a longer attacker-controlled name', () => {
    const line = renderAllowlist(['api.ubc.ca'])
      .split('\n')
      .find((l) => l.includes('ubc'))!
    expect(new RegExp(line).test('api.ubc.ca')).toBe(true)
    expect(new RegExp(line).test('api.ubc.ca.evil.example')).toBe(false)
    expect(new RegExp(line).test('evil-api.ubc.ca')).toBe(false)
  })

  it('rejects an entry that is not a plain hostname rather than escaping it into nonsense', () => {
    expect(() => renderAllowlist(['*.ubc.ca'])).toThrow(/EGRESS_ALLOW_INVALID/)
    expect(() => renderAllowlist(['https://api.ubc.ca/path'])).toThrow(
      /EGRESS_ALLOW_INVALID/,
    )
  })

  it('forces the proxy through the standard environment variables, with no bypass', () => {
    const env = proxyEnvironment('http://mf-chem-labs-staging-egress:8888')
    expect(env.HTTP_PROXY).toBe('http://mf-chem-labs-staging-egress:8888')
    expect(env.HTTPS_PROXY).toBe(env.HTTP_PROXY)
    expect(env.http_proxy).toBe(env.HTTP_PROXY)
    expect(env.https_proxy).toBe(env.HTTP_PROXY)
    // NO_PROXY covers only what must never leave the app network: its own
    // services, by name. Anything broader is a hole in the forced proxy.
    expect(env.NO_PROXY).toBe('localhost,127.0.0.1')
  })
})
