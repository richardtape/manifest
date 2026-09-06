import { describe, expect, it } from 'vitest'
import { manifestSchema } from './schema.js'

const minimal = {
  manifest: 1,
  name: 'chem-lab-scheduler',
  blueprint: 'node-ts-mongo@2',
  runtime: { port: 3000 },
}

describe('manifest.yaml schema (§7)', () => {
  it('accepts a minimal valid spec and applies defaults', () => {
    const result = manifestSchema.safeParse(minimal)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.runtime.health).toBe('/healthz')
    expect(result.data.auth.provider).toBe('none')
    expect(result.data.services).toEqual([])
    expect(result.data.data.classification).toBe('internal')
  })

  it('rejects a name that breaks the slug regex', () => {
    for (const name of ['Ab', 'a', '1abc', 'has_underscore', 'a'.repeat(40)]) {
      expect(manifestSchema.safeParse({ ...minimal, name }).success).toBe(false)
    }
  })

  it('rejects unknown top-level keys', () => {
    const r = manifestSchema.safeParse({ ...minimal, cunning: true })
    expect(r.success).toBe(false)
  })

  it('rejects a runtime.build block of any kind (D13)', () => {
    const r = manifestSchema.safeParse({
      ...minimal,
      runtime: { port: 3000, build: { dockerfile: './Dockerfile' } },
    })
    expect(r.success).toBe(false)
  })

  it('rejects auth.callback that is a URL rather than a path (D15)', () => {
    const withAuth = (callback: string) => ({
      ...minimal,
      auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid'], callback },
    })
    expect(manifestSchema.safeParse(withAuth('/auth/cb')).success).toBe(true)
    expect(manifestSchema.safeParse(withAuth('https://evil.example/cb')).success).toBe(
      false,
    )
    expect(manifestSchema.safeParse(withAuth('auth/cb')).success).toBe(false)
    expect(manifestSchema.safeParse(withAuth('/a?b=c')).success).toBe(false)
  })

  it('rejects non-empty reserved blocks (§15)', () => {
    for (const key of ['integrations', 'jobs', 'checks']) {
      const r = manifestSchema.safeParse({ ...minimal, [key]: [{ any: 'thing' }] })
      expect(r.success, `${key} must be empty`).toBe(false)
    }
  })
})
