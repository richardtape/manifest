import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanForSecrets } from './gates.js'
import { SECRET_PATTERNS, scanText } from './secret-patterns.js'
import { BACKTRACKING_LINES, SAMPLE_SECRETS, SECRET_CORPUS } from './testing.js'

/**
 * THE LIST (the D5 plan's Task 11, Decision 14) — one list of rules for the build's gate, the
 * drivers' pre-push scan, driver 2's mirror scan and driver 1's rendered hook. These cases
 * hold the list itself; `source/pre-receive.test.ts` holds the hook to the same answers.
 */
describe('THE secret list — one list, every path (§12, §20)', () => {
  it('catches every rule’s own sample, names it by that rule, and finds nothing in a clean file', () => {
    for (const [rule, secret] of Object.entries(SAMPLE_SECRETS)) {
      expect(scanText(`x\nvalue: ${secret}\n`, 'f.txt'), rule).toEqual([
        { path: 'f.txt', line: 2, rule },
      ])
    }
    // The positive control's other half: a clean file finds nothing, so a list that matched
    // everything could not pass the loop above AND this.
    expect(scanText("export const greeting = 'hello'\nAKIA alone\n", 'clean.js')).toEqual(
      [],
    )
    // Every rule in the list has a sample, so none is untested.
    expect(Object.keys(SAMPLE_SECRETS).sort()).toEqual(
      SECRET_PATTERNS.map((p) => p.name).sort(),
    )
  })

  it('catches GitHub’s STATELESS installation token — the one the build’s gate missed ([M6])', () => {
    const token = SAMPLE_SECRETS['a GitHub App installation token']
    expect(token).toMatch(/^ghs_\d+_eyJ/) // the shape the plan measured, not something kinder
    expect(scanText(`GITHUB_TOKEN=${token}`, '.env')).toEqual([
      { path: '.env', line: 1, rule: 'a GitHub App installation token' },
    ])
    // Neither older rule sees it — which is why the new one exists at all.
    const older = SECRET_PATTERNS.filter(
      (p) => p.name === 'a GitHub token' || p.name === 'a JSON Web Token',
    )
    expect(older).toHaveLength(2)
    for (const p of older) expect(p.pattern.test(token), p.name).toBe(false)
    expect(
      scanText(`t=${SAMPLE_SECRETS['a GitHub fine-grained token']}`, 'a')[0]?.rule,
    ).toBe('a GitHub fine-grained token')
  })

  it('keeps the ORDER: the first rule names a line, once, and the new rules change no older answer', () => {
    const two = SECRET_CORPUS.find((e) => e.path === 'config/two.js')!
    expect(scanText(two.text, two.path)).toEqual([
      { path: 'config/two.js', line: 2, rule: 'an AWS access key id' },
    ])
    // A classic 40-character `ghs_` token still reads as the rule it always did.
    expect(scanText(`ghs_${'a'.repeat(36)}`, 'x')[0]?.rule).toBe('a GitHub token')
  })

  it('never returns the matched text — a canary is in no field of any finding', () => {
    for (const entry of SECRET_CORPUS) {
      const seen = JSON.stringify(scanText(entry.text, entry.path))
      for (const secret of Object.values(SAMPLE_SECRETS)) {
        expect(seen, entry.name).not.toContain(secret)
        expect(seen, entry.name).not.toContain(secret.slice(4, 16))
      }
    }
  })

  it('scans a 1 MiB line built to make a rule backtrack in well under a second, and finds nothing in it ([S3])', () => {
    const lines = Object.entries(BACKTRACKING_LINES)
    expect(lines.length).toBeGreaterThan(5)
    for (const [name, line] of lines) {
      expect(line.length, name).toBeGreaterThan(1024 * 1024 - 20)
      const started = performance.now()
      const found = scanText(line, 'bundle.js')
      const ms = performance.now() - started
      // Until 2026-09-27 the first line took ~100 s: the JWT rule read the whole run again
      // from every `eyJ` in it. Linear, each is a few milliseconds; the bound allows for load.
      expect(ms, `${name}: ${Math.round(ms)} ms`).toBeLessThan(1000)
      expect(found, name).toEqual([])
    }
  })

  it('still finds a JWT and an installation token inside a 1 MiB line built to make the scan backtrack ([S3])', () => {
    const noise = BACKTRACKING_LINES['JWT openings, and no dot']!
    const jwt = SAMPLE_SECRETS['a JSON Web Token']
    const ghs = SAMPLE_SECRETS['a GitHub App installation token']
    const half = noise.length / 2
    expect(
      scanText(`${noise.slice(0, half)} ${jwt} ${noise.slice(half)}`, 'a.js'),
    ).toEqual([{ path: 'a.js', line: 1, rule: 'a JSON Web Token' }])
    // A token that begins INSIDE a run, after a `-` — the word boundary the rule has always
    // allowed there — is found too.
    expect(scanText(`${noise}${jwt}`, 'b.js')[0]?.rule).toBe('a JSON Web Token')
    expect(scanText(`${noise} GITHUB_TOKEN=${ghs}`, 'c.js')[0]?.rule).toBe(
      'a GitHub App installation token',
    )
  })

  it('answers exactly what the two rules answered before they were made linear, over 20,000 generated lines ([S3])', () => {
    // THE ORACLE: the two rules exactly as written until 2026-09-27, when a crafted line made
    // them quadratic. The rewrite must change their speed and nothing else.
    const C = '[A-Za-z0-9_-]'
    const before: Record<string, RegExp> = {
      'a JSON Web Token': new RegExp(`\\beyJ${C}{10,}\\.${C}{10,}\\.${C}{10,}\\b`),
      'a GitHub App installation token': new RegExp(
        `\\bghs_\\d+_${C}{10,}\\.${C}{10,}\\.${C}{10,}`,
      ),
    }
    // mulberry32, seeded, so a disagreement reproduces.
    let state = 20260927
    const random = () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!
    const run = () =>
      Array.from({ length: 6 + Math.floor(random() * 10) }, () =>
        pick([...'aZ9_-']),
      ).join('')
    const glue = ['', ' ', '-', '_', '.', '.', '.', '"', '=', '..']
    const heads = [
      'eyJ',
      '-eyJ',
      'xeyJ',
      '_eyJ',
      'eyj',
      'ghs_1_',
      'ghs_12345_',
      '-ghs_7_',
      'ghs__',
      'ghs_x_',
    ]
    const line = () => {
      let s = ''
      for (let i = 0, n = 1 + Math.floor(random() * 4); i < n; i++) {
        s += pick(glue) + (random() < 0.6 ? pick(heads) : '') + run()
        s += pick(glue) + run() + pick(glue) + run()
      }
      return s
    }
    for (const [rule, old] of Object.entries(before)) {
      const now = SECRET_PATTERNS.find((p) => p.name === rule)!.pattern
      expect(now.source, rule).not.toBe(old.source) // the rule really was rewritten
    }
    const disagree: string[] = []
    const matched: Record<string, number> = {}
    for (let n = 0; n < 20_000; n++) {
      const s = line()
      for (const [rule, old] of Object.entries(before)) {
        const was = old.test(s)
        if (was) matched[rule] = (matched[rule] ?? 0) + 1
        const now = SECRET_PATTERNS.find((p) => p.name === rule)!.pattern.test(s)
        if (now !== was && disagree.length < 5)
          disagree.push(`${rule}: ${JSON.stringify(s)}`)
      }
    }
    expect(disagree).toEqual([])
    // Not vacuous: each rule matched hundreds of the lines, and missed most of the rest.
    for (const rule of Object.keys(before)) {
      expect(matched[rule] ?? 0, rule).toBeGreaterThan(100)
      expect(matched[rule] ?? 0, rule).toBeLessThan(10_000)
    }
  })

  it('the build’s gate finds EXACTLY what scanText finds over the same files — there is one list', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-corpus-'))
    for (const entry of SECRET_CORPUS) {
      mkdirSync(join(dir, entry.path, '..'), { recursive: true })
      writeFileSync(join(dir, entry.path), entry.text)
    }
    const expected = SECRET_CORPUS.flatMap((e) => scanText(e.text, e.path))
    expect(expected.length).toBeGreaterThan(SECRET_CORPUS.length - 1) // not vacuous
    const gate = await scanForSecrets(dir)
    const key = (f: { path?: string; line?: number; rule: string }) =>
      `${f.path}:${f.line} ${f.rule}`
    expect(
      gate.map((f) => key({ ...f, rule: f.message.replace(/^looks like /, '') })).sort(),
    ).toEqual(expected.map(key).sort())
  })
})
