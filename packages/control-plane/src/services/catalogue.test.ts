import { describe, expect, it } from 'vitest'
import {
  SERVICE_CATALOGUE,
  ServiceCatalogueError,
  deriveCredentials,
  resolveServiceImage,
} from './index.js'

describe('the platform service catalogue (§20)', () => {
  it('pins every image by digest, never by tag alone', () => {
    for (const entry of Object.values(SERVICE_CATALOGUE)) {
      expect(entry.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
  })

  // The URI scheme is not the service type, and the difference is not cosmetic:
  // measured, `mongo://…` is rejected outright by mongosh as an invalid URI, and
  // an endpoint without `authSource=admin` fails every authentication because
  // Mongo's root user lives in `admin`, not in the app's database. Both were
  // real defects; both are catchable here, with no Docker.
  it('carries a URI scheme distinct from the service type', () => {
    expect(resolveServiceImage('mongo', '7').uriScheme).toBe('mongodb')
    expect(resolveServiceImage('mongo', '7').uriQuery).toBe('authSource=admin')
    for (const [type, entry] of Object.entries(SERVICE_CATALOGUE)) {
      expect(entry.uriScheme, `${type} must name its scheme`).not.toBe('')
    }
  })

  it('resolves a supported version line', () => {
    const mongo = resolveServiceImage('mongo', '7')
    expect(mongo.image).toBe('mongodb/mongodb-community-server')
    expect(mongo.port).toBe(27017)
  })

  // An app choosing an arbitrary tag is what §20's "platform-owned, platform-pinned"
  // exists to prevent — otherwise the fleet-wide "rebuild every app on base image X"
  // operation has no fleet to speak of.
  it('refuses a version line the platform does not support', () => {
    expect(() => resolveServiceImage('mongo', '4')).toThrow(ServiceCatalogueError)
    expect(() => resolveServiceImage('postgres', '16')).toThrow(ServiceCatalogueError)
  })
})

describe('derived service credentials', () => {
  const binding = {
    name: 'chem-labs-staging-db',
    type: 'mongo',
    version: '7',
    environmentId: 'env-1',
    projectSlug: 'chem-labs',
  }

  it('is deterministic, which is what makes ensureService idempotent', () => {
    expect(deriveCredentials('secret'.repeat(6), binding)).toEqual(
      deriveCredentials('secret'.repeat(6), binding),
    )
  })

  it('differs per app and per environment', () => {
    const a = deriveCredentials('secret'.repeat(6), binding)
    const b = deriveCredentials('secret'.repeat(6), {
      ...binding,
      name: 'chem-labs-production-db',
    })
    expect(b.password).not.toBe(a.password)
  })

  // §11, stated concretely because it is easy to violate by accident: a sandbox
  // never receives staging or production secrets. Different name => different key.
  it('gives a sandbox its own throwaway credentials', () => {
    const staging = deriveCredentials('secret'.repeat(6), binding)
    const sandbox = deriveCredentials('secret'.repeat(6), {
      ...binding,
      name: 'chem-labs-sandbox-db',
    })
    expect(sandbox.password).not.toBe(staging.password)
  })

  it('never emits a password containing a URI delimiter', () => {
    const { password } = deriveCredentials('secret'.repeat(6), binding)
    expect(password).toMatch(/^[0-9a-f]{32}$/)
  })
})
