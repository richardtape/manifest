export interface SourceRef { repoPath: string; commitSha: string }
export interface ImageRef { digest: string; repository: string }

export interface ServiceBinding {
  /** Deterministic, derived from (project, environment, service name). */
  name: string
  type: string
  version: string
  environmentId: string
  projectSlug: string
}
export interface ServiceHandle { id: string; name: string; endpoint: string }

export interface InstanceSpec {
  /** Deterministic, derived from (project, environment, release) — §11. */
  name: string
  projectSlug: string
  environmentKind: 'sandbox' | 'staging' | 'production'
  releaseId: string
  image: ImageRef
  env: Record<string, string>
  port: number
  healthPath: string
  resources: { cpu: number; memoryMi: number; pids: number; diskMi: number }
  services: ServiceHandle[]
  /** Default-deny egress: the allowlist, never a flag to disable it (D18). */
  egressAllow: string[]
}
export interface InstanceHandle { id: string; name: string; url: string }

export type InstanceState =
  | 'pending' | 'building' | 'provisioning' | 'starting' | 'healthy'
  | 'failed' | 'hibernated' | 'waking' | 'destroying' | 'gone'

export interface InstanceStatus { id: string; state: InstanceState; healthy: boolean; message?: string }

export interface LogOpts { follow?: boolean; tail?: number }
export interface LogLine { at: Date; stream: 'stdout' | 'stderr'; text: string }

export interface ExecOpts { cwd?: string; env?: Record<string, string> }
export interface ExecStream {
  stdout: AsyncIterable<string>
  stderr: AsyncIterable<string>
  exitCode: Promise<number>
}

export interface SnapshotRef { id: string; createdAt: Date; sizeBytes: number }

/**
 * A driver declares honestly what it cannot enforce rather than silently pretending.
 * The control plane surfaces declared-but-unenforced policy as a warning on the app (§11).
 */
export interface DriverCapabilities {
  enforcesEgress: boolean
  isolationLevel: 'container' | 'gvisor' | 'vm'
  remoteTarget: boolean
  supportsExec: boolean
  supportsSnapshot: boolean
  /**
   * §12's hardening baseline lists user-namespace remapping "where the daemon
   * provides it". S1 established that Docker Desktop does not: `docker info`
   * reports only `seccomp` and `cgroupns`, with no `userns`, while every other
   * item in the baseline genuinely enforces. It is declared here rather than
   * assumed, and P3's Docker driver reports `false` on macOS. S6 reads it.
   */
  enforcesUserNamespaceRemapping: boolean
}

export interface Driver {
  readonly name: string
  buildImage(src: SourceRef, spec: { blueprintRef: string; projectSlug: string }): Promise<ImageRef>
  ensureService(binding: ServiceBinding): Promise<ServiceHandle>
  ensureInstance(spec: InstanceSpec): Promise<InstanceHandle>
  stopInstance(id: string): Promise<void>
  destroyInstance(id: string): Promise<void>
  destroyService(id: string, opts: { deleteData: boolean }): Promise<void>
  status(id: string): Promise<InstanceStatus>
  logs(id: string, opts: LogOpts): AsyncIterable<LogLine>
  exec(id: string, cmd: string[], opts: ExecOpts): ExecStream
  snapshotService(id: string): Promise<SnapshotRef>
  capabilities(): DriverCapabilities
}

/** §11: keyed by a deterministic name derived from (project, environment, release). */
export function instanceName(projectSlug: string, environmentKind: string, releaseId: string): string {
  return `${projectSlug}-${environmentKind}-${releaseId.slice(0, 8)}`
}

export function serviceName(projectSlug: string, environmentKind: string, declared: string): string {
  return `${projectSlug}-${environmentKind}-${declared}`
}
