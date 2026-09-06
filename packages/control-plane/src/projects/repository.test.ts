import { beforeAll, describe, expect, it } from 'vitest'
import { resetDatabase, withRollback } from '../db/testing.js'
import { users } from '../db/index.js'
import { loadConfig } from '../config.js'
import { createProject, getProject, listProjectsFor } from './repository.js'

// Each database file starts from a known slate rather than trusting whatever ran
// before it to have cleaned up. `withRollback` isolates a test from its OWN writes
// only, so a committed row left by an API test — they cannot roll back — collided
// with the `chem-labs` these suites insert. Asserting the precondition beats
// depending on every other file remembering an afterAll.
beforeAll(resetDatabase)

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
  MANIFEST_SESSION_SECRET: 'k'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

describe('project creation', () => {
  it('creates the project, the owner membership and all three environments', async () => {
    await withRollback(async (db) => {
      const [owner] = await db
        .insert(users)
        .values({ ubcCwlPuid: 'o', email: 'o@ubc.ca', displayName: 'O', role: 'member' })
        .returning()
      const { project, environments } = await createProject(db, config, {
        slug: 'chem-labs',
        ownerId: owner!.id,
        blueprintRef: 'fixture-node@1',
      })

      expect(project.slug).toBe('chem-labs')
      expect(environments.map((e) => e.kind).sort()).toEqual([
        'production',
        'sandbox',
        'staging',
      ])

      // §23: <slug>.<zone for that environment kind>. One label deep, every time.
      const byKind = Object.fromEntries(environments.map((e) => [e.kind, e.hostname]))
      expect(byKind.sandbox).toBe('chem-labs.sandbox.manifest.internal')
      expect(byKind.staging).toBe('chem-labs.staging.manifest.internal')
      expect(byKind.production).toBe('chem-labs.manifest.internal')

      const owned = await listProjectsFor(db, {
        userId: owner!.id,
        platformRole: 'member',
      })
      expect(owned.map((p) => p.slug)).toEqual(['chem-labs'])
    })
  })

  it('lists only the projects a member belongs to', async () => {
    await withRollback(async (db) => {
      const [owner] = await db
        .insert(users)
        .values({ ubcCwlPuid: 'o2', email: 'o@ubc.ca', displayName: 'O', role: 'member' })
        .returning()
      const [stranger] = await db
        .insert(users)
        .values({ ubcCwlPuid: 's2', email: 's@ubc.ca', displayName: 'S', role: 'member' })
        .returning()
      await createProject(db, config, {
        slug: 'chem-labs',
        ownerId: owner!.id,
        blueprintRef: 'fixture-node@1',
      })

      expect(
        await listProjectsFor(db, { userId: stranger!.id, platformRole: 'member' }),
      ).toEqual([])
      // A platform admin sees the whole fleet (§13).
      const asAdmin = await listProjectsFor(db, {
        userId: stranger!.id,
        platformRole: 'admin',
      })
      expect(asAdmin.map((p) => p.slug)).toEqual(['chem-labs'])
    })
  })

  it('rejects a slug §7 would not accept, before it can reach a hostname', async () => {
    await withRollback(async (db) => {
      const [owner] = await db
        .insert(users)
        .values({ ubcCwlPuid: 'o3', email: 'o@ubc.ca', displayName: 'O', role: 'member' })
        .returning()
      for (const slug of [
        'Chem-Labs',
        'ab',
        '-leading',
        'has_underscore',
        'a'.repeat(60),
      ]) {
        await expect(
          createProject(db, config, {
            slug,
            ownerId: owner!.id,
            blueprintRef: 'fixture-node@1',
          }),
        ).rejects.toThrow(/slug/i)
      }
    })
  })

  it('returns undefined for a project that does not exist', async () => {
    await withRollback(async (db) => {
      expect(await getProject(db, '00000000-0000-0000-0000-000000000000')).toBeUndefined()
    })
  })
})
