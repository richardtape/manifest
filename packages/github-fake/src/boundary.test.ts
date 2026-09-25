import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Decision 7's first half, made mechanical: the fake imports NOTHING from the control plane.
// A fake that shared the driver's code would share the driver's mistakes by construction —
// and agree with them.

const SRC = new URL('.', import.meta.url).pathname
const IMPORT = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g

function importsOf(file: string): string[] {
  const text = readFileSync(join(SRC, file), 'utf8')
  return [...text.matchAll(IMPORT)].map((m) => m[1] ?? m[2] ?? '')
}

describe('the GitHub fake’s boundary', () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'))

  it('reads every source file it means to — the positive control', () => {
    expect(files).toEqual(
      expect.arrayContaining(['server.ts', 'app-auth.ts', 'git-http.ts']),
    )
    expect(importsOf('server.ts')).toContain('./app-auth.js')
  })

  it('imports nothing from packages/control-plane', () => {
    const offending = files.flatMap((f) =>
      importsOf(f)
        .filter((spec) => /control-plane/.test(spec))
        .map((spec) => `${f}: ${spec}`),
    )
    expect(offending).toEqual([])
  })

  it('imports nothing from outside node: built-ins and itself, except Ajv in test support', () => {
    const external = files.flatMap((f) =>
      importsOf(f)
        .filter(
          (spec) =>
            !spec.startsWith('node:') && !spec.startsWith('./') && spec !== 'vitest',
        )
        .filter((spec) => !(f === 'schemas.ts' && /^ajv(-formats)?$/.test(spec)))
        .map((spec) => `${f}: ${spec}`),
    )
    expect(external).toEqual([])
  })
})
