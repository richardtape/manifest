import { describe, expect, it } from 'vitest'
import { deriveSpEntity, SpEntityError } from './index.js'

const base = {
  slug: 'chem-labs',
  environmentKind: 'staging' as const,
  hostname: 'chem-labs.staging.manifest.internal',
  entityBase: 'https://manifest.internal',
  auth: {
    provider: 'cwl' as const,
    callback: '/auth/ubcshib/callback',
    logout: '/auth/logout',
    attributes: ['ubcEduCwlPuid', 'mail'],
  },
}

describe('D15 derivation — Manifest supplies every origin (§9)', () => {
  it('derives the entityID, ACS and SLO from the slug, kind and hostname', () => {
    expect(deriveSpEntity(base)).toEqual({
      entityId: 'https://manifest.internal/sp/chem-labs/staging',
      acsUrl: 'https://chem-labs.staging.manifest.internal/auth/ubcshib/callback',
      sloUrl: 'https://chem-labs.staging.manifest.internal/auth/logout',
      attributes: ['ubcEduCwlPuid', 'mail'],
    })
  })

  it('refuses a callback that carries an origin, rather than joining it', () => {
    // The assertion-phishing primitive §9 names. spec/schema.ts already refuses
    // this at parse time with AUTH_PATH; this is the SECOND independent read of
    // the same rule, because a guard whose condition is written twice is a
    // guard, and the one time it was written once here it was one line from
    // being live (P2's /auth/dev-login).
    expect(() =>
      deriveSpEntity({
        ...base,
        auth: { ...base.auth, callback: 'https://evil.example/acs' },
      }),
    ).toThrow(SpEntityError)
  })

  it.each([
    '//evil.example/acs',
    '/../../x',
    '/acs?next=https://evil.example',
    '/acs#@evil',
  ])('refuses the callback %s', (callback) => {
    expect(() => deriveSpEntity({ ...base, auth: { ...base.auth, callback } })).toThrow(
      SpEntityError,
    )
  })

  it('refuses the same shapes in the LOGOUT path, which is also an origin', () => {
    // Two paths arrive from the app and both become URLs. A guard on one of them
    // is a guard on half the surface — and the SLO endpoint is where the IdP
    // sends a browser after it has already authenticated somebody.
    expect(() =>
      deriveSpEntity({
        ...base,
        auth: { ...base.auth, logout: 'https://evil.example/slo' },
      }),
    ).toThrow(SpEntityError)
  })

  it('refuses an empty attribute list before anything is written', () => {
    // §9: the one field governing what personal information leaves the IdP is
    // the one field whose absence is silently permissive (S2 Evidence 12). This
    // is the first of the two independent reads; Task 2's CHECK constraint is
    // the second.
    expect(() =>
      deriveSpEntity({ ...base, auth: { ...base.auth, attributes: [] } }),
    ).toThrow(/attributes/i)
  })

  it('refuses an app that did not ask for CWL at all', () => {
    // `auth.provider: none` defaults `attributes` to `[]`, so this would already
    // be refused — with a message about attributes, which sends the reader to
    // the wrong line. Registering an SP for an app that declared no identity is
    // a caller mistake and reads as one.
    expect(() =>
      deriveSpEntity({ ...base, auth: { ...base.auth, provider: 'none' } }),
    ).toThrow(/provider/i)
  })

  it('refuses a platform entity base that is not a bare https origin', () => {
    // Manifest supplies this one, so a bad value is a configuration fault rather
    // than an attack — but an entityID built from `http://…` or from a base with
    // a path is silently wrong at the IdP, where it reads as "metadata not
    // found" for a row that is plainly present.
    for (const entityBase of [
      'http://manifest.internal',
      'https://manifest.internal/',
      'https://manifest.internal/sp',
      'manifest.internal',
    ]) {
      expect(() => deriveSpEntity({ ...base, entityBase })).toThrow(SpEntityError)
    }
  })

  it('refuses a hostname that is not a bare hostname', () => {
    for (const hostname of [
      'https://chem-labs.staging.manifest.internal',
      'chem-labs.staging.manifest.internal/x',
      'chem-labs.staging.manifest.internal:8443',
    ]) {
      expect(() => deriveSpEntity({ ...base, hostname })).toThrow(SpEntityError)
    }
  })

  it('keeps the entityID inside the column it has to fit', () => {
    // S2: entity_id is VARCHAR(255). A 39-character slug is legal under §7.
    const long = deriveSpEntity({ ...base, slug: 'a'.repeat(39) })
    expect(long.entityId.length).toBeLessThan(255)
  })

  it('puts the environment kind in the entityID, never only in the zone', () => {
    const staging = deriveSpEntity(base)
    const sandbox = deriveSpEntity({
      ...base,
      environmentKind: 'sandbox',
      hostname: 'chem-labs.sandbox.manifest.internal',
    })
    // Two environments of one project must be two SPs, or an assertion minted
    // for sandbox is replayable at staging.
    expect(sandbox.entityId).not.toBe(staging.entityId)
  })
})
