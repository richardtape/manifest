import { describe, expect, it } from 'vitest'
import { manifestSchema } from './schema.js'
import { toManifestErrors } from './errors.js'

const minimal = {
  manifest: 1,
  name: 'chem-lab-scheduler',
  blueprint: 'node-ts-mongo@2',
  runtime: { port: 3000 },
}

function errorsFor(input: unknown) {
  const r = manifestSchema.safeParse(input)
  if (r.success) throw new Error('expected the spec to be rejected')
  return toManifestErrors(r.error.issues)
}

describe('machine-actionable spec errors (§20)', () => {
  it('gives a build block its own code and a hint naming D13', () => {
    const [err] = errorsFor({ ...minimal, runtime: { port: 3000, build: {} } })
    expect(err?.code).toBe('SPEC_BUILD_BLOCK_FORBIDDEN')
    expect(err?.path).toBe('runtime.build')
    expect(err?.hint).toMatch(/blueprint/i)
  })

  it('gives an unknown top-level key its own code listing what is allowed', () => {
    const [err] = errorsFor({ ...minimal, cunning: true })
    expect(err?.code).toBe('SPEC_UNKNOWN_KEY')
    expect(err?.hint).toMatch(/services/)
  })

  it('gives a non-path callback a code that says PATH, not URL', () => {
    const [err] = errorsFor({
      ...minimal,
      auth: { provider: 'cwl', callback: 'https://evil.example/cb' },
    })
    expect(err?.code).toBe('SPEC_PATH_EXPECTED')
    expect(err?.hint).toMatch(/path/i)
  })

  it('gives a bad slug a code and quotes the rule', () => {
    const [err] = errorsFor({ ...minimal, name: 'Not_A_Slug' })
    expect(err?.code).toBe('SPEC_INVALID_SLUG')
    expect(err?.hint).toContain('a-z')
  })

  it('gives a non-empty reserved block a code naming the hook', () => {
    const [err] = errorsFor({ ...minimal, integrations: [{ lti: true }] })
    expect(err?.code).toBe('SPEC_RESERVED_BLOCK_NOT_EMPTY')
    expect(err?.path).toBe('integrations')
  })

  // The three below were added in execution. Each names a case the six above
  // could not see, because each reads only `errorsFor(...)[0]` — and in two of
  // the three the defect is in an error the caller never looked at.

  it('reports a non-empty reserved block once, not twice', () => {
    const errs = errorsFor({ ...minimal, integrations: [{ lti: true }] })
    expect(errs.map((e) => e.code)).toEqual(['SPEC_RESERVED_BLOCK_NOT_EMPTY'])
    // The element error zod also raises invites an agent to go and find a
    // permitted element type. §15 permits none: the block must be empty.
    for (const e of errs) expect(e.path).not.toMatch(/^integrations\./)
  })

  it('names the containing block when an unknown key is nested, not the top-level list', () => {
    const [err] = errorsFor({
      ...minimal,
      data: { classification: 'internal', bogus: 1 },
    })
    expect(err?.code).toBe('SPEC_UNKNOWN_KEY')
    expect(err?.path).toBe('data.bogus')
    // Listing the top-level keys here would send a self-correcting agent to
    // rename `data.bogus` to `services` — a vocabulary that does not apply.
    expect(err?.hint).not.toMatch(/top-level/)
    expect(err?.hint).toMatch(/\bdata\b/)
  })

  it('never passes zod\'s bare "Invalid" through as the human message', () => {
    for (const e of errorsFor({ ...minimal, resources: { memory: 'lots' } })) {
      expect(e.message).not.toBe('Invalid')
      expect(e.message.length).toBeGreaterThan(10)
    }
  })

  it('every error carries all four fields, always', () => {
    for (const e of errorsFor({ ...minimal, name: 'X', cunning: 1 })) {
      expect(e.code).toBeTruthy()
      expect(e.message).toBeTruthy()
      expect(e.hint).toBeTruthy()
      expect(typeof e.path).toBe('string')
    }
  })
})
