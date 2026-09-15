import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * THE PROOF APP'S OWN FILE, loaded and executed rather than restated.
 *
 * §10's end-user identifier is computed by the app and never by the control
 * plane — the control plane never sees a request-time PUID — so this is the only
 * place the platform can hold that string to a shape. It is loaded through a
 * computed specifier for the reason `attribute-bridge.test.ts` gives: the
 * fixture is app-side JavaScript that runs on Node 22 inside a container and is
 * deliberately outside this package's `rootDir`.
 *
 * WHY IT IS TESTED HERE AT ALL. Since P4b Task 10, `node-ts-mongo@1`'s
 * `skeleton/ai/end-user.js` passes this exact string to LiteLLM as the `user`, and
 * S3 measured that LiteLLM keys an end-user budget on it GLOBALLY rather than per
 * key. If the two implementations disagree by one byte, P4b either migrates every
 * note this app has stored or locks a student out of every Manifest application.
 * The formula was fixed HERE, a plan ahead of the code that consumes it.
 */
const IDENTITY = new URL('../../../../fixtures/proof-app/identity.js', import.meta.url)
  .href

const { endUserId } = (await import(IDENTITY)) as {
  endUserId: (ubcEduCwlPuid: string) => string
}

/**
 * The BLUEPRINT'S copy — the one LiteLLM receives. Two producers of one string until
 * P4b Task 16 makes the proof app import the blueprint's (sitting 1's reconciliation,
 * item 2), so until then they are held to each other, over every input that varies.
 */
const BLUEPRINT_END_USER = new URL(
  '../../../../blueprints/node-ts-mongo/skeleton/ai/end-user.js',
  import.meta.url,
).href

const blueprint = (await import(BLUEPRINT_END_USER)) as {
  endUserId: (ubcEduCwlPuid: string) => string
}

const SLUG = 'proof-app'
const ENV = 'staging'

describe('the proof app’s end-user identifier (§10)', () => {
  beforeEach(() => {
    process.env.MANIFEST_PROJECT_SLUG = SLUG
    process.env.MANIFEST_ENV = ENV
  })
  afterEach(() => {
    delete process.env.MANIFEST_PROJECT_SLUG
    delete process.env.MANIFEST_ENV
  })

  it('is sha256(puid ‖ slug ‖ env), space-separated, in that order', () => {
    // The expected side is CONSTRUCTED here rather than read from the module,
    // because a test that asks the implementation what it computes and then
    // asserts it computed that will never fail. This is P4b's formula, written
    // out: `createHash('sha256').update(puid + ' ' + slug + ' ' + env)`.
    const expected = createHash('sha256').update(`stu000001 ${SLUG} ${ENV}`).digest('hex')
    expect(endUserId('stu000001')).toBe(expected)
    // And pinned to a literal, so a change to either side is visible in a diff
    // rather than only in a failure.
    expect(endUserId('stu000001')).toBe(
      createHash('sha256').update('stu000001 proof-app staging').digest('hex'),
    )
  })

  it('NAMESPACES the hash — a bare PUID hash is the cross-app lockout', () => {
    // S3 Evidence 6: LiteLLM's end-user budget is global. A student who
    // exhausted one course tool's allowance would be refused by every other
    // Manifest application, which is an ordinary day's use becoming an outage.
    const bare = createHash('sha256').update('stu000001').digest('hex')
    expect(endUserId('stu000001')).not.toBe(bare)
  })

  it('separates two people, two projects and two environments', () => {
    const student = endUserId('stu000001')
    const instructor = endUserId('ins000001')
    expect(student).not.toBe(instructor)

    process.env.MANIFEST_ENV = 'production'
    expect(endUserId('stu000001')).not.toBe(student)

    process.env.MANIFEST_ENV = ENV
    process.env.MANIFEST_PROJECT_SLUG = 'other-app'
    expect(endUserId('stu000001')).not.toBe(student)
  })

  it('REFUSES a partial identifier rather than hashing an undefined namespace', () => {
    // A hash over `undefined` is a stable, WRONG key: it collides across every
    // environment, which is a student's notes surfacing in a production
    // deployment. Absent must fail loudly — this is the `MONGODB_DB_NAME`
    // lesson applied to a value nothing injects.
    delete process.env.MANIFEST_ENV
    expect(() => endUserId('stu000001')).toThrow(/MANIFEST_ENV/)
    process.env.MANIFEST_ENV = ENV
    delete process.env.MANIFEST_PROJECT_SLUG
    expect(() => endUserId('stu000001')).toThrow(/MANIFEST_PROJECT_SLUG/)
    process.env.MANIFEST_PROJECT_SLUG = SLUG
    expect(() => endUserId('')).toThrow(/PUID/)
  })
})

describe("node-ts-mongo@1's end-user identifier is the proof app's, byte for byte (§10)", () => {
  afterEach(() => {
    delete process.env.MANIFEST_PROJECT_SLUG
    delete process.env.MANIFEST_ENV
  })

  it('agrees for every person, project and environment', () => {
    for (const slug of ['proof-app', 'other-app']) {
      for (const env of ['sandbox', 'staging', 'production']) {
        for (const puid of ['stu000001', 'ins000001']) {
          process.env.MANIFEST_PROJECT_SLUG = slug
          process.env.MANIFEST_ENV = env
          expect(blueprint.endUserId(puid), `${puid} ${slug} ${env}`).toBe(
            endUserId(puid),
          )
          // And against the formula written out, so two copies that drifted TOGETHER
          // are still caught.
          expect(blueprint.endUserId(puid)).toBe(
            createHash('sha256').update(`${puid} ${slug} ${env}`).digest('hex'),
          )
        }
      }
    }
  })

  it('refuses a partial identifier exactly as the proof app does', () => {
    process.env.MANIFEST_PROJECT_SLUG = SLUG
    expect(() => blueprint.endUserId('stu000001')).toThrow(/MANIFEST_ENV/)
    process.env.MANIFEST_ENV = ENV
    delete process.env.MANIFEST_PROJECT_SLUG
    expect(() => blueprint.endUserId('stu000001')).toThrow(/MANIFEST_PROJECT_SLUG/)
    process.env.MANIFEST_PROJECT_SLUG = SLUG
    expect(() => blueprint.endUserId('')).toThrow(/PUID/)
  })
})
