import { describe, expect, it, vi } from 'vitest'
import { withRollback } from '../db/testing.js'
import { appSpecs, builds, users } from '../db/index.js'
import { createFakeDriver } from '../runtime/index.js'
import { createProject } from '../projects/index.js'
import { loadConfig } from '../config.js'
import { ReleaseError, createRelease, deployRelease, startBuild } from './index.js'

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
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
})

const RESOLVED = {
  sandbox: one('sandbox'),
  staging: one('staging'),
  production: one('production'),
}

async function fixture(db: Parameters<typeof createProject>[0]) {
  const [user] = await db
    .insert(users)
    .values({ ubcCwlPuid: 'o', email: 'o@ubc.ca', displayName: 'O', role: 'member' })
    .returning()
  const { project, environments } = await createProject(db, config, {
    slug: 'chem-labs', ownerId: user!.id, blueprintRef: 'fixture-node@1',
  })
  const [appSpec] = await db
    .insert(appSpecs)
    .values({
      projectId: project.id, commitSha: 'a'.repeat(40), parsed: {},
      schemaVersion: 1, valid: true,
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
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
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
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
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
          projectId: project.id, commitSha: appSpec.commitSha,
          appSpecId: appSpec.id, status: 'pending',
        })
        .returning()
      const attempt = createRelease(db, {
        projectId: project.id, buildId: pending!.id, appSpecId: appSpec.id,
        createdBy: user.id, resolvedConfig: RESOLVED,
      })
      // Both the type and the code: a bare `code` match would also accept a plain
      // Error somebody happened to hang a `code` on, which the API error envelope
      // maps to 500 rather than 409.
      await expect(attempt).rejects.toBeInstanceOf(ReleaseError)
      await expect(attempt).rejects.toMatchObject({ code: 'RELEASE_BUILD_NOT_DEPLOYABLE' })
    })
  })

  it('deploys a release to staging and reaches healthy', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, {
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id, buildId: build.id, appSpecId: appSpec.id,
        createdBy: user.id, resolvedConfig: RESOLVED,
      })
      const instance = await deployRelease(db, driver, config, {
        releaseId: release.id, environmentId: byKind.staging!.id,
      })
      expect(instance.state).toBe('healthy')
      expect(instance.handle).toBeTruthy()
    })
  })

  // §13: "Promotion never rebuilds. Production runs the exact digest that staging ran."
  it('never rebuilds when the same release is deployed a second time', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, {
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id, buildId: build.id, appSpecId: appSpec.id,
        createdBy: user.id, resolvedConfig: RESOLVED,
      })

      const buildSpy = vi.spyOn(driver, 'buildImage')
      await deployRelease(db, driver, config, {
        releaseId: release.id, environmentId: byKind.staging!.id,
      })
      await deployRelease(db, driver, config, {
        releaseId: release.id, environmentId: byKind.sandbox!.id,
      })
      expect(buildSpy).not.toHaveBeenCalled()
    })
  })

  it('refuses production, naming the LaunchReadiness items that do not exist yet', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, {
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id, buildId: build.id, appSpecId: appSpec.id,
        createdBy: user.id, resolvedConfig: RESOLVED,
      })
      await expect(
        deployRelease(db, driver, config, {
          releaseId: release.id, environmentId: byKind.production!.id,
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
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id, buildId: build.id, appSpecId: appSpec.id,
        createdBy: user.id, resolvedConfig: RESOLVED,
      })
      await expect(
        deployRelease(db, driver, config, {
          releaseId: release.id, environmentId: byKind.staging!.id,
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
      return { id, state: healthy ? ('healthy' as const) : ('starting' as const), healthy }
    })
    return driver
  }

  async function releaseFor(db: Parameters<typeof createProject>[0], driver: ReturnType<typeof createFakeDriver>) {
    const { user, project, appSpec, byKind } = await fixture(db)
    const build = await startBuild(db, driver, {
      projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
      commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
      repoUrl: 'file:///tmp/chem-labs.git',
    })
    const release = await createRelease(db, {
      projectId: project.id, buildId: build.id, appSpecId: appSpec.id,
      createdBy: user.id, resolvedConfig: RESOLVED,
    })
    return { release, byKind }
  }

  it('keeps polling until the driver reports healthy', async () => {
    await withRollback(async (db) => {
      const driver = healthyOnCall(3)
      const { release, byKind } = await releaseFor(db, driver)
      const instance = await deployRelease(
        db, driver, config,
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
        db, driver, config,
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
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
      })
      const built = await driver.buildImage(
        { repoPath: 'file:///tmp/chem-labs.git', commitSha: appSpec.commitSha },
        { blueprintRef: project.blueprintRef, projectSlug: project.slug },
      )

      const release = await createRelease(db, {
        projectId: project.id, buildId: build.id, appSpecId: appSpec.id,
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
      await deployRelease(db, driver, config, {
        releaseId: release.id, environmentId: byKind.staging!.id,
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
