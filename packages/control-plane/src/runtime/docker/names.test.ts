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

describe('mf- naming (§11 determinism, P1 ownership rule)', () => {
  it('prefixes the names the Driver interface already derived', () => {
    expect(appContainer(instanceName('chem-labs', 'staging', RELEASE))).toBe(
      'mf-chem-labs-staging-9f1c4d2e-app',
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
    const a = appContainer(instanceName('chem-labs', 'staging', RELEASE))
    expect(appContainer(instanceName('chem-labs', 'staging', RELEASE))).toBe(a)
    expect(appContainer(instanceName('chem-labs', 'production', RELEASE))).not.toBe(a)
  })

  // A service outlives a release (D3: its data survives redeploys), so its name
  // must NOT carry one. An instance is per release, so its name must.
  it('keeps services release-independent and instances release-dependent', () => {
    const other = '1a2b3c4d-0000-0000-0000-000000000000'
    expect(appContainer(instanceName('chem-labs', 'staging', RELEASE))).not.toBe(
      appContainer(instanceName('chem-labs', 'staging', other)),
    )
    expect(serviceContainer(serviceName('chem-labs', 'staging', 'db'))).toBe(
      serviceContainer(serviceName('chem-labs', 'staging', 'db')),
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
