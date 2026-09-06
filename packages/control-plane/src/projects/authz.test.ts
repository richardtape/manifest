import { describe, expect, it } from 'vitest'
import { AuthorizationError, assertCapability, capabilitiesFor } from './authz.js'
import { createProject } from './repository.js'
import { withRollback } from '../db/testing.js'
import { users } from '../db/index.js'
import { loadConfig } from '../config.js'

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
  MANIFEST_SESSION_SECRET: 'k'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

describe('the capability model (§13 roles)', () => {
  it('gives an owner everything except approval and quota', () => {
    const caps = capabilitiesFor('owner', 'member')
    expect(caps.has('project:write')).toBe(true)
    expect(caps.has('project:delete')).toBe(true)
    expect(caps.has('members:manage')).toBe(true)
    expect(caps.has('release:deploy')).toBe(true)
    expect(caps.has('release:approve')).toBe(false)
    expect(caps.has('quota:set')).toBe(false)
  })

  it('gives a collaborator everything an owner has except membership and deletion', () => {
    const owner = capabilitiesFor('owner', 'member')
    const collaborator = capabilitiesFor('collaborator', 'member')
    for (const cap of collaborator) expect(owner.has(cap)).toBe(true)
    expect(collaborator.has('members:manage')).toBe(false)
    expect(collaborator.has('project:delete')).toBe(false)
    expect(collaborator.has('build:create')).toBe(true)
  })

  it('gives an unrelated user nothing', () => {
    expect(capabilitiesFor(null, 'member').size).toBe(0)
  })

  it('gives a platform admin the fleet-wide capabilities without membership', () => {
    const admin = capabilitiesFor(null, 'admin')
    expect(admin.has('project:read')).toBe(true)
    expect(admin.has('release:approve')).toBe(true)
    expect(admin.has('quota:set')).toBe(true)
  })
})

describe('assertCapability', () => {
  async function seed(db: Parameters<typeof createProject>[0]) {
    const [owner] = await db
      .insert(users)
      .values({ ubcCwlPuid: 'owner', email: 'o@ubc.ca', displayName: 'O', role: 'member' })
      .returning()
    const [stranger] = await db
      .insert(users)
      .values({ ubcCwlPuid: 'stranger', email: 's@ubc.ca', displayName: 'S', role: 'member' })
      .returning()
    const { project } = await createProject(db, config, {
      slug: 'chem-labs',
      ownerId: owner!.id,
      blueprintRef: 'fixture-node@1',
    })
    return { owner: owner!, stranger: stranger!, project }
  }

  it('allows the owner', async () => {
    await withRollback(async (db) => {
      const { owner, project } = await seed(db)
      await expect(
        assertCapability(db, { userId: owner.id, platformRole: 'member' }, project.id, 'project:write'),
      ).resolves.toBeUndefined()
    })
  })

  it('hides the project from an unrelated user with NOT_FOUND, not FORBIDDEN', async () => {
    await withRollback(async (db) => {
      const { stranger, project } = await seed(db)
      try {
        await assertCapability(
          db, { userId: stranger.id, platformRole: 'member' }, project.id, 'project:read',
        )
        throw new Error('expected the check to refuse')
      } catch (error) {
        expect(error).toBeInstanceOf(AuthorizationError)
        expect((error as AuthorizationError).code).toBe('NOT_FOUND')
      }
    })
  })

  it('refuses a member who lacks the capability with FORBIDDEN', async () => {
    await withRollback(async (db) => {
      const { owner, project } = await seed(db)
      try {
        await assertCapability(
          db, { userId: owner.id, platformRole: 'member' }, project.id, 'release:approve',
        )
        throw new Error('expected the check to refuse')
      } catch (error) {
        expect((error as AuthorizationError).code).toBe('FORBIDDEN')
      }
    })
  })

  it('returns NOT_FOUND for a project that does not exist', async () => {
    await withRollback(async (db) => {
      const { owner } = await seed(db)
      await expect(
        assertCapability(
          db,
          { userId: owner.id, platformRole: 'member' },
          '00000000-0000-0000-0000-000000000000',
          'project:read',
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })
})
