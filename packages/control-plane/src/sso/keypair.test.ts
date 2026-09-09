import { createSign, createVerify, X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getSecret } from '../secrets/index.js'
import { withSecretScope } from '../secrets/testing.js'
import { ensureSpKeypair } from './index.js'

const scopeFor = (projectId: string, environmentKind: 'sandbox' | 'staging') => ({
  projectId,
  environmentKind,
  slug: 'chem-labs',
  entityId: `https://manifest.internal/sp/chem-labs/${environmentKind}`,
})

describe('per-app SP keypairs (§9, D20)', () => {
  it('generates an RSA-4096 keypair whose certificate names the app and its entityID', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const kp = await ensureSpKeypair(db, keys, scopeFor(projectId, 'staging'))
      const cert = new X509Certificate(kp.certificatePem)
      // §9: "an RSA-4096 keypair". Assert the MODULUS, not that a PEM arrived.
      expect(cert.publicKey.asymmetricKeyDetails?.modulusLength).toBe(4096)
      expect(cert.subject).toContain('chem-labs')
      // The entityID is what the certificate is FOR, and it cannot go in the CN:
      // it contains '/', which is openssl's own RDN separator, and at §7's
      // 39-character slug limit it is 76 bytes against X.509's 64-byte common
      // name. Measured 2026-09-08 — `req: Missing '=' after RDN type string`.
      expect(cert.subjectAltName).toBe(
        'URI:https://manifest.internal/sp/chem-labs/staging',
      )
    })
  })

  it('is idempotent — the second call returns the SAME key', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const scope = scopeFor(projectId, 'staging')
      const first = await ensureSpKeypair(db, keys, scope)
      const second = await ensureSpKeypair(db, keys, scope)
      // A regenerated keypair silently invalidates the certData already in the
      // metadata row, and the symptom is "Invalid certificate signature" on a
      // login that worked yesterday (S2 Evidence 8).
      expect(second.certData).toBe(first.certData)
      expect(second.privateKeyPem).toBe(first.privateKeyPem)
    })
  })

  it('gives sandbox and staging DIFFERENT keys for one project', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const staging = await ensureSpKeypair(db, keys, scopeFor(projectId, 'staging'))
      const sandbox = await ensureSpKeypair(db, keys, scopeFor(projectId, 'sandbox'))
      // §9: "per app+environment ... so that a compromise is contained to a
      // single application" — and §11's sandbox rule on top.
      expect(sandbox.certData).not.toBe(staging.certData)
    })
  })

  it('emits certData with NO PEM armour and no newlines', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const kp = await ensureSpKeypair(db, keys, scopeFor(projectId, 'staging'))
      // S2: the row takes the base64 BODY. Armour in the row fails validation
      // with a message about the certificate, not about its encoding.
      expect(kp.certData).not.toContain('BEGIN CERTIFICATE')
      expect(kp.certData).not.toContain('\n')
      expect(kp.certData).toMatch(/^[A-Za-z0-9+/=]+$/)
      // And it is the SAME certificate, not merely base64-shaped: the row and
      // the file the app signs with have to be two views of one keypair.
      expect(new X509Certificate(Buffer.from(kp.certData, 'base64')).subject).toBe(
        new X509Certificate(kp.certificatePem).subject,
      )
    })
  })

  it('stores each half under its own name, and they pair', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      await ensureSpKeypair(db, keys, scopeFor(projectId, 'staging'))
      // Two secrets, two names, one transposition away from a pair that does not
      // pair — and read back through `getSecret` rather than trusting what
      // `ensureSpKeypair` returned, because the returned value is the one it
      // minted and the stored value is the one every later deploy will use.
      // S2 Evidence 8 measured what a mismatch costs: the IdP answers "Invalid
      // certificate signature" at login, nowhere near the code that stored it.
      const at = (name: string) => ({
        projectId,
        environmentKind: 'staging' as const,
        name,
      })
      const storedKey = await getSecret(db, at('sp:staging:privateKey'), keys)
      const storedCert = await getSecret(db, at('sp:staging:certificate'), keys)
      expect(storedKey).toContain('BEGIN PRIVATE KEY')
      expect(storedCert).toContain('BEGIN CERTIFICATE')
      const message = Buffer.from('signed AuthnRequest')
      const signature = createSign('sha256').update(message).sign(storedKey!)
      expect(
        createVerify('sha256')
          .update(message)
          .verify(new X509Certificate(storedCert!).publicKey, signature),
      ).toBe(true)
    })
  })

  it('records an expiry §9 can alert on', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const kp = await ensureSpKeypair(db, keys, scopeFor(projectId, 'staging'))
      const years = (kp.expiresAt.getTime() - Date.now()) / (365 * 24 * 3600 * 1000)
      // §9: saml-metadata-generator issues one to five years; D20 tracks the
      // date and alerts from 90 days out. Two years locally.
      expect(years).toBeGreaterThan(1.9)
      expect(years).toBeLessThan(2.1)
      // Read off the certificate rather than computed a second time here: the
      // date the IdP will enforce is the one in the certificate, and a value
      // computed twice is a value that can disagree with itself.
      expect(kp.expiresAt.getTime()).toBe(
        new Date(new X509Certificate(kp.certificatePem).validTo).getTime(),
      )
    })
  })
})
