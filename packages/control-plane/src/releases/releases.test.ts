import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import pg from 'pg'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { resetDatabase, withRollback } from '../db/testing.js'
import {
  appSpecs,
  builds,
  db,
  events,
  incidents,
  instances,
  routes,
  users,
  withEnvironmentLock,
} from '../db/index.js'
import {
  FAKE_NEVER_READY_PATH,
  InstanceNotReadyError,
  createFakeDriver,
} from '../runtime/index.js'
import { createProject } from '../projects/index.js'
import { loadConfig } from '../config.js'
import type { Driver, InstanceSpec, ServiceBinding } from '../runtime/index.js'
import { createAppSecrets, generateMasterKeypair, getSecret } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { ReleaseError, createRelease, deployRelease, startBuild } from './index.js'
import type { DeployDeps, ResolvedConfigSet } from './index.js'
import type { SpRegistrationInput } from '../sso/index.js'
import {
  disabledAiKeyService,
  disabledCatalogue,
  type AiKeyService,
  type MintAppKeyInput,
  type ModelCatalogue,
} from '../ai/index.js'
import { declaredCatalogue } from '../ai/testing.js'
import {
  createEventBus,
  makeRedactor,
  readBuildLog,
  type StreamFrame,
} from '../observability/index.js'
import { testReservedLabels } from '../projects/testing.js'

/** The repository's own blueprints, resolved from THIS FILE — `pnpm test` and
 *  `pnpm --filter … test` have different working directories. */
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))

// Each database file starts from a known slate rather than trusting whatever ran
// before it to have cleaned up. `withRollback` isolates a test from its OWN writes
// only, so a committed row left by an API test — they cannot roll back — collided
// with the `chem-labs` these suites insert. Asserting the precondition beats
// depending on every other file remembering an afterAll.
beforeAll(resetDatabase)

/**
 * §12's credential resolver, which `deployRelease` now requires. A keypair per
 * RUN rather than per test: these tests roll back, so nothing they store
 * outlives them, and the one test that cares about the stored value builds its
 * own resolver so it can read the row back.
 */
/**
 * D23.2's bus (P4b Task 15). ONE for the file: a test that cares what was streamed
 * subscribes to its own project's id, which is unique per fixture, and unsubscribes.
 */
const bus = createEventBus()

/** Every frame `bus` carries for one project while `run` runs. */
async function streamedWhile(
  projectId: string,
  run: () => Promise<unknown>,
): Promise<StreamFrame[]> {
  const frames: StreamFrame[] = []
  const off = bus.subscribe(projectId, (f) => frames.push(f))
  try {
    await run()
  } finally {
    off()
  }
  return frames
}

const eventTypes = (frames: StreamFrame[]) =>
  frames.flatMap((f) => (f.kind === 'event' ? [f.type] : []))

let deployDeps: DeployDeps
beforeAll(async () => {
  const keys = await generateMasterKeypair()
  deployDeps = {
    secrets: createServiceCredentials(keys, config.masterSecret),
    appSecrets: createAppSecrets(keys),
    // The real registry, read off the repository's own `blueprints/`, because
    // `run_as_uid` is a value this task threads into a file mode and a stub
    // would make the one thing under test a constant.
    blueprints: await loadBlueprints(BLUEPRINTS_ROOT),
    // The default for every test in this file EXCEPT the Task 9 block, which
    // passes its own recorder. Throwing rather than returning a stub: the fixture
    // declares `auth.provider: none`, so a registration here would mean the
    // condition guarding it has stopped working — and a silent stub would hide
    // exactly that.
    sso: {
      registerServiceProvider: () => {
        throw new Error('no test in this file should register an SP by default')
      },
      idpSigningCertificate: () => {
        throw new Error('no test in this file should need the IdP certificate')
      },
    },
    // The default for every test EXCEPT the P4b Task 9 block at the end, which passes
    // its own recorder. Throwing, for the reason `sso` does: these fixtures declare no
    // model, so a mint here would mean the condition guarding it has stopped working.
    ai: {
      enabled: true,
      mintAppKey: () => {
        throw new Error('no test in this file should mint an AI key by default')
      },
      discardAppKey: () => {
        throw new Error('no test in this file should discard an AI key by default')
      },
      storeInstanceKey: () => {
        throw new Error('no test in this file should store an instance key by default')
      },
      revokeInstanceKey: () => Promise.resolve(false),
      revokeLegacyAppKey: () => Promise.resolve(false),
    },
    // infra/litellm/config.yaml through the real projection (`ai/testing.ts`).
    catalogue: declaredCatalogue(),
    bus,
    // THE DEFAULT IS A RETIRER THAT RECORDS AND DOES NOTHING (P4c Task 8). A real one
    // would drain and remove the instance every redeploy test in this file leaves
    // behind, which is Task 7's behaviour and is tested there; the tests that care
    // what a deploy SCHEDULES pass their own.
    retirer: { schedule: () => undefined },
  }
})

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
  MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
  MANIFEST_SESSION_SECRET: 'k'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

const one = (kind: 'sandbox' | 'staging' | 'production') => ({
  environmentKind: kind,
  port: 3000,
  health: '/healthz',
  resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
  env: [],
  services: [],
  egressAllow: [],
  classification: 'internal' as const,
  // `none` is the schema's default and it is what `fixture-node` declares, so
  // every existing test in this file describes an app with NO single sign-on.
  // That is the right default here: it means the SP tests below have to opt in,
  // rather than every other test quietly registering one.
  auth: {
    provider: 'none' as const,
    attributes: [] as string[],
    callback: '/auth/ubcshib/callback',
    logout: '/auth/logout',
  },
  // Task 10 put `ai` on ResolvedConfig for the reason Task 9 put `auth` there:
  // §13 freezes it, so `renderInjection` reads the frozen config and never
  // `app_specs.parsed`.
  ai: {
    models: [] as string[],
    budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 },
  },
})

/** The same, for an app that actually uses CWL. */
const withCwl = (kind: 'sandbox' | 'staging' | 'production') => ({
  ...one(kind),
  auth: {
    provider: 'cwl' as const,
    attributes: ['ubcEduCwlPuid', 'mail'],
    callback: '/auth/ubcshib/callback',
    logout: '/auth/logout',
  },
})
const RESOLVED_WITH_CWL = {
  sandbox: withCwl('sandbox'),
  staging: withCwl('staging'),
  production: withCwl('production'),
}

const RESOLVED = {
  sandbox: one('sandbox'),
  staging: one('staging'),
  production: one('production'),
}

/** The same, with a declared Mongo — the shape the service wire exists for.
 *  Port 8080, deliberately NOT the blueprint's default_port of 3000: a test
 *  whose expected value equals the default cannot tell an injected value from a
 *  hardcoded one. */
const withService = (kind: 'sandbox' | 'staging' | 'production') => ({
  ...one(kind),
  port: 8080,
  services: [{ type: 'mongo', version: '7', name: 'db' }],
})
const RESOLVED_WITH_SERVICE = {
  sandbox: withService('sandbox'),
  staging: withService('staging'),
  production: withService('production'),
}

async function fixture(db: Parameters<typeof createProject>[0]) {
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
  const byKind = Object.fromEntries(environments.map((e) => [e.kind, e]))
  return { user: user!, project, appSpec: appSpec!, byKind }
}

describe('builds', () => {
  it('records the image digest a successful build produced', async () => {
    await withRollback(async (db) => {
      const { project, appSpec } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      expect(build.status).toBe('succeeded')
      expect(build.imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    })
  })

  it('records a failed build without a digest', async () => {
    await withRollback(async (db) => {
      const { project, appSpec } = await fixture(db)
      const driver = createFakeDriver()
      vi.spyOn(driver, 'buildImage').mockRejectedValueOnce(new Error('compile error'))
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      expect(build.status).toBe('failed')
      expect(build.imageDigest).toBeNull()
    })
  })

  const buildInput = (
    project: { id: string; slug: string; blueprintRef: string },
    appSpec: { id: string; commitSha: string },
  ) => ({
    projectId: project.id,
    projectSlug: project.slug,
    appSpecId: appSpec.id,
    commitSha: appSpec.commitSha,
    blueprintRef: project.blueprintRef,
    repoPath: '/tmp/chem-labs.git',
  })

  it('stores a successful build’s log BEFORE the row says succeeded (§14)', async () => {
    // Read straight after `startBuild` returns. Lines written by un-awaited inserts
    // land some time later, and a status that says `succeeded` over a log that is
    // still arriving is the race pre-flight 108 named.
    await withRollback(async (db) => {
      const { project, appSpec } = await fixture(db)
      const build = await startBuild(
        db,
        createFakeDriver(),
        bus,
        buildInput(project, appSpec),
      )
      expect(build.status).toBe('succeeded')
      const lines = await readBuildLog(db, build.id)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines[0]!.text).toContain('chem-labs')
    })
  })

  it('does not call a build finished while its log is still being written (§14)', async () => {
    // The test above cannot show this, and sitting 7 measured that it cannot: inside
    // `withRollback` one connection runs its queries in order, so the status UPDATE
    // queues behind the log INSERT whether or not `startBuild` waits — deleting the
    // `flush` left it green. The control plane runs on a POOL, where the two race.
    // So this runs on the pool, with the log table locked by a second connection for
    // a second: a build that waits for its log cannot return before the lock goes.
    const admin = new pg.Pool({
      connectionString: process.env.MANIFEST_ADMIN_DATABASE_URL,
    })
    const lock = await admin.connect()
    try {
      const { project, appSpec } = await fixture(db)
      await lock.query('BEGIN')
      await lock.query('LOCK TABLE audit.build_logs IN ACCESS EXCLUSIVE MODE')
      const started = Date.now()
      const finishedAt = startBuild(
        db,
        createFakeDriver(),
        bus,
        buildInput(project, appSpec),
      ).then((build) => ({ build, at: Date.now() }))
      await new Promise((resolve) => setTimeout(resolve, 1_000))
      await lock.query('COMMIT')
      const { build, at } = await finishedAt
      expect(
        at - started,
        'startBuild returned while its log was locked out',
      ).toBeGreaterThanOrEqual(900)
      expect(build.status).toBe('succeeded')
      expect((await readBuildLog(db, build.id)).length).toBeGreaterThan(0)
    } finally {
      // ROLLBACK outside a transaction is a warning, not an error, so this is safe
      // whether the test got as far as COMMIT or not.
      await lock.query('ROLLBACK')
      lock.release()
      await admin.end()
      // The rows above were COMMITTED, and every other test here assumes none are.
      await resetDatabase()
    }
  })

  it('a FAILED build keeps its log, and the reason is its last line', async () => {
    // The case that matters. P3 measured the alternative: `startBuild` caught the
    // error and discarded it, the row said `failed` and nothing else, and the only
    // way to learn why was to re-run the build by hand outside the platform.
    await withRollback(async (db) => {
      const { project, appSpec } = await fixture(db)
      const failingDriver: Driver = {
        ...createFakeDriver(),
        async buildImage(_src, _spec, opts) {
          opts?.onLog?.({
            at: new Date(),
            stream: 'stderr',
            text: 'npm error code ELIFECYCLE',
          })
          await new Promise((resolve) => setImmediate(resolve))
          throw new Error('npm ci exited 1')
        },
      }
      const build = await startBuild(db, failingDriver, bus, buildInput(project, appSpec))
      expect(build.status).toBe('failed')
      const lines = await readBuildLog(db, build.id)
      expect(lines.map((l) => [l.stream, l.text])).toEqual([
        ['stderr', 'npm error code ELIFECYCLE'],
        ['stderr', build.error],
      ])
    })
  })

  it('a build refused BEFORE the builder ran still has a log: the refusal', async () => {
    // `assembleContext` and §12's gates throw before a builder exists, so a secret
    // found in the source produces no BuildKit output at all (pre-flight 109). The
    // log must not be empty for exactly the failures a faculty member can fix.
    await withRollback(async (db) => {
      const { project, appSpec } = await fixture(db)
      const refusing: Driver = {
        ...createFakeDriver(),
        async buildImage() {
          throw Object.assign(new Error('a secret was found in config.js'), {
            code: 'BUILD_GATE_FAILED',
            hint: 'Remove the secret and push again.',
          })
        },
      }
      const build = await startBuild(db, refusing, bus, buildInput(project, appSpec))
      expect(build.status).toBe('failed')
      const lines = await readBuildLog(db, build.id)
      expect(lines.map((l) => [l.stream, l.text])).toEqual([['stderr', build.error]])
      expect(build.error).toContain('BUILD_GATE_FAILED')
    })
  })

  it('streams build.started, each log line as it is written, and build.succeeded — the events RECORDED too (P4b Task 15)', async () => {
    await withRollback(async (db) => {
      const { project, appSpec } = await fixture(db)
      let build: Awaited<ReturnType<typeof startBuild>> | undefined
      const frames = await streamedWhile(project.id, async () => {
        build = await startBuild(
          db,
          createFakeDriver(),
          bus,
          buildInput(project, appSpec),
        )
      })
      // The log line BETWEEN the two events: streamed as it was written, not reported
      // when the build ended.
      expect(frames.map((f) => (f.kind === 'event' ? f.type : f.kind))).toEqual([
        'build.started',
        'log',
        'build.succeeded',
      ])
      expect(frames[1]).toMatchObject({ kind: 'log', buildId: build!.id, seq: 0 })
      // Durable as well as streamed: a client that connects after the build must still
      // see what happened, and the replay reads the TABLE. The log is not in it.
      const rows = await db.select().from(events).where(eq(events.projectId, project.id))
      expect(rows.map((r) => r.type).sort()).toEqual(['build.started', 'build.succeeded'])
      expect(frames.flatMap((f) => (f.kind === 'event' ? [f.id] : [])).sort()).toEqual(
        rows.map((r) => r.id).sort(),
      )
      expect(rows.find((r) => r.type === 'build.succeeded')!.machineDetail).toMatchObject(
        {
          buildId: build!.id,
          imageDigest: build!.imageDigest,
        },
      )
    })
  })

  it('streams each log line exactly as it is STORED — redacted (P4b Task 15)', async () => {
    // A frame is a copy of what a faculty member is shown, so it is held to the store's
    // rule: redacted at capture. Compared line for line with the stored log, so a frame
    // that carries the raw line differs from the row that does not.
    const token = 'Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0L'
    await withRollback(async (db) => {
      const { project, appSpec } = await fixture(db)
      const base = createFakeDriver()
      const chatty: Driver = {
        ...base,
        async buildImage(src, spec, opts) {
          opts?.onLog?.({
            at: new Date(),
            stream: 'stdout',
            text: `npm http fetch GET 200 https://registry.example/pkg?token=${token}`,
          })
          return base.buildImage(src, spec)
        },
      }
      let build: Awaited<ReturnType<typeof startBuild>> | undefined
      const frames = await streamedWhile(project.id, async () => {
        build = await startBuild(db, chatty, bus, buildInput(project, appSpec))
      })
      const streamed = frames.flatMap((f) => (f.kind === 'log' ? [f.text] : []))
      const stored = (await readBuildLog(db, build!.id)).map((line) => line.text)
      expect(stored.length).toBeGreaterThan(0)
      expect(streamed).toEqual(stored)
      expect(JSON.stringify(frames)).not.toContain(token)
    })
  })

  it('streams build.failed as a sentence a faculty member can read, with the reason — redacted — in machine_detail (P4b Task 15)', async () => {
    // §14's first bullet: "Your app couldn't start", not `exit code 1`. The reason is
    // still there, for the agent, in machine_detail — through the redactor.
    const token = 'aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vWx'
    await withRollback(async (db) => {
      const { project, appSpec } = await fixture(db)
      const failingDriver: Driver = {
        ...createFakeDriver(),
        async buildImage(_src, _spec, opts) {
          opts?.onLog?.({
            at: new Date(),
            stream: 'stderr',
            text: 'npm error code ELIFECYCLE',
          })
          await new Promise((resolve) => setImmediate(resolve))
          throw new Error(`npm ci exited 1 (registry token ${token})`)
        },
      }
      const build = await startBuild(db, failingDriver, bus, buildInput(project, appSpec))
      expect(build.status).toBe('failed')
      const rows = await db.select().from(events).where(eq(events.projectId, project.id))
      const failed = rows.find((r) => r.type === 'build.failed')
      expect(failed, 'no build.failed event was recorded').toBeDefined()
      expect(failed!.humanMessage).toMatch(/could not be built/i)
      expect(failed!.humanMessage).not.toMatch(/exit|ELIFECYCLE|npm|stack|token/i)
      const detail = failed!.machineDetail as { buildId: string; reason: string }
      expect(detail.buildId).toBe(build.id)
      expect(detail.reason).toContain('npm ci exited 1')
      expect(JSON.stringify(failed)).not.toContain(token)
    })
  })
})

describe('releases (§13)', () => {
  it('refuses to create a release from a build with no image digest', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec } = await fixture(db)
      const [pending] = await db
        .insert(builds)
        .values({
          projectId: project.id,
          commitSha: appSpec.commitSha,
          appSpecId: appSpec.id,
          status: 'pending',
        })
        .returning()
      const attempt = createRelease(db, {
        projectId: project.id,
        buildId: pending!.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED,
      })
      // Both the type and the code: a bare `code` match would also accept a plain
      // Error somebody happened to hang a `code` on, which the API error envelope
      // maps to 500 rather than 409.
      await expect(attempt).rejects.toBeInstanceOf(ReleaseError)
      await expect(attempt).rejects.toMatchObject({
        code: 'RELEASE_BUILD_NOT_DEPLOYABLE',
      })
    })
  })

  it('deploys a release to staging and reaches healthy', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED,
      })
      const instance = await deployRelease(db, driver, config, deployDeps, {
        releaseId: release.id,
        environmentId: byKind.staging!.id,
      })
      expect(instance.state).toBe('healthy')
      expect(instance.handle).toBeTruthy()
    })
  })

  /**
   * THE SERVICE WIRE (measured 2026-09-06). `deployRelease` passed `services: []`
   * as a hardcoded literal, so `ensureService` was never called and a deployed app
   * came up with no database — while every test here stayed green, because none of
   * them declared a service.
   */
  it('binds a declared service and injects its endpoint (§8, the wire only)', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const seen: InstanceSpec[] = []
      const recording: Driver = {
        ...driver,
        ensureInstance: (spec) => {
          seen.push(spec)
          return driver.ensureInstance(spec)
        },
      }
      const build = await startBuild(db, recording, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED_WITH_SERVICE,
      })
      await deployRelease(db, recording, config, deployDeps, {
        releaseId: release.id,
        environmentId: byKind.staging!.id,
      })

      const spec = seen.at(-1)!
      // A handle reached the instance, not an empty array.
      expect(spec.services).toHaveLength(1)
      expect(spec.services[0]!.name).toBe('chem-labs-staging-db')
      // And the app can actually find it. The variable name is §8's, rendered by
      // `spec/injection.ts` — the one producer of every name in `spec.env`.
      expect(spec.env.MONGODB_URI).toBe(spec.services[0]!.endpoint)
      expect(spec.env.MONGODB_URI).toContain('chem-labs-staging-db')
    })
  })

  /**
   * §8's contract, from a DEPLOY (Task 11).
   *
   * `deployRelease` injected `SERVICE_CATALOGUE[type].envVar` and nothing else,
   * so `MONGODB_DB_NAME` had never been injected at all: every deployed app fell
   * back to a database called `app`, while two Docker tests set the variable
   * themselves and passed. Measured 2026-09-07. This asserts what the DRIVER was
   * handed, which is the only question that has ever mattered here.
   */
  it('gives the app the database its credentials were derived for', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const seen: InstanceSpec[] = []
      const recording: Driver = {
        ...driver,
        ensureInstance: (spec) => {
          seen.push(spec)
          return driver.ensureInstance(spec)
        },
      }
      const build = await startBuild(db, recording, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED_WITH_SERVICE,
      })
      await deployRelease(db, recording, config, deployDeps, {
        releaseId: release.id,
        environmentId: byKind.staging!.id,
      })

      const env = seen.at(-1)!.env
      // The RESOLVED port, not the blueprint's default. P3's ad-hoc block was
      // the second producer of this value, and a second producer is what Task 11
      // deleted — so this is the assertion that goes red if one comes back.
      expect(env.PORT).toBe('8080')
      expect(env.MONGODB_DB_NAME).toBe('chem_labs')
      expect(env.MONGODB_URI).toContain('/chem_labs')
      // The one that is generated rather than derived, and must be STABLE: a
      // session secret that changed per deploy would log every user out.
      expect(env.SESSION_SECRET).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  it('keeps SESSION_SECRET stable across two deploys of one environment', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const seen: InstanceSpec[] = []
      const recording: Driver = {
        ...driver,
        ensureInstance: (spec) => {
          seen.push(spec)
          return driver.ensureInstance(spec)
        },
      }
      const build = await startBuild(db, recording, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED,
      })
      const deploy = () =>
        deployRelease(db, recording, config, deployDeps, {
          releaseId: release.id,
          environmentId: byKind.staging!.id,
        })
      await deploy()
      await deploy()
      expect(seen).toHaveLength(2)
      expect(seen[0]!.env.SESSION_SECRET).toBe(seen[1]!.env.SESSION_SECRET)
      // and sandbox is a different app as far as secrets are concerned (§11)
      await deployRelease(db, recording, config, deployDeps, {
        releaseId: release.id,
        environmentId: byKind.sandbox!.id,
      })
      expect(seen[2]!.env.SESSION_SECRET).not.toBe(seen[0]!.env.SESSION_SECRET)
    })
  })

  /**
   * §12 STORES service credentials; P3 derived them by HMAC in the driver.
   *
   * The driver cannot read them — §5 keeps `runtime/` free of `db/` — so
   * `deployRelease` resolves them and puts them on the binding. This asserts
   * that the value the driver receives is the value the STORE holds, not one
   * re-derived on the way past: "the test constructs the value correctly and
   * the running system re-derives it wrongly" is the single most expensive
   * defect shape measured in this repository.
   */
  it('passes the STORED service credentials to the driver', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const keys = await generateMasterKeypair()
      const driver = createFakeDriver()
      const bindings: ServiceBinding[] = []
      const recording: Driver = {
        ...driver,
        ensureService: (binding) => {
          bindings.push(binding)
          return driver.ensureService(binding)
        },
      }
      const build = await startBuild(db, recording, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED_WITH_SERVICE,
      })
      // BOTH resolvers on the one keypair, as `src/index.ts` binds them: a deploy reads
      // the app's whole secret set to build its event redactor (P4b Task 15), and a
      // service password sealed under a second master key is a set nothing can open.
      const deps = {
        ...deployDeps,
        secrets: createServiceCredentials(keys, config.masterSecret),
        appSecrets: createAppSecrets(keys),
      }
      await deployRelease(db, recording, config, deps, {
        releaseId: release.id,
        environmentId: byKind.staging!.id,
      })

      expect(bindings).toHaveLength(1)
      const stored = await getSecret(
        db,
        {
          projectId: project.id,
          environmentKind: 'staging',
          name: 'service:chem-labs-staging-db:password',
        },
        keys,
      )
      expect(stored).toBeDefined()
      expect(bindings[0]!.credentials.password).toBe(stored)
    })
  })

  // An app is untrusted input (§12). A declared env var must not be able to point
  // the app at a database of its own choosing while looking bound to the platform's.
  it('does not let an app-declared variable shadow the platform binding', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const seen: InstanceSpec[] = []
      const recording: Driver = {
        ...driver,
        ensureInstance: (spec) => {
          seen.push(spec)
          return driver.ensureInstance(spec)
        },
      }
      const build = await startBuild(db, recording, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const hostile = {
        sandbox: {
          ...withService('sandbox'),
          env: [{ name: 'MONGODB_URI', value: 'mongodb://attacker/' }],
        },
        staging: {
          ...withService('staging'),
          env: [{ name: 'MONGODB_URI', value: 'mongodb://attacker/' }],
        },
        production: withService('production'),
      }
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: hostile,
      })
      await deployRelease(db, recording, config, deployDeps, {
        releaseId: release.id,
        environmentId: byKind.staging!.id,
      })
      expect(seen.at(-1)!.env.MONGODB_URI).not.toContain('attacker')
    })
  })

  /**
   * THE PORT IS A PLATFORM BINDING, and nothing injected it.
   *
   * The platform picks the port — the container HEALTHCHECK probes it and the
   * Caddy route uses it as the upstream — and the app was never told. An app that
   * did not happen to hardcode the blueprint's `default_port` listened somewhere
   * else and was permanently unreachable behind a 502. Measured by `make demo` on
   * 2026-09-07 with a manifest declaring `runtime.port: 8080`: the app logged
   * `"port":3000` and the deploy timed out.
   */
  it('injects PORT and the instance identity, and an app cannot shadow them', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const seen: InstanceSpec[] = []
      const recording: Driver = {
        ...driver,
        ensureInstance: (spec) => {
          seen.push(spec)
          return driver.ensureInstance(spec)
        },
      }
      const build = await startBuild(db, recording, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      // The app declares its own PORT and MANIFEST_ENV. Neither may win: one
      // breaks routing, the other lies about where the app is running.
      const hostile = {
        name: 'chem-labs',
        env: [
          { name: 'PORT', value: '1' },
          { name: 'MANIFEST_ENV', value: 'production' },
        ],
      }
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: {
          sandbox: { ...RESOLVED.sandbox, ...hostile },
          staging: { ...RESOLVED.staging, ...hostile },
          production: { ...RESOLVED.production, ...hostile },
        },
      })
      await deployRelease(db, recording, config, deployDeps, {
        releaseId: release.id,
        environmentId: byKind.staging!.id,
      })
      const spec = seen.at(-1)!
      // The port the app is TOLD and the port the platform ROUTES to are the same
      // number. That equality is the property; either alone proves nothing.
      expect(spec.env.PORT).toBe(String(spec.port))
      expect(spec.env.PORT).not.toBe('1')
      expect(spec.env.MANIFEST_ENV).toBe('staging')
      expect(spec.env.MANIFEST_PROJECT_SLUG).toBe('chem-labs')
      expect(spec.env.MANIFEST_APP_URL).toBe(`https://${byKind.staging!.hostname}`)
    })
  })

  // §13: "Promotion never rebuilds. Production runs the exact digest that staging ran."
  it('never rebuilds when the same release is deployed a second time', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED,
      })

      const buildSpy = vi.spyOn(driver, 'buildImage')
      await deployRelease(db, driver, config, deployDeps, {
        releaseId: release.id,
        environmentId: byKind.staging!.id,
      })
      await deployRelease(db, driver, config, deployDeps, {
        releaseId: release.id,
        environmentId: byKind.sandbox!.id,
      })
      expect(buildSpy).not.toHaveBeenCalled()
    })
  })

  it('refuses production, naming the LaunchReadiness items that do not exist yet', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED,
      })
      await expect(
        deployRelease(db, driver, config, deployDeps, {
          releaseId: release.id,
          environmentId: byKind.production!.id,
        }),
      ).rejects.toMatchObject({ code: 'RELEASE_PRODUCTION_GATE_UNAVAILABLE' })
    })
  })

  // §13: laptop-built images live in `local/` and a remote-target driver must refuse
  // them. The rule is scoped to the DRIVER, not the environment kind, which is what
  // lets a laptop's own staging environment run a local image at all.
  it('refuses a local/ image on a driver that declares a remote target', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver({ capabilities: { remoteTarget: true } })
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED,
      })
      await expect(
        deployRelease(db, driver, config, deployDeps, {
          releaseId: release.id,
          environmentId: byKind.staging!.id,
        }),
      ).rejects.toMatchObject({ code: 'RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER' })
    })
  })
})

// The health wait, both ways. `deployRelease` used to record whatever the first
// status() call said, which parks a real driver's instance in `starting` — a state
// nothing in P2 moves it out of. These pin the wait and its deadline.
describe('waiting for health', () => {
  /** Reports healthy only from the nth status() call onward. */
  function healthyOnCall(n: number) {
    const driver = createFakeDriver()
    let calls = 0
    vi.spyOn(driver, 'status').mockImplementation(async (id: string) => {
      calls += 1
      const healthy = calls >= n
      return {
        id,
        state: healthy ? ('healthy' as const) : ('starting' as const),
        healthy,
      }
    })
    return driver
  }

  async function releaseFor(
    db: Parameters<typeof createProject>[0],
    driver: ReturnType<typeof createFakeDriver>,
  ) {
    const { user, project, appSpec, byKind } = await fixture(db)
    const build = await startBuild(db, driver, bus, {
      projectId: project.id,
      projectSlug: project.slug,
      appSpecId: appSpec.id,
      commitSha: appSpec.commitSha,
      blueprintRef: project.blueprintRef,
      repoPath: '/tmp/chem-labs.git',
    })
    const release = await createRelease(db, {
      projectId: project.id,
      buildId: build.id,
      appSpecId: appSpec.id,
      createdBy: user.id,
      resolvedConfig: RESOLVED,
    })
    return { release, byKind }
  }

  it('keeps polling until the driver reports healthy', async () => {
    await withRollback(async (db) => {
      const driver = healthyOnCall(3)
      const { release, byKind } = await releaseFor(db, driver)
      const instance = await deployRelease(
        db,
        driver,
        config,
        deployDeps,
        { releaseId: release.id, environmentId: byKind.staging!.id },
        { timeoutMs: 2000, intervalMs: 1 },
      )
      expect(instance.state).toBe('healthy')
      expect(driver.status).toHaveBeenCalledTimes(3)
      // A healthy deploy is not an incident.
      expect(await db.select().from(incidents)).toEqual([])
    })
  })

  it('records failed — never a stuck starting — when health never passes', async () => {
    await withRollback(async (db) => {
      const driver = healthyOnCall(Number.POSITIVE_INFINITY)
      const { release, byKind } = await releaseFor(db, driver)
      const instance = await deployRelease(
        db,
        driver,
        config,
        deployDeps,
        { releaseId: release.id, environmentId: byKind.staging!.id },
        { timeoutMs: 20, intervalMs: 1 },
      )
      expect(instance.state).toBe('failed')
    })
  })

  it('records an Incident naming the health check, read through the handle the row records (§14)', async () => {
    await withRollback(async (db) => {
      const driver = healthyOnCall(Number.POSITIVE_INFINITY)
      const { release, byKind } = await releaseFor(db, driver)
      const instance = await deployRelease(
        db,
        driver,
        config,
        deployDeps,
        { releaseId: release.id, environmentId: byKind.staging!.id },
        { timeoutMs: 20, intervalMs: 1 },
      )
      const recorded = await db
        .select()
        .from(incidents)
        .where(eq(incidents.instanceId, instance.id))
      expect(recorded).toHaveLength(1)
      // "We stopped waiting", not "the driver gave up": they send a reader to
      // different places, and the other route below says the other one.
      expect(recorded[0]!.failedCheck).toBe(
        'health: GET /healthz on port 3000 — it did not report healthy within 0.02 s',
      )
      expect(recorded[0]!.exitReason).toBe(
        'the process is still running, and the platform reports it as starting',
      )
      // The fake driver's one line for this instance — which it can only have been
      // asked for by the handle the row records. §11's key gained the INSTANCE in
      // P4c, so the name carries the instance row's id too, and this asserts that
      // the running system derived it from the same four parts.
      expect(recorded[0]!.logTail).toBe(
        `starting chem-labs-staging-${release.id.slice(0, 8)}-${instance.id.slice(0, 8)}`,
      )
      expect(recorded[0]!.diffSinceHealthy).toBe(
        'This app has never been healthy in staging, so there is no working release to compare this one with.',
      )
    })
  })

  it('records a driver’s readiness REFUSAL as a failed instance with an Incident — not a throw, and not a row stuck in provisioning (§14)', async () => {
    // The Docker driver refuses an app that never answers at its hostname by THROWING,
    // with the handle. Before P4b Task 13 that throw reached the caller with the row
    // parked in `provisioning`, which nothing moves, and no record of why.
    await withRollback(async (db) => {
      const driver = createFakeDriver()
      const start = driver.ensureInstance.bind(driver)
      const check =
        'readiness: GET /healthz at https://chem-labs.staging.manifest.internal through the edge — HTTP 502 (12 attempts)'
      vi.spyOn(driver, 'ensureInstance').mockImplementation(async (spec) => {
        const handle = await start(spec)
        throw new InstanceNotReadyError(
          handle,
          check,
          'never answered 200',
          'read the log',
        )
      })
      const { release, byKind } = await releaseFor(db, driver)
      const instance = await deployRelease(
        db,
        driver,
        config,
        deployDeps,
        { releaseId: release.id, environmentId: byKind.staging!.id },
        { timeoutMs: 20, intervalMs: 1 },
      )
      expect(instance.state).toBe('failed')
      expect(instance.handle).toBe('inst-1')
      const recorded = await db
        .select()
        .from(incidents)
        .where(eq(incidents.instanceId, instance.id))
      expect(recorded.map((incident) => incident.failedCheck)).toEqual([check])
    })
  })

  it('lets any OTHER failure to start reach the caller, and records no Incident', async () => {
    // An instance the driver never created has no process and no log: the error is the
    // whole record.
    await withRollback(async (db) => {
      const driver = createFakeDriver()
      vi.spyOn(driver, 'ensureInstance').mockRejectedValue(
        new Error('the daemon refused the container'),
      )
      const { release, byKind } = await releaseFor(db, driver)
      await expect(
        deployRelease(
          db,
          driver,
          config,
          deployDeps,
          { releaseId: release.id, environmentId: byKind.staging!.id },
          { timeoutMs: 20, intervalMs: 1 },
        ),
      ).rejects.toThrow('the daemon refused the container')
      expect(await db.select().from(incidents)).toEqual([])
    })
  })

  it('redacts the app’s OWN secrets from the Incident — the SESSION_SECRET this deploy stored (§14)', async () => {
    await withRollback(async (db) => {
      const base = createFakeDriver({ failInstances: true })
      let sessionSecret = ''
      const driver = {
        ...base,
        ensureInstance: (spec: InstanceSpec) => {
          sessionSecret = spec.env.SESSION_SECRET!
          return base.ensureInstance(spec)
        },
        // An app that prints its environment as it dies — the ordinary case §14 names.
        async *logs() {
          yield {
            at: new Date(),
            stream: 'stderr' as const,
            text: `boot failed; env SESSION_SECRET=${sessionSecret}`,
          }
        },
      }
      const { release, byKind } = await releaseFor(db, driver)
      const instance = await deployRelease(
        db,
        driver,
        config,
        deployDeps,
        { releaseId: release.id, environmentId: byKind.staging!.id },
        { timeoutMs: 20, intervalMs: 1 },
      )
      // 64 hex characters, which no heuristic redacts (Task 12 excludes hex by design):
      // only the app's own secret set, read at capture, can catch it.
      expect(sessionSecret).toMatch(/^[0-9a-f]{64}$/)
      expect(makeRedactor([])(sessionSecret)).toBe(sessionSecret)
      const [incident] = await db
        .select()
        .from(incidents)
        .where(eq(incidents.instanceId, instance.id))
      expect(incident!.logTail).toBe('boot failed; env SESSION_SECRET=[REDACTED]')
      expect(JSON.stringify(incident)).not.toContain(sessionSecret)
      // The driver gave up; it did not time out — and the check says so.
      expect(incident!.failedCheck).toBe(
        'health: GET /healthz on port 3000 — the driver reported the instance as failed',
      )
    })
  })

  it('streams instance.healthy for a deploy that became healthy, with its state (P4b Task 15)', async () => {
    // Sitting 8: a deploy is a `200` whether it worked or not, so a frame about a deploy
    // must carry the STATE — never only the fact that the call returned.
    await withRollback(async (db) => {
      const driver = createFakeDriver()
      const { release, byKind } = await releaseFor(db, driver)
      let instance: Awaited<ReturnType<typeof deployRelease>> | undefined
      const frames = await streamedWhile(release.projectId, async () => {
        instance = await deployRelease(
          db,
          driver,
          config,
          deployDeps,
          { releaseId: release.id, environmentId: byKind.staging!.id },
          { timeoutMs: 2000, intervalMs: 1 },
        )
      })
      expect(eventTypes(frames)).toEqual(['instance.healthy'])
      expect(frames[0]).toMatchObject({
        subject: `instance:${instance!.id}`,
        machineDetail: {
          instanceId: instance!.id,
          releaseId: release.id,
          environment: 'staging',
          state: 'healthy',
        },
      })
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.type, 'instance.healthy'))
      expect(rows.map((r) => r.id)).toEqual([frames[0]!.id])
    })
  })

  it('streams instance.failed and then incident.opened, naming the Incident — in sentences with no exit code (P4b Task 15)', async () => {
    await withRollback(async (db) => {
      const driver = createFakeDriver({ failInstances: true })
      const { release, byKind } = await releaseFor(db, driver)
      let instance: Awaited<ReturnType<typeof deployRelease>> | undefined
      const frames = await streamedWhile(release.projectId, async () => {
        instance = await deployRelease(
          db,
          driver,
          config,
          deployDeps,
          { releaseId: release.id, environmentId: byKind.staging!.id },
          { timeoutMs: 20, intervalMs: 1 },
        )
      })
      expect(instance!.state).toBe('failed')
      expect(eventTypes(frames)).toEqual(['instance.failed', 'incident.opened'])
      const [incident] = await db
        .select()
        .from(incidents)
        .where(eq(incidents.instanceId, instance!.id))
      expect(frames[0]).toMatchObject({
        machineDetail: { instanceId: instance!.id, state: 'failed' },
      })
      // The Incident EXISTS by the time it is announced, and the frame names it — a
      // client that reacts by fetching the incidents route finds it there.
      expect(frames[1]).toMatchObject({
        subject: `incident:${incident!.id}`,
        machineDetail: { incidentId: incident!.id, instanceId: instance!.id },
      })
      for (const frame of frames) {
        if (frame.kind !== 'event') continue
        expect(frame.humanMessage).not.toMatch(/exit code|stack|health:/i)
      }
    })
  })

  it('streams nothing about an instance when the deploy never started one', async () => {
    await withRollback(async (db) => {
      const driver = createFakeDriver()
      vi.spyOn(driver, 'ensureInstance').mockRejectedValue(
        new Error('the daemon refused the container'),
      )
      const { release, byKind } = await releaseFor(db, driver)
      const frames = await streamedWhile(release.projectId, async () => {
        await expect(
          deployRelease(
            db,
            driver,
            config,
            deployDeps,
            { releaseId: release.id, environmentId: byKind.staging!.id },
            { timeoutMs: 20, intervalMs: 1 },
          ),
        ).rejects.toThrow('the daemon refused the container')
      })
      expect(frames).toEqual([])
    })
  })
})

// What the driver is actually handed. Every assertion here replaces one that was
// only ever "the call returned": the repository was derived from the project UUID
// rather than the slug, and Gi quantities reached the driver as mebibytes ~1000x
// too small, both with every other test in this file green.
describe('the InstanceSpec handed to the driver', () => {
  it('names the repository buildImage produced, and converts Gi correctly', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const built = await driver.buildImage(
        { repoPath: 'file:///tmp/chem-labs.git', commitSha: appSpec.commitSha },
        { blueprintRef: project.blueprintRef, projectSlug: project.slug },
      )

      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: {
          ...RESOLVED,
          staging: {
            ...one('staging'),
            resources: { cpu: 0.5, memory: '1Gi', pids: 256, disk: '2Gi' },
          },
        },
      })

      const spy = vi.spyOn(driver, 'ensureInstance')
      await deployRelease(db, driver, config, deployDeps, {
        releaseId: release.id,
        environmentId: byKind.staging!.id,
      })

      const spec = spy.mock.calls[0]![0]
      // The repository must be the one the build actually pushed to.
      expect(spec.image.repository).toBe(built.repository)
      expect(spec.image.repository).toBe('local/chem-labs')
      expect(spec.projectSlug).toBe('chem-labs')
      // 1Gi is 1024Mi. parseInt('1Gi') is 1.
      expect(spec.resources.memoryMi).toBe(1024)
      expect(spec.resources.diskMi).toBe(2048)
    })
  })
})

/**
 * P4a Task 9. `registerServiceProvider` shipped in Task 7 with tests and NO
 * PRODUCTION CALLER, which is the shape this project has now shipped four times —
 * `isSensitiveDiff` waited a whole plan, `waitForReady` and `edgeProbe` shipped in
 * P3 Task 14 and nothing called them until Task 17, and the Docker driver itself
 * was never wired into boot. This block is the caller, and the ordering assertion
 * is the part that cannot be replaced by a grep.
 */
describe('deployRelease sets up sign-on before the app starts (§9, Task 9)', () => {
  /** A recording SsoRegistrar. Returns the shape `registerServiceProvider` returns. */
  const recordingSso = (order: string[], seen: SpRegistrationInput[] = []) => ({
    seen,
    registerServiceProvider: async (_db: unknown, input: SpRegistrationInput) => {
      order.push('sp')
      seen.push(input)
      return {
        entity: {
          entityId: `https://manifest.internal/sp/${input.slug}/${input.environmentKind}`,
          acsUrl: `https://${input.hostname}${input.auth.callback}`,
          sloUrl: `https://${input.hostname}${input.auth.logout}`,
          attributes: [...input.auth.attributes],
        },
        keypair: {
          privateKeyPem: '',
          certificatePem: '',
          certData: '',
          fingerprint: '',
          expiresAt: new Date(),
        },
        changed: true,
      }
    },
    // A recognisable PEM rather than an empty string: `deployRelease` places
    // this in the container at §8's SAML_IDP_CERT_PATH, and a test that let ''
    // through would prove the file was written and not that anything was in it.
    idpSigningCertificate: async () => {
      order.push('idp-cert')
      return '-----BEGIN CERTIFICATE-----\nRECORDER\n-----END CERTIFICATE-----\n'
    },
  })

  it('registers the SP BEFORE the instance starts', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const order: string[] = []
      const driver = createFakeDriver()
      const spy = vi
        .spyOn(driver, 'ensureInstance')
        .mockImplementation(async (...args) => {
          order.push('instance')
          return (
            createFakeDriver().ensureInstance as unknown as typeof driver.ensureInstance
          )(...args)
        })
      const sso = recordingSso(order)
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED_WITH_CWL,
      })

      await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, sso },
        { releaseId: release.id, environmentId: byKind.staging!.id },
      )

      // Not "both happened" — the ORDER. An app that redirects to the IdP before
      // the row exists gets "Metadata not found" on its first login, which is a
      // race nobody reproduces on demand.
      expect(order).toEqual(['sp', 'idp-cert', 'instance'])
      expect(spy).toHaveBeenCalledOnce()
    })
  })

  it('hands the registrar the values the PLATFORM owns, not the app', async () => {
    // §9: "Origins are never accepted as input." The hostname comes from the
    // environment row and the slug from it — never from the manifest — so this
    // asserts the shape of what was passed as well as that it was passed.
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const order: string[] = []
      const sso = recordingSso(order)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED_WITH_CWL,
      })

      await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, sso },
        { releaseId: release.id, environmentId: byKind.staging!.id },
      )

      expect(sso.seen).toHaveLength(1)
      expect(sso.seen[0]).toMatchObject({
        projectId: project.id,
        slug: 'chem-labs',
        environmentKind: 'staging',
        hostname: byKind.staging!.hostname,
        auth: {
          provider: 'cwl',
          callback: '/auth/ubcshib/callback',
          attributes: ['ubcEduCwlPuid', 'mail'],
        },
      })
    })
  })

  it('does not register an SP for an app that declares auth.provider: none', async () => {
    // fixture-node is such an app, and P3's whole Docker tier deploys it. An
    // unconditional registration would put a useless row in the IdP for every app
    // on the platform — and would make Task 7's empty-attributes refusal fire on a
    // spec that is perfectly valid, because `auth.attributes` defaults to [] when
    // the provider is `none` (spec/schema.ts).
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const order: string[] = []
      const sso = recordingSso(order)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: RESOLVED,
      })

      const instance = await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, sso },
        { releaseId: release.id, environmentId: byKind.staging!.id },
      )

      expect(sso.seen).toEqual([])
      expect(order).toEqual([])
      // And it still DEPLOYED. "No SP was registered" would also be true of a
      // deploy that threw on the line before, so the outcome is asserted too.
      expect(instance.state).toBe('healthy')
    })
  })

  it('does not register an SP for a release frozen before auth was resolved', async () => {
    // §13 freezes the resolved config at release time, so a release created before
    // `ResolvedConfig.auth` existed has no `auth` key at all. Reading `.provider`
    // off undefined would throw and take an existing developer's deploy with it;
    // treating it as "no SSO" is what those releases were actually deployed with.
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const order: string[] = []
      const sso = recordingSso(order)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      const legacy = {
        sandbox: { ...one('sandbox'), auth: undefined },
        staging: { ...one('staging'), auth: undefined },
        production: { ...one('production'), auth: undefined },
      } as unknown as typeof RESOLVED
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec.id,
        createdBy: user.id,
        resolvedConfig: legacy,
      })

      await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, sso },
        { releaseId: release.id, environmentId: byKind.staging!.id },
      )
      expect(sso.seen).toEqual([])
    })
  })
})

/** `one(kind)` for an app that declares models, with a budget LiteLLM will honour. */
const withAi = (
  kind: 'sandbox' | 'staging' | 'production',
  models: string[] = ['default-chat', 'default-embed'],
  projectMonthlyUsd = 25,
) => ({
  ...one(kind),
  ai: {
    models,
    budget: { project_monthly_usd: projectMonthlyUsd, per_user_monthly_usd: 1 },
  },
})
const aiRelease = (models?: string[], projectMonthlyUsd?: number): ResolvedConfigSet => ({
  sandbox: withAi('sandbox', models, projectMonthlyUsd),
  staging: withAi('staging', models, projectMonthlyUsd),
  production: withAi('production', models, projectMonthlyUsd),
})

/**
 * §10's key at deploy (P4b Task 9) — and Rich's decision of 2026-09-14 that no live AI
 * call may fail because a deploy revoked its key. So the ORDER is the assertion: the
 * key service and the driver below write into ONE list, and every test reads it back.
 */
describe('deployRelease and §10’s app key (P4b Task 9)', () => {
  function recordingAi(
    events: string[],
    fail: { discard?: boolean; revoke?: boolean } = {},
  ): { service: AiKeyService; minted: MintAppKeyInput[] } {
    const minted: MintAppKeyInput[] = []
    let n = 0
    return {
      minted,
      service: {
        enabled: true,
        mintAppKey: async (input) => {
          minted.push(input)
          events.push('mint')
          return `sk-minted-${++n}`
        },
        discardAppKey: async (key) => {
          events.push(`discard ${key}`)
          if (fail.discard) throw new Error('the gateway is down')
        },
        // P4c Task 6. Recorded into the same list, so the order stays the assertion.
        storeInstanceKey: async (_db, input) => {
          events.push(`store ${input.key}`)
        },
        revokeInstanceKey: async (_db, input) => {
          events.push(`revoke instance ${input.instanceId}`)
          if (fail.revoke) throw new Error('the gateway is down')
          return true
        },
        revokeLegacyAppKey: async () => {
          events.push('revoke legacy')
          return true
        },
      },
    }
  }

  /** The driver, recording `instance` and every health read into the same list. */
  function recordingDriver(events: string[], base: Driver = createFakeDriver()) {
    const seen: InstanceSpec[] = []
    const driver: Driver = {
      ...base,
      ensureInstance: (spec) => {
        events.push('instance')
        seen.push(spec)
        return base.ensureInstance(spec)
      },
      status: async (id) => {
        const status = await base.status(id)
        events.push(`health ${status.healthy ? 'passed' : 'failed'}`)
        return status
      },
    }
    return { driver, seen }
  }

  async function releaseWith(
    db: Parameters<typeof createProject>[0],
    driver: Driver,
    resolvedConfig: ResolvedConfigSet,
  ) {
    const { user, project, appSpec, byKind } = await fixture(db)
    const build = await startBuild(db, driver, bus, {
      projectId: project.id,
      projectSlug: project.slug,
      appSpecId: appSpec.id,
      commitSha: appSpec.commitSha,
      blueprintRef: project.blueprintRef,
      repoPath: '/tmp/chem-labs.git',
    })
    const release = await createRelease(db, {
      projectId: project.id,
      buildId: build.id,
      appSpecId: appSpec.id,
      createdBy: user.id,
      resolvedConfig,
    })
    return { release, project, staging: byKind.staging! }
  }

  it('mints BEFORE the instance starts, injects what it minted, and records it against THIS instance (P4c)', async () => {
    await withRollback(async (db) => {
      const events: string[] = []
      const { driver, seen } = recordingDriver(events)
      const ai = recordingAi(events)
      const { release, project, staging } = await releaseWith(db, driver, aiRelease())
      const instance = await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, ai: ai.service },
        { releaseId: release.id, environmentId: staging.id },
      )
      expect(instance.state).toBe('healthy')
      // P4c Task 8 deleted the commit: the key is recorded against the instance at the
      // mint, and revoked when THAT instance is retired, after its drain.
      expect(events).toEqual(['mint', 'store sk-minted-1', 'instance', 'health passed'])
      // Not "a key was minted" — the key the CONTAINER received. Every one of P3
      // Session 5's seven defects was a value correct in the test and wrong in the
      // running system, because the test handed the driver what it built.
      const spec = seen.at(-1)!
      expect(spec.env.LLM_API_KEY).toBe('sk-minted-1')
      expect(spec.needsAiGateway).toBe(true)
      // What was minted: the release's frozen models and budget, never the manifest's.
      expect(ai.minted).toEqual([
        {
          projectId: project.id,
          projectSlug: 'chem-labs',
          kind: 'staging',
          models: ['default-chat', 'default-embed'],
          monthlyUsd: 25,
        },
      ])
    })
  })

  it('a redeploy leaves the REPLACED instance’s key alone — its retire revokes it, after the drain (P4c)', async () => {
    // LiteLLM checks a key when a request STARTS (measured 2026-09-14), so a key revoked
    // at promotion fails the next AI call that a question already on the old instance
    // makes. `make demo-redeploy` cannot see it: its question has made both of its
    // calls before any deploy returns, and it stayed 23 of 23 green with the revoke
    // moved here (P4c Task 11, control c). No other test could either — this ORDER can.
    await withRollback(async (db) => {
      const events: string[] = []
      const { driver } = recordingDriver(events)
      const ai = recordingAi(events)
      const { release, staging } = await releaseWith(db, driver, aiRelease())
      const deploy = () =>
        deployRelease(
          db,
          driver,
          config,
          { ...deployDeps, ai: ai.service },
          { releaseId: release.id, environmentId: staging.id },
        )
      const first = await deploy()
      const second = await deploy()
      expect(second.state).toBe('healthy')
      expect(events).not.toContain(`revoke instance ${first.id}`)
      expect(events).toEqual([
        'mint',
        'store sk-minted-1',
        'instance',
        'health passed',
        'mint',
        'store sk-minted-2',
        'instance',
        'health passed',
      ])
    })
  })

  it('gives the app the IN-NETWORK endpoint, and each model by the KIND the catalogue gives it', async () => {
    await withRollback(async (db) => {
      const events: string[] = []
      const { driver, seen } = recordingDriver(events)
      // Declared EMBEDDING FIRST, so a reader that took the first declared model as
      // the chat model would inject `default-embed` as LLM_DEFAULT_MODEL. `kind` has
      // had no reader until this task (P4b finding 46).
      const { release, staging } = await releaseWith(
        db,
        driver,
        aiRelease(['default-embed', 'default-chat']),
      )
      await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, ai: recordingAi(events).service },
        { releaseId: release.id, environmentId: staging.id },
      )
      const env = seen.at(-1)!.env
      // The pair that is not interchangeable and fails silently when swapped: an app
      // handed http://127.0.0.1:7106 gets ECONNREFUSED from inside its own
      // `--internal` network, and the symptom is "the AI is down".
      expect(env.LLM_ENDPOINT).toBe(config.litellm.internalUrl)
      expect(env.LLM_ENDPOINT).not.toBe(config.litellm.url)
      expect(env.LLM_ENDPOINT).not.toContain('127.0.0.1')
      expect(env.LLM_PROVIDER).toBe('openai')
      expect(env.LLM_DEFAULT_MODEL).toBe('default-chat')
      expect(env.EMBEDDINGS_MODEL).toBe('default-embed')
    })
  })

  it('mints nothing, and asks for no gateway, for an app that declares no models', async () => {
    // fixture-app is such an app and P3's whole Docker tier deploys it. An
    // unconditional mint would put a LiteLLM user and a live key behind every app on
    // the platform — and Task 7 refuses an empty model list, which LiteLLM reads as
    // EVERY model.
    await withRollback(async (db) => {
      const events: string[] = []
      const { driver, seen } = recordingDriver(events)
      const ai = recordingAi(events)
      const { release, staging } = await releaseWith(db, driver, RESOLVED)
      await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, ai: ai.service },
        { releaseId: release.id, environmentId: staging.id },
      )
      expect(events).toEqual(['instance', 'health passed'])
      expect(seen.at(-1)!.needsAiGateway).toBe(false)
      expect(
        Object.keys(seen.at(-1)!.env).filter((n) => /^(LLM|EMBEDDINGS)_/.test(n)),
      ).toEqual([])
    })
  })

  it('redeploys a release frozen before ResolvedConfig.ai existed as the app with no AI it was', async () => {
    // Pre-flight 64: such a release has no `ai` key at all, and reading
    // `resolved.ai.models` would be a TypeError on its redeploy.
    await withRollback(async (db) => {
      const events: string[] = []
      const { driver, seen } = recordingDriver(events)
      const legacy = Object.fromEntries(
        (['sandbox', 'staging', 'production'] as const).map((kind) => {
          const { ai: _dropped, ...frozen } = one(kind)
          return [kind, frozen]
        }),
      ) as unknown as ResolvedConfigSet
      const { release, staging } = await releaseWith(db, driver, legacy)
      const instance = await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, ai: recordingAi(events).service },
        { releaseId: release.id, environmentId: staging.id },
      )
      expect(instance.state).toBe('healthy')
      expect(events).toEqual(['instance', 'health passed'])
      expect(seen.at(-1)!.needsAiGateway).toBe(false)
    })
  })

  it('REVOKES this instance’s key, after its Incident, when it never becomes healthy', async () => {
    // Every other instance keeps the key it was given: the revoke names this instance,
    // not the app. And it comes last, after the Incident has read the container's log
    // through its handle — P4c moved it there from before the row was even updated.
    await withRollback(async (db) => {
      const events: string[] = []
      const { driver } = recordingDriver(
        events,
        createFakeDriver({ failInstances: true }),
      )
      const { release, staging } = await releaseWith(db, driver, aiRelease())
      const instance = await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, ai: recordingAi(events).service },
        { releaseId: release.id, environmentId: staging.id },
      )
      expect(instance.state).toBe('failed')
      // The second health read is the Incident's (P4b Task 13); the revoke is after it.
      expect(events).toEqual([
        'mint',
        'store sk-minted-1',
        'instance',
        'health failed',
        'health failed',
        `revoke instance ${instance.id}`,
      ])
    })
  })

  it('revokes the key when the driver REFUSES the instance as not ready — a recorded failure, not a throw', async () => {
    // The Docker driver's refusal is caught and recorded (P4b Task 13), so it no longer
    // passes through the `catch` that discarded on a throw. The key must still go.
    await withRollback(async (db) => {
      const events: string[] = []
      // `failInstances`: a refused instance reports `failed`, which is what the
      // Incident's status read records below.
      const base = createFakeDriver({ failInstances: true })
      const start = base.ensureInstance.bind(base)
      vi.spyOn(base, 'ensureInstance').mockImplementation(async (spec) => {
        const handle = await start(spec)
        throw new InstanceNotReadyError(handle, 'readiness: GET /healthz', 'never', 'log')
      })
      const { driver } = recordingDriver(events, base)
      const { release, staging } = await releaseWith(db, driver, aiRelease())
      const instance = await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, ai: recordingAi(events).service },
        { releaseId: release.id, environmentId: staging.id },
      )
      expect(instance.state).toBe('failed')
      // No health read at all before the Incident's — the driver refused first.
      expect(events).toEqual([
        'mint',
        'store sk-minted-1',
        'instance',
        'health failed',
        `revoke instance ${instance.id}`,
      ])
    })
  })

  it('revokes the key when the instance cannot be started, and rethrows THAT error', async () => {
    await withRollback(async (db) => {
      const events: string[] = []
      const base = createFakeDriver()
      vi.spyOn(base, 'ensureInstance').mockRejectedValue(
        new Error('the daemon refused the container'),
      )
      const { driver } = recordingDriver(events, base)
      const { release, staging } = await releaseWith(db, driver, aiRelease())
      await expect(
        deployRelease(
          db,
          driver,
          config,
          { ...deployDeps, ai: recordingAi(events).service },
          { releaseId: release.id, environmentId: staging.id },
        ),
      ).rejects.toThrow('the daemon refused the container')
      // By instance id, not by value: the key is recorded, so a failed revoke leaves
      // the record for the next retire rather than losing the only reference to it.
      expect(events).toEqual([
        'mint',
        'store sk-minted-1',
        'instance',
        expect.stringMatching(/^revoke instance /),
      ])
    })
  })

  it('a revoke that fails too does not replace the deploy’s own failure — and never prints the key', async () => {
    await withRollback(async (db) => {
      const events: string[] = []
      const base = createFakeDriver()
      vi.spyOn(base, 'ensureInstance').mockRejectedValue(
        new Error('the daemon refused the container'),
      )
      const { driver } = recordingDriver(events, base)
      const { release, staging } = await releaseWith(db, driver, aiRelease())
      const operator = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        await expect(
          deployRelease(
            db,
            driver,
            config,
            { ...deployDeps, ai: recordingAi(events, { revoke: true }).service },
            { releaseId: release.id, environmentId: staging.id },
          ),
        ).rejects.toThrow('the daemon refused the container')
        const printed = operator.mock.calls.map((call) => String(call[0])).join('\n')
        expect(printed).toContain('could not be revoked')
        expect(printed).not.toContain('sk-minted-1')
      } finally {
        operator.mockRestore()
      }
    })
  })

  it('streams ai.key_rotated once the ROUTE HAS MOVED — and neither the row nor the frame carries the key (P4b Task 15)', async () => {
    // An audit record of a credential change is worth having; the credential is not.
    // The recording key service stores nothing, so the redactor cannot rescue a key
    // that reaches this event: only not putting it there can.
    await withRollback(async (db) => {
      const calls: string[] = []
      const { driver } = recordingDriver(calls)
      const ai = recordingAi(calls)
      const { release, project, staging } = await releaseWith(db, driver, aiRelease())
      const frames = await streamedWhile(project.id, () =>
        deployRelease(
          db,
          driver,
          config,
          { ...deployDeps, ai: ai.service },
          { releaseId: release.id, environmentId: staging.id },
        ),
      )
      expect(eventTypes(frames)).toEqual(['instance.healthy', 'ai.key_rotated'])
      const rotated = await db
        .select()
        .from(events)
        .where(eq(events.type, 'ai.key_rotated'))
      expect(rotated).toHaveLength(1)
      expect(rotated[0]!.machineDetail).toMatchObject({
        environment: 'staging',
        models: ['default-chat', 'default-embed'],
      })
      expect(JSON.stringify(rotated)).not.toContain('sk-minted')
      expect(JSON.stringify(frames)).not.toContain('sk-minted')
      // And nothing was REDACTED out of it either. The redactor holds the committed key,
      // so a key put into this event would come out as `[REDACTED]` and pass the two
      // lines above — which would make them a test of the redactor, not of the event.
      // Nothing this event legitimately carries is secret.
      expect(JSON.stringify(rotated)).not.toContain('[REDACTED]')
    })
  })

  it('streams no ai.key_rotated when the instance failed, or when the key could not be recorded', async () => {
    // A key whose instance never served never became the app's key. And a key the
    // platform could not record is discarded by value before the container exists, so
    // there is no instance to rotate anything for.
    await withRollback(async (db) => {
      const calls: string[] = []
      const { driver } = recordingDriver(calls, createFakeDriver({ failInstances: true }))
      const { release, project, staging } = await releaseWith(db, driver, aiRelease())
      const frames = await streamedWhile(project.id, () =>
        deployRelease(
          db,
          driver,
          config,
          { ...deployDeps, ai: recordingAi(calls).service },
          { releaseId: release.id, environmentId: staging.id },
        ),
      )
      expect(calls).toContain(`store sk-minted-1`)
      expect(calls.some((c) => c.startsWith('revoke instance '))).toBe(true)
      expect(eventTypes(frames)).toEqual(['instance.failed', 'incident.opened'])
    })
    await withRollback(async (db) => {
      const calls: string[] = []
      const { driver } = recordingDriver(calls)
      const ai = recordingAi(calls)
      // A key that cannot be RECORDED: discarded by value, and nothing starts.
      ai.service.storeInstanceKey = () => Promise.reject(new Error('the store is down'))
      const { release, project, staging } = await releaseWith(db, driver, aiRelease())
      const frames = await streamedWhile(project.id, async () => {
        await expect(
          deployRelease(
            db,
            driver,
            config,
            { ...deployDeps, ai: ai.service },
            { releaseId: release.id, environmentId: staging.id },
          ),
        ).rejects.toThrow('the store is down')
      })
      expect(calls).toEqual(['mint', 'discard sk-minted-1'])
      expect(eventTypes(frames)).toEqual([])
    })
  })

  it('refuses a deploy whose app secret set cannot be opened BEFORE anything is minted or started (P4b sitting 9, finding 162)', async () => {
    // Every deploy reads the app's whole secret set, to redact what it records (Task 15).
    // A set that cannot be opened must stop the deploy while there is nothing to undo:
    // read after the instance was recorded healthy, the same failure left a minted key
    // neither committed nor discarded.
    await withRollback(async (db) => {
      const calls: string[] = []
      const { driver } = recordingDriver(calls)
      const { release, staging } = await releaseWith(db, driver, aiRelease())
      const unopenable: DeployDeps['appSecrets'] = {
        ...deployDeps.appSecrets,
        secretValues: async () => {
          throw new Error('could not unwrap the data key')
        },
      }
      await expect(
        deployRelease(
          db,
          driver,
          config,
          { ...deployDeps, appSecrets: unopenable, ai: recordingAi(calls).service },
          { releaseId: release.id, environmentId: staging.id },
        ),
      ).rejects.toThrow('could not unwrap the data key')
      expect(calls).toEqual([])
    })
  })

  it('refuses an AI release with AI switched off, naming the setting — reading EITHER half of it — before anything is minted or started', async () => {
    // Sitting 5's decision. Validation refuses such a SPEC, but a release validated
    // before the switch can still be redeployed, and there is no client to mint with.
    await withRollback(async (db) => {
      const events: string[] = []
      const { driver } = recordingDriver(events)
      const { release, staging } = await releaseWith(db, driver, aiRelease())
      const halves: { catalogue: ModelCatalogue; ai: AiKeyService }[] = [
        { catalogue: disabledCatalogue(), ai: recordingAi(events).service },
        { catalogue: declaredCatalogue(), ai: disabledAiKeyService() },
      ]
      for (const half of halves) {
        const refusal = deployRelease(
          db,
          driver,
          config,
          { ...deployDeps, ...half },
          { releaseId: release.id, environmentId: staging.id },
        )
        await expect(refusal).rejects.toBeInstanceOf(ReleaseError)
        await expect(refusal).rejects.toMatchObject({ code: 'RELEASE_AI_DISABLED' })
        await expect(refusal).rejects.toThrow(/MANIFEST_AI_ENABLED=0/)
      }
      expect(events).toEqual([])
    })
  })

  it('refuses a model the catalogue no longer offers, no longer classifies, or no longer approves for the app’s data', async () => {
    // The catalogue can move between validation and deploy. Each refusal comes before
    // the mint: a key minted for a model that is refused would be a key nobody holds.
    await withRollback(async (db) => {
      const events: string[] = []
      const { driver } = recordingDriver(events)
      const { release, staging } = await releaseWith(db, driver, aiRelease())
      const { models: offered } = await declaredCatalogue().get()
      const catalogueOf = (
        models: typeof offered,
        unclassified: string[] = [],
      ): ModelCatalogue => ({
        enabled: true,
        get: async () => ({ models: [...models], unclassified }),
      })
      const cases: [ModelCatalogue, string][] = [
        [
          catalogueOf(offered.filter((m) => m.name !== 'default-embed')),
          'RELEASE_MODEL_NOT_IN_CATALOGUE',
        ],
        [
          catalogueOf(
            offered.filter((m) => m.name !== 'default-chat'),
            ['default-chat'],
          ),
          'RELEASE_MODEL_UNCLASSIFIED',
        ],
        [
          // Approved for `internal` when validated; `public` only now. The app's data
          // is `internal`, so D17 refuses it here as validation would have.
          catalogueOf(
            offered.map((m) =>
              m.name === 'default-chat'
                ? { ...m, maxClassification: 'public' as const }
                : m,
            ),
          ),
          'RELEASE_MODEL_CLASSIFICATION_TOO_LOW',
        ],
      ]
      for (const [catalogue, code] of cases) {
        await expect(
          deployRelease(
            db,
            driver,
            config,
            { ...deployDeps, ai: recordingAi(events).service, catalogue },
            { releaseId: release.id, environmentId: staging.id },
          ),
        ).rejects.toMatchObject({ code })
      }
      expect(events).toEqual([])
    })
  })

  it('refuses a release whose project budget would refuse every request, before minting', async () => {
    await withRollback(async (db) => {
      const events: string[] = []
      const { driver } = recordingDriver(events)
      const { release, staging } = await releaseWith(db, driver, aiRelease(undefined, 0))
      await expect(
        deployRelease(
          db,
          driver,
          config,
          { ...deployDeps, ai: recordingAi(events).service },
          { releaseId: release.id, environmentId: staging.id },
        ),
      ).rejects.toMatchObject({ code: 'RELEASE_AI_BUDGET_MISSING' })
      expect(events).toEqual([])
    })
  })
})

/**
 * A DEPLOY THAT REPLACES AN INSTANCE WITHOUT INTERRUPTING IT (P4c Task 8).
 *
 * This is the task that gives Tasks 5, 6 and 7 their caller. Everything under test
 * here is an ORDER or a RECORD: the new instance starts beside the one serving and the
 * route moves only after health; the platform writes down which instance serves; the
 * environment is serialized so two deploys cannot both think they won; and a deploy
 * that fails leaves the app up and takes its own container — and its files volume,
 * which holds the app's SP private key — with it (R5).
 */
describe('deployRelease replaces an instance without interrupting it (P4c Task 8)', () => {
  /** A key service recording into the caller's list, so the order is the assertion. */
  function recordingAi(events: string[], fail: { store?: boolean } = {}): AiKeyService {
    let n = 0
    return {
      enabled: true,
      mintAppKey: async () => {
        events.push('mint')
        return `sk-minted-${++n}`
      },
      discardAppKey: async (key) => {
        events.push(`discard ${key}`)
      },
      storeInstanceKey: async (_db, input) => {
        events.push(`store ${input.key} for ${input.instanceId}`)
        if (fail.store === true) throw new Error('the secret store is down')
      },
      revokeInstanceKey: async (_db, input) => {
        events.push(`revoke key of ${input.instanceId}`)
        return true
      },
      revokeLegacyAppKey: async () => {
        events.push('revoke legacy')
        return true
      },
    }
  }

  /** Records what a retire was asked for; the pass itself is Task 7's, tested there. */
  function recordingRetirer(scheduled: string[]) {
    return { schedule: (environmentId: string) => void scheduled.push(environmentId) }
  }

  async function releaseFor(
    db: Parameters<typeof createProject>[0],
    driver: Driver,
    resolvedConfig: ResolvedConfigSet = RESOLVED,
  ) {
    const { user, project, appSpec, byKind } = await fixture(db)
    const build = await startBuild(db, driver, bus, {
      projectId: project.id,
      projectSlug: project.slug,
      appSpecId: appSpec.id,
      commitSha: appSpec.commitSha,
      blueprintRef: project.blueprintRef,
      repoPath: '/tmp/chem-labs.git',
    })
    const release = await createRelease(db, {
      projectId: project.id,
      buildId: build.id,
      appSpecId: appSpec.id,
      createdBy: user.id,
      resolvedConfig,
    })
    return { release, project, staging: byKind.staging!, byKind }
  }

  it('starts the new instance BESIDE the one serving, and only then makes it serve', async () => {
    // THE WHOLE POINT OF P4c, from the driver's own point of view. What the brief
    // measured before it: the same release redeployed DELETED the live container and
    // the hostname answered 502 for about a second.
    await withRollback(async (db) => {
      const base = createFakeDriver()
      const atEnsure: { serving: string | undefined; running: number }[] = []
      const driver: Driver = {
        ...base,
        ensureInstance: async (spec) => {
          atEnsure.push({
            serving: await base.servingInstance(spec.hostname),
            running: (await base.listInstances(spec.hostname)).length,
          })
          return base.ensureInstance(spec)
        },
      }
      const { release, staging } = await releaseFor(db, driver)
      const deploy = () =>
        deployRelease(db, driver, config, deployDeps, {
          releaseId: release.id,
          environmentId: staging.id,
        })
      const first = await deploy()
      const second = await deploy()

      expect(first.handle).not.toBe(second.handle)
      // At the moment the SECOND instance was asked for, the first was still running
      // and was still what the hostname reached.
      expect(atEnsure[1]).toEqual({ serving: first.handle, running: 1 })
      // And afterwards both exist — nothing here retires anything; that is scheduled.
      expect(await driver.servingInstance(staging.hostname)).toBe(second.handle)
      expect((await driver.listInstances(staging.hostname)).sort()).toEqual(
        [first.handle!, second.handle!].sort(),
      )
    })
  })

  it('records which instance serves, in §6’s Route row, and moves that row on a redeploy', async () => {
    await withRollback(async (db) => {
      const driver = createFakeDriver()
      const { release, staging } = await releaseFor(db, driver)
      const deploy = () =>
        deployRelease(db, driver, config, deployDeps, {
          releaseId: release.id,
          environmentId: staging.id,
        })
      const first = await deploy()
      const afterFirst = await db
        .select()
        .from(routes)
        .where(eq(routes.hostname, staging.hostname))
      expect(afterFirst).toHaveLength(1)
      expect(afterFirst[0]).toMatchObject({
        instanceId: first.id,
        hostname: staging.hostname,
        // §23: staging is not public, so the route belongs on the internal listener.
        listener: 'internal',
        kind: 'canonical',
      })

      const second = await deploy()
      const afterSecond = await db
        .select()
        .from(routes)
        .where(eq(routes.hostname, staging.hostname))
      // UPSERT, not a second row: one hostname reaches one instance.
      expect(afterSecond).toHaveLength(1)
      expect(afterSecond[0]!.instanceId).toBe(second.id)
      expect(afterSecond[0]!.id).toBe(afterFirst[0]!.id)
    })
  })

  it('marks every other instance of the environment destroying, and schedules the retire', async () => {
    await withRollback(async (db) => {
      const driver = createFakeDriver()
      const scheduled: string[] = []
      const { release, staging } = await releaseFor(db, driver)
      const deploy = () =>
        deployRelease(
          db,
          driver,
          config,
          { ...deployDeps, retirer: recordingRetirer(scheduled) },
          { releaseId: release.id, environmentId: staging.id },
        )
      const first = await deploy()
      expect(scheduled).toEqual([staging.id])
      const second = await deploy()

      const state = async (id: string) =>
        (await db.select().from(instances).where(eq(instances.id, id)))[0]!.state
      // The ROWS are how a console sees what is happening; the CONTAINERS are what
      // the retirer actually reads (Decision 17).
      expect(await state(first.id)).toBe('destroying')
      expect(await state(second.id)).toBe('healthy')
      expect(scheduled).toEqual([staging.id, staging.id])
    })
  })

  it('schedules no retire, and marks nothing, when the deploy failed', async () => {
    await withRollback(async (db) => {
      const driver = createFakeDriver({ failInstances: true })
      const scheduled: string[] = []
      const { release, staging } = await releaseFor(db, driver)
      const instance = await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, retirer: recordingRetirer(scheduled) },
        { releaseId: release.id, environmentId: staging.id },
      )
      expect(instance.state).toBe('failed')
      expect(scheduled).toEqual([])
      expect(
        await db.select().from(routes).where(eq(routes.hostname, staging.hostname)),
      ).toEqual([])
    })
  })

  it('holds the environment’s lock from the instance row to the Route row — and only THAT environment’s', async () => {
    /**
     * THE CONTROL THAT DISCRIMINATES, and the plan's own did not.
     *
     * The plan's (a) — take `withEnvironmentLock` off and watch the concurrent-deploy
     * test fail — was measured on 2026-09-15 and came out GREEN: 58 of 58 passed with
     * the lock replaced by a bare IIFE. Two `deployRelease` calls against the fake
     * driver stay in lockstep through the same awaits, so each one's Route row lands
     * after its own `ensureInstance` and the row and the edge agree either way. It is
     * sitting 5's finding 37 again, one task later.
     *
     * What the lock actually buys is the WINDOW: from the instance row to the Route
     * row, nothing else may change what this environment serves. So this holds a
     * deploy open at its `ensureInstance` and asks a second holder to come in.
     */
    await withRollback(async (db) => {
      const base = createFakeDriver()
      let started = false
      let release = (): void => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const driver: Driver = {
        ...base,
        ensureInstance: async (spec) => {
          started = true
          await held
          return base.ensureInstance(spec)
        },
      }
      const { release: pending, staging, byKind } = await releaseFor(db, driver)
      const deploying = deployRelease(db, driver, config, deployDeps, {
        releaseId: pending.id,
        environmentId: staging.id,
      })
      while (!started) await new Promise((r) => setTimeout(r, 5))

      let entered = false
      const second = withEnvironmentLock(staging.id, async () => {
        entered = true
      })
      await new Promise((r) => setTimeout(r, 200))
      expect(entered, 'a second holder got in while a deploy was mid-flight').toBe(false)

      // PER ENVIRONMENT, not global: staging's deploy must not stop sandbox's. A lock
      // keyed on anything coarser would serialize the whole platform.
      let sandbox = false
      await withEnvironmentLock(byKind.sandbox!.id, async () => {
        sandbox = true
      })
      expect(sandbox).toBe(true)

      release()
      await deploying
      await second
      expect(entered).toBe(true)
    })
  })

  it('two deploys of one environment leave one Route row and one serving instance', async () => {
    // COMMITTED ROWS, not withRollback: two deploys in parallel are two connections,
    // and an advisory lock taken on a third is the only thing either can see. Inside
    // one transaction they would queue on the connection and the lock would prove
    // nothing. This is the OUTCOME; the test above is what goes red without the lock.
    try {
      const driver = createFakeDriver()
      const { release, staging } = await releaseFor(db, driver)
      const deploy = () =>
        deployRelease(db, driver, config, deployDeps, {
          releaseId: release.id,
          environmentId: staging.id,
        })
      const [a, b] = await Promise.all([deploy(), deploy()])

      const written = await db
        .select()
        .from(routes)
        .where(eq(routes.hostname, staging.hostname))
      expect(written).toHaveLength(1)
      // Whichever finished last is what serves, and the Route row says the same —
      // the two cannot disagree, which is what the lock buys.
      const serving = await driver.servingInstance(staging.hostname)
      const winner = [a, b].find((row) => row.handle === serving)
      expect(winner, 'the serving instance is one of the two deploys').toBeDefined()
      expect(written[0]!.instanceId).toBe(winner!.id)
      // Both are recorded healthy: neither deploy failed because of the other.
      expect([a.state, b.state]).toEqual(['healthy', 'healthy'])
    } finally {
      await resetDatabase()
    }
  })

  it('leaves the previous instance serving when the new one never becomes ready, and removes the failed one AFTER its Incident', async () => {
    await withRollback(async (db) => {
      const order: string[] = []
      const base = createFakeDriver()
      let refuse = false
      const driver: Driver = {
        ...base,
        ensureInstance: async (spec) => {
          if (!refuse) return base.ensureInstance(spec)
          // §11's readiness refusal, from the fake itself: the instance EXISTS, with a
          // log and an exit code, and the route did NOT move.
          try {
            return await base.ensureInstance({
              ...spec,
              healthPath: FAKE_NEVER_READY_PATH,
            })
          } catch (error) {
            order.push(`ensure ${(error as InstanceNotReadyError).handle.id}`)
            throw error
          }
        },
        logs: (id, opts) => {
          order.push(`incident read the log of ${id}`)
          return base.logs(id, opts)
        },
        retireInstance: async (id, opts) => {
          order.push(`retire ${id}`)
          return base.retireInstance(id, opts)
        },
      }
      const { release, staging } = await releaseFor(db, driver, aiRelease())
      const ai = recordingAi(order)
      const deploy = () =>
        deployRelease(
          db,
          driver,
          config,
          { ...deployDeps, ai, retirer: recordingRetirer([]) },
          { releaseId: release.id, environmentId: staging.id },
        )
      const first = await deploy()
      expect(first.state).toBe('healthy')
      order.length = 0
      refuse = true
      const failed = await deploy()

      expect(failed.state).toBe('failed')
      // THE ORDER IS THE ASSERTION: the Incident is read THROUGH the handle, so the
      // container cannot go first — and the key goes after the container, never before.
      expect(order).toEqual([
        'mint',
        `store sk-minted-2 for ${failed.id}`,
        `ensure ${failed.handle}`,
        `incident read the log of ${failed.handle}`,
        `retire ${failed.handle}`,
        `revoke key of ${failed.id}`,
      ])
      // §13: deploying a release never takes down the one it replaces.
      expect(await driver.servingInstance(staging.hostname)).toBe(first.handle)
      expect(await driver.listInstances(staging.hostname)).toEqual([first.handle])
      // And the Route row still names the instance that is actually serving.
      const [route] = await db
        .select()
        .from(routes)
        .where(eq(routes.hostname, staging.hostname))
      expect(route!.instanceId).toBe(first.id)
    })
  })

  it('puts the route back when the container’s own health check fails after the move', async () => {
    // Decision 18. `ensureInstance` resolves once the EDGE reaches the new instance;
    // Docker's own HEALTHCHECK runs on its own interval and can disagree a second
    // later. The previous instance is still running, so the hostname goes back to it.
    await withRollback(async (db) => {
      const base = createFakeDriver()
      const restored: string[] = []
      // The container's OWN health check, which the fake's edge knows nothing about:
      // switched on after the first deploy, so the second instance answers through the
      // edge — the route moves — and then reports itself failed.
      let sicken = false
      const driver: Driver = {
        ...base,
        status: async (id) =>
          sicken ? { id, state: 'failed', healthy: false } : base.status(id),
        restoreRoute: async (id) => {
          restored.push(id)
          return base.restoreRoute(id)
        },
      }
      const { release, staging } = await releaseFor(db, driver)
      const deploy = () =>
        deployRelease(db, driver, config, deployDeps, {
          releaseId: release.id,
          environmentId: staging.id,
        })
      const first = await deploy()
      sicken = true
      const failed = await deploy()

      expect(failed.state).toBe('failed')
      expect(restored).toEqual([first.handle])
      expect(await driver.servingInstance(staging.hostname)).toBe(first.handle)
      // The failed container is gone, and the app is still the previous instance.
      expect(await driver.listInstances(staging.hostname)).toEqual([first.handle])
    })
  })

  it('a FIRST deploy that fails after the move takes its route with it, rather than leaking the container', async () => {
    // R5: "a failed deploy leaks nothing." There is no previous instance to fall back
    // to, so the route is removed with the container — the hostname lands on the
    // edge's wildcard, which is honest. Left alone, the route dials the failed
    // instance, `retireInstance` refuses it with INSTANCE_SERVING, and the container
    // AND ITS FILES VOLUME — which holds the app's SP private key — survive (sitting
    // 5's correction 3 at the top of this task).
    await withRollback(async (db) => {
      const base = createFakeDriver()
      const retires: string[] = []
      const driver: Driver = {
        ...base,
        status: async (id) => ({ id, state: 'failed', healthy: false }),
        retireInstance: async (id, opts) => {
          retires.push(id)
          return base.retireInstance(id, opts)
        },
      }
      const { release, staging } = await releaseFor(db, driver)
      const failed = await deployRelease(db, driver, config, deployDeps, {
        releaseId: release.id,
        environmentId: staging.id,
      })

      expect(failed.state).toBe('failed')
      // NOT a retire: a retire refuses an instance a live route dials, which is exactly
      // what this one is. The route goes first, and the container with it.
      expect(retires).toEqual([])
      expect(await driver.servingInstance(staging.hostname)).toBeUndefined()
      expect(await driver.listInstances(staging.hostname)).toEqual([])
    })
  })

  it('stores the minted key against THIS instance before the container starts', async () => {
    await withRollback(async (db) => {
      const order: string[] = []
      const base = createFakeDriver()
      const driver: Driver = {
        ...base,
        ensureInstance: (spec) => {
          order.push(`ensure ${spec.instanceId}`)
          return base.ensureInstance(spec)
        },
      }
      const { release, staging } = await releaseFor(db, driver, aiRelease())
      const instance = await deployRelease(
        db,
        driver,
        config,
        { ...deployDeps, ai: recordingAi(order) },
        { releaseId: release.id, environmentId: staging.id },
      )
      expect(instance.state).toBe('healthy')
      // Stored against the instance id BEFORE the container exists, so a key never
      // reaches a container the platform cannot later revoke it for.
      expect(order).toEqual([
        'mint',
        `store sk-minted-1 for ${instance.id}`,
        `ensure ${instance.id}`,
      ])
    })
  })

  it('discards a key it could not record, rather than leaving one nothing can revoke', async () => {
    await withRollback(async (db) => {
      const order: string[] = []
      const driver = createFakeDriver()
      const { release, staging } = await releaseFor(db, driver, aiRelease())
      await expect(
        deployRelease(
          db,
          driver,
          config,
          { ...deployDeps, ai: recordingAi(order, { store: true }) },
          { releaseId: release.id, environmentId: staging.id },
        ),
      ).rejects.toThrow('the secret store is down')
      // BY VALUE, because nothing recorded it: the only reference to this key is the
      // string in this process.
      expect(order).toEqual([
        'mint',
        expect.stringContaining('store sk-minted-1'),
        'discard sk-minted-1',
      ])
    })
  })
})
