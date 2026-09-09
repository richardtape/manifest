export interface SourceRef {
  repoPath: string
  commitSha: string
}
export interface ImageRef {
  digest: string
  repository: string
}

export interface ServiceBinding {
  /** Deterministic, derived from (project, environment, service name). */
  name: string
  type: string
  version: string
  environmentId: string
  projectSlug: string
  /**
   * Resolved by the CALLER, never by the driver.
   *
   * §12 stores service credentials in `secrets/`, which lives over Postgres —
   * and §5 keeps `runtime/` free of `db/`, deliberately, so the driver cannot
   * read them. `deployRelease` resolves them through `ensureServiceCredentials`
   * and passes them in. Required rather than optional: an optional field here
   * would mean two producers of one value, which is the exact shape that
   * produced seven defects in one session of P3.
   */
  credentials: { username: string; password: string; database: string }
}
export interface ServiceHandle {
  id: string
  name: string
  endpoint: string
}

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
  /**
   * Files the platform places INSIDE the container before it starts.
   *
   * §8 names two variables as paths to files Manifest MOUNTS —
   * `SAML_IDP_CERT_PATH` and `SAML_PRIVATE_KEY_PATH` — and until 2026-09-08
   * there was no way to put a file in a container at all, so those rows named
   * paths nothing created and the blueprint's `readFileSync` would have thrown
   * ENOENT at startup. Same shape as `MONGODB_DB_NAME`: a contract row with no
   * producer.
   *
   * Optional because the fake driver and every P2/P3 caller predate it.
   */
  files?: InstanceFile[]
}

export interface InstanceFile {
  /** Absolute path inside the container. Its parent must already exist. */
  path: string
  contents: string
  /** Octal; default 0o444. A private key wants 0o400 and an explicit `uid`. */
  mode?: number
  /** Owner uid inside the container; default 0 (root). */
  uid?: number
  /** Owner gid inside the container; default 0. A key the app must read but must
   *  not be able to rewrite is root-owned, group-readable, mode 0440. */
  gid?: number
}
export interface InstanceHandle {
  id: string
  name: string
  url: string
}

export type InstanceState =
  | 'pending'
  | 'building'
  | 'provisioning'
  | 'starting'
  | 'healthy'
  | 'failed'
  | 'hibernated'
  | 'waking'
  | 'destroying'
  | 'gone'

export interface InstanceStatus {
  id: string
  state: InstanceState
  healthy: boolean
  message?: string
}

export interface LogOpts {
  follow?: boolean
  tail?: number
}
export interface LogLine {
  at: Date
  stream: 'stdout' | 'stderr'
  text: string
}

export interface ExecOpts {
  cwd?: string
  env?: Record<string, string>
}
export interface ExecStream {
  stdout: AsyncIterable<string>
  stderr: AsyncIterable<string>
  exitCode: Promise<number>
}

export interface SnapshotRef {
  id: string
  createdAt: Date
  sizeBytes: number
}

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
  /**
   * §12 lists "resource ceilings including `pids` and disk". `pids` enforces;
   * disk does not on Docker Desktop. `--storage-opt size=` is accepted by the
   * daemon and recorded in HostConfig, and a 128 MB write into a 64 MB quota
   * succeeds — the containerd `overlayfs` snapshotter has no project-quota
   * backing (S1-controls-settled.md). Declared here, like the userns gap above,
   * rather than implied by an `InstanceSpec.resources.diskMi` nothing honours.
   */
  enforcesDiskQuota: boolean
}

export interface Driver {
  readonly name: string
  buildImage(
    src: SourceRef,
    spec: { blueprintRef: string; projectSlug: string },
  ): Promise<ImageRef>
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
export function instanceName(
  projectSlug: string,
  environmentKind: string,
  releaseId: string,
): string {
  return `${projectSlug}-${environmentKind}-${releaseId.slice(0, 8)}`
}

export function serviceName(
  projectSlug: string,
  environmentKind: string,
  declared: string,
): string {
  return `${projectSlug}-${environmentKind}-${declared}`
}
