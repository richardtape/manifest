import { afterAll, beforeAll, expect, it } from 'vitest'
import type pg from 'pg'
import { describeDocker } from '../runtime/testing.js'
import { deriveSpEntity } from './entity.js'
import { mintSpKeypair } from './keypair.js'
import {
  createIdpPool,
  deleteSpRow,
  readSpRow,
  renderSpMetadata,
  upsertSpRow,
  type SpMetadataRow,
} from './metadata-store.js'
import { SsoError } from './errors.js'
import { idpDatabaseUrl } from './testing.js'

/**
 * The one place the control plane writes to a database SimpleSAMLphp reads.
 *
 * Docker tier rather than unit, because everything under test is an artefact of a
 * RUNNING platform and not of Postgres alone: `saml20_sp_remote` is created by
 * the IdP container's own entrypoint (`initMDSPdo.php`), and the CHECK constraint
 * this suite leans on is applied by `infra/lib/ensure-idp-sql.sh` during
 * `make up`. A suite that created either itself would be asserting against its
 * own fixture rather than against the IdP.
 */
describeDocker('the SP metadata store (§9, S2)', () => {
  let pool: pg.Pool
  const entityIds: string[] = []

  const entity = (slug: string) =>
    deriveSpEntity({
      slug,
      environmentKind: 'staging',
      hostname: `${slug}.staging.manifest.internal`,
      entityBase: 'https://manifest.internal',
      auth: {
        provider: 'cwl',
        callback: '/auth/ubcshib/callback',
        logout: '/auth/logout',
        attributes: ['ubcEduCwlPuid', 'mail'],
      },
    })

  beforeAll(() => {
    pool = createIdpPool(idpDatabaseUrl())
  })

  afterAll(async () => {
    // Unconditionally, and not swallowed. A leaked row broke the NEXT `make up`
    // once already: `ensure-idp-sql.sh` refuses to start while a row violates
    // the attributes constraint, and it names no row (defect 9, 2026-09-08).
    for (const entityId of entityIds) await deleteSpRow(pool, entityId)
    await pool.end()
  })

  it('round-trips a rendered registration', async () => {
    const sp = entity('store-probe')
    entityIds.push(sp.entityId)
    const keypair = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'store-probe',
      entityId: sp.entityId,
    })
    const rendered = renderSpMetadata(sp, keypair)

    await upsertSpRow(pool, sp.entityId, rendered)
    const read = await readSpRow(pool, sp.entityId)

    // The WHOLE document, not a field of it. S2's worked row is the contract and
    // every key in it earned its place; asserting two of them would let the rest
    // drift silently, and a missing `certData` under `validate.authnrequest` is
    // an UNHANDLEDEXCEPTION at login rather than a clear refusal.
    expect(read).toEqual(rendered)
    // The numeric authproc priority survives JSON. SimpleSAMLphp reads it as a
    // chain position, and 60 must land AFTER core:AttributeLimit at 50 or the
    // limit compares OIDs against friendly names and releases nothing.
    expect(Object.keys(read?.authproc ?? {})).toEqual(['60'])
  })

  it('replaces the row on a second registration rather than duplicating it', async () => {
    const sp = entity('store-upsert')
    entityIds.push(sp.entityId)
    const scope = {
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging' as const,
      slug: 'store-upsert',
      entityId: sp.entityId,
    }
    await upsertSpRow(pool, sp.entityId, renderSpMetadata(sp, await mintSpKeypair(scope)))
    const second = await mintSpKeypair(scope)
    await upsertSpRow(pool, sp.entityId, renderSpMetadata(sp, second))

    const read = await readSpRow(pool, sp.entityId)
    expect(read?.certData).toBe(second.certData)
    const count = await pool.query(
      'SELECT count(*)::int AS n FROM saml20_sp_remote WHERE entity_id = $1',
      [sp.entityId],
    )
    expect(count.rows[0]?.n).toBe(1)
  })

  it('is refused by the database when the attribute list is empty', async () => {
    // §9's fail-open field, read for the SECOND time — `deriveSpEntity` refuses
    // this before it ever reaches SQL. This asserts the constraint is in force
    // THROUGH THIS CODE PATH, which is the only way to know the row the store
    // writes is the row the constraint inspects.
    const sp = entity('store-empty')
    entityIds.push(sp.entityId)
    const keypair = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'store-empty',
      entityId: sp.entityId,
    })
    const emptied: SpMetadataRow = { ...renderSpMetadata(sp, keypair), attributes: [] }

    await expect(upsertSpRow(pool, sp.entityId, emptied)).rejects.toThrow(SsoError)
    expect(await readSpRow(pool, sp.entityId)).toBeUndefined()
  })

  it('is refused when the attributes key is ABSENT, not merely empty', async () => {
    // `jsonb_array_length(NULL)` is NULL and `NULL > 0` is NULL, which a CHECK
    // ACCEPTS — so the constraint written without COALESCE rejected `[]` and
    // waved this row through, and core:AttributeLimit treats the two identically
    // (defect 7, 2026-09-08).
    const sp = entity('store-absent')
    entityIds.push(sp.entityId)
    const keypair = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'store-absent',
      entityId: sp.entityId,
    })
    const { attributes: _dropped, ...withoutAttributes } = renderSpMetadata(sp, keypair)

    await expect(
      upsertSpRow(pool, sp.entityId, withoutAttributes as SpMetadataRow),
    ).rejects.toThrow(/attributes/i)
    expect(await readSpRow(pool, sp.entityId)).toBeUndefined()
  })

  it('deletes idempotently, and says which case it was', async () => {
    const sp = entity('store-delete')
    entityIds.push(sp.entityId)
    const keypair = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'store-delete',
      entityId: sp.entityId,
    })
    await upsertSpRow(pool, sp.entityId, renderSpMetadata(sp, keypair))

    // "the SP was removed" and "the SP was already gone" are different events,
    // and §9 makes both auditable — so the answer is returned rather than
    // discarded, and the second call does not throw.
    expect(await deleteSpRow(pool, sp.entityId)).toBe(true)
    expect(await deleteSpRow(pool, sp.entityId)).toBe(false)
    expect(await readSpRow(pool, sp.entityId)).toBeUndefined()
  })
})
