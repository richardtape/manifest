import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { builds, environments, instances, releases } from '../db/index.js'
import type { Driver } from '../runtime/index.js'
import { instanceName } from '../runtime/index.js'
import { nextState } from '../runtime/index.js'
import type { ResolvedConfig } from '../spec/index.js'
import { toMebibytes } from '../spec/index.js'
import type { Config } from '../config.js'

export type Release = typeof releases.$inferSelect
export type Instance = typeof instances.$inferSelect

export class ReleaseError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ReleaseError'
  }
}

/**
 * Every environment's resolution, frozen together at release time.
 *
 * A release resolved for one environment could not be promoted to another, which
 * would defeat §13's "promotion never rebuilds": production has its own `resources`
 * override (§7), so promoting a staging-shaped release would either apply the wrong
 * numbers or force a re-resolution the approver never saw. Freezing all three means
 * the diff reviewed at approval is exactly what each environment will get.
 */
export type ResolvedConfigSet = Record<'sandbox' | 'staging' | 'production', ResolvedConfig>

export interface CreateReleaseInput {
  projectId: string
  buildId: string
  appSpecId: string
  createdBy: string
  resolvedConfig: ResolvedConfigSet
  summary?: string
}

/**
 * §13: "A Release is immutable: Build (image digest) + AppSpec + resolved config."
 * The digest is checked here rather than at deploy, because a release without one
 * is not a release — approval binds to the digest, and binding to nothing is how
 * "promotion never rebuilds" quietly stops being true.
 */
export async function createRelease(db: Db, input: CreateReleaseInput): Promise<Release> {
  const [build] = await db.select().from(builds).where(eq(builds.id, input.buildId))
  if (!build) throw new ReleaseError('RELEASE_BUILD_NOT_FOUND', `no build '${input.buildId}'`)
  if (build.status !== 'succeeded' || !build.imageDigest) {
    throw new ReleaseError(
      'RELEASE_BUILD_NOT_DEPLOYABLE',
      `build '${build.id}' is '${build.status}' with digest '${build.imageDigest ?? 'none'}'`,
    )
  }

  const [release] = await db
    .insert(releases)
    .values({
      projectId: input.projectId,
      buildId: input.buildId,
      appSpecId: input.appSpecId,
      createdBy: input.createdBy,
      resolvedConfig: input.resolvedConfig,
      summary: input.summary ?? null,
    })
    .returning()
  return release!
}

export interface DeployInput {
  releaseId: string
  environmentId: string
}

/**
 * How long to wait for the instance to report healthy before recording `failed`.
 *
 * A single `status()` call is not enough: §11's `starting` is a state a real driver
 * leaves asynchronously, when its health check passes. Recording that first answer
 * would park the row in `starting` with nothing in P2 to move it — a state the
 * instance can never leave. The fake driver answers on the first poll, so this
 * costs the demo nothing; P3's Docker driver is the one that needs the wait.
 */
export interface HealthWait {
  timeoutMs: number
  intervalMs: number
}

export const DEFAULT_HEALTH_WAIT: HealthWait = { timeoutMs: 10_000, intervalMs: 50 }

export async function deployRelease(
  db: Db,
  driver: Driver,
  config: Config,
  input: DeployInput,
  healthWait: HealthWait = DEFAULT_HEALTH_WAIT,
): Promise<Instance> {
  const [release] = await db.select().from(releases).where(eq(releases.id, input.releaseId))
  if (!release) throw new ReleaseError('RELEASE_NOT_FOUND', `no release '${input.releaseId}'`)

  const [environment] = await db
    .select()
    .from(environments)
    .where(eq(environments.id, input.environmentId))
  if (!environment) {
    throw new ReleaseError('RELEASE_ENVIRONMENT_NOT_FOUND', `no environment '${input.environmentId}'`)
  }

  // Decisions item 5. The LaunchReadiness entities (§13) land in P4/P6; gating a
  // production launch on a checklist that does not exist would be a control on paper.
  if (environment.kind === 'production') {
    throw new ReleaseError(
      'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
      'production deployment requires the §13 LaunchReadiness checklist — IamRegistration ' +
        'active, PrivacyAssessment approved, rehearsal passed, scans clean, admin approval. ' +
        'None of those entities exists before P4, and P2 authenticates with a dev shim.',
    )
  }

  const [build] = await db.select().from(builds).where(eq(builds.id, release.buildId))
  const digest = build?.imageDigest
  if (!digest) throw new ReleaseError('RELEASE_DIGEST_MISSING', `release '${release.id}' has no digest`)

  // §23 gives the hostname as `<slug>.<zone>`, so the first label is the slug.
  const projectSlug = environment.hostname.split('.')[0]!
  // Must be the repository buildImage actually produced — ORIENTATION records that
  // per-app images live at `local/<slug>`. Deriving it from the project UUID named
  // a repository that has never existed, and the remote-driver refusal below would
  // then have been guarding a string nothing pushes to.
  const repository = `local/${projectSlug}`
  // §13, scoped to the driver rather than the environment kind: a driver targeting
  // remote infrastructure refuses a laptop-built image, because the architectures
  // differ and "promote the exact digest" makes that unresolvable at deploy time.
  if (driver.capabilities().remoteTarget && repository.startsWith('local/')) {
    throw new ReleaseError(
      'RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER',
      `driver '${driver.name}' declares a remote target and will not run a local/ image`,
    )
  }

  const resolved = (release.resolvedConfig as ResolvedConfigSet)[environment.kind]
  const name = instanceName(projectSlug, environment.kind, release.id)

  const [row] = await db
    .insert(instances)
    .values({
      environmentId: environment.id,
      releaseId: release.id,
      driver: driver.name,
      kind: 'web',
      state: 'provisioning',
    })
    .returning()

  const handle = await driver.ensureInstance({
    name,
    projectSlug,
    environmentKind: environment.kind,
    releaseId: release.id,
    image: { digest, repository },
    env: Object.fromEntries(
      resolved.env.filter((e) => e.value !== undefined).map((e) => [e.name, e.value!]),
    ),
    port: resolved.port,
    healthPath: resolved.health,
    resources: {
      cpu: resolved.resources.cpu,
      memoryMi: toMebibytes(resolved.resources.memory),
      pids: resolved.resources.pids,
      diskMi: toMebibytes(resolved.resources.disk),
    },
    services: [],
    egressAllow: resolved.egressAllow,
  })

  // provisioning -> starting the moment the driver has bound services and the
  // container exists; then health decides between healthy and failed.
  const starting = nextState('provisioning', 'services_bound')
  const healthy = await waitForHealth(driver, handle.id, healthWait)
  const state = nextState(starting, healthy ? 'health_passed' : 'health_failed')

  const [updated] = await db
    .update(instances)
    .set({ state, handle: handle.id, lastSeenAt: new Date() })
    .where(eq(instances.id, row!.id))
    .returning()
  return updated!
}

/** Polls until the driver reports healthy, or the deadline passes. */
async function waitForHealth(
  driver: Driver,
  handleId: string,
  wait: HealthWait,
): Promise<boolean> {
  const deadline = Date.now() + wait.timeoutMs
  for (;;) {
    const status = await driver.status(handleId)
    if (status.healthy) return true
    // A driver that has already given up will not become healthy by waiting.
    if (status.state === 'failed' || status.state === 'gone') return false
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, wait.intervalMs))
  }
}
