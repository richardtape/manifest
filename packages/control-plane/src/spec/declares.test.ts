import { describe, expect, it } from 'vitest'
import { declaredData } from './index.js'

/**
 * WHAT THE MANIFEST ITSELF WRITES, as opposed to what its schema fills in (the launch path plan's
 * Task 11; sitting 8's whole-branch review, I2): `data.retention_days` defaults to 365 and
 * `data.classification` to `internal`, so the stored spec always carries both, and only the YAML says
 * whether the owner chose them — which the privacy assessment's draft must know.
 */
describe('declaredData (Task 11)', () => {
  const base = [
    'manifest: 1',
    'name: lp-sample',
    'blueprint: fixture-node@1',
    'runtime:',
    '  port: 3000',
  ]
  const of = (...lines: string[]) => declaredData([...base, ...lines].join('\n'))

  it('says which of data’s two fields manifest.yaml writes', () => {
    expect(of('data:', '  retention_days: 90')).toEqual({
      retention: true,
      classification: false,
    })
    expect(of('data:', '  classification: internal')).toEqual({
      retention: false,
      classification: true,
    })
    expect(of('data:', '  classification: public', '  retention_days: 30')).toEqual({
      retention: true,
      classification: true,
    })
    // A default is not a declaration — with an empty data block, and without one.
    expect(of('data: {}')).toEqual({ retention: false, classification: false })
    expect(of()).toEqual({ retention: false, classification: false })
  })

  it('declares nothing for anything that does not parse, rather than throwing', () => {
    for (const text of ['manifest: [', '', '- a list', 'data: 3'])
      expect(declaredData(text)).toEqual({ retention: false, classification: false })
  })
})
