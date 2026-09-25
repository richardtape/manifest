import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanForSecrets } from './gates.js'
import { SECRET_PATTERNS, scanText } from './secret-patterns.js'
import { SAMPLE_SECRETS, SECRET_CORPUS } from './testing.js'

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
