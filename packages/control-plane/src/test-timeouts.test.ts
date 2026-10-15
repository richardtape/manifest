import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BASE_HOOK_TIMEOUT_MS,
  BASE_TEST_TIMEOUT_MS,
  resetLockTimeoutMs,
  scaled,
  testTimeouts,
  timeoutScale,
} from './test-timeouts.js'

/**
 * The timeout scale (the gentler test tiers plan, Task 2): a test tier run at a lower priority is slower,
 * so Vitest's limits grow with it — and every one, or a test that asked for more time ends up with less.
 */
const scale = (value: string) => ({ MANIFEST_TEST_TIMEOUT_SCALE: value })

describe('the timeout scale', () => {
  it('is 1 when unset or blank', () => {
    expect(timeoutScale({})).toBe(1)
    expect(timeoutScale(scale(''))).toBe(1)
    expect(timeoutScale(scale('  '))).toBe(1)
  })

  it('reads a number from 1 to 10, a fraction too', () => {
    expect(timeoutScale(scale('1'))).toBe(1)
    expect(timeoutScale(scale('2'))).toBe(2)
    expect(timeoutScale(scale('1.5'))).toBe(1.5)
    expect(timeoutScale(scale('10'))).toBe(10)
  })

  it('refuses anything else, naming the variable and what it was given', () => {
    for (const value of ['0', '0.5', '-2', '11', 'abc', 'NaN', 'Infinity', '2s']) {
      expect(() => timeoutScale(scale(value))).toThrow(
        `MANIFEST_TEST_TIMEOUT_SCALE must be a number from 1 to 10 — got '${value}'`,
      )
    }
  })

  it('scales Vitest’s own defaults: 5 s a test, 10 s a hook', () => {
    expect(BASE_TEST_TIMEOUT_MS).toBe(5_000)
    expect(BASE_HOOK_TIMEOUT_MS).toBe(10_000)
    expect(testTimeouts({})).toEqual({ testTimeout: 5_000, hookTimeout: 10_000 })
    expect(testTimeouts(scale('4'))).toEqual({ testTimeout: 20_000, hookTimeout: 40_000 })
    expect(testTimeouts(scale('1.5'))).toEqual({
      testTimeout: 7_500,
      hookTimeout: 15_000,
    })
  })

  it('scales an explicit timeout by the same factor', () => {
    expect(scaled(30_000, {})).toBe(30_000)
    expect(scaled(10_000, scale('4'))).toBe(40_000)
  })

  it('gives the reset a lock budget whose three attempts and pauses fit inside a TEST’s timeout', () => {
    expect(resetLockTimeoutMs({})).toBe(1_250)
    expect(resetLockTimeoutMs(scale('4'))).toBe(5_000)
    for (const value of ['1', '2', '4', '10']) {
      const budget = resetLockTimeoutMs(scale(value))
      // Three attempts, and the 100 ms and 200 ms pauses between them (db/truncate.ts).
      expect(3 * budget + 300).toBeLessThan(testTimeouts(scale(value)).testTimeout)
    }
  })
})

/**
 * Every explicit timeout in the unit and packages tiers goes through `scaled()`. These two shapes are the
 * ones the tiers used — `}, 30_000)` closing a test or hook, and `{ timeout: 30_000 },` on its own line.
 */
const BARE_TIMEOUT =
  /^[\t ]*\}, [0-9][0-9_]*\)[\t ]*(\/\/.*)?$|^[\t ]*\{ timeout: [0-9][0-9_]* \},?[\t ]*$/

const ROOT = new URL('../../../', import.meta.url).pathname
const SOURCES = [
  'packages/control-plane/src',
  'packages/contract/src',
  'packages/journey/src',
  'packages/console/src',
  'packages/mock/src',
  'packages/github-fake/src',
]
/**
 * A suite kept in a module, not a `*.test.ts`, and run only by the unit tier (`authz-contract.test.ts`).
 * NOT `runtime/driver-contract.ts`: the Docker tier runs it too (`driver.docker.test.ts`), whose limits
 * this plan leaves unscaled — and its 120–900 s are never below a scaled default.
 */
const SHARED_SUITES = ['packages/control-plane/src/api/authz-contract.ts']

describe('every explicit timeout in the unit and packages tiers is scaled', () => {
  it('no test file passes Vitest a bare number of milliseconds', () => {
    // The scanner can see one: a negative claim needs a positive control in the same test.
    expect(BARE_TIMEOUT.test('  }, 30_000)')).toBe(true)
    expect(BARE_TIMEOUT.test('  }, 15_000) // a reason')).toBe(true)
    expect(BARE_TIMEOUT.test('    { timeout: 30_000 },')).toBe(true)
    expect(BARE_TIMEOUT.test('  }, scaled(30_000))')).toBe(false)
    expect(BARE_TIMEOUT.test('    { timeout: scaled(30_000) },')).toBe(false)

    const files: string[] = [...SHARED_SUITES]
    for (const source of SOURCES) {
      for (const file of readdirSync(join(ROOT, source), {
        recursive: true,
        encoding: 'utf8',
      })) {
        if (file.endsWith('.test.ts') && !file.endsWith('.docker.test.ts')) {
          files.push(`${source}/${file}`)
        }
      }
    }
    // And the walk found the files — or `offenders` below is empty for the wrong reason (the whole-branch
    // review's I2, sitting 2): a nested file, a file of a second package, and the count (222 in 2026-10).
    expect(files).toContain('packages/control-plane/src/api/lifecycle.test.ts')
    expect(files).toContain('packages/journey/src/examples.test.ts')
    expect(files.length).toBeGreaterThan(200)
    const offenders: string[] = []
    for (const file of files) {
      readFileSync(join(ROOT, file), 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (BARE_TIMEOUT.test(line)) offenders.push(`${file}:${index + 1}`)
        })
    }
    expect(offenders).toEqual([])
  })
})
