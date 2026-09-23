import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import type pg from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { disabledAiKeyService, disabledCatalogue } from '../ai/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { loadConfig } from '../config.js'
import { appSpecs, db, environments, instances, routes, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { computeLaunchReadiness, runRehearsal } from '../launch/index.js'
import { createEventBus } from '../observability/index.js'
import { createProject } from '../projects/index.js'
import { createCaddyClient, edgeIdentityProbe, removeRoute } from '../routing/index.js'
import type { Driver } from '../runtime/index.js'
import {
  CA_CERT,
  createEngineClient,
  describeDocker,
  destroyAppNetwork,
  dockerDriverForTests,
  egressContainer,
  contractRepoCommit,
  ensureContractRepo,
  resolveSocketPath,
} from '../runtime/testing.js'
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import {
  createCwlSignInProbe,
  createIdpPool,
  createSsoRegistrar,
  deleteSpRow,
  readSpRow,
} from '../sso/index.js'
import { idpDatabaseUrl } from '../sso/testing.js'
import {
  createRelease,
  createRetirer,
  deployRelease,
  launchedAt,
  recordApproval,
} from './index.js'
import { buildToEnd } from './testing.js'
import type { DeployDeps, Retirer } from './index.js'
import { testAudience, testReservedLabels } from '../projects/testing.js'

const run = promisify(execFile)
const engine = createEngineClient({ socketPath: resolveSocketPath() })
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))

const KIND = 'production' as const
const PORT = 3000

/**
 * §12's two listeners, and the port the public one answers on from INSIDE a container.
 * `srv1` is bound to `127.0.0.3:443` on the host and to `:8443` in the container, so a
 * probe that runs where the platform runs must carry the port (P6a Decision 15).
 */
const PUBLIC_PORT = 8443
const routing = {
  caddy: createCaddyClient('http://127.0.0.1:7119'),
  servers: { internal: 'srv0', public: 'srv1' } as const,
}

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
  MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
  MANIFEST_SESSION_SECRET: 'k'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

/**
 * A CWL app, because §9's production registration is half of what this file walks —
 * the entityID's `/production` suffix and the ACS on the bare production hostname are
 * derived from `environmentKind`, and no test had ever derived them for production.
 * The fixture app itself signs nobody in; it is the REGISTRATION that is under test,
 * and `deployRelease` registers it whatever the app then does with the variables.
 */
const resolvedFor = (kind: 'sandbox' | 'staging' | 'production') => ({
  environmentKind: kind,
  port: PORT,
  health: '/healthz',
  resources: { cpu: 0.5, memory: '256Mi', pids: 128, disk: '1Gi' },
  env: [],
  services: [],
  egressAllow: [],
  classification: 'internal' as const,
  ai: {
    models: [] as string[],
    budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 },
  },
  auth: {
    provider: 'cwl' as const,
    attributes: ['ubcEduCwlPuid', 'mail'],
    callback: '/auth/ubcshib/callback',
    logout: '/auth/logout',
  },
})

/** Everything one suite below built, filled in by its `beforeAll`. */
interface ProductionSuite {
  slug: string
  /** §23 gives production `<slug>.manifest.internal` — the bare zone, NO sub-zone. */
  host: string
  entityId: string
  /** The rehearsal needs a candidate, and a candidate is what is serving STAGING (§13). */
  stagingHost: string
  stagingEntityId: string
  driver: Driver
  retirer: Retirer
  deps: DeployDeps
  pool: pg.Pool
  project: { id: string; slug: string; blueprintRef: string }
  production: { id: string; hostname: string }
  userId: string
  releaseId: string
  digest: string
}

/**
 * ONE PROJECT, BUILT AND RELEASED ONCE, WITH ITS OWN SLUG — like every Docker suite here: a
 * slug and an environment kind determine the hostname, the route id, the app network and
 * the egress container. **A function since P6b Task 4**, because this file now has two
 * suites that must not share a project: the first one LAUNCHES its project, and a launched
 * project refuses a rehearsal by design (Decision 16), so the rehearsal needs a project
 * that never launched. Two copies of this setup would drift the first time either changed.
 *
 * COMMITTED ROWS, not `withRollback`: the retirer and the driver run on their own
 * connections, and the IdP row is written through a second pool that no transaction here
 * can roll back. `resetDatabase` and an unconditional `deleteSpRow` are what keep the rest
 * of the suite honest.
 */
function productionSuite(slug: string): ProductionSuite {
  const s = {
    slug,
    host: `${slug}.manifest.internal`,
    entityId: `https://manifest.internal/sp/${slug}/${KIND}`,
    stagingHost: `${slug}.staging.manifest.internal`,
    stagingEntityId: `https://manifest.internal/sp/${slug}/staging`,
  } as ProductionSuite

  beforeAll(async () => {
    await resetDatabase()
    s.pool = createIdpPool(idpDatabaseUrl())
    s.driver = await dockerDriverForTests()
    const repoPath = join(tmpdir(), `mf-${slug}.git`)
    ensureContractRepo(repoPath)
    const commitSha = contractRepoCommit(repoPath)

    const [user] = await db
      .insert(users)
      .values({
        ubcCwlPuid: `puid-${slug}`,
        email: `${slug}@ubc.ca`,
        displayName: 'O',
        role: 'member',
      })
      .returning()
    s.userId = user!.id
    const created = await createProject(db, config, await testReservedLabels(), {
      slug,
      ownerId: s.userId,
      blueprintRef: 'fixture-node@1',
      starter: null,
      audience: testAudience(s.userId),
    })
    s.project = created.project
    s.production = created.environments.find((e) => e.kind === KIND)!
    // §23's production zone, asserted rather than assumed: every URL below is built
    // from it, and a sub-zone here would make the rest of this suite test staging.
    expect(s.production.hostname).toBe(s.host)
    const [spec] = await db
      .insert(appSpecs)
      .values({
        projectId: s.project.id,
        commitSha,
        parsed: {},
        schemaVersion: 1,
        valid: true,
      })
      .returning()

    const keys = await generateMasterKeypair()
    const appSecrets = createAppSecrets(keys)
    const bus = createEventBus()
    const ai = disabledAiKeyService()
    s.retirer = createRetirer({
      db,
      driver: s.driver,
      ai,
      appSecrets,
      bus,
      drainMs: 5_000,
    })
    s.deps = {
      secrets: createServiceCredentials(keys, config.masterSecret),
      appSecrets,
      // THE REAL REGISTRAR, bound as `src/index.ts` binds it — the row this writes is
      // the one the IdP reads, and its production shape is what a test below asserts.
      sso: createSsoRegistrar(
        s.pool,
        keys,
        'https://manifest.internal',
        config.idp.signingCertPath,
        bus,
      ),
      blueprints: await loadBlueprints(BLUEPRINTS_ROOT),
      ai,
      catalogue: disabledCatalogue(),
      bus,
      retirer: s.retirer,
    }

    const build = await buildToEnd(
      { db: db, driver: s.driver, bus },
      {
        projectId: s.project.id,
        projectSlug: slug,
        appSpecId: spec!.id,
        commitSha,
        blueprintRef: 'fixture-node@1',
        repoPath,
      },
    )
    expect(build.status, build.error ?? '').toBe('succeeded')
    s.digest = build.imageDigest!
    const release = await createRelease(db, {
      projectId: s.project.id,
      buildId: build.id,
      appSpecId: spec!.id,
      createdBy: s.userId,
      resolvedConfig: {
        sandbox: resolvedFor('sandbox'),
        staging: resolvedFor('staging'),
        production: resolvedFor('production'),
      },
    })
    s.releaseId = release.id
  }, 900_000)

  afterAll(async () => {
    await s.retirer?.idle()
    // BY NAME, with its own files volume: `docker volume ls -f dangling=true` lists
    // other people's volumes (P4b finding 194).
    const { stdout } = await run('docker', [
      'ps',
      '-a',
      '--filter',
      `label=manifest.slug=${slug}`,
      '--format',
      '{{.Names}}',
    ]).catch(() => ({ stdout: '' }))
    const left = stdout.split('\n').filter((line) => line.trim() !== '')
    if (left.length > 0) {
      await run('docker', ['rm', '-f', '-v', ...left]).catch(() => undefined)
      await run('docker', ['volume', 'rm', '-f', ...left.map((c) => `${c}-files`)]).catch(
        () => undefined,
      )
    }
    // BOTH environments: a rehearsal needs something serving STAGING, and the launched
    // suite's own refusal case stages its candidate too — so each suite may own two app
    // networks and two egress proxies rather than one.
    for (const kind of [KIND, 'staging'] as const) {
      await run('docker', ['rm', '-f', '-v', egressContainer(slug, kind)]).catch(
        () => undefined,
      )
      await destroyAppNetwork(engine, slug, kind).catch(() => undefined)
    }
    await removeRoute(routing, s.host, KIND).catch(() => undefined)
    await removeRoute(routing, s.stagingHost, 'staging').catch(() => undefined)
    await deleteSpRow(s.pool, s.stagingEntityId).catch(() => undefined)
    // Unconditional: the IdP row went through a second pool, so nothing here rolls it
    // back, and a leaked row breaks the next `make up` (`ensure-idp-sql.sh` refuses to
    // start while one violates §9's attributes constraint).
    await deleteSpRow(s.pool, s.entityId).catch(() => undefined)
    await s.pool?.end()
    await resetDatabase()
  }, 300_000)

  return s
}

/** An administrator's decision, through the function the approve route uses. */
const approve = (s: ProductionSuite, imageDigest: string) =>
  recordApproval(db, s.deps.bus, {
    release: { id: s.releaseId, projectId: s.project.id },
    actor: { userId: s.userId, puid: `puid-${s.slug}` },
    decision: 'approved',
    imageDigest,
    diffSnapshot: {
      imageDigest,
      changes: [],
      services: [],
      attributes: [],
      resources: {},
      summary: null,
      summarySource: 'unavailable',
      review: { state: 'not_performed', reviewer: 'NullReviewer', detail: 'none' },
    },
  })

/** What the edge says on a listener, asked from a container exactly as the driver asks. */
const askEdge = (s: ProductionSuite, port?: number) =>
  edgeIdentityProbe(engine, s.host, '/healthz', CA_CERT, {
    dnsServer: '10.89.0.53',
    ...(port === undefined ? {} : { port }),
  })()

/** The project's staging environment — what a candidate is deployed to (§13). */
const stagingOf = (s: ProductionSuite) =>
  db
    .select()
    .from(environments)
    .where(eq(environments.projectId, s.project.id))
    .then((rows) => rows.find((e) => e.kind === 'staging')!)

/**
 * **THE FIRST PRODUCTION DEPLOY THIS PLATFORM HAS EVER DONE** (P6a Task 15).
 *
 * Until this file, `deployRelease`'s production half had never run: the route refused
 * every production deploy unconditionally (Task 7 removed the refusals), so the
 * production branches of SP registration, of routing, of the readiness probe and of §6's
 * `Route` row were code nothing had executed. P3 Session 5 is what that sentence is worth:
 * seven defects of the shape *the test constructs the value correctly and the running
 * system re-derives it wrongly*, behind 74 green Docker tests.
 *
 * So this suite drives `deployRelease` against the REAL Docker driver, the REAL edge and
 * the REAL IdP metadata store, into a PRODUCTION environment, and asserts what only this
 * tier can see: which listener the route went on, that the edge answers as the instance
 * there, that the internal listener does NOT, and that the Service Provider row carries
 * production values.
 *
 * **The refusals come first**, cheapest and before anything is deployed, so that the
 * *"leaves nothing behind"* claim is made on a machine where nothing has been left behind
 * yet. `releases.test.ts` has the same refusals against the fake driver; these two are the
 * pair the rule needs, because the fake driver's `ensureInstance` cannot leave a container.
 *
 * SEQUENTIAL: each test reads what the one before it left.
 */
describeDocker('the first production deploy (§13, P6a Task 15)', () => {
  const s = productionSuite('prod-launch')

  it('refuses a production deploy whose digest no approval covers: RELEASE_DIGEST_NOT_APPROVED', async () => {
    await expect(
      deployRelease(db, s.driver, config, s.deps, {
        releaseId: s.releaseId,
        environmentId: s.production.id,
      }),
    ).rejects.toMatchObject({ code: 'RELEASE_DIGEST_NOT_APPROVED' })
    // **BEFORE ANYTHING** is a claim about side effects, and this is the tier where it
    // can be read off the machine rather than off a row: no instance, and no container.
    const rows = await db
      .select()
      .from(instances)
      .where(eq(instances.environmentId, s.production.id))
    expect(rows).toEqual([])
    const { stdout } = await run('docker', [
      'ps',
      '-a',
      '--filter',
      `label=manifest.slug=${s.slug}`,
      '--format',
      '{{.Names}}',
    ])
    expect(stdout.trim()).toBe('')
  }, 120_000)

  it('refuses when the approval covers a DIFFERENT digest — a rebuild', async () => {
    // The digest is fabricated because the driver cannot rebuild to a different one for
    // the same source (`releases.test.ts` records the measurement); a real rebuild is a
    // different image, which is exactly what this stands in for.
    await approve(s, `sha256:${'c'.repeat(64)}`)
    await expect(
      deployRelease(db, s.driver, config, s.deps, {
        releaseId: s.releaseId,
        environmentId: s.production.id,
      }),
    ).rejects.toMatchObject({ code: 'RELEASE_DIGEST_NOT_APPROVED' })
  }, 120_000)

  it('deploys to PRODUCTION, on the public listener, as the instance it started', async () => {
    await approve(s, s.digest)
    const instance = await deployRelease(db, s.driver, config, s.deps, {
      releaseId: s.releaseId,
      environmentId: s.production.id,
    })
    expect(instance.state).toBe('healthy')

    // §6's Route row, written with a value other than `internal` for the first time.
    const [route] = await db.select().from(routes).where(eq(routes.hostname, s.host))
    expect(route?.listener).toBe('public')

    // AND THE EDGE ITSELF, on the public listener: the instance's own identity header,
    // which the wildcard does not set (Decision 7). This is the assertion that the
    // deploy's own `waitForIdentity` also makes, repeated here because the route can be
    // moved afterwards and because a status alone proves nothing.
    const onPublic = await askEdge(s, PUBLIC_PORT)
    expect({ status: onPublic.status, instance: onPublic.instance }).toEqual({
      status: 200,
      instance: instance.id,
    })
    // And the deploy that made it true recorded the launch (P6b Task 4, Decision 1).
    expect(await launchedAt(db, s.project.id)).toBeInstanceOf(Date)
  }, 900_000)

  it('a production route is NOT on srv0 — the internal listener does not serve it', async () => {
    const [instance] = await db
      .select()
      .from(instances)
      .where(eq(instances.environmentId, s.production.id))
    expect(instance?.state).toBe('healthy')
    /**
     * **THE IDENTITY, NEVER THE STATUS** (P6a sitting 2's F5, the most expensive finding
     * of this plan so far): a name the split makes unreachable answers **200 with an
     * empty body**, not a TLS error, because Caddy's certificate cache is app-global. So
     * a status assertion here is green whether the split holds or leaks, and the only
     * thing that can tell them apart is whether the answer carries this instance's
     * header.
     */
    const onInternal = await askEdge(s)
    expect(onInternal.instance).toBeUndefined()
  }, 120_000)

  it('registers the Service Provider with PRODUCTION values, and the row is in the IdP', async () => {
    const row = await readSpRow(s.pool, s.entityId)
    expect(row, `no saml20_sp_remote row at ${s.entityId}`).toBeDefined()
    // D15's derivation, for production: the entityID ends `/production` and the ACS is on
    // the BARE hostname — no `staging.` sub-zone and no port. A row that carried the
    // staging values here would send a real assertion to the wrong origin.
    expect(row!.AssertionConsumerService[0]?.Location).toBe(
      `https://${s.host}/auth/ubcshib/callback`,
    )
    expect(row!.SingleLogoutService[0]?.Location).toBe(`https://${s.host}/auth/logout`)
    expect(row!.attributes).toEqual(['ubcEduCwlPuid', 'mail'])
    expect(row!.certData).toMatch(/^[A-Za-z0-9+/=]{100,}$/)
  }, 120_000)

  it('the container is running the digest the administrator approved', async () => {
    /**
     * §13's *promotion never rebuilds*, read off the MACHINE rather than off a row: the
     * image the app container was created from, as the daemon reports it. A row saying
     * the right thing beside a container running something else is precisely the shape
     * this project has paid for (P3 Session 5), and no other assertion here can see it.
     */
    const { stdout: names } = await run('docker', [
      'ps',
      '--filter',
      `label=manifest.slug=${s.slug}`,
      '--filter',
      'label=manifest.release',
      '--format',
      '{{.Names}}',
    ])
    const container = names.trim().split('\n').filter(Boolean).at(-1)
    expect(container, 'no app container for this slug is running').toBeDefined()
    const { stdout: image } = await run('docker', [
      'inspect',
      '-f',
      '{{.Config.Image}}',
      container!,
    ])
    expect(image.trim()).toContain(s.digest)
  }, 120_000)

  /**
   * **`[M7]`, CLOSED, AGAINST THE REAL EDGE** (P6b Task 4, Decision 16). Sitting 1 measured
   * a rehearsal after launch retiring the live, approved instance and putting the
   * unapproved candidate on the public listener, with nothing saying so. This project has
   * launched (the deploy above recorded it), and a candidate is serving staging — so the
   * refusal below is the ONLY thing between the rehearsal and the live listener. The public
   * listener's answer is read before and after, by the instance's own header: that the
   * launched instance is still the one answering is what *production is untouched* means
   * on a machine, rather than on a row.
   */
  it('refuses a rehearsal once the app has launched — REHEARSAL_LAUNCHED, and the public listener still answers as the launched instance', async () => {
    const stagingInstance = await deployRelease(db, s.driver, config, s.deps, {
      releaseId: s.releaseId,
      environmentId: (await stagingOf(s)).id,
    })
    expect(stagingInstance.state).toBe('healthy')
    const before = await askEdge(s, PUBLIC_PORT)
    expect(before.instance).toEqual(expect.any(String))

    const refused = await runRehearsal(
      {
        db,
        driver: s.driver,
        config,
        deploy: s.deps,
        signIn: {
          signIn: () => {
            throw new Error('the rehearsal reached the SIGN-IN; it should refuse first')
          },
        },
        bus: s.deps.bus,
      },
      s.project.id,
      { userId: s.userId, puid: `puid-${s.slug}` },
    ).catch((e: unknown) => e)

    // UNTOUCHED FIRST, THE CODE SECOND: with `runRehearsal`'s read removed, this holds —
    // `deployRelease`'s read refuses before anything starts — and the red is the code.
    const after = await askEdge(s, PUBLIC_PORT)
    expect({ status: after.status, instance: after.instance }).toEqual({
      status: 200,
      instance: before.instance,
    })
    expect(refused).toMatchObject({ code: 'REHEARSAL_LAUNCHED' })
  }, 900_000)
})

/**
 * **D21'S REHEARSAL, RUN AGAINST A REAL DEPLOY AND A REAL REGISTRATION — AND RECORDED AS
 * FAILED, WHICH IS THE POINT** (P6a Task 14, the plan's control (b) as a test rather than
 * as a mutation).
 *
 * **ITS OWN PROJECT SINCE P6b TASK 4**: it ran on the suite above's project after that
 * project's launch, and a launched project now refuses a rehearsal by design (Decision
 * 16) — the refusal is the suite above's last case. Moving it BEFORE the launch instead
 * was rejected: every earlier case's *"first production deploy"* claim would then meet a
 * production instance the rehearsal left behind, and each would need re-reading.
 *
 * R2 rejected a checkbox by name: the item is met by a MEASUREMENT. This suite's app is
 * `fixture-node@1`'s skeleton, which answers `200` to every path and has no CWL login
 * form — so the sign-in cannot complete, and a rehearsal that recorded `passed: true`
 * anyway would be exactly the checkbox R2 refused. The evidence says which hop failed.
 *
 * Everything EXCEPT the successful sign-in is real here: the candidate is deployed into
 * production, its Service Provider is registered with production values, and the probe
 * container really runs against the real edge and the real IdP. A PASSING rehearsal
 * needs an app with the blueprint's inherited auth surface — that is the live drive's
 * and `make demo-production`'s.
 */
describeDocker(
  'the rehearsal, on a project that has not launched (§13 D21, P6a Task 14)',
  () => {
    const s = productionSuite('prod-rehearse')

    it('runs the rehearsal, and records a sign-in that could not complete as FAILED', async () => {
      // A candidate: something serving STAGING, which is what production promotes (§13).
      const stagingInstance = await deployRelease(db, s.driver, config, s.deps, {
        releaseId: s.releaseId,
        environmentId: (await stagingOf(s)).id,
      })
      expect(stagingInstance.state).toBe('healthy')
      // THE POSITIVE HALF of the suite above's refusal: this project has not launched.
      expect(await launchedAt(db, s.project.id)).toBeNull()

      const row = await runRehearsal(
        {
          db,
          driver: s.driver,
          config,
          deploy: s.deps,
          // THE REAL PROBE, over the real engine, the platform CA and the platform resolver
          // — constructed exactly as `src/index.ts` constructs it.
          signIn: createCwlSignInProbe({
            engine,
            idpBaseUrl: config.idp.baseUrl,
            caCertPath: CA_CERT,
            dnsServer: '10.89.0.53',
            credentials: config.rehearsalCredentials,
          }),
          bus: s.deps.bus,
        },
        s.project.id,
        { userId: s.userId, puid: `puid-${s.slug}` },
      )

      expect(row.passed).toBe(false)
      expect(row.evidence.reason).toContain('CWL login form')
      // WHAT IT WAS RUN AGAINST is read off the registration the deploy wrote, not rebuilt:
      // production values, on the public listener, for the release that is serving staging.
      expect({
        entityId: row.entityId,
        acsUrl: row.acsUrl,
        listener: row.evidence.listener,
        hostname: row.evidence.hostname,
        releaseId: row.releaseId,
      }).toEqual({
        entityId: s.entityId,
        acsUrl: `https://${s.host}/auth/ubcshib/callback`,
        listener: 'public',
        hostname: s.host,
        releaseId: s.releaseId,
      })
      // And §13's item says so, in the evidence's own words — the gate and the record agree.
      const view = await computeLaunchReadiness(db, s.project.id)
      const item = view.items.find((i) => i.id === 'rehearsal')!
      expect(item.state).toBe('unmet')
      expect(item.why).toContain('CWL login form')
      // And a rehearsal is not a launch: its instance serves production, and yet.
      expect(await launchedAt(db, s.project.id)).toBeNull()
    }, 900_000)
  },
)
