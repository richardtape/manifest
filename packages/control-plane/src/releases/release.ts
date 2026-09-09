import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { builds, environments, instances, releases } from '../db/index.js'
import type { Driver } from '../runtime/index.js'
import { instanceName, serviceName } from '../runtime/index.js'
import { nextState } from '../runtime/index.js'
import type { ResolvedConfig } from '../spec/index.js'
import { toMebibytes } from '../spec/index.js'
import { resolveServiceImage } from '../services/index.js'
import type { ServiceCredentialResolver } from '../services/index.js'
import type { Config } from '../config.js'
import { assertPromotable } from './promotion.js'

/**
 * What `deployRelease` needs that is neither the database nor the driver.
 *
 * Threaded through arguments rather than imported, so `releases/` stays testable
 * with no key material and no IdP — which is what makes §16's fake-driver tier
 * worth having. P4a Task 9 adds `sso` here.
 */
export interface DeployDeps {
  secrets: ServiceCredentialResolver
}

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
export type ResolvedConfigSet = Record<
  'sandbox' | 'staging' | 'production',
  ResolvedConfig
>

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
  if (!build)
    throw new ReleaseError('RELEASE_BUILD_NOT_FOUND', `no build '${input.buildId}'`)
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
  deps: DeployDeps,
  input: DeployInput,
  healthWait: HealthWait = DEFAULT_HEALTH_WAIT,
): Promise<Instance> {
  const [release] = await db
    .select()
    .from(releases)
    .where(eq(releases.id, input.releaseId))
  if (!release)
    throw new ReleaseError('RELEASE_NOT_FOUND', `no release '${input.releaseId}'`)

  const [environment] = await db
    .select()
    .from(environments)
    .where(eq(environments.id, input.environmentId))
  if (!environment) {
    throw new ReleaseError(
      'RELEASE_ENVIRONMENT_NOT_FOUND',
      `no environment '${input.environmentId}'`,
    )
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
  if (!digest)
    throw new ReleaseError(
      'RELEASE_DIGEST_MISSING',
      `release '${release.id}' has no digest`,
    )

  // §23 gives the hostname as `<slug>.<zone>`, so the first label is the slug.
  const projectSlug = environment.hostname.split('.')[0]!
  // THE REPOSITORY THE BUILD RECORDED, never one re-derived here. This was
  // `local/${projectSlug}`, and an unqualified name is DOCKER HUB to the daemon:
  // every deploy through the control plane died with `failed to resolve reference
  // "docker.io/local/fixture-app@sha256:…": 401 Unauthorized`, while every test
  // passed because tests pass the ImageRef `buildImage` returned. Third time in
  // this repository that the tests constructed a value correctly and the
  // production path rebuilt it wrongly.
  const repository = build.imageRepository
  if (!repository)
    throw new ReleaseError(
      'RELEASE_IMAGE_REPOSITORY_MISSING',
      `build '${release.buildId}' recorded a digest but no repository, so the image it ` +
        'produced cannot be named. Re-run the build: a build from before the repository ' +
        'was recorded cannot be deployed, because guessing the registry host is what this ' +
        'field exists to stop.',
    )
  // §13, scoped to the driver rather than the environment kind: a driver targeting
  // remote infrastructure refuses a laptop-built image, because the architectures
  // differ and "promote the exact digest" makes that unresolvable at deploy time.
  // Extracted to promotion.ts (P3 Task 16) so the namespace test survives a
  // registry host appearing in the repository; the error class and code are P2's,
  // unchanged, which is why P2's own test still passes.
  assertPromotable(driver, { repository, digest })

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

  /**
   * THE SERVICE WIRE. Until this existed `services: []` was a hardcoded literal,
   * so `Driver.ensureService` — built, tested, with a connectable endpoint — was
   * never called, and every deployed app came up with no database.
   *
   * This is deliberately the SMALL half of §8. P4 owns the injection contract
   * proper: the general declared-service-to-variable mapping, secret handling and
   * the drift test. What happens here is only the wire — one `ensureService` per
   * declared service, and the endpoint under the name the catalogue gives it.
   * P4 replaces the naming, not the plumbing.
   */
  const serviceHandles = []
  const serviceEnv: Record<string, string> = {}
  for (const declared of resolved.services) {
    const bindingName = serviceName(projectSlug, environment.kind, declared.name)
    // §12: the credentials are STORED, and the driver cannot read the store —
    // §5 keeps `runtime/` free of `db/`. So they are resolved here, once, and
    // handed over. One producer: the value the container was created with is
    // the value the app is given, by construction rather than by agreement.
    const credentials = await deps.secrets.forService(db, {
      projectId: environment.projectId,
      environmentKind: environment.kind,
      binding: { name: bindingName, type: declared.type, projectSlug },
    })
    const handle = await driver.ensureService({
      name: bindingName,
      type: declared.type,
      version: declared.version,
      environmentId: environment.id,
      projectSlug,
      credentials,
    })
    serviceHandles.push(handle)
    serviceEnv[resolveServiceImage(declared.type, declared.version).envVar] =
      handle.endpoint
  }

  const handle = await driver.ensureInstance({
    name,
    projectSlug,
    environmentKind: environment.kind,
    releaseId: release.id,
    image: { digest, repository },
    env: {
      ...Object.fromEntries(
        resolved.env.filter((e) => e.value !== undefined).map((e) => [e.name, e.value!]),
      ),
      /**
       * THE PLATFORM'S OWN BINDINGS, and `PORT` is not a convenience.
       *
       * The platform chooses the port: it is what the container HEALTHCHECK probes
       * and what the Caddy route uses as its upstream. Nothing told the APP, so an
       * app that did not happen to hardcode the blueprint's `default_port` listened
       * somewhere else and was unreachable — the container ran, the route existed,
       * and the edge answered 502 for ever. Measured by `make demo` on 2026-09-07
       * with a manifest declaring `runtime.port: 8080`: the app logged
       * `"port":3000` and the deploy timed out.
       *
       * §8's full injection contract, with its general mapping and its drift test,
       * remains P4's. This is the subset without which a deploy cannot work at all,
       * plus the three identity variables §11 gives every instance.
       */
      PORT: String(resolved.port),
      MANIFEST_ENV: environment.kind,
      MANIFEST_PROJECT_SLUG: projectSlug,
      MANIFEST_APP_URL: `https://${environment.hostname}`,
      // AFTER the app's own, so a declared variable cannot shadow a binding the
      // platform made. An app that sets MONGODB_URI itself would otherwise be
      // pointed at a database of its choosing while appearing to be bound to its
      // own — §12's "application code is untrusted" applied to the spec.
      ...serviceEnv,
    },
    port: resolved.port,
    healthPath: resolved.health,
    resources: {
      cpu: resolved.resources.cpu,
      memoryMi: toMebibytes(resolved.resources.memory),
      pids: resolved.resources.pids,
      diskMi: toMebibytes(resolved.resources.disk),
    },
    services: serviceHandles,
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
