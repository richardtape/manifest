import { and, eq, ne } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import {
  builds,
  environments,
  instances,
  projects,
  releases,
  routes,
  withEnvironmentLock,
} from '../db/index.js'
import type { BlueprintRegistry } from '../blueprints/index.js'
import type { Driver, InstanceFile, InstanceHandle } from '../runtime/index.js'
import {
  InstanceNotReadyError,
  canTransition,
  instanceName,
  serviceName,
} from '../runtime/index.js'
import { listenerFor } from '../routing/index.js'
import {
  captureIncident,
  makeRedactor,
  publishEvent,
  type EventBus,
} from '../observability/index.js'
import { nextState } from '../runtime/index.js'
import type { InjectedService, InjectionContext, ResolvedConfig } from '../spec/index.js'
import {
  CLASSIFICATION_RANK,
  INJECTED_FILE_PATHS,
  renderInjection,
  toMebibytes,
} from '../spec/index.js'
import type {
  AiKeyService,
  InstanceKeyScope,
  ModelCatalogue,
  ModelEntry,
} from '../ai/index.js'
import type { AppSecretResolver } from '../secrets/index.js'
import type { ServiceCredentialResolver } from '../services/index.js'
import type { SpRegistration, SsoRegistrar } from '../sso/index.js'
import type { Config } from '../config.js'
import { assertPromotable } from './promotion.js'
import type { Retirer } from './retire.js'

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
  /**
   * §10's key lifecycle — mint, commit, discard — with the LiteLLM client and the
   * master keypair already bound (P4b Task 9). `releases/` holds neither.
   */
  ai: AiKeyService
  /**
   * D17's catalogue, READ AGAIN AT DEPLOY. Validation checked the declared models
   * against it; the catalogue can move afterwards, and a release is redeployable long
   * after it was validated.
   */
  catalogue: ModelCatalogue
  /**
   * D23.2's stream (P4b Task 15): the instance's state, the Incident, and the key a
   * healthy instance was given — each recorded and published through `publishEvent`.
   */
  bus: EventBus
  /**
   * What reaps the instances this deploy replaced (P4c Task 7). `schedule` only: a
   * deploy asks for a pass and returns — R3, so a deploy is not a two-minute call —
   * and `idle()` belongs to the tests and the acceptance, which is why this is a
   * `Pick` rather than the whole retirer.
   */
  retirer: Pick<Retirer, 'schedule'>
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

  /**
   * §10's models, checked against the platform AS IT IS NOW, before the instance row,
   * the services or the Service Provider exist — so a refusal leaves nothing behind.
   * `?.` because a release frozen before `ResolvedConfig.ai` existed has no `ai` key at
   * all, and redeploys as the app with no AI it was (pre-flight 64).
   */
  const models = resolved.ai?.models ?? []
  const aiPlan = models.length > 0 ? await modelsForDeploy(deps, resolved) : undefined

  /**
   * EVERYTHING THAT CHANGES WHAT SERVES IS INSIDE THE LOCK (Decision 14): the instance
   * row, the mint, the ensure, the Route row and the marking. The DRAIN is not — a
   * second deploy must not wait two minutes for the first one's old container, which
   * is why the retirer is scheduled rather than awaited.
   *
   * A Postgres advisory lock, not an in-process mutex: `pnpm test` and a running
   * control plane are two processes against one database, and only Postgres sees both.
   */
  return withEnvironmentLock(environment.id, async () => {
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
    const instanceId = row!.id
    /**
     * §11's key gained the INSTANCE (P4c): a redeploy of the same release is a new
     * instance beside the one serving, so the name can no longer be computed before the
     * row exists — with the release alone in it, the two would collide on the name that
     * identifies the container and the second deploy could only replace the first.
     */
    const name = instanceName(projectSlug, environment.kind, release.id, instanceId)

    /**
     * WHAT SERVES RIGHT NOW: what a failure falls back to, and what this deploy
     * replaces. Read before anything is started, and from the DRIVER rather than from
     * the Route row — an app deployed before P4c has no row, and it is still the thing
     * people are using (Decision 20: there is no backfill).
     */
    const previous = await driver.servingInstance(environment.hostname)

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

    /**
     * THE APP'S OWN SECRET SET, read ONCE, here — for every redactor this deploy builds: the
     * instance's events, the Incident, and the key rotation (P4b Tasks 13 and 15).
     *
     * HERE, and not after the instance is recorded: every secret this deploy stores is stored
     * by now — the service credentials, `SESSION_SECRET`, the SP key — except the AI key,
     * which is not stored until the commit and is added to its own redactor by hand. And a set
     * that cannot be opened must refuse the deploy BEFORE anything starts or is minted. Read
     * after the row said healthy, the same failure threw with the instance recorded healthy
     * and a minted key neither committed nor discarded (P4b sitting 9, finding 162). §14's
     * redaction at capture fails closed: an event is never written under a partial set.
     */
    const secretScope = {
      projectId: environment.projectId,
      environmentKind: environment.kind,
    }
    const appSecretValues = await deps.appSecrets.secretValues(db, secretScope)
    const redact = makeRedactor(appSecretValues)

    /**
     * §10's key, MINTED BEFORE THE CONTAINER STARTS — the container needs it in its
     * environment, and an app that asks a question with no key gets a 401, a race nobody
     * reproduces on demand — and STORED AGAINST THIS INSTANCE AT ONCE (P4c, Decision 15).
     *
     * P4b minted it here and COMMITTED it after health, which revoked the previous key
     * while the previous container was still serving — tolerable only because nothing
     * drained. Now each instance holds its own key under its own name, the retirer
     * revokes one exactly when its instance is retired, and a key whose instance failed
     * is still recorded, so the next retire cleans it up rather than losing the only
     * reference to a live key.
     *
     * After the Service Provider and the files, so nothing that can still refuse the
     * deploy runs between the mint and the `try` that discards it.
     */
    let minted: string | undefined
    if (aiPlan !== undefined) {
      minted = await deps.ai.mintAppKey({
        projectId: environment.projectId,
        projectSlug,
        kind: environment.kind,
        models,
        monthlyUsd: aiPlan.monthlyUsd,
      })
      try {
        await deps.ai.storeInstanceKey(db, {
          projectId: environment.projectId,
          kind: environment.kind,
          instanceId,
          key: minted,
        })
      } catch (error) {
        // Nothing recorded it, so nothing else can ever revoke it: BY VALUE, here, and
        // the store's own failure is what reaches the caller.
        await discardMintedKey(deps.ai, minted, environment)
        throw error
      }
    }
    // `ModelEntry.kind`'s first reader (P4b finding 46): the first declared model of each
    // kind is the one the app is told about.
    const chat = aiPlan?.declared.find((m) => m.kind === 'chat')
    const embedding = aiPlan?.declared.find((m) => m.kind === 'embedding')
    const ai: InjectionContext['ai'] =
      minted === undefined
        ? undefined
        : {
            // The IN-NETWORK endpoint, NEVER `config.litellm.url`. The two are not
            // interchangeable and fail silently when swapped: an app handed the control
            // plane's `http://127.0.0.1:7106` gets ECONNREFUSED from inside its own
            // `--internal` network, and the symptom is "the AI is down".
            endpoint: config.litellm.internalUrl,
            apiKey: minted,
            // Conditional spread, not `x ?? undefined`: `exactOptionalPropertyTypes`.
            ...(chat === undefined ? {} : { defaultChatModel: chat.name }),
            ...(embedding === undefined ? {} : { embeddingModel: embedding.name }),
          }

    let handle: InstanceHandle
    let healthy: boolean
    // What the platform checked, in words, when it did not pass: §14's failing check.
    let failedCheck = ''
    try {
      handle = await driver.ensureInstance({
        name,
        instanceId,
        // §23 assigned it and this function holds the environment row, so the driver is
        // HANDED it rather than re-deriving it (P4c Task 2).
        hostname: environment.hostname,
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
          ...(ai === undefined ? {} : { ai }),
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
        needsAiGateway: models.length > 0,
      })
      const health = await waitForHealth(driver, handle.id, healthWait)
      healthy = health.healthy
      if (!health.healthy) {
        failedCheck = `health: GET ${resolved.health} on port ${resolved.port} — ${health.why}`
      }
    } catch (error) {
      if (error instanceof InstanceNotReadyError) {
        /**
         * A driver that STARTED the instance and could not make it ready says so with
         * the handle (P4b Task 13), and that is a failed deploy — recorded like the one
         * above, as a row in `failed` and an Incident, not thrown. The instance exists,
         * and a failure a faculty member cannot see is the one §14 exists to prevent.
         * Until this, the Docker driver's refusal — the commonest real failure, an app
         * that crashes as it starts — left the row parked in `provisioning`, a state
         * nothing moves it out of, with no record of why.
         */
        handle = error.handle
        healthy = false
        failedCheck = error.check
      } else {
        // The instance never started, or its health could not be read. The previous
        // container still holds its own key and keeps it; this instance's key is
        // revoked by NAME, because it is recorded — a failed revoke then leaves the
        // record for the next retire. THE ORIGINAL ERROR IS WHAT THE CALLER GETS.
        if (minted !== undefined) {
          await revokeInstanceKeyQuietly(deps.ai, db, {
            projectId: environment.projectId,
            kind: environment.kind,
            instanceId,
          })
        }
        throw error
      }
    }
    /**
     * THE ROUTE MOVED AND THE CONTAINER THEN FAILED ITS OWN HEALTH CHECK (Decision 18).
     *
     * `ensureInstance` resolves once the EDGE reaches the new instance; Docker's
     * HEALTHCHECK runs on its own interval and can disagree a second later. §13: deploying
     * a release never takes down the one it replaces — so the hostname goes back to the
     * instance that was serving when this deploy started. A readiness refusal never gets
     * here, because that one leaves the route where it was.
     */
    let routeDialsFailed =
      !healthy && (await driver.servingInstance(environment.hostname)) === handle.id
    if (routeDialsFailed && previous !== undefined) {
      routeDialsFailed = await driver
        .restoreRoute(previous)
        .then(() => false)
        .catch((error: unknown) => {
          console.error(
            JSON.stringify({
              level: 'error',
              msg: 'the previous instance could not be put back after a failed health check; the app is serving a failed instance',
              environmentId: environment.id,
              error: (error as { code?: string }).code ?? (error as Error).name,
            }),
          )
          return true
        })
    }

    // provisioning -> starting the moment the driver has bound services and the
    // container exists; then health decides between healthy and failed.
    const starting = nextState('provisioning', 'services_bound')
    const state = nextState(starting, healthy ? 'health_passed' : 'health_failed')

    const [updated] = await db
      .update(instances)
      .set({ state, handle: handle.id, lastSeenAt: new Date() })
      .where(eq(instances.id, row!.id))
      .returning()

    if (healthy) {
      /**
       * THE PLATFORM'S RECORD OF WHAT SERVES — §6's `Route`, specified since P2 and
       * built in P4c Task 6. Boot re-applies the edge's routes from these rows (§12,
       * Task 9), `GET /environments/:environmentId` reports the instance they name
       * rather than the newest deploy, and the retirer reads them to know whether the
       * environment's pre-P4c key is still somebody's.
       *
       * Upserted on the HOSTNAME: one hostname reaches one instance, and a redeploy
       * moves the row it already has rather than adding a second.
       */
      await db
        .insert(routes)
        .values({
          instanceId,
          hostname: environment.hostname,
          listener: listenerFor(environment.kind),
          kind: 'canonical',
        })
        .onConflictDoUpdate({ target: routes.hostname, set: { instanceId } })

      /**
       * Every other instance of this environment is on its way out (Decision 17). The
       * ROWS are how a console sees what is happening; the CONTAINERS are what the
       * retirer actually reads, and it reads them from the driver.
       */
      const others = await db
        .select({ id: instances.id, state: instances.state })
        .from(instances)
        .where(
          and(eq(instances.environmentId, environment.id), ne(instances.id, instanceId)),
        )
      for (const other of others) {
        if (other.state === 'destroying' || other.state === 'gone') continue
        if (!canTransition(other.state, 'destroy_requested')) continue
        await db
          .update(instances)
          .set({ state: nextState(other.state, 'destroy_requested') })
          .where(eq(instances.id, other.id))
      }
    }

    /**
     * §14's Incident, for a deploy that did not become healthy — by either route above.
     * The one moment Phase 1 has (Decision 13): a crash LOOP needs the reconciler, which
     * is Phase 4 (D10), and a deploy that never reached healthy is right here, with the
     * handle, the release and the failing check in hand.
     *
     * AFTER the row records `failed` and its handle, because the Incident reads both from
     * the row. Redacted with `redact`, built from the app's OWN secret set before the mint —
     * by which point this deploy has stored every secret it stores, service credentials,
     * SESSION_SECRET and the SP key — so an app that prints its environment as it dies has
     * none of them persisted.
     *
     * A capture that fails reaches the caller. The row already says `failed`, so the
     * instance is recorded as what it is; a missing Incident is not swallowed.
     *
     * D23.2's instance state transition, recorded and streamed (P4b Task 15) — carrying
     * the STATE, because a deploy is a `200` whether it worked or not (sitting 8, finding
     * 146) and a client must never read "the call returned" as "the app is up".
     */
    const instanceDetail = {
      instanceId: updated!.id,
      releaseId: release.id,
      environmentId: environment.id,
      environment: environment.kind,
      state: updated!.state,
    }
    if (!healthy) {
      await publishEvent(
        db,
        deps.bus,
        {
          projectId: environment.projectId,
          subject: `instance:${updated!.id}`,
          type: 'instance.failed',
          machineDetail: { ...instanceDetail, failedCheck },
          humanMessage: `${projectSlug} did not start in ${environment.kind}.`,
        },
        redact,
      )
      const incident = await captureIncident(
        db,
        driver,
        { instanceId: updated!.id, failedCheck },
        redact,
      )
      // Announced once it EXISTS, and named, so a client that reacts by reading
      // `GET /environments/:environmentId/incidents` finds it there. Published HERE, at
      // the call site, rather than inside `captureIncident`: the capture stays a store
      // function with no bus in its signature, and the deploy — which holds the bus —
      // narrates (sitting 8's note left this call to Task 15).
      await publishEvent(
        db,
        deps.bus,
        {
          projectId: environment.projectId,
          subject: `incident:${incident.id}`,
          type: 'incident.opened',
          machineDetail: {
            incidentId: incident.id,
            instanceId: updated!.id,
            releaseId: release.id,
            environment: environment.kind,
          },
          humanMessage:
            `${projectSlug} failed to start in ${environment.kind}. The incident records ` +
            'what it printed and what changed since it last worked.',
        },
        redact,
      )
    } else {
      await publishEvent(
        db,
        deps.bus,
        {
          projectId: environment.projectId,
          subject: `instance:${updated!.id}`,
          type: 'instance.healthy',
          machineDetail: instanceDetail,
          humanMessage: `${projectSlug} is running in ${environment.kind}.`,
        },
        redact,
      )
      if (minted !== undefined) {
        /**
         * §10's rotation is complete at the moment the ROUTE MOVED — which is now, not
         * at a commit that no longer exists (P4c). The new instance is serving with its
         * own key; the previous instance keeps its own until the retirer revokes it,
         * after its drain.
         *
         * NEVER THE KEY, in either field. And the redactor holds it anyway: the set read
         * before the mint plus the key this instance was given — added by hand rather
         * than by decrypting the whole set again, which could fail after a rotation that
         * has already succeeded.
         */
        await publishEvent(
          db,
          deps.bus,
          {
            projectId: environment.projectId,
            subject: `instance:${updated!.id}`,
            type: 'ai.key_rotated',
            machineDetail: {
              instanceId: updated!.id,
              environment: environment.kind,
              models: [...models],
            },
            humanMessage: `${projectSlug} was given a new AI access key for this release in ${environment.kind}.`,
          },
          makeRedactor([...appSecretValues, minted]),
        )
      }
    }

    if (!healthy) {
      /**
       * §11: an instance that never becomes ready "is removed once its Incident is
       * captured (§14)". The Incident above read its exit code and its last 200 log
       * lines THROUGH this handle; now the container goes, and its `-files` volume with
       * it — that volume holds the app's SP private key, so R5's "a failed deploy leaks
       * nothing" is not merely tidiness.
       *
       * TWO REMOVALS, because a retire never changes what a hostname reaches. When the
       * route still dials this instance — a FIRST deploy of an environment, which has no
       * previous instance to fall back on, or a restore that failed —  `retireInstance`
       * refuses it with `INSTANCE_SERVING` and the container survives (sitting 5's
       * correction 3). `destroyInstance` takes the route with the container, which leaves
       * the hostname on the edge's wildcard: honest, and the app was never up.
       */
      const removed = routeDialsFailed
        ? driver.destroyInstance(handle.id)
        : driver.retireInstance(handle.id, { drainMs: 0 })
      await removed.catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'a failed instance could not be removed; the next deploy or boot will retire it',
            instanceId,
            error: (error as { code?: string }).code ?? (error as Error).name,
          }),
        )
      })
      if (minted !== undefined) {
        await revokeInstanceKeyQuietly(deps.ai, db, {
          projectId: environment.projectId,
          kind: environment.kind,
          instanceId,
        })
      }
    } else {
      /**
       * THE CALLER TASKS 5, 6 AND 7 WERE BUILT FOR. Every instance of this environment
       * that does not serve — the one this deploy replaced, and the backlog from before
       * P4c (R7) — is drained and removed in the background. `schedule` returns at once;
       * the pass takes this environment's lock itself, so it waits for this deploy to
       * finish rather than racing it.
       */
      deps.retirer.schedule(environment.id)
    }
    return updated!
  })
}

/**
 * What an AI release needs from the platform AS IT IS NOW: AI switched on, a budget
 * LiteLLM will not refuse every request against, and every declared model still
 * offered, still classified and still approved for the app's data. Validation checked
 * each of these; the platform can move between validation and deploy.
 */
async function modelsForDeploy(
  deps: DeployDeps,
  resolved: ResolvedConfig,
): Promise<{ declared: ModelEntry[]; monthlyUsd: number }> {
  /**
   * P4b sitting 5's decision: a release that declares models, deployed with AI switched
   * off. Validation refuses such a SPEC; a release validated before the switch still
   * exists and can be redeployed, and there is no client to mint with. So it is refused
   * with a code that names the setting — never a TypeError on `undefined`, and never a
   * render with an empty LLM_API_KEY.
   *
   * TWO INDEPENDENT READS of `MANIFEST_AI_ENABLED`, the catalogue's and the key
   * service's: a guard whose enabling condition is read once is one edit from gone.
   */
  if (!deps.catalogue.enabled || !deps.ai.enabled) {
    throw new ReleaseError(
      'RELEASE_AI_DISABLED',
      `this release declares ai.models (${resolved.ai.models.join(', ')}) and AI is ` +
        'switched off on this control plane (MANIFEST_AI_ENABLED=0). Switch it on, or ' +
        'release a manifest that declares no models.',
    )
  }
  const monthlyUsd = resolved.ai.budget.project_monthly_usd
  if (monthlyUsd === undefined || !(monthlyUsd > 0)) {
    throw new ReleaseError(
      'RELEASE_AI_BUDGET_MISSING',
      `this release declares ai.models with a project AI budget of ${monthlyUsd ?? 'none'}. ` +
        'LiteLLM refuses every request against a budget of 0, so the app would start ' +
        'healthy and fail its first question. Validate the manifest again and release it.',
    )
  }
  const { models: offered, unclassified } = await deps.catalogue.get()
  const declared = resolved.ai.models.map((name) => {
    if (unclassified.includes(name)) {
      throw new ReleaseError(
        'RELEASE_MODEL_UNCLASSIFIED',
        `the model '${name}' has no data classification on this platform any more, so ` +
          'no app may use it (D17). An administrator must classify it.',
      )
    }
    const entry = offered.find((m) => m.name === name)
    if (entry === undefined) {
      // Refused rather than injected: LiteLLM would refuse the name on the app's first
      // question, and the deploy would have reported success.
      throw new ReleaseError(
        'RELEASE_MODEL_NOT_IN_CATALOGUE',
        `the model '${name}' is no longer offered`,
      )
    }
    // D17 again, at deploy. A model whose approval was LOWERED since validation would
    // otherwise be handed data above its classification — §7's "privacy incident at
    // runtime", reached through a redeploy.
    if (
      CLASSIFICATION_RANK[entry.maxClassification] <
      CLASSIFICATION_RANK[resolved.classification]
    ) {
      throw new ReleaseError(
        'RELEASE_MODEL_CLASSIFICATION_TOO_LOW',
        `the model '${name}' is now approved only up to ${entry.maxClassification} data, ` +
          `and this app declares ${resolved.classification} (D17)`,
      )
    }
    return entry
  })
  return { declared, monthlyUsd }
}

/**
 * Revokes a key minted for an instance that never became healthy — and does not let a
 * failure to do so replace the deploy's own failure (Rich, 2026-09-14).
 *
 * The OPERATOR's record, on stderr: `console.error`, because this server runs with
 * `logger: false`. NEVER the key. What is left behind is confined to three routes,
 * bound by the app's budget, tagged with `metadata.manifest_project`, and deletable by
 * hand (P4b finding 55); reaping one is the reconciler's (Phase 4).
 */
async function discardMintedKey(
  ai: AiKeyService,
  key: string,
  environment: { projectId: string; kind: string },
): Promise<void> {
  try {
    await ai.discardAppKey(key)
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'a minted AI key could not be discarded after a failed deploy, and stays live until removed by hand',
        projectId: environment.projectId,
        environment: environment.kind,
        error: (error as { code?: string }).code ?? (error as Error).name,
      }),
    )
  }
}

/**
 * Revokes the key this instance was given, and never lets a gateway failure replace
 * the deploy's own failure (Rich, 2026-09-14).
 *
 * The key stays RECORDED when the revoke fails — `revokeInstanceKey` revokes before it
 * deletes — so the next retire of this environment tries again. That is the half of
 * P4b's "a minted key can outlive a failed deploy" that a key per instance closes.
 *
 * The OPERATOR's record, on stderr: `console.error`, because this server runs with
 * `logger: false`. Never the key.
 */
async function revokeInstanceKeyQuietly(
  ai: AiKeyService,
  db: Db,
  scope: InstanceKeyScope,
): Promise<void> {
  try {
    await ai.revokeInstanceKey(db, scope)
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'a minted AI key could not be revoked after a failed deploy; it stays recorded and the next retire will try again',
        projectId: scope.projectId,
        environment: scope.kind,
        error: (error as { code?: string }).code ?? (error as Error).name,
      }),
    )
  }
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

/**
 * Polls until the driver reports healthy, or the deadline passes — and says WHICH, so
 * §14's failing check can: "the driver gave up" and "we stopped waiting" send whoever
 * reads the Incident to different places.
 */
async function waitForHealth(
  driver: Driver,
  handleId: string,
  wait: HealthWait,
): Promise<{ healthy: true } | { healthy: false; why: string }> {
  const deadline = Date.now() + wait.timeoutMs
  for (;;) {
    const status = await driver.status(handleId)
    if (status.healthy) return { healthy: true }
    // A driver that has already given up will not become healthy by waiting.
    if (status.state === 'failed' || status.state === 'gone') {
      return {
        healthy: false,
        why: `the driver reported the instance as ${status.state}`,
      }
    }
    if (Date.now() >= deadline) {
      return {
        healthy: false,
        why: `it did not report healthy within ${wait.timeoutMs / 1000} s`,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, wait.intervalMs))
  }
}
