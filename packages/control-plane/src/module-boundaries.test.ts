import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = new URL('.', import.meta.url).pathname

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await sourceFiles(full)))
    else if (e.name.endsWith('.ts')) out.push(full)
  }
  return out
}

/** Every relative import. Package imports are somebody else's problem. */
const RELATIVE_IMPORT = /from\s+'(\.[^']+)'/g

/**
 * A module's public surface: `index` for production code, `testing` for the helpers
 * tests may reach for. Keeping test helpers out of `index` keeps them out of the
 * shipped bundle; naming `testing` here keeps tests honest about everything else.
 */
const PUBLIC_ENTRIES = new Set(['index.ts', 'index.js', 'testing.ts', 'testing.js'])

/**
 * The module a path belongs to — the first segment under `src/`, or null for files
 * that sit directly in `src/` (`config.ts`, `index.ts`) and belong to no module.
 */
function moduleOf(path: string): string | null {
  const rel = relative(SRC, path)
  if (rel.startsWith('..')) return null
  const segments = rel.split(sep)
  return segments.length > 1 ? segments[0]! : null
}

describe('module boundaries (§5)', () => {
  it('never imports another module by a deep path', async () => {
    const files = await sourceFiles(SRC)
    const violations: string[] = []

    for (const file of files) {
      const text = await readFile(file, 'utf8')
      const from = moduleOf(file)

      for (const match of text.matchAll(RELATIVE_IMPORT)) {
        const target = resolve(dirname(file), match[1]!)
        const to = moduleOf(target)

        // Inside one module, or reaching a file that belongs to no module
        // (`config.ts`): not a boundary crossing.
        if (to === null || to === from) continue

        // Crossing: the target must be that module's public entry point, not a
        // file inside it. `api/routes/x.ts -> ../../db/index.js` is fine;
        // `-> ../../db/schema.js` is not.
        const withinTarget = relative(join(SRC, to), target)
        if (!PUBLIC_ENTRIES.has(withinTarget)) {
          violations.push(`${relative(SRC, file)}: ${match[0]}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
