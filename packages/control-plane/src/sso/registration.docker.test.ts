import { afterAll, beforeAll, expect, it } from 'vitest'
import type pg from 'pg'
import { X509Certificate } from 'node:crypto'
import { describeDocker } from '../runtime/testing.js'
import { withSecretScope } from '../secrets/testing.js'
import { createIdpPool, deleteSpRow, readSpRow } from './metadata-store.js'
import { createSsoRegistrar, registerServiceProvider } from './registration.js'
import { SpEntityError } from './entity.js'
import { idpDatabaseUrl } from './testing.js'

/**
 * `registerServiceProvider`, against the real metadata database.
 *
 * The plan calls this file `registration.test.ts` — a unit test. It is a Docker
 * tier suite instead, for the reason `metadata-store.docker.test.ts` records:
 * the table is the IdP container's artefact. The alternative was a stub pool,
 * which would be a SECOND implementation of the store, and *the test constructs
 * the value correctly and the running system re-derives it wrongly* is the most
 * expensive defect shape this project has measured.
 */
describeDocker('registerServiceProvider (§9)', () => {
  let pool: pg.Pool
  const entityIds: string[] = []

  const input = (slug: string, overrides: Record<string, unknown> = {}) => ({
    projectId: '',
    slug,
    environmentKind: 'staging' as const,
    hostname: `${slug}.staging.manifest.internal`,
    entityBase: 'https://manifest.internal',
    auth: {
      provider: 'cwl' as const,
      callback: '/auth/ubcshib/callback',
      logout: '/auth/logout',
      attributes: ['ubcEduCwlPuid', 'mail'],
    },
    ...overrides,
  })

  beforeAll(() => {
    pool = createIdpPool(idpDatabaseUrl())
  })
  afterAll(async () => {
    // Unconditional: a leaked row broke the next `make up` once already, because
    // `ensure-idp-sql.sh` refuses to start while one violates the constraint.
    for (const entityId of entityIds) await deleteSpRow(pool, entityId)
    await pool.end()
  })

  it('writes a row the IdP can use, with the app certificate in it', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const entityId = 'https://manifest.internal/sp/reg-probe/staging'
      entityIds.push(entityId)
      const result = await registerServiceProvider(db, pool, keys, {
        ...input('reg-probe'),
        projectId,
      })

      expect(result.entity.entityId).toBe(entityId)
      expect(result.changed).toBe(true)
      expect(result.previousAcsUrl).toBeUndefined()

      const row = await readSpRow(pool, entityId)
      // The certificate in the row is the one the app will sign with — assert
      // they are the same key, not merely that a string arrived.
      expect(row?.certData).toBe(result.keypair.certData)
      expect(new X509Certificate(Buffer.from(row!.certData, 'base64')).subject).toContain(
        'reg-probe',
      )
      expect(row?.AssertionConsumerService[0]?.Location).toBe(
        'https://reg-probe.staging.manifest.internal/auth/ubcshib/callback',
      )
      // §9: both signing flags and both validation flags, from the row.
      expect(row?.['validate.authnrequest']).toBe(true)
      expect(row?.['saml20.sign.assertion']).toBe(true)
      expect(row?.attributes).toEqual(['ubcEduCwlPuid', 'mail'])
    })
  })

  it('re-registering an unchanged app keeps the SAME key and reports no change', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const entityId = 'https://manifest.internal/sp/reg-idem/staging'
      entityIds.push(entityId)
      const first = await registerServiceProvider(db, pool, keys, {
        ...input('reg-idem'),
        projectId,
      })
      const second = await registerServiceProvider(db, pool, keys, {
        ...input('reg-idem'),
        projectId,
      })

      // Every deploy calls this. A registration that rotated the keypair or
      // reported a change on every deploy would make §9's ACS alert worthless
      // by drowning it.
      expect(second.keypair.certData).toBe(first.keypair.certData)
      expect(second.changed).toBe(false)
      expect(second.previousAcsUrl).toBeUndefined()
    })
  })

  it('reports the PREVIOUS ACS URL when the app moves its callback', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const entityId = 'https://manifest.internal/sp/reg-moved/staging'
      entityIds.push(entityId)
      await registerServiceProvider(db, pool, keys, { ...input('reg-moved'), projectId })
      const moved = await registerServiceProvider(db, pool, keys, {
        ...input('reg-moved', {
          auth: {
            provider: 'cwl',
            callback: '/auth/somewhere-else',
            logout: '/auth/logout',
            attributes: ['ubcEduCwlPuid', 'mail'],
          },
        }),
        projectId,
      })

      // §9 alerts on an ACS change specifically. It is unrecoverable one
      // statement after the write, so the read happens first and the answer is
      // returned — Task 8 turns this into the Event.
      expect(moved.previousAcsUrl).toBe(
        'https://reg-moved.staging.manifest.internal/auth/ubcshib/callback',
      )
      expect(moved.changed).toBe(true)
      expect(
        (await readSpRow(pool, entityId))?.AssertionConsumerService[0]?.Location,
      ).toBe('https://reg-moved.staging.manifest.internal/auth/somewhere-else')
    })
  })

  it('writes NOTHING when the app supplies an origin instead of a path', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const entityId = 'https://manifest.internal/sp/reg-evil/staging'
      entityIds.push(entityId)
      await expect(
        registerServiceProvider(db, pool, keys, {
          ...input('reg-evil', {
            auth: {
              provider: 'cwl',
              callback: 'https://evil.example/acs',
              logout: '/auth/logout',
              attributes: ['ubcEduCwlPuid'],
            },
          }),
          projectId,
        }),
      ).rejects.toThrow(SpEntityError)
      // The refusal has to come BEFORE the row exists, or the IdP spends the
      // window between write and rollback willing to post assertions there.
      expect(await readSpRow(pool, entityId)).toBeUndefined()
    })
  })

  it('binds the pool, the master key and the entity base once', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const entityId = 'https://manifest.internal/sp/reg-bound/staging'
      entityIds.push(entityId)
      const registrar = createSsoRegistrar(pool, keys, 'https://manifest.internal')
      const { entityBase: _bound, ...unbound } = input('reg-bound')

      const result = await registrar.registerServiceProvider(db, {
        ...unbound,
        projectId,
      })

      // `releases/` gets THIS, so it never holds the IdP pool or key material —
      // the shape ServiceCredentialResolver already has (Task 5).
      expect(result.entity.entityId).toBe(entityId)
      expect(await readSpRow(pool, entityId)).not.toBeUndefined()
    })
  })
})
