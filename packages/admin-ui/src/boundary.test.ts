import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

/**
 * THE ADMINISTRATOR'S CONSOLE IS A CLIENT OF THE PUBLISHED CONTRACT AND NOTHING ELSE (§26: *"The
 * import boundary that binds `console/` binds `admin-ui/`"*; D22, D31). THE FOURTH COPY of this
 * scanner — after the journey's, the console's and the faculty front-end's — copied rather than
 * imported for the reason the console's copy gives: a test file is not a module another package
 * depends on, and the boundary it holds must not itself reach across one.
 *
 * Copied from packages/console/src/boundary.test.ts whole but for three things: SRC is this
 * package's; `react-dom` is allowed only as `react-dom` and `react-dom/client` (the console allows
 * any `react-dom/…`; this console's source needs no other, and its tests — which use
 * `react-dom/server` — are skipped like the console's); and `.test.tsx` files are skipped as well as
 * `.test.ts`, because this console's screens are tested by rendering them. The console's second
 * `describe`, its HTML reference's boundary, has no counterpart here.
 *
 * COMMENTS OUT, STRING BODIES KEPT: the import pattern below is `\bfrom\s+['"]…['"]`, and an
 * ordinary English sentence in a comment satisfies it (P5b sitting 8); the module specifier IS a
 * string, so string bodies stay — and a scanner, not a regex, because `'//'` inside a string is not
 * a comment and a quote inside a comment opens nothing.
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

/** Every non-test source file under src/, recursively — the screens live in screens/. */
async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)))
    else if (
      /\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    )
      out.push(full)
  }
  return out
}

const ALLOWED = new Set(['@manifest/contract', 'react', 'react-dom', 'react-dom/client'])

describe('the administrator’s console’s imports (§26, D22, D31)', () => {
  it('are @manifest/contract, react, react-dom, node: builtins and its own files — nothing else', async () => {
    const violations: string[] = []
    /**
     * WHAT IT ALLOWED, counted — so this test cannot pass by reading nothing: a scanner that
     * silently ate the source would report no violations and no imports, and an empty
     * `violations` would look exactly like a boundary being held (P5b sitting 8, F3).
     */
    const allowed: string[] = []
    const filesRead = new Set<string>()
    for (const file of await sourceFiles(SRC)) {
      const text = executableSource(await readFile(file, 'utf8'))
      for (const m of text.matchAll(
        /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g,
      )) {
        const spec = m[1]!
        filesRead.add(relative(SRC, file))
        if (ALLOWED.has(spec) || spec.startsWith('node:')) {
          allowed.push(spec)
          continue
        }
        if (spec.startsWith('./') || spec.startsWith('../')) {
          const target = resolve(dirname(file), spec)
          if (target.startsWith(resolve(SRC))) {
            allowed.push(spec)
            continue
          }
        }
        violations.push(`${relative(SRC, file)}: ${spec}`)
      }
    }
    expect(violations).toEqual([])
    // `@manifest/contract` is the import D22 is about: a console that had stopped importing it
    // would satisfy every other assertion here.
    expect(allowed, 'the scanner read no imports at all').toContain('@manifest/contract')
    expect(filesRead.size, 'imports were read from fewer than two files').toBeGreaterThan(
      1,
    )
  })

  /**
   * THE HALF A LINT RULE CANNOT SEE: a screen that called `fetch('/v1/queue')` imports nothing and
   * passes every import check ever written — a client of the API that is not a client of the
   * CONTRACT. The browser's own round trips (`/auth/login`, and §20's `/auth/step-up` when the
   * approval pane needs it) are outside the contract by D23.8 and live in src/auth.ts and nowhere
   * else, as in the reference console.
   */
  it('reaches the API through the contract — except auth.ts, which owns the /auth/ round trips', async () => {
    const offenders: string[] = []
    let authSaw = 0
    for (const file of await sourceFiles(SRC)) {
      const name = relative(SRC, file)
      const text = executableSource(await readFile(file, 'utf8'))
      const hits = [...text.matchAll(/\bfetch\s*\(|['"`]\/auth\//g)].length
      if (name === 'auth.ts') authSaw = hits
      else if (hits > 0) offenders.push(`${name}: ${hits}`)
    }
    expect(offenders).toEqual([])
    // The positive control: auth.ts must still name the sign-in round trip, or this test asserts
    // nothing and would stay green if the whole rule were deleted. (The reference console's reads
    // `> 1`: it owns three. This one owns sign-in and the rail's sign-out until the approval pane
    // adds step-up.)
    expect(
      authSaw,
      'auth.ts names no /auth/ path — did the scanner read it?',
    ).toBeGreaterThan(0)
  })

  /**
   * THE SCANNER MUST HAVE DESCENDED (P5c sitting 4: with the recursion replaced by `continue`, every
   * test above stayed GREEN while every file under src/screens/ went unread).
   */
  it('descends into src/ subdirectories, where every screen lives', async () => {
    const nested = (await sourceFiles(SRC))
      .map((f) => relative(SRC, f))
      .filter((f) => f.includes(sep))
    expect(
      nested,
      'the scanner read no file in any subdirectory of src/ — did it stop recursing?',
    ).not.toEqual([])
  })

  /** The stripper's own two claims, because everything above rests on them. */
  it('reads imports and not the sentences that look like them', () => {
    const source = executableSource(
      [
        '/** a release, distinguishable from "the one the queue names". */',
        "import { unwrap } from '@manifest/contract'",
        "// import { readFile } from 'node:fs/promises'",
        "const origin = 'http://127.0.0.1:7101' // not a comment inside the string",
      ].join('\n'),
    )
    const found = [
      ...source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g),
    ].map((m) => m[1])
    expect(found).toEqual(['@manifest/contract'])
    expect(source, 'a string body must survive intact').toContain('http://127.0.0.1:7101')
  })
})
