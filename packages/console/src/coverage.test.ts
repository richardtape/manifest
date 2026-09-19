import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * D22: *"If the console needs something the API does not expose, the API is incomplete."*
 * This is the converse, and it is the claim §16's *API completeness* tier exists to make
 * checkable: **every operation the published contract declares has a CALLER in the
 * console.**
 *
 * It reads ONE file — `src/api.ts` — which is the whole reason Decision 6 put every call
 * there. Scanning the screens instead would be a text match over prose and JSX, which is
 * the shape that turned a gate red on a file with no forbidden import (P5b sitting 8, F3).
 *
 * IF THIS TEST IS RED THE HONEST FIXES ARE TWO: add the caller, or add the operation to
 * `DELIBERATELY_UNCALLED` **with a reason a reader can check**. Weakening the regex is not
 * one of them — an operation that no client calls is a claim about the API's completeness,
 * and the list is where that claim is recorded.
 */
const DELIBERATELY_UNCALLED: Record<string, string> = {
  // Deliberately empty, like ALLOWED_UNSET and PLATFORM_ONLY in the injection-drift tier.
  // All 34 operations are callable by a session — `listFleet` is administrators only, which
  // is a role, not a second client (D31) — so this list starting empty is a measurement,
  // not an aspiration.
}

/**
 * COMMENTS OUT, STRING BODIES KEPT. The THIRD copy of this scanner in the repository, after
 * `packages/journey/src/boundary.test.ts` and this package's own `boundary.test.ts`, and
 * the duplication is deliberate for the reason that file states: it lives in a test file,
 * and a test file is not a module anything imports — importing one from another would
 * register its suites twice.
 *
 * It matters MORE here than there, because of the direction the failure points. A comment
 * in `api.ts` that happened to contain `client.GET('/v1/…')` would make this gate report an
 * operation as CALLED when nothing calls it — a gate that says *"the API is complete"* when
 * it is not. The boundary test's false positive costs a gate; this one would cost the
 * claim.
 */
function executableSource(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const two = text.slice(i, i + 2)
    if (two === '//') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (two === '/*') {
      i += 2
      while (i < text.length && text.slice(i, i + 2) !== '*/') i++
      i += 2
      continue
    }
    const ch = text[i]!
    if (ch === "'" || ch === '"' || ch === '`') {
      out += ch
      i++
      while (i < text.length && text[i] !== ch) {
        if (text[i] === '\\') {
          out += text.slice(i, i + 2)
          i += 2
          continue
        }
        out += text[i]
        i++
      }
      out += ch
      i++
      continue
    }
    out += ch
    i++
  }
  return out
}

interface Document {
  paths: Record<string, Record<string, { operationId?: string }>>
}

describe('§16’s API completeness tier (D22)', () => {
  it('every operation in the published contract has a caller in the console', async () => {
    const document = JSON.parse(
      await readFile(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
    ) as Document
    const source = executableSource(
      await readFile(new URL('./api.ts', import.meta.url), 'utf8'),
    )
    const stream = executableSource(
      await readFile(new URL('./stream.ts', import.meta.url), 'utf8'),
    )
    const auth = executableSource(
      await readFile(new URL('./auth.ts', import.meta.url), 'utf8'),
    )

    const uncalled: string[] = []
    let checked = 0
    for (const [path, operations] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const id = operation.operationId
        if (id === undefined) continue
        checked++
        if (id in DELIBERATELY_UNCALLED) continue
        // THE STREAM IS ONE OF THE 34, NOT A 35th (P5c sitting 1, F5): it is in `d.paths`
        // as `GET /v1/projects/{projectId}/events`. It is not a client method either —
        // `subscribe` opens it, from stream.ts — so it is COUNTED and looked for there.
        const called =
          id === 'streamProjectEvents'
            ? /\bsubscribe\s*\(/.test(stream)
            : new RegExp(
                `client\\.${method.toUpperCase()}\\(\\s*['"]${path.replace(/[{}]/g, '\\$&')}['"]`,
              ).test(source)
        if (!called) uncalled.push(`${method.toUpperCase()} ${path} (${id})`)
      }
    }

    expect(uncalled).toEqual([])
    // A document that failed to parse, or a path table that came back empty, validates
    // perfectly against an empty list. Assert what was READ (P5b sitting 8, F3).
    expect(checked, 'no operations were read from the document').toBeGreaterThan(30)
    // And that auth.ts still owns the two endpoints the client cannot carry, because they
    // are deliberately outside /v1 (D23.8) and so are outside the count above.
    expect(auth).toContain('/auth/login')
    expect(auth).toContain('/auth/logout')
  })

  /**
   * THE SCANNER'S OWN CLAIM, because everything above rests on it — and on the one
   * direction that would make this gate lie: a call that exists only inside a comment must
   * NOT count as a caller.
   */
  it('does not count a call that exists only in a comment', () => {
    const stripped = executableSource(
      [
        "// client.GET('/v1/ghost')",
        "/** and a doc comment saying client.GET('/v1/phantom'). */",
        "const real = client.GET('/v1/me')",
      ].join('\n'),
    )
    expect(/client\.GET\(\s*['"]\/v1\/ghost['"]/.test(stripped)).toBe(false)
    expect(/client\.GET\(\s*['"]\/v1\/phantom['"]/.test(stripped)).toBe(false)
    // The positive half: a scanner that ate the source would also answer false above.
    expect(/client\.GET\(\s*['"]\/v1\/me['"]/.test(stripped)).toBe(true)
  })
})
