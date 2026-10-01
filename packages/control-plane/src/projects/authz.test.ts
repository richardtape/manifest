import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { AuthorizationError, assertCapability, capabilitiesFor } from './authz.js'
import { createProject } from './repository.js'
import { resetDatabase, withRollback } from '../db/testing.js'
import { projectMembers, projects, users } from '../db/index.js'
import { loadConfig } from '../config.js'
import { sessionActor, testAudience, testReservedLabels } from './testing.js'

// Each database file starts from a known slate rather than trusting whatever ran
// before it to have cleaned up. `withRollback` isolates a test from its OWN writes
// only, so a committed row left by an API test — they cannot roll back — collided
// with the `chem-labs` these suites insert. Asserting the precondition beats
// depending on every other file remembering an afterAll.
beforeAll(resetDatabase)

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
  MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
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
      .values({
        ubcCwlPuid: 'owner',
        email: 'o@ubc.ca',
        displayName: 'O',
        role: 'member',
      })
      .returning()
    const [stranger] = await db
      .insert(users)
      .values({
        ubcCwlPuid: 'stranger',
        email: 's@ubc.ca',
        displayName: 'S',
        role: 'member',
      })
      .returning()
    const { project } = await createProject(db, config, await testReservedLabels(), {
      slug: 'chem-labs',
      ownerId: owner!.id,
      blueprintRef: 'fixture-node@1',
      starter: null,
      audience: testAudience(owner!.id),
    })
    return { owner: owner!, stranger: stranger!, project }
  }

  it('allows the owner', async () => {
    await withRollback(async (db) => {
      const { owner, project } = await seed(db)
      await expect(
        assertCapability(
          db,
          sessionActor({ userId: owner.id }),
          project.id,
          'project:write',
        ),
      ).resolves.toBeUndefined()
    })
  })

  it('hides the project from an unrelated user with NOT_FOUND, not FORBIDDEN', async () => {
    await withRollback(async (db) => {
      const { stranger, project } = await seed(db)
      try {
        await assertCapability(
          db,
          sessionActor({ userId: stranger.id }),
          project.id,
          'project:read',
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
          db,
          sessionActor({ userId: owner.id }),
          project.id,
          'release:approve',
        )
        throw new Error('expected the check to refuse')
      } catch (error) {
        expect((error as AuthorizationError).code).toBe('FORBIDDEN')
      }
    })
  })

  /**
   * `[M8]` (the launch path plan's Task 1, F13): an owner refused `launch:record` was told to ask a
   * project owner for the role — which no project role holds. A capability only a platform
   * administrator holds says so; one a project role can grant keeps the old hint (its positive
   * control, in the same test).
   */
  it('tells a member refused an ADMINISTRATOR’s capability that an administrator does it — not a project owner', async () => {
    await withRollback(async (db) => {
      const { owner, project } = await seed(db)
      const refusedFor = async (capability: Parameters<typeof assertCapability>[3]) => {
        try {
          await assertCapability(
            db,
            sessionActor({ userId: owner.id }),
            project.id,
            capability,
          )
        } catch (error) {
          return error as AuthorizationError
        }
        throw new Error(`expected '${capability}' to be refused`)
      }
      for (const capability of [
        'launch:record',
        'release:approve',
        'quota:set',
      ] as const) {
        const error = await refusedFor(capability)
        expect(error.code, capability).toBe('FORBIDDEN')
        expect(error.hint, capability).toMatch(/platform administrator/)
      }
      // A collaborator refused what an owner holds is still sent to an owner.
      const collaborator = await db
        .insert(users)
        .values({
          ubcCwlPuid: 'collab',
          email: 'c@ubc.ca',
          displayName: 'C',
          role: 'member',
        })
        .returning()
      await db.insert(projectMembers).values({
        projectId: project.id,
        userId: collaborator[0]!.id,
        role: 'collaborator',
      })
      try {
        await assertCapability(
          db,
          sessionActor({ userId: collaborator[0]!.id }),
          project.id,
          'members:manage',
        )
        throw new Error('expected the check to refuse')
      } catch (error) {
        expect((error as AuthorizationError).code).toBe('FORBIDDEN')
        expect((error as AuthorizationError).hint).toBeUndefined()
      }
    })
  })

  it('returns NOT_FOUND for a project that does not exist', async () => {
    await withRollback(async (db) => {
      const { owner } = await seed(db)
      await expect(
        assertCapability(
          db,
          sessionActor({ userId: owner.id }),
          '00000000-0000-0000-0000-000000000000',
          'project:read',
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  /**
   * §11's *Ending an app* (the front-end enablement plan's Task 11, Decision 27): an archived project
   * can be READ and ARCHIVED again (a retry finishing its teardown) — and later restored or deleted,
   * both `project:delete` — and nothing else, for its members and for an administrator alike.
   */
  it('refuses every capability but reading and archiving on an archived project, for members and administrators alike', async () => {
    await withRollback(async (db) => {
      const { owner, project } = await seed(db)
      await db
        .update(projects)
        .set({ state: 'archived' })
        .where(eq(projects.id, project.id))
      const [admin] = await db
        .insert(users)
        .values({
          ubcCwlPuid: 'admin',
          email: 'a@ubc.ca',
          displayName: 'A',
          role: 'admin',
        })
        .returning()
      for (const actor of [
        sessionActor({ userId: owner.id }),
        sessionActor({ userId: admin!.id, platformRole: 'admin' }),
      ]) {
        for (const capability of [
          'build:create',
          'source:write',
          'release:deploy',
          'project:write',
          'members:manage',
          'agent:session',
          'secret:write',
        ] as const) {
          await expect(
            assertCapability(db, actor, project.id, capability),
          ).rejects.toMatchObject({ name: 'ProjectStateError', code: 'PROJECT_ARCHIVED' })
        }
        // The positive control, in the same test: the two it may still do.
        await expect(
          assertCapability(db, actor, project.id, 'project:read'),
        ).resolves.toBeUndefined()
        await expect(
          assertCapability(db, actor, project.id, 'project:delete'),
        ).resolves.toBeUndefined()
      }
    })
  })

  it('answers an ACTIVE project as it always has — the state refusal is only the archived one', async () => {
    await withRollback(async (db) => {
      const { owner, project } = await seed(db)
      await expect(
        assertCapability(
          db,
          sessionActor({ userId: owner.id }),
          project.id,
          'build:create',
        ),
      ).resolves.toBeUndefined()
    })
  })

  it('keeps a stranger a stranger on an archived project — NOT_FOUND before any state is told', async () => {
    await withRollback(async (db) => {
      const { stranger, project } = await seed(db)
      await db
        .update(projects)
        .set({ state: 'archived' })
        .where(eq(projects.id, project.id))
      await expect(
        assertCapability(
          db,
          sessionActor({ userId: stranger.id }),
          project.id,
          'build:create',
        ),
      ).rejects.toMatchObject({ name: 'AuthorizationError', code: 'NOT_FOUND' })
    })
  })

  it('refuses a collaborator archiving before it tells them the state — FORBIDDEN, not PROJECT_ARCHIVED', async () => {
    await withRollback(async (db) => {
      const { project } = await seed(db)
      const [collaborator] = await db
        .insert(users)
        .values({
          ubcCwlPuid: 'collab',
          email: 'c@ubc.ca',
          displayName: 'C',
          role: 'member',
        })
        .returning()
      await db.insert(projectMembers).values({
        projectId: project.id,
        userId: collaborator!.id,
        role: 'collaborator',
      })
      await db
        .update(projects)
        .set({ state: 'archived' })
        .where(eq(projects.id, project.id))
      await expect(
        assertCapability(
          db,
          sessionActor({ userId: collaborator!.id }),
          project.id,
          'project:delete',
        ),
      ).rejects.toMatchObject({ name: 'AuthorizationError', code: 'FORBIDDEN' })
    })
  })
})
