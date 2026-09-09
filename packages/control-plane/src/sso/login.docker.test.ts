import { afterAll, beforeAll, expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { idpLogin, startSamlSp, withRegisteredSp, type SamlSpHandle } from './testing.js'

/**
 * §16's identity-path regression tier, and S2's open question answered: a
 * known-good row still produces a known-good assertion, so a SimpleSAMLphp
 * upgrade fails here rather than in staging.
 *
 * It runs BEFORE `sso/` exists. Everything later in this plan is a way of
 * producing this row automatically; if the row does not work by hand, nothing
 * downstream can, and this is the cheapest place to find that out.
 */
describeDocker('a real CWL login against the Manifest IdP', () => {
  let sp: SamlSpHandle

  beforeAll(async () => {
    sp = await startSamlSp({ slug: 'saml-probe', kind: 'staging' })
  }, 900_000)
  afterAll(async () => {
    await sp?.stop()
  }, 120_000)

  it('completes a login and the app reads ubcEduCwlPuid', async () => {
    await withRegisteredSp(sp.row, async () => {
      const result = await idpLogin(sp, { user: 'student', password: 'student' })
      expect(result.status).toBe(200)
      // ASSERT THE SHAPE OF THE ANSWER. "a login happened" and "the app can
      // identify the person" are different claims and only the second matters:
      // S3's six green checks included one returning 192 numbers where 768
      // belonged.
      //
      // passport-saml collapses a single-valued attribute to a STRING, so this
      // asserts the value rather than a container type it does not control.
      expect(result.attributes?.ubcEduCwlPuid).toBe('stu000001')
      expect(result.attributes?.mail).toBe('student@student.ubc.ca')
    })
  }, 300_000)

  it('releases exactly the attributes the row declares, and no more', async () => {
    // The row asks for two. The auth source produces five. §9's whole claim.
    const twoOnly = { ...sp.row, attributes: ['ubcEduCwlPuid', 'mail'] }
    await withRegisteredSp(twoOnly, async () => {
      const result = await idpLogin(sp, { user: 'student', password: 'student' })
      expect(Object.keys(result.attributes ?? {}).sort()).toEqual([
        'mail',
        'ubcEduCwlPuid',
      ])
      expect(result.attributes).not.toHaveProperty('givenName')
      expect(result.attributes).not.toHaveProperty('sn')
    })
  }, 300_000)

  it('refuses an entityID with no row at all', async () => {
    // The negative control that makes the two above attributable to the row and
    // nothing else. S2 Evidence 4: "Metadata not found".
    const result = await idpLogin(sp, { user: 'student', password: 'student' })
    expect(result.status).not.toBe(200)
    expect(result.body).toMatch(
      /Metadata not found|Unable to locate metadata|METADATANOTFOUND/i,
    )
  }, 300_000)
})
