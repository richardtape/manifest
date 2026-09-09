import { describe, expect, it } from 'vitest'

/**
 * THE BLUEPRINT'S OWN FILE, loaded and executed rather than restated — a copy of
 * `bridge()` in this directory would test the copy.
 *
 * Loaded through a computed specifier, which is not a trick to dodge a check: the
 * skeleton is app-side JavaScript that runs on Node 22 inside a container, and it
 * is deliberately outside this package's `rootDir`, so `tsc` neither can nor
 * should typecheck it. The cast below is the one place its shape is asserted, and
 * every test in this file would fail if the real module did not match it.
 */
const BRIDGE = new URL(
  '../../../../blueprints/node-ts-mongo/skeleton/auth/attributes.js',
  import.meta.url,
).href

const { OID, bridge, puid } = (await import(BRIDGE)) as {
  /**
   * The seven §9 names the bridge covers, spelled out rather than left as an
   * index signature: `noUncheckedIndexedAccess` makes an indexed read
   * `string | undefined`, and a `[OID.mail]` computed key would then be the
   * literal string "undefined" — a test asserting against a key that cannot
   * exist, which is this project's most-repeated defect shape.
   */
  OID: Record<
    | 'ubcEduCwlPuid'
    | 'mail'
    | 'givenName'
    | 'sn'
    | 'eduPersonAffiliation'
    | 'eduPersonPrincipalName'
    | 'uid',
    string
  >
  bridge: (profile: unknown) => Record<string, string>
  puid: (profile: unknown) => string
}

/**
 * §9's attribute bridge, which is replicated into every application generated
 * from `node-ts-mongo@1` — §20's "security multiplier", so a defect here is a
 * defect in all of them.
 *
 * The two profile shapes below are the two the library actually produces, and
 * telling them apart is the whole job: `passport-ubcshib` runs `mapAttributes`
 * only when `attributeConfig` is non-empty (S2 Evidence 11), so an app that
 * drops that option sees the RAW OID shape. P4a Task 12's negative control (c)
 * removes `attributeConfig` and expects Task 15's acceptance to go red with raw
 * `urn:oid:` keys; this is the half of it that can be proved without a login.
 */
const RAW_OID_PROFILE = {
  attributes: {
    [OID.ubcEduCwlPuid]: ['abc123'],
    [OID.mail]: ['a@ubc.ca'],
    [OID.eduPersonPrincipalName]: ['a@ubc.ca'],
    [OID.uid]: ['acwl'],
  },
}

const MAPPED_PROFILE = {
  attributes: {
    ubcEduCwlPuid: ['abc123'],
    mail: ['a@ubc.ca'],
    // The two the library has NO OID entry for, so they arrive raw even when
    // mapAttributes ran. This mixed shape is the realistic one.
    [OID.eduPersonPrincipalName]: ['a@ubc.ca'],
    [OID.uid]: ['acwl'],
  },
}

describe('the node-ts-mongo@1 attribute bridge (§9)', () => {
  it('reads the RAW OID shape — what an app sees with no attributeConfig', () => {
    expect(bridge(RAW_OID_PROFILE)).toEqual({
      ubcEduCwlPuid: 'abc123',
      mail: 'a@ubc.ca',
      eduPersonPrincipalName: 'a@ubc.ca',
      uid: 'acwl',
    })
  })

  it('reads the MAPPED shape too, including the two the library never maps', () => {
    // S2: the library's map has no OID entry at all for `uid` or
    // `eduPersonPrincipalName`, so those two arrive raw whatever else happens.
    // An app reading friendly names alone would find them missing.
    expect(bridge(MAPPED_PROFILE)).toEqual({
      ubcEduCwlPuid: 'abc123',
      mail: 'a@ubc.ca',
      eduPersonPrincipalName: 'a@ubc.ca',
      uid: 'acwl',
    })
  })

  it('takes the FIRST value: SAML attributes are multi-valued and apps want a scalar', () => {
    expect(bridge({ attributes: { [OID.sn]: ['Ng', 'Ng-Smith'] } })).toEqual({ sn: 'Ng' })
    // A scalar the IdP happened to send unwrapped is not an array; both shapes
    // reach here in practice and neither may become `['a','b'][0]` by accident.
    expect(bridge({ attributes: { [OID.sn]: 'Ng' } })).toEqual({ sn: 'Ng' })
  })

  it('reports an undeclared attribute as ABSENT, not as undefined', () => {
    // §9 enforces release AT THE IdP, so an attribute the SP row does not
    // declare is never sent. `Object.keys` must therefore be exactly what got
    // through — an `undefined`-valued key reads as "released and empty", which
    // is a different diagnosis and sends the reader to the wrong place.
    const got = bridge({ attributes: { [OID.ubcEduCwlPuid]: ['abc123'] } })
    expect(Object.keys(got)).toEqual(['ubcEduCwlPuid'])
    expect('mail' in got).toBe(false)
  })

  it('throws rather than returning an undefined PUID', () => {
    // An app that stores rows against `undefined` has corrupted its own data by
    // the time anyone notices; a missing PUID means the registration is wrong,
    // which is fixable.
    expect(() => puid({ attributes: { [OID.mail]: ['a@ubc.ca'] } })).toThrow(
      /ubcEduCwlPuid/,
    )
    expect(puid(RAW_OID_PROFILE)).toBe('abc123')
  })

  it('uses the OID S2 and passport-ubcshib agree on, not the one the IdP shipped with', () => {
    // `urn:oid:1.3.6.1.4.1.60.1.1.1` was in the IdP's authsources.php until
    // 2026-09-08 and matches nothing the library maps, so no app could read its
    // own user identifier. The correct value is measured in two places.
    expect(OID.ubcEduCwlPuid).toBe('urn:oid:1.3.6.1.4.1.60.6.1.6')
  })
})
