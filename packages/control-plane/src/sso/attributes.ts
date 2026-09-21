/**
 * §9'S ATTRIBUTE VOCABULARY, AND THE ONE TABLE THE CONTROL PLANE KEEPS OF IT.
 *
 * The Manifest IdP releases OIDs: `core:AttributeLimit` at priority 50 matches the
 * FRIENDLY names `auth.attributes` uses, and `core:AttributeMap` at 60 converts what
 * survives to OIDs (`sso/metadata-store.ts` writes both into every registration). Real UBC
 * Shibboleth sends the same OIDs — S2 confirmed it against tlef-biocbot in production — so
 * anything reading an assertion sees OIDs and anything reading a registration sees friendly
 * names, and something has to join the two.
 *
 * **There were TWO copies of this before P6a Task 14 and there is one now**: `identity/`
 * carried four names for the control plane's own SP, and the rehearsal needs all seven
 * because it reads what an APP's assertion released. A second table is the shape this
 * project has paid for — and the day a name is added, the copy that did not get it reports
 * a released attribute as a raw `urn:oid:` string in a launch record.
 *
 * **The blueprint's `auth/attributes.js` is a THIRD copy ON PURPOSE**, and it stays: it
 * ships inside an application image, where it is the app's own bridge (§8, C6 — a library
 * change is never a prerequisite). This one is the platform's.
 */
export const ATTRIBUTE_OIDS = {
  ubcEduCwlPuid: 'urn:oid:1.3.6.1.4.1.60.6.1.6',
  mail: 'urn:oid:0.9.2342.19200300.100.1.3',
  givenName: 'urn:oid:2.5.4.42',
  sn: 'urn:oid:2.5.4.4',
  eduPersonAffiliation: 'urn:oid:1.3.6.1.4.1.5923.1.1.1.1',
  eduPersonPrincipalName: 'urn:oid:1.3.6.1.4.1.5923.1.1.1.6',
  uid: 'urn:oid:0.9.2342.19200300.100.1.1',
} as const

export type FriendlyAttributeName = keyof typeof ATTRIBUTE_OIDS

const FRIENDLY_BY_OID: ReadonlyMap<string, string> = new Map(
  Object.entries(ATTRIBUTE_OIDS).map(([friendly, oid]) => [oid, friendly]),
)

/**
 * The friendly name for what an assertion actually carried — **and the raw value itself
 * when this table does not know it**.
 *
 * NEVER `undefined` and never dropped. A rehearsal records what the IdP released so that a
 * person can compare it with what was registered, and an attribute the platform has no
 * name for is exactly the one worth seeing: dropping it would make an over-release read as
 * a clean one, which is §9's fail-open failure wearing a different hat.
 */
export function friendlyAttributeName(name: string): string {
  return FRIENDLY_BY_OID.get(name) ?? name
}
