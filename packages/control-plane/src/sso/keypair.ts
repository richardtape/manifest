import { execFile } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { promisify } from 'node:util'
import type { Db } from '../db/index.js'
import {
  getSecret,
  putSecret,
  type EnvironmentKind,
  type MasterKeypair,
} from '../secrets/index.js'
import { SsoError } from './errors.js'

const run = promisify(execFile)

/**
 * §7's slug rule, re-stated because this module puts a slug inside an X.509
 * distinguished name, where `/` and `=` are structural characters. Not imported
 * from `spec/`: `source/local-driver.ts` re-states it for the same reason on a
 * different path, and a guard whose condition is written twice is a guard.
 */
const SLUG = /^[a-z][a-z0-9-]{2,38}$/

/** Two years. §9 allows one to five; D20 alerts from 90 days out. */
const VALIDITY_DAYS = 730

export interface SpKeypair {
  privateKeyPem: string
  certificatePem: string
  /**
   * The base64 BODY of the certificate, no PEM armour and no newlines — the form
   * `saml20_sp_remote` wants (S2 Evidence 8). Armour in the row fails at
   * signature validation with a message about the certificate rather than about
   * its encoding, which is why this is a separate field with a separate name
   * rather than something a caller is trusted to strip.
   */
  certData: string
  /** SHA-256, colon-separated. What an operator compares against the row. */
  fingerprint: string
  expiresAt: Date
}

export interface SpKeypairScope {
  projectId: string
  environmentKind: EnvironmentKind
  /** §7's app slug. The certificate's common name is built from it. */
  slug: string
  /** The D15-derived entityID. Carried in the certificate's SAN, verbatim. */
  entityId: string
}

/**
 * The two secret names one SP keypair occupies.
 *
 * The environment kind is already part of a secret's scope, so repeating it in
 * the name buys nothing structural — it is here because these names are read by
 * humans in `secretValuesFor` output and in the redaction set Task 8 builds, and
 * `sp:staging:privateKey` says what it is without its row.
 */
const NAMES = (kind: EnvironmentKind) => ({
  privateKey: `sp:${kind}:privateKey`,
  certificate: `sp:${kind}:certificate`,
})

const PEM_BODY = /-----(BEGIN|END) CERTIFICATE-----|\s/g

/** Everything derivable from the pair, derived in ONE place. */
function describe(privateKeyPem: string, certificatePem: string): SpKeypair {
  const cert = new X509Certificate(certificatePem)
  return {
    privateKeyPem,
    certificatePem,
    certData: certificatePem.replace(PEM_BODY, ''),
    fingerprint: cert.fingerprint256,
    // Read off the certificate, never computed a second time from
    // VALIDITY_DAYS: the date that will actually be enforced is the one inside
    // the certificate, and a value produced twice is a value that can disagree
    // with itself (§9's expiry alerting is only as good as this date).
    expiresAt: new Date(cert.validTo),
  }
}

/**
 * A self-signed RSA-4096 certificate for one app+environment.
 *
 * **Why `openssl` and not `node:crypto`.** Node can generate the keypair and can
 * *parse* an X.509 certificate, but it has no API that ISSUES one — there is no
 * certificate-creation call in `node:crypto` at any version. The alternatives
 * were a new dependency (`@peculiar/x509`, `node-forge`), which needs the network
 * and a Verdaccio warm-up for a build that must work offline, or hand-rolling an
 * ASN.1 DER encoder, which Decision 7 already rejected in principle — owning a
 * bespoke encoding of a standard format is the wrong thing to own. `source/`
 * spawns `git` and `runtime/docker/` spawns `docker`, so spawning a host tool is
 * an established shape here. Note that `make doctor` asserts NEITHER — `git` has
 * been a hard requirement since P2 and is not checked either — so the failure
 * this must produce is a legible one, which is why an ENOENT from the spawn is
 * wrapped in a message naming the entityID it could not mint a keypair for.
 *
 * Measured 2026-09-08 against both flavours on this machine — LibreSSL 3.3.6 at
 * `/usr/bin/openssl` and OpenSSL 3.6.3 from Homebrew — with identical output:
 * `-keyout /dev/stdout -out /dev/stdout` emits both PEM blocks on stdout and the
 * progress noise on stderr, so **the private key never touches a file**. A temp
 * file would survive a crash; this cannot.
 *
 * The entityID goes in a `subjectAltName` URI rather than the common name, for
 * two measured reasons: openssl's `-subj` uses `/` as its RDN separator, so a URL
 * common name is refused outright (`Missing '=' after RDN type string`), and at
 * §7's 39-character slug limit the entityID is 76 bytes against X.509's 64-byte
 * limit for a common name.
 */
async function generate(scope: SpKeypairScope): Promise<SpKeypair> {
  if (!SLUG.test(scope.slug)) {
    throw new SsoError(
      'SSO_INVALID_SLUG',
      `invalid project slug '${scope.slug}' — must match ${SLUG.source}`,
    )
  }
  const subject = `/CN=${scope.slug}-${scope.environmentKind}/O=Manifest`
  let stdout: string
  try {
    ;({ stdout } = await run('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:4096',
      '-nodes',
      '-sha256',
      '-days',
      String(VALIDITY_DAYS),
      '-keyout',
      '/dev/stdout',
      '-out',
      '/dev/stdout',
      '-subj',
      subject,
      '-addext',
      `subjectAltName=URI:${scope.entityId}`,
    ]))
  } catch (cause) {
    throw new SsoError(
      'SSO_KEYPAIR_GENERATION_FAILED',
      `could not mint an SP keypair for '${scope.entityId}': ` +
        (cause instanceof Error ? cause.message : String(cause)),
    )
  }

  // Matched rather than split on order: openssl writes the key first today, and
  // a function that depends on that is one openssl release from storing a
  // certificate as a private key.
  const privateKeyPem =
    /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----\n?/.exec(stdout)?.[0]
  const certificatePem =
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----\n?/.exec(stdout)?.[0]
  if (privateKeyPem === undefined || certificatePem === undefined) {
    throw new SsoError(
      'SSO_KEYPAIR_GENERATION_FAILED',
      `openssl produced no ${privateKeyPem === undefined ? 'private key' : 'certificate'} ` +
        `for '${scope.entityId}'`,
    )
  }
  return describe(privateKeyPem, certificatePem)
}

/**
 * The SP keypair for one app+environment: generated once, returned thereafter.
 *
 * §9 puts a keypair per app+environment "so that a compromise is contained to a
 * single application", and D20 tracks its expiry. Idempotence is the whole
 * contract: the certificate is copied into `saml20_sp_remote` as `certData`, so
 * a second call that regenerated would leave the row pinning a certificate the
 * app no longer holds, and S2 Evidence 8 measured what the IdP then says —
 * *"Invalid certificate signature"*, on a login that worked yesterday.
 *
 * If exactly one of the two secrets is present — a crash between the two writes
 * — both are regenerated and stored. That is a rotation rather than a repair,
 * and it is safe here for one reason: the only caller is
 * `registerServiceProvider`, which upserts the metadata row from the keypair it
 * gets back, so the row and the app move together. A partial pair cannot be
 * repaired, since neither half can be recovered from the other.
 */
export async function ensureSpKeypair(
  db: Db,
  keys: MasterKeypair,
  scope: SpKeypairScope,
): Promise<SpKeypair> {
  const names = NAMES(scope.environmentKind)
  const at = (name: string) => ({
    projectId: scope.projectId,
    environmentKind: scope.environmentKind,
    name,
  })
  const [privateKeyPem, certificatePem] = await Promise.all([
    getSecret(db, at(names.privateKey), keys),
    getSecret(db, at(names.certificate), keys),
  ])
  if (privateKeyPem !== undefined && certificatePem !== undefined) {
    return describe(privateKeyPem, certificatePem)
  }

  const minted = await generate(scope)
  // Sequential, not Promise.all: two writes to one table through one transaction
  // handle, and drizzle's transaction is a single connection.
  await putSecret(db, { ...at(names.privateKey), value: minted.privateKeyPem }, keys)
  await putSecret(db, { ...at(names.certificate), value: minted.certificatePem }, keys)
  return minted
}
