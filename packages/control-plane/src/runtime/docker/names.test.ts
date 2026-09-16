import { describe, expect, it } from 'vitest'
import { instanceName, serviceName } from '../driver.js'
import {
  INSTANCE_ALIAS_PREFIX,
  MF_PREFIX,
  appContainer,
  appNetwork,
  egressContainer,
  instanceAlias,
  isManifestOwned,
  serviceContainer,
  serviceVolume,
} from './names.js'

// A real release id. Task 8 of P2 makes it `uuid().defaultRandom()`, so the first
// eight characters `instanceName` keeps are eight random hex digits — which is why
// truncating from the front is safe here and would not be for a prefixed id scheme.
const RELEASE = '9f1c4d2e-7a3b-4c5d-8e6f-0a1b2c3d4e5f'
// The instances table's own uuid (P4c): §11's key gained the instance, because a
// redeploy of one release is a new instance beside the one serving.
const INSTANCE = '3c7a91b4-5d2e-4f80-9a1b-6c5d4e3f2a10'
const OTHER_INSTANCE = '8e2f0a1b-6c5d-4e3f-2a10-3c7a91b45d2e'

describe('mf- naming (§11 determinism, P1 ownership rule)', () => {
  it('prefixes the names the Driver interface already derived', () => {
    expect(appContainer(instanceName('chem-labs', 'staging', RELEASE, INSTANCE))).toBe(
      'mf-chem-labs-staging-9f1c4d2e-3c7a91b4-app',
    )
    expect(serviceContainer(serviceName('chem-labs', 'staging', 'db'))).toBe(
      'mf-chem-labs-staging-db',
    )
    expect(serviceVolume(serviceName('chem-labs', 'staging', 'db'))).toBe(
      'mf-chem-labs-staging-db-data',
    )
    expect(appNetwork('chem-labs', 'staging')).toBe('mf-chem-labs-staging-net')
    expect(egressContainer('chem-labs', 'staging')).toBe('mf-chem-labs-staging-egress')
  })

  it('is stable across calls and distinct across environments', () => {
    const a = appContainer(instanceName('chem-labs', 'staging', RELEASE, INSTANCE))
    expect(appContainer(instanceName('chem-labs', 'staging', RELEASE, INSTANCE))).toBe(a)
    expect(
      appContainer(instanceName('chem-labs', 'production', RELEASE, INSTANCE)),
    ).not.toBe(a)
  })

  // A service outlives a release (D3: its data survives redeploys), so its name
  // must NOT carry one. An instance is per release, so its name must.
  it('keeps services release-independent and instances release-dependent', () => {
    const other = '1a2b3c4d-0000-0000-0000-000000000000'
    expect(
      appContainer(instanceName('chem-labs', 'staging', RELEASE, INSTANCE)),
    ).not.toBe(appContainer(instanceName('chem-labs', 'staging', other, INSTANCE)))
    expect(serviceContainer(serviceName('chem-labs', 'staging', 'db'))).toBe(
      serviceContainer(serviceName('chem-labs', 'staging', 'db')),
    )
  })

  // P4c: two deploys of ONE release are two instances, side by side during the drain,
  // so the container name has to tell them apart. With the release alone in the name
  // the second deploy could only replace the first — which is the ~1 s of 502s the
  // P4c brief measured on every same-release redeploy.
  it('gives two instances of the SAME release different container names', () => {
    expect(
      appContainer(instanceName('chem-labs', 'staging', RELEASE, INSTANCE)),
    ).not.toBe(
      appContainer(instanceName('chem-labs', 'staging', RELEASE, OTHER_INSTANCE)),
    )
  })

  /**
   * THE DIAL ADDRESS IS BOUNDED, AND THE CONTAINER NAME IS NOT (P4c Decision 2).
   *
   * A dial address is a DNS label and a label is at most 63 octets. With the
   * instance in the name (§11), a 39-character slug gives a 72-character container
   * name — and measured 2026-09-15 from inside the edge, a 72-character name does
   * not resolve at all: `curl: (6) Could not resolve host … (Misformatted domain
   * name)`, while a 17-character one answered 200. So the edge dials this instead.
   */
  it('gives the edge a dial address that fits in a DNS label, for any slug', () => {
    expect(instanceAlias(INSTANCE)).toBe(`mf-i-${INSTANCE}`)
    expect(instanceAlias(INSTANCE)).toHaveLength(41)
    expect(instanceAlias(INSTANCE).length).toBeLessThanOrEqual(63)
    // The longest name the platform can produce, for comparison: 39 characters is
    // the longest slug `descriptorSchema` accepts, and this is what the edge would
    // have had to dial without the alias.
    const longest = appContainer(
      instanceName('a'.repeat(39), 'staging', RELEASE, INSTANCE),
    )
    expect(longest.length).toBeGreaterThan(63)
    // Owned by this driver, so the ownership rule below covers it too.
    expect(isManifestOwned(instanceAlias(INSTANCE))).toBe(true)
    expect(INSTANCE_ALIAS_PREFIX.startsWith(MF_PREFIX)).toBe(true)
  })

  it('gives two instances different aliases, and one instance a stable one', () => {
    expect(instanceAlias(INSTANCE)).not.toBe(instanceAlias(OTHER_INSTANCE))
    expect(instanceAlias(INSTANCE)).toBe(instanceAlias(INSTANCE))
  })

  // P1's ownership rule, restated as code: nothing outside manifest-* and mf-* is
  // ever removed. These four names are real containers on the author's machine.
  it("recognises only mf- names as this driver's to destroy", () => {
    expect(MF_PREFIX).toBe('mf-')
    expect(isManifestOwned('mf-chem-labs-staging-9f1c4d2e-app')).toBe(true)
    expect(isManifestOwned('manifest-registry')).toBe(false)
    expect(isManifestOwned('docker-simple-saml-saml-idp-1')).toBe(false)
    expect(isManifestOwned('mongodb')).toBe(false)
  })
})
