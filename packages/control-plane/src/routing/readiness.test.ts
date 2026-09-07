import { describe, expect, it, vi } from 'vitest'
import { waitForReady } from './readiness.js'

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
