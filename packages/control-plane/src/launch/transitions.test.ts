import { describe, expect, it } from 'vitest'
import {
  iamTransition,
  LaunchTransitionError,
  piaTransition,
  type IamState,
  type PiaState,
} from './transitions.js'

/**
 * **THE STATES ARE WRITTEN OUT HERE RATHER THAN DERIVED FROM THE ARROW TABLES.** A test
 * that asked the table under test which states exist would walk a smaller grid the moment
 * a state was dropped, and the counted controls below would still pass — the arrows are a
 * design statement (§9), so the test states them independently.
 */
const IAM_STATES: readonly IamState[] = [
  'draft',
  'submitted',
  'active',
  'change_requested',
  'expired',
]
const PIA_STATES: readonly PiaState[] = ['draft', 'submitted', 'approved']

function walk<S extends string>(
  states: readonly S[],
  transition: (from: S, to: S) => S,
): { allowed: number; refused: number } {
  let allowed = 0
  let refused = 0
  for (const from of states)
    for (const to of states) {
      try {
        transition(from, to)
        allowed++
      } catch {
        refused++
      }
    }
  return { allowed, refused }
}

describe('§9’s IAM registration states', () => {
  it('walks the happy path: draft → submitted → active', () => {
    expect(iamTransition('draft', 'submitted')).toBe('submitted')
    expect(iamTransition('submitted', 'active')).toBe('active')
  })

  it('refuses draft → active, which is the arrow that would satisfy the gate by typo', () => {
    expect(() => iamTransition('draft', 'active')).toThrow(
      /cannot go from 'draft' to 'active'/,
    )
  })

  it('lets a registration come back with questions, and lapse (§9, D20)', () => {
    expect(iamTransition('submitted', 'change_requested')).toBe('change_requested')
    expect(iamTransition('change_requested', 'submitted')).toBe('submitted')
    expect(iamTransition('active', 'expired')).toBe('expired')
    // A lapsed registration is re-registered, which is a new submission.
    expect(iamTransition('expired', 'submitted')).toBe('submitted')
  })

  it('refuses a self-transition, so a no-op never reads as an arrow', () => {
    // `records.ts` short-circuits `state === from` before calling this; the machine
    // itself has no self-arrows, which is what makes that short-circuit visible.
    expect(() => iamTransition('active', 'active')).toThrow(LaunchTransitionError)
  })

  it('names its code, because a status alone is five different answers', () => {
    // Global Constraints: every refusal asserts its CODE. 409 is also RELEASE_*, and a
    // client switches on the code.
    let thrown: unknown
    try {
      iamTransition('draft', 'active')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(LaunchTransitionError)
    expect((thrown as LaunchTransitionError).code).toBe('LAUNCH_TRANSITION_INVALID')
  })

  it('says what the state CAN become, so the refusal is actionable (D23.7)', () => {
    expect(() => iamTransition('draft', 'active')).toThrow(
      /from 'draft' it can only become 'submitted'/,
    )
  })

  // THE CONTROL THAT MAKES THE REFUSALS MEAN SOMETHING (Global Constraints): a function
  // that threw for everything would pass every refusal test above, and one that returned
  // `to` unconditionally would pass every happy-path test. This is the pair for both.
  it('allows every arrow the table declares, and refuses every one it does not', () => {
    // 8 and 17 are derived from IAM_ARROWS BY HAND. If the table changes this goes red,
    // and that is correct — the arrows are a design statement, not an implementation
    // detail.
    expect(walk(IAM_STATES, iamTransition)).toEqual({ allowed: 8, refused: 17 })
  })
})

describe('§9’s privacy assessment states', () => {
  it('walks the happy path: draft → submitted → approved', () => {
    expect(piaTransition('draft', 'submitted')).toBe('submitted')
    expect(piaTransition('submitted', 'approved')).toBe('approved')
  })

  it('refuses draft → approved — the gate satisfied by something never submitted', () => {
    expect(() => piaTransition('draft', 'approved')).toThrow(
      /a privacy assessment cannot go from 'draft' to 'approved'/,
    )
  })

  it('sends a refused assessment back to draft, because §9 names no rejection state', () => {
    expect(piaTransition('submitted', 'draft')).toBe('draft')
    // And an approved one can be reopened — a PIA covers a design, and the design changes.
    expect(piaTransition('approved', 'draft')).toBe('draft')
  })

  it('refuses approved → submitted, which would skip the re-draft the Office asks for', () => {
    expect(() => piaTransition('approved', 'submitted')).toThrow(LaunchTransitionError)
  })

  it('allows every arrow the table declares, and refuses every one it does not', () => {
    // 4 and 5, counted from PIA_ARROWS by hand — 3 states is a 9-cell grid.
    expect(walk(PIA_STATES, piaTransition)).toEqual({ allowed: 4, refused: 5 })
  })
})

describe('the two machines are separate, and say so', () => {
  it('names the object in the refusal, not just the states', () => {
    // The same (from, to) pair is refused by both, and an administrator reading the
    // message has to know WHICH record they just failed to move.
    expect(() => iamTransition('draft', 'active')).toThrow(/IAM registration/)
    expect(() => piaTransition('approved', 'submitted')).toThrow(/privacy assessment/)
  })
})
