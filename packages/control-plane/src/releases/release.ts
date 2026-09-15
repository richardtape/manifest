import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { builds, environments, instances, projects, releases } from '../db/index.js'
import type { BlueprintRegistry } from '../blueprints/index.js'
import type { Driver, InstanceFile } from '../runtime/index.js'
import { instanceName, serviceName } from '../runtime/index.js'
import { nextState } from '../runtime/index.js'
import type { InjectedService, ResolvedConfig } from '../spec/index.js'
import { INJECTED_FILE_PATHS, renderInjection, toMebibytes } from '../spec/index.js'
import type { AppSecretResolver } from '../secrets/index.js'
import type { ServiceCredentialResolver } from '../services/index.js'
import type { SpRegistration, SsoRegistrar } from '../sso/index.js'
import type { Config } from '../config.js'
import { assertPromotable } from './promotion.js'

/**
 * What `deployRelease` needs that is neither the database nor the driver.
 *
 * Threaded through arguments rather than imported, so `releases/` stays testable
 * with no key material and no IdP — which is what makes §16's fake-driver tier
 * worth having. P4a Task 9 adds `sso`; Task 11 adds `appSecrets` and
 * `blueprints`.
 *
 * Four bound objects rather than a `MasterKeypair` and a pool: the module that
 * deploys holds no key material and opens no second connection.
 */
export interface DeployDeps {
  secrets: ServiceCredentialResolver
  /** §8's `SESSION_SECRET`, generated once per app+environment and then stable. */
  appSecrets: AppSecretResolver
  sso: SsoRegistrar
  /**
   * Read for ONE value: `runtime.run_as_uid`, which is the uid the app runs as
   * and — by the blueprint's own Dockerfile, `addgroup -g {{RUN_AS_UID}}` — the
   * gid of its group. §8's `SAML_PRIVATE_KEY_PATH` needs it: §12's `CapDrop: ALL`
   * takes `CAP_DAC_OVERRIDE` with it, so a file the app must read is reachable by
   * ownership or not at all.
   */
  blueprints: BlueprintRegistry
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
        'None of those entities exists yet: they are P6’s, and this gate stays closed ' +
        'until they do.',
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

  // The PROJECT's blueprint reference, which is what the build was made against
  // (`startBuild` takes `project.blueprintRef`). Read here rather than from the
  // manifest's `blueprint:` field, so the descriptor consulted for `run_as_uid`
  // is the one the image was actually built from.
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, environment.projectId))
  if (!project) {
    throw new ReleaseError(
      'RELEASE_PROJECT_NOT_FOUND',
      `environment '${environment.id}' names project '${environment.projectId}', which does not exist`,
    )
  }
  const blueprintRef = project.blueprintRef

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
   * The NAMING is no longer here: Task 11 moved it to `renderInjection`, which is
   * the single producer of every §8 variable. This loop produces two things —
   * the handles the driver needs, and the (type, endpoint) pairs the renderer
   * needs — and pairs them where both are known, in one iteration, rather than
   * leaving two arrays to agree by index.
   */
  const serviceHandles = []
  const boundServices: InjectedService[] = []
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
    boundServices.push({ type: declared.type, endpoint: handle.endpoint })
  }

  /**
   * §9's Service Provider, registered BEFORE the container starts.
   *
   * The ordering is the whole point and it is asserted, not commented: an app that
   * comes up and redirects a user to the IdP before its metadata row exists gets
   * "Metadata not found" on its first login — a real user-visible failure, for a
   * race nobody would reproduce on demand.
   *
   * After the service loop rather than before it, deliberately: the registration
   * writes two audit Events, and `registerServiceProvider` builds their redactor
   * from the app's own secret set. Running it last means that set already holds the
   * service credentials this deploy just stored, so §14's redaction covers them
   * too. Both positions satisfy "before ensureInstance"; this one covers more.
   *
   * `auth` is optional at runtime because §13 FROZE the resolved config at release
   * time and releases created before `ResolvedConfig.auth` existed do not have it.
   * Those apps were deployed with no sign-on, so that is what they keep.
   */
  /**
   * §8's `SESSION_SECRET` — "generated per app+environment", and stable across
   * deploys, or every user of a redeployed app is silently signed out.
   *
   * Resolved BEFORE the registration below, deliberately: that call builds its
   * audit redactor from the app's own secret set, so storing this first means
   * §14's redaction covers it too. The same reason the registration itself runs
   * after the service loop.
   */
  const sessionSecret = await deps.appSecrets.sessionSecret(db, {
    projectId: environment.projectId,
    environmentKind: environment.kind,
  })

  const auth = resolved.auth as ResolvedConfig['auth'] | undefined
  let registration: SpRegistration | undefined
  let idpCertificatePem: string | undefined
  if (auth?.provider === 'cwl') {
    registration = await deps.sso.registerServiceProvider(db, {
      projectId: environment.projectId,
      slug: projectSlug,
      environmentKind: environment.kind,
      // §9: "Origins are never accepted as input." The hostname is the
      // environment row's, which the platform assigned — never the manifest's.
      hostname: environment.hostname,
      auth,
    })
    idpCertificatePem = await deps.sso.idpSigningCertificate()
  }

  /**
   * §8's two file rows, placed by the platform: "Manifest mounts it; the
   * blueprint never fetches it at runtime."
   *
   * The paths are `spec/injection.ts`'s constants, the same ones the variables
   * carry — so the path an app is told and the path a file is written to are one
   * value, not two that agree. The modes are what §12's hardening leaves
   * possible: `CapDrop: ALL` takes `CAP_DAC_OVERRIDE`, so root inside the
   * container cannot read past permission bits (measured 2026-09-08, a 0400 file
   * owned by uid 10001 was unreadable by root). The key is therefore ROOT-owned,
   * group-readable at 0440 with the blueprint's gid — the app can read it and
   * cannot rewrite it — and the certificate is world-readable at 0444 because it
   * is public.
   */
  const files: InstanceFile[] = []
  if (registration !== undefined && idpCertificatePem !== undefined) {
    const runAsUid = blueprintRunAsUid(deps.blueprints, blueprintRef)
    files.push({
      path: INJECTED_FILE_PATHS.idpCertificate,
      contents: idpCertificatePem,
      mode: 0o444,
    })
    if (environment.kind !== 'sandbox') {
      files.push({
        path: INJECTED_FILE_PATHS.spPrivateKey,
        contents: registration.keypair.privateKeyPem,
        mode: 0o440,
        uid: 0,
        gid: runAsUid,
      })
    }
  }

  const handle = await driver.ensureInstance({
    name,
    projectSlug,
    environmentKind: environment.kind,
    releaseId: release.id,
    image: { digest, repository },
    /**
     * §8's ENTIRE contract, from one function. Nothing is added here.
     *
     * P3 built an ad-hoc block in this position — the app's own env, then PORT,
     * MANIFEST_ENV, MANIFEST_PROJECT_SLUG, MANIFEST_APP_URL, then the service
     * endpoints — and it was the platform's second producer of these names.
     * `MONGODB_DB_NAME` is what that cost: §8 requires it, the block injected
     * only the catalogue's `envVar`, and every deployed app wrote to a database
     * called `app` while two Docker tests set the variable themselves and
     * passed. The block is deleted rather than extended, and
     * `grep -rn MANIFEST_APP_URL src --include='*.ts'` outside the tests now
     * finds `spec/injection.ts` alone.
     */
    env: renderInjection({
      resolved,
      environmentKind: environment.kind,
      hostname: environment.hostname,
      projectSlug,
      idp: config.idp,
      ...(registration !== undefined ? { spEntity: registration.entity } : {}),
      secrets: { sessionSecret },
      services: boundServices,
    }),
    ...(files.length > 0 ? { files } : {}),
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
    // §10's gateway joins the app's network only for an app that declares models
    // (P4b Task 8). `?.` because a release frozen before `ResolvedConfig.ai` existed
    // has no `ai` key at all (pre-flight 64).
    needsAiGateway: (resolved.ai?.models ?? []).length > 0,
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

/**
 * The uid the app runs as, and therefore the gid of its group.
 *
 * `blueprint.yaml` states `run_as_uid`; the blueprint's own Dockerfile creates
 * the group with `addgroup -g {{RUN_AS_UID}}`, so one number names both. Read
 * from the descriptor rather than defaulted, because a wrong gid on the SP
 * private key is silent: §12's `CapDrop: ALL` removes `CAP_DAC_OVERRIDE`, so the
 * app simply cannot open the file, and `passport-ubcshib` reports a failure to
 * load a key rather than a permission problem.
 */
function blueprintRunAsUid(blueprints: BlueprintRegistry, ref: string): number {
  const descriptor = blueprints.resolve(ref)
  if (!descriptor) {
    throw new ReleaseError(
      'RELEASE_BLUEPRINT_NOT_FOUND',
      `no blueprint '${ref}'. Available: ${blueprints
        .list()
        .map((b) => `${b.blueprint}@${b.major_version}`)
        .join(', ')}`,
    )
  }
  return descriptor.runtime.run_as_uid
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
