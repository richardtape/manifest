import { describe, expect, it } from 'vitest'
import { instanceName, serviceName } from '../driver.js'
import {
  MF_PREFIX,
  appContainer,
  appNetwork,
  egressContainer,
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
