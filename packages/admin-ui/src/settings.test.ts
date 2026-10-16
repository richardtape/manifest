import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SECTIONS, SETTINGS, type Setting } from './settings.js'

/**
 * EVERY SETTING HELD TO WHERE THE PLATFORM READS IT (decision 12): the files are read as text — a test
 * is outside the import boundary — so a variable renamed in the control plane, a constant moved or a
 * model taken out of the catalogue turns this red, rather than the Settings screen quietly naming
 * something the platform no longer reads.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const text = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const named = (source: string, key: string) =>
  new RegExp(
    `(^|[^A-Za-z0-9_-])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_-]|$)`,
    'm',
  ).test(source)
const of = (kind: Setting['kind']) => SETTINGS.filter((s) => s.kind === kind)

describe('every setting is one the platform reads, where the screen says', () => {
  it('names only environment variables the control plane reads — config.ts or .env.example', () => {
    const read = text('packages/control-plane/src/config.ts') + text('.env.example')
    const missing = of('env').filter((s) => !named(read, s.key))
    expect(missing.map((s) => s.key)).toEqual([])
    expect(of('env').length).toBeGreaterThan(30)
  })

  it('names database defaults and tables the schema has', () => {
    const missing = of('database').filter(
      (s) => !named(text(s.file!), s.key.split('.').at(-1)!),
    )
    expect(missing.map((s) => s.key)).toEqual([])
  })

  it('names models the catalogue has, or the control plane registers at start', () => {
    const missing = of('model').filter((s) => !named(text(s.file!), s.key))
    expect(missing.map((s) => s.key)).toEqual([])
  })

  it('names constants exported where it says, and files that exist', () => {
    const constants = of('code').filter(
      (s) => !new RegExp(`export const ${s.key}\\b`).test(text(s.file!)),
    )
    expect(constants.map((s) => s.key)).toEqual([])
    const files = of('file').filter(
      (s) =>
        !existsSync(join(ROOT, s.file!)) ||
        !text(s.file!).includes(s.key.replace(/^make /, '')),
    )
    expect(files.map((s) => s.key)).toEqual([])
  })

  it('gives every row but an environment variable the file it is read from', () => {
    expect(SETTINGS.filter((s) => s.kind !== 'env' && s.file === undefined)).toEqual([])
  })

  it('places every row in a section, and every section but the blueprints has a row', () => {
    const ids = new Set(SECTIONS.map((s) => s.id))
    expect(SETTINGS.filter((s) => !ids.has(s.section))).toEqual([])
    const empty = SECTIONS.filter(
      (sec) => sec.id !== 'blueprints' && !SETTINGS.some((s) => s.section === sec.id),
    )
    expect(empty.map((s) => s.id)).toEqual([])
    expect(new Set(SETTINGS.map((s) => s.key)).size).toBe(SETTINGS.length)
  })

  it('cites no spec section, decision or plan in what it shows', () => {
    const shown = [
      ...SECTIONS.flatMap((s) => [s.label, s.title, s.note, s.foot ?? '']),
      ...SETTINGS.flatMap((s) => [s.label, s.where, s.action]),
    ]
    expect(shown.filter((w) => /§|\bD\d+\b|\bA\d+\b|decision \d/i.test(w))).toEqual([])
  })
})
