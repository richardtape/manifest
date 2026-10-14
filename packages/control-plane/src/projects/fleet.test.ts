import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  appSpecs,
  builds,
  environments,
  instances,
  projects,
  releases,
  routes,
  type Db,
} from '../db/index.js'
import { withProject } from '../db/testing.js'
import { listFleet } from './fleet.js'
import { loadReservedLabels } from './reserved-labels.js'
import type { ReservedLabels } from './reserved-labels.js'

let reserved: ReservedLabels | undefined
const labels = async (): Promise<ReservedLabels> =>
  (reserved ??= await loadReservedLabels(
    new URL('../../../../infra/reserved-labels', import.meta.url).pathname,
  ))

/** A staging environment serving a healthy instance of a release with this digest. */
async function serveStaging(
  tx: Db,
  projectId: string,
  ownerId: string,
  imageDigest: string,
): Promise<void> {
  const [env] = await tx
    .insert(environments)
    .values({
      projectId,
      kind: 'staging',
      hostname: `${projectId.slice(0, 8)}.staging.manifest.internal`,
    })
    .returning()
  const [spec] = await tx
    .insert(appSpecs)
    .values({
      projectId,
      commitSha: 'a'.repeat(40),
      parsed: {},
      schemaVersion: 1,
      valid: true,
    })
    .returning()
  const [build] = await tx
    .insert(builds)
    .values({
      projectId,
      commitSha: 'a'.repeat(40),
      appSpecId: spec!.id,
      status: 'succeeded',
      imageDigest,
    })
    .returning()
  const [release] = await tx
    .insert(releases)
    .values({
      projectId,
      buildId: build!.id,
      appSpecId: spec!.id,
      createdBy: ownerId,
      resolvedConfig: {},
    })
    .returning()
  const [instance] = await tx
    .insert(instances)
    .values({
      environmentId: env!.id,
      releaseId: release!.id,
      driver: 'fake',
      state: 'healthy',
      lastSeenAt: new Date('2026-09-16T00:00:00.000Z'),
    })
    .returning()
  await tx
    .insert(routes)
    .values({ instanceId: instance!.id, hostname: env!.hostname, listener: 'internal' })
}

/**
 * Production serving a SET of `members` healthy instances of one release (A1 Task 5) — the first made a
 * second before the next, so the set's order, `(created_at, id)`, is the order made.
 */
async function serveProduction(
  tx: Db,
  projectId: string,
  ownerId: string,
  members: number,
): Promise<(typeof instances.$inferSelect)[]> {
  const [env] = await tx
    .insert(environments)
    .values({
      projectId,
      kind: 'production',
      hostname: `${projectId.slice(0, 8)}.manifest.internal`,
    })
    .returning()
  const [spec] = await tx
    .insert(appSpecs)
    .values({
      projectId,
      commitSha: 'b'.repeat(40),
      parsed: {},
      schemaVersion: 1,
      valid: true,
    })
    .returning()
  const [build] = await tx
    .insert(builds)
    .values({
      projectId,
      commitSha: 'b'.repeat(40),
      appSpecId: spec!.id,
      status: 'succeeded',
      imageDigest: `sha256:${'d'.repeat(64)}`,
    })
    .returning()
  const [release] = await tx
    .insert(releases)
    .values({
      projectId,
      buildId: build!.id,
      appSpecId: spec!.id,
      createdBy: ownerId,
      resolvedConfig: {},
    })
    .returning()
  const set = await tx
    .insert(instances)
    .values(
      Array.from({ length: members }, (_, i) => ({
        environmentId: env!.id,
        releaseId: release!.id,
        driver: 'fake',
        state: 'healthy' as const,
        lastSeenAt: new Date('2026-10-13T00:00:00.000Z'),
        createdAt: new Date(Date.UTC(2026, 9, 13, 0, 0, i)),
      })),
    )
    .returning()
  await tx.insert(routes).values(
    set.map((m) => ({
      instanceId: m.id,
      hostname: env!.hostname,
      listener: 'public' as const,
    })),
  )
  return set
}

describe('§26’s fleet (P5a Task 16)', () => {
  it('lists every project with its owner, and a project no one has deployed', async () => {
    await withProject(async (tx, { projectId }) => {
      const fleet = await listFleet(tx, await labels())
      const entry = fleet.find((e) => e.project.id === projectId)!
      expect(entry).toBeDefined()
      expect(entry.owner.displayName).toBe('Test Owner')
      expect(entry.owner.email).toContain('@example.ubc.ca')
      expect(entry.environments).toEqual([])
      expect(entry.audience).toBeNull()
    })
  })

  it('reports the serving instance’s state and its release’s digest', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      const digest = `sha256:${'c'.repeat(64)}`
      await serveStaging(tx, projectId, ownerId, digest)
      const entry = (await listFleet(tx, await labels())).find(
        (e) => e.project.id === projectId,
      )!
      const staging = entry.environments.find((e) => e.kind === 'staging')!
      expect(staging.state).toBe('healthy')
      expect(staging.imageDigest).toBe(digest)
      expect(staging.lastDeployAt).toBe('2026-09-16T00:00:00.000Z')
      expect(staging.latestIncidentAt).toBeNull()
    })
  })

  /**
   * HOW MANY SERVE, AND WHAT SERVES AS ONE STATE (A1 Task 7). A `class` app's production is a set of two;
   * and since the set watcher (Task 6) a member that stopped stays in the set, `failed`, until its
   * replacement serves — while the rest serve on. Read off the set's FIRST, the fleet told an administrator
   * the app was failed while it served (P4c Decision 20's mistake again).
   */
  it('counts production’s set, and calls it healthy while any member is — a stopped one in it awaiting its replacement', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      const [first] = await serveProduction(tx, projectId, ownerId, 2)
      const read = async () =>
        (await listFleet(tx, await labels()))
          .find((e) => e.project.id === projectId)!
          .environments.find((e) => e.kind === 'production')!
      expect(await read()).toMatchObject({ instances: 2, state: 'healthy' })
      // The FIRST member stops, as the watcher records an exit: `failed`, still in the set.
      await tx
        .update(instances)
        .set({ state: 'failed' })
        .where(eq(instances.id, first!.id))
      expect(await read()).toMatchObject({
        instances: 2,
        state: 'healthy',
        imageDigest: `sha256:${'d'.repeat(64)}`,
      })
      // And with every member stopped, it says so.
      await tx.update(instances).set({ state: 'failed' })
      expect(await read()).toMatchObject({ instances: 2, state: 'failed' })
    })
  })

  /**
   * §23: reserving a label does not rename a project that already holds it. An
   * administrator is TOLD, and handles it with the owner.
   */
  it('reports a project holding a label reserved after it was created', async () => {
    await withProject(async (tx, { projectId }) => {
      const before = (await listFleet(tx, await labels())).find(
        (e) => e.project.id === projectId,
      )!
      expect(before.slugReserved).toBe(false)
      await tx.update(projects).set({ slug: 'console' }).where(eq(projects.id, projectId))
      const after = (await listFleet(tx, await labels())).find(
        (e) => e.project.id === projectId,
      )!
      expect(after.slugReserved).toBe(true)
    })
  })
})
