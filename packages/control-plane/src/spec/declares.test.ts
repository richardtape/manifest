import { describe, expect, it } from 'vitest'
import { declaresRetention } from './index.js'

/**
 * WHAT THE MANIFEST ITSELF WRITES, as opposed to what its schema fills in (the launch path plan's
 * Task 11): `data.retention_days` defaults to 365, so the stored spec always carries a number, and
 * only the YAML says whether the owner chose one — which the privacy assessment's draft must know.
 */
describe('declaresRetention (Task 11)', () => {
  const base = [
    'manifest: 1',
    'name: lp-sample',
    'blueprint: fixture-node@1',
    'runtime:',
    '  port: 3000',
  ]

  it('is true only when manifest.yaml writes data.retention_days', () => {
    expect(declaresRetention([...base, 'data:', '  retention_days: 90'].join('\n'))).toBe(
      true,
    )
    // The default is not a declaration — with a data block, and without one.
    expect(
      declaresRetention([...base, 'data:', '  classification: internal'].join('\n')),
    ).toBe(false)
    expect(declaresRetention(base.join('\n'))).toBe(false)
  })

  it('is false for anything that does not parse, rather than throwing', () => {
    expect(declaresRetention('manifest: [')).toBe(false)
    expect(declaresRetention('')).toBe(false)
    expect(declaresRetention('- a list')).toBe(false)
  })
})
