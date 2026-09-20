import { describe, expect, it } from 'vitest'
import { issueSession, signSession, verifySession, type Session } from './session.js'
import { isSteppedUp, stepUpSession, STEP_UP_TTL_MS } from './step-up.js'

const SECRET = 'a-test-session-secret-that-is-long-enough'
const USER = {
  id: 'b1f0c0de-0000-4000-8000-000000000001',
  ubcCwlPuid: 'ins000001',
  role: 'member',
} as const

describe('§20’s step-up claim (P6a Task 8)', () => {
  /**
   * THE POSITIVE CONTROL, FIRST. Every other test in this file is a refusal, and a
   * function that answered `false` for everything would pass all of them (P5c sitting 9,
   * F16).
   */
  it('stamps the claim, and a freshly stamped session is stepped up', () => {
    const now = 1_700_000_000_000
    const stepped = stepUpSession(issueSession(USER, now), now)
    expect(stepped.steppedUpAt).toBe(now)
    expect(isSteppedUp(stepped.steppedUpAt, now)).toBe(true)
  })

  it('a fresh sign-in is NOT stepped up — §20 asks for a SECOND round trip', () => {
    const now = 1_700_000_000_000
    expect(issueSession(USER, now).steppedUpAt).toBeNull()
    expect(isSteppedUp(issueSession(USER, now).steppedUpAt, now)).toBe(false)
  })

  /**
   * **TEN MINUTES, AS A LITERAL — and this assertion exists because a control could not
   * fail without it.**
   *
   * Task 9's control (d) widens the window to a year and predicts *refuses a session
   * stepped up longer ago* goes red. Measured: **1492 tests green, nothing red**, because
   * every other test here builds its instants out of `STEP_UP_TTL_MS` and then compares
   * them against a function that uses the same constant — so the file agrees with itself
   * whatever the number says. It is `privileged.test.ts`'s *"deriving them from the
   * constant under test"* warning, applied to a number instead of a set.
   *
   * The relative tests below are still the right shape for a boundary; this is the one
   * that pins the value. Decision 8's reasoning for ten: long enough to read a release
   * diff and decide, short enough that a stolen cookie is rarely stepped up.
   */
  it('is ten minutes, and nothing has quietly widened it', () => {
    expect(STEP_UP_TTL_MS).toBe(600_000)
  })

  /**
   * THE BOUNDARY, both sides of it. An off-by-one here is a step-up that lives a
   * millisecond too long, and `<=` versus `<` is exactly the edit nothing else would
   * catch.
   */
  it('is false at exactly STEP_UP_TTL_MS and true one millisecond before', () => {
    const at = 1_700_000_000_000
    expect(isSteppedUp(at, at + STEP_UP_TTL_MS)).toBe(false)
    expect(isSteppedUp(at, at + STEP_UP_TTL_MS - 1)).toBe(true)
  })

  /**
   * THE ZERO GUARD, and it is not hypothetical: `.map(fn)` passes the ARRAY INDEX as a
   * second argument, so a representation mapper that grows a `now` parameter receives
   * `0` for the first element (P5b sitting 7, F4). Epoch zero is 1970 and would be stale
   * under any window — until somebody widens the window, or writes `steppedUpAt ?? 0`.
   */
  it('refuses a steppedUpAt of 0, whatever the window says', () => {
    expect(isSteppedUp(0, 1_700_000_000_000)).toBe(false)
    // The same call with the guard's other input, to show the zero is what is refused.
    expect(isSteppedUp(0, 0)).toBe(false)
  })

  it('refuses a claim from the future’s far side and one from before the window', () => {
    const at = 1_700_000_000_000
    expect(isSteppedUp(at, at + STEP_UP_TTL_MS + 60_000)).toBe(false)
    expect(isSteppedUp(null, at)).toBe(false)
  })
})

describe('the claim is VALIDATED on the way out of the cookie, not trusted', () => {
  /**
   * THE TEST THAT STOPS A RESTART SIGNING EVERYBODY OUT. Every session cookie in every
   * browser on this machine predates this field; a refusal would have ended all of them
   * the moment the control plane restarted — including, in Task 19's demo, the
   * administrator who is about to approve something.
   */
  it('verifies a session cookie written before this field existed, and it is not stepped up', () => {
    // A cookie as an OLDER BUILD signed it: the payload with no `steppedUpAt` at all,
    // through the real signer, so the signature is genuine and only the shape is old.
    const old: Omit<Session, 'steppedUpAt'> = {
      userId: USER.id,
      puid: USER.ubcCwlPuid,
      role: 'member',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    }
    const token = signSession(old as Session, SECRET)
    const session = verifySession(token, SECRET)
    expect(session).not.toBeNull()
    expect(session!.steppedUpAt).toBeNull()
    expect(isSteppedUp(session!.steppedUpAt)).toBe(false)
  })

  it('turns a non-number claim into null rather than carrying it through', () => {
    // What a FUTURE build, or a bug, could put there. The payload is signed, so this is
    // not a forgery — it is the reason `verifySession` validates rather than trusts.
    for (const value of [
      'not-a-number',
      {},
      [],
      true,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const token = signSession(
        { ...issueSession(USER), steppedUpAt: value } as unknown as Session,
        SECRET,
      )
      const session = verifySession(token, SECRET)
      expect(session).not.toBeNull()
      expect(session!.steppedUpAt).toBeNull()
    }
  })

  it('carries a real number through, which is what makes the test above mean something', () => {
    const at = Date.now() - 1000
    const token = signSession(stepUpSession(issueSession(USER), at), SECRET)
    expect(verifySession(token, SECRET)!.steppedUpAt).toBe(at)
  })
})
