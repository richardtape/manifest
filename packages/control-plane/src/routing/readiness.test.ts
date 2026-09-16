import { describe, expect, it, vi } from 'vitest'
import { waitForIdentity, waitForReady } from './readiness.js'

describe('readiness polling', () => {
  it('returns ready on the first 200', async () => {
    const probe = vi.fn(async () => 200)
    const result = await waitForReady({
      url: 'https://x/',
      probe,
      timeoutMs: 1000,
      intervalMs: 10,
    })
    expect(result.ready).toBe(true)
    expect(result.attempts).toBe(1)
  })

  it('keeps trying while the edge answers 502, and succeeds when the app comes up', async () => {
    let calls = 0
    const probe = async () => (++calls < 3 ? 502 : 200)
    const result = await waitForReady({
      url: 'https://x/',
      probe,
      timeoutMs: 2000,
      intervalMs: 5,
    })
    expect(result.ready).toBe(true)
    expect(result.attempts).toBe(3)
  })

  it('gives up at the timeout and says what it last saw', async () => {
    const result = await waitForReady({
      url: 'https://x/',
      probe: async () => 502,
      timeoutMs: 60,
      intervalMs: 10,
    })
    expect(result.ready).toBe(false)
    expect(result.lastStatus).toBe(502)
    expect(result.reason).toContain('502')
  })

  // A probe that throws is a probe that could not run — DNS not resolving, the
  // edge not listening. It must not be mistaken for "the app said no".
  it('treats a throwing probe as not-ready and reports the error, not a status', async () => {
    const result = await waitForReady({
      url: 'https://x/',
      probe: async () => {
        throw new Error('could not resolve host')
      },
      timeoutMs: 60,
      intervalMs: 10,
    })
    expect(result.ready).toBe(false)
    expect(result.lastStatus).toBeUndefined()
    expect(result.reason).toContain('could not resolve host')
  })

  // 200 is the ONLY ready state. A 3xx from the edge means the app is redirecting
  // its health path somewhere — an app that answers 302 to /healthz is not healthy,
  // it is misconfigured, and accepting it here hides that until a faculty member
  // finds it.
  it('does not accept a redirect as ready', async () => {
    const result = await waitForReady({
      url: 'https://x/',
      probe: async () => 302,
      timeoutMs: 60,
      intervalMs: 10,
    })
    expect(result.ready).toBe(false)
  })
})

/**
 * A status is not an identity.
 *
 * The edge's `*.staging.manifest.internal` wildcard answers **200** for any host in
 * the zone that holds no route, and for ANY path on it — measured 2026-09-15, run C:
 * `manifest OK host=… scheme=https` for `/never-ready` on a hostname with no route
 * (P4b finding 193, Task 1 finding 11). So "the edge answered 200" cannot tell this
 * instance from the previous one, from the wildcard, or from an app that never
 * started. The identity header the route sets can, and only the route sets it.
 */
describe('waitForIdentity (P4c)', () => {
  it('is ready when the edge answers 200 AS THIS INSTANCE', async () => {
    const result = await waitForIdentity({
      url: 'https://x/',
      expected: 'inst-a',
      timeoutMs: 1000,
      intervalMs: 10,
      probe: async () => ({ status: 200, instance: 'inst-a' }),
    })
    expect(result.ready).toBe(true)
    expect(result.attempts).toBe(1)
    expect(result.lastStatus).toBe(200)
  })

  it('keeps trying while the edge is still answering as the previous instance', async () => {
    let calls = 0
    const result = await waitForIdentity({
      url: 'https://x/',
      expected: 'inst-a',
      timeoutMs: 2000,
      intervalMs: 5,
      probe: async () => ({
        status: 200,
        instance: ++calls < 3 ? 'inst-b' : 'inst-a',
      }),
    })
    expect(result.ready).toBe(true)
    expect(result.attempts).toBe(3)
  })

  it('is NOT ready when a 200 carries no identity — that is the edge’s wildcard', async () => {
    const result = await waitForIdentity({
      url: 'https://x/',
      expected: 'inst-a',
      timeoutMs: 60,
      intervalMs: 10,
      probe: async () => ({ status: 200, instance: undefined }),
    })
    expect(result.ready).toBe(false)
    expect(result.reason).toContain('no X-Manifest-Instance')
  })

  it('is NOT ready when the edge still answers as another instance, and says which', async () => {
    const result = await waitForIdentity({
      url: 'https://x/',
      expected: 'inst-a',
      timeoutMs: 60,
      intervalMs: 10,
      probe: async () => ({ status: 200, instance: 'inst-b' }),
    })
    expect(result.ready).toBe(false)
    expect(result.reason).toContain('inst-b')
  })

  // The right instance answering the wrong thing is not ready either: a 502 carrying
  // this instance's header is the edge reaching a container that is not serving.
  it('is NOT ready for a non-200, whatever identity it carries', async () => {
    const result = await waitForIdentity({
      url: 'https://x/',
      expected: 'inst-a',
      timeoutMs: 60,
      intervalMs: 10,
      probe: async () => ({ status: 502, instance: 'inst-a' }),
    })
    expect(result.ready).toBe(false)
    expect(result.lastStatus).toBe(502)
    expect(result.reason).toContain('502')
  })

  it('treats a throwing probe as not-ready and reports the error, not a status', async () => {
    const result = await waitForIdentity({
      url: 'https://x/',
      expected: 'inst-a',
      timeoutMs: 60,
      intervalMs: 10,
      probe: async () => {
        throw new Error('could not resolve host')
      },
    })
    expect(result.ready).toBe(false)
    expect(result.lastStatus).toBeUndefined()
    expect(result.reason).toContain('could not resolve host')
  })
})
