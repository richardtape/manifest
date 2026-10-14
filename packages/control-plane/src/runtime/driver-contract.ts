import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
  Driver,
  ImageRef,
  InstanceHandle,
  InstanceSpec,
  LogLine,
  ServiceBinding,
} from './driver.js'
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
   * "ensureInstances can run what buildImage produced" is now asserted — the seam
   * between the two halves of the interface, which nothing tested before.
   */
  runnableImage?: (driver: Driver) => Promise<ImageRef>
  /**
   * P4c. Supplying this ENABLES the continuity block below — §11's *Redeploys*.
   * A driver that has not implemented the four methods yet leaves it out, and the
   * block is skipped WITH THE REASON IN ITS NAME rather than silently passing.
   */
  continuity?: ContinuityFixtures
  /**
   * Makes a running instance print one line to its own stdout, as the app would, and
   * resolves once `logs` can read it (the front-end enablement plan's Task 2). An app prints
   * what it likes, so the suite cannot make one print twice without the driver's help: the
   * fake seeds its log, a real driver runs a command inside the instance. Supplying it
   * ENABLES *honours tail*; without it that case is SKIPPED with the reason in its name.
   */
  printLine?: (driver: Driver, handleId: string, text: string) => Promise<void>
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
  /**
   * Runs `during` while watching what `hostname` answers as, and resolves with the instance of
   * every answer — as the driver's HANDLE names it — in the order they came (A1 Task 4) — one request after another through the
   * edge for a real driver, from before `during` starts until well after it ends; for an
   * in-memory one, each route the driver held meanwhile, every member of it once (what round
   * robin over that route would answer). An answer that names no instance is left out.
   */
  watch: <T>(
    driver: Driver,
    hostname: string,
    during: () => Promise<T>,
  ) => Promise<{ result: T; answers: string[] }>
  /**
   * The hostname's route exactly as the driver's edge holds it — for comparing before and
   * after a call that must not change it, never for reading into.
   */
  readRoute: (hostname: string) => Promise<unknown>
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

    /** One instance: a set of one (A1 Task 4 — `ensureInstance` is gone). */
    const ensureOne = async (
      driver: Driver,
      s: InstanceSpec,
    ): Promise<InstanceHandle> => {
      const handles = await driver.ensureInstances([s])
      expect(handles).toHaveLength(1)
      return handles[0]!
    }

    it('ensureInstances is idempotent — the second call does not create a second instance', async () => {
      const driver = await factory()
      const first = await ensureOne(driver, spec())
      const second = await ensureOne(driver, spec())
      expect(second.id).toBe(first.id)
    })

    it('reports a created instance as not-gone, and a destroyed one as gone', async () => {
      const driver = await factory()
      const handle = await ensureOne(driver, spec())
      expect((await driver.status(handle.id)).state).not.toBe('gone')
      await driver.destroyInstance(handle.id)
      expect((await driver.status(handle.id)).state).toBe('gone')
    })

    it('stopInstance hibernates rather than destroys — volumes survive (§11)', async () => {
      const driver = await factory()
      const handle = await ensureOne(driver, spec())
      await driver.stopInstance(handle.id)
      expect((await driver.status(handle.id)).state).toBe('hibernated')
      const woken = await ensureOne(driver, spec())
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

    /**
     * §11's *Ending an app* (Task 11): what an environment holds that no instance owns — its
     * services, its egress proxy, its network. A slug of its OWN, so the teardown reaches nothing of
     * `chem-labs`'s, which every other case here shares. What `deleteData: false` KEEPS is the Docker
     * tier's to measure (`releases/lifecycle.docker.test.ts`): no interface method reads a volume.
     */
    it('destroyEnvironment removes the named services, and twice is the same as once', async () => {
      const driver = await factory()
      const service: ServiceBinding = {
        ...binding(),
        name: serviceName('chem-teardown', 'staging', 'db'),
        projectSlug: 'chem-teardown',
      }
      const ref = {
        slug: 'chem-teardown',
        kind: 'staging' as const,
        services: [service.name],
      }
      const before = await driver.ensureService(service)
      await driver.destroyEnvironment(ref, { deleteData: true })
      await driver.destroyEnvironment(ref, { deleteData: true })
      // Gone, so ensuring it again creates it again — and on a real driver, starts a container.
      const after = await driver.ensureService(service)
      expect(after.name).toBe(before.name)
      await driver.destroyEnvironment(ref, { deleteData: true })
    }, 300_000)

    it('destroyEnvironment of an environment that holds nothing answers at once', async () => {
      const driver = await factory()
      await driver.destroyEnvironment(
        { slug: 'chem-nothing', kind: 'sandbox', services: [] },
        { deleteData: false },
      )
    })

    it('streams logs as an async iterable', async () => {
      const driver = await factory()
      const handle = await ensureOne(driver, spec())
      const lines = []
      for await (const line of driver.logs(handle.id, { tail: 10 })) lines.push(line)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines[0]).toHaveProperty('stream')
      expect(lines[0]).toHaveProperty('text')
    })

    const printLine = fixtures.printLine
    ;(printLine === undefined ? it.skip : it)(
      printLine === undefined
        ? 'honours tail — SKIPPED: this driver supplies no printLine fixture'
        : 'honours tail: the last N lines, in order',
      async () => {
        const driver = await factory()
        const handle = await ensureOne(driver, spec())
        await printLine!(driver, handle.id, 'contract-tail-first')
        await printLine!(driver, handle.id, 'contract-tail-last')
        const read = async (tail: number): Promise<string[]> => {
          const texts: string[] = []
          for await (const line of driver.logs(handle.id, { tail })) texts.push(line.text)
          return texts
        }
        // The last line, and exactly one — whatever the app printed at boot before it.
        expect(await read(1)).toEqual(['contract-tail-last'])
        expect(await read(2)).toEqual(['contract-tail-first', 'contract-tail-last'])
      },
    )

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
      /** A set of `n` of one release — what one deploy starts (A1 Task 4). */
      const setOf = (hostname: string, releaseId: string, n: number): InstanceSpec[] =>
        Array.from({ length: n }, () => beside(hostname, releaseId))
      const ids = (handles: readonly InstanceHandle[]): string[] =>
        handles.map((h) => h.id).sort()
      const serving = async (driver: Driver, hostname: string): Promise<string[]> =>
        (await driver.servingInstances(hostname)).sort()
      /** Settles either way, for a `watch` whose `during` is meant to throw. */
      const settled = <T>(promise: Promise<T>): Promise<T | unknown> =>
        promise.catch((error: unknown) => error)

      it('the first instance serves its hostname — a set of one', async () => {
        const driver = await factory()
        const hostname = host()
        const [first] = await driver.ensureInstances([
          beside(hostname, 'release-aaaaaaaa'),
        ])
        expect(await driver.servingInstances(hostname)).toEqual([first!.id])
      }, 600_000)

      it('a set of two serves its hostname, and each answers as itself', async () => {
        const driver = await factory()
        const hostname = host()
        const set = await driver.ensureInstances(setOf(hostname, 'release-aaaaaaaa', 2))
        expect(set).toHaveLength(2)
        expect(new Set(set.map((h) => h.id)).size).toBe(2)
        expect(await serving(driver, hostname)).toEqual(ids(set))
        // BOTH, by what the hostname answers — not one of them, and not a status.
        const { answers } = await continuity!.watch(
          driver,
          hostname,
          async () => undefined,
        )
        expect([...new Set(answers)].sort()).toEqual(ids(set))
      }, 600_000)

      it('ensureInstances is idempotent for a set — the same specs answer the same handles, still serving', async () => {
        const driver = await factory()
        const hostname = host()
        const specs = setOf(hostname, 'release-aaaaaaaa', 2)
        const first = await driver.ensureInstances(specs)
        const again = await driver.ensureInstances(specs)
        expect(again.map((h) => h.id)).toEqual(first.map((h) => h.id))
        expect(await serving(driver, hostname)).toEqual(ids(first))
      }, 600_000)

      it('a set of none, or of two hostnames, is refused before anything starts', async () => {
        const driver = await factory()
        const one = host()
        const other = host()
        await expect(driver.ensureInstances([])).rejects.toThrow(/no instance/)
        await expect(
          driver.ensureInstances([
            beside(one, 'release-aaaaaaaa'),
            beside(other, 'release-aaaaaaaa'),
          ]),
        ).rejects.toThrow(/one hostname/)
        expect(await driver.listInstances(one)).toEqual([])
        expect(await driver.listInstances(other)).toEqual([])
      }, 600_000)

      it('a second set takes the hostname over in ONE move — no answer from the old set after the first from the new — and the first set still runs', async () => {
        const driver = await factory()
        const hostname = host()
        const before = await driver.ensureInstances(
          setOf(hostname, 'release-aaaaaaaa', 2),
        )
        const { result: after, answers } = await continuity!.watch(driver, hostname, () =>
          driver.ensureInstances(setOf(hostname, 'release-bbbbbbbb', 2)),
        )
        const oldIds = new Set(before.map((h) => h.id))
        const newIds = new Set(after.map((h) => h.id))
        expect([...oldIds].some((id) => newIds.has(id))).toBe(false)
        // The watch saw the old set serve and the new one take over — or it proves nothing.
        expect(answers.some((id) => oldIds.has(id))).toBe(true)
        const firstNew = answers.findIndex((id) => newIds.has(id))
        expect(firstNew).toBeGreaterThanOrEqual(0)
        // NEVER A MIXED SET: once the new set has answered, the old never does again (P4c,
        // across N). A move per member would put both sets behind the name at once.
        expect(answers.slice(firstNew).filter((id) => oldIds.has(id))).toEqual([])
        expect([...new Set(answers.slice(firstNew))].sort()).toEqual(ids(after))
        expect(await serving(driver, hostname)).toEqual(ids(after))
        // §11: beside, never instead. The old set is what a drain drains.
        for (const handle of before)
          expect((await driver.status(handle.id)).state).not.toBe('gone')
      }, 600_000)

      it('a set any member of which never becomes ready moves nothing, throws WITH EVERY HANDLE, and the previous set still serves', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstances(setOf(hostname, 'release-aaaaaaaa', 2))
        const routeBefore = await continuity!.readRoute(hostname)
        const specs = [
          beside(hostname, 'release-cccccccc'),
          continuity!.neverReady(beside(hostname, 'release-cccccccc')),
          beside(hostname, 'release-cccccccc'),
        ]
        const refusal = await settled(driver.ensureInstances(specs))
        expect(refusal).toBeInstanceOf(InstanceNotReadyError)
        const error = refusal as InstanceNotReadyError
        // Every member this call started, in the order asked — each handle named for its spec
        // (a driver may wrap the name: Docker's is its container's) — and the one that failed.
        expect(error.handles).toHaveLength(specs.length)
        error.handles.forEach((h, i) => expect(h.name).toContain(specs[i]!.name))
        expect(error.handle.name).toContain(specs[1]!.name)
        expect(error.handle.id).toBe(error.handles[1]!.id)
        // NOTHING MOVED: the route is the one that served, member for member.
        expect(await continuity!.readRoute(hostname)).toEqual(routeBefore)
        expect(await serving(driver, hostname)).toEqual(ids(first))
        // STILL THERE: §14's Incident reads the failed member's exit code and log through its
        // handle, and the CALLER removes the set once that is captured (§11).
        for (const handle of error.handles) {
          expect((await driver.status(handle.id)).state).not.toBe('gone')
          await driver.retireInstance(handle.id, { drainMs: 0 })
          expect((await driver.status(handle.id)).state).toBe('gone')
        }
        expect(await serving(driver, hostname)).toEqual(ids(first))
      }, 600_000)

      it('REFUSES to retire any member of the serving set', async () => {
        const driver = await factory()
        const hostname = host()
        const set = await driver.ensureInstances(setOf(hostname, 'release-aaaaaaaa', 2))
        for (const handle of set) {
          await expect(
            driver.retireInstance(handle.id, { drainMs: 0 }),
          ).rejects.toMatchObject({ code: 'INSTANCE_SERVING' })
          expect((await driver.status(handle.id)).state).not.toBe('gone')
        }
        expect(await serving(driver, hostname)).toEqual(ids(set))
      }, 600_000)

      it("retiring or destroying the old set's members leaves the new set serving, its route untouched", async () => {
        const driver = await factory()
        const hostname = host()
        const [retired, destroyed] = await driver.ensureInstances(
          setOf(hostname, 'release-aaaaaaaa', 2),
        )
        const second = await driver.ensureInstances(
          setOf(hostname, 'release-bbbbbbbb', 2),
        )
        const route = await continuity!.readRoute(hostname)
        await driver.retireInstance(retired!.id, { drainMs: 0 })
        // ROUTED AWAY: its upstream is no longer in the route, so the route stays as it is.
        await driver.destroyInstance(destroyed!.id)
        expect((await driver.status(retired!.id)).state).toBe('gone')
        expect((await driver.status(destroyed!.id)).state).toBe('gone')
        expect(await continuity!.readRoute(hostname)).toEqual(route)
        expect(await serving(driver, hostname)).toEqual(ids(second))
      }, 600_000)

      it('destroying one member of a serving set leaves the other serving, and the last takes the name with it', async () => {
        const driver = await factory()
        const hostname = host()
        const [gone, kept] = await driver.ensureInstances(
          setOf(hostname, 'release-aaaaaaaa', 2),
        )
        await driver.destroyInstance(gone!.id)
        expect((await driver.status(gone!.id)).state).toBe('gone')
        expect(await driver.servingInstances(hostname)).toEqual([kept!.id])
        // By what the hostname ANSWERS: the survivor, and only the survivor.
        const { answers } = await continuity!.watch(
          driver,
          hostname,
          async () => undefined,
        )
        expect([...new Set(answers)]).toEqual([kept!.id])
        await driver.destroyInstance(kept!.id)
        expect(await driver.servingInstances(hostname)).toEqual([])
        expect(await continuity!.readRoute(hostname)).toBeUndefined()
      }, 600_000)

      it('destroying an instance that was never routed leaves the route exactly as it was', async () => {
        const driver = await factory()
        const hostname = host()
        const set = await driver.ensureInstances(setOf(hostname, 'release-aaaaaaaa', 2))
        const refusal = await settled(
          driver.ensureInstances([
            continuity!.neverReady(beside(hostname, 'release-cccccccc')),
          ]),
        )
        expect(refusal).toBeInstanceOf(InstanceNotReadyError)
        const never = (refusal as InstanceNotReadyError).handle
        const route = await continuity!.readRoute(hostname)
        expect(route).toBeDefined()
        await driver.destroyInstance(never.id)
        expect((await driver.status(never.id)).state).toBe('gone')
        expect(await continuity!.readRoute(hostname)).toEqual(route)
        expect(await serving(driver, hostname)).toEqual(ids(set))
      }, 600_000)

      it('a retire waits for a request that is in flight', async () => {
        const driver = await factory()
        const hostname = host()
        const [first] = await driver.ensureInstances([
          beside(hostname, 'release-aaaaaaaa'),
        ])
        const held = await continuity!.holdRequest(driver, hostname)
        let finished = false
        void held.done.then(() => {
          finished = true
        })
        await driver.ensureInstances([beside(hostname, 'release-bbbbbbbb')])
        await driver.retireInstance(first!.id, { drainMs: continuity!.holdMs * 4 })
        // NOT "it took a while": the request had ALREADY finished when the retire
        // returned, and it was answered.
        expect(finished).toBe(true)
        expect(await held.done).toEqual({ ok: true })
      }, 600_000)

      it('a retire never waits longer than its drain bound', async () => {
        const driver = await factory()
        const hostname = host()
        const [first] = await driver.ensureInstances([
          beside(hostname, 'release-aaaaaaaa'),
        ])
        const held = await continuity!.holdRequest(driver, hostname)
        await driver.ensureInstances([beside(hostname, 'release-bbbbbbbb')])
        const started = Date.now()
        await driver.retireInstance(first!.id, { drainMs: continuity!.shortDrainMs })
        const waited = Date.now() - started
        expect(waited).toBeGreaterThanOrEqual(continuity!.shortDrainMs)
        expect(waited).toBeLessThan(continuity!.holdMs)
        // And what it cut off is cut off — a bound that quietly waited anyway would
        // pass every other assertion here.
        expect(await held.done).toEqual({ ok: false })
      }, 600_000)

      it('restoreRoute puts a whole set back after the route is lost', async () => {
        const driver = await factory()
        const hostname = host()
        const set = await driver.ensureInstances(setOf(hostname, 'release-aaaaaaaa', 2))
        const route = await continuity!.readRoute(hostname)
        await continuity!.dropRoute(hostname)
        expect(await driver.servingInstances(hostname)).toEqual([])
        await driver.restoreRoute(set.map((h) => h.id))
        expect(await serving(driver, hostname)).toEqual(ids(set))
        // The route the set was given, not a lesser one rebuilt without what the deploy knew.
        expect(await continuity!.readRoute(hostname)).toEqual(route)
      }, 600_000)

      it('restoreRoute REFUSES a set naming an instance it does not hold, naming it, and changes nothing', async () => {
        const driver = await factory()
        const hostname = host()
        const [only] = await driver.ensureInstances([
          beside(hostname, 'release-aaaaaaaa'),
        ])
        const route = await continuity!.readRoute(hostname)
        await expect(
          driver.restoreRoute([only!.id, 'no-such-instance']),
        ).rejects.toMatchObject({
          code: 'INSTANCE_NOT_FOUND',
          message: expect.stringContaining('no-such-instance'),
        })
        expect(await continuity!.readRoute(hostname)).toEqual(route)
      }, 600_000)

      it('a woken instance serves its hostname again', async () => {
        const driver = await factory()
        const hostname = host()
        const target = beside(hostname, 'release-aaaaaaaa')
        const [first] = await driver.ensureInstances([target])
        await driver.stopInstance(first!.id)
        const [woken] = await driver.ensureInstances([target])
        expect(woken!.id).toBe(first!.id)
        expect(await driver.servingInstances(hostname)).toEqual([first!.id])
      }, 600_000)

      it('the same name with a DIFFERENT environment is refused, never replaced', async () => {
        const driver = await factory()
        const hostname = host()
        const target = beside(hostname, 'release-aaaaaaaa')
        const [first] = await driver.ensureInstances([target])
        await expect(
          driver.ensureInstances([{ ...target, env: { ...target.env, CHANGED: '1' } }]),
        ).rejects.toMatchObject({ code: 'INSTANCE_SPEC_CHANGED' })
        // The old behaviour DELETED it — and it may be the container serving the app.
        expect((await driver.status(first!.id)).state).not.toBe('gone')
        expect(await driver.servingInstances(hostname)).toEqual([first!.id])
      }, 600_000)

      /**
       * §11's *Ending an app* (the front-end enablement plan's Task 11, Decision 29): a switched-off
       * name reaches NO instance — so every instance of it can be retired, which a retire refuses
       * for one that serves — and the next instance takes it back in place.
       */
      it('switchOff: the name reaches no instance, and every instance of it can then be retired', async () => {
        const driver = await factory()
        const hostname = host()
        const set = await driver.ensureInstances(setOf(hostname, 'release-aaaaaaaa', 2))
        await driver.switchOff(hostname, 'staging')
        expect(await driver.servingInstances(hostname)).toEqual([])
        const page = await continuity!.readRoute(hostname)
        await driver.retireInstance(set[0]!.id, { drainMs: 0 })
        // AND A DESTROY LEAVES THE PAGE: the instance's upstream is not in it (A1 Task 4).
        await driver.destroyInstance(set[1]!.id)
        for (const handle of set)
          expect((await driver.status(handle.id)).state).toBe('gone')
        expect(await continuity!.readRoute(hostname)).toEqual(page)
      }, 600_000)

      it('switchOff twice is the same as once, and the next instance replaces it', async () => {
        const driver = await factory()
        const hostname = host()
        await driver.switchOff(hostname, 'staging')
        await driver.switchOff(hostname, 'staging')
        expect(await driver.servingInstances(hostname)).toEqual([])
        const [next] = await driver.ensureInstances([
          beside(hostname, 'release-bbbbbbbb'),
        ])
        expect(await driver.servingInstances(hostname)).toEqual([next!.id])
      }, 600_000)

      /**
       * §11's DELETE (the front-end enablement plan's Task 12): a switched-off name RELEASED — no
       * page, no route of this project's — so it belongs to whoever takes the slug next. Idempotent,
       * and a name that holds nothing answers at once. What the name then answers is the edge's
       * (the wildcard), which `releases/delete.docker.test.ts` reads through the edge itself.
       */
      it('removeName releases a switched-off name, twice is the same as once, and the next instance takes it', async () => {
        const driver = await factory()
        const hostname = host()
        await driver.switchOff(hostname, 'staging')
        await driver.removeName(hostname, 'staging')
        await driver.removeName(hostname, 'staging')
        await driver.removeName(host(), 'staging')
        expect(await driver.servingInstances(hostname)).toEqual([])
        const [next] = await driver.ensureInstances([
          beside(hostname, 'release-cccccccc'),
        ])
        expect(await driver.servingInstances(hostname)).toEqual([next!.id])
      }, 600_000)

      it('listInstances names every instance of a hostname — serving or not — and nothing else', async () => {
        const driver = await factory()
        const hostname = host()
        const other = host()
        // A bound service is never an instance, and it carries the same project labels.
        await driver.ensureService(binding())
        const first = await driver.ensureInstances(setOf(hostname, 'release-aaaaaaaa', 2))
        const second = await driver.ensureInstances([
          beside(hostname, 'release-bbbbbbbb'),
        ])
        const elsewhere = await driver.ensureInstances([
          beside(other, 'release-dddddddd'),
        ])
        expect((await driver.listInstances(hostname)).sort()).toEqual(
          ids([...first, ...second]),
        )
        expect(await driver.listInstances(other)).toEqual([elsewhere[0]!.id])
      }, 900_000)
    })
  })
}
