import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { FIXTURES } from './fixtures.js'
import { createValidator } from './validate.js'

/**
 * §16's CONTRACT TIER: *"`manifest-mock` is validated against the same document"*, so a
 * front-end built against the mock cannot compile against a contract the real API does not
 * serve.
 *
 * The validator itself is `validate.ts`, which `server.ts` also uses to check every body on
 * its way out — one statement of what the document means, checked from both ends.
 */
describe('manifest-mock serves the published contract', () => {
  it('validates every fixture against the document it claims to serve', async () => {
    const check = await createValidator()
    const failures: string[] = []
    for (const [name, value] of FIXTURES) {
      const { ok, errors } = check(name, value)
      if (!ok) failures.push(`${name}: ${errors}`)
    }
    expect(failures).toEqual([])
    // A fixture table that is EMPTY validates perfectly, and so does a loop that never ran.
    // Assert it was read (P5b sitting 8, F3).
    expect(FIXTURES.length, 'no fixtures were checked').toBeGreaterThan(10)
  })

  /**
   * THE CONTROL, AND IT IS THE TEST THAT MATTERS. `expect(failures).toEqual([])` above
   * passes vacuously against a validator that always says yes, an empty fixture table, or a
   * schema map that never loaded — three ways of being green while checking nothing. This
   * is the positive control in the same file, which is the structure P5b sitting 8's F3
   * prescribed and sitting 9's F4 proved necessary.
   */
  it('refuses a fixture the document would refuse — the validator’s own control', async () => {
    const check = await createValidator()
    const me = {
      id: '11111111-1111-4111-8111-111111111111',
      puid: 'ins000001',
      displayName: 'Instructor One',
      email: 'instructor@example.test',
    }
    // `Me` requires `role`…
    expect(check('Me', me).ok).toBe(false)
    // …and the document says `additionalProperties: false`.
    expect(check('Me', { ...me, role: 'member', extra: 1 }).ok).toBe(false)
    // …and a `format`/`pattern`, which is the half `tsc` is blind to: both fields below
    // are `string` to TypeScript and neither is acceptable to the document.
    expect(check('Me', { ...me, id: 'project-1', role: 'member' }).ok).toBe(false)
    expect(check('Project', { ...me, role: 'member' }).ok).toBe(false)
    // And the positive half: the same validator says YES to something valid, so a
    // validator that always says NO cannot pass this test either.
    expect(check('Me', { ...me, role: 'member' })).toEqual({ ok: true, errors: '' })
  })

  /**
   * THE ONE FIXTURE FIELD NEITHER `tsc` NOR AJV CAN CHECK, HELD BY HAND. `Token.capabilities`
   * is `{ type: 'array', items: { type: 'string' } }` in the document, while
   * `MintTokenRequest.capabilities` is a closed enum of eleven — so a token listing a
   * capability the platform has never heard of validates perfectly, and this fixture said
   * `build:run` (the real one is `build:create`) until it was read against the enum by hand.
   *
   * That asymmetry is a finding about the API rather than about the mock, recorded in P5c
   * sitting 8. It is the second instance of the shape sitting 6 found: the document cannot
   * mark D24's privileged four either, so the console restates them.
   */
  it('lists only capabilities the document’s own mint enum declares', async () => {
    const document = JSON.parse(
      await readFile(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
    ) as {
      components: {
        schemas: {
          MintTokenRequest: {
            properties: { capabilities: { items: { enum: string[] } } }
          }
        }
      }
    }
    const declared = document.components.schemas.MintTokenRequest.properties.capabilities
    expect(declared.items.enum, 'the enum was not read').toContain('project:read')
    for (const [name, value] of FIXTURES) {
      if (name !== 'Token' && name !== 'TokenList') continue
      for (const token of Array.isArray(value) ? value : [value])
        for (const capability of (token as { capabilities: string[] }).capabilities)
          expect(declared.items.enum).toContain(capability)
    }
  })

  it('throws rather than passing for a schema the document does not have', async () => {
    const check = await createValidator()
    expect(() => check('NotASchema', {})).toThrow('the document has no schema NotASchema')
  })
})
