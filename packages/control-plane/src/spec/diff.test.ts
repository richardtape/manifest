import { describe, expect, it } from 'vitest'
import { manifestSchema, type ManifestSpec } from './schema.js'
import { isSensitiveDiff } from './diff.js'

const base = (extra: Record<string, unknown> = {}): ManifestSpec =>
  manifestSchema.parse({
    manifest: 1,
    name: 'chem-lab-scheduler',
    blueprint: 'node-ts-mongo@2',
    runtime: { port: 3000 },
    ...extra,
  })

describe('isSensitiveDiff (§7, D9)', () => {
  it('reports no change as not sensitive', () => {
    expect(isSensitiveDiff(base(), base())).toEqual({ sensitive: false, fields: [] })
  })

  it('ignores an insensitive change', () => {
    const after = base({ description: 'now with a description' })
    expect(isSensitiveDiff(base(), after).sensitive).toBe(false)
  })

  it('flags a new service', () => {
    const after = base({ services: [{ type: 'mongo', version: '7', name: 'db' }] })
    expect(isSensitiveDiff(base(), after)).toEqual({
      sensitive: true,
      fields: ['services'],
    })
  })

  it('flags a new CWL attribute (D16)', () => {
    const before = base({ auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid'] } })
    const after = base({
      auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] },
    })
    expect(isSensitiveDiff(before, after).fields).toEqual(['auth.attributes'])
  })

  it('flags a removed attribute too — the registration must still match', () => {
    const before = base({
      auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] },
    })
    const after = base({ auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid'] } })
    expect(isSensitiveDiff(before, after).fields).toEqual(['auth.attributes'])
  })

  it('flags a new egress destination', () => {
    const after = base({ egress: { allow: ['api.ubc.ca'] } })
    expect(isSensitiveDiff(base(), after).fields).toEqual(['egress.allow'])
  })

  it('flags a resource INCREASE but not a decrease', () => {
    const small = base({ resources: { cpu: 0.5, memory: '512Mi' } })
    const large = base({ resources: { cpu: 1, memory: '1Gi' } })
    expect(isSensitiveDiff(small, large).fields).toEqual(['resources'])
    expect(isSensitiveDiff(large, small).sensitive).toBe(false)
  })

  it('flags a classification change in either direction', () => {
    const before = base({ data: { classification: 'internal' } })
    const after = base({ data: { classification: 'confidential' } })
    expect(isSensitiveDiff(before, after).fields).toEqual(['data.classification'])
    expect(isSensitiveDiff(after, before).fields).toEqual(['data.classification'])
  })

  it('flags a model change — jurisdiction can move without classification changing', () => {
    const before = base({ ai: { models: ['default-chat'] } })
    const after = base({ ai: { models: ['default-chat-onprem'] } })
    expect(isSensitiveDiff(before, after).fields).toEqual(['ai.models'])
  })

  it('flags a blueprint MAJOR bump but not a name-identical repin', () => {
    const after = base({ blueprint: 'node-ts-mongo@3' })
    expect(isSensitiveDiff(base(), after).fields).toEqual(['blueprint'])
    expect(isSensitiveDiff(base(), base()).sensitive).toBe(false)
  })

  // The three below were added in execution. Each is a case the eleven above do
  // not reach, and in two of them the gate lets a change through unreviewed.

  it('flags a swap to a DIFFERENT blueprint at the same major version', () => {
    // §7's reason for gating `blueprint` is that under D13 the blueprint is the
    // build definition. Replacing it wholesale changes the Dockerfile, base image
    // and knowledge pack at least as much as a major bump does.
    const after = base({ blueprint: 'python-fastapi@2' })
    expect(isSensitiveDiff(base(), after).fields).toEqual(['blueprint'])
  })

  it('flags a declared resource being REMOVED, because the default may be higher', () => {
    // An absent field means "inherit the blueprint default" (§7), not zero. Going
    // from cpu: 0.5 to absent can therefore be an increase, and the gate cannot
    // tell which without the blueprint — so it escalates rather than guesses.
    const before = base({ resources: { cpu: 0.5 } })
    const after = base({ resources: {} })
    expect(isSensitiveDiff(before, after).fields).toEqual(['resources'])
  })

  it('does not escalate on services being REORDERED', () => {
    const order = (a: string, b: string) => ({
      services: [
        { type: 'mongo', version: '7', name: a },
        { type: 'qdrant', version: '1', name: b },
      ],
    })
    const before = base(order('db', 'vectors'))
    const after = base({
      services: [
        { type: 'qdrant', version: '1', name: 'vectors' },
        { type: 'mongo', version: '7', name: 'db' },
      ],
    })
    expect(isSensitiveDiff(before, after)).toEqual({ sensitive: false, fields: [] })
  })

  it('reports every changed field, not just the first', () => {
    const after = base({
      services: [{ type: 'mongo', version: '7', name: 'db' }],
      egress: { allow: ['api.ubc.ca'] },
      data: { classification: 'confidential' },
    })
    const result = isSensitiveDiff(base(), after)
    expect(result.sensitive).toBe(true)
    expect(result.fields.sort()).toEqual([
      'data.classification',
      'egress.allow',
      'services',
    ])
  })
})
