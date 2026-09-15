import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { resetDatabase, withRollback } from '../db/testing.js'
import { appSpecs, builds, instances, users } from '../db/index.js'
import { createFakeDriver } from '../runtime/index.js'
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
      commitAppKey: () => {
        throw new Error('no test in this file should commit an AI key by default')
      },
      discardAppKey: () => {
        throw new Error('no test in this file should discard an AI key by default')
      },
    },
    // infra/litellm/config.yaml through the real projection (`ai/testing.ts`).
    catalogue: declaredCatalogue(),
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
  const { project, environments } = await createProject(db, config, {
    slug: 'chem-labs',
    ownerId: user!.id,
    blueprintRef: 'fixture-node@1',
  })
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
      const build = await startBuild(db, driver, {
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
      const build = await startBuild(db, driver, {
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
      const build = await startBuild(db, driver, {
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
      const build = await startBuild(db, recording, {
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
      const build = await startBuild(db, recording, {
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
      const build = await startBuild(db, recording, {
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
      const build = await startBuild(db, recording, {
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
      const deps = {
        ...deployDeps,
        secrets: createServiceCredentials(keys, config.masterSecret),
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
      const build = await startBuild(db, recording, {
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
      const build = await startBuild(db, recording, {
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
      const build = await startBuild(db, driver, {
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
      const build = await startBuild(db, driver, {
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
      const build = await startBuild(db, driver, {
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
    const build = await startBuild(db, driver, {
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
      const build = await startBuild(db, driver, {
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
      const build = await startBuild(db, driver, {
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
      const build = await startBuild(db, driver, {
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
      const build = await startBuild(db, driver, {
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
      const build = await startBuild(db, driver, {
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
    fail: { discard?: boolean; commit?: boolean } = {},
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
        commitAppKey: async (_db, input) => {
          events.push(`commit ${input.key}`)
          if (fail.commit) throw new Error('the gateway refused the revoke')
        },
        discardAppKey: async (key) => {
          events.push(`discard ${key}`)
          if (fail.discard) throw new Error('the gateway is down')
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
    const build = await startBuild(db, driver, {
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

  it('mints BEFORE the instance starts, injects what it minted, and commits only AFTER health passes', async () => {
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
      expect(events).toEqual(['mint', 'instance', 'health passed', 'commit sk-minted-1'])
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

  it('DISCARDS the minted key, and commits nothing, when the instance never becomes healthy', async () => {
    // The stored key is still the previous one, and so is the key the previous
    // container holds — which is exactly why the new one must not be committed.
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
      expect(events).toEqual(['mint', 'instance', 'health failed', 'discard sk-minted-1'])
    })
  })

  it('discards the minted key when the instance cannot be started, and rethrows THAT error', async () => {
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
      expect(events).toEqual(['mint', 'instance', 'discard sk-minted-1'])
    })
  })

  it('a discard that fails too does not replace the deploy’s own failure — and never prints the key', async () => {
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
            { ...deployDeps, ai: recordingAi(events, { discard: true }).service },
            { releaseId: release.id, environmentId: staging.id },
          ),
        ).rejects.toThrow('the daemon refused the container')
        const printed = operator.mock.calls.map((call) => String(call[0])).join('\n')
        expect(printed).toContain('could not be discarded')
        expect(printed).not.toContain('sk-minted-1')
      } finally {
        operator.mockRestore()
      }
    })
  })

  it('a commit that fails leaves the instance recorded healthy, surfaces the failure, and discards nothing', async () => {
    // The healthy instance HOLDS the new key, so discarding it would take the app's AI
    // down to tidy up a bookkeeping failure.
    await withRollback(async (db) => {
      const events: string[] = []
      const { driver } = recordingDriver(events)
      const { release, staging } = await releaseWith(db, driver, aiRelease())
      await expect(
        deployRelease(
          db,
          driver,
          config,
          { ...deployDeps, ai: recordingAi(events, { commit: true }).service },
          { releaseId: release.id, environmentId: staging.id },
        ),
      ).rejects.toThrow('the gateway refused the revoke')
      expect(events).toEqual(['mint', 'instance', 'health passed', 'commit sk-minted-1'])
      const [row] = await db
        .select()
        .from(instances)
        .where(eq(instances.releaseId, release.id))
      // Recorded as what it is, not parked in `provisioning`, which nothing moves.
      expect(row!.state).toBe('healthy')
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
