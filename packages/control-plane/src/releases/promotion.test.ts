import { describe, expect, it } from 'vitest'
import { createFakeDriver } from '../runtime/index.js'
import { ReleaseError } from './release.js'
import { assertPromotable, isLocallyBuilt } from './promotion.js'

const localImage = {
  repository: '127.0.0.1:7107/local/chem-labs',
  digest: `sha256:${'a'.repeat(64)}`,
}
const ciImage = {
  repository: 'registry.ubc.ca/manifest/chem-labs',
  digest: `sha256:${'b'.repeat(64)}`,
}

describe('§13: images built on a laptop never reach UBC infrastructure', () => {
  it('recognises the local namespace wherever the registry host sits', () => {
    expect(isLocallyBuilt(localImage)).toBe(true)
    expect(
      isLocallyBuilt({ ...localImage, repository: 'manifest-registry:5000/local/x' }),
    ).toBe(true)
    // The bare form deployRelease actually produces today.
    expect(isLocallyBuilt({ ...localImage, repository: 'local/chem-labs' })).toBe(true)
    expect(isLocallyBuilt(ciImage)).toBe(false)
  })

  // A repository whose FIRST segment merely ends in `local` is not the namespace,
  // and a project legitimately named `local-notes` is not a local image either.
  it('does not match a host or a slug that merely looks like the namespace', () => {
    expect(isLocallyBuilt({ ...ciImage, repository: 'notlocal/chem-labs' })).toBe(false)
    expect(
      isLocallyBuilt({ ...ciImage, repository: 'registry.ubc.ca/manifest/local-notes' }),
    ).toBe(false)
  })

  it('lets a LOCAL driver deploy a local image — this is what makes §1 work offline', () => {
    const driver = createFakeDriver({ capabilities: { remoteTarget: false } })
    expect(() => assertPromotable(driver, localImage)).not.toThrow()
  })

  // THE RULE. One flag, and the same image becomes unpromotable.
  it('REFUSES a local image on a driver that targets somewhere else', () => {
    const driver = createFakeDriver({ capabilities: { remoteTarget: true } })
    expect(() => assertPromotable(driver, localImage)).toThrow(ReleaseError)
    try {
      assertPromotable(driver, localImage)
      expect.unreachable('assertPromotable should have thrown')
    } catch (error) {
      expect((error as ReleaseError).code).toBe('RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER')
      // The message has to explain the architecture problem, because the person
      // reading it will otherwise try to force it.
      // ReleaseError has no separate `hint` field; the reasoning is in the message.
      expect((error as ReleaseError).message).toMatch(/arm64|architecture|CI/i)
    }
  })

  it('lets a remote driver deploy a CI-built image', () => {
    const driver = createFakeDriver({ capabilities: { remoteTarget: true } })
    expect(() => assertPromotable(driver, ciImage)).not.toThrow()
  })

  // The rule is about the DRIVER, not the environment kind. A laptop's own
  // production environment is still the local driver, and still allowed.
  it('says nothing about the environment kind', () => {
    const driver = createFakeDriver({ capabilities: { remoteTarget: false } })
    expect(() => assertPromotable(driver, localImage)).not.toThrow()
    expect(assertPromotable.length).toBe(2)
  })
})
