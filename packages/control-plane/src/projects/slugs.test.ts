import { eq } from 'drizzle-orm'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { projects } from '../db/index.js'
import { withProject } from '../db/testing.js'
import { loadReservedLabels } from './reserved-labels.js'
import { checkSlug } from './slugs.js'

const reserved = await loadReservedLabels(
  fileURLToPath(new URL('../../../../infra/reserved-labels', import.meta.url)),
)

describe('one function answers the slug check and creation (§23, P5a Task 9)', () => {
  it('a name §7 refuses is SLUG_INVALID, alone', async () => {
    await withProject(async (tx) => {
      const verdict = await checkSlug(tx, reserved, 'Chem_Labs')
      expect(verdict).toMatchObject({
        available: false,
        reasons: [{ code: 'SLUG_INVALID' }],
      })
      expect(verdict.available === false && verdict.reasons).toHaveLength(1)
    })
  })

  it('a reserved label says what it stands for and why its group is reserved', async () => {
    await withProject(async (tx) => {
      const verdict = await checkSlug(tx, reserved, 'chem')
      expect(verdict.available).toBe(false)
      const [reason] = verdict.available === false ? verdict.reasons : []
      expect(reason!.code).toBe('SLUG_RESERVED')
      expect(reason!.message).toContain('Chemistry')
      expect(reason!.hint).toContain('reads as that unit')
    })
  })

  it('a name another project holds is SLUG_TAKEN — and says nothing about the holder', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      const [held] = await tx
        .select({ slug: projects.slug })
        .from(projects)
        .where(eq(projects.id, projectId))
      const verdict = await checkSlug(tx, reserved, held!.slug)
      expect(verdict).toMatchObject({
        available: false,
        reasons: [{ code: 'SLUG_TAKEN' }],
      })
      expect(JSON.stringify(verdict)).not.toContain(projectId)
      expect(JSON.stringify(verdict)).not.toContain(ownerId)
    })
  })

  it('a grandfathered holder of a newly reserved label is both', async () => {
    await withProject(async (tx, { ownerId }) => {
      await tx
        .insert(projects)
        .values({ slug: 'console', ownerId, blueprintRef: 'fixture-node@1' })
      const verdict = await checkSlug(tx, reserved, 'console')
      expect(verdict.available === false && verdict.reasons.map((r) => r.code)).toEqual([
        'SLUG_RESERVED',
        'SLUG_TAKEN',
      ])
    })
  })

  it('an available name is available, with no reasons at all', async () => {
    await withProject(async (tx) => {
      expect(await checkSlug(tx, reserved, 'journey-app')).toEqual({
        slug: 'journey-app',
        available: true,
      })
    })
  })
})
