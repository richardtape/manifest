import { createHash } from 'node:crypto'
import type {
  BuildOpts,
  Driver,
  DriverCapabilities,
  ExecOpts,
  ExecStream,
  ImageRef,
  InstanceHandle,
  InstanceSpec,
  InstanceStatus,
  LogLine,
  LogOpts,
  RetireOpts,
  ServiceBinding,
  ServiceHandle,
  SnapshotRef,
  SourceRef,
} from './driver.js'
import { DriverRefusalError, InstanceNotReadyError } from './driver.js'

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
  /** Make ensureInstance land in `failed` — for testing failure paths without Docker. */
  failInstances?: boolean
  /** Which specs this driver starts and never makes ready. */
  neverReady?: (spec: InstanceSpec) => boolean
  capabilities?: Partial<DriverCapabilities>
}

export type FakeDriver = Driver & {
  /** Test affordance: advance a starting instance to healthy. */
  markHealthy(id: string): void
  instanceCount(): number
  /** Holds one request in flight to whatever serves `hostname` for `ms`. */
  holdRequest(hostname: string, ms: number): Promise<{ ok: boolean }>
  /** Forgets every route, as restarting the edge does. */
  dropRoutes(): void
}

export function createFakeDriver(options: FakeDriverOptions = {}): FakeDriver {
  const instances = new Map<string, FakeInstance>()
  const services = new Map<string, FakeService>()
  const byName = new Map<string, string>()
  /**
   * hostname -> instance id. The fake driver's edge. Without it the two drivers
   * disagreed about the route and no contract test could see it (P4b finding 73).
   */
  const routes = new Map<string, string>()
  // NOT `instances.size + 1`: a retire removes entries, and a reused id would make two
  // instances share one name in the tests that retire and redeploy.
  let created = 0

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

    async buildImage(src: SourceRef, spec, opts: BuildOpts = {}): Promise<ImageRef> {
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
      }
    },

    async ensureService(binding: ServiceBinding): Promise<ServiceHandle> {
      const existingId = byName.get(`service:${binding.name}`)
      if (existingId) return services.get(existingId)!.handle
      const id = `svc-${services.size + 1}`
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

    async ensureInstance(spec: InstanceSpec): Promise<InstanceHandle> {
      const existingId = byName.get(`instance:${spec.name}`)
      if (existingId !== undefined) {
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
        existing.spec = spec
        if (existing.state === 'hibernated') existing.state = 'healthy'
        if (existing.state === 'healthy') routes.set(spec.hostname, existingId)
        return handleOf(existingId, spec)
      }
      const id = `inst-${++created}`
      /**
       * TWO DIFFERENT FAILURES, and they must stay different (P4c Task 2).
       *
       * `neverReady` is §11's readiness refusal: the instance starts and the hostname
       * never reaches it, so `ensureInstance` THROWS, the route does not move, and
       * whatever served the hostname still does.
       *
       * `failInstances` is the other one — the instance is reachable and its own
       * HEALTHCHECK is failing — so `ensureInstance` RESOLVES, the route moves, and
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
      instances.set(id, {
        spec,
        state: options.failInstances === true || neverReady(spec) ? 'failed' : 'healthy',
        logs: [{ at: new Date(), stream: 'stdout', text: `starting ${spec.name}` }],
        inFlight: 0,
      })
      byName.set(`instance:${spec.name}`, id)
      const handle = handleOf(id, spec)
      if (neverReady(spec)) {
        // WITH THE HANDLE, and the instance left in place: §14's Incident is read
        // through it, and §11 has the caller remove the instance afterwards.
        throw new InstanceNotReadyError(
          handle,
          `readiness: the fake driver was asked for a spec it never makes ready (${spec.healthPath})`,
          `${spec.name} never became ready`,
          'The route did not move, so whatever served this hostname still does.',
        )
      }
      // THE MOVE, AFTER READINESS. The other order is the ~1 s of 502s the brief measured.
      routes.set(spec.hostname, id)
      return handle
    },

    async retireInstance(id: string, opts: RetireOpts): Promise<void> {
      const instance = instances.get(id)
      if (instance === undefined) return
      if (routes.get(instance.spec.hostname) === id) {
        throw new DriverRefusalError(
          'INSTANCE_SERVING',
          `instance '${id}' is what ${instance.spec.hostname} reaches`,
          'A retire never changes what a hostname reaches (§11). Move the hostname to ' +
            'another instance first — ensureInstance does exactly that.',
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

    async servingInstance(hostname: string): Promise<string | undefined> {
      return routes.get(hostname)
    },

    async listInstances(hostname: string): Promise<string[]> {
      return [...instances.entries()]
        .filter(([, instance]) => instance.spec.hostname === hostname)
        .map(([id]) => id)
    },

    async restoreRoute(id: string): Promise<void> {
      const instance = instances.get(id)
      if (instance === undefined) {
        throw new DriverRefusalError(
          'INSTANCE_NOT_FOUND',
          `no instance '${id}' to point a hostname at`,
          'restoreRoute re-points a hostname at an instance that is already running.',
        )
      }
      routes.set(instance.spec.hostname, id)
    },

    async stopInstance(id: string): Promise<void> {
      const instance = instances.get(id)
      if (instance) instance.state = 'hibernated' // volumes survive — §11
    },

    async destroyInstance(id: string): Promise<void> {
      const instance = instances.get(id)
      if (!instance) return
      if (routes.get(instance.spec.hostname) === id) routes.delete(instance.spec.hostname)
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

    async status(id: string): Promise<InstanceStatus> {
      const instance = instances.get(id)
      if (!instance) return { id, state: 'gone', healthy: false }
      return { id, state: instance.state, healthy: instance.state === 'healthy' }
    },

    async *logs(id: string, opts: LogOpts): AsyncIterable<LogLine> {
      const instance = instances.get(id)
      if (!instance) return
      const lines = opts.tail ? instance.logs.slice(-opts.tail) : instance.logs
      for (const line of lines) yield line
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
      const id = routes.get(hostname)
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
      routes.clear()
    },

    markHealthy(id: string) {
      const instance = instances.get(id)
      if (instance) instance.state = 'healthy'
    },

    instanceCount: () => instances.size,
  }
}
