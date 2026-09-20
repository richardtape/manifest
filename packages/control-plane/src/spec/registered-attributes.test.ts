import { describe, expect, it } from 'vitest'
import {
  AttributeDriftError,
  assertRegisteredAttributes,
} from './registered-attributes.js'

const ctx = { slug: 'chem-labs', ticketRef: 'IAM-4471' }

/** The thrown error, or `undefined` — so each test asserts WHAT was refused, not only that. */
function refusal(
  requested: readonly string[],
  registered: readonly string[],
  context: { slug: string; ticketRef: string | null } = ctx,
): AttributeDriftError | undefined {
  try {
    assertRegisteredAttributes(requested, registered, context)
    return undefined
  } catch (error) {
    expect(error).toBeInstanceOf(AttributeDriftError)
    return error as AttributeDriftError
  }
}

describe('§7’s last production clause — auth.attributes ⊆ registered_attributes (P6a Task 13)', () => {
  // POSITIVE, FIRST: a check that refused everything would pass every refusal below.
  it('allows a subset', () => {
    expect(refusal(['ubcEduCwlPuid'], ['ubcEduCwlPuid', 'mail'])).toBeUndefined()
    expect(refusal([], ['ubcEduCwlPuid'])).toBeUndefined()
  })

  it('allows exactly the registered set', () => {
    expect(refusal(['ubcEduCwlPuid', 'mail'], ['ubcEduCwlPuid', 'mail'])).toBeUndefined()
  })

  it('is order-insensitive — a reordered list is not drift', () => {
    expect(refusal(['mail', 'ubcEduCwlPuid'], ['ubcEduCwlPuid', 'mail'])).toBeUndefined()
  })

  /**
   * ONE of TWO missing, deliberately (control c): a check that refused only when EVERY
   * requested attribute was missing passes an app that asks for one registered attribute
   * and one unregistered one — which is the drift §9 is about, since the agent ADDS an
   * attribute to a list that already works.
   */
  it('refuses one unregistered attribute, naming it and what IS registered', () => {
    const error = refusal(['ubcEduCwlPuid', 'mail'], ['ubcEduCwlPuid'])!
    expect(error.code).toBe('SPEC_ATTRIBUTE_NOT_REGISTERED')
    expect(error.message).toContain("for 'chem-labs': mail.")
    expect(error.message).toContain('Registered: ubcEduCwlPuid.')
    // §9's pre-generated change request: the ticket to raise it against, and the other way out.
    expect(error.hint).toContain('Raise an IAM change request against IAM-4471')
    expect(error.hint).toContain('remove them from auth.attributes')
  })

  it('names every missing attribute once, sorted, whatever order and repeats they came in', () => {
    const error = refusal(['sn', 'mail', 'ubcEduCwlPuid', 'mail'], ['ubcEduCwlPuid'])!
    expect(error.message).toContain('asks for 2 CWL attribute(s)')
    expect(error.message).toContain(': mail, sn.')
  })

  it('does not invent a ticket when none was recorded', () => {
    const error = refusal(['mail'], ['ubcEduCwlPuid'], {
      slug: 'chem-labs',
      ticketRef: null,
    })!
    expect(error.hint).toContain('Raise an IAM change request for the missing')
    expect(error.hint).not.toContain('against')
  })

  /**
   * **THE CASE THAT MATTERS** (control b). Every set is a superset of nothing, so with no
   * guard an empty registration passes an app that requests nothing — and the connection to
   * Task 5's control (d) is that migration 0019's CHECK is the only other thing refusing an
   * empty list. With both removed, the check is silently off.
   */
  it('refuses when the registration lists nothing, rather than passing vacuously', () => {
    const error = refusal([], [])!
    expect(error).toBeDefined()
    expect(error.code).toBe('SPEC_ATTRIBUTE_NOT_REGISTERED')
    expect(error.message).toContain('lists no attributes')
  })
})
