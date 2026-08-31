import { describe, expect, it } from 'vitest'
import type { Driver, InstanceSpec, ServiceBinding } from './driver.js'
import { instanceName, serviceName } from './driver.js'

const binding = (): ServiceBinding => ({
  name: serviceName('chem-labs', 'staging', 'db'),
  type: 'mongo',
  version: '7',
  environmentId: 'env-1',
  projectSlug: 'chem-labs',
})

const spec = (overrides: Partial<InstanceSpec> = {}): InstanceSpec => ({
  name: instanceName('chem-labs', 'staging', 'release-abcdef12'),
  projectSlug: 'chem-labs',
  environmentKind: 'staging',
  releaseId: 'release-abcdef12',
  image: { repository: 'local/chem-labs', digest: 'sha256:' + 'a'.repeat(64) },
  env: { MANIFEST_ENV: 'staging', PORT: '3000' },
  port: 3000,
  healthPath: '/healthz',
  resources: { cpu: 0.5, memoryMi: 512, pids: 256, diskMi: 2048 },
  services: [],
  egressAllow: [],
  ...overrides,
})

/**
 * Every Driver implementation must pass this suite unchanged (§16).
 * P3 calls it with the Docker driver; a future k8s driver calls it too.
 */
export function describeDriverContract(
  name: string,
  factory: () => Driver | Promise<Driver>,
): void {
  describe(`Driver contract: ${name}`, () => {
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
