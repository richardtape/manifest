import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { disabledAiKeyService, disabledCatalogue } from '../ai/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { loadConfig } from '../config.js'
import {
  appSpecs,
  db,
  environments,
  incidents,
  instances,
  routes,
  users,
} from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { createEventBus } from '../observability/index.js'
import { createProject } from '../projects/index.js'
import { createCaddyClient, removeRoute, servingRoute } from '../routing/index.js'
import type { Driver } from '../runtime/index.js'
import {
  CA_CERT,
  createEngineClient,
  describeDocker,
  destroyAppNetwork,
  dockerDriverForTests,
  egressContainer,
  ensureContractRepo,
  fixtureBareRepo,
  resolveSocketPath,
} from '../runtime/testing.js'
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import { createRelease, createRetirer, deployRelease, startBuild } from './index.js'
import type { DeployDeps, Retirer } from './index.js'
import { testAudience, testReservedLabels } from '../projects/testing.js'

const run = promisify(execFile)
const engine = createEngineClient({ socketPath: resolveSocketPath() })
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))

/**
 * Its own slug, for the reason every Docker suite here has one: a slug and an
 * environment determine the hostname, the route id, the app network and the egress
 * container, so two suites sharing one are the same deployment.
 */
const SLUG = 'redeploy-cp'
const KIND = 'staging' as const
const HOST = `${SLUG}.staging.manifest.internal`
const PORT = 3000

const ADMIN = 'http://127.0.0.1:7119'
const routing = {
  caddy: createCaddyClient(ADMIN),
  servers: { internal: 'srv0', public: 'srv0' } as const,
}

/**
 * A REDEPLOY THROUGH THE CONTROL PLANE (P4c Task 8).
 *
 * `runtime/docker/redeploy.docker.test.ts` proves the takeover at the DRIVER, where
 * the test hands `ensureInstance` a spec it built itself. This one proves it where a
 * faculty member meets it: `deployRelease` against the real Docker driver, with the
 * instance row, the advisory lock, §6's Route record and the background retirer all
 * in play — the seam where P3's Session 5 found seven defects of the shape *the test
 * constructs the value correctly and the running system re-derives it wrongly*.
 *
 * COMMITTED ROWS, not `withRollback`. The retirer runs AFTER the deploy returns, on
 * its own pooled connection, and a rolled-back transaction is gone by then; the
 * concurrency test needs two connections for the same reason. `resetDatabase` in
 * `afterAll` is what keeps the rest of the suite honest.
 *
 * SEQUENTIAL, and `vitest -t` will not work on it: each test reads the state the one
 * before it left, exactly as the driver's own redeploy suite does.
 */
describeDocker('a redeploy through deployRelease (§11 Redeploys)', () => {
  let driver: Driver
  let retirer: Retirer
  let deps: DeployDeps
  let project: { id: string; slug: string; blueprintRef: string }
  let staging: { id: string; hostname: string }
  let userId: string
  let appSpecId: string
  /** The healthy tree, and a tree whose app exits before it listens. */
  let healthyRepo: string
  let crashingRepo: { repoPath: string; commitSha: string }

  const config = loadConfig({
    MANIFEST_ENV: 'development',
    MANIFEST_DATABASE_URL: 'postgres://unused',
    MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
    MANIFEST_SESSION_SECRET: 'k'.repeat(32),
    MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
    MANIFEST_REPOS_ROOT: '/tmp/repos',
  })

  const resolvedFor = (kind: 'sandbox' | 'staging' | 'production') => ({
    environmentKind: kind,
    port: PORT,
    health: '/healthz',
    resources: { cpu: 0.5, memory: '256Mi', pids: 128, disk: '1Gi' },
    env: [],
    services: [],
    egressAllow: [],
    classification: 'internal' as const,
    ai: {
      models: [] as string[],
      budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 },
    },
    auth: {
      provider: 'none' as const,
      attributes: [] as string[],
      callback: '/auth/ubcshib/callback',
      logout: '/auth/logout',
    },
  })

  /** Every app container this suite's project owns, newest last. */
  const appContainers = async (): Promise<string[]> => {
    const { stdout } = await run('docker', [
      'ps',
      '-a',
      '--filter',
      `label=manifest.slug=${SLUG}`,
      '--filter',
      `label=manifest.environment=${KIND}`,
      // Only an APP container carries `manifest.release` — the database and the egress
      // proxy carry the other two (M5). Repeated `label` filters AND, unlike `name`.
      '--filter',
      'label=manifest.release',
      '--format',
      '{{.Names}}',
    ])
    return stdout.split('\n').filter((line) => line.trim() !== '')
  }

  const volumeExists = (name: string): Promise<boolean> =>
    run('docker', ['volume', 'inspect', name]).then(
      () => true,
      () => false,
    )

  /**
   * A request every 25 ms from inside ONE container, classified by body AND by the
   * edge's identity header, until a stop file appears. One container rather than one
   * per request: `docker run` costs ~300 ms, longer than the window a route change
   * could leave open.
   */
  const LOOP = `mf-${SLUG}-loop`
  const startLoop = async (): Promise<void> => {
    await run('docker', ['rm', '-f', LOOP]).catch(() => undefined)
    await run('docker', [
      'run',
      '-d',
      '--name',
      LOOP,
      '--network',
      'manifest-platform',
      '--dns',
      '10.89.0.53',
      '-v',
      `${CA_CERT}:/ca.crt:ro`,
      '--entrypoint',
      'sh',
      'curlimages/curl:8.11.1',
      '-c',
      'while [ ! -f /tmp/stop ]; do ' +
        "curl -s --cacert /ca.crt -m 5 -w '|%{http_code}|%header{x-manifest-instance}|END\\n' " +
        `https://${HOST}/healthz; sleep 0.025; done`,
    ])
  }
  const stopLoop = async (): Promise<
    { body: string; status: number; instance: string; wildcard: boolean }[]
  > => {
    await run('docker', ['exec', LOOP, 'touch', '/tmp/stop'])
    await run('docker', ['wait', LOOP])
    const { stdout } = await run('docker', ['logs', LOOP], {
      maxBuffer: 32 * 1024 * 1024,
    })
    return stdout
      .split('|END\n')
      .filter((line) => line.includes('|'))
      .map((line) => {
        const [body = '', status = '0', instance = ''] = line.split('|')
        return {
          body,
          status: Number(status),
          instance,
          wildcard: body.includes('manifest OK host='),
        }
      })
  }

  /** A release built from `repoPath`, ready to deploy. */
  const releaseFrom = async (repoPath: string, commitSha: string): Promise<string> => {
    const build = await startBuild(db, driver, deps.bus, {
      projectId: project.id,
      projectSlug: SLUG,
      appSpecId,
      commitSha,
      blueprintRef: 'fixture-node@1',
      repoPath,
    })
    expect(build.status, build.error ?? '').toBe('succeeded')
    const release = await createRelease(db, {
      projectId: project.id,
      buildId: build.id,
      appSpecId,
      createdBy: userId,
      resolvedConfig: {
        sandbox: resolvedFor('sandbox'),
        staging: resolvedFor('staging'),
        production: resolvedFor('production'),
      },
    })
    return release.id
  }

  const deploy = (releaseId: string) =>
    deployRelease(db, driver, config, deps, { releaseId, environmentId: staging.id })

  beforeAll(async () => {
    await resetDatabase()
    driver = await dockerDriverForTests()
    // The blueprint SKELETON: it serves `/healthz` with no database. `fixture-app`
    // connects to Mongo before it listens and exits if it cannot, which would make
    // this routing test measure a Mongo timeout (ORIENTATION §4).
    healthyRepo = join(tmpdir(), `mf-${SLUG}.git`)
    ensureContractRepo(healthyRepo)
    // …and an app that crashes before it listens, for R5. The readiness probe refuses
    // it, which is the commonest real failure and the one §14's Incident exists for.
    crashingRepo = fixtureBareRepo(join(tmpdir(), `mf-${SLUG}-crash.git`), {
      extraFiles: {
        'server.js': ["console.log('fatal: cannot start')", 'process.exit(3)', ''].join(
          '\n',
        ),
      },
    })

    const [user] = await db
      .insert(users)
      .values({
        ubcCwlPuid: `puid-${SLUG}`,
        email: `${SLUG}@ubc.ca`,
        displayName: 'O',
        role: 'member',
      })
      .returning()
    userId = user!.id
    const created = await createProject(db, config, await testReservedLabels(), {
      slug: SLUG,
      ownerId: userId,
      blueprintRef: 'fixture-node@1',
      starter: null,
      audience: testAudience(userId),
    })
    project = created.project
    staging = created.environments.find((e) => e.kind === KIND)!
    expect(staging.hostname).toBe(HOST)
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
    appSpecId = spec!.id

    const keys = await generateMasterKeypair()
    const appSecrets = createAppSecrets(keys)
    const bus = createEventBus()
    const ai = disabledAiKeyService()
    // THE REAL RETIRER, over the real driver, exactly as `src/index.ts` builds it.
    // `drainMs: 5_000` rather than 120 s: nothing here holds a request open, and the
    // drain's own bound is proved in `runtime/docker/redeploy.docker.test.ts`.
    retirer = createRetirer({ db, driver, ai, appSecrets, bus, drainMs: 5_000 })
    deps = {
      secrets: createServiceCredentials(keys, config.masterSecret),
      appSecrets,
      sso: {
        registerServiceProvider: () => {
          throw new Error('this app declares no sign-on')
        },
        idpSigningCertificate: () => {
          throw new Error('this app declares no sign-on')
        },
      },
      blueprints: await loadBlueprints(BLUEPRINTS_ROOT),
      ai,
      catalogue: disabledCatalogue(),
      bus,
      retirer,
    }
  }, 900_000)

  afterAll(async () => {
    await retirer?.idle()
    await removeRoute(routing, HOST, KIND).catch(() => undefined)
    // BY EXPLICIT NAME, with each instance's own `-files` volume (P4b finding 194):
    // `docker volume ls -f dangling=true` lists other people's volumes.
    const left = await appContainers().catch(() => [])
    if (left.length > 0) {
      await run('docker', ['rm', '-f', '-v', ...left]).catch(() => undefined)
      await run('docker', ['volume', 'rm', '-f', ...left.map((c) => `${c}-files`)]).catch(
        () => undefined,
      )
    }
    await run('docker', ['rm', '-f', LOOP]).catch(() => undefined)
    await engine.del(`/containers/${egressContainer(SLUG, KIND)}?force=true&v=true`)
    // `destroyAppNetwork`, not `docker network rm`: every app network has the
    // platform's neighbours attached and a plain `rm` refuses while they are (§4).
    await destroyAppNetwork(engine, SLUG, KIND).catch(() => undefined)
    await resetDatabase()
  }, 300_000)

  it('replaces the instance under a request loop, then retires the old one with its files volume', async () => {
    const releaseA = await releaseFrom(healthyRepo, 'abc123')
    const first = await deploy(releaseA)
    expect(first.state).toBe('healthy')
    // §6's Route record — the platform's own answer to "what serves".
    const [routeAfterFirst] = await db
      .select()
      .from(routes)
      .where(eq(routes.hostname, HOST))
    expect(routeAfterFirst?.instanceId).toBe(first.id)
    // …and the edge agrees with it. Two producers of one value is this repository's
    // most expensive defect shape, so both are read.
    expect((await servingRoute(routing, HOST))?.instanceId).toBe(first.id)
    await retirer.idle()

    // THE REDEPLOY, under a request every 25 ms. Started after the first instance
    // serves: before that the wildcard answers, and counting that would be counting
    // the platform's normal state.
    await startLoop()
    await new Promise((r) => setTimeout(r, 2000))
    const releaseB = await releaseFrom(healthyRepo, 'abc123')
    const second = await deploy(releaseB)
    await new Promise((r) => setTimeout(r, 1000))
    const seen = await stopLoop()

    expect(second.state).toBe('healthy')
    expect(second.id).not.toBe(first.id)
    expect(seen.length).toBeGreaterThan(50)
    expect(seen.filter((r) => r.wildcard)).toEqual([])
    expect(seen.filter((r) => r.status >= 500)).toEqual([])
    // R1 tolerates the reset a Caddy configuration reload occasionally causes — about
    // one request in 300 per admin change — and counts it rather than failing on it.
    expect(seen.filter((r) => r.status === 0).length).toBeLessThanOrEqual(2)
    // And the hostname really did change instance: a route that never moved would
    // pass every assertion above. Read off the requests that were ANSWERED — the
    // tolerated reset carries no header and landed last on the first run of this
    // test, which would otherwise make the assertion a flake rather than a check.
    const answered = seen.filter((r) => r.status === 200)
    // Decision 6: every 200 through the edge carries the edge's own identity, from a
    // DEFERRED headers handler, so an answer with none would mean a route serving
    // without one — which is what `servingInstance` and the drain both read.
    expect(answered.filter((r) => r.instance === '')).toEqual([])
    expect(answered.at(0)!.instance).toBe(first.id)
    expect(answered.at(-1)!.instance).toBe(second.id)
    // EXACTLY TWO identities, in that order: nothing else ever answered this hostname.
    expect([...new Set(answered.map((r) => r.instance))]).toEqual([first.id, second.id])

    // The Route row moved with it, and the old row is on its way out (Decision 17).
    const written = await db.select().from(routes).where(eq(routes.hostname, HOST))
    expect(written).toHaveLength(1)
    expect(written[0]!.instanceId).toBe(second.id)
    const stateOf = async (id: string) =>
      (await db.select().from(instances).where(eq(instances.id, id)))[0]!.state
    /**
     * `destroying` OR `gone`, and the alternative is not sloppiness.
     *
     * The retirer is BACKGROUND WORK (R3): `schedule` returns while the deploy is
     * still inside the lock, and the pass takes that lock the moment the deploy
     * releases it — so by the time this line runs it may already have reaped the old
     * instance and moved the row on. Measured on this test's second run, which
     * expected `destroying` and read `gone`. The marking itself is pinned
     * deterministically in `releases.test.ts`, against a retirer that only records.
     */
    expect(['destroying', 'gone']).toContain(await stateOf(first.id))

    // AND THE RETIRER REALLY RUNS. Until this task nothing called it: the old
    // container stayed up and attached, which is the backlog P4b finding 189 counted.
    await retirer.idle()
    const after = await appContainers()
    expect(after).toEqual([second.handle])
    expect(await stateOf(first.id)).toBe('gone')
    // The `-files` volume goes with the container. On a real app it holds a copy of
    // the app's SP private key, so this is not tidiness.
    expect(await volumeExists(`${first.handle!}-files`)).toBe(false)
    // …and the app is still answering, as itself.
    expect((await servingRoute(routing, HOST))?.instanceId).toBe(second.id)
  }, 900_000)

  it('leaves the previous instance serving when a release never becomes ready, and removes the failed container', async () => {
    const serving = (await servingRoute(routing, HOST))?.instanceId
    expect(serving, 'the previous test left an instance serving').toBeTruthy()
    const containersBefore = await appContainers()
    expect(containersBefore).toHaveLength(1)

    // Twelve seconds of readiness, not ninety: this deploy is SUPPOSED to fail it.
    const impatient = await dockerDriverForTests({ readinessTimeoutMs: 12_000 })
    const releaseC = await releaseFrom(crashingRepo.repoPath, crashingRepo.commitSha)
    const failed = await deployRelease(db, impatient, config, deps, {
      releaseId: releaseC,
      environmentId: staging.id,
    })

    // A recorded failure, not an exception (P4b Task 13).
    expect(failed.state).toBe('failed')
    // R5: THE APP IS UNTOUCHED. The route never moved, so there was nothing to put
    // back — and the Route row still names the instance that is serving.
    expect((await servingRoute(routing, HOST))?.instanceId).toBe(serving)
    const [route] = await db.select().from(routes).where(eq(routes.hostname, HOST))
    expect(route!.instanceId).toBe(serving)
    // §14's Incident was captured THROUGH the handle, before the container went…
    const recorded = await db
      .select()
      .from(incidents)
      .where(eq(incidents.instanceId, failed.id))
    expect(recorded).toHaveLength(1)
    expect(recorded[0]!.logTail).toContain('fatal: cannot start')
    // …and the container went. A failed deploy leaks nothing (R5).
    expect(await appContainers()).toEqual(containersBefore)
    expect(await volumeExists(`${failed.handle!}-files`)).toBe(false)
  }, 900_000)

  it('two deploys of one environment at once leave exactly one instance serving', async () => {
    const releaseD = await releaseFrom(healthyRepo, 'abc123')
    const releaseE = await releaseFrom(healthyRepo, 'abc123')
    const [a, b] = await Promise.all([deploy(releaseD), deploy(releaseE)])
    expect([a.state, b.state]).toEqual(['healthy', 'healthy'])

    // ONE Route row, and the edge dials the instance it names. Without the advisory
    // lock the two deploys interleave and the row and the edge can name different
    // instances — after which a retire reads one of them and removes the other.
    const written = await db.select().from(routes).where(eq(routes.hostname, HOST))
    expect(written).toHaveLength(1)
    const onTheEdge = (await servingRoute(routing, HOST))?.instanceId
    expect(written[0]!.instanceId).toBe(onTheEdge)

    // And the retirer reaps everything that is not it — including the instance the
    // previous tests left, which is R7: not only the one this deploy replaced.
    await retirer.idle()
    const left = await appContainers()
    expect(left).toHaveLength(1)
    const [winner] = await db
      .select()
      .from(instances)
      .where(and(eq(instances.environmentId, staging.id), eq(instances.state, 'healthy')))
    expect(winner!.id).toBe(onTheEdge)
    expect(left).toEqual([winner!.handle])
    // The environment row is untouched by any of it.
    const [row] = await db
      .select()
      .from(environments)
      .where(eq(environments.id, staging.id))
    expect(row!.hostname).toBe(HOST)
  }, 900_000)
})
