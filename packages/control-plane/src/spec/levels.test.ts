import { describe, expect, it } from 'vitest'
import {
  CLASSIFICATION_RANK,
  CLASSIFICATIONS,
  LEVEL_ALIASES,
  LEVELS,
  canonicalLevel,
  levelName,
  levelWords,
  manifestSchema,
  specInLevels,
} from './index.js'

/**
 * UBC'S U1 LEVELS, AND MANIFEST'S EARLIER NAMES AS ALIASES (§7's *Data classification: UBC's U1
 * levels*; Rich, 2026-10-03, 21:48). One rank table of seven names: the four levels at 0–3, and each
 * alias at its level's rank, so a read that never canonicalizes still ranks a stored alias right.
 */

const minimal = {
  manifest: 1,
  name: 'chem-lab-scheduler',
  blueprint: 'node-ts-mongo@2',
  runtime: { port: 3000 },
}
const declaring = (classification?: string) =>
  manifestSchema.safeParse({
    ...minimal,
    ...(classification === undefined ? {} : { data: { classification } }),
  })

describe('UBC’s U1 levels, and Manifest’s earlier names as aliases (U1 plan Task 1)', () => {
  it('ranks the four levels low < medium < high < very-high', () => {
    expect(LEVELS.map((l) => CLASSIFICATION_RANK[l])).toEqual([0, 1, 2, 3])
  })

  it('ranks EVERY alias exactly at its level — the aliases never widen (Review Focus 1)', () => {
    expect(LEVEL_ALIASES).toEqual({
      public: 'low',
      internal: 'medium',
      confidential: 'very-high',
    })
    for (const [alias, level] of Object.entries(LEVEL_ALIASES)) {
      expect(CLASSIFICATION_RANK[alias as keyof typeof LEVEL_ALIASES], alias).toBe(
        CLASSIFICATION_RANK[level],
      )
    }
    // The partial edit this guards: `confidential: 2` left in place reads it as `high`, which reaches OpenAI.
    expect(CLASSIFICATION_RANK.confidential).toBeGreaterThan(CLASSIFICATION_RANK.high)
  })

  it('holds the seven names and nothing else — no prototype name is a level', () => {
    const seven = [
      'confidential',
      'high',
      'internal',
      'low',
      'medium',
      'public',
      'very-high',
    ]
    expect([...CLASSIFICATIONS].sort()).toEqual(seven)
    expect(Object.keys(CLASSIFICATION_RANK).sort()).toEqual(seven)
    for (const value of [
      'toString',
      'constructor',
      '__proto__',
      'hasOwnProperty',
      'High',
      'very_high',
      'restricted',
      '',
      2,
      null,
      undefined,
    ]) {
      expect(canonicalLevel(value), String(value)).toBeUndefined()
    }
  })

  it('answers each name’s level as a value and in words, and keeps an unknown value as written', () => {
    const seven = [
      'low',
      'medium',
      'high',
      'very-high',
      'public',
      'internal',
      'confidential',
    ]
    expect(seven.map((v) => canonicalLevel(v))).toEqual([
      'low',
      'medium',
      'high',
      'very-high',
      'low',
      'medium',
      'very-high',
    ])
    expect(levelName('confidential')).toBe('very-high')
    expect(levelWords('confidential')).toBe('very high')
    expect(levelWords('internal')).toBe('medium')
    expect(levelName('secret')).toBe('secret')
    expect(levelWords('secret')).toBe('secret')
  })

  it('accepts all seven names in manifest.yaml, and refuses any other — high accepted in the same test', () => {
    for (const v of [
      'low',
      'medium',
      'high',
      'very-high',
      'public',
      'internal',
      'confidential',
    ]) {
      expect(declaring(v).success, v).toBe(true)
    }
    for (const v of ['restricted', 'High', 'very_high', 'personal', 'secret']) {
      expect(declaring(v).success, v).toBe(false)
    }
  })

  it('stores the LEVEL — an alias as what it means (S6; U1 plan Task 2)', () => {
    const cases: [string, string][] = [
      ['low', 'low'],
      ['medium', 'medium'],
      ['high', 'high'],
      ['very-high', 'very-high'],
      ['public', 'low'],
      ['internal', 'medium'],
      ['confidential', 'very-high'],
    ]
    for (const [written, stored] of cases) {
      const r = declaring(written)
      expect(r.success, written).toBe(true)
      if (r.success) expect(r.data.data.classification, written).toBe(stored)
    }
  })

  it('defaults an undeclared app to medium — internal’s level, so nothing changes (S5)', () => {
    const r = declaring(undefined)
    expect(r.success && r.data.data.classification).toBe('medium')
  })

  it('specInLevels answers a stored spec with its level, and leaves everything else as stored', () => {
    expect(
      specInLevels({
        name: 'x',
        data: { classification: 'internal', retention_days: 30 },
      }),
    ).toEqual({
      name: 'x',
      data: { classification: 'medium', retention_days: 30 },
    })
    expect(specInLevels({ data: { classification: 'secret' } })).toEqual({
      data: { classification: 'secret' },
    })
    expect(specInLevels({ name: 'y' })).toEqual({ name: 'y' })
  })
})
