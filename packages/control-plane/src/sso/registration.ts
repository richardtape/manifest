import type pg from 'pg'
import type { Db } from '../db/index.js'
import { makeRedactor, recordEvent } from '../observability/index.js'
import { secretValuesFor } from '../secrets/index.js'
import type { EnvironmentKind, MasterKeypair } from '../secrets/index.js'
import { deriveSpEntity, type SpEntity, type SpEntityInput } from './entity.js'
import { ensureSpKeypair, type SpKeypair } from './keypair.js'
import {
  readSpRow,
  renderSpMetadata,
  upsertSpRow,
  type SpMetadataRow,
} from './metadata-store.js'

export interface SpRegistrationInput extends SpEntityInput {
  /** Whose secrets the keypair is stored under. Not part of the SAML identity. */
  projectId: string
}

export interface SpRegistration {
  entity: SpEntity
  keypair: SpKeypair
  /** False when the registration this call wrote is byte-identical to the one it found. */
  changed: boolean
  /**
   * The ACS URL the IdP would have posted an assertion to a moment ago, when
   * that differs from the one now registered.
   *
   * §9 alerts on an ACS change SPECIFICALLY, and nothing can detect one after
   * the write — so it is read here, before the upsert, and handed to the caller
   * that records the audit Event (Task 8).
   */
  previousAcsUrl?: string
}

/** Key order made irrelevant, so "changed" means the DOCUMENT changed. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

/**
 * §9's registration, end to end: derive, mint or reuse the keypair, write one row.
 *
 * The order is load-bearing in two places. The existing row is read BEFORE the
 * upsert, because an ACS change is exactly what §9 asks to be alerted on and it
 * is unrecoverable a statement later. And the keypair is ensured BEFORE the row
 * is rendered, because the row pins the certificate: rendering from a keypair
 * that a later call replaces leaves the IdP validating signatures against a key
 * the app no longer holds (S2 Evidence 8 — *"Invalid certificate signature"*).
 *
 * Nothing here is app-supplied except two paths and a list of attribute names.
 * §9: *"Origins are never accepted as input."*
 */
export async function registerServiceProvider(
  db: Db,
  pool: pg.Pool,
  keys: MasterKeypair,
  input: SpRegistrationInput,
): Promise<SpRegistration> {
  const entity = deriveSpEntity(input)
  const keypair = await ensureSpKeypair(db, keys, {
    projectId: input.projectId,
    environmentKind: input.environmentKind,
    slug: input.slug,
    entityId: entity.entityId,
  })

  const previous: SpMetadataRow | undefined = await readSpRow(pool, entity.entityId)
  const rendered = renderSpMetadata(entity, keypair)
  await upsertSpRow(pool, entity.entityId, rendered)

  const previousAcsUrl = previous?.AssertionConsumerService[0]?.Location
  const registration: SpRegistration = {
    entity,
    keypair,
    changed: previous === undefined || canonical(previous) !== canonical(rendered),
    ...(previousAcsUrl !== undefined && previousAcsUrl !== entity.acsUrl
      ? { previousAcsUrl }
      : {}),
  }

  // §9: "Every registration and change is an append-only audit Event, with
  // alerting specifically on ACS URL changes."
  //
  // The redactor is built from the app's OWN secret set, which at this point
  // includes the SP private key this call may just have minted. Nothing below
  // puts key material in an event — but §14's rule is that the unredacted form is
  // never persisted, and a redactor assembled from what happens to be in the
  // event is a redactor that stops working the first time somebody adds a field.
  const redact = makeRedactor(
    (
      await secretValuesFor(
        db,
        { projectId: input.projectId, environmentKind: input.environmentKind },
        keys,
      )
    ).values(),
  )

  await recordEvent(
    db,
    {
      projectId: input.projectId,
      subject: `sp:${input.slug}:${input.environmentKind}`,
      type: 'sso.registered',
      machineDetail: {
        entityId: entity.entityId,
        acsUrl: entity.acsUrl,
        attributes: entity.attributes,
        certificateFingerprint: keypair.fingerprint,
        changed: registration.changed,
      },
      humanMessage: `Single sign-on was set up for ${input.slug} in ${input.environmentKind}.`,
    },
    redact,
  )

  // A SECOND event rather than a field on the first, because §9 alerts on this
  // one specifically. An alert that has to parse `machine_detail` to find out
  // whether it should fire is an alert nobody writes correctly.
  if (registration.previousAcsUrl !== undefined) {
    await recordEvent(
      db,
      {
        projectId: input.projectId,
        subject: `sp:${input.slug}:${input.environmentKind}`,
        type: 'sso.acs_changed',
        machineDetail: { from: registration.previousAcsUrl, to: entity.acsUrl },
        humanMessage: `Where ${input.slug} receives sign-in responses has changed.`,
      },
      redact,
    )
  }

  return registration
}

/**
 * `registerServiceProvider` with the platform's own values already bound.
 *
 * `releases/` never holds the IdP pool or the master keypair, and `DeployDeps`
 * gains one field rather than three — the same shape `ServiceCredentialResolver`
 * already has, and for the same reason. `db` stays per-call because the caller
 * may be inside a transaction.
 */
export interface SsoRegistrar {
  registerServiceProvider(
    db: Db,
    input: Omit<SpRegistrationInput, 'entityBase'>,
  ): Promise<SpRegistration>
}

export function createSsoRegistrar(
  pool: pg.Pool,
  keys: MasterKeypair,
  entityBase: string,
): SsoRegistrar {
  return {
    registerServiceProvider: (db, input) =>
      registerServiceProvider(db, pool, keys, { ...input, entityBase }),
  }
}

export type { EnvironmentKind }
