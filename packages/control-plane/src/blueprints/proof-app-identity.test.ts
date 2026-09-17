import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * §10's END-USER IDENTIFIER, which has ONE producer: `node-ts-mongo@1`'s
 * `skeleton/ai/end-user.js`, loaded and executed rather than restated.
 *
 * §10's identifier is computed by the app and never by the control plane — the
 * control plane never sees a request-time PUID — so this is the only place the
 * platform can hold that string to a shape. It is loaded through a computed
 * specifier for the reason `attribute-bridge.test.ts` gives: it is app-side
 * JavaScript that runs on Node 22 inside a container, deliberately outside this
 * package's `rootDir`.
 *
 * WHY IT MATTERS TWICE. The blueprint passes this string to LiteLLM as the `user`,
 * and S3 measured that LiteLLM keys an end-user budget on it GLOBALLY rather than
 * per key; and the proof app keys every note it stores on it. Until P4b Task 16 the
 * proof app computed it in its own `identity.js` — a plan early, so notes were keyed
 * on the right string from day one — and this file held the two copies to each
 * other. Task 16 deleted that copy and the app imports the blueprint's, so the
 * formula is pinned once here and the second `describe` keeps the copy gone.
 */
const END_USER = new URL(
  '../../../../blueprints/node-ts-mongo/skeleton/ai/end-user.js',
  import.meta.url,
).href

const { endUserId } = (await import(END_USER)) as {
  endUserId: (ubcEduCwlPuid: string) => string
}

const PROOF_APP = fileURLToPath(
  new URL('../../../../blueprints/node-ts-mongo/starters/proof-app/', import.meta.url),
)

const SLUG = 'proof-app'
const ENV = 'staging'

describe('node-ts-mongo@1’s end-user identifier (§10)', () => {
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
    // asserts it computed that will never fail.
    const expected = createHash('sha256').update(`stu000001 ${SLUG} ${ENV}`).digest('hex')
    expect(endUserId('stu000001')).toBe(expected)
    // And pinned to a literal, so a change is visible in a diff rather than only in
    // a failure. Every note the proof app has stored is keyed on this exact string.
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
    expect(endUserId('ins000001')).not.toBe(student)

    process.env.MANIFEST_ENV = 'production'
    expect(endUserId('stu000001')).not.toBe(student)

    process.env.MANIFEST_ENV = ENV
    process.env.MANIFEST_PROJECT_SLUG = 'other-app'
    expect(endUserId('stu000001')).not.toBe(student)
  })

  it('REFUSES a partial identifier rather than hashing an undefined namespace', () => {
    // A hash over `undefined` is a stable, WRONG key: it collides across every
    // environment, which is a student's notes surfacing in a production
    // deployment. Absent must fail loudly — the `MONGODB_DB_NAME` lesson applied
    // to a value nothing injects.
    delete process.env.MANIFEST_ENV
    expect(() => endUserId('stu000001')).toThrow(/MANIFEST_ENV/)
    process.env.MANIFEST_ENV = ENV
    delete process.env.MANIFEST_PROJECT_SLUG
    expect(() => endUserId('stu000001')).toThrow(/MANIFEST_PROJECT_SLUG/)
    process.env.MANIFEST_PROJECT_SLUG = SLUG
    expect(() => endUserId('')).toThrow(/PUID/)
  })
})

describe('the proof app has no end-user identifier of its own (P4b Task 16)', () => {
  /** Every JavaScript file the proof app lays over the skeleton. */
  function proofAppSources(dir = PROOF_APP): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return proofAppSources(path)
      return entry.name.endsWith('.js') ? [path] : []
    })
  }

  it('imports endUserId from the blueprint’s AI component', () => {
    const server = readFileSync(join(PROOF_APP, 'server.js'), 'utf8')
    // Anchored at a line start, so a COMMENTED-OUT import cannot satisfy it — the
    // trap `spec/injection-drift.test.ts` strips comments for.
    expect(server).toMatch(/^import \{[^}]*\bendUserId\b[^}]*\} from '\.\/ai\/llm\.js'/m)
  })

  it('carries no second copy — no identity.js, and no hashing anywhere in its source', () => {
    expect(existsSync(join(PROOF_APP, 'identity.js'))).toBe(false)
    const sources = proofAppSources()
    expect(sources.map((path) => path.slice(PROOF_APP.length))).toContain('server.js')
    for (const path of sources) {
      // A second producer of this string needs a hash. Two copies that agree today
      // disagree the first time one is edited, and then either every stored note
      // is orphaned or every student's AI spend lands on the wrong key.
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/createHash|node:crypto/)
    }
  })
})
