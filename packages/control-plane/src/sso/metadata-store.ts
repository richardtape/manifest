import pg from 'pg'
import { SsoError } from './errors.js'
import type { SpEntity } from './entity.js'
import type { SpKeypair } from './keypair.js'

/**
 * The `entity_data` document, exactly as SimpleSAMLphp's PDO metadata handler
 * expects it: the JSON encoding of the PHP array that would otherwise sit in
 * `saml20-sp-remote.php` (S2 §2).
 *
 * `entityid` is deliberately absent. Measured on the running container
 * (`MetaDataStorageHandlerPdo.php:94-99, 185`): the handler injects it from the
 * `entity_id` COLUMN when the document does not carry one, and overwrites it
 * unconditionally in `getMetaData`. Writing it twice would create a second
 * source for the one value the row is keyed by.
 */
export interface SpMetadataRow {
  AssertionConsumerService: Array<{ index: number; Binding: string; Location: string }>
  SingleLogoutService: Array<{ Binding: string; Location: string }>
  NameIDFormat: string
  'simplesaml.attributes': boolean
  attributes: string[]
  'attributes.NameFormat': string
  authproc: Record<string, Record<string, string>>
  'saml20.sign.assertion': boolean
  'saml20.sign.response': boolean
  'validate.authnrequest': boolean
  'validate.logout': boolean
  certData: string
}

/**
 * The NameID format every Manifest SP registration declares, and the one an
 * AuthnRequest must therefore ask for.
 *
 * Exported because the control plane is itself an SP (§9) and its SAML client
 * has to send the same value the row declares — `@node-saml/node-saml` defaults
 * its `identifierFormat` to `…1.1:nameid-format:emailAddress`, which is not this,
 * and the two disagreeing is a login that fails at the IdP rather than at the
 * line that got it wrong. Transient because Manifest keys a user on
 * `ubcEduCwlPuid` (§9), never on the NameID.
 */
export const SP_NAME_ID_FORMAT = 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient'

/**
 * The `entity_data` value. Every key here is from S2's worked registration —
 * the one row that produced a complete login with enforced attribute release,
 * a per-app keypair, signed AuthnRequests and OID attribute naming.
 *
 * `authproc` at 60 with an INLINE OID for ubcEduCwlPuid: SimpleSAMLphp ships no
 * UBC attribute map, so the OID has to be supplied here. It must be
 * 1.3.6.1.4.1.60.6.1.6 — the value passport-ubcshib maps; P1's authsources.php
 * shipped .60.1.1.1 and nothing could read the attribute (measured 2026-09-07,
 * fixed in Task 2).
 */
export function renderSpMetadata(entity: SpEntity, keypair: SpKeypair): SpMetadataRow {
  return {
    AssertionConsumerService: [
      {
        index: 0,
        Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
        Location: entity.acsUrl,
      },
    ],
    SingleLogoutService: [
      {
        Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
        Location: entity.sloUrl,
      },
    ],
    NameIDFormat: SP_NAME_ID_FORMAT,
    'simplesaml.attributes': true,
    attributes: entity.attributes,
    'attributes.NameFormat': 'urn:oasis:names:tc:SAML:2.0:attrname-format:uri',
    authproc: {
      60: {
        class: 'core:AttributeMap',
        0: 'name2oid',
        ubcEduCwlPuid: 'urn:oid:1.3.6.1.4.1.60.6.1.6',
      },
    },
    'saml20.sign.assertion': true,
    'saml20.sign.response': true,
    // §9: "Both must be `true` in staging and production... requiring signed
    // AuthnRequests costs nothing" — Manifest mints the keypair anyway.
    'validate.authnrequest': true,
    'validate.logout': true,
    certData: keypair.certData,
  }
}

/**
 * The IdP's metadata database — a SECOND connection, on purpose.
 *
 * Decision 13: `MANIFEST_IDP_DATABASE_URL` is required and is never derived from
 * `MANIFEST_DATABASE_URL` by swapping the database name. *The test constructs
 * the value correctly and the running system re-derives it wrongly* is the most
 * expensive defect shape measured in this project (P3 Session 5, seven of them),
 * and a derived connection string is that shape waiting to happen.
 *
 * This is the one place the control plane writes to a database SimpleSAMLphp
 * reads, so every statement below is parameterized — §9 names that specifically.
 * The IdP itself connects as `ssp_ro`, which cannot write these rows.
 */
export function createIdpPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString })
}

/** The metadata set §9 registers into. One table, two columns (S2 §2). */
const TABLE = 'saml20_sp_remote'

interface PgError {
  code?: string
  constraint?: string
}

/**
 * A database refusal, translated where the reader is.
 *
 * `saml20_sp_remote_attributes_present` is §9's fail-open rule as a CHECK
 * constraint — the second of the two independent reads, `deriveSpEntity` being
 * the first. A raw `23514` from `pg` names a constraint and a table and reads as
 * a database fault; this names the rule.
 */
function translate(error: unknown, entityId: string): never {
  const pgError = error as PgError
  if (pgError?.code === '23514') {
    throw new SsoError(
      'SSO_SP_ROW_REFUSED',
      `the IdP database refused the registration for '${entityId}' (${pgError.constraint}). ` +
        'A row whose `attributes` list is empty or absent releases every attribute the ' +
        'IdP holds, so the database forbids it (§9).',
    )
  }
  throw error
}

export async function upsertSpRow(
  pool: pg.Pool,
  entityId: string,
  entityData: SpMetadataRow,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ${TABLE} (entity_id, entity_data) VALUES ($1, $2)
       ON CONFLICT (entity_id) DO UPDATE SET entity_data = EXCLUDED.entity_data`,
      [entityId, JSON.stringify(entityData)],
    )
  } catch (error) {
    translate(error, entityId)
  }
}

export async function readSpRow(
  pool: pg.Pool,
  entityId: string,
): Promise<SpMetadataRow | undefined> {
  const result = await pool.query<{ entity_data: string }>(
    `SELECT entity_data FROM ${TABLE} WHERE entity_id = $1`,
    [entityId],
  )
  const row = result.rows[0]
  if (row === undefined) return undefined
  return JSON.parse(row.entity_data) as SpMetadataRow
}

/**
 * Removes the registration. Returns whether a row was there to remove.
 *
 * Idempotent, and the return value says which case it was rather than being
 * discarded: "the SP was already gone" and "the SP has been removed" are
 * different events, and §9 makes both auditable.
 */
export async function deleteSpRow(pool: pg.Pool, entityId: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM ${TABLE} WHERE entity_id = $1`, [entityId])
  return (result.rowCount ?? 0) > 0
}
