import { describe, expect, it } from 'vitest'
import { mayBuild } from './builders.js'

/**
 * WHO MAY BUILD (FE-39; §9, §6, §13 and §20 as Spec action 7 amended them — Rich's, confirmed
 * 2026-09-29). One predicate, and every refusal and `Me.mayBuild` reads it.
 */
describe('mayBuild — faculty, or an administrator', () => {
  it('a person whose last sign-in carried faculty may build, among other affiliations too', () => {
    expect(mayBuild({ role: 'member', affiliations: ['faculty'] })).toBe(true)
    expect(
      mayBuild({ role: 'member', affiliations: ['staff', 'faculty', 'member'] }),
    ).toBe(true)
  })

  it('only faculty exactly: staff, employee, member, Faculty and "faculty " may not build', () => {
    // Decision 30, Rich's: "literally just those with 'faculty' as their affiliation". No
    // case-folding and no trimming — UBC's value is compared as UBC sent it.
    for (const affiliation of [
      'staff',
      'employee',
      'member',
      'student',
      'Faculty',
      'faculty ',
      ' faculty',
      'FACULTY',
      '',
    ]) {
      expect(mayBuild({ role: 'member', affiliations: [affiliation] }), affiliation).toBe(
        false,
      )
    }
    expect(
      mayBuild({ role: 'member', affiliations: ['staff', 'employee', 'member'] }),
    ).toBe(false)
  })

  it('a person with no affiliation at all may not build', () => {
    expect(mayBuild({ role: 'member', affiliations: [] })).toBe(false)
  })

  it('an administrator may build, whatever their affiliation', () => {
    expect(mayBuild({ role: 'admin', affiliations: [] })).toBe(true)
    expect(mayBuild({ role: 'admin', affiliations: ['staff'] })).toBe(true)
  })
})
