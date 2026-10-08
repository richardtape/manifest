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
  context: Parameters<typeof assertRegisteredAttributes>[2] = ctx,
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
    // HOW TO ASK FOR IT (the FE-46/47/5 plan's Task 7): from Manifest, through the Manifest team — and the
    // other way out. Never "an administrator records it", which is the team's half.
    expect(error.hint).toContain(
      'Ask for the change from Manifest: draft the registration again and send it to the Manifest team (sendIamRegistration) — or remove them from auth.attributes.',
    )
    expect(error.hint).not.toContain('an administrator records it on the project')
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
      changeRequest: { state: 'change_requested', requested: ['ubcEduCwlPuid', 'mail'] },
    })!
    expect(error.hint).toContain(
      "A change request is on file ('change_requested', asking for",
    )
    expect(error.hint).not.toContain('ticket')
  })

  it('a change with the Manifest team says so; a change filed with UBC says what it waits for (Task 7)', () => {
    const withTeam = refusal(['ubcEduCwlPuid', 'sn'], ['ubcEduCwlPuid'], {
      ...ctx,
      changeRequest: { state: 'sent', requested: ['sn', 'ubcEduCwlPuid'] },
    })!
    expect(withTeam.hint).toContain(
      "A change is with the Manifest team (asking for sn, ubcEduCwlPuid): it files it with UBC IAM, and this builds once UBC IAM registers it and an administrator records it 'active'. Or remove them from auth.attributes.",
    )
    const filed = refusal(['ubcEduCwlPuid', 'sn'], ['ubcEduCwlPuid'], {
      ...ctx,
      changeRequest: { state: 'change_requested', requested: ['sn', 'ubcEduCwlPuid'] },
    })!
    expect(filed.hint).toContain(
      "A change request is on file ('change_requested', ticket IAM-4471, asking for sn, ubcEduCwlPuid): UBC IAM has not registered it yet, and this builds once UBC IAM registers it and an administrator records it 'active'.",
    )
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
