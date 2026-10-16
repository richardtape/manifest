import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { disabledAiKeyService, disabledCatalogue } from '../ai/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { loadConfig } from '../config.js'
import { appSpecs, db, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { createEventBus } from '../observability/index.js'
import { createProject } from '../projects/index.js'
import { testAudience, testReservedLabels } from '../projects/testing.js'
import { createRelease, createRetirer, deployRelease } from '../releases/index.js'
import type { DeployDeps, Retirer } from '../releases/index.js'
import { buildToEnd } from '../releases/testing.js'
import { createCaddyClient, removeRoute, routeIdFor } from '../routing/index.js'
import type { Driver } from '../runtime/index.js'
import {
  CA_CERT,
  contractRepoCommit,
  createEngineClient,
  describeDocker,
  destroyAppNetwork,
  dockerDriverForTests,
  egressContainer,
  ensureContractRepo,
  resolveSocketPath,
} from '../runtime/testing.js'
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import { LOAD_REHEARSAL_LABEL, createLoadGenerator } from './load.js'
import { runLoadRehearsal } from './load-run.js'

const run = promisify(execFile)
const engine = createEngineClient({ socketPath: resolveSocketPath() })
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))

/** Its own slug: a slug and an environment determine the hostname, the route, the app network and the egress container. */
const SLUG = 'load-run-cp'
const KIND = 'staging' as const
const HOST = `${SLUG}.staging.manifest.internal`
const ADMIN = 'http://127.0.0.1:7119'
const routing = {
  caddy: createCaddyClient(ADMIN),
  servers: { internal: 'srv0', public: 'srv0' } as const,
}
const MiB = 1024 * 1024

/**
 * ONE LOAD REHEARSAL, FOR REAL (the load rehearsal plan's Task 4): a `large_course` app's staging granted production's
 * three instances by the Docker driver, vegeta's container loading it through the live edge with its own address
 * exempted, judged, recorded `passed`, and staging given back — one container at STAGING's memory, its route with no
 * exemption. At a light profile (this file's own settings: 10 a second, then 5, five seconds each) on the blueprint's
 * skeleton, which serves `/healthz` without a database.
 *
 * Staging's resources and production's DIFFER here (256 Mi against 384 Mi) — B sitting 1's F4: with the manifest's
 * defaults the two are equal, and *"back at staging's own resources"* could not fail.
 *
 * COMMITTED ROWS, as every Docker suite that deploys: the run is background work on its own connections.
 */
describeDocker('a load rehearsal through the real edge (§24)', () => {
  let driver: Driver
  let retirer: Retirer
  let deps: DeployDeps
  let projectId: string
  let stagingId: string
  let userId: string

  const config = loadConfig({
    MANIFEST_ENV: 'development',
    MANIFEST_DATABASE_URL: 'postgres://unused',
    MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
    MANIFEST_SESSION_SECRET: 'k'.repeat(32),
    MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
    MANIFEST_REPOS_ROOT: '/tmp/repos',
    MANIFEST_LOAD_SYNCHRONISED: '10x5,5x5',
    MANIFEST_LOAD_HARD_STOP_SECONDS: '120',
  })

  const resolvedFor = (kind: 'sandbox' | 'staging' | 'production') => ({
    environmentKind: kind,
    port: 3000,
    health: '/healthz',
    resources: {
      cpu: 0.5,
      memory: kind === 'production' ? '384Mi' : '256Mi',
      pids: 128,
      disk: '1Gi',
    },
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

  /** Every app container this suite's project owns in staging. */
  const appContainers = async (): Promise<string[]> => {
    const { stdout } = await run('docker', [
      'ps',
      '-a',
      '--filter',
      `label=manifest.slug=${SLUG}`,
      '--filter',
      `label=manifest.environment=${KIND}`,
      '--filter',
      'label=manifest.release',
      '--format',
      '{{.Names}}',
    ])
    return stdout.split('\n').filter((line) => line.trim() !== '')
  }

  beforeAll(async () => {
    await resetDatabase()
    driver = await dockerDriverForTests()
    const repo = join(tmpdir(), `mf-${SLUG}.git`)
    ensureContractRepo(repo)
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
      audience: { ...testAudience(userId), scale: 'large_course', burst: 'synchronised' },
    })
    projectId = created.project.id
    const staging = created.environments.find((e) => e.kind === KIND)!
    expect(staging.hostname).toBe(HOST)
    stagingId = staging.id
    const [spec] = await db
      .insert(appSpecs)
      .values({
        projectId,
        commitSha: 'abc123',
        parsed: {},
        schemaVersion: 1,
        valid: true,
      })
      .returning()

    const keys = await generateMasterKeypair()
    const appSecrets = createAppSecrets(keys)
    const bus = createEventBus()
    const ai = disabledAiKeyService()
    retirer = createRetirer({ db, driver, ai, appSecrets, bus, drainMs: 1_000 })
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

    const build = await buildToEnd(
      { db, driver, bus },
      {
        projectId,
        projectSlug: SLUG,
        appSpecId: spec!.id,
        commitSha: contractRepoCommit(repo),
        blueprintRef: 'fixture-node@1',
        repoPath: repo,
      },
    )
    expect(build.status, build.error ?? '').toBe('succeeded')
    const release = await createRelease(db, {
      projectId,
      buildId: build.id,
      appSpecId: spec!.id,
      createdBy: userId,
      resolvedConfig: {
        sandbox: resolvedFor('sandbox'),
        staging: resolvedFor('staging'),
        production: resolvedFor('production'),
      },
    })
    // THE CANDIDATE: the release serving staging, at staging's own shape.
    const first = await deployRelease(db, driver, config, deps, {
      releaseId: release.id,
      environmentId: stagingId,
    })
    expect(first.state).toBe('healthy')
    await retirer.idle()
  }, 900_000)

  afterAll(async () => {
    await retirer?.idle()
    await removeRoute(routing, HOST, KIND).catch(() => undefined)
    const left = await appContainers().catch(() => [])
    if (left.length > 0) {
      await run('docker', ['rm', '-f', '-v', ...left]).catch(() => undefined)
      await run('docker', ['volume', 'rm', '-f', ...left.map((c) => `${c}-files`)]).catch(
        () => undefined,
      )
    }
    await engine.del(`/containers/${egressContainer(SLUG, KIND)}?force=true&v=true`)
    await destroyAppNetwork(engine, SLUG, KIND).catch(() => undefined)
    await resetDatabase()
  }, 300_000)

  it('grants production’s three, loads them through the edge, passes — and gives staging back at its own memory, with no exemption', async () => {
    const generator = createLoadGenerator({
      engine,
      caCertPath: CA_CERT,
      dnsServer: config.dnsServer,
      hardStopMs: config.loadRehearsal.hardStopMs,
    })
    const { row, done } = await runLoadRehearsal(
      { db, driver, config, deploy: deps, generator, watchIntervalMs: 1_000 },
      { projectId, actor: { id: userId } },
    )
    expect(row.state).toBe('running')
    const ended = await done

    expect(ended.state, ended.evidence?.reason).toBe('passed')
    expect(ended.granted).toMatchObject({
      count: 3,
      resources: { environment: 'production', memory: '384Mi' },
    })
    expect(ended.evidence).toMatchObject({ requests: 75, answered: 75, timeouts: 0 })
    expect(ended.evidence!.byPath).toEqual({
      '/': expect.any(Object),
      '/healthz': expect.any(Object),
    })
    expect(ended.generatorAddress).toMatch(/^10\.89\.0\.\d+$/)

    // STAGING BACK IN ITS OWN SHAPE: one member serving, at staging's memory.
    const serving = await driver.servingInstances(HOST)
    expect(serving).toHaveLength(1)
    const inspected = await engine.get<{ HostConfig: { Memory: number } }>(
      `/containers/${serving[0]}/json`,
    )
    expect(inspected?.HostConfig.Memory).toBe(256 * MiB)
    // ITS ROUTE EXEMPTS NOBODY: the zone's match is every address again, with no `not`.
    const route = await routing.caddy.getRoute(routeIdFor(HOST))
    expect(JSON.stringify(route)).not.toContain('"not"')
    // And the generator is gone.
    const filters = encodeURIComponent(
      JSON.stringify({ label: [`${LOAD_REHEARSAL_LABEL}=${ended.id}`] }),
    )
    expect(
      await engine.get<unknown[]>(`/containers/json?all=true&filters=${filters}`),
    ).toEqual([])
  }, 600_000)
})
