import { beforeAll, describe, expect, it } from 'vitest'
import type { Driver, ImageRef, InstanceSpec, ServiceBinding } from './driver.js'
import { instanceName, serviceName } from './driver.js'

const binding = (): ServiceBinding => ({
  name: serviceName('chem-labs', 'staging', 'db'),
  type: 'mongo',
  version: '7',
  environmentId: 'env-1',
  projectSlug: 'chem-labs',
  // Resolved by the caller in production (§12 stores them; §5 keeps the driver
  // away from `db/`). The contract asserts the driver USES what it is handed —
  // a driver that derived its own would pass every test here and hand the app a
  // password its container has never accepted.
  credentials: {
    username: 'app_contract',
    password: 'contract-suite-password',
    database: 'chem_labs',
  },
})

/**
 * A reference no real registry holds. Fine for an in-memory driver, and impossible
 * for any other kind: a digest is content-addressed, so this one cannot be made to
 * exist. Measured 2026-09-06 against Docker — `failed to resolve reference
 * "docker.io/local/chem-labs@sha256:aaa…" … 401 Unauthorized`.
 */
const FICTIONAL_IMAGE: ImageRef = {
  repository: 'local/chem-labs',
  digest: 'sha256:' + 'a'.repeat(64),
}

export interface DriverContractFixtures {
  /**
   * An image the driver can actually RUN, supplied by whoever knows how to make
   * one. A driver backed by real infrastructure must be given this; an in-memory
   * one leaves it out and keeps the literal above.
   *
   * This exists because without it four of the tests below are unsatisfiable by
   * any implementation except a fake — which is the opposite of what §16 says this
   * suite is for. NOTHING BELOW IS WEAKENED BY IT: every assertion is unchanged
   * and the fake driver's run is byte-for-byte what it was. It also strengthens
   * the contract, because the Docker driver supplies an image it BUILT, so
   * "ensureInstance can run what buildImage produced" is now asserted — the seam
   * between the two halves of the interface, which nothing tested before.
   */
  runnableImage?: (driver: Driver) => Promise<ImageRef>
}

/**
 * Every Driver implementation must pass this suite unchanged (§16).
 * P3 calls it with the Docker driver; a future k8s driver calls it too.
 */
export function describeDriverContract(
  name: string,
  factory: () => Driver | Promise<Driver>,
  fixtures: DriverContractFixtures = {},
): void {
  describe(`Driver contract: ${name}`, () => {
    let image = FICTIONAL_IMAGE

    beforeAll(async () => {
      if (fixtures.runnableImage !== undefined) {
        image = await fixtures.runnableImage(await factory())
      }
    }, 600_000)

    const spec = (overrides: Partial<InstanceSpec> = {}): InstanceSpec => ({
      name: instanceName('chem-labs', 'staging', 'release-abcdef12'),
      projectSlug: 'chem-labs',
      environmentKind: 'staging',
      releaseId: 'release-abcdef12',
      image,
      env: { MANIFEST_ENV: 'staging', PORT: '3000' },
      port: 3000,
      healthPath: '/healthz',
      resources: { cpu: 0.5, memoryMi: 512, pids: 256, diskMi: 2048 },
      services: [],
      egressAllow: [],
      ...overrides,
    })

    it('produces a digest-addressed image reference', async () => {
      const driver = await factory()
      const image = await driver.buildImage(
        { repoPath: '/tmp/repo', commitSha: 'abc123' },
        { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
      )
      expect(image.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
      expect(image.repository).toContain('chem-labs')
    })

    it('builds the same source to the same digest', async () => {
      const driver = await factory()
      const args = [
        { repoPath: '/tmp/repo', commitSha: 'abc123' },
        { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
      ] as const
      const first = await driver.buildImage(...args)
      const second = await driver.buildImage(...args)
      expect(second.digest).toBe(first.digest)
    })

    it('ensureService is idempotent — the second call returns the same handle', async () => {
      const driver = await factory()
      const first = await driver.ensureService(binding())
      const second = await driver.ensureService(binding())
      expect(second.id).toBe(first.id)
    })

    it('reaches the service with the credentials it was HANDED (§12)', async () => {
      // §12 stores service credentials and §5 keeps the driver away from `db/`,
      // so the caller resolves them and the driver's only job is to use them.
      // A driver that derived its own instead would pass every other test in
      // this suite and hand the app a password its container never accepted —
      // which is P3's "the test constructs the value correctly and the running
      // system re-derives it wrongly", the most expensive shape measured here.
      const driver = await factory()
      const b = binding()
      const handle = await driver.ensureService(b)
      expect(handle.endpoint).toContain(b.credentials.username)
      expect(handle.endpoint).toContain(b.credentials.password)
      expect(handle.endpoint).toContain(b.credentials.database)
    })

    it('ensureInstance is idempotent — the second call does not create a second instance', async () => {
      const driver = await factory()
      const first = await driver.ensureInstance(spec())
      const second = await driver.ensureInstance(spec())
      expect(second.id).toBe(first.id)
    })

    it('reports a created instance as not-gone, and a destroyed one as gone', async () => {
      const driver = await factory()
      const handle = await driver.ensureInstance(spec())
      expect((await driver.status(handle.id)).state).not.toBe('gone')
      await driver.destroyInstance(handle.id)
      expect((await driver.status(handle.id)).state).toBe('gone')
    })

    it('stopInstance hibernates rather than destroys — volumes survive (§11)', async () => {
      const driver = await factory()
      const handle = await driver.ensureInstance(spec())
      await driver.stopInstance(handle.id)
      expect((await driver.status(handle.id)).state).toBe('hibernated')
      const woken = await driver.ensureInstance(spec())
      expect(woken.id).toBe(handle.id)
    })

    it('status of an unknown id is gone, never a throw', async () => {
      const driver = await factory()
      expect((await driver.status('no-such-instance')).state).toBe('gone')
    })

    it('destroying an unknown instance is a no-op, not an error', async () => {
      const driver = await factory()
      await expect(driver.destroyInstance('no-such-instance')).resolves.toBeUndefined()
    })

    it('streams logs as an async iterable', async () => {
      const driver = await factory()
      const handle = await driver.ensureInstance(spec())
      const lines = []
      for await (const line of driver.logs(handle.id, { tail: 10 })) lines.push(line)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines[0]).toHaveProperty('stream')
      expect(lines[0]).toHaveProperty('text')
    })

    it('declares its capabilities honestly and completely', async () => {
      const driver = await factory()
      const caps = driver.capabilities()
      expect(typeof caps.enforcesEgress).toBe('boolean')
      expect(['container', 'gvisor', 'vm']).toContain(caps.isolationLevel)
      expect(typeof caps.remoteTarget).toBe('boolean')
      expect(typeof caps.supportsExec).toBe('boolean')
      expect(typeof caps.supportsSnapshot).toBe('boolean')
      // S1: Docker Desktop provides no userns. Every driver must say so either
      // way — an omitted field would read as "enforced" to §12's baseline check.
      expect(typeof caps.enforcesUserNamespaceRemapping).toBe('boolean')
    })

    it('derives instance names deterministically from project, environment and release', () => {
      expect(instanceName('chem-labs', 'staging', 'release-abcdef12')).toBe(
        instanceName('chem-labs', 'staging', 'release-abcdef12'),
      )
      expect(instanceName('chem-labs', 'staging', 'release-abcdef12')).not.toBe(
        instanceName('chem-labs', 'production', 'release-abcdef12'),
      )
    })
  })
}
