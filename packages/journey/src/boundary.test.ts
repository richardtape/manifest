import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

/**
 * §22 and §16 *API completeness*: a client of the contract imports the contract and
 * nothing else. Written for the journey first, so P5c's console inherits a boundary that
 * has been watched failing (P5a Task 7). Test files are not the client and are not read.
 */
describe('the journey’s imports (§22, §16 API completeness)', () => {
  it('are @manifest/contract, node: builtins and its own files — nothing else', async () => {
    const violations: string[] = []
    for (const name of await readdir(SRC)) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue
      const file = join(SRC, name)
      const text = await readFile(file, 'utf8')
      for (const m of text.matchAll(
        /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g,
      )) {
        const spec = m[1]!
        if (spec === '@manifest/contract' || spec.startsWith('node:')) continue
        if (
          spec.startsWith('./') &&
          dirname(resolve(dirname(file), spec)) === resolve(SRC)
        )
          continue
        violations.push(`${relative(SRC, file)}: ${spec}`)
      }
    }
    expect(violations).toEqual([])
  })
})
