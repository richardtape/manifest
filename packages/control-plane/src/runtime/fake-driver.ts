import { createHash } from 'node:crypto'
import type {
  Driver, DriverCapabilities, ExecOpts, ExecStream, ImageRef, InstanceHandle,
  InstanceSpec, InstanceStatus, LogLine, LogOpts, ServiceBinding, ServiceHandle,
  SnapshotRef, SourceRef,
} from './driver.js'

interface FakeInstance { spec: InstanceSpec; state: InstanceStatus['state']; logs: LogLine[] }
interface FakeService { binding: ServiceBinding; handle: ServiceHandle; dataDeleted: boolean }

export interface FakeDriverOptions {
  /** Make ensureInstance land in `failed` — for testing failure paths without Docker. */
  failInstances?: boolean
  capabilities?: Partial<DriverCapabilities>
}

export function createFakeDriver(options: FakeDriverOptions = {}): Driver & {
  /** Test affordance: advance a starting instance to healthy. */
  markHealthy(id: string): void
  instanceCount(): number
} {
  const instances = new Map<string, FakeInstance>()
  const services = new Map<string, FakeService>()
  const byName = new Map<string, string>()

  const digestOf = (input: string) =>
    `sha256:${createHash('sha256').update(input).digest('hex')}`

  return {
    name: 'fake',

    async buildImage(src: SourceRef, spec): Promise<ImageRef> {
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
        endpoint: `${binding.type}://${binding.name}.fake:27017`,
      }
      services.set(id, { binding, handle, dataDeleted: false })
      byName.set(`service:${binding.name}`, id)
      return handle
    },

    async ensureInstance(spec: InstanceSpec): Promise<InstanceHandle> {
      const existingId = byName.get(`instance:${spec.name}`)
      if (existingId) {
        const existing = instances.get(existingId)!
        existing.spec = spec
        if (existing.state === 'hibernated') existing.state = 'starting'
        return { id: existingId, name: spec.name, url: `https://${spec.name}.manifest.internal` }
      }
      const id = `inst-${instances.size + 1}`
      instances.set(id, {
        spec,
        state: options.failInstances ? 'failed' : 'starting',
        logs: [{ at: new Date(), stream: 'stdout', text: `starting ${spec.name}` }],
      })
      byName.set(`instance:${spec.name}`, id)
      return { id, name: spec.name, url: `https://${spec.name}.manifest.internal` }
    },

    async stopInstance(id: string): Promise<void> {
      const instance = instances.get(id)
      if (instance) instance.state = 'hibernated'   // volumes survive — §11
    },

    async destroyInstance(id: string): Promise<void> {
      const instance = instances.get(id)
      if (!instance) return
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
      async function* out() { yield `fake exec: ${cmd.join(' ')}\n` }
      async function* err() {}
      return { stdout: out(), stderr: err(), exitCode: Promise.resolve(0) }
    },

    async snapshotService(id: string): Promise<SnapshotRef> {
      return { id: `snap-${id}-${Date.now()}`, createdAt: new Date(), sizeBytes: 0 }
    },

    capabilities(): DriverCapabilities {
      return {
        enforcesEgress: false,   // honest: an in-memory driver enforces nothing
        isolationLevel: 'container',
        remoteTarget: false,
        supportsExec: true,
        supportsSnapshot: true,
        enforcesUserNamespaceRemapping: false,   // honest: nothing is namespaced
        ...options.capabilities,
      }
    },

    markHealthy(id: string) {
      const instance = instances.get(id)
      if (instance) instance.state = 'healthy'
    },

    instanceCount: () => instances.size,
  }
}
