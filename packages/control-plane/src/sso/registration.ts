import { readFile } from 'node:fs/promises'
import type pg from 'pg'
import type { Db } from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import { SsoError } from './errors.js'
import { secretValuesFor } from '../secrets/index.js'
import type { EnvironmentKind, MasterKeypair } from '../secrets/index.js'
import {
  deriveSpEntity,
  spEntityId,
  type SpEntity,
  type SpEntityInput,
} from './entity.js'
import {
  ensureSpCertificate,
  ensureSpKeypair,
  type SpCertificate,
  type SpKeypair,
  type SpKeypairScope,
} from './keypair.js'
import {
  deleteSpRow,
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
  /**
   * D23.2's stream (P4b Task 15). §9's two events reach it as well as the table: the
   * replay serves every recorded row, so recording one without publishing it is a
   * stream that shows it only on reconnect — and §9's ACS-change alert is exactly the
   * kind of subscriber D23.2 describes.
   */
  bus: EventBus,
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

  await publishEvent(
    db,
    bus,
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
    await publishEvent(
      db,
      bus,
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

export interface SpDeregistrationInput {
  projectId: string
  slug: string
  environmentKind: EnvironmentKind
  entityBase: string
}

/**
 * §11's archive (the front-end enablement plan's Task 11, Decision 28's fifth step): an app's
 * registration with the Manifest IdP, REMOVED — addressed by its entity id alone, because an
 * archive reads no release's auth block. Answers whether a row was there. `sso.deregistered` is
 * published only when one was — §9 audits every registration and change, and an archive retried
 * finds the row already gone, which is no second removal. The SP's keypair stays in the store with
 * every other secret an archive keeps; the next deploy after a restore registers the app again.
 *
 * A UBC registration is never Manifest's to remove (Spec action 6): on a laptop both sandbox's
 * and staging's are the Manifest IdP's, which is what this removes.
 */
export async function deregisterServiceProvider(
  db: Db,
  pool: pg.Pool,
  bus: EventBus,
  input: SpDeregistrationInput,
): Promise<boolean> {
  const entityId = spEntityId(input.entityBase, input.slug, input.environmentKind)
  const removed = await deleteSpRow(pool, entityId)
  if (!removed) return false
  // Nothing secret is in it: an entity id is published in the SP's own metadata.
  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `sp:${input.slug}:${input.environmentKind}`,
      type: 'sso.deregistered',
      machineDetail: { entityId },
      humanMessage: `Single sign-on was removed for ${input.slug} in ${input.environmentKind}.`,
    },
    makeRedactor([]),
  )
  return true
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
  /**
   * The IdP's PUBLIC signing certificate, as PEM — what §8's
   * `SAML_IDP_CERT_PATH` points at, and what the strategy throws at
   * construction without (`cert` is an IIFE, so `_fetchCertificate()` is
   * unreachable).
   *
   * On the registrar because everything a CWL deploy needs from the IdP arrives
   * through one dependency, and read PER DEPLOY rather than once at boot: the
   * keypair is minted by `make up` into a gitignored directory, so a re-minted
   * one is picked up without restarting the control plane. A deploy is not a
   * hot path.
   */
  idpSigningCertificate(): Promise<string>
}

/**
 * §11's archive: `deregisterServiceProvider`, the entity base bound (the front-end enablement
 * plan's Task 11). ITS OWN INTERFACE, not a third member of `SsoRegistrar`: a deploy registers and
 * never removes, so `DeployDeps` keeps asking for exactly what it uses, and the archive's deps ask
 * for this alone.
 */
export interface SsoDeregistrar {
  deregisterServiceProvider(
    db: Db,
    input: Omit<SpDeregistrationInput, 'entityBase'>,
  ): Promise<boolean>
}

/**
 * D19's PACKAGE: the environment's certificate, its public half, with the master key bound (the launch
 * path plan's Task 10). ITS OWN INTERFACE, for `SsoDeregistrar`'s reason: the package's drafting asks
 * for this alone, and on the registrar because the registrar is what holds the master key — `api/` and
 * `launch/` hold no key material, and this answer has no field for any.
 */
export interface SsoCertificates {
  spCertificate(db: Db, scope: SpKeypairScope): Promise<SpCertificate>
}

export function createSsoRegistrar(
  pool: pg.Pool,
  keys: MasterKeypair,
  entityBase: string,
  idpSigningCertPath: string,
  bus: EventBus,
): SsoRegistrar & SsoDeregistrar & SsoCertificates {
  return {
    spCertificate: (db, scope) => ensureSpCertificate(db, keys, scope),
    registerServiceProvider: (db, input) =>
      registerServiceProvider(db, pool, keys, bus, { ...input, entityBase }),
    deregisterServiceProvider: (db, input) =>
      deregisterServiceProvider(db, pool, bus, { ...input, entityBase }),
    idpSigningCertificate: async () => {
      let pem: string
      try {
        pem = await readFile(idpSigningCertPath, 'utf8')
      } catch {
        throw new SsoError(
          'SSO_IDP_CERT_UNREADABLE',
          `cannot read the IdP signing certificate at '${idpSigningCertPath}'. Run ` +
            '`make up`, which calls infra/lib/ensure-idp-keypair.sh. Without it an app ' +
            'that declares CWL cannot be given SAML_IDP_CERT_PATH, and passport-ubcshib ' +
            'throws at construction rather than starting.',
        )
      }
      // The shape, not that a read returned. An empty or truncated file is what
      // an interrupted mint leaves, and it fails inside the SP's XML parser with
      // a message about the assertion rather than about the certificate.
      if (!pem.includes('BEGIN CERTIFICATE')) {
        throw new SsoError(
          'SSO_IDP_CERT_INVALID',
          `the file at '${idpSigningCertPath}' is not a PEM certificate`,
        )
      }
      return pem
    },
  }
}

export type { EnvironmentKind }
