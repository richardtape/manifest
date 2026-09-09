// THE ATTRIBUTE BRIDGE. §9: tlef-starter carries one "precisely to bridge that,
// because passport-ubcshib's own mapping has gaps", and S2 measured the gaps:
//
//  * the library's map covers SIX friendly names: displayName,
//    eduPersonAffiliation, givenName, mail, sn, ubcEduCwlPuid
//  * it has NO OID entry at all for `uid` or `eduPersonPrincipalName`, so an
//    app that requests either gets a raw urn:oid: key it cannot read
//  * its MACE entry for ubcEduCwlPuid is UNREACHABLE — mapAttributes builds a
//    reverse map friendly -> OID, so the OID entry overwrites the MACE one
//
// We use OID everywhere (S2: real UBC Shibboleth sends OID, confirmed against
// tlef-biocbot in production), which sidesteps the MACE bug without patching
// the library — C6 forbids a library change being a prerequisite.
//
// The Manifest IdP releases the same OIDs in sandbox and staging, by design:
// `core:AttributeLimit` at priority 50 matches the friendly vocabulary
// `auth.attributes` uses and `core:AttributeMap` at 60 converts to OIDs
// afterwards. Reversing that order releases nothing, which is measured and
// asserted by `make verify` — so those environments exercise production's
// attribute vocabulary rather than a local dialect of it.
export const OID = {
  ubcEduCwlPuid: 'urn:oid:1.3.6.1.4.1.60.6.1.6',
  mail: 'urn:oid:0.9.2342.19200300.100.1.3',
  givenName: 'urn:oid:2.5.4.42',
  sn: 'urn:oid:2.5.4.4',
  eduPersonAffiliation: 'urn:oid:1.3.6.1.4.1.5923.1.1.1.1',
  eduPersonPrincipalName: 'urn:oid:1.3.6.1.4.1.5923.1.1.1.6',
  uid: 'urn:oid:0.9.2342.19200300.100.1.1',
}

/** First value only: SAML attributes are multi-valued and apps want a scalar. */
function first(value) {
  if (value === undefined || value === null) return undefined
  return Array.isArray(value) ? value[0] : value
}

/**
 * A passport-ubcshib profile -> a flat object keyed by FRIENDLY name.
 *
 * Reads the OID key first and the friendly key second, and that order is the
 * bridge: `mapAttributes` populates friendly keys only for the six names the
 * library knows, so `uid` and `eduPersonPrincipalName` arrive as raw OIDs and
 * nothing else would find them. Reading both means an app declaring any of the
 * seven gets a value under the name it declared.
 *
 * A name the IdP did not release is simply ABSENT rather than undefined-valued,
 * so `Object.keys(bridge(profile))` is exactly what §9 let through — which is
 * what makes an over-declared attribute list visible to the app that declared it
 * instead of silently empty.
 */
export function bridge(profile) {
  const attributes = profile?.attributes ?? profile ?? {}
  const out = {}
  for (const [friendly, oid] of Object.entries(OID)) {
    const value = first(attributes[oid]) ?? first(attributes[friendly])
    if (value !== undefined) out[friendly] = value
  }
  return out
}

/**
 * §9's user identity. `ubcEduCwlPuid` is the ONLY stable identifier UBC
 * guarantees — a CWL login name can be changed and an email address is not
 * unique over time — so it is what an app keys its own records on.
 *
 * Throws rather than returning undefined: an app that stores rows against
 * `undefined` has corrupted its own data by the time anyone notices, and the
 * IdP releasing no PUID means the registration is wrong, which is fixable.
 */
export function puid(profile) {
  const value = bridge(profile).ubcEduCwlPuid
  if (!value) {
    throw new Error(
      'the IdP released no ubcEduCwlPuid. auth.attributes must include it and the ' +
        'Service Provider registration must list it — §9 enforces release at the IdP, ' +
        'so an attribute the row does not declare is not sent at all.',
    )
  }
  return value
}
