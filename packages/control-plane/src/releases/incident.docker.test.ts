import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { disabledAiKeyService, disabledCatalogue } from '../ai/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { loadConfig } from '../config.js'
import { appSpecs, incidents, users } from '../db/index.js'
import { withRollback } from '../db/testing.js'
import {
  createEventBus,
  incidentPrompt,
  makeRedactor,
  type StreamFrame,
} from '../observability/index.js'
import { createProject } from '../projects/index.js'
import { instanceName, type Driver } from '../runtime/index.js'
import {
  appContainer,
  createEngineClient,
  describeDocker,
  destroyAppNetwork,
  dockerDriverForTests,
  egressContainer,
  fixtureBareRepo,
  instanceAlias,
  resolveSocketPath,
} from '../runtime/testing.js'
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import { createRelease, deployRelease, startBuild } from './index.js'

/**
 * §14's Incident, from a container that REALLY failed (P4b Task 13).
 *
 * `releases.test.ts` proves the capture against a fake driver, which answers exactly
 * what the test scripted. What no fake can show is the path the Docker driver actually
 * takes: an app that crashes as it starts is refused by the driver's READINESS probe,
 * which throws — and until Task 13 that throw left the row in `provisioning` and no
 * record at all. So this builds a real app, deploys it through `deployRelease` and the
 * real driver, and reads the Incident the platform wrote: the exit code Docker recorded,
 * the log Docker kept, redacted with the secret set the deploy stored.
 */
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))
const SLUG = 'incident-probe'
const KIND = 'staging' as const
const bus = createEventBus()
const engine = createEngineClient({ socketPath: resolveSocketPath() })

/**
 * The commonest failure: the app prints its way into a start — more lines than an
 * Incident keeps, one of them carrying its own SESSION_SECRET — and exits 3 before it
 * listens. ALL ON STDOUT: Docker reads stdout and stderr on separate pipes, and the
 * order of lines across the two is not guaranteed, while this asserts the last line.
 */
const CRASHING_SERVER = [
  "for (let i = 1; i <= 250; i += 1) console.log('boot line ' + i)",
  "console.log('config dump: session=' + process.env.SESSION_SECRET)",
  "console.log('fatal: cannot start, exiting')",
  'process.exit(3)',
  '',
].join('\n')

describeDocker('a failed deploy records an Incident, from a real container (§14)', () => {
  let driver: Driver
  let repo: { repoPath: string; commitSha: string }
  const containers: string[] = []

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
    port: 3000,
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

  beforeAll(async () => {
    // Twelve seconds of readiness, not ninety: this deploy is SUPPOSED to fail it.
    driver = await dockerDriverForTests({ readinessTimeoutMs: 12_000 })
    // The fixture app's own package.json and lockfile, so the build goes through §12's
    // gates and the mirror exactly as a real app does; only the entry point is replaced.
    repo = fixtureBareRepo(join(tmpdir(), `mf-${SLUG}.git`), {
      extraFiles: { 'server.js': CRASHING_SERVER },
    })
  }, 120_000)

  afterAll(async () => {
    // No `.catch(() => undefined)`: each of these is a no-op for something already
    // gone, and a failure here is a leak worth seeing.
    for (const container of containers) await driver.destroyInstance(container)
    await engine.del(`/containers/${egressContainer(SLUG, KIND)}?force=true&v=true`)
    await destroyAppNetwork(engine, SLUG, KIND)
  }, 120_000)

  it('records the exit code, the last 200 lines redacted with the app’s own secrets, the failing check and the missing healthy release', async () => {
    await withRollback(async (db) => {
      const keys = await generateMasterKeypair()
      const [user] = await db
        .insert(users)
        .values({
          ubcCwlPuid: `puid-${SLUG}`,
          email: `${SLUG}@ubc.ca`,
          displayName: 'O',
          role: 'member',
        })
        .returning()
      const { project, environments } = await createProject(db, config, {
        slug: SLUG,
        ownerId: user!.id,
        blueprintRef: 'fixture-node@1',
      })
      const staging = environments.find((e) => e.kind === KIND)!
      const [appSpec] = await db
        .insert(appSpecs)
        .values({
          projectId: project.id,
          commitSha: repo.commitSha,
          parsed: {},
          schemaVersion: 1,
          valid: true,
        })
        .returning()

      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: SLUG,
        appSpecId: appSpec!.id,
        commitSha: repo.commitSha,
        blueprintRef: 'fixture-node@1',
        repoPath: repo.repoPath,
      })
      expect(build.status, build.error ?? '').toBe('succeeded')
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec!.id,
        createdBy: user!.id,
        resolvedConfig: {
          sandbox: resolvedFor('sandbox'),
          staging: resolvedFor('staging'),
          production: resolvedFor('production'),
        },
      })
      const appSecrets = createAppSecrets(keys)
      const scheduled: string[] = []

      // D23.2 (P4b Task 15): what a watching client is told about this failure, read
      // off the same bus the deploy publishes to.
      const frames: StreamFrame[] = []
      const off = bus.subscribe(project.id, (f) => frames.push(f))
      const instance = await deployRelease(
        db,
        driver,
        config,
        {
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
          ai: disabledAiKeyService(),
          catalogue: disabledCatalogue(),
          bus,
          // This deploy FAILS, so it schedules nothing; a recorder proves that rather
          // than a real retirer removing the container this test reads an Incident from.
          retirer: { schedule: () => scheduled.push('a retire was scheduled') },
        },
        { releaseId: release.id, environmentId: staging.id },
      )

      off()
      // A recorded failure — not an exception, and not a row parked in `provisioning`.
      expect(instance.state).toBe('failed')
      // A failed deploy schedules no retire: nothing of this app was replaced (P4c).
      expect(scheduled).toEqual([])
      // And a streamed one: the state transition, then the Incident it produced.
      expect(frames.flatMap((f) => (f.kind === 'event' ? [f.type] : []))).toEqual([
        'instance.failed',
        'incident.opened',
      ])
      // THE NAME CARRIES THE INSTANCE (§11, P4c), so it cannot be predicted before the
      // deploy: the instance row's uuid is created inside `deployRelease`. Asserting it
      // this way round is stronger than the literal it replaced — it proves the running
      // system derived the name from the SAME four parts this test did, which is the
      // "the test constructs the value correctly and the running system re-derives it
      // wrongly" shape that cost P3's session 5 seven defects.
      const container = appContainer(instanceName(SLUG, KIND, release.id, instance.id))
      containers.push(container)
      expect(instance.handle).toBe(container)

      const recorded = await db
        .select()
        .from(incidents)
        .where(eq(incidents.instanceId, instance.id))
      expect(recorded, 'the failed deploy recorded no Incident').toHaveLength(1)
      const incident = recorded[0]!

      expect(incident.exitReason).toBe('the process exited with code 3')
      /**
       * THE PROBE MOVED (P4c Task 4). Readiness is asked from INSIDE THE EDGE against
       * the instance's own network alias — `mf-i-<instanceId>:<port>` — not at the
       * public hostname, because the hostname's route has not moved yet and must not:
       * whatever serves it keeps serving it while this instance tries to start. The
       * alias is asserted rather than matched loosely, so a probe that went back to
       * the hostname (and would then be answered by the instance already serving)
       * fails here as well as in `redeploy.docker.test.ts`.
       */
      expect(incident.failedCheck).toMatch(
        new RegExp(
          `^readiness: GET /healthz on ${instanceAlias(instance.id)}:\\d+ from the edge — .+ \\(\\d+ attempts\\)$`,
        ),
      )

      // 252 lines printed; the LAST 200 kept, in order.
      const lines = incident.logTail.split('\n')
      expect(lines).toHaveLength(200)
      expect(lines[0]).toBe('boot line 53')
      expect(lines.at(-1)).toBe('fatal: cannot start, exiting')

      // The SESSION_SECRET this deploy stored, which the app printed. Hex, which no
      // heuristic redacts: only the app's own secret set, read at capture, can.
      const secret = await appSecrets.sessionSecret(db, {
        projectId: project.id,
        environmentKind: KIND,
      })
      expect(makeRedactor([])(secret)).toBe(secret)
      expect(lines.at(-2)).toBe('config dump: session=[REDACTED]')
      expect(JSON.stringify(incident)).not.toContain(secret)

      expect(incident.diffSinceHealthy).toBe(
        'This app has never been healthy in staging, so there is no working release to compare this one with.',
      )
      expect(incidentPrompt(incident, { slug: SLUG, environmentKind: KIND })).toContain(
        'fatal: cannot start, exiting',
      )
    })
  }, 600_000)
})
