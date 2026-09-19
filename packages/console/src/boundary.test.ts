import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

/**
 * COMMENTS OUT, STRING BODIES KEPT — copied verbatim from
 * packages/journey/src/boundary.test.ts, whose doc comment says why it is a scanner and not
 * a regex. Copied rather than imported: that file is a test file, and a test file is not a
 * module another package depends on.
 *
 * The import pattern below is `\bfrom\s+['"]…['"]`, and an ordinary English sentence in a
 * comment satisfies it: *`indistinguishable from "the token was minted without …"`* made
 * the journey's copy red on `token.ts` the first time a file wrote prose of that shape
 * (P5b sitting 8). A prose false positive is not silent, so it costs a gate rather than a
 * defect — but the next author's fix for it would be to reword the sentence, and this file
 * is the one place that would teach them the boundary is a text match rather than a parse.
 *
 * String bodies are KEPT, unlike a `process.env` scan, because the module specifier IS a
 * string — and written as a scanner rather than a regex because the two states are not
 * regular: `'//'` inside a string is not a comment, and a quote inside a comment opens
 * nothing.
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

/**
 * Every non-test source file under src/, recursively — the console has subdirectories where
 * the journey does not, and a scanner that reads one level would silently skip screens/.
 */
async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)))
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts'))
      out.push(full)
  }
  return out
}

describe('the console’s imports (D22, §22, §16 API completeness)', () => {
  it('are @manifest/contract, react, node: builtins and its own files — nothing else', async () => {
    const violations: string[] = []
    /**
     * WHAT IT ALLOWED, counted — so this test cannot pass by reading nothing. Stripping
     * comments is what makes that possible: a scanner that silently ate the source would
     * report no violations and no imports, and an empty `violations` would look exactly
     * like a boundary being held.
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
        if (
          spec === '@manifest/contract' ||
          spec === 'react' ||
          spec === 'react-dom' ||
          spec.startsWith('react-dom/') ||
          spec.startsWith('node:')
        ) {
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
    // A scanner that ate the source reports no violations AND no imports; these two say
    // which it was (P5b sitting 8, F3).
    //
    // `react` rather than `@manifest/contract`, which is what the plan wrote and what the
    // journey's copy asserts: no console file imports the contract until Task 4 writes
    // `api.ts`, so the plan's assertion would fail here for a reason that has nothing to do
    // with the boundary. TASK 4 SHOULD TIGHTEN THIS TO `@manifest/contract` — it is the
    // import D22 is actually about, and `react` only proves the scanner read something.
    expect(allowed, 'the scanner read no imports at all').toContain('react')
    expect(filesRead.size, 'imports were read from fewer than two files').toBeGreaterThan(
      1,
    )
  })

  /**
   * THE HALF A LINT RULE CANNOT SEE (Decision 5). A screen that called
   * `fetch('/v1/projects')` imports nothing and passes every import check ever written —
   * and it would be a client of the API that is not a client of the CONTRACT, which is the
   * one thing D22 exists to prevent. Two endpoints are legitimately outside the contract by
   * D23.8 and are listed with their reasons in the control plane's own api/unversioned.ts;
   * they live in src/auth.ts and nowhere else.
   */
  it('reaches the API through the contract — except auth.ts, which owns the two unversioned endpoints', async () => {
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
    // The positive control: auth.ts must still contain both, or this test is asserting
    // nothing at all and would stay green if the whole rule were deleted.
    expect(
      authSaw,
      'auth.ts names neither fetch nor /auth/ — did the scanner read it?',
    ).toBeGreaterThan(1)
  })

  /** The stripper's own two claims, because everything above rests on them. */
  it('reads imports and not the sentences that look like them', () => {
    const source = executableSource(
      [
        '/** a project, distinguishable from "the one the API returns". */',
        "import { unwrap } from '@manifest/contract'",
        "// import { readFile } from 'node:fs/promises'",
        "const origin = 'https://console.manifest.internal' // not a comment inside the string",
      ].join('\n'),
    )
    const found = [
      ...source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g),
    ].map((m) => m[1])
    expect(found).toEqual(['@manifest/contract'])
    expect(source, 'a string body must survive intact').toContain(
      'https://console.manifest.internal',
    )
  })
})
