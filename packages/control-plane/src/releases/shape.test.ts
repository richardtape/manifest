import { describe, expect, it } from 'vitest'
import type { DeployInput } from './release.js'
import { shapeFor } from './shape.js'

describe('shapeFor — the shape of a deploy, and the only place it is decided (§24)', () => {
  it('runs production by its audience: exactly 1, 2, 3 and 3, at production’s own resources', () => {
    const counts = (['solo', 'class', 'large_course', 'public'] as const).map((scale) =>
      shapeFor('production', 'launch', { scale }),
    )
    expect(counts).toEqual([
      { instances: 1, resources: 'production' },
      { instances: 2, resources: 'production' },
      { instances: 3, resources: 'production' },
      { instances: 3, resources: 'production' },
    ])
  })

  it('gives a replacement production’s count — it redeploys the set the audience asked for', () => {
    expect(shapeFor('production', 'replacement', { scale: 'class' })).toEqual({
      instances: 2,
      resources: 'production',
    })
    expect(shapeFor('production', 'replacement', { scale: 'large_course' })).toEqual({
      instances: 3,
      resources: 'production',
    })
  })

  it('keeps D21’s rehearsal at ONE, whatever the audience — it measures a sign-in, not load', () => {
    for (const scale of ['solo', 'class', 'large_course', 'public'] as const)
      expect(shapeFor('production', 'rehearsal', { scale })).toEqual({
        instances: 1,
        resources: 'production',
      })
  })

  it('keeps sandbox and staging at one, at their own resources, whatever the audience or purpose', () => {
    for (const kind of ['sandbox', 'staging'] as const)
      for (const purpose of ['launch', 'rehearsal', 'replacement'] as const)
        for (const scale of ['solo', 'class', 'large_course', 'public'] as const)
          expect(shapeFor(kind, purpose, { scale })).toEqual({
            instances: 1,
            resources: kind,
          })
  })

  it('runs ONE in production when no audience is recorded', () => {
    expect(shapeFor('production', 'launch', null)).toEqual({
      instances: 1,
      resources: 'production',
    })
    expect(shapeFor('production', 'launch', undefined)).toEqual({
      instances: 1,
      resources: 'production',
    })
  })

  it('takes no count or resources from a caller: DeployInput has neither field', () => {
    // A TYPE TEST — `pnpm typecheck` is what runs it (Vitest strips types). A caller-supplied
    // count is an override path the shape exists to refuse, and a caller-supplied resource a
    // hole a refusal would then have to close (A1 Decision 2).
    const input: DeployInput = { releaseId: 'r', environmentId: 'e' }
    // @ts-expect-error — no `instances` on DeployInput
    const withCount: DeployInput = { ...input, instances: 3 }
    // @ts-expect-error — no `resources` on DeployInput
    const withResources: DeployInput = { ...input, resources: 'production' }
    expect([withCount, withResources]).toHaveLength(2)
  })
})
