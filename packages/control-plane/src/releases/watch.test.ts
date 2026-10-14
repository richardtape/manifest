import { fileURLToPath } from 'node:url'
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appSpecs,
  db,
  events,
  incidents,
  instances,
  projects,
  routes,
  users,
  withEnvironmentLock,
} from '../db/index.js'
import { registerBackgroundWork, resetDatabase } from '../db/testing.js'
import { createFakeDriver, type FakeDriver } from '../runtime/index.js'
import { createProject } from '../projects/index.js'
import { testAudience, testReservedLabels } from '../projects/testing.js'
import { loadConfig } from '../config.js'
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { declaredCatalogue } from '../ai/testing.js'
import { createEventBus, incidentPrompt } from '../observability/index.js'
import { buildToEnd } from './testing.js'
import {
  createRelease,
  createRetirer,
  deployRelease,
  deployReleaseSet,
  recordApproval,
  type DeployDeps,
} from './index.js'
import {
  createSetWatcher,
  databaseClock,
  replacementDelaySeconds,
  type SetWatcherDeps,
} from './watch.js'

/**
 * A1 TASK 6 — A PRODUCTION MEMBER THAT EXITS IS REPLACED (Rich, *"Replace it automatically"*; Decision 11).
 *
 * **COMMITTED, NOT ROLLED BACK**: the watcher reads the database's clock and each row's `created_at`, and
 * inside one transaction both are the transaction's START — every deploy a test made would share one
 * instant, so neither the hour's count nor *"since the last person's deploy"* could be told apart. Each
 * test starts from `resetDatabase`, as the API tests do.
 */
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
  MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
  MANIFEST_SESSION_SECRET: 'k'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

const bus = createEventBus()

const one = (kind: 'sandbox' | 'staging' | 'production') => ({
  environmentKind: kind,
  port: 3000,
  health: '/healthz',
  resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
  env: [],
  services: [],
  egressAllow: [],
  classification: 'internal' as const,
  auth: {
    provider: 'none' as const,
    attributes: [] as string[],
    callback: '/auth/ubcshib/callback',
    logout: '/auth/logout',
  },
  ai: {
    models: [] as string[],
    budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 },
  },
})
const RESOLVED = {
  sandbox: one('sandbox'),
  staging: one('staging'),
  production: one('production'),
}

let base: Omit<DeployDeps, 'retirer'>
beforeAll(async () => {
  const keys = await generateMasterKeypair()
  base = {
    secrets: createServiceCredentials(keys, config.masterSecret),
    appSecrets: createAppSecrets(keys),
    blueprints: await loadBlueprints(BLUEPRINTS_ROOT),
    sso: {
      registerServiceProvider: () => {
        throw new Error('no test in this file registers an SP')
      },
      idpSigningCertificate: () => {
        throw new Error('no test in this file needs the IdP certificate')
      },
    },
    ai: {
      enabled: true,
      mintAppKey: () => {
        throw new Error('no test in this file mints an AI key')
      },
      discardAppKey: () => {
        throw new Error('no test in this file discards an AI key')
      },
      storeInstanceKey: () => {
        throw new Error('no test in this file stores an instance key')
      },
      revokeInstanceKey: () => Promise.resolve(false),
      revokeLegacyAppKey: () => Promise.resolve(false),
    },
    catalogue: declaredCatalogue(),
    bus,
  }
})

beforeEach(resetDatabase)
afterEach(() => {
  vi.restoreAllMocks()
})

type Scale = 'solo' | 'class' | 'large_course' | 'public'

/**
 * A project of `scale`, its release approved and LAUNCHED — production's set serving, by a person's deploy.
 * `{ rehearsal: true }` deploys production as D21's rehearsal does instead (`purpose: 'rehearsal'`): ONE
 * instance, and the project NOT launched.
 */
async function launched(
  driver: FakeDriver,
  scale: Scale = 'class',
  opts: { rehearsal?: boolean } = {},
) {
  const [user] = await db
    .insert(users)
    .values({ ubcCwlPuid: 'o', email: 'o@ubc.ca', displayName: 'O', role: 'member' })
    .returning()
  const { project, environments } = await createProject(
    db,
    config,
    await testReservedLabels(),
    {
      slug: 'chem-labs',
      ownerId: user!.id,
      blueprintRef: 'fixture-node@1',
      starter: null,
      audience: { ...testAudience(user!.id), scale },
    },
  )
  const [appSpec] = await db
    .insert(appSpecs)
    .values({
      projectId: project.id,
      commitSha: 'a'.repeat(40),
      parsed: {},
      schemaVersion: 1,
      valid: true,
    })
    .returning()
  const build = await buildToEnd(
    { db, driver, bus },
    {
      projectId: project.id,
      projectSlug: project.slug,
      appSpecId: appSpec!.id,
      commitSha: appSpec!.commitSha,
      blueprintRef: project.blueprintRef,
      repoPath: '/tmp/chem-labs.git',
    },
  )
  const release = await createRelease(db, {
    projectId: project.id,
    buildId: build.id,
    appSpecId: appSpec!.id,
    createdBy: user!.id,
    resolvedConfig: RESOLVED,
  })
  await approve(release, user!.id, build.imageDigest!, 'approved')
  const retirer = createRetirer({
    db,
    driver,
    ai: base.ai,
    appSecrets: base.appSecrets,
    bus,
    drainMs: 0,
  })
  registerBackgroundWork(retirer.idle)
  const deps: DeployDeps = { ...base, retirer }
  const byKind = Object.fromEntries(environments.map((e) => [e.kind, e]))
  const production = byKind.production!
  const set = await deployReleaseSet(db, driver, config, deps, {
    releaseId: release.id,
    environmentId: production.id,
    ...(opts.rehearsal === true ? { purpose: 'rehearsal' as const } : {}),
  })
  expect(set.instances.map((member) => member.state)).toEqual(
    set.instances.map(() => 'healthy'),
  )
  // The launch's own retire pass holds the environment's lock while it chooses — and a pass that finds the
  // lock held leaves the environment to the next one, by design. Settled here, so each test's first pass
  // reads the set.
  await retirer.idle()
  return {
    user: user!,
    project,
    build,
    release,
    production,
    staging: byKind.staging!,
    set: set.instances,
    deps,
    retirer,
  }
}
type Launched = Awaited<ReturnType<typeof launched>>

async function approve(
  release: { id: string; projectId: string },
  userId: string,
  imageDigest: string,
  decision: 'approved' | 'rejected',
) {
  await recordApproval(db, bus, {
    release,
    actor: { userId, puid: 'o' },
    decision,
    ...(decision === 'rejected' ? { reason: 'not this one' } : {}),
    imageDigest,
    diffSnapshot: {
      imageDigest,
      changes: [],
      services: [],
      attributes: [],
      resources: {},
      summary: null,
      summarySource: 'unavailable',
      review: { state: 'not_performed', reviewer: 'NullReviewer', detail: 'none' },
    },
  })
}

/**
 * A watcher over `driver`, its replacement bound to the real deploy (`purpose: 'replacement'`) as boot binds
 * it. Records every delay it was asked for and every replacement it started.
 */
function watcherFor(
  f: Launched,
  driver: FakeDriver,
  opts: {
    now?: SetWatcherDeps['now']
    delay?: SetWatcherDeps['delay']
  } = {},
) {
  const delays: number[] = []
  const redeploys: { environmentId: string; releaseId: string; replacing: string }[] = []
  const watcher = createSetWatcher({
    db,
    driver,
    bus,
    appSecrets: base.appSecrets,
    redeploy: async (input) => {
      redeploys.push(input)
      await deployRelease(db, driver, config, f.deps, {
        ...input,
        purpose: 'replacement',
      })
    },
    now: opts.now ?? (() => databaseClock(db)),
    delay:
      opts.delay ??
      (async (ms) => {
        delays.push(ms)
      }),
    intervalSeconds: 15,
  })
  registerBackgroundWork(watcher.idle)
  return { watcher, delays, redeploys }
}

/** One pass, then every replacement it started, then the retire pass each successful one scheduled. */
async function round(
  f: Launched,
  watcher: { pass(): Promise<void>; idle(): Promise<void> },
) {
  await watcher.pass()
  await watcher.idle()
  await f.retirer.idle()
}

type Exited = {
  instanceId: string
  releaseId: string
  environmentId: string
  environment: string
  exitCode: number | null
  reason: string
  attempt: number
  replacement: 'scheduled' | 'stopped'
  nextInSeconds: number | null
}

/** Every `instance.exited`, as recorded, in the order it was. */
async function exitedOf(projectId: string) {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.projectId, projectId), eq(events.type, 'instance.exited')))
    .orderBy(asc(events.seq))
  return rows.map((row) => ({
    detail: row.machineDetail as Exited,
    humanMessage: row.humanMessage,
  }))
}

const incidentsOf = (instanceId: string) =>
  db
    .select()
    .from(incidents)
    .where(eq(incidents.instanceId, instanceId))
    .orderBy(asc(incidents.createdAt))

const stateOf = async (id: string) =>
  (await db.select().from(instances).where(eq(instances.id, id)))[0]!.state

/** What the Route rows say serves production, in the set's order. */
async function servingSet(f: Launched) {
  return db
    .select({ instance: instances })
    .from(routes)
    .innerJoin(instances, eq(routes.instanceId, instances.id))
    .where(eq(routes.hostname, f.production.hostname))
    .orderBy(asc(instances.createdAt), asc(instances.id))
    .then((rows) => rows.map((row) => row.instance))
}

/** Every instance row a replacement started, oldest first. */
const replacementRows = (f: Launched) =>
  db
    .select()
    .from(instances)
    .where(
      and(eq(instances.environmentId, f.production.id), isNotNull(instances.replacing)),
    )
    .orderBy(asc(instances.createdAt), asc(instances.id))

describe('replacementDelaySeconds — the backoff and the cap (Decision 11)', () => {
  it('0, 60 and 240 seconds before the first, second and third replacement in an hour; none after three — stopped', () => {
    expect([0, 1, 2, 3, 4, 9].map(replacementDelaySeconds)).toEqual([
      0,
      60,
      240,
      undefined,
      undefined,
      undefined,
    ])
  })
})

describe('the set watcher — a production member that exits is replaced (A1 Task 6)', () => {
  it('a member that EXITED is recorded ONCE — its row failed, one Incident, one instance.exited — and the set is redeployed, the old pair retired', async () => {
    const driver = createFakeDriver()
    const f = await launched(driver)
    const [a, b] = f.set
    driver.crash(a!.handle!, 137)
    const { watcher, delays, redeploys } = watcherFor(f, driver)

    await round(f, watcher)

    const exited = await exitedOf(f.project.id)
    expect(exited.map((e) => e.detail)).toEqual([
      {
        instanceId: a!.id,
        releaseId: f.release.id,
        environmentId: f.production.id,
        environment: 'production',
        exitCode: 137,
        reason: 'exited',
        attempt: 1,
        replacement: 'scheduled',
        nextInSeconds: 0,
      },
    ])
    expect(exited[0]!.humanMessage).toMatch(/stopped; it is being replaced/)
    expect(exited[0]!.humanMessage).toMatch(/kept serving on the rest of its set/)
    // ONE Incident, on the member that exited — its own kind of Incident, with its own prompt.
    const recorded = await incidentsOf(a!.id)
    expect(recorded.map((incident) => incident.cause)).toEqual(['exit'])
    expect(recorded[0]!.exitReason).toBe('the process exited with code 137')
    const prompt = incidentPrompt(recorded[0]!, {
      slug: 'chem-labs',
      environmentKind: 'production',
    })
    expect(prompt).toMatch(/stopped while it was serving/)
    expect(prompt).not.toMatch(/failed to start/)
    // An incident.opened names it, as a failed deploy's does.
    const opened = await db
      .select()
      .from(events)
      .where(and(eq(events.projectId, f.project.id), eq(events.type, 'incident.opened')))
    expect(
      opened.map((event) => (event.machineDetail as { incidentId: string }).incidentId),
    ).toEqual([recorded[0]!.id])

    // THE REPLACEMENT: at once, a redeploy of the set naming the member it replaces.
    expect(delays).toEqual([0])
    expect(redeploys).toEqual([
      { environmentId: f.production.id, releaseId: f.release.id, replacing: a!.id },
    ])
    const fresh = await replacementRows(f)
    expect(fresh.map((row) => [row.state, row.replacing])).toEqual([
      ['healthy', a!.id],
      ['healthy', a!.id],
    ])
    expect((await servingSet(f)).map((row) => row.id)).toEqual(fresh.map((row) => row.id))
    // The old pair — the dead member AND the survivor — retired after the drain.
    expect([await stateOf(a!.id), await stateOf(b!.id)]).toEqual(['gone', 'gone'])
    expect((await driver.listInstances(f.production.hostname)).sort()).toEqual(
      fresh.map((row) => row.handle!).sort(),
    )

    // ONCE: another pass records nothing and starts nothing.
    await round(f, watcher)
    expect(await exitedOf(f.project.id)).toHaveLength(1)
    expect(await incidentsOf(a!.id)).toHaveLength(1)
    expect(redeploys).toHaveLength(1)
  })

  it('a member whose container is GONE is an exit too — exitCode null, and why', async () => {
    const driver = createFakeDriver()
    const f = await launched(driver)
    const [a] = f.set
    driver.vanish(a!.handle!)
    const { watcher, redeploys } = watcherFor(f, driver)

    await round(f, watcher)

    expect((await exitedOf(f.project.id)).map((e) => e.detail)).toMatchObject([
      {
        instanceId: a!.id,
        exitCode: null,
        reason: 'gone',
        attempt: 1,
        replacement: 'scheduled',
      },
    ])
    expect((await incidentsOf(a!.id))[0]!.exitReason).toBe(
      'the instance no longer exists',
    )
    expect(redeploys).toHaveLength(1)
  })

  it('a member RUNNING but failing its health check is not an exit — until its FOURTH pass in a row (a minute); a healthy pass starts the count again', async () => {
    const driver = createFakeDriver()
    const f = await launched(driver)
    const [a] = f.set
    const { watcher, redeploys } = watcherFor(f, driver)

    // Two unhealthy passes, then healthy: the count starts again.
    driver.crash(a!.handle!)
    await round(f, watcher)
    await round(f, watcher)
    driver.markHealthy(a!.handle!)
    await round(f, watcher)
    driver.crash(a!.handle!)
    for (let pass = 1; pass <= 3; pass += 1) await round(f, watcher)
    expect(await exitedOf(f.project.id)).toEqual([])
    expect(await stateOf(a!.id)).toBe('healthy')
    expect(redeploys).toEqual([])

    // The fourth in a row: nobody has reached it for a minute — as gone, to the people using the app.
    await round(f, watcher)
    expect((await exitedOf(f.project.id)).map((e) => e.detail)).toMatchObject([
      {
        instanceId: a!.id,
        exitCode: null,
        reason: 'unhealthy',
        attempt: 1,
        replacement: 'scheduled',
      },
    ])
    expect(redeploys).toHaveLength(1)
  })

  it('a replacement that FAILS: the set kept with its dead member, the deploy’s Incident, the next attempt only after the backoff — counted, because its rows exist — and after three, replacing stops and says so ONCE', async () => {
    let failing = false
    const driver = createFakeDriver({ neverReady: () => failing })
    const f = await launched(driver)
    const [a, b] = f.set
    failing = true
    driver.crash(a!.handle!, 1)
    const { watcher, delays, redeploys } = watcherFor(f, driver)

    await round(f, watcher)
    // The first attempt failed: the previous set serves — the survivor, and the dead member still recorded.
    expect((await servingSet(f)).map((row) => [row.id, row.state])).toEqual([
      [a!.id, 'failed'],
      [b!.id, 'healthy'],
    ])
    const firstTry = await replacementRows(f)
    expect(firstTry.map((row) => row.state)).toEqual(['failed', 'failed'])
    // Its own Incident — the deploy's, on the member that failed its check.
    expect(
      (
        await db
          .select()
          .from(incidents)
          .where(
            inArray(
              incidents.instanceId,
              firstTry.map((row) => row.id),
            ),
          )
      ).map((incident) => incident.cause),
    ).toEqual(['deploy'])

    await round(f, watcher)
    await round(f, watcher)
    expect(delays).toEqual([0, 60_000, 240_000])
    expect(redeploys).toHaveLength(3)
    expect(
      new Set((await replacementRows(f)).map((row) => row.createdAt.getTime())).size,
    ).toBe(3)

    // Three this hour: nothing more is started, and the stop is said — on the member that exited.
    await round(f, watcher)
    expect(redeploys).toHaveLength(3)
    const said = await incidentsOf(a!.id)
    expect(said.map((incident) => incident.cause)).toEqual(['exit', 'exit_stopped'])
    expect(
      incidentPrompt(said[1]!, { slug: 'chem-labs', environmentKind: 'production' }),
    ).toMatch(/has stopped replacing it/)

    // ONCE: the stop is not said again, the exit not recorded again, and nothing is started.
    await round(f, watcher)
    expect(await incidentsOf(a!.id)).toHaveLength(2)
    expect(await exitedOf(f.project.id)).toHaveLength(1)
    expect(redeploys).toHaveLength(3)
  })

  it('the backoff and the cap (Review Focus 7): three replacements in the hour — at once, then 1 minute, then 4 — and the FOURTH exit is stopped, even by a restarted process: nothing started, its Incident saying the app keeps stopping', async () => {
    const driver = createFakeDriver()
    const f = await launched(driver)
    const first = watcherFor(f, driver)
    for (let exit = 1; exit <= 3; exit += 1) {
      driver.crash((await servingSet(f))[0]!.handle!, 1)
      await round(f, first.watcher)
    }
    expect(first.delays).toEqual([0, 60_000, 240_000])
    expect(
      (await exitedOf(f.project.id)).map((e) => [
        e.detail.attempt,
        e.detail.replacement,
        e.detail.nextInSeconds,
      ]),
    ).toEqual([
      [1, 'scheduled', 0],
      [2, 'scheduled', 60],
      [3, 'scheduled', 240],
    ])

    // A RESTARTED PROCESS: a fresh watcher, nothing in its memory — the count is the rows'.
    const second = watcherFor(f, driver)
    const fourth = (await servingSet(f))[0]!
    driver.crash(fourth.handle!, 1)
    await round(f, second.watcher)

    const last = (await exitedOf(f.project.id)).at(-1)!
    expect(last.detail).toMatchObject({
      instanceId: fourth.id,
      attempt: 4,
      replacement: 'stopped',
      nextInSeconds: null,
    })
    expect(last.humanMessage).toMatch(
      /replacing it has stopped after three tries this hour/,
    )
    expect(second.redeploys).toEqual([])
    expect(await replacementRows(f)).toHaveLength(6)
    const [stopped] = await incidentsOf(fourth.id)
    expect(stopped!.cause).toBe('exit_stopped')
    expect(
      incidentPrompt(stopped!, { slug: 'chem-labs', environmentKind: 'production' }),
    ).toMatch(/keeps stopping/)
  })

  it('a person’s deploy resets the count: the next exit is replaced at once again', async () => {
    const driver = createFakeDriver()
    const f = await launched(driver)
    const { watcher, delays } = watcherFor(f, driver)
    for (let exit = 1; exit <= 3; exit += 1) {
      driver.crash((await servingSet(f))[0]!.handle!, 1)
      await round(f, watcher)
    }
    // A person deploys the app again.
    await deployRelease(db, driver, config, f.deps, {
      releaseId: f.release.id,
      environmentId: f.production.id,
    })
    await f.retirer.idle()

    driver.crash((await servingSet(f))[0]!.handle!, 1)
    await round(f, watcher)
    expect((await exitedOf(f.project.id)).at(-1)!.detail).toMatchObject({
      attempt: 1,
      replacement: 'scheduled',
      nextInSeconds: 0,
    })
    expect(delays).toEqual([0, 60_000, 240_000, 0])
  })

  it('three in ANY hour: an hour after the last, the count starts again', async () => {
    const driver = createFakeDriver()
    const f = await launched(driver)
    let later = 0
    const now = async () => new Date((await databaseClock(db)).getTime() + later)
    const { watcher } = watcherFor(f, driver, { now })
    for (let exit = 1; exit <= 3; exit += 1) {
      driver.crash((await servingSet(f))[0]!.handle!, 1)
      await round(f, watcher)
    }
    later = 61 * 60_000
    driver.crash((await servingSet(f))[0]!.handle!, 1)
    await round(f, watcher)
    expect((await exitedOf(f.project.id)).at(-1)!.detail).toMatchObject({
      attempt: 1,
      replacement: 'scheduled',
    })
  })

  it('a replacement that finds NOTHING to replace — a person’s deploy landed first — does nothing, says so on the operator line, and starts no second deploy', async () => {
    const driver = createFakeDriver()
    const f = await launched(driver)
    const [a] = f.set
    let go!: () => void
    const held = new Promise<void>((resolve) => {
      go = resolve
    })
    const { watcher, redeploys } = watcherFor(f, driver, { delay: () => held })
    driver.crash(a!.handle!, 1)
    await watcher.pass()

    // A person's deploy, while the replacement waits.
    await deployRelease(db, driver, config, f.deps, {
      releaseId: f.release.id,
      environmentId: f.production.id,
    })
    const operator = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    go()
    await watcher.idle()
    await f.retirer.idle()

    expect(redeploys).toHaveLength(1)
    expect(await replacementRows(f)).toEqual([])
    expect(
      operator.mock.calls.some((call) => String(call[0]).includes('nothing to replace')),
    ).toBe(true)
    // Nothing stopped: there was nothing to stop.
    expect((await incidentsOf(a!.id)).map((incident) => incident.cause)).toEqual(['exit'])
  })

  it('the gate (Review Focus 8): a release whose approval was REJECTED since is never redeployed — refused RELEASE_DIGEST_NOT_APPROVED, nothing started, and replacing stops with the code in its Incident', async () => {
    const driver = createFakeDriver()
    const f = await launched(driver)
    const [a] = f.set
    await approve(f.release, f.user.id, f.build.imageDigest!, 'rejected')
    driver.crash(a!.handle!, 1)
    const { watcher, redeploys } = watcherFor(f, driver)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await round(f, watcher)

    expect(redeploys).toHaveLength(1)
    expect(await replacementRows(f)).toEqual([])
    const said = await incidentsOf(a!.id)
    expect(said.map((incident) => incident.cause)).toEqual(['exit', 'exit_stopped'])
    expect(said[1]!.failedCheck).toContain('RELEASE_DIGEST_NOT_APPROVED')
    expect(
      incidentPrompt(said[1]!, { slug: 'chem-labs', environmentKind: 'production' }),
    ).toContain('RELEASE_DIGEST_NOT_APPROVED')

    // Stopped stays stopped: a refused release is not tried again every pass.
    await round(f, watcher)
    expect(redeploys).toHaveLength(1)
    expect(await incidentsOf(a!.id)).toHaveLength(2)
  })

  describe('what it leaves alone', () => {
    it('staging’s member — §11’s *"a crash becomes failed and an Event"* is for a person to act on', async () => {
      const driver = createFakeDriver()
      const f = await launched(driver)
      const staged = await deployReleaseSet(db, driver, config, f.deps, {
        releaseId: f.release.id,
        environmentId: f.staging.id,
      })
      driver.crash(staged.instances[0]!.handle!, 1)
      const { watcher, redeploys } = watcherFor(f, driver)
      await round(f, watcher)
      expect(await exitedOf(f.project.id)).toEqual([])
      expect(await stateOf(staged.instances[0]!.id)).toBe('healthy')
      expect(redeploys).toEqual([])
    })

    it('an archived project’s production', async () => {
      const driver = createFakeDriver()
      const f = await launched(driver)
      await db
        .update(projects)
        .set({ state: 'archived' })
        .where(eq(projects.id, f.project.id))
      driver.crash(f.set[0]!.handle!, 1)
      const { watcher, redeploys } = watcherFor(f, driver)
      await round(f, watcher)
      expect(await exitedOf(f.project.id)).toEqual([])
      expect(redeploys).toEqual([])
    })

    it('an environment a deploy is mid-way through — its LOCK held — until the deploy is done', async () => {
      const driver = createFakeDriver()
      const f = await launched(driver)
      driver.crash(f.set[0]!.handle!, 1)
      const { watcher } = watcherFor(f, driver)
      await withEnvironmentLock(f.production.id, async () => {
        await watcher.pass()
        expect(await exitedOf(f.project.id)).toEqual([])
        expect(await stateOf(f.set[0]!.id)).toBe('healthy')
      })
      await round(f, watcher)
      expect(await exitedOf(f.project.id)).toHaveLength(1)
    })

    /**
     * F12 OF SITTING 5, CHOSEN IN SITTING 6: A PROJECT NOT LAUNCHED. Before a launch nothing serves production but
     * D21's rehearsal (`takeDownLeftRehearsals`' own rule), which puts ONE instance up and takes exactly it down —
     * and whose take-down leaves a row that is not `healthy` alone. Read here, a member exiting mid-rehearsal was
     * recorded `scheduled`, its replacement refused (no approval before a launch) and its Route row left behind.
     */
    it('a project NOT LAUNCHED — its production set is D21’s rehearsal’s, which takes itself down — recorded by nothing, replaced by nothing', async () => {
      const driver = createFakeDriver()
      const f = await launched(driver, 'class', { rehearsal: true })
      // THE POSITIVE HALF: the rehearsal's ONE member serves production, and the project has not launched.
      expect((await servingSet(f)).map((row) => row.id)).toEqual([f.set[0]!.id])
      const [project] = await db
        .select({ launchedAt: projects.launchedAt })
        .from(projects)
        .where(eq(projects.id, f.project.id))
      expect(project!.launchedAt).toBeNull()
      driver.crash(f.set[0]!.handle!, 1)
      const { watcher, redeploys } = watcherFor(f, driver)
      await round(f, watcher)
      expect(await exitedOf(f.project.id)).toEqual([])
      expect(await incidentsOf(f.set[0]!.id)).toEqual([])
      // Still `healthy`, so the rehearsal's own take-down takes it down.
      expect(await stateOf(f.set[0]!.id)).toBe('healthy')
      expect(redeploys).toEqual([])
    })

    it('a member asleep (A2’s hibernation): its status reads hibernated, never failed', async () => {
      const driver = createFakeDriver()
      const f = await launched(driver)
      await driver.stopInstance(f.set[0]!.handle!)
      const { watcher, redeploys } = watcherFor(f, driver)
      await round(f, watcher)
      expect(await exitedOf(f.project.id)).toEqual([])
      expect(redeploys).toEqual([])
    })
  })

  it('a member ANOTHER DRIVER started is not this watcher’s to read — the unit tier’s fake rows beside a running control plane on Docker', async () => {
    // One database, two processes (ORIENTATION §4): `pnpm test` writes production sets of the fake driver's
    // handles (`inst-3`) while the control plane on 7100 watches with Docker's — to which each reads `gone`.
    const driver = createFakeDriver()
    const f = await launched(driver)
    const [a, b] = f.set
    await db.update(instances).set({ driver: 'docker' }).where(eq(instances.id, a!.id))
    driver.crash(a!.handle!, 1)
    driver.crash(b!.handle!, 1)
    const { watcher } = watcherFor(f, driver)
    await round(f, watcher)
    // Only the member this driver started is read — and replaced; the other is left exactly as it was.
    expect((await exitedOf(f.project.id)).map((e) => e.detail.instanceId)).toEqual([
      b!.id,
    ])
    expect(await incidentsOf(a!.id)).toEqual([])
  })

  it('rows a THROWN deploy left `starting` do not stop the watch — the lock, not the rows, says a deploy is mid-way', async () => {
    const driver = createFakeDriver()
    const f = await launched(driver)
    // What a deploy that threw leaves until the next boot (A1 sitting 4's F7).
    await db.insert(instances).values({
      environmentId: f.production.id,
      releaseId: f.release.id,
      driver: driver.name,
      state: 'starting',
    })
    driver.crash(f.set[0]!.handle!, 1)
    const { watcher, redeploys } = watcherFor(f, driver)
    await round(f, watcher)
    expect(await exitedOf(f.project.id)).toHaveLength(1)
    expect(redeploys).toHaveLength(1)
  })

  it('a `solo` app’s set of one is replaced too — its one exit is the app down until the replacement serves', async () => {
    const driver = createFakeDriver()
    const f = await launched(driver, 'solo')
    const [only] = f.set
    driver.crash(only!.handle!, 1)
    const { watcher } = watcherFor(f, driver)
    await round(f, watcher)
    const [exit] = await exitedOf(f.project.id)
    expect(exit!.detail).toMatchObject({ replacement: 'scheduled', attempt: 1 })
    expect(exit!.humanMessage).toMatch(
      /Nothing is serving the app until the replacement starts/,
    )
    expect((await servingSet(f)).map((row) => [row.state, row.replacing])).toEqual([
      ['healthy', only!.id],
    ])
  })

  it('the database’s clock, never the host’s', async () => {
    const [{ now }] = (await db.execute(sql`SELECT now() AS now`)).rows as [{ now: Date }]
    const clock = await databaseClock(db)
    expect(Math.abs(clock.getTime() - new Date(now).getTime())).toBeLessThan(5_000)
  })
})
