import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import {
  appSpecs,
  builds,
  events,
  instances,
  releases,
  routes,
  users,
  withEnvironmentLock,
  type Db,
} from '../db/index.js'
import { resetDatabase, withRollback } from '../db/testing.js'
import { createProject } from '../projects/index.js'
import { createEventBus, type StreamFrame } from '../observability/index.js'
import { createFakeDriver, type Driver, type FakeDriver } from '../runtime/index.js'
import type { AiKeyService } from '../ai/index.js'
import type { AppSecretResolver } from '../secrets/index.js'
import { createRetirer, retireEnvironment, type RetirerDeps } from './retire.js'
import { testReservedLabels } from '../projects/testing.js'

beforeAll(resetDatabase)

const config = loadConfig({
  MANIFEST_DATABASE_URL: process.env.MANIFEST_DATABASE_URL ?? '',
  MANIFEST_IDP_DATABASE_URL: process.env.MANIFEST_IDP_DATABASE_URL ?? '',
  MANIFEST_SESSION_SECRET: 'x'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** No secret is stored by these fixtures, so the redactor is built over nothing. */
const appSecrets: AppSecretResolver = {
  sessionSecret: () => Promise.resolve('not-used-here'),
  secretValues: () => Promise.resolve([]),
}

/**
 * The key service, recording into the caller's list so the ORDER can be asserted —
 * §10's revoke has to happen after the drain, not before it.
 */
function recordingAi(events: string[], enabled = true): AiKeyService {
  const refuse = (): never => {
    throw new Error('no test here mints, commits or discards a key')
  }
  return {
    enabled,
    mintAppKey: refuse,
    discardAppKey: refuse,
    storeInstanceKey: refuse,
    revokeInstanceKey: async (_db, input) => {
      events.push(`revoke key of instance ${input.instanceId}`)
      return true
    },
    revokeLegacyAppKey: async () => {
      events.push('revoke the environment’s pre-P4c key')
      return true
    },
  }
}

interface Fixture {
  driver: FakeDriver
  environment: { id: string; hostname: string; kind: 'staging'; projectId: string }
  rows: {
    old: { id: string; handle: string }
    serving: { id: string; handle: string }
  }
  /** The driver id of the instance with no row at all — a crashed control plane's. */
  orphan: string
  projectId: string
}

/**
 * Three instances on one hostname: one that used to serve, one that serves, and one
 * the database has no row for. The last is not hypothetical — `pnpm test` truncates
 * the §6 tables and leaves containers behind (ORIENTATION §4), and so does a control
 * plane killed mid-deploy.
 */
async function threeInstances(
  db: Db,
  options: { servingHasRoute?: boolean; driver?: FakeDriver } = {},
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
    },
  )
  const staging = created.find((environment) => environment.kind === 'staging')!
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

  const driver = options.driver ?? createFakeDriver()
  const start = async (name: string): Promise<string> => {
    const handle = await driver.ensureInstance({
      instanceId: randomUUID(),
      name,
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
    return handle.id
  }
  // In this order, so the route ends on `serving` — the fake's edge is the last
  // ensureInstance to resolve, exactly as the real one is.
  const oldHandle = await start(`chem-labs-${unique}-old`)
  const orphan = await start(`chem-labs-${unique}-orphan`)
  const servingHandle = await start(`chem-labs-${unique}-serving`)

  const row = async (handle: string) => {
    const [inserted] = await db
      .insert(instances)
      .values({
        environmentId: staging.id,
        releaseId: release!.id,
        driver: 'fake',
        state: 'healthy',
        handle,
        lastSeenAt: new Date(),
      })
      .returning()
    return { id: inserted!.id, handle }
  }
  const old = await row(oldHandle)
  const serving = await row(servingHandle)

  // A Route record is what says the serving instance was deployed BY P4c. Without
  // one it is a pre-P4c container, and the environment's old key is still its.
  if (options.servingHasRoute !== false) {
    await db.insert(routes).values({
      instanceId: serving.id,
      hostname: staging.hostname,
      listener: 'internal',
    })
  }

  return {
    driver,
    environment: {
      id: staging.id,
      hostname: staging.hostname,
      kind: 'staging',
      projectId: project.id,
    },
    rows: { old, serving },
    orphan,
    projectId: project.id,
  }
}

function depsFor(
  db: Db,
  driver: Driver,
  ai: AiKeyService,
  bus = createEventBus(),
): RetirerDeps {
  return { db, driver, ai, appSecrets, bus, drainMs: 200 }
}

describe('retireEnvironment (P4c Task 7)', () => {
  it('retires every instance of the environment that does not serve, and leaves the one that does', async () => {
    await withRollback(async (db) => {
      const { driver, environment, rows, orphan } = await threeInstances(db)
      const outcome = await retireEnvironment(
        depsFor(db, driver, recordingAi([])),
        environment.id,
      )

      expect(outcome.retired.sort()).toEqual([rows.old.handle, orphan].sort())
      expect(outcome.failed).toEqual([])
      // R7: the one serving is untouched, and it is still what the hostname reaches.
      expect(await driver.servingInstance(environment.hostname)).toBe(rows.serving.handle)
      expect(await driver.listInstances(environment.hostname)).toEqual([
        rows.serving.handle,
      ])
      const state = async (id: string) =>
        (await db.select().from(instances).where(eq(instances.id, id)))[0]!.state
      expect(await state(rows.old.id)).toBe('gone')
      expect(await state(rows.serving.id)).toBe('healthy')
    })
  })

  /**
   * THE MOST DANGEROUS LINE IN THIS PLAN, as a test.
   *
   * R7 says every instance that is not serving is retired. After an edge restart
   * NOTHING serves — `routes.docker.test.ts` restarts the edge, and ORIENTATION §4
   * records that a restart drops every runtime route — so "everything that is not
   * serving" is EVERY instance, including the one people are using. A retire that
   * finds no serving instance does nothing at all, and says why.
   */
  it('does nothing at all when the hostname reaches no instance', async () => {
    await withRollback(async (db) => {
      const { driver, environment, rows } = await threeInstances(db)
      driver.dropRoutes()

      const outcome = await retireEnvironment(
        depsFor(db, driver, recordingAi([])),
        environment.id,
      )

      expect(outcome).toEqual({ retired: [], failed: [], skipped: 'nothing-serves' })
      expect((await driver.listInstances(environment.hostname)).length).toBe(3)
      expect(
        (await db.select().from(instances).where(eq(instances.id, rows.old.id)))[0]!
          .state,
      ).toBe('healthy')
    })
  })

  it('answers no-environment for an environment that is not there, and touches nothing', async () => {
    await withRollback(async (db) => {
      const { driver } = await threeInstances(db)
      expect(
        await retireEnvironment(depsFor(db, driver, recordingAi([])), randomUUID()),
      ).toEqual({ retired: [], failed: [], skipped: 'no-environment' })
    })
  })

  it('revokes each retired instance’s key AFTER its retire, never before', async () => {
    // THE ORDER IS THE REQUIREMENT. LiteLLM checks a key when a request STARTS
    // (measured 2026-09-14), so a key revoked while the old container is still
    // draining fails a question a student has already asked.
    await withRollback(async (db) => {
      const order: string[] = []
      const { driver, environment, rows, orphan } = await threeInstances(db)
      const recording: Driver = {
        ...driver,
        retireInstance: async (id, opts) => {
          order.push(`retire ${id}`)
          await driver.retireInstance(id, opts)
        },
      }
      await retireEnvironment(depsFor(db, recording, recordingAi(order)), environment.id)

      expect(order).toEqual([
        `retire ${rows.old.handle}`,
        `revoke key of instance ${rows.old.id}`,
        // The orphan has no row, so there is no instance key to revoke for it — its
        // key, if it had one, is the environment's, which the last line takes.
        `retire ${orphan}`,
        'revoke the environment’s pre-P4c key',
      ])
    })
  })

  it('revokes the environment’s pre-P4c key once the serving instance has a Route record', async () => {
    await withRollback(async (db) => {
      const order: string[] = []
      const { driver, environment } = await threeInstances(db)
      await retireEnvironment(depsFor(db, driver, recordingAi(order)), environment.id)
      expect(order).toContain('revoke the environment’s pre-P4c key')
    })
  })

  it('does NOT revoke the pre-P4c key while the instance serving is itself from before P4c', async () => {
    // Until the app has been deployed once by P4c, the environment-level key is the
    // one the RUNNING container is using — revoking it fails every question asked of
    // an app this platform has not redeployed yet.
    await withRollback(async (db) => {
      const order: string[] = []
      const { driver, environment } = await threeInstances(db, { servingHasRoute: false })
      await retireEnvironment(depsFor(db, driver, recordingAi(order)), environment.id)
      expect(order).not.toContain('revoke the environment’s pre-P4c key')
      // and it still did its actual job
      expect(
        order.filter((entry) => entry.startsWith('revoke key of instance')).length,
      ).toBe(1)
    })
  })

  it('skips the revokes entirely when AI is switched off', async () => {
    await withRollback(async (db) => {
      const order: string[] = []
      const { driver, environment } = await threeInstances(db)
      const outcome = await retireEnvironment(
        depsFor(db, driver, recordingAi(order, false)),
        environment.id,
      )
      expect(outcome.retired.length).toBe(2)
      expect(order).toEqual([])
    })
  })

  it('records instance.retire_failed, leaves the row destroying, and never throws', async () => {
    // A driver that refuses is not a crash: §11 says a failure surfaces as an Event
    // and is tried again, and a throw here would take down the process that scheduled
    // it — this is the control plane's first background work, and an unhandled
    // rejection is the whole process.
    await withRollback(async (db) => {
      const { driver, environment, rows, orphan, projectId } = await threeInstances(db)
      const refusing: Driver = {
        ...driver,
        retireInstance: async (id, opts) => {
          if (id === rows.old.handle)
            throw Object.assign(new Error('nope'), { code: 'BOOM' })
          await driver.retireInstance(id, opts)
        },
      }
      const outcome = await retireEnvironment(
        depsFor(db, refusing, recordingAi([])),
        environment.id,
      )

      expect(outcome.failed).toEqual([rows.old.handle])
      expect(outcome.retired).toEqual([orphan])
      // `destroying` and not `gone`: the row says the container is still there.
      expect(
        (await db.select().from(instances).where(eq(instances.id, rows.old.id)))[0]!
          .state,
      ).toBe('destroying')

      const written = await db
        .select()
        .from(events)
        .where(eq(events.projectId, projectId))
      const failure = written.find((event) => event.type === 'instance.retire_failed')!
      expect(failure).toBeDefined()
      // THE CODE, never the message: a driver's text is third-party and §14 keeps it
      // out of an Event a faculty member reads.
      expect(failure.machineDetail).toMatchObject({ error: 'BOOM' })
      expect(JSON.stringify(failure)).not.toContain('nope')
    })
  })

  it('publishes retiring and retired for each instance, and streams them', async () => {
    await withRollback(async (db) => {
      const { driver, environment, projectId } = await threeInstances(db)
      const bus = createEventBus()
      const frames: StreamFrame[] = []
      const unsubscribe = bus.subscribe(projectId, (frame) => frames.push(frame))
      try {
        await retireEnvironment(depsFor(db, driver, recordingAi([]), bus), environment.id)
      } finally {
        unsubscribe()
      }
      const types = frames
        .filter((frame) => frame.kind === 'event')
        .map((frame) => (frame as { type: string }).type)
      expect(types).toEqual([
        'instance.retiring',
        'instance.retired',
        'instance.retiring',
        'instance.retired',
      ])
      const stored = await db.select().from(events).where(eq(events.projectId, projectId))
      expect(stored.filter((event) => event.type === 'instance.retired').length).toBe(2)
    })
  })

  it('never retires an instance a concurrent deploy is still starting', async () => {
    // A deploy holds the environment lock from its instance row to its Route row, and
    // THE WINDOW THAT MATTERS IS THE ONE IN THE MIDDLE: the new container is up and
    // the route has not moved to it yet. An unlocked retire looking in that window
    // sees an instance that does not serve and removes the deploy from under itself.
    //
    // The fake's `ensureInstance` starts and promotes in one call, so the route is
    // put back afterwards to model the window. Without that this test passes with the
    // lock removed — measured 2026-09-15, and it is why the plan's control (c) came
    // out green.
    await withRollback(async (db) => {
      const { driver, environment, rows, orphan } = await threeInstances(db)
      let newcomer = ''
      let insideLock = false
      let releaseLock = (): void => {}
      const mayFinish = new Promise<void>((resolve) => {
        releaseLock = resolve
      })

      const deploy = withEnvironmentLock(environment.id, async () => {
        insideLock = true
        const handle = await driver.ensureInstance({
          instanceId: randomUUID(),
          name: `${environment.hostname}-newcomer`,
          hostname: environment.hostname,
          image: { repository: 'local/chem-labs', digest: `sha256:${'0'.repeat(64)}` },
          env: {},
          port: 8080,
          healthPath: '/healthz',
          resources: { cpu: 1, memoryMi: 256, pids: 128, diskMi: 512 },
          projectSlug: 'chem-labs',
          environmentKind: 'staging',
          releaseId: randomUUID(),
          services: [],
          egressAllow: [],
          needsAiGateway: false,
        })
        newcomer = handle.id
        // The window: container up, route not yet moved. `restoreRoute` points the
        // hostname back at what was serving when this deploy started.
        await driver.restoreRoute(rows.serving.handle)
        await mayFinish
        // …and the deploy finishes by promoting, still under the lock.
        await driver.restoreRoute(newcomer)
      })
      while (!insideLock) await sleep(5)

      const retire = retireEnvironment(
        depsFor(db, driver, recordingAi([])),
        environment.id,
      )
      // Long enough that a retire outside the lock would have chosen by now — and it
      // would have chosen the newcomer, which is the instance people are about to use.
      await sleep(100)
      releaseLock()
      await deploy
      const outcome = await retire

      expect(outcome.retired).not.toContain(newcomer)
      // Everything BUT the newcomer, which is R7: the instance that was serving when
      // the retire was scheduled is retired too, because by the time the lock was
      // free it was not serving any more.
      expect(outcome.retired.sort()).toEqual(
        [rows.old.handle, rows.serving.handle, orphan].sort(),
      )
      expect(await driver.servingInstance(environment.hostname)).toBe(newcomer)
    })
  })
})

describe('createRetirer (P4c Task 7)', () => {
  it('runs one pass per environment at a time, and runs again when something was scheduled meanwhile', async () => {
    await withRollback(async (db) => {
      const { driver, environment } = await threeInstances(db)
      const passes: number[] = []
      let running = 0
      const slow: Driver = {
        ...driver,
        servingInstance: async (hostname) => {
          running += 1
          passes.push(running)
          await sleep(50)
          running -= 1
          return driver.servingInstance(hostname)
        },
      }
      const retirer = createRetirer(depsFor(db, slow, recordingAi([])))

      retirer.schedule(environment.id)
      retirer.schedule(environment.id)
      retirer.schedule(environment.id)
      await retirer.idle()

      // Never two at once, and the three requests coalesced into two passes: the one
      // running, and one more because something was asked for while it ran.
      expect(Math.max(...passes)).toBe(1)
      expect(passes.length).toBe(2)
    })
  })

  it('idle() resolves only once every pass has finished', async () => {
    await withRollback(async (db) => {
      const { driver, environment } = await threeInstances(db)
      let finished = false
      const slow: Driver = {
        ...driver,
        retireInstance: async (id, opts) => {
          await sleep(40)
          await driver.retireInstance(id, opts)
          finished = true
        },
      }
      const retirer = createRetirer(depsFor(db, slow, recordingAi([])))
      retirer.schedule(environment.id)
      await retirer.idle()
      expect(finished).toBe(true)
    })
  })

  it('never throws out of schedule(), even when the pass fails outright', async () => {
    // `schedule` returns at once and nothing awaits its pass, so a rejection here is
    // an unhandled rejection — which is the whole process on Node's default.
    await withRollback(async (db) => {
      const { environment } = await threeInstances(db)
      const broken: Driver = {
        ...createFakeDriver(),
        servingInstance: () => Promise.reject(new Error('the daemon is down')),
      }
      const retirer = createRetirer(depsFor(db, broken, recordingAi([])))
      expect(() => retirer.schedule(environment.id)).not.toThrow()
      await expect(retirer.idle()).resolves.toBeUndefined()
    })
  })

  it('does not wait for one environment’s pass to run another’s', async () => {
    await withRollback(async (db) => {
      const shared = createFakeDriver()
      const first = await threeInstances(db, { driver: shared })
      const second = await threeInstances(db, { driver: shared })
      const order: string[] = []
      let running = 0
      let overlapped = false
      const slow: Driver = {
        ...shared,
        servingInstance: async (hostname) => {
          running += 1
          if (running > 1) overlapped = true
          order.push(`start ${hostname}`)
          await sleep(30)
          running -= 1
          return shared.servingInstance(hostname)
        },
      }
      const retirer = createRetirer(depsFor(db, slow, recordingAi([])))
      retirer.schedule(first.environment.id)
      retirer.schedule(second.environment.id)
      await retirer.idle()
      expect(order.length).toBe(2)
      // The two passes overlap: the retirer is one-at-a-time PER ENVIRONMENT, and two
      // apps must not queue behind each other.
      expect(overlapped).toBe(true)
    })
  })
})
