import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

/**
 * COMMENTS OUT, STRING BODIES KEPT — the same scanner `spec/injection-drift.test.ts`
 * carries, for the same reason and after the same kind of false report.
 *
 * The import pattern below is `\bfrom\s+['"]…['"]`, and an ordinary English sentence in a
 * comment satisfies it: *`indistinguishable from "the token was minted without …"`* made
 * this test red on `token.ts` the first time a journey file wrote prose of that shape
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
 * §22 and §16 *API completeness*: a client of the contract imports the contract and
 * nothing else. Written for the journey first, so P5c's console inherits a boundary that
 * has been watched failing (P5a Task 7). Test files are not the client and are not read.
 */
describe('the journey’s imports (§22, §16 API completeness)', () => {
  it('are @manifest/contract, node: builtins and its own files — nothing else', async () => {
    const violations: string[] = []
    /**
     * WHAT IT ALLOWED, counted — so this test cannot pass by reading nothing. Stripping
     * comments is what makes that possible: a scanner that silently ate the source would
     * report no violations and no imports, and an empty `violations` would look exactly
     * like a boundary being held.
     */
    const allowed: string[] = []
    const filesRead = new Set<string>()
    for (const name of await readdir(SRC)) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue
      const file = join(SRC, name)
      const text = executableSource(await readFile(file, 'utf8'))
      for (const m of text.matchAll(
        /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g,
      )) {
        const spec = m[1]!
        filesRead.add(name)
        if (spec === '@manifest/contract' || spec.startsWith('node:')) {
          allowed.push(spec)
          continue
        }
        if (
          spec.startsWith('./') &&
          dirname(resolve(dirname(file), spec)) === resolve(SRC)
        ) {
          allowed.push(spec)
          continue
        }
        violations.push(`${relative(SRC, file)}: ${spec}`)
      }
    }
    expect(violations).toEqual([])
    expect(allowed, 'the scanner read no imports at all').toContain('@manifest/contract')
    // More than one file, so a scanner that ate everything after the first would be seen.
    // A count, not a headcount: this holds however many entry points the package grows.
    expect(filesRead.size, 'imports were read from fewer than two files').toBeGreaterThan(
      1,
    )
  })

  /**
   * The stripper's own two claims, because everything above rests on them and neither is
   * observable from a green boundary check: a real import must survive, and prose that
   * happens to read like one must not. Written after the prose case turned the boundary
   * red on `token.ts` (P5b sitting 8).
   */
  it('reads imports and not the sentences that look like them', () => {
    const source = executableSource(
      [
        '/** indistinguishable from "the token was minted without members:manage". */',
        "import { unwrap } from '@manifest/contract'",
        "// import { readFile } from 'node:fs/promises'",
        "const url = 'https://console.manifest.internal' // not a comment inside the string",
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
