import { describe, expect, it } from 'vitest'
import {
  capabilitiesFor,
  isPrivileged,
  PRIVILEGED,
  type PrivilegedCapability,
} from './authz.js'

/**
 * §20: "The first four are exactly D24's forbidden delegated-token capabilities ...
 * Keeping the two lists aligned is a test, not a convention." This is that test.
 *
 * D24's four, in the spec's words: production promotion, secret read, quota change,
 * member management. They are named here as LITERALS on purpose — deriving them from
 * the constant under test would make this file agree with itself no matter what the
 * constant said.
 *
 * Typed as `PrivilegedCapability`, not `Capability`, because `secret:read` is not a
 * `Capability` and must not become one: no route reads a secret in Phase 1 (Decision
 * 14), and a capability nothing grants and nothing checks is the no-caller shape
 * ORIENTATION §9 names four times (P5b `[M8]`).
 */
const D24_FORBIDDEN: readonly PrivilegedCapability[] = [
  'release:promote',
  'secret:read',
  'quota:set',
  'members:manage',
]

describe('the privileged set (D24, §20)', () => {
  it('is exactly D24’s four, and nothing has been quietly added', () => {
    expect([...PRIVILEGED].sort()).toEqual([...D24_FORBIDDEN].sort())
  })

  it('names every one of them as privileged, and nothing else', () => {
    for (const cap of D24_FORBIDDEN) expect(isPrivileged(cap)).toBe(true)
    for (const cap of [
      'project:read',
      'build:create',
      'release:create',
      'release:deploy',
    ] as const)
      expect(isPrivileged(cap)).toBe(false)
  })

  it('distinguishes deploying from promoting — a staging deploy is not privileged', () => {
    // §13: an owner deploys to staging all day; putting an app in front of real
    // students is the decision a human must make (§20, D24).
    const owner = capabilitiesFor('owner', 'member')
    expect(owner.has('release:deploy')).toBe(true)
    expect(owner.has('release:promote')).toBe(true)
    expect(isPrivileged('release:deploy')).toBe(false)
  })

  it('gives a collaborator neither member management nor promotion', () => {
    const collaborator = capabilitiesFor('collaborator', 'member')
    expect(collaborator.has('members:manage')).toBe(false)
    expect(collaborator.has('release:promote')).toBe(false)
    expect(collaborator.has('release:deploy')).toBe(true)
  })

  it('gives a platform admin the two admin capabilities, and no role holds secret read', () => {
    const admin = capabilitiesFor(null, 'admin')
    expect(admin.has('release:approve')).toBe(true)
    expect(admin.has('quota:set')).toBe(true)
    // `secret:read` is in D24's list and NOT in `Capability` (`[M8]`), so no role can
    // hold it. Asserted over the set's CONTENTS widened to strings, because
    // `admin.has('secret:read')` would not compile — which is the point being made.
    const held: readonly string[] = [...admin]
    expect(held).not.toContain('secret:read')
  })
})
