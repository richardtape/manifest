import { describe, expect, it } from 'vitest'
import {
  CONTROL_PLANE_ATTRIBUTES,
  controlPlaneSpEntity,
  renderSpMetadata,
  SsoError,
} from './index.js'
import { mintSpKeypair } from './keypair.js'

/**
 * §9's first sentence, as a pure function.
 *
 * This file exists because the two Docker tests that boot the control plane
 * override `MANIFEST_SP_ENTITY_BASE` to keep off the shared row — so nothing
 * over there asserts that the DEFAULT base produces the entityID RUNBOOK and
 * the runbook document. That is exactly the kind of gap a test-isolation fix
 * opens quietly, so it is closed here rather than noticed later.
 */
describe('the control plane’s own Service Provider (§9)', () => {
  const base = 'https://manifest.internal'

  it('derives §9’s entityID shape from the platform domain', () => {
    const entity = controlPlaneSpEntity({
      entityBase: base,
      origin: 'http://127.0.0.1:7100',
    })
    // https://{platform-domain}/sp/{slug}/{env}. `platform` is deliberately not
    // one of §7's three environment kinds: there is one control plane, and
    // reusing `production` would put it in a namespace an app called
    // `manifest-control-plane` could claim.
    expect(entity.entityId).toBe(
      'https://manifest.internal/sp/manifest-control-plane/platform',
    )
  })

  it('builds every URL from the origin, and only from the origin', () => {
    const local = controlPlaneSpEntity({
      entityBase: base,
      origin: 'http://127.0.0.1:7100',
    })
    expect(local.acsUrl).toBe('http://127.0.0.1:7100/auth/saml/callback')
    expect(local.sloUrl).toBe('http://127.0.0.1:7100/auth/logout')

    // At UBC the control plane is behind a proxy, and the entityID does NOT
    // move with it — an SP that changed identity on deployment would have to be
    // re-registered with UBC IAM every time it moved.
    const ubc = controlPlaneSpEntity({
      entityBase: base,
      origin: 'https://manifest.ubc.ca',
    })
    expect(ubc.acsUrl).toBe('https://manifest.ubc.ca/auth/saml/callback')
    expect(ubc.entityId).toBe(local.entityId)
  })

  it('refuses an origin that is not a bare origin', () => {
    // §9: "Origins are never accepted as input… A free-text ACS URL is an
    // assertion-phishing primitive." This one IS Manifest's own input, so the
    // check is against a configuration mistake rather than an attacker — but
    // the consequence is the same URL in the same row, so it is refused with a
    // message naming the setting.
    for (const origin of [
      'http://127.0.0.1:7100/',
      'http://127.0.0.1:7100/auth',
      '127.0.0.1:7100',
      'ftp://127.0.0.1:7100',
    ]) {
      expect(() => controlPlaneSpEntity({ entityBase: base, origin })).toThrow(SsoError)
    }
  })

  it('asks for four attributes, and NOT for eduPersonAffiliation', () => {
    // The omission is the assertion. A platform role is Manifest's to decide
    // (§9 — the IdP authenticates, it does not authorize), so an attribute
    // saying `faculty` has no consumer here; requesting it anyway would put a
    // value in every assertion that nothing may act on, which is how it
    // eventually gets acted on. §9 enforces release at the IdP against this
    // list, so an attribute absent here is never sent at all.
    expect(CONTROL_PLANE_ATTRIBUTES).toEqual(['ubcEduCwlPuid', 'mail', 'givenName', 'sn'])
    expect(CONTROL_PLANE_ATTRIBUTES).not.toContain('eduPersonAffiliation')
  })

  it('renders through the SAME renderer every app’s row goes through', async () => {
    // The point of the whole file it lives in: the platform's row is not a
    // second `entity_data` document written by hand somewhere else. A second
    // producer of this shape is defect 49, and it cost a session.
    const entity = controlPlaneSpEntity({
      entityBase: base,
      origin: 'http://127.0.0.1:7100',
    })
    const keypair = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'manifest-control-plane',
      entityId: entity.entityId,
    })
    const row = renderSpMetadata(entity, keypair)

    expect(row.AssertionConsumerService[0]?.Location).toBe(entity.acsUrl)
    expect(row.attributes).toEqual(CONTROL_PLANE_ATTRIBUTES)
    expect(row['validate.authnrequest']).toBe(true)
    expect(row['saml20.sign.assertion']).toBe(true)
    // The IdP SIGNS the logout messages it sends this SP (2026-09-24). SimpleSAMLphp
    // v2.5.3.1's `addRedirectSign` signs a LogoutRequest or LogoutResponse only when
    // `sign.logout` (or `redirect.sign`) is set on the hosted IdP or on this row, and
    // neither was — so every one arrived unsigned, and node-saml 5.1.0 ACCEPTS an
    // unsigned redirect message (`hasValidSignatureForRedirect` returns true with no
    // `Signature` at all). The SLO route now refuses unsigned; this is its other half.
    expect(row['sign.logout']).toBe(true)
    expect(row['validate.logout']).toBe(true)
    // The base64 BODY, no PEM armour — armour in the row fails at signature
    // validation with a message about the certificate rather than its encoding.
    expect(row.certData).not.toContain('BEGIN CERTIFICATE')
    expect(row.certData).toBe(keypair.certData)
  }, 30_000)
})
