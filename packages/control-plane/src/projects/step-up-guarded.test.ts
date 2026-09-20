import { describe, expect, it } from 'vitest'
import { STEP_UP_TTL_MS } from '../identity/index.js'
import {
  assertStepUp,
  PRIVILEGED,
  STEP_UP_GUARDED,
  StepUpRequiredError,
  type Actor,
  type PrivilegedCapability,
} from './authz.js'
import { sessionActor } from './testing.js'

/**
 * §20: *"Re-authentication (step-up) for approving a release, reading a secret, changing
 * a quota, changing project membership."*
 *
 * The five are named here as LITERALS, exactly as `privileged.test.ts` names D24's four
 * and for the same reason: deriving them from the constant under test would make this
 * file agree with itself no matter what the constant said.
 */
const STEP_UP_SET: readonly PrivilegedCapability[] = [
  'members:manage',
  'quota:set',
  'release:approve',
  'release:promote',
  'secret:read',
]

const NOW = 1_700_000_000_000
const USER = 'b1f0c0de-0000-4000-8000-000000000001'

const steppedUp = sessionActor({ userId: USER, steppedUpAt: NOW })
const plain = sessionActor({ userId: USER })

/** A token actor, with whatever grant the case needs. `Actor` so `assertStepUp` takes it. */
function tokenActor(grant?: PrivilegedCapability): Actor {
  return {
    credential: 'token',
    userId: USER,
    tokenId: 'b1f0c0de-0000-4000-8000-000000000002',
    projectId: 'b1f0c0de-0000-4000-8000-000000000003',
    capabilities: new Set(['project:read']),
    rateLimit: 60,
    // `grant` is only ever a `Capability`; `secret:read` is not one, which is why the
    // cast is here and not in the signature.
    ...(grant === undefined ? {} : { grant: grant as 'members:manage' }),
  }
}

describe('§20’s step-up guard (P6a Task 9)', () => {
  it('is exactly D24’s four plus release:approve, and nothing has been quietly added', () => {
    expect([...STEP_UP_GUARDED].sort()).toEqual([...STEP_UP_SET].sort())
  })

  /**
   * THE ASYMMETRY, ASSERTED. §20 has one phrase — *"approving a release"* — where the
   * code has two capabilities, and this is the difference written down: `release:approve`
   * is step-up-guarded and is NOT one of D24's forbidden four, so a platform admin **can**
   * mint a delegated token that holds it (P6a `[M6]`). What closes that is this set plus
   * `requireSession` on the route, and the plan's Spec action 2 asks Rich whether §20
   * should say so.
   */
  it('names release:approve, which is NOT one of D24’s four', () => {
    expect(STEP_UP_GUARDED.has('release:approve')).toBe(true)
    expect(PRIVILEGED.has('release:approve')).toBe(false)
  })

  it('is a strict superset of D24’s privileged four', () => {
    for (const capability of PRIVILEGED)
      expect(STEP_UP_GUARDED.has(capability)).toBe(true)
    expect(STEP_UP_GUARDED.size).toBe(PRIVILEGED.size + 1)
  })

  /**
   * THE POSITIVE CONTROL. Without it this file is a set of refusals that a function
   * throwing for everything would satisfy (P5c sitting 9, F16).
   */
  it('lets a stepped-up session through — every one of the five', () => {
    for (const capability of STEP_UP_SET)
      expect(() => assertStepUp(steppedUp, capability, NOW)).not.toThrow()
  })

  it('lets an UNGUARDED capability through without a step-up — the second positive control', () => {
    // `release:deploy` is the one §13 separates from `release:promote` by name: an owner
    // deploys to staging all day. A guard that refused it would be a guard on everything.
    for (const capability of ['release:deploy', 'build:create', 'project:read'] as const)
      expect(() => assertStepUp(plain, capability, NOW)).not.toThrow()
  })

  it('refuses a fresh sign-in, which is not a step-up', () => {
    // Task 8's control (b), re-run here: `issueSession` stamps null, and §20 asks for a
    // SECOND round trip. This is the test that goes red if the claim is set at sign-in.
    // **THE CAPABILITY, NOT A CODE.** `StepUpRequiredError` deliberately carries no
    // `code` — `api/errors.ts` supplies `STEP_UP_REQUIRED` at its `instanceof` branch,
    // so the class cannot be constructed with the wrong one. The WIRE code is asserted
    // where a client would see it: `error-codes.test.ts` maps this very class, and the
    // authorization matrix asserts `403 STEP_UP_REQUIRED` through the real route.
    expect(catchStepUp(() => assertStepUp(plain, 'members:manage', NOW)).capability).toBe(
      'members:manage',
    )
  })

  it('refuses a session stepped up longer ago than STEP_UP_TTL_MS, and allows one a millisecond fresher', () => {
    const stale = sessionActor({ userId: USER, steppedUpAt: NOW - STEP_UP_TTL_MS })
    const fresh = sessionActor({ userId: USER, steppedUpAt: NOW - STEP_UP_TTL_MS + 1 })
    expect(catchStepUp(() => assertStepUp(stale, 'quota:set', NOW)).capability).toBe(
      'quota:set',
    )
    expect(() => assertStepUp(fresh, 'quota:set', NOW)).not.toThrow()
  })

  /**
   * A TOKEN WITH NO GRANT IS REFUSED, WHATEVER IT HOLDS — and `release:approve` is the
   * case that makes this line load-bearing rather than decorative. It is NOT one of D24's
   * privileged four, so `assertCapability` does not refuse a token that holds it; this is
   * the only thing between such a token and approving a production release with no person
   * in the loop, which is D14 exactly inverted (*Read this first* 2).
   */
  it('refuses a TOKEN outright when it carries no grant, whatever it holds', () => {
    for (const capability of STEP_UP_SET) {
      expect(
        catchStepUp(() => assertStepUp(tokenActor(), capability, NOW)).capability,
      ).toBe(capability)
    }
  })

  /**
   * AND D24'S LOOP STILL CLOSES, which the plan's own snippet would have broken.
   *
   * A grant is set only by `api/contract/route.ts`'s wrapper, from a `PendingAction` a
   * person who holds the capability moved to `confirmed` in an interactive session, whose
   * fingerprint matches this exact request. A token can never step up, so refusing every
   * token here would make all four of D24's privileged capabilities unreachable even
   * after a person said yes — measured as nine red tests in `delegation.test.ts`.
   */
  it('lets a token through when a person confirmed THIS capability, and not another', () => {
    expect(() =>
      assertStepUp(tokenActor('members:manage'), 'members:manage', NOW),
    ).not.toThrow()
    // A confirmation of one privileged action is not a confirmation of another —
    // compared for EQUALITY, exactly as `assertCapability` compares its own.
    expect(
      catchStepUp(() => assertStepUp(tokenActor('members:manage'), 'quota:set', NOW))
        .capability,
    ).toBe('quota:set')
  })

  it('does not consult the guard at all for an unguarded capability asked by a token', () => {
    // The order matters: the credential class is answered BEFORE the set, so a token is
    // refused even for something the set says nothing about. Belt, and fails closed.
    expect(
      catchStepUp(() => assertStepUp(tokenActor(), 'release:deploy', NOW)).capability,
    ).toBe('release:deploy')
  })
})

/** The error, typed — so a test asserts its CODE and its capability rather than that it threw. */
function catchStepUp(fn: () => void): StepUpRequiredError {
  try {
    fn()
  } catch (error) {
    if (error instanceof StepUpRequiredError) return error
    throw error
  }
  throw new Error('expected assertStepUp to refuse, and it did not')
}
