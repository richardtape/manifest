import { describe, expect, it } from 'vitest'
import { REQUIRED_CAPABILITY_KEYS } from './hardening.js'
import { dockerCapabilities } from './driver.js'

describe('what this driver honestly reports', () => {
  it('reports every field the interface declares — no omissions', () => {
    const caps = dockerCapabilities({ userns: false, diskQuota: false })
    expect(Object.keys(caps).sort()).toEqual(Object.keys(REQUIRED_CAPABILITY_KEYS).sort())
  })

  // §11 and §21 divergence 6. `container` is the weakest level, and saying so is
  // what lets sandboxes be upgraded to a stronger runtime later without redesign.
  it('reports the weakest isolation level, because that is what a container is', () => {
    expect(dockerCapabilities({ userns: false, diskQuota: false }).isolationLevel).toBe(
      'container',
    )
  })

  it("passes the daemon's answers through rather than asserting them", () => {
    expect(dockerCapabilities({ userns: true, diskQuota: true })).toMatchObject({
      enforcesUserNamespaceRemapping: true,
      enforcesDiskQuota: true,
    })
    expect(dockerCapabilities({ userns: false, diskQuota: false })).toMatchObject({
      enforcesUserNamespaceRemapping: false,
      enforcesDiskQuota: false,
    })
  })

  // §13's promotion rule reads this. A local driver must never claim a remote target.
  it('is not a remote target', () => {
    expect(dockerCapabilities({ userns: false, diskQuota: false }).remoteTarget).toBe(
      false,
    )
  })

  it("enforces egress, because §12's forced proxy and internal network do", () => {
    expect(dockerCapabilities({ userns: false, diskQuota: false }).enforcesEgress).toBe(
      true,
    )
  })
})
