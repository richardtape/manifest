import { createHash } from 'node:crypto'
import type {
  BuildOpts,
  BuiltImage,
  Driver,
  DriverCapabilities,
  ExecOpts,
  ExecStream,
  InstanceHandle,
  InstanceSpec,
  InstanceStatus,
  LogLine,
  LogOpts,
  RetireOpts,
  RuntimeLogLine,
  ServiceBinding,
  ServiceHandle,
  SnapshotRef,
  SourceRef,
} from './driver.js'
import { DriverRefusalError, InstanceNotReadyError, assertOneHostname } from './driver.js'

/** A health path this driver starts and never makes ready — the contract's `neverReady`. */
export const FAKE_NEVER_READY_PATH = '/__fake_never_ready__'

interface FakeInstance {
  spec: InstanceSpec
  state: InstanceStatus['state']
  logs: LogLine[]
  /** Requests the contract's drain tests are holding open against this instance. */
  inFlight: number
}
interface FakeService {
  binding: ServiceBinding
  handle: ServiceHandle
  dataDeleted: boolean
}

export interface FakeDriverOptions {
  /** Make ensureInstances land in `failed` — for testing failure paths without Docker. */
  failInstances?: boolean
  /** Which specs this driver starts and never makes ready. */
  neverReady?: (spec: InstanceSpec) => boolean
  capabilities?: Partial<DriverCapabilities>
}

export type FakeDriver = Driver & {
  /** Test affordance: advance a starting instance to healthy. */
  markHealthy(id: string): void
  instanceCount(): number
  /** Holds one request in flight to whatever serves `hostname` — its set's first — for `ms`. */
  holdRequest(hostname: string, ms: number): Promise<{ ok: boolean }>
  /**
   * Every route `hostname` was given, in order — each the set it reached, `[]` for none (A1
   * Task 4). On the fake alone: what the contract's `watch` reads, and how a test counts moves.
   */
  routeHistory(hostname: string): string[][]
  /** The hostname's route as this fake's edge holds it, for comparing before and after. */
  routeOf(hostname: string): { serving: string[]; switchedOff: boolean } | undefined
  /** Forgets every route, as restarting the edge does — a switched-off page's included. */
  dropRoutes(): void
  /** Whether `hostname` answers the switched-off page (Task 11). On the fake alone. */
  isSwitchedOff(hostname: string): boolean
  /** Every `destroyEnvironment` call, in order (Task 11). On the fake alone. */
  destroyedEnvironments(): ReadonlyArray<{
    slug: string
    kind: string
    services: readonly string[]
    deleteData: boolean
  }>
  /**
   * Test affordance: the instance prints these lines, after whatever it printed before —
   * a string is a stdout line printed now. On the fake alone, never on `Driver`.
   */
  seedLogs(
    id: string,
    lines: ReadonlyArray<
      string | { text: string; stream?: 'stdout' | 'stderr'; at?: Date }
    >,
  ): void
}

/** A line cut to `max` UTF-8 bytes on a character boundary, as a real driver cuts it. */
function cutTo(
  text: string,
  max: number | undefined,
): { text: string; cutBytes: number } {
  if (max === undefined) return { text, cutBytes: 0 }
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.length <= max) return { text, cutBytes: 0 }
  let end = max
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1
  return { text: bytes.subarray(0, end).toString('utf8'), cutBytes: bytes.length - end }
}

export function createFakeDriver(options: FakeDriverOptions = {}): FakeDriver {
  const instances = new Map<string, FakeInstance>()
  const services = new Map<string, FakeService>()
  const byName = new Map<string, string>()
  /**
   * hostname -> the set of instance ids it reaches. The fake driver's edge. Without it the
   * two drivers disagreed about the route and no contract test could see it (P4b finding
   * 73). A SET since A1's Task 4, in the order it was given, as the real route's upstreams.
   */
  const routes = new Map<string, readonly string[]>()
  /** Every route each hostname was given, in order (`routeHistory`). */
  const history = new Map<string, string[][]>()
  /** THE ONLY WRITER OF `routes`, so every change is in the history. */
  const route = (hostname: string, ids: readonly string[]): void => {
    if (ids.length === 0) routes.delete(hostname)
    else routes.set(hostname, [...ids])
    history.set(hostname, [...(history.get(hostname) ?? []), [...ids]])
  }
  const reaches = (hostname: string, id: string): boolean =>
    routes.get(hostname)?.includes(id) === true
  /** Names answering the switched-off page — a route to no instance (Task 11). */
  const switchedOff = new Set<string>()
  const environmentsDestroyed: {
    slug: string
    kind: string
    services: readonly string[]
    deleteData: boolean
  }[] = []
  // NOT `instances.size + 1`: a retire removes entries, and a reused id would make two
  // instances share one name in the tests that retire and redeploy.
  let created = 0
  // …and the same for services, since an archive removes them (Task 11): `services.size + 1`
  // handed a new service the id of one still held once an earlier one had gone.
  let servicesCreated = 0

  const digestOf = (input: string) =>
    `sha256:${createHash('sha256').update(input).digest('hex')}`

  const envKey = (env: Record<string, string>): string =>
    JSON.stringify(Object.entries(env).sort(([a], [b]) => a.localeCompare(b)))
  const handleOf = (id: string, spec: InstanceSpec): InstanceHandle => ({
    id,
    name: spec.name,
    url: `https://${spec.hostname}`,
  })
  const neverReady =
    options.neverReady ??
    ((spec: InstanceSpec) => spec.healthPath === FAKE_NEVER_READY_PATH)

  return {
    name: 'fake',

    async buildImage(src: SourceRef, spec, opts: BuildOpts = {}): Promise<BuiltImage> {
      opts.onLog?.({
        at: new Date(),
        stream: 'stdout',
        text: `fake build of ${spec.projectSlug} at ${src.commitSha} from ${spec.blueprintRef}`,
      })
      // A REAL YIELD between the line and the result. Without it this function has
      // no `await`, resolves in the tick it was called, and the contract's streaming
      // test sees `resolved` before its first poll — the fake would be modelling
      // exactly the report-at-the-end build that test exists to refuse (pre-flight
      // 110). Fixed here, never by weakening the test.
      await new Promise((resolve) => setImmediate(resolve))
      return {
        repository: `local/${spec.projectSlug}`,
        digest: digestOf(`${spec.projectSlug}:${src.commitSha}:${spec.blueprintRef}`),
        // `fake`, so a summary from this driver is never read as a real scan.
        scan: {
          scanner: 'fake',
          scannedAt: new Date().toISOString(),
          databaseAgeDays: 0,
          stale: false,
          baseImageKnown: true,
          fixable: { critical: 0, high: 0 },
          unfixable: { critical: 0, high: 0 },
          baseImage: { critical: 0, high: 0 },
          unfixableFindings: [],
        },
      }
    },

    async ensureService(binding: ServiceBinding): Promise<ServiceHandle> {
      const existingId = byName.get(`service:${binding.name}`)
      if (existingId) return services.get(existingId)!.handle
      const id = `svc-${++servicesCreated}`
      const handle: ServiceHandle = {
        id,
        name: binding.name,
        // The credentials the caller resolved, in the endpoint — because the
        // real driver puts them there and a fake that omitted them would let a
        // driver ignoring `binding.credentials` pass the shared contract suite.
        endpoint:
          `${binding.type}://${binding.credentials.username}:${binding.credentials.password}` +
          `@${binding.name}.fake:27017/${binding.credentials.database}`,
      }
      services.set(id, { binding, handle, dataDeleted: false })
      byName.set(`service:${binding.name}`, id)
      return handle
    },

    async ensureInstances(specs: readonly InstanceSpec[]): Promise<InstanceHandle[]> {
      const hostname = assertOneHostname(specs)
      /**
       * EVERY MEMBER STARTED — or found, which is what makes a retry the same call — BEFORE
       * ANYTHING MOVES. A name already held is the same instance (§11's idempotent ensure);
       * the same name with a different environment is refused, never replaced.
       */
      const started = specs.map(
        (spec): { id: string; spec: InstanceSpec; fresh: boolean } => {
          const existingId = byName.get(`instance:${spec.name}`)
          if (existingId === undefined) return { id: '', spec, fresh: true }
          const existing = instances.get(existingId)!
          if (envKey(existing.spec.env) !== envKey(spec.env)) {
            throw new DriverRefusalError(
              'INSTANCE_SPEC_CHANGED',
              `instance '${spec.name}' exists with a different environment`,
              'A name carries its instance id (§11), so this can only be a retry that ' +
                'changed something. Deploy a new instance instead — replacing this one ' +
                'would delete a container that may be serving.',
            )
          }
          return { id: existingId, spec, fresh: false }
        },
      )
      for (const member of started) {
        if (!member.fresh) {
          const existing = instances.get(member.id)!
          existing.spec = member.spec
          if (existing.state === 'hibernated') existing.state = 'healthy'
          continue
        }
        member.id = `inst-${++created}`
        /**
         * TWO DIFFERENT FAILURES, and they must stay different (P4c Task 2).
         *
         * `neverReady` is §11's readiness refusal: the instance starts and the hostname
         * never reaches it, so `ensureInstances` THROWS, the route does not move, and
         * whatever served the hostname still does.
         *
         * `failInstances` is the other one — the instance is reachable and its own
         * HEALTHCHECK is failing — so `ensureInstances` RESOLVES, the route moves, and
         * `deployRelease` fails afterwards at `waitForHealth`. That is what the real
         * Docker driver does, and §14's Incident has both producers.
         *
         * Folding the two into one readiness refusal would leave the health-check half
         * of the Incident with no test that reaches it: three of `releases.test.ts`'s
         * assertions go red on exactly that, which is how this was found.
         *
         * An in-memory driver has no container to probe, so there is nothing that could
         * move an instance out of `starting` later; it reports the outcome directly, and
         * `markHealthy` stays for tests that drive a hibernated instance back up.
         */
        instances.set(member.id, {
          spec: member.spec,
          state:
            options.failInstances === true || neverReady(member.spec)
              ? 'failed'
              : 'healthy',
          logs: [
            { at: new Date(), stream: 'stdout', text: `starting ${member.spec.name}` },
          ],
          inFlight: 0,
        })
        byName.set(`instance:${member.spec.name}`, member.id)
      }
      const handles = started.map((member) => handleOf(member.id, member.spec))
      const failed = started.findIndex((member) => neverReady(member.spec))
      if (failed !== -1) {
        // WITH EVERY HANDLE, and every member left in place: §14's Incident is read through
        // the failed one, and §11 has the caller remove the set afterwards.
        const spec = started[failed]!.spec
        throw new InstanceNotReadyError(
          handles[failed]!,
          `readiness: the fake driver was asked for a spec it never makes ready (${spec.healthPath})`,
          `${spec.name} never became ready`,
          'The route did not move, so whatever served this hostname still does.',
          handles,
        )
      }
      /**
       * A RETRY OF A SET THAT NEVER SERVED STAYS UNROUTED: every member already held, and one
       * of them not healthy (`failInstances`), is the same call answering the same way — the
       * one-instance driver moved nothing for it either.
       */
      const retryOfUnhealthy =
        started.every((member) => !member.fresh) &&
        started.some((member) => instances.get(member.id)!.state !== 'healthy')
      if (retryOfUnhealthy) return handles
      // THE MOVE, AFTER READINESS, AND ONCE — to exactly this set. The other order is the ~1 s
      // of 502s P4c's brief measured; a move per member is the mixed set A1 Task 4 refuses. It
      // replaces a switched-off page as it replaces a set: one route per name.
      route(
        hostname,
        started.map((member) => member.id),
      )
      switchedOff.delete(hostname)
      return handles
    },

    async retireInstance(id: string, opts: RetireOpts): Promise<void> {
      const instance = instances.get(id)
      if (instance === undefined) return
      if (reaches(instance.spec.hostname, id)) {
        throw new DriverRefusalError(
          'INSTANCE_SERVING',
          `instance '${id}' is one of what ${instance.spec.hostname} reaches`,
          'A retire never changes what a hostname reaches (§11). Move the hostname to ' +
            'another set first — ensureInstances does exactly that.',
        )
      }
      const deadline = Date.now() + opts.drainMs
      while (instance.inFlight > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      instance.state = 'gone'
      byName.delete(`instance:${instance.spec.name}`)
      instances.delete(id)
    },

    async servingInstances(hostname: string): Promise<string[]> {
      return [...(routes.get(hostname) ?? [])]
    },

    async listInstances(hostname: string): Promise<string[]> {
      return [...instances.entries()]
        .filter(([, instance]) => instance.spec.hostname === hostname)
        .map(([id]) => id)
    },

    async restoreRoute(ids: readonly string[]): Promise<void> {
      const missing = ids.filter((id) => !instances.has(id))
      if (missing.length > 0) {
        throw new DriverRefusalError(
          'INSTANCE_NOT_FOUND',
          `no instance ${missing.map((id) => `'${id}'`).join(', ')} to point a hostname at`,
          'restoreRoute re-points a hostname at instances that are already running; ' +
            'nothing was changed.',
        )
      }
      const hostname = assertOneHostname(
        ids.map((id) => instances.get(id)!.spec),
        'restoreRoute',
      )
      route(hostname, ids)
      switchedOff.delete(hostname)
    },

    async switchOff(hostname: string): Promise<void> {
      route(hostname, [])
      switchedOff.add(hostname)
    },

    async removeName(hostname: string): Promise<void> {
      route(hostname, [])
      switchedOff.delete(hostname)
    },

    async stopInstance(id: string): Promise<void> {
      const instance = instances.get(id)
      if (instance) instance.state = 'hibernated' // volumes survive — §11
    },

    async destroyInstance(id: string): Promise<void> {
      const instance = instances.get(id)
      if (!instance) return
      // ITS OWN MEMBER OUT OF THE SET, and the route with the last (A1 Task 4). An instance
      // the route does not reach — never routed, or routed away — leaves it exactly as it is.
      const hostname = instance.spec.hostname
      if (reaches(hostname, id))
        route(
          hostname,
          routes.get(hostname)!.filter((member) => member !== id),
        )
      instance.state = 'gone'
      byName.delete(`instance:${instance.spec.name}`)
      instances.delete(id)
    },

    async destroyService(id: string, opts: { deleteData: boolean }): Promise<void> {
      const service = services.get(id)
      if (!service) return
      service.dataDeleted = opts.deleteData
      byName.delete(`service:${service.binding.name}`)
      services.delete(id)
    },

    async destroyEnvironment(ref, opts): Promise<void> {
      environmentsDestroyed.push({ ...ref, services: [...ref.services], ...opts })
      // By the NAMES the caller gives, as the real driver removes them — never by a prefix.
      for (const name of ref.services) {
        const id = byName.get(`service:${name}`)
        const service = id === undefined ? undefined : services.get(id)
        if (id === undefined || service === undefined) continue
        service.dataDeleted = opts.deleteData
        byName.delete(`service:${name}`)
        services.delete(id)
      }
    },

    async status(id: string): Promise<InstanceStatus> {
      const instance = instances.get(id)
      if (!instance) return { id, state: 'gone', healthy: false }
      return { id, state: instance.state, healthy: instance.state === 'healthy' }
    },

    async *logs(id: string, opts: LogOpts): AsyncIterable<RuntimeLogLine> {
      const instance = instances.get(id)
      if (!instance) return
      const lines = opts.tail ? instance.logs.slice(-opts.tail) : instance.logs
      // Every line is its own record, stamped when it was printed.
      for (const line of lines)
        yield { ...line, ...cutTo(line.text, opts.lineBytes), stamped: true, entries: 1 }
    },

    seedLogs(id, lines) {
      const instance = instances.get(id)
      if (!instance) throw new Error(`fake driver: no instance '${id}' to print`)
      for (const line of lines)
        instance.logs.push(
          typeof line === 'string'
            ? { at: new Date(), stream: 'stdout', text: line }
            : {
                at: line.at ?? new Date(),
                stream: line.stream ?? 'stdout',
                text: line.text,
              },
        )
    },

    exec(id: string, cmd: string[], _opts: ExecOpts): ExecStream {
      async function* out() {
        yield `fake exec: ${cmd.join(' ')}\n`
      }
      async function* err() {}
      return { stdout: out(), stderr: err(), exitCode: Promise.resolve(0) }
    },

    async snapshotService(id: string): Promise<SnapshotRef> {
      return { id: `snap-${id}-${Date.now()}`, createdAt: new Date(), sizeBytes: 0 }
    },

    capabilities(): DriverCapabilities {
      return {
        enforcesEgress: false, // honest: an in-memory driver enforces nothing
        isolationLevel: 'container',
        remoteTarget: false,
        supportsExec: true,
        supportsSnapshot: true,
        enforcesUserNamespaceRemapping: false, // honest: nothing is namespaced
        enforcesDiskQuota: false, // honest: an in-memory driver has no disk to bound
        ...options.capabilities,
      }
    },

    holdRequest(hostname: string, ms: number): Promise<{ ok: boolean }> {
      const id = routes.get(hostname)?.[0]
      const instance = id === undefined ? undefined : instances.get(id)
      if (instance === undefined || id === undefined)
        return Promise.resolve({ ok: false })
      instance.inFlight += 1
      return new Promise((resolve) =>
        setTimeout(() => {
          instance.inFlight -= 1
          // Answered only if its instance outlived it — which is what a drain protects.
          resolve({ ok: instances.get(id) === instance })
        }, ms),
      )
    },

    dropRoutes(): void {
      // Not through `route`: an edge that restarts forgets its routes, and moves nothing.
      routes.clear()
      switchedOff.clear()
    },

    routeHistory: (hostname) => (history.get(hostname) ?? []).map((ids) => [...ids]),

    routeOf: (hostname) => {
      const serving = routes.get(hostname)
      if (serving === undefined && !switchedOff.has(hostname)) return undefined
      return {
        serving: [...(serving ?? [])].sort(),
        switchedOff: switchedOff.has(hostname),
      }
    },

    isSwitchedOff: (hostname) => switchedOff.has(hostname),

    destroyedEnvironments: () => environmentsDestroyed,

    markHealthy(id: string) {
      const instance = instances.get(id)
      if (instance) instance.state = 'healthy'
    },

    instanceCount: () => instances.size,
  }
}
