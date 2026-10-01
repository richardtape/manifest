import { beforeAll, describe, expect, it } from 'vitest'
import {
  ATTRIBUTE_OIDS,
  mintSpKeypair,
  publicHalf,
  type SpCertificate,
} from '../sso/index.js'
import { assemblePackage, ATTRIBUTE_PURPOSES, type PackageInput } from './package.js'

/**
 * D19'S REGISTRATION PACKAGE, ASSEMBLED (the launch path plan's Task 10, Decisions 12–15): every
 * value derived — the entity, the environment's own certificate, each attribute's purpose and the
 * lines that read it, the contacts, the PIA number — and the SP metadata rendered from those same
 * values. A justification is derived, never written by a model (Decision 13).
 */

let certificate: SpCertificate
beforeAll(async () => {
  certificate = publicHalf(
    await mintSpKeypair({
      projectId: '',
      environmentKind: 'staging',
      slug: 'lp-sample',
      entityId: 'https://manifest.internal/sp/lp-sample/staging',
    }),
  )
})

const input = (over: Partial<PackageInput> = {}): PackageInput => ({
  environment: 'staging',
  generatedAt: new Date('2026-10-01T15:00:00.000Z'),
  fromCommit: 'a'.repeat(40),
  entity: {
    entityId: 'https://manifest.internal/sp/lp-sample/staging',
    acsUrl: 'https://lp-sample.staging.manifest.internal/auth/ubcshib/callback',
    sloUrl: 'https://lp-sample.staging.manifest.internal/auth/logout',
    attributes: ['ubcEduCwlPuid', 'mail'],
  },
  certificate,
  uses: {
    ubcEduCwlPuid: [
      { path: 'server.js', line: 12 },
      { path: 'routes/posts.js', line: 40 },
    ],
    mail: [{ path: 'public/app.js', line: 25 }],
  },
  usedAtTruncated: false,
  contacts: {
    technical: [{ name: 'Bio Prof', email: 'bio.prof@example.ubc.ca' }],
    support: [{ name: 'Platform Admin', email: 'admin@example.ubc.ca' }],
  },
  privacyAssessmentReference: 'PIA-2026-0088',
  warnings: [],
  ...over,
})

describe('ATTRIBUTE_PURPOSES (Task 10)', () => {
  it('names a purpose for every attribute the bridge knows — one plain sentence each, no references', () => {
    expect(Object.keys(ATTRIBUTE_PURPOSES).sort()).toEqual(
      Object.keys(ATTRIBUTE_OIDS).sort(),
    )
    for (const [name, purpose] of Object.entries(ATTRIBUTE_PURPOSES)) {
      expect(purpose, name).toMatch(/^[A-Z].*\.$/)
      expect(purpose, name).not.toMatch(/§|\bD\d+\b|[.!?] [A-Z]/)
    }
  })
})

describe('assemblePackage (Task 10)', () => {
  it('justifies each attribute by where the app reads it — its code, and what it shows in the browser', () => {
    const pkg = assemblePackage(input())
    expect(pkg.attributes).toEqual([
      {
        name: 'ubcEduCwlPuid',
        oid: ATTRIBUTE_OIDS.ubcEduCwlPuid,
        purpose: ATTRIBUTE_PURPOSES.ubcEduCwlPuid,
        usedAt: [
          { path: 'server.js', line: 12 },
          { path: 'routes/posts.js', line: 40 },
        ],
        justification: `${ATTRIBUTE_PURPOSES.ubcEduCwlPuid} The app reads it in server.js:12 and routes/posts.js:40.`,
        unused: false,
      },
      {
        name: 'mail',
        oid: ATTRIBUTE_OIDS.mail,
        purpose: ATTRIBUTE_PURPOSES.mail,
        usedAt: [{ path: 'public/app.js', line: 25 }],
        justification: `${ATTRIBUTE_PURPOSES.mail} The app shows it to the person in the browser, in public/app.js:25.`,
        unused: false,
      },
    ])
    expect(pkg.warnings).toEqual([])
  })

  it('a read in the app’s code and in the browser says both, and a long list says how many more', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ path: 'server.js', line: i + 1 }))
    const pkg = assemblePackage(
      input({
        uses: {
          ubcEduCwlPuid: many,
          mail: [
            { path: 'server.js', line: 9 },
            { path: 'public/app.js', line: 25 },
          ],
        },
      }),
    )
    expect(pkg.attributes.map((a) => a.justification)).toEqual([
      `${ATTRIBUTE_PURPOSES.ubcEduCwlPuid} The app reads it in server.js:1, server.js:2, server.js:3, server.js:4 and server.js:5, and 2 more places.`,
      `${ATTRIBUTE_PURPOSES.mail} The app reads it in server.js:9, and shows it to the person in the browser, in public/app.js:25.`,
    ])
  })

  it('an attribute the app never reads is flagged unused, with a warning to remove it before sending', () => {
    const pkg = assemblePackage(
      input({ uses: { ubcEduCwlPuid: [{ path: 'server.js', line: 1 }], mail: [] } }),
    )
    const mail = pkg.attributes.find((a) => a.name === 'mail')!
    expect(mail.unused).toBe(true)
    expect(mail.usedAt).toEqual([])
    expect(mail.justification).toBe(
      'The app asks for it and does not read it anywhere Manifest looked — remove it from `auth.attributes` before you send this.',
    )
    expect(pkg.warnings).toEqual([
      'The app asks for mail and does not read it anywhere Manifest looked. Remove it from auth.attributes, validate the manifest and draft this again before you send it — UBC IAM asks why an app needs each attribute.',
    ])
    // The positive control: an attribute that IS read is not flagged.
    expect(pkg.attributes.find((a) => a.name === 'ubcEduCwlPuid')!.unused).toBe(false)
  })

  it('a search that stopped early says so, and an unread attribute is then a reason to look rather than a fact', () => {
    const pkg = assemblePackage(
      input({
        usedAtTruncated: true,
        uses: { ubcEduCwlPuid: [{ path: 'server.js', line: 1 }], mail: [] },
      }),
    )
    expect(pkg.usedAtTruncated).toBe(true)
    expect(pkg.attributes.find((a) => a.name === 'mail')!.justification).toBe(
      'The app asks for it and does not read it anywhere Manifest looked — remove it from `auth.attributes` before you send this. Manifest did not read every file of the app, so look before you remove it.',
    )
    expect(pkg.warnings).toContain(
      'Manifest searched only part of the app’s code (at most 200 files and 2 MiB), so where an attribute is read in the rest is not shown.',
    )
  })

  it('carries the PIA number UBC IAM asks for — and says it is missing when the assessment has none yet', () => {
    expect(assemblePackage(input()).privacyAssessmentReference).toBe('PIA-2026-0088')
    const pkg = assemblePackage(input({ privacyAssessmentReference: null }))
    expect(pkg.privacyAssessmentReference).toBeNull()
    expect(pkg.warnings).toEqual([
      'The privacy assessment’s PIA number is not recorded yet, and UBC IAM asks for it. Once an administrator records the assessment approved with its number, draft this again so the package carries it.',
    ])
  })

  it('renders the metadata from the package’s own values, with the certificate and never its private key', () => {
    const pkg = assemblePackage(input())
    expect(pkg.entityId).toBe('https://manifest.internal/sp/lp-sample/staging')
    expect(pkg.metadataXml).toContain(`entityID="${pkg.entityId}"`)
    expect(pkg.metadataXml).toContain(`Location="${pkg.acsUrl}"`)
    expect(pkg.metadataXml).toContain(`Location="${pkg.sloUrl}"`)
    expect(pkg.metadataXml.replace(/\s/g, '')).toContain(certificate.certData)
    expect(pkg.metadataXml).toContain(
      '<md:EmailAddress>bio.prof@example.ubc.ca</md:EmailAddress>',
    )
    expect(pkg.metadataXml).toContain(
      '<md:EmailAddress>admin@example.ubc.ca</md:EmailAddress>',
    )
    expect(pkg.certificate).toEqual({
      pem: certificate.certificatePem,
      fingerprint: certificate.fingerprint,
      expiresAt: certificate.expiresAt.toISOString(),
    })
    expect(pkg.generatedAt).toBe('2026-10-01T15:00:00.000Z')
    expect(pkg.fromCommit).toBe('a'.repeat(40))
    expect(JSON.stringify(pkg)).not.toMatch(/PRIVATE KEY/)
  })

  it('keeps the warnings it is given, before its own', () => {
    const pkg = assemblePackage(
      input({
        warnings: ['Drawn from the newest manifest.'],
        privacyAssessmentReference: null,
      }),
    )
    expect(pkg.warnings[0]).toBe('Drawn from the newest manifest.')
    expect(pkg.warnings).toHaveLength(2)
  })
})
