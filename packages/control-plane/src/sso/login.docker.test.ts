import { afterAll, beforeAll, expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { deriveSpEntity } from './entity.js'
import { mintSpKeypair, type SpKeypair } from './keypair.js'
import { renderSpMetadata } from './metadata-store.js'
import {
  idpLogin,
  startSamlSp,
  idpLogTail,
  withRegisteredMetadata,
  withRegisteredSp,
  type SamlSpHandle,
} from './testing.js'

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
  let keypair: SpKeypair

  const entity = () =>
    deriveSpEntity({
      slug: 'saml-probe',
      environmentKind: 'staging',
      hostname: sp.hostname,
      entityBase: 'https://manifest.internal',
      auth: {
        provider: 'cwl',
        callback: '/auth/ubcshib/callback',
        logout: '/auth/logout',
        attributes: ['ubcEduCwlPuid', 'mail'],
      },
    })

  beforeAll(async () => {
    // The SP holds a real per-app key and SIGNS, so the rows below can require
    // it. The three original tests register rows that do NOT require signing,
    // and a signed request to an IdP that is not validating is still accepted —
    // so one deployed app covers both halves.
    keypair = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'saml-probe',
      entityId: 'https://manifest.internal/sp/saml-probe/staging',
    })
    sp = await startSamlSp({ slug: 'saml-probe', kind: 'staging', signing: keypair })
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

  it('accepts a login through a row `sso/` itself rendered, with the request signed', async () => {
    // The whole of Task 7, end to end: derive the entity, mint the keypair,
    // render the row, and let a real SP log a real user in through it. Every
    // earlier test in this file registers a row written by hand.
    const sp7 = entity()
    await withRegisteredMetadata(
      sp7.entityId,
      renderSpMetadata(sp7, keypair),
      async () => {
        const result = await idpLogin(sp, { user: 'student', password: 'student' })
        expect(result.status).toBe(200)
        expect(result.attributes?.ubcEduCwlPuid).toBe('stu000001')
        // The row declares two; the auth source produces five. Same claim as
        // above, now made against the row the platform generates.
        expect(Object.keys(result.attributes ?? {}).sort()).toEqual([
          'mail',
          'ubcEduCwlPuid',
        ])
      },
    )
  }, 300_000)

  it('refuses a login when the row pins a DIFFERENT certificate', async () => {
    // `validate.authnrequest: true` is in every row `renderSpMetadata` writes,
    // and until this test nothing proved it was in force: dropping the flag
    // reddened no test at all. S2 Evidence 8 measured exactly this refusal.
    const sp7 = entity()
    const wrongKey = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'saml-probe',
      entityId: sp7.entityId,
    })
    await withRegisteredMetadata(
      sp7.entityId,
      renderSpMetadata(sp7, wrongKey),
      async () => {
        const result = await idpLogin(sp, { user: 'student', password: 'student' })
        expect(result.status).not.toBe(200)
        expect(result.body).toMatch(/Invalid certificate signature|validate certificate/i)
      },
    )
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

/**
 * The other half of §9's signed-AuthnRequest requirement, and it needs its own
 * deployment: an SP that does NOT sign.
 *
 * Measured 2026-09-09, and it is the reason this block exists: SimpleSAMLphp
 * validates any signature that is PRESENT regardless of `validate.authnrequest`,
 * so the wrong-key test above stays red with the flag removed. Only an unsigned
 * request can show the flag itself doing anything — S2 Evidence 8's first
 * control, which nothing in this repository had ever run.
 */
describeDocker('an SP that does not sign, against a row that requires signing', () => {
  let sp: SamlSpHandle

  beforeAll(async () => {
    sp = await startSamlSp({ slug: 'saml-unsigned', kind: 'staging' })
  }, 900_000)
  afterAll(async () => {
    await sp?.stop()
  }, 120_000)

  it('is refused, because the row says validate.authnrequest', async () => {
    const entity = deriveSpEntity({
      slug: 'saml-unsigned',
      environmentKind: 'staging',
      hostname: sp.hostname,
      entityBase: 'https://manifest.internal',
      auth: {
        provider: 'cwl',
        callback: '/auth/ubcshib/callback',
        logout: '/auth/logout',
        attributes: ['ubcEduCwlPuid', 'mail'],
      },
    })
    const keypair = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'saml-unsigned',
      entityId: entity.entityId,
    })
    // The IdP's error page says only "Unhandled exception"; the reason is in its
    // log. Counted before and after, so a line left by an earlier run cannot
    // stand in for a refusal that did not happen.
    const NEEDLE = 'no signature found on message'
    const occurrences = (text: string) => text.split(NEEDLE).length - 1
    const before = occurrences(await idpLogTail())
    await withRegisteredMetadata(
      entity.entityId,
      renderSpMetadata(entity, keypair),
      async () => {
        const result = await idpLogin(sp, { user: 'student', password: 'student' })
        expect(result.status).not.toBe(200)
        expect(occurrences(await idpLogTail())).toBeGreaterThan(before)
      },
    )
  }, 300_000)
})
