import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Driver, ImageRef, InstanceSpec, LogLine, ServiceBinding } from './driver.js'
import { InstanceNotReadyError, instanceName, serviceName } from './driver.js'

/**
 * Polls until `predicate` holds. Shared SUITE code rather than a test helper in
 * `src/`: it exists for the streaming assertion below and nothing else needs it.
 */
async function waitUntil(predicate: () => boolean, timeoutMs = 600_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`waitUntil: the condition did not hold within ${timeoutMs} ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

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
  /**
   * P4c. Supplying this ENABLES the continuity block below — §11's *Redeploys*.
   * A driver that has not implemented the four methods yet leaves it out, and the
   * block is skipped WITH THE REASON IN ITS NAME rather than silently passing.
   */
  continuity?: ContinuityFixtures
}

export interface ContinuityFixtures {
  /** The same spec, made so this driver starts it and can never make it ready. */
  neverReady: (spec: InstanceSpec) => InstanceSpec
  /**
   * Starts ONE request to `hostname` that the app holds open, and resolves once that
   * request is in flight. `done` settles when the request does, and `ok` is true only
   * for a complete answer from the instance it started on.
   */
  holdRequest: (
    driver: Driver,
    hostname: string,
  ) => Promise<{ done: Promise<{ ok: boolean }> }>
  /** How long `holdRequest` holds — the fake's is milliseconds, a real one's seconds. */
  holdMs: number
  /** A drain bound comfortably shorter than `holdMs`, for the "never longer" test. */
  shortDrainMs: number
  /** Removes the edge's route for `hostname`, as restarting the edge does. */
  dropRoute: (hostname: string) => Promise<void>
  /** A hostname nothing else in the run uses. */
  hostname: () => string
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

    const INSTANCE_ID = 'a1a1a1a1-0000-4000-8000-000000000001'
    const OTHER_INSTANCE_ID = 'b2b2b2b2-0000-4000-8000-000000000002'

    const spec = (overrides: Partial<InstanceSpec> = {}): InstanceSpec => {
      const instanceId = overrides.instanceId ?? INSTANCE_ID
      const releaseId = overrides.releaseId ?? 'release-abcdef12'
      return {
        name: instanceName('chem-labs', 'staging', releaseId, instanceId),
        instanceId,
        // §23 assigns it and §11 now carries it, so a driver never re-derives it.
        hostname: 'chem-labs.staging.manifest.internal',
        projectSlug: 'chem-labs',
        environmentKind: 'staging',
        releaseId,
        image,
        env: { MANIFEST_ENV: 'staging', PORT: '3000' },
        port: 3000,
        healthPath: '/healthz',
        needsAiGateway: false,
        resources: { cpu: 0.5, memoryMi: 512, pids: 256, diskMi: 2048 },
        services: [],
        egressAllow: [],
        ...overrides,
      }
    }

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

    it('reports the scan of what it built (§12, P5a Task 13)', async () => {
      const driver = await factory()
      const image = await driver.buildImage(
        { repoPath: '/tmp/repo', commitSha: 'abc123' },
        { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
      )
      const counts = (c: object) =>
        Object.keys(c).sort().join(',') === 'critical,high' &&
        Object.values(c).every((n: unknown) => Number.isInteger(n) && (n as number) >= 0)
      expect(image.scan.scanner).not.toBe('')
      expect(Number.isNaN(Date.parse(image.scan.scannedAt))).toBe(false)
      expect(typeof image.scan.stale).toBe('boolean')
      // A number a JSON column can hold, or null for "the scanner could not say".
      expect(
        image.scan.databaseAgeDays === null ||
          (Number.isFinite(image.scan.databaseAgeDays) &&
            image.scan.databaseAgeDays >= 0),
      ).toBe(true)
      expect(
        counts(image.scan.fixable) &&
          counts(image.scan.unfixable) &&
          counts(image.scan.baseImage),
      ).toBe(true)
      // A fixable Critical or High is REFUSED (§12) — unless the database is stale, when
      // the gate warns instead — so on a fresh database none survives to here.
      expect(
        image.scan.stale || image.scan.fixable.critical + image.scan.fixable.high === 0,
      ).toBe(true)
      expect(image.scan.unfixableFindings.length).toBeLessThanOrEqual(50)
    })

    it('reports build progress through onLog BEFORE it resolves (§14)', async () => {
      // Not "logs exist afterwards" — that is what execFile already gave us, and it
      // is not a stream. A front-end that receives nothing for two minutes and then
      // everything at once has not received a stream.
      const driver = await factory()
      const seen: LogLine[] = []
      let resolved = false
      const promise = driver.buildImage(
        { repoPath: '/tmp/repo', commitSha: 'abc123' },
        { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
        { onLog: (line) => seen.push(line) },
      )
      // Both settlements, so a build that REJECTS is reported by `await promise`
      // below rather than as an unhandled rejection from this bookkeeping.
      const settled = () => {
        resolved = true
      }
      void promise.then(settled, settled)
      // `|| resolved`: a driver that never logs fails here at once, instead of
      // waiting out the timeout for a line that is never coming.
      await waitUntil(() => seen.length > 0 || resolved)
      expect(resolved, 'every line arrived after the build finished').toBe(false)
      await promise
      expect(['stdout', 'stderr']).toContain(seen[0]!.stream)
      expect(typeof seen[0]!.text).toBe('string')
      expect(seen[0]!.at).toBeInstanceOf(Date)
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

    it('derives instance names deterministically from project, environment, release AND instance', () => {
      const name = instanceName('chem-labs', 'staging', 'release-abcdef12', INSTANCE_ID)
      expect(instanceName('chem-labs', 'staging', 'release-abcdef12', INSTANCE_ID)).toBe(
        name,
      )
      expect(
        instanceName('chem-labs', 'production', 'release-abcdef12', INSTANCE_ID),
      ).not.toBe(name)
      // §11: a redeploy of the SAME release is a new instance beside the one serving.
      expect(
        instanceName('chem-labs', 'staging', 'release-abcdef12', OTHER_INSTANCE_ID),
      ).not.toBe(name)
    })

    const continuity = fixtures.continuity
    const describeContinuity =
      continuity === undefined
        ? (name: string, body: () => void) =>
            describe.skip(
              `${name} [skipped: this driver supplies no continuity fixtures]`,
              body,
            )
        : describe

    describeContinuity('continuity — §11 Redeploys', () => {
      // A hostname per test: the edge's routes outlive a test, so two tests sharing one
      // would each see the other's instance serving.
      const hosts: string[] = []
      const host = (): string => {
        const next = continuity!.hostname()
        hosts.push(next)
        return next
      }
      afterAll(async () => {
        for (const hostname of hosts) await continuity!.dropRoute(hostname)
      }, 120_000)

      const beside = (hostname: string, releaseId: string): InstanceSpec =>
        spec({ hostname, releaseId, instanceId: randomUUID() })

      it('the first instance serves its hostname', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('a second instance takes the hostname over, and the first is still running', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const second = await driver.ensureInstance(beside(hostname, 'release-bbbbbbbb'))
        expect(second.id).not.toBe(first.id)
        expect(await driver.servingInstance(hostname)).toBe(second.id)
        // §11: beside, never instead. The old one is what a drain drains.
        expect((await driver.status(first.id)).state).not.toBe('gone')
      }, 600_000)

      it('an instance that never becomes ready throws WITH ITS HANDLE, and the previous one still serves', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const refusal = driver.ensureInstance(
          continuity!.neverReady(beside(hostname, 'release-cccccccc')),
        )
        await expect(refusal).rejects.toBeInstanceOf(InstanceNotReadyError)
        const handle = await refusal.catch(
          (error: unknown) => (error as InstanceNotReadyError).handle,
        )
        expect(await driver.servingInstance(hostname)).toBe(first.id)
        // STILL THERE: §14's Incident reads its exit code and its log through this
        // handle, and the CALLER removes it once that is captured (§11).
        expect((await driver.status(handle.id)).state).not.toBe('gone')
        await driver.retireInstance(handle.id, { drainMs: 0 })
        expect((await driver.status(handle.id)).state).toBe('gone')
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('retiring the instance it replaced leaves the new one serving', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const second = await driver.ensureInstance(beside(hostname, 'release-bbbbbbbb'))
        await driver.retireInstance(first.id, { drainMs: 0 })
        expect((await driver.status(first.id)).state).toBe('gone')
        expect(await driver.servingInstance(hostname)).toBe(second.id)
      }, 600_000)

      it('REFUSES to retire the instance that is serving', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        await expect(
          driver.retireInstance(first.id, { drainMs: 0 }),
        ).rejects.toMatchObject({ code: 'INSTANCE_SERVING' })
        expect((await driver.status(first.id)).state).not.toBe('gone')
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('a retire waits for a request that is in flight', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const held = await continuity!.holdRequest(driver, hostname)
        let finished = false
        void held.done.then(() => {
          finished = true
        })
        await driver.ensureInstance(beside(hostname, 'release-bbbbbbbb'))
        await driver.retireInstance(first.id, { drainMs: continuity!.holdMs * 4 })
        // NOT "it took a while": the request had ALREADY finished when the retire
        // returned, and it was answered.
        expect(finished).toBe(true)
        expect(await held.done).toEqual({ ok: true })
      }, 600_000)

      it('a retire never waits longer than its drain bound', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const held = await continuity!.holdRequest(driver, hostname)
        await driver.ensureInstance(beside(hostname, 'release-bbbbbbbb'))
        const started = Date.now()
        await driver.retireInstance(first.id, { drainMs: continuity!.shortDrainMs })
        const waited = Date.now() - started
        expect(waited).toBeGreaterThanOrEqual(continuity!.shortDrainMs)
        expect(waited).toBeLessThan(continuity!.holdMs)
        // And what it cut off is cut off — a bound that quietly waited anyway would
        // pass every other assertion here.
        expect(await held.done).toEqual({ ok: false })
      }, 600_000)

      it('restoreRoute points a hostname back at its instance after the route is lost', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        await continuity!.dropRoute(hostname)
        expect(await driver.servingInstance(hostname)).toBeUndefined()
        await driver.restoreRoute(first.id)
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('a woken instance serves its hostname again', async () => {
        const driver = await factory()
        const hostname = host()
        const target = beside(hostname, 'release-aaaaaaaa')
        const first = await driver.ensureInstance(target)
        await driver.stopInstance(first.id)
        const woken = await driver.ensureInstance(target)
        expect(woken.id).toBe(first.id)
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('the same name with a DIFFERENT environment is refused, never replaced', async () => {
        const driver = await factory()
        const hostname = host()
        const target = beside(hostname, 'release-aaaaaaaa')
        const first = await driver.ensureInstance(target)
        await expect(
          driver.ensureInstance({ ...target, env: { ...target.env, CHANGED: '1' } }),
        ).rejects.toMatchObject({ code: 'INSTANCE_SPEC_CHANGED' })
        // The old behaviour DELETED it — and it may be the container serving the app.
        expect((await driver.status(first.id)).state).not.toBe('gone')
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('listInstances names every instance of a hostname — serving or not — and nothing else', async () => {
        const driver = await factory()
        const hostname = host()
        const other = host()
        // A bound service is never an instance, and it carries the same project labels.
        await driver.ensureService(binding())
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const second = await driver.ensureInstance(beside(hostname, 'release-bbbbbbbb'))
        const elsewhere = await driver.ensureInstance(beside(other, 'release-dddddddd'))
        expect((await driver.listInstances(hostname)).sort()).toEqual(
          [first.id, second.id].sort(),
        )
        expect(await driver.listInstances(other)).toEqual([elsewhere.id])
      }, 900_000)
    })
  })
}
