import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStreamRegistry, type StreamEntry } from './streams.js'

/**
 * The stream registry (the launch path plan's Task 5, FE-33): what closes an open event stream at
 * the moment its credential goes. The route's half — a real socket, a real revoke, a real archive
 * and delete — is `api/events.test.ts`'s; this is the registry's own rules, where a clock can be
 * faked and every close is counted.
 */

const DAY_MS = 86_400_000
const PROJECT = 'p-1'
const OTHER_PROJECT = 'p-2'
const PERSON = 'u-1'
const OTHER_PERSON = 'u-2'

const entry = (overrides: Partial<StreamEntry> = {}): StreamEntry => ({
  projectId: PROJECT,
  tokenId: null,
  userId: PERSON,
  expiresAt: new Date(Date.now() + DAY_MS),
  ...overrides,
})

/** A `close` that records what it was called with — the socket's side, as the route's `stop`. */
function recording() {
  const calls: { code: number; reason: string }[] = []
  return { calls, close: (code: number, reason: string) => calls.push({ code, reason }) }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the stream registry (FE-33)', () => {
  it('closes a token’s streams 4401 — only that token’s — and answers how many', () => {
    const streams = createStreamRegistry()
    const [a1, a2, b, session] = [recording(), recording(), recording(), recording()]
    streams.register(entry({ tokenId: 't-a' }), a1.close)
    streams.register(entry({ tokenId: 't-a' }), a2.close)
    streams.register(entry({ tokenId: 't-b' }), b.close)
    streams.register(entry(), session.close)

    expect(streams.closeToken('t-a')).toBe(2)
    expect(a1.calls).toEqual([{ code: 4401, reason: expect.stringContaining('revoked') }])
    expect(a2.calls).toEqual(a1.calls)
    // THE POSITIVE CONTROL: another token's stream, and a session's, are not this token's.
    expect(b.calls).toEqual([])
    expect(session.calls).toEqual([])
    // Closed ONCE: a second revoke of the same token finds nothing left to close.
    expect(streams.closeToken('t-a')).toBe(0)
    expect(a1.calls).toHaveLength(1)
  })

  it('closes several tokens’ streams at once — the archive’s revoked ids', () => {
    const streams = createStreamRegistry()
    const [a, b, c] = [recording(), recording(), recording()]
    streams.register(entry({ tokenId: 't-a' }), a.close)
    streams.register(entry({ tokenId: 't-b' }), b.close)
    streams.register(entry({ tokenId: 't-c' }), c.close)
    expect(streams.closeTokens(['t-a', 't-c', 't-none'])).toBe(2)
    expect(a.calls.map((call) => call.code)).toEqual([4401])
    expect(c.calls.map((call) => call.code)).toEqual([4401])
    expect(b.calls).toEqual([])
    expect(streams.closeTokens([])).toBe(0)
  })

  it('closes every stream on a project 4404 — a session’s and a token’s — and no other project’s', () => {
    const streams = createStreamRegistry()
    const [session, token, elsewhere] = [recording(), recording(), recording()]
    streams.register(entry(), session.close)
    streams.register(entry({ tokenId: 't-a' }), token.close)
    streams.register(entry({ projectId: OTHER_PROJECT }), elsewhere.close)
    expect(streams.closeProject(PROJECT)).toBe(2)
    expect(session.calls).toEqual([{ code: 4404, reason: expect.any(String) }])
    expect(token.calls.map((call) => call.code)).toEqual([4404])
    expect(elsewhere.calls).toEqual([])
    expect(streams.closeProject(PROJECT)).toBe(0)
  })

  it('closes a person’s SESSION streams on one project 4404 — not their token’s, nobody else’s, no other project’s (Task 8’s caller)', () => {
    const streams = createStreamRegistry()
    const [mine, myToken, theirs, myOtherProject] = [
      recording(),
      recording(),
      recording(),
      recording(),
    ]
    streams.register(entry(), mine.close)
    streams.register(entry({ tokenId: 't-mine' }), myToken.close)
    streams.register(entry({ userId: OTHER_PERSON }), theirs.close)
    streams.register(entry({ projectId: OTHER_PROJECT }), myOtherProject.close)
    expect(streams.closePerson(PROJECT, PERSON)).toBe(1)
    expect(mine.calls).toEqual([{ code: 4404, reason: expect.any(String) }])
    // A token's stream is its TOKEN's to close, 4401, when the token is revoked.
    expect(myToken.calls).toEqual([])
    expect(theirs.calls).toEqual([])
    expect(myOtherProject.calls).toEqual([])
  })

  it('an unregistered stream is closed by nothing, and leaves no timer behind', () => {
    vi.useFakeTimers()
    const streams = createStreamRegistry()
    const gone = recording()
    const unregister = streams.register(
      entry({ tokenId: 't-a', expiresAt: new Date(Date.now() + 1_000) }),
      gone.close,
    )
    expect(vi.getTimerCount()).toBe(1)
    unregister()
    // Twice is harmless: the socket's close and the registry's own close both reach it.
    unregister()
    expect(vi.getTimerCount()).toBe(0)
    expect(streams.closeToken('t-a')).toBe(0)
    expect(streams.closeProject(PROJECT)).toBe(0)
    vi.advanceTimersByTime(2_000)
    expect(gone.calls).toEqual([])
  })

  it('closes a stream 4401 AT its credential’s expiry — a session’s as well as a token’s — and not a moment before', () => {
    vi.useFakeTimers()
    const streams = createStreamRegistry()
    const [token, session] = [recording(), recording()]
    const at = Date.now() + 1_000
    streams.register(entry({ tokenId: 't-a', expiresAt: new Date(at) }), token.close)
    streams.register(entry({ expiresAt: new Date(at) }), session.close)
    vi.advanceTimersByTime(999)
    expect(token.calls).toEqual([])
    expect(session.calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(token.calls).toEqual([
      { code: 4401, reason: expect.stringContaining('expired') },
    ])
    expect(session.calls).toEqual(token.calls)
    // Its timer is gone with it, and a later revoke finds nothing.
    expect(vi.getTimerCount()).toBe(0)
    expect(streams.closeToken('t-a')).toBe(0)
  })

  it('an expiry past what one timer can hold is re-armed, never closed early', () => {
    // Node's `setTimeout` takes at most 2 ** 31 - 1 ms (24.8 days) and fires a LONGER delay after
    // 1 ms, with a warning: a token minted for a year would close its stream at once.
    vi.useFakeTimers()
    const streams = createStreamRegistry()
    const year = recording()
    const at = Date.now() + 365 * DAY_MS
    streams.register(entry({ tokenId: 't-a', expiresAt: new Date(at) }), year.close)
    vi.advanceTimersByTime(2 ** 31 - 1)
    expect(year.calls).toEqual([])
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(at - Date.now() - 1)
    expect(year.calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(year.calls.map((call) => call.code)).toEqual([4401])
  })

  it('a credential already expired when it registers is closed on the next turn, not synchronously', () => {
    vi.useFakeTimers()
    const streams = createStreamRegistry()
    const late = recording()
    streams.register(
      entry({ tokenId: 't-a', expiresAt: new Date(Date.now() - 1) }),
      late.close,
    )
    // Not from inside `register`: its caller has not been handed the unregister yet.
    expect(late.calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(late.calls.map((call) => call.code)).toEqual([4401])
  })

  it('a close that throws is reported on stderr and does not stop the others', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const streams = createStreamRegistry()
    const [before, after] = [recording(), recording()]
    streams.register(entry({ tokenId: 't-a' }), before.close)
    streams.register(entry({ tokenId: 't-a' }), () => {
      throw Object.assign(new Error('the socket is gone'), { code: 'ERR_SOCKET' })
    })
    streams.register(entry({ tokenId: 't-a' }), after.close)
    // Two closed; the one that threw is not counted as closed.
    expect(streams.closeToken('t-a')).toBe(2)
    expect(before.calls).toHaveLength(1)
    expect(after.calls).toHaveLength(1)
    expect(logged).toHaveBeenCalledTimes(1)
    const line = JSON.parse(String(logged.mock.calls[0]![0])) as Record<string, unknown>
    expect(line).toMatchObject({
      level: 'error',
      projectId: PROJECT,
      code: 4401,
      error: 'ERR_SOCKET',
    })
    // NEVER the credential: the line names the project and the code, not the token.
    expect(JSON.stringify(line)).not.toContain('t-a')
    // And it is gone from the registry all the same.
    expect(streams.closeToken('t-a')).toBe(0)
  })
})
