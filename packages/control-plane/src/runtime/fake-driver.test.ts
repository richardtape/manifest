import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { describeDriverContract } from './driver-contract.js'
import { instanceName, type InstanceSpec } from './driver.js'
import {
  FAKE_NEVER_READY_PATH,
  createFakeDriver,
  type FakeDriver,
} from './fake-driver.js'

// ONE driver for the contract's continuity block: those tests ensure, retire and read
// routes across calls, and a fresh in-memory driver per call would forget all of it.
const shared = createFakeDriver()

describeDriverContract('fake', () => shared, {
  printLine: async (driver, handleId, text) => {
    ;(driver as FakeDriver).seedLogs(handleId, [text])
  },
  continuity: {
    neverReady: (spec) => ({ ...spec, healthPath: FAKE_NEVER_READY_PATH }),
    holdRequest: async (driver, hostname) => ({
      done: (driver as FakeDriver).holdRequest(hostname, 400),
    }),
    holdMs: 400,
    shortDrainMs: 50,
    // The fake edge is one map, so dropping is all-or-nothing — which is what
    // restarting the real edge does anyway (ORIENTATION §4).
    dropRoute: async () => {
      ;(shared as FakeDriver).dropRoutes()
    },
    hostname: () => `fake-${randomUUID().slice(0, 8)}.staging.manifest.internal`,
    /**
     * The fake has no wire to watch, so it answers what round robin over each route it held
     * would: the route before `during`, then every route it moved to meanwhile, each member
     * once (A1 Task 4). A move per member puts the old set beside the new in one of them.
     */
    watch: async (driver, hostname, during) => {
      const fake = driver as FakeDriver
      const from = fake.routeHistory(hostname).length
      const current = await driver.servingInstances(hostname)
      const result = await during()
      const held = [current, ...fake.routeHistory(hostname).slice(from)]
      return { result, answers: held.flat() }
    },
    readRoute: async (hostname) => (shared as FakeDriver).routeOf(hostname),
    rateLimitExemption: async (hostname) =>
      (shared as FakeDriver).rateLimitExemption(hostname),
  },
})

describe('the fake driver', () => {
  const specFor = (hostname: string, releaseId: string): InstanceSpec => {
    const instanceId = randomUUID()
    return {
      name: instanceName('fake-move', 'staging', releaseId, instanceId),
      instanceId,
      hostname,
      projectSlug: 'fake-move',
      environmentKind: 'staging',
      releaseId,
      image: { repository: 'local/fake-move', digest: `sha256:${'b'.repeat(64)}` },
      env: { PORT: '3000' },
      port: 3000,
      healthPath: '/healthz',
      needsAiGateway: false,
      resources: { cpu: 0.5, memoryMi: 512, pids: 256, diskMi: 2048 },
      services: [],
      egressAllow: [],
    }
  }

  // The Docker driver's half of this is the contract's no-mixed-set row, read through the edge.
  it('moves a set of three in ONE route change, and moves nothing when one is never ready', async () => {
    const driver = createFakeDriver()
    const hostname = 'fake-move.staging.manifest.internal'
    const first = await driver.ensureInstances([
      specFor(hostname, 'release-aaaaaaaa'),
      specFor(hostname, 'release-aaaaaaaa'),
    ])
    expect(driver.routeHistory(hostname)).toEqual([first.map((h) => h.id)])
    const second = await driver.ensureInstances([
      specFor(hostname, 'release-bbbbbbbb'),
      specFor(hostname, 'release-bbbbbbbb'),
      specFor(hostname, 'release-bbbbbbbb'),
    ])
    expect(driver.routeHistory(hostname)).toEqual([
      first.map((h) => h.id),
      second.map((h) => h.id),
    ])
    await expect(
      driver.ensureInstances([
        specFor(hostname, 'release-cccccccc'),
        { ...specFor(hostname, 'release-cccccccc'), healthPath: FAKE_NEVER_READY_PATH },
      ]),
    ).rejects.toMatchObject({ code: 'INSTANCE_NOT_REACHABLE' })
    expect(driver.routeHistory(hostname)).toHaveLength(2)
  })

  // The load rehearsal plan's Task 3: what Docker's `OOMKilled` says, so a run's watch can be tested without Docker.
  it('crash can say the instance ran out of memory — and, as Docker’s flag, it stays said', async () => {
    const driver = createFakeDriver()
    const hostname = 'fake-oom.staging.manifest.internal'
    const [killed, oom] = await driver.ensureInstances([
      specFor(hostname, 'release-aaaaaaaa'),
      specFor(hostname, 'release-aaaaaaaa'),
    ])
    expect(await driver.status(oom!.id)).toMatchObject({
      state: 'healthy',
      outOfMemory: false,
    })
    driver.crash(killed!.id, 137)
    driver.crash(oom!.id, 137, { outOfMemory: true })
    expect(await driver.status(killed!.id)).toMatchObject({
      state: 'failed',
      exitCode: 137,
      outOfMemory: false,
    })
    expect(await driver.status(oom!.id)).toMatchObject({
      state: 'failed',
      exitCode: 137,
      outOfMemory: true,
    })
    driver.markHealthy(oom!.id)
    expect(await driver.status(oom!.id)).toMatchObject({
      state: 'healthy',
      outOfMemory: true,
    })
  })
})
