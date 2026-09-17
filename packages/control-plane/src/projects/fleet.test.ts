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
