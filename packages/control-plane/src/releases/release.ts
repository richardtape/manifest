import { and, asc, eq, inArray, notInArray } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import {
  builds,
  environments,
  instances,
  loadRehearsals,
  projects,
  releases,
  replaceRouteSet,
  routes,
  withEnvironmentLock,
} from '../db/index.js'
import { offeredRefs, type BlueprintRegistry } from '../blueprints/index.js'
import type {
  Driver,
  InstanceFile,
  InstanceHandle,
  ServiceHandle,
} from '../runtime/index.js'
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
  withActor,
} from '../observability/index.js'
import { nextState } from '../runtime/index.js'
import type { InjectedService, InjectionContext, ResolvedConfig } from '../spec/index.js'
import {
  CLASSIFICATION_RANK,
  INJECTED_FILE_PATHS,
  levelName,
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
import { projectStateRefusal, type StoredAudience } from '../projects/index.js'
import { productionApprovalFor, unsatisfiedReason } from './approval.js'
import { launchedAt, recordLaunch } from './launched.js'
import { assertPromotable } from './promotion.js'
import type { Retirer } from './retire.js'
import { shapeFor, type DeployPurpose } from './shape.js'

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
  // SCOPED TO THE PROJECT (P6b Decision 6, [M6]): without it a member of two projects could
  // put one project's image under the other's name. The route reads the same condition
  // first; this is the second, independent read — what ORIENTATION §9 records a guard is.
  const [build] = await db
    .select()
    .from(builds)
    .where(and(eq(builds.id, input.buildId), eq(builds.projectId, input.projectId)))
  if (!build)
    throw new ReleaseError(
      'RELEASE_BUILD_NOT_FOUND',
      `no build '${input.buildId}' in project '${input.projectId}'`,
    )
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
  /**
   * WHY THIS DEPLOY IS HAPPENING, and it exists for exactly one distinction (P6a Task 15).
   *
   * `'launch'` — the default, and every caller that does not say otherwise — is an
   * administrator putting a release in front of the public, and §13 binds it to an
   * approved image digest, verified below before anything starts.
   *
   * `'rehearsal'` is D21's pre-production rehearsal (R2, Task 14), which deploys the
   * candidate into production **so that the administrator has its evidence in front of
   * them when they decide** — §13's checklist lists the rehearsal before the approval, and
   * Task 19's demo runs them in that order. It is the one deploy that legitimately precedes
   * an approval, it deploys the SAME digest the approval will later bind, and it is
   * reachable only through `POST /v1/projects/{id}/rehearsal`, which a person must hold
   * `launch:rehearse` for, in their own session — the owner, a collaborator or an administrator
   * since the launch path plan's Task 6b (an administrator's `launch:record` before it).
   *
   * **IT DEFAULTS TO THE CHECKED VALUE**, so a new caller is verified unless it says it is
   * a rehearsal — the opposite default would make every future caller an exemption nobody
   * wrote down.
   *
   * `'replacement'` is the set watcher's redeploy of a production set a member of which exited (A1
   * Task 6, `releases/watch.ts`): the release production already serves, deployed again beside the
   * survivors. It skips the route's §13 checklist — the watcher calls this function, never the route
   * (Rich, *"Skip the checklist"*) — and it is held to the approval's digest check as a launch is:
   * **the check's condition is `purpose !== 'rehearsal'`**, so no purpose added after this one can
   * skip it by being new (Review Focus 8). It records no launch.
   *
   * It is also what `shapeFor` reads, beside the kind and the audience, to give the deploy its
   * count — a rehearsal is ONE instance (A1 Decision 8), a replacement production's count. And
   * there is NO `instances` or `resources` field, deliberately: a caller never chooses a deploy's
   * shape (`shape.test.ts` holds it, as a type test).
   */
  purpose?: DeployPurpose
  /**
   * THE EXITED MEMBER A REPLACEMENT IS FOR — required with `purpose: 'replacement'`, refused with any
   * other. Under the environment's lock the deploy first reads that it is still a Route row: a
   * person's deploy since has already replaced the set, and the replacement then starts nothing
   * (`NothingToReplaceError`, after an operator line). Each instance it starts records it in
   * `instances.replacing`, which is how the watcher's backoff and cap are counted from rows.
   */
  replacing?: string
  /**
   * THE LOAD REHEARSAL THIS DEPLOY IS PART OF (the load rehearsal plan's Task 4) — carried by exactly its
   * two deploys: the GRANT (`purpose: 'load-rehearsal'`, staging in production's shape) and the TAKE-DOWN
   * (a `'launch'` deploy, staging back in its own). Refused with any environment but staging, and the grant
   * refused without it. While a run holds staging, every other staging deploy of the project is refused
   * (Task 5), and this is how those two are told apart from the rest.
   */
  loadRehearsalId?: string
}

/**
 * A REPLACEMENT THAT FOUND NOTHING TO REPLACE (A1 Task 6): under the environment's lock, the member it was
 * for is no longer in the set the hostname reaches — a person's deploy since replaced the set. Nothing was
 * started and an operator line says so. A plain `Error`, not a `ReleaseError`: only the set watcher's
 * redeploy can meet it, and no client receives it.
 */
export class NothingToReplaceError extends Error {
  constructor(readonly replacing: string) {
    super(
      `instance '${replacing}' is no longer one the hostname reaches: nothing to replace`,
    )
    this.name = 'NothingToReplaceError'
  }
}

/**
 * WHAT A DEPLOY MADE (A1 Decision 6): every instance of the set, in `(created_at, id)` order — the
 * order `Environment.instance` takes its first by — and the ONE instance the `deploy` operation
 * answers: the member that failed, if one did, otherwise the set's first.
 */
export interface DeployedSet {
  instances: Instance[]
  answer: Instance
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

/**
 * Deploys a release and answers the ONE instance the `deploy` operation answers (A1 Decision 6): the
 * member of the set that failed, if one did — so a failed deploy is still an instance whose `state` is
 * `failed`, with its Incident — otherwise the set's first by `(created_at, id)`, the instance
 * `Environment.instance` names. `deployReleaseSet` answers the whole set; a client reads it from the
 * environment (`instances`).
 *
 * One answer rather than the set, deliberately (a ruling of A1's sitting 4): the operation answers one
 * `Instance`, D21's rehearsal is one, and every caller that is not a test of N reads one.
 */
export async function deployRelease(
  db: Db,
  driver: Driver,
  config: Config,
  deps: DeployDeps,
  input: DeployInput,
  healthWait: HealthWait = DEFAULT_HEALTH_WAIT,
): Promise<Instance> {
  return (await deployReleaseSet(db, driver, config, deps, input, healthWait)).answer
}

/**
 * §11's deploy, ACROSS N (A1 Task 5): as many instances as `shapeFor` gives this environment, purpose
 * and audience — started beside whatever serves, each proved, the route moved ONCE to exactly the new
 * set, and the set that served retired after its drain. Any one member unhealthy fails the whole deploy:
 * every new member is removed, the previous set serves (restored, if the route had moved), and the
 * member that failed has its Incident.
 */
export async function deployReleaseSet(
  db: Db,
  driver: Driver,
  config: Config,
  deps: DeployDeps,
  input: DeployInput,
  healthWait: HealthWait = DEFAULT_HEALTH_WAIT,
): Promise<DeployedSet> {
  // A REPLACEMENT AND THE MEMBER IT REPLACES COME TOGETHER, OR NOT AT ALL — refused before anything is read.
  // Plain `Error`s: the set watcher is the one caller that names either, and no client can reach them.
  if (input.replacing !== undefined && input.purpose !== 'replacement')
    throw new Error(
      '`replacing` names the member a replacement is for: only a replacement takes it',
    )
  if (input.purpose === 'replacement' && input.replacing === undefined)
    throw new Error('a replacement names the instance it replaces (`replacing`)')
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

  /**
   * THE LOAD REHEARSAL'S TWO DEPLOYS ARE STAGING'S, AND ONLY ITS RUN MAKES THEM (the load rehearsal plan's
   * Task 4, Decision 2). Plain `Error`s, as the replacement's pairing above: `launch/load.ts` is the one
   * caller that names either, and no client can reach them. Refused before anything is read further.
   */
  if (input.purpose === 'load-rehearsal' && environment.kind !== 'staging')
    throw new Error(
      `a load rehearsal grants STAGING production's shape, never ${environment.kind}`,
    )
  if (input.loadRehearsalId !== undefined && environment.kind !== 'staging')
    throw new Error(
      `a load rehearsal's deploys are staging's: \`loadRehearsalId\` on ${environment.kind} is refused`,
    )
  if (input.purpose === 'load-rehearsal' && input.loadRehearsalId === undefined)
    throw new Error('a load rehearsal’s grant names its run (`loadRehearsalId`)')

  // REMOVED in P6a Task 7 (Decision 3). `deployRelease` refused every production deploy
  // here, before it read the build, with a `ReleaseError` carrying no checklist — a SECOND
  // gate behind the route's, unreachable by any client and openable by nobody. §13's gate
  // is `launch/gate.ts` and there is one of it. The error CODE stays in `error-codes.ts`
  // with `ProductionGateError`'s family instead of two, because that class still uses it.
  //
  // This is what makes `deployRelease`'s production path reachable for the first time —
  // Task 15 is the first thing to walk it.

  const [build] = await db.select().from(builds).where(eq(builds.id, release.buildId))
  const digest = build?.imageDigest
  if (!digest)
    throw new ReleaseError(
      'RELEASE_DIGEST_MISSING',
      `release '${release.id}' has no digest`,
    )

  /**
   * §13's *Integrity of the gate*: *"Approval binds to an immutable image digest, and
   * deployment verifies that digest before starting anything."*
   *
   * **BEFORE ANYTHING** is the operative phrase, and it is why this is here rather than in
   * the route: an instance row, a service, a Service Provider registration and a network
   * are all side effects, and a check after any of them has left something behind.
   * `releases.test.ts`'s *leaves no instance row behind* is the assertion that can see it —
   * a check moved after `ensureInstances` refuses with this same code and passes every other
   * test in this file.
   *
   * **IT IS THE GATE'S SECOND HALF, NOT A COPY OF IT.** `assertLaunchable` (the route's,
   * `launch/gate.ts`) asks whether the checklist is satisfied, which includes an approval;
   * this asks whether the approval covers THIS digest. A rebuild between the two answers
   * yes to the first and no to the second, and that window is what *binds to an immutable
   * digest* means.
   *
   * **SINCE P6b TASK 5, ONLY WHEN AN APPROVAL IS REQUIRED** — a first launch, a launched
   * app's sensitive change, or a launched app with nothing approved to compare with (one
   * rule, `approvalRequirementFor`). For a self-serve release the integrity property is that
   * promotion never rebuilds (§13, P6b Decision 2): `builds.image_digest` is written once and
   * the registry refuses pushes from app and sandbox contexts.
   *
   * **EVERY PURPOSE BUT THE REHEARSAL** (A1 Task 6, Review Focus 8): it read `'launch'` only, so a purpose
   * added later — the set watcher's `'replacement'` first — would have skipped the digest check by being
   * new. Now a replacement is held to it as a launch is: a release an administrator rejected since is
   * never deployed again by the watcher.
   */
  if (environment.kind === 'production' && input.purpose !== 'rehearsal') {
    // §13 D9 AS ONE RULE (P6b Task 5): an approval covering this digest is required for a
    // first launch and for a launched app's sensitive change, never for anything else — and
    // a release an administrator rejected is never deployed (Decision 7).
    const verdict = await productionApprovalFor(db, release, digest)
    if (!verdict.satisfied)
      throw new ReleaseError(
        'RELEASE_DIGEST_NOT_APPROVED',
        unsatisfiedReason(verdict, digest),
      )
  }

  /**
   * DECISION 16'S SECOND READ (P6b Task 4). `runRehearsal` refuses a launched project with
   * `REHEARSAL_LAUNCHED` before it gets here; this is the exemption itself refusing to be
   * used after launch, because `purpose: 'rehearsal'` skips the digest check above and its
   * instance serves the PUBLIC listener — `[M7]` measured an unapproved release answering
   * students that way. A plain `Error`: no client can reach it, and a wire code nothing can
   * receive is one `error-codes.test.ts` would rightly refuse to register.
   */
  if (
    environment.kind === 'production' &&
    input.purpose === 'rehearsal' &&
    (await launchedAt(db, environment.projectId)) !== null
  )
    throw new Error(
      `project '${environment.projectId}' has launched, so a rehearsal would put an ` +
        'unapproved release on its live production listener',
    )

  const resolved = (release.resolvedConfig as ResolvedConfigSet)[environment.kind]

  /**
   * A CWL RELEASE THAT ASKS FOR NO ATTRIBUTE, REFUSED BEFORE ANYTHING (FE-55; the FE-46/47/5 plan's Task 7):
   * its SP would be registered with no attribute list, which releases every attribute UBC holds — §9's
   * fail-open case — and `registerServiceProvider` refuses the row, after the services and the secrets, as
   * an error no client could read (`500`). Validation refuses such a manifest now; a release made before it
   * did is refused here, typed. The rehearsal deploys through this function and inherits it.
   */
  const frozenAuth = resolved.auth as ResolvedConfig['auth'] | undefined
  if (frozenAuth?.provider === 'cwl' && frozenAuth.attributes.length === 0)
    throw new ReleaseError(
      'RELEASE_CWL_NO_ATTRIBUTES',
      'this release signs people in with CWL and asks for no attribute (auth.attributes is empty), so its ' +
        'registration would release every attribute UBC holds — nothing was started. List the attributes ' +
        'the app needs in auth.attributes, validate it, then build, release and deploy again.',
    )

  /**
   * THE APP'S DECLARED SECRETS, READ AND REFUSED **BEFORE ANYTHING** (the authoring API plan's
   * Task 8, Decision 13) — for the digest check's reason above: an instance row, a service, a
   * Service Provider and a network are all side effects, and a refusal after any of them has
   * left something behind. Until Task 8 a declared secret was DROPPED at injection and the app
   * started without it; now a release whose FROZEN config declares a `secret: true` name with no
   * value stored for THIS environment is refused, naming every missing name and never a value.
   * The rehearsal deploys through this function, so it inherits the refusal (as
   * `REHEARSAL_DEPLOY_FAILED`, the reason in its message). A value takes effect at the next
   * deploy: setting one redeploys nothing.
   */
  const declaredSecrets = resolved.env.filter((e) => e.secret === true).map((e) => e.name)
  const stored =
    declaredSecrets.length === 0
      ? new Map<string, string>()
      : await deps.appSecrets.envSecrets(db, {
          projectId: environment.projectId,
          environmentKind: environment.kind,
        })
  const unset = declaredSecrets.filter((name) => !stored.has(name))
  if (unset.length > 0)
    throw new ReleaseError(
      'RELEASE_SECRET_NOT_SET',
      `this release declares ${unset.join(', ')} with secret: true, and no value is set ` +
        `for ${environment.kind}. Set ${unset.length === 1 ? 'it' : 'each'} with PUT ` +
        `/v1/environments/${environment.id}/secrets/{name}, then deploy again: a deploy never ` +
        'starts an app without a secret it declares.',
    )
  const appEnv = new Map(declaredSecrets.map((name) => [name, stored.get(name)!]))

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
   * HOW MANY, AND AT WHOSE RESOURCES (A1 Decision 2): read here, from the audience as it is at THIS
   * deploy — a person who changes the answer changes the next deploy's count, never a running set's —
   * and from nowhere a caller can reach. `shapeFor` is the only place the shape is decided.
   */
  const shape = shapeFor(
    environment.kind,
    input.purpose ?? 'launch',
    project.audience as StoredAudience | null,
  )
  const resources = (release.resolvedConfig as ResolvedConfigSet)[shape.resources]
    .resources

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
    /**
     * §11: THE PROJECT'S STATE, READ AGAIN UNDER THE LOCK (the front-end enablement plan's Task 11).
     * The route authorized before this lock was taken, and an archive takes this same lock for
     * every step that touches an environment — so a deploy that authorized before an archive and
     * reached here after it would bring a switched-off app back up behind its owner's back. Read
     * here, the first thing under the lock, it is refused before anything is started.
     */
    const [current] = await db
      .select({ state: projects.state })
      .from(projects)
      .where(eq(projects.id, environment.projectId))
    if (current?.state !== 'active')
      throw projectStateRefusal(environment.projectId, current?.state ?? 'deleted')

    /**
     * §24: STAGING IS A LOAD REHEARSAL'S WHILE IT RUNS (the load rehearsal plan's Task 5, Decision 6). Read here, under
     * staging's lock, so a deploy that took the lock before the run's row existed finishes first and the grant waits for
     * it — and nothing replaces the granted set mid-run, nor does the take-down silently revert someone's deploy. Only
     * the run's own two deploys pass, carrying the `running` row's id; any other id is refused like any other deploy.
     */
    if (environment.kind === 'staging') {
      const [holding] = await db
        .select({ id: loadRehearsals.id })
        .from(loadRehearsals)
        .where(
          and(
            eq(loadRehearsals.projectId, environment.projectId),
            eq(loadRehearsals.state, 'running'),
          ),
        )
      if (holding !== undefined && holding.id !== input.loadRehearsalId)
        throw new ReleaseError(
          'LOAD_REHEARSAL_RUNNING',
          'a load rehearsal of this app is running and holds its staging environment, so nothing was deployed. ' +
            'A run takes up to about ten minutes; deploy again once its record (`getLoadRehearsal`) is no longer running.',
        )
    }

    /**
     * A REPLACEMENT RE-READS WHAT IT REPLACES, UNDER THE LOCK (A1 Task 6, Decision 11): the set watcher saw
     * `replacing` exit and released this lock to call here, and a person's deploy may have taken it in
     * between and replaced the whole set. Then there is nothing to replace: nothing is started, and the
     * operator line says why.
     */
    if (input.purpose === 'replacement') {
      const [stillServing] = await db
        .select({ instanceId: routes.instanceId })
        .from(routes)
        .where(
          and(
            eq(routes.hostname, environment.hostname),
            eq(routes.instanceId, input.replacing!),
          ),
        )
      if (stillServing === undefined) {
        console.error(
          JSON.stringify({
            level: 'info',
            msg: 'a replacement found nothing to replace: a deploy since replaced the set, so nothing was started',
            environmentId: environment.id,
            replacing: input.replacing,
          }),
        )
        throw new NothingToReplaceError(input.replacing!)
      }
    }

    /**
     * THE SET'S ROWS, ONE STATEMENT (A1 Task 5): every member shares the statement's `created_at`, so
     * the set's order — `(created_at, id)`, the order `Environment.instance` takes its first by — is
     * the ids' order, here and in every read of the set.
     */
    const inserted = await db
      .insert(instances)
      .values(
        Array.from({ length: shape.instances }, () => ({
          environmentId: environment.id,
          releaseId: release.id,
          driver: driver.name,
          kind: 'web' as const,
          state: 'provisioning' as const,
          // The exited member this set replaces — null for every deploy a person makes (A1 Task 6).
          replacing: input.purpose === 'replacement' ? input.replacing! : null,
        })),
      )
      .returning()
    const members = inserted
      .slice()
      .sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || compareIds(a.id, b.id),
      )
    const memberIds = members.map((member) => member.id)
    const detailOf = (instanceId: string, state: string) => ({
      instanceId,
      releaseId: release.id,
      environmentId: environment.id,
      environment: environment.kind,
      state,
      // FE-62: a replacement's deploy says it is one, member by member — the instance it was started for.
      replacing: input.replacing ?? null,
    })
    for (const member of members) {
      // §22 step 5 (P5a Task 14). The redactor is EMPTY and that is accurate: nothing in this
      // detail or sentence is secret, and the app's secret set is opened further down, before
      // anything is minted (P4b finding 162) — not moved up for an event that needs none of it.
      await publishEvent(
        db,
        deps.bus,
        {
          projectId: environment.projectId,
          subject: `instance:${member.id}`,
          type: 'instance.provisioning',
          machineDetail: detailOf(member.id, 'provisioning'),
          // Who deployed (§26; the faculty-ready plan's Task 10): the acting context names them.
          humanMessage: withActor(
            `Preparing ${projectSlug} in ${environment.kind}`,
            'deployed by',
          ),
        },
        makeRedactor([]),
      )
    }
    /**
     * §11's key gained the INSTANCE (P4c): a redeploy of the same release is a new
     * instance beside the one serving, so the name can no longer be computed before the
     * row exists — with the release alone in it, the two would collide on the name that
     * identifies the container and the second deploy could only replace the first. Across
     * N it is also what keeps the members of one set apart.
     */
    const nameOf = (instanceId: string) =>
      instanceName(projectSlug, environment.kind, release.id, instanceId)

    /**
     * WHAT SERVES RIGHT NOW: what a failure falls back to, and what this deploy
     * replaces. Read before anything is started, and from the DRIVER rather than from
     * the Route row — an app deployed before P4c has no row, and it is still the thing
     * people are using (Decision 20: there is no backfill). A SET since A1's Task 4: every
     * instance the hostname reaches, `[]` when none does.
     */
    const previous = await driver.servingInstances(environment.hostname)

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
    const serviceHandles: ServiceHandle[] = []
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
     * too. Both positions satisfy "before ensureInstances"; this one covers more.
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
      // Every environment, sandbox too (FE-37): the IdP requires every app's AuthnRequest
      // signed, and `SAML_PRIVATE_KEY_PATH` now names this file everywhere.
      files.push({
        path: INJECTED_FILE_PATHS.spPrivateKey,
        contents: registration.keypair.privateKeyPem,
        mode: 0o440,
        uid: 0,
        gid: runAsUid,
      })
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
     * ONE KEY PER MEMBER (A1 Decision 6): the scheme was per instance already, and a key shared
     * by a set would be revoked when its first member is retired — or outlive the set.
     *
     * After the Service Provider and the files, so nothing that can still refuse the
     * deploy runs between the mint and the `try` that discards it.
     */
    const minted = new Map<string, string>()
    if (aiPlan !== undefined) {
      for (const member of members) {
        const key = await deps.ai.mintAppKey({
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
            instanceId: member.id,
            key,
          })
        } catch (error) {
          // Nothing recorded it, so nothing else can ever revoke it: BY VALUE, here, and
          // the store's own failure is what reaches the caller. The members' keys stored
          // before it ARE recorded, so they are revoked by name.
          await discardMintedKey(deps.ai, key, environment)
          await revokeMintedKeys(deps.ai, db, environment, minted)
          throw error
        }
        minted.set(member.id, key)
      }
    }
    // `ModelEntry.kind`'s first reader (P4b finding 46): the first declared model of each
    // kind is the one the app is told about.
    const chat = aiPlan?.declared.find((m) => m.kind === 'chat')
    const embedding = aiPlan?.declared.find((m) => m.kind === 'embedding')
    const aiFor = (instanceId: string): InjectionContext['ai'] => {
      const apiKey = minted.get(instanceId)
      return apiKey === undefined
        ? undefined
        : {
            // The IN-NETWORK endpoint, NEVER `config.litellm.url`. The two are not
            // interchangeable and fail silently when swapped: an app handed the control
            // plane's `http://127.0.0.1:7106` gets ECONNREFUSED from inside its own
            // `--internal` network, and the symptom is "the AI is down".
            endpoint: config.litellm.internalUrl,
            apiKey,
            // Conditional spread, not `x ?? undefined`: `exactOptionalPropertyTypes`.
            ...(chat === undefined ? {} : { defaultChatModel: chat.name }),
            ...(embedding === undefined ? {} : { embeddingModel: embedding.name }),
          }
    }

    /** Each member's driver handle, by its index in `members` — none for one never started. */
    let handles: (InstanceHandle | undefined)[] = []
    /** The member whose own check failed, by index: -1 when every member is healthy. */
    let failedIndex = -1
    // What the platform checked, in words, when it did not pass: §14's failing check.
    let failedCheck = ''
    try {
      // provisioning → starting, STORED (P5a Task 14). Services are bound; the driver is
      // about to start the set beside the one serving. Before this, `starting` existed
      // only as a value computed on the way to `healthy`, so no client could ever see it —
      // and a restart in this window left a row in `provisioning` that `recoverAtBoot`
      // could not tell from one that never reached its services.
      await db
        .update(instances)
        .set({ state: nextState('provisioning', 'services_bound') })
        .where(inArray(instances.id, memberIds))
      for (const member of members) {
        await publishEvent(
          db,
          deps.bus,
          {
            projectId: environment.projectId,
            subject: `instance:${member.id}`,
            type: 'instance.starting',
            machineDetail: detailOf(member.id, 'starting'),
            humanMessage: `${projectSlug} is starting in ${environment.kind}.`,
          },
          redact,
        )
      }
      /**
       * THE WHOLE SET IN ONE CALL (A1 Task 4's driver): every member started beside what serves,
       * each proved, the route moved ONCE to exactly this set, and the call resolved only once the
       * hostname is shown to reach EACH member by its identity. A member never ready moves nothing.
       */
      const started = await driver.ensureInstances(
        members.map((member) => {
          const ai = aiFor(member.id)
          return {
            name: nameOf(member.id),
            instanceId: member.id,
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
              // D21's rehearsal (P6a Task 14): production in every respect except the IdP it
              // is pointed at, because §8 sends a production app to real UBC Shibboleth and
              // C1 puts that out of reach. `injection.ts`'s `purpose` carries the measurement
              // that found it. ONLY the rehearsal says so: a replacement (A1 Task 6) signs people
              // in exactly as the launch it replaces — `injection.ts` reads anything but
              // `'launch'` as the rehearsal's IdP, so `'replacement'` must never reach it.
              ...(input.purpose === 'rehearsal' ? { purpose: 'rehearsal' as const } : {}),
              ...(registration !== undefined ? { spEntity: registration.entity } : {}),
              secrets: { sessionSecret, appEnv },
              services: boundServices,
              ...(ai === undefined ? {} : { ai }),
            }),
            ...(files.length > 0 ? { files } : {}),
            port: resolved.port,
            healthPath: resolved.health,
            // The SHAPE's resources (`shapeFor`): each member at the manifest's own numbers for
            // the environment the shape names — today always this one's.
            resources: {
              cpu: resources.cpu,
              memoryMi: toMebibytes(resources.memory),
              pids: resources.pids,
              diskMi: toMebibytes(resources.disk),
            },
            services: serviceHandles,
            egressAllow: resolved.egressAllow,
            // §10's gateway joins the app's network only for an app that declares models
            // (P4b Task 8). `?.` because a release frozen before `ResolvedConfig.ai` existed
            // has no `ai` key at all (pre-flight 64).
            needsAiGateway: models.length > 0,
          }
        }),
      )
      handles = members.map((_, index) => started[index])
      /**
       * A HEALTH WAIT FOR EACH, all at once — a set of three must not take three timeouts to
       * fail — and the FIRST member, in the set's order, that did not pass is the deploy's
       * failure: its check is §14's failing check, its Incident the one captured.
       */
      const health = await Promise.all(
        started.map((handle) => waitForHealth(driver, handle.id, healthWait)),
      )
      failedIndex = health.findIndex((result) => !result.healthy)
      const failed = health[failedIndex]
      if (failed !== undefined && !failed.healthy) {
        failedCheck = `health: GET ${resolved.health} on port ${resolved.port} — ${failed.why}`
      }
    } catch (error) {
      if (error instanceof InstanceNotReadyError) {
        /**
         * A driver that STARTED the set and could not make a member ready says so with
         * the handles (P4b Task 13; A1 Task 4: `handle` the member that failed, `handles`
         * every member in the order asked for, none routed), and that is a failed deploy —
         * recorded like the one above, as rows in `failed` and an Incident, not thrown.
         * The instances exist, and a failure a faculty member cannot see is the one §14
         * exists to prevent. Until this, the Docker driver's refusal — the commonest real
         * failure, an app that crashes as it starts — left the row parked in
         * `provisioning`, a state nothing moves it out of, with no record of why.
         */
        handles = members.map((_, index) => error.handles[index])
        failedIndex = Math.max(
          0,
          handles.findIndex((handle) => handle?.id === error.handle.id),
        )
        handles[failedIndex] ??= error.handle
        failedCheck = error.check
      } else {
        // The set never started, or a health could not be read. The previous set still
        // holds its own keys and keeps them; this set's keys are revoked by NAME, because
        // they are recorded — a failed revoke then leaves the record for the next retire.
        // THE ORIGINAL ERROR IS WHAT THE CALLER GETS.
        await revokeMintedKeys(deps.ai, db, environment, minted)
        throw error
      }
    }
    const healthy = failedIndex === -1
    const startedIds = handles.flatMap((handle) =>
      handle === undefined ? [] : [handle.id],
    )
    /**
     * THE ROUTE MOVED AND A MEMBER THEN FAILED ITS OWN HEALTH CHECK (Decision 18).
     *
     * `ensureInstances` resolves once the EDGE reaches every new member; Docker's
     * HEALTHCHECK runs on its own interval and can disagree a second later. §13: deploying
     * a release never takes down the one it replaces — so the hostname goes back to the
     * set that was serving when this deploy started. A readiness refusal never gets
     * here with the route moved, because that one leaves the route where it was.
     */
    let routeDialsFailed =
      !healthy &&
      (await driver.servingInstances(environment.hostname)).some((id) =>
        startedIds.includes(id),
      )
    if (routeDialsFailed && previous.length > 0) {
      routeDialsFailed = await driver
        .restoreRoute(previous)
        .then(() => false)
        .catch((error: unknown) => {
          console.error(
            JSON.stringify({
              level: 'error',
              msg: 'the previous instances could not be put back after a failed health check; the app is serving a failed set',
              environmentId: environment.id,
              error: (error as { code?: string }).code ?? (error as Error).name,
            }),
          )
          return true
        })
    }

    /**
     * EVERY MEMBER'S ROW, by what its deploy did. Healthy: each `healthy`. Failed: each `failed` —
     * the member whose check failed, and every sibling with it, because none of them was ever the
     * set the hostname kept (§11: a failed member fails the set; `failed` is *"never served"*).
     * Stored above as `starting`, before the driver started the set; health decides the rest.
     */
    const starting = 'starting' as const
    const state = nextState(starting, healthy ? 'health_passed' : 'health_failed')
    const updatedRows = await Promise.all(
      members.map(async (member, index) => {
        const [updated] = await db
          .update(instances)
          .set({
            state,
            handle: handles[index]?.id ?? null,
            ...(handles[index] === undefined ? {} : { lastSeenAt: new Date() }),
          })
          .where(eq(instances.id, member.id))
          .returning()
        return updated!
      }),
    )

    if (healthy) {
      /**
       * THE PLATFORM'S RECORD OF WHAT SERVES — §6's `Route`, specified since P2 and
       * built in P4c Task 6. Boot re-applies the edge's routes from these rows (§12,
       * Task 9), `GET /v1/environments/:environmentId` reports the set they name
       * rather than the newest deploy, and the retirer reads them to know whether the
       * environment's pre-P4c key is still somebody's.
       *
       * REPLACED AS A SET (A1 Tasks 3 and 5): the hostname's rows become exactly the
       * instances it now reaches, every member of this deploy, in one transaction.
       */
      await replaceRouteSet(db, {
        hostname: environment.hostname,
        listener: listenerFor(environment.kind),
        instanceIds: memberIds,
      })

      /**
       * Every instance of this environment NOT IN THE NEW SET is on its way out (Decision 17;
       * A1 Decision 6 — with N, "every other instance" would have reaped the siblings this
       * deploy just started). The ROWS are how a console sees what is happening; the
       * CONTAINERS are what the retirer actually reads, and it reads them from the driver.
       */
      const others = await db
        .select({ id: instances.id, state: instances.state })
        .from(instances)
        .where(
          and(
            eq(instances.environmentId, environment.id),
            notInArray(instances.id, memberIds),
          ),
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
     * §14's Incident, for a deploy that did not become healthy — by either route above — and
     * ONE, for the member whose check failed (A1 Review Focus 4): its siblings were removed
     * because of it, and an Incident each would send a reader to three containers for one cause.
     * The one moment Phase 1 has (Decision 13): a crash LOOP needs the reconciler, which
     * is Phase 4 (D10), and a deploy that never reached healthy is right here, with the
     * handle, the release and the failing check in hand.
     *
     * AFTER the rows record `failed` and their handles, because the Incident reads both from
     * the row. Redacted with `redact`, built from the app's OWN secret set before the mint —
     * by which point this deploy has stored every secret it stores, service credentials,
     * SESSION_SECRET and the SP key — so an app that prints its environment as it dies has
     * none of them persisted.
     *
     * A capture that fails reaches the caller. The rows already say `failed`, so the
     * instances are recorded as what they are; a missing Incident is not swallowed.
     *
     * D23.2's instance state transition, recorded and streamed (P4b Task 15) — carrying
     * the STATE, because a deploy is a `200` whether it worked or not (sitting 8, finding
     * 146) and a client must never read "the call returned" as "the app is up". One per
     * member: an `instance.*` event is an instance's (A1 Decision 10).
     */
    if (!healthy) {
      const failed = updatedRows[failedIndex]!
      for (const [index, row] of updatedRows.entries()) {
        await publishEvent(
          db,
          deps.bus,
          {
            projectId: environment.projectId,
            subject: `instance:${row.id}`,
            type: 'instance.failed',
            machineDetail: {
              ...detailOf(row.id, row.state),
              failedCheck:
                index === failedIndex
                  ? failedCheck
                  : `set: ${failed.id}, deployed with it, did not pass its check, so no member of this deploy serves — ${failedCheck}`,
            },
            humanMessage: `${projectSlug} did not start in ${environment.kind}.`,
          },
          redact,
        )
      }
      const incident = await captureIncident(
        db,
        driver,
        { instanceId: failed.id, failedCheck },
        redact,
      )
      // Announced once it EXISTS, and named, so a client that reacts by reading
      // `GET /v1/environments/:environmentId/incidents` finds it there. Published HERE, at
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
            instanceId: failed.id,
            releaseId: release.id,
            environment: environment.kind,
            // FE-62: a deploy's Incident is a change that did not go live — a replacement's too, which says so.
            cause: incident.cause,
            replacing: input.replacing ?? null,
          },
          humanMessage:
            `${projectSlug} failed to start in ${environment.kind}. The incident records ` +
            'what it printed and what changed since it last worked.',
        },
        redact,
      )
    } else {
      for (const row of updatedRows) {
        await publishEvent(
          db,
          deps.bus,
          {
            projectId: environment.projectId,
            subject: `instance:${row.id}`,
            type: 'instance.healthy',
            machineDetail: detailOf(row.id, row.state),
            humanMessage: `${projectSlug} is running in ${environment.kind}.`,
          },
          redact,
        )
      }
      // §13 D9: THE LAUNCH IS RECORDED BY THE DEPLOY THAT MAKES IT TRUE (P6b Decision 1). A
      // production deploy for purpose 'launch' that reached healthy — never a rehearsal,
      // whose instance serves production too while its sign-in runs, and must not read as a
      // launch. Once per project, by `recordLaunch`'s own WHERE clause — and once per deploy,
      // naming the set's first (A1 Decision 6), the instance the deploy answers.
      if (environment.kind === 'production' && (input.purpose ?? 'launch') === 'launch')
        await recordLaunch(db, deps.bus, {
          projectId: environment.projectId,
          releaseId: release.id,
          instanceId: updatedRows[0]!.id,
          imageDigest: digest,
          slug: projectSlug,
        })
      for (const row of updatedRows) {
        const key = minted.get(row.id)
        if (key === undefined) continue
        /**
         * §10's rotation is complete at the moment the ROUTE MOVED — which is now, not
         * at a commit that no longer exists (P4c). Each new member is serving with its
         * own key; the previous set keeps its own until the retirer revokes each, after
         * its drain.
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
            subject: `instance:${row.id}`,
            type: 'ai.key_rotated',
            machineDetail: {
              instanceId: row.id,
              environment: environment.kind,
              models: [...models],
            },
            humanMessage: `${projectSlug} was given a new AI access key for this release in ${environment.kind}.`,
          },
          makeRedactor([...appSecretValues, key]),
        )
      }
    }

    if (!healthy) {
      /**
       * §11: a set any member of which never becomes ready "is removed once its Incident is
       * captured (§14)". The Incident above read the failed member's exit code and its last
       * 200 log lines THROUGH its handle; now EVERY member goes (A1 Task 4: the driver hands
       * back every handle, none routed), each with its `-files` volume — that volume holds
       * the app's SP private key, so R5's "a failed deploy leaks nothing" is not merely
       * tidiness.
       *
       * TWO REMOVALS, because a retire never changes what a hostname reaches. When the
       * route still dials the new set — a FIRST deploy of an environment, which has no
       * previous set to fall back on, or a restore that failed — `retireInstance`
       * refuses each with `INSTANCE_SERVING` and the containers survive (sitting 5's
       * correction 3). `destroyInstance` takes each member's own upstream out of the route
       * and the route with the last, which leaves the hostname on the edge's wildcard:
       * honest, and the app was never up.
       */
      for (const [index, handle] of handles.entries()) {
        if (handle === undefined) continue
        const removed = routeDialsFailed
          ? driver.destroyInstance(handle.id)
          : driver.retireInstance(handle.id, { drainMs: 0 })
        await removed.catch((error: unknown) => {
          console.error(
            JSON.stringify({
              level: 'error',
              msg: 'a failed instance could not be removed; the next deploy or boot will retire it',
              instanceId: members[index]!.id,
              error: (error as { code?: string }).code ?? (error as Error).name,
            }),
          )
        })
      }
      await revokeMintedKeys(deps.ai, db, environment, minted)
    } else {
      /**
       * THE CALLER TASKS 5, 6 AND 7 WERE BUILT FOR. Every instance of this environment
       * that does not serve — the set this deploy replaced, and the backlog from before
       * P4c (R7) — is drained and removed in the background. `schedule` returns at once;
       * the pass takes this environment's lock itself, so it waits for this deploy to
       * finish rather than racing it.
       */
      deps.retirer.schedule(environment.id)
    }

    /**
     * WHAT IT ANSWERS (A1 Decision 6): the set in `(created_at, id)` order, read back in the
     * database's own order — the order every read of the set uses — and the member that failed,
     * or the set's first.
     */
    const set = await db
      .select()
      .from(instances)
      .where(inArray(instances.id, memberIds))
      .orderBy(asc(instances.createdAt), asc(instances.id))
    return {
      instances: set,
      answer: healthy ? set[0]! : set.find((row) => row.id === members[failedIndex]!.id)!,
    }
  })
}

/**
 * Two instance ids in the order Postgres's `uuid` sorts them — byte by byte, which for the
 * canonical lowercase form is the strings' own order. The set's order is `(created_at, id)`.
 */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Revokes, by NAME, every key this deploy minted and stored — for a set that never served. Each
 * through `revokeInstanceKeyQuietly`, so one gateway failure neither stops the others nor replaces
 * the deploy's own failure; a key whose revoke failed stays recorded for the next retire.
 */
async function revokeMintedKeys(
  ai: AiKeyService,
  db: Db,
  environment: { projectId: string; kind: InstanceKeyScope['kind'] },
  minted: ReadonlyMap<string, string>,
): Promise<void> {
  for (const instanceId of minted.keys()) {
    await revokeInstanceKeyQuietly(ai, db, {
      projectId: environment.projectId,
      kind: environment.kind,
      instanceId,
    })
  }
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
        `the model '${name}' is now approved only up to ${levelName(entry.maxClassification)} data, ` +
          `and this app declares ${levelName(resolved.classification)} (D17)`,
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
      // Only what is OFFERED (FE-31), as createProject's hint.
      `no blueprint '${ref}'. Available: ${offeredRefs(blueprints).join(', ')}`,
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
