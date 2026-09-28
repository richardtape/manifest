import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, projects, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { holdActiveProject } from './state.js'

/**
 * `holdActiveProject` (the front-end enablement plan's Task 11, carrying sitting 7's I1): a start
 * that mints something holds its project's row `FOR SHARE`, so an archive's state change WAITS for
 * the start to commit — its teardown then ends or revokes what was made — or, having committed
 * first, is seen and refuses the start. COMMITTED rows and the real pool: a lock is what this tests,
 * and `withRollback`'s one transaction cannot contend with itself.
 */
describe('holdActiveProject (§11, Task 11)', () => {
  let projectId = ''
  beforeAll(async () => {
    await resetDatabase()
    const unique = randomUUID().slice(0, 8)
    const [owner] = await db
      .insert(users)
      .values({
        ubcCwlPuid: `puid-${unique}`,
        email: `o-${unique}@example.ubc.ca`,
        displayName: 'O',
      })
      .returning()
    const [project] = await db
      .insert(projects)
      .values({
        slug: `hold-${unique}`,
        name: 'hold',
        ownerId: owner!.id,
        blueprintRef: 'fixture-node@1',
      })
      .returning()
    projectId = project!.id
  })
  afterAll(resetDatabase)

  it('makes an archive’s state change wait for the holder’s commit', async () => {
    const order: string[] = []
    let held = false
    let release = (): void => {}
    const mayCommit = new Promise<void>((resolve) => {
      release = resolve
    })
    const holder = db.transaction(async (tx) => {
      await holdActiveProject(tx, projectId)
      held = true
      await mayCommit
      order.push('holder commits')
    })
    while (!held) await new Promise((resolve) => setTimeout(resolve, 5))
    const archiving = db
      .update(projects)
      .set({ state: 'archived' })
      .where(eq(projects.id, projectId))
      .then(() => order.push('archived'))
    // Long enough that an update which did not wait would have landed.
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(order).toEqual([])
    release()
    await Promise.all([holder, archiving])
    expect(order).toEqual(['holder commits', 'archived'])
  })

  it('refuses a project that is archived, by its own code — and passes an active one', async () => {
    await db.update(projects).set({ state: 'active' }).where(eq(projects.id, projectId))
    await expect(
      db.transaction((tx) => holdActiveProject(tx, projectId)),
    ).resolves.toBeUndefined()
    await db.update(projects).set({ state: 'archived' }).where(eq(projects.id, projectId))
    await expect(
      db.transaction((tx) => holdActiveProject(tx, projectId)),
    ).rejects.toMatchObject({ name: 'ProjectStateError', code: 'PROJECT_ARCHIVED' })
  })

  /**
   * THE DELETE'S RACE (Task 12, Decision 31): a start that authorized before a delete FINISHED and
   * holds the row after it. It must be told what everybody is told of a deleted project — the
   * stranger's `NOT_FOUND` — never "archived, restore it", which a tombstone cannot be.
   */
  it('refuses a DELETED project as a stranger’s, never as one to restore', async () => {
    await db.update(projects).set({ state: 'deleted' }).where(eq(projects.id, projectId))
    await expect(
      db.transaction((tx) => holdActiveProject(tx, projectId)),
    ).rejects.toMatchObject({ name: 'AuthorizationError', code: 'NOT_FOUND' })
    await db.update(projects).set({ state: 'active' }).where(eq(projects.id, projectId))
  })
})
