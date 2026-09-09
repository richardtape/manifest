import { describe, expect, it } from 'vitest'
import { withSecretScope } from '../secrets/testing.js'
import { deriveCredentials, ensureServiceCredentials } from './index.js'

const binding = {
  name: 'chem-labs-staging-db',
  type: 'mongo',
  projectSlug: 'chem-labs',
}

describe('service credentials (§12 secrets, D3)', () => {
  it('adopts the DERIVED value the first time, so a running database keeps working', async () => {
    await withSecretScope(async (db, { projectId, keys, masterSecret }) => {
      const derived = deriveCredentials(masterSecret, binding)
      const got = await ensureServiceCredentials(
        db,
        keys,
        projectId,
        'staging',
        binding,
        masterSecret,
      )
      // Not a fresh random password. The Mongo container that already exists
      // holds the derived one, and nothing can change a running container's
      // root password — so a generated value here is an outage that reads as a
      // database fault (config.ts spells this out for the master secret).
      expect(got.password).toBe(derived.password)
      expect(got.username).toBe(derived.username)
      expect(got.database).toBe(derived.database)
    })
  })

  it('stores what it adopted, and returns the STORED value afterwards', async () => {
    await withSecretScope(async (db, { projectId, keys, masterSecret }) => {
      const first = await ensureServiceCredentials(
        db,
        keys,
        projectId,
        'staging',
        binding,
        masterSecret,
      )
      // A different master secret — as if .env had been regenerated. The stored
      // value must win, which is the entire point of storing it.
      const second = await ensureServiceCredentials(
        db,
        keys,
        projectId,
        'staging',
        binding,
        'x'.repeat(64),
      )
      expect(second.password).toBe(first.password)
      // And it is no longer the value the NEW master secret would derive —
      // which is the failure this migration exists to prevent.
      expect(second.password).not.toBe(
        deriveCredentials('x'.repeat(64), binding).password,
      )
    })
  })

  it('scopes the secret to the environment kind, so staging and sandbox differ', async () => {
    await withSecretScope(async (db, { projectId, keys, masterSecret }) => {
      const staging = await ensureServiceCredentials(
        db,
        keys,
        projectId,
        'staging',
        binding,
        masterSecret,
      )
      const sandbox = await ensureServiceCredentials(
        db,
        keys,
        projectId,
        'sandbox',
        { ...binding, name: 'chem-labs-sandbox-db' },
        masterSecret,
      )
      // §11: "a sandbox never receives staging or production secrets" —
      // enforced by the key, not by remembering.
      expect(sandbox.password).not.toBe(staging.password)
    })
  })

  it('is idempotent — every deploy of an unchanged service returns one password', async () => {
    await withSecretScope(async (db, { projectId, keys, masterSecret }) => {
      const calls = []
      for (let i = 0; i < 3; i++) {
        calls.push(
          await ensureServiceCredentials(
            db,
            keys,
            projectId,
            'staging',
            binding,
            masterSecret,
          ),
        )
      }
      // `ensureService` runs on EVERY deploy. A password that changed on the
      // second call would leave the app holding one the container has never
      // accepted — and P3's whole idempotence argument rests on this.
      expect(new Set(calls.map((c) => c.password)).size).toBe(1)
    })
  })
})
