import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from './client.js'
import { resetDatabase, withRollback } from './testing.js'
import { projects, projectMembers, users } from './schema.js'

// Each database file starts from a known slate rather than trusting whatever ran
// before it to have cleaned up. `withRollback` isolates a test from its OWN writes
// only, so a committed row left by an API test — they cannot roll back — collided
// with the `chem-labs` these suites insert. Asserting the precondition beats
// depending on every other file remembering an afterAll.
beforeAll(resetDatabase)

describe('control plane schema (§6)', () => {
  it('stores a user, a project and its owner membership', async () => {
    await withRollback(async (db) => {
      const [user] = await db
        .insert(users)
        .values({
          ubcCwlPuid: 'puid-1',
          email: 'a@ubc.ca',
          displayName: 'A',
          role: 'member',
        })
        .returning()
      const [project] = await db
        .insert(projects)
        .values({ slug: 'chem-labs', ownerId: user!.id, blueprintRef: 'fixture-node@1' })
        .returning()
      await db
        .insert(projectMembers)
        .values({ projectId: project!.id, userId: user!.id, role: 'owner' })

      const found = await db.select().from(projects).where(eq(projects.slug, 'chem-labs'))
      expect(found).toHaveLength(1)
      expect(found[0]?.audience).toBeNull()
    })
  })

  it('refuses two projects with the same slug', async () => {
    await withRollback(async (db) => {
      const [user] = await db
        .insert(users)
        .values({
          ubcCwlPuid: 'puid-2',
          email: 'b@ubc.ca',
          displayName: 'B',
          role: 'member',
        })
        .returning()
      const values = {
        slug: 'duplicate',
        ownerId: user!.id,
        blueprintRef: 'fixture-node@1',
      }
      await db.insert(projects).values(values)
      await expect(db.insert(projects).values(values)).rejects.toThrow()
    })
  })

  it('refuses the same user twice on one project', async () => {
    await withRollback(async (db) => {
      const [user] = await db
        .insert(users)
        .values({
          ubcCwlPuid: 'puid-3',
          email: 'c@ubc.ca',
          displayName: 'C',
          role: 'member',
        })
        .returning()
      const [project] = await db
        .insert(projects)
        .values({ slug: 'once-only', ownerId: user!.id, blueprintRef: 'fixture-node@1' })
        .returning()
      const membership = {
        projectId: project!.id,
        userId: user!.id,
        role: 'owner' as const,
      }
      await db.insert(projectMembers).values(membership)
      await expect(db.insert(projectMembers).values(membership)).rejects.toThrow()
    })
  })
})

describe('withRollback', () => {
  // The helper every later db test depends on, and nothing asserted that it
  // actually rolls back. If it committed, these tests would pass once and fail on
  // the next run against the same database — the slowest possible way to find out.
  it('leaves nothing behind after the callback returns', async () => {
    const puid = `rollback-probe-${Date.now()}`
    await withRollback(async (tx) => {
      await tx
        .insert(users)
        .values({ ubcCwlPuid: puid, email: 'r@ubc.ca', displayName: 'R', role: 'member' })
      const inside = await tx.select().from(users).where(eq(users.ubcCwlPuid, puid))
      expect(inside).toHaveLength(1)
    })

    const outside = await db.select().from(users).where(eq(users.ubcCwlPuid, puid))
    expect(outside).toHaveLength(0)
  })

  it('propagates a real failure instead of swallowing it with the rollback', async () => {
    await expect(
      withRollback(async () => {
        throw new Error('the test itself failed')
      }),
    ).rejects.toThrow('the test itself failed')
  })
})

describe('project quota (§6)', () => {
  it('gives a new project the default quota, which policy validation reads', async () => {
    await withRollback(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          ubcCwlPuid: 'puid-quota',
          email: 'q@ubc.ca',
          displayName: 'Q',
          role: 'member',
        })
        .returning()
      const [project] = await tx
        .insert(projects)
        .values({
          slug: 'quota-default',
          ownerId: user!.id,
          blueprintRef: 'fixture-node@1',
        })
        .returning()
      expect(project?.quota).toEqual({
        max_cpu: 2,
        max_memory: '2Gi',
        max_services: 3,
        ai_monthly_usd: 50,
      })
    })
  })
})
