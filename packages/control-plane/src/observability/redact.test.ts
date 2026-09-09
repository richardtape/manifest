import { describe, expect, it } from 'vitest'
import { makeRedactor, REDACTED } from './redact.js'

describe('redaction at capture (§14)', () => {
  it('replaces a secret wherever it appears, at any depth', () => {
    const redact = makeRedactor(['hunter2', 'sk-abc123'])
    expect(
      redact({
        uri: 'mongodb://app:hunter2@db:27017/x',
        nested: { key: 'Bearer sk-abc123' },
        list: ['hunter2'],
      }),
    ).toEqual({
      uri: `mongodb://app:${REDACTED}@db:27017/x`,
      nested: { key: `Bearer ${REDACTED}` },
      list: [REDACTED],
    })
  })

  it('replaces EVERY occurrence in one string, not just the first', () => {
    // An env dump repeats a password across MONGODB_URI, MONGO_PASSWORD and a
    // stack frame. Replacing only the first leaves the other two persisted, and
    // the row looks redacted.
    const redact = makeRedactor(['hunter2'])
    expect(redact('a=hunter2 b=hunter2 c=hunter2')).toBe(
      `a=${REDACTED} b=${REDACTED} c=${REDACTED}`,
    )
  })

  it('ignores a very short secret rather than redacting the whole document', () => {
    // A one-character secret would replace every occurrence of that character.
    // Refusing to use it is safer than a document redacted into uselessness —
    // and the refusal is visible, which a mangled document is not.
    const redact = makeRedactor(['a', 'hunter2'])
    expect(redact('a cat named hunter2')).toBe(`a cat named ${REDACTED}`)
  })

  it('redacts the longest match first, so a nested secret cannot leave a tail', () => {
    // Two service credentials where one contains the other — a real shape, since
    // a Mongo URI holds the password it was built from. Redacting the SHORT one
    // first turns the long one into `[REDACTED]xyz`, which still carries the
    // part that made it unique.
    const redact = makeRedactor(['hunter2', 'hunter2xyz'])
    expect(redact('token=hunter2xyz')).toBe(`token=${REDACTED}`)
  })

  it('leaves numbers, booleans and null alone', () => {
    const redact = makeRedactor(['hunter2'])
    expect(redact({ n: 1, b: true, z: null })).toEqual({ n: 1, b: true, z: null })
  })

  it('redacts a Date through its JSON form rather than destroying it', () => {
    // machine_detail is jsonb, so what gets persisted is the JSON form. A walker
    // that treated a Date as a plain object would store `{}` and lose the value.
    const redact = makeRedactor(['hunter2'])
    expect(redact({ at: new Date('2026-09-09T00:00:00.000Z') })).toEqual({
      at: '2026-09-09T00:00:00.000Z',
    })
  })

  it('is a no-op when the app has no secrets yet', () => {
    // The first deploy of an app registers its SP before any service credential
    // exists, so this is the ordinary case rather than an edge one.
    const redact = makeRedactor([])
    expect(redact({ a: 'anything at all' })).toEqual({ a: 'anything at all' })
  })
})
