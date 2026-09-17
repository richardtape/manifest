import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import {
  appSpecs,
  builds,
  instances,
  releases,
  routes,
  users,
  type Db,
} from '../db/index.js'
import { resetDatabase, withRollback } from '../db/testing.js'
import { createProject } from '../projects/index.js'
import { createFakeDriver, type FakeDriver } from '../runtime/index.js'
import { recoverAtBoot } from './recover.js'
import { testAudience, testReservedLabels } from '../projects/testing.js'

beforeAll(resetDatabase)

const config = loadConfig({
  MANIFEST_DATABASE_URL: process.env.MANIFEST_DATABASE_URL ?? '',
  MANIFEST_IDP_DATABASE_URL: process.env.MANIFEST_IDP_DATABASE_URL ?? '',
  MANIFEST_SESSION_SECRET: 'x'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

interface Fixture {
  driver: FakeDriver
  environmentId: string
  hostname: string
  /** The row and the driver handle of the instance the Route record names. */
  serving: { id: string; handle: string }
  releaseId: string
  /** An environment of the same project with nothing deployed to it at all. */
  emptyEnvironmentId: string
}

/**
 * One app, deployed, with §6's Route record written — and then an edge that has
 * forgotten every runtime route, which is what `docker restart manifest-caddy` does
 * (ORIENTATION §4) and what §12 says the control plane's boot repairs.
 */
async function deployed(
  db: Db,
  options: { dropRoutes?: boolean; driver?: FakeDriver } = {},
): Promise<Fixture> {
  const unique = randomUUID().slice(0, 8)
  const [owner] = await db
    .insert(users)
    .values({
      ubcCwlPuid: `puid-${unique}`,
      email: `owner-${unique}@example.ubc.ca`,
      displayName: 'Test Owner',
    })
    .returning()
  const { project, environments: created } = await createProject(
    db,
    config,
    await testReservedLabels(),
    {
      slug: `chem-labs-${unique}`,
      ownerId: owner!.id,
      blueprintRef: 'fixture-node@1',
      starter: null,
      audience: testAudience(owner!.id),
    },
  )
  const staging = created.find((environment) => environment.kind === 'staging')!
  const sandbox = created.find((environment) => environment.kind === 'sandbox')!
  const [spec] = await db
    .insert(appSpecs)
    .values({
      projectId: project.id,
      commitSha: 'abc123',
      parsed: {},
      schemaVersion: 1,
      valid: true,
    })
    .returning()
  const [build] = await db
    .insert(builds)
    .values({
      projectId: project.id,
      commitSha: 'abc123',
      appSpecId: spec!.id,
      status: 'succeeded',
    })
    .returning()
  const [release] = await db
    .insert(releases)
    .values({
      projectId: project.id,
      buildId: build!.id,
      appSpecId: spec!.id,
      resolvedConfig: {},
      createdBy: owner!.id,
    })
    .returning()

  /**
   * ONE DRIVER ACROSS FIXTURES WHEN THE CALLER PASSES ONE. Each `createFakeDriver()`
   * counts its own instances from `inst-1`, so two fixtures with their own drivers
   * hand out the SAME handle — which made the "carries on with the rest" test below
   * refuse both routes and read as a defect in `recoverAtBoot` (measured 2026-09-15).
   */
  const driver = options.driver ?? createFakeDriver()
  const handle = await driver.ensureInstance({
    instanceId: randomUUID(),
    name: `chem-labs-${unique}-serving`,
    hostname: staging.hostname,
    image: { repository: 'local/chem-labs', digest: `sha256:${'0'.repeat(64)}` },
    env: {},
    port: 8080,
    healthPath: '/healthz',
    resources: { cpu: 1, memoryMi: 256, pids: 128, diskMi: 512 },
    projectSlug: `chem-labs-${unique}`,
    environmentKind: 'staging',
    releaseId: release!.id,
    services: [],
    egressAllow: [],
    needsAiGateway: false,
  })
  const [row] = await db
    .insert(instances)
    .values({
      environmentId: staging.id,
      releaseId: release!.id,
      driver: 'fake',
      state: 'healthy',
      handle: handle.id,
      lastSeenAt: new Date(),
    })
    .returning()
  await db.insert(routes).values({
    instanceId: row!.id,
    hostname: staging.hostname,
    listener: 'internal',
  })
  if (options.dropRoutes !== false) driver.dropRoutes()

  return {
    driver,
    environmentId: staging.id,
    hostname: staging.hostname,
    serving: { id: row!.id, handle: handle.id },
    releaseId: release!.id,
    emptyEnvironmentId: sandbox.id,
  }
}

const recorder = () => {
  const scheduled: string[] = []
  return { scheduled, retirer: { schedule: (id: string) => void scheduled.push(id) } }
}

describe('recoverAtBoot (P4c Task 9)', () => {
  it('re-applies the edge route for every Route record', async () => {
    // §12: "the control plane re-applies all routes at boot." Nothing did —
    // `reapplyAllRoutes` was exported and had no production caller — so an edge
    // restart left every app on the wildcard until somebody redeployed it.
    await withRollback(async (db) => {
      const { driver, hostname, serving, environmentId } = await deployed(db)
      expect(await driver.servingInstance(hostname)).toBeUndefined()

      const report = await recoverAtBoot({ db, driver, ...recorder() })

      expect(await driver.servingInstance(hostname)).toBe(serving.handle)
      expect(report.routesRestored).toBe(1)
      expect(report.routesFailed).toEqual([])
      expect(report.scheduled).toEqual([environmentId])
    })
  })

  it('reports a route whose instance is gone, and carries on with the rest', async () => {
    // A boot that threw here would take the whole platform down for one missing
    // container — and the commonest reason for one is a machine that was tidied up.
    await withRollback(async (db) => {
      const driver = createFakeDriver()
      const broken = await deployed(db, { driver })
      const healthy = await deployed(db, { driver })
      // REALLY GONE, not a stub that refuses: the container was removed by hand, or
      // by a machine somebody tidied up, and the Route record outlived it.
      await driver.destroyInstance(broken.serving.handle)
      driver.dropRoutes()

      const report = await recoverAtBoot({ db, driver, ...recorder() })

      expect(report.routesRestored).toBe(1)
      expect(report.routesFailed).toEqual([
        { hostname: broken.hostname, reason: 'INSTANCE_NOT_FOUND' },
      ])
      // The one that could be restored WAS, which is the "carries on" half.
      expect(await driver.servingInstance(healthy.hostname)).toBe(healthy.serving.handle)
      // And the broken hostname reaches nothing, rather than a stale upstream.
      expect(await driver.servingInstance(broken.hostname)).toBeUndefined()
    })
  })

  it('ends a deploy the restart interrupted — provisioning and starting become failed', async () => {
    // A row in `provisioning` is a row nothing moves: the process that would have
    // moved it is the one that stopped. Until this, such a row stayed there for ever.
    await withRollback(async (db) => {
      const { driver, environmentId, releaseId } = await deployed(db)
      const stuck = async (state: 'provisioning' | 'starting' | 'waking') =>
        (
          await db
            .insert(instances)
            .values({ environmentId, releaseId, driver: 'fake', state })
            .returning()
        )[0]!.id
      const provisioning = await stuck('provisioning')
      const starting = await stuck('starting')
      const waking = await stuck('waking')

      const report = await recoverAtBoot({ db, driver, ...recorder() })

      expect(report.interrupted).toBe(3)
      const state = async (id: string) =>
        (await db.select().from(instances).where(eq(instances.id, id)))[0]!.state
      expect(await state(provisioning)).toBe('failed')
      expect(await state(starting)).toBe('failed')
      expect(await state(waking)).toBe('failed')
    })
  })

  it('leaves a healthy row alone — `interrupted` is not a state the machine accepts for it', async () => {
    await withRollback(async (db) => {
      const { driver, serving } = await deployed(db)
      const report = await recoverAtBoot({ db, driver, ...recorder() })
      expect(report.interrupted).toBe(0)
      expect(
        (await db.select().from(instances).where(eq(instances.id, serving.id)))[0]!.state,
      ).toBe('healthy')
    })
  })

  it('schedules a retire for every environment with something left to remove', async () => {
    await withRollback(async (db) => {
      const driver = createFakeDriver()
      const first = await deployed(db, { driver })
      const second = await deployed(db, { driver })
      const { scheduled, retirer } = recorder()

      const report = await recoverAtBoot({ db, driver, retirer })

      expect(scheduled.sort()).toEqual([first.environmentId, second.environmentId].sort())
      expect(report.scheduled.sort()).toEqual(scheduled.sort())
      // NOT the environment nothing was ever deployed to: a pass over it would read
      // the driver for nothing, and the report would say a retire is pending when
      // there is not one.
      expect(scheduled).not.toContain(first.emptyEnvironmentId)
    })
  })

  it('schedules nothing for an environment whose instances are all gone', async () => {
    await withRollback(async (db) => {
      const { driver, serving, environmentId } = await deployed(db)
      await db
        .update(instances)
        .set({ state: 'gone' })
        .where(eq(instances.id, serving.id))
      const { scheduled } = recorder()
      const report = await recoverAtBoot({
        db,
        driver,
        retirer: { schedule: (id: string) => void scheduled.push(id) },
      })
      expect(scheduled).toEqual([])
      expect(report.scheduled).toEqual([])
      expect(environmentId).toBeTruthy()
    })
  })

  it('RESTORES THE ROUTES BEFORE IT SCHEDULES, or every pass is a silent no-op', async () => {
    /**
     * DECISION 20'S ORDER, and not for the reason it gives (sitting 5's correction 1).
     *
     * `retireEnvironment` does NOTHING AT ALL when `servingInstance` answers
     * `undefined` — which is the state of every environment before the routes are
     * back. So scheduling first does not merely reorder the work: every pass returns
     * `skipped: 'nothing-serves'`, the containers are never reaped, and nothing
     * anywhere reports a failure. The wrong order is green everywhere else, so the
     * ORDER is what this asserts: at the moment a retire is scheduled, the hostname
     * already reaches its instance.
     */
    await withRollback(async (db) => {
      const { driver, hostname, serving } = await deployed(db)
      const servingWhenScheduled: (string | undefined)[] = []
      await recoverAtBoot({
        db,
        driver,
        retirer: {
          schedule: () => {
            // Synchronous, like the real `schedule`: read what the edge holds now.
            void driver
              .servingInstance(hostname)
              .then((id) => servingWhenScheduled.push(id))
          },
        },
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(servingWhenScheduled).toEqual([serving.handle])
    })
  })
})
