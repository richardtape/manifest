import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { disabledAiKeyService, disabledCatalogue } from '../ai/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { loadConfig } from '../config.js'
import { appSpecs, db, incidents, instances, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { createEventBus, makeRedactor } from '../observability/index.js'
import { createProject } from '../projects/index.js'
import { createCaddyClient, removeRoute } from '../routing/index.js'
import type { Driver } from '../runtime/index.js'
import {
  createEngineClient,
  describeDocker,
  destroyAppNetwork,
  dockerDriverForTests,
  egressContainer,
  fixtureBareRepo,
  resolveSocketPath,
} from '../runtime/testing.js'
import {
  createAppSecrets,
  generateMasterKeypair,
  type AppSecretResolver,
} from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import { createRelease, deployRelease, type DeployDeps } from './index.js'
import { buildToEnd } from './testing.js'
import { testAudience, testReservedLabels } from '../projects/testing.js'

/**
 * AN APP'S DECLARED SECRET, IN A REAL CONTAINER (the authoring API plan's Task 8).
 *
 * `api/secrets.test.ts` drives the same three facts through the routes against the fake
 * driver, which answers what it is told. What no fake can show is the value arriving in a
 * REAL container's environment, and a real app printing it as it dies, read back out of the
 * log Docker kept and redacted with the secret set the deploy read. So this builds one app,
 * releases it once, and deploys it three times: to staging with no value (refused, nothing
 * started), to staging with one (healthy, the value in `docker inspect`), and to sandbox where
 * a plain variable makes it print the value and exit (an Incident, the value redacted).
 *
 * COMMITTED ROWS and SEQUENTIAL, as `redeploy.docker.test.ts` is: each case reads the state
 * the one before it left.
 */
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))
const SLUG = 'app-secrets-probe'
const NAME = 'BOARD_ADMIN_CODE'
/** Fourteen characters, which no heuristic redacts (asserted): only the app's own set can. */
const VALUE = 'swordfish-7c2e'

/**
 * Listens on PORT with `/healthz`, and needs no database — unless `CRASH_ON_BOOT` is set, when
 * it prints its configuration, the declared secret included, and exits before it listens:
 * the commonest way an app leaks a credential into its own log.
 */
const SERVER = [
  "import { createServer } from 'node:http'",
  "if (process.env.CRASH_ON_BOOT === '1') {",
  `  console.log('config dump: ${NAME}=' + process.env.${NAME})`,
  "  console.log('fatal: cannot start, exiting')",
  '  process.exit(3)',
  '}',
  'createServer((req, res) => {',
  "  res.writeHead(req.url === '/healthz' ? 200 : 404, { 'content-type': 'text/plain' })",
  "  res.end('ok')",
  '}).listen(Number(process.env.PORT ?? 3000))',
  '',
].join('\n')

const routing = {
  caddy: createCaddyClient('http://127.0.0.1:7119'),
  servers: { internal: 'srv0', public: 'srv0' } as const,
}
const engine = createEngineClient({ socketPath: resolveSocketPath() })

describeDocker('an app’s declared secret, in a real container (Task 8)', () => {
  let driver: Driver
  let appSecrets: AppSecretResolver
  let deps: DeployDeps
  let projectId: string
  let releaseId: string
  const environmentId: Partial<Record<'sandbox' | 'staging', string>> = {}

  const config = loadConfig({
    MANIFEST_ENV: 'development',
    MANIFEST_DATABASE_URL: 'postgres://unused',
    MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
    MANIFEST_SESSION_SECRET: 'k'.repeat(32),
    MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
    MANIFEST_REPOS_ROOT: '/tmp/repos',
  })

  /** Every kind declares the secret; sandbox also tells the app to crash. */
  const resolvedFor = (kind: 'sandbox' | 'staging' | 'production') => ({
    environmentKind: kind,
    port: 3000,
    health: '/healthz',
    resources: { cpu: 0.5, memory: '256Mi', pids: 128, disk: '1Gi' },
    env: [
      { name: NAME, secret: true },
      ...(kind === 'sandbox' ? [{ name: 'CRASH_ON_BOOT', value: '1' }] : []),
    ],
    services: [],
    egressAllow: [],
    classification: 'internal' as const,
    ai: {
      models: [] as string[],
      budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 },
    },
    auth: {
      provider: 'none' as const,
      attributes: [] as string[],
      callback: '/auth/ubcshib/callback',
      logout: '/auth/logout',
    },
  })

  /** Every container this project's deploys made — the app, and its egress — by label. */
  const containersOf = async (): Promise<{ Id: string; Names: string[] }[]> =>
    (await engine.get<{ Id: string; Names: string[] }[]>(
      `/containers/json?all=true&filters=${encodeURIComponent(
        JSON.stringify({ label: [`manifest.slug=${SLUG}`] }),
      )}`,
    )) ?? []

  beforeAll(async () => {
    await resetDatabase()
    // Twenty seconds of readiness: the healthy app listens in about one, and the sandbox
    // deploy is SUPPOSED to fail it.
    driver = await dockerDriverForTests({ readinessTimeoutMs: 20_000 })
    const repo = fixtureBareRepo(join(tmpdir(), `mf-${SLUG}.git`), {
      extraFiles: { 'server.js': SERVER },
    })
    const [user] = await db
      .insert(users)
      .values({
        ubcCwlPuid: `puid-${SLUG}`,
        email: `${SLUG}@ubc.ca`,
        displayName: 'O',
        role: 'member',
      })
      .returning()
    const { project, environments } = await createProject(
      db,
      config,
      await testReservedLabels(),
      {
        slug: SLUG,
        ownerId: user!.id,
        blueprintRef: 'fixture-node@1',
        starter: null,
        audience: testAudience(user!.id),
      },
    )
    projectId = project.id
    for (const kind of ['sandbox', 'staging'] as const)
      environmentId[kind] = environments.find((e) => e.kind === kind)!.id
    const [appSpec] = await db
      .insert(appSpecs)
      .values({
        projectId,
        commitSha: repo.commitSha,
        parsed: {},
        schemaVersion: 1,
        valid: true,
      })
      .returning()
    const bus = createEventBus()
    const build = await buildToEnd(
      { db, driver, bus },
      {
        projectId,
        projectSlug: SLUG,
        appSpecId: appSpec!.id,
        commitSha: repo.commitSha,
        blueprintRef: 'fixture-node@1',
        repoPath: repo.repoPath,
      },
    )
    expect(build.status, build.error ?? '').toBe('succeeded')
    releaseId = (
      await createRelease(db, {
        projectId,
        buildId: build.id,
        appSpecId: appSpec!.id,
        createdBy: user!.id,
        resolvedConfig: {
          sandbox: resolvedFor('sandbox'),
          staging: resolvedFor('staging'),
          production: resolvedFor('production'),
        },
      })
    ).id
    const keys = await generateMasterKeypair()
    appSecrets = createAppSecrets(keys)
    deps = {
      secrets: createServiceCredentials(keys, config.masterSecret),
      appSecrets,
      sso: {
        registerServiceProvider: () => {
          throw new Error('this app declares no sign-on')
        },
        idpSigningCertificate: () => {
          throw new Error('this app declares no sign-on')
        },
      },
      blueprints: await loadBlueprints(BLUEPRINTS_ROOT),
      ai: disabledAiKeyService(),
      catalogue: disabledCatalogue(),
      bus,
      // Nothing here is replaced by a later deploy of the same environment, so a recorder.
      retirer: { schedule: () => undefined },
    }
  }, 300_000)

  afterAll(async () => {
    await removeRoute(routing, `${SLUG}.staging.manifest.internal`, 'staging')
    // No `.catch(() => undefined)` on the container sweep: a failure is a leak worth seeing.
    for (const container of await containersOf())
      await engine.del(`/containers/${container.Id}?force=true&v=true`)
    for (const kind of ['sandbox', 'staging'] as const) {
      await engine.del(`/containers/${egressContainer(SLUG, kind)}?force=true&v=true`)
      await destroyAppNetwork(engine, SLUG, kind)
    }
    await resetDatabase()
  }, 300_000)

  const deploy = (kind: 'sandbox' | 'staging') =>
    deployRelease(db, driver, config, deps, {
      releaseId,
      environmentId: environmentId[kind]!,
    })

  it('refuses to deploy a release whose declared secret has no value — before any container starts', async () => {
    await expect(deploy('staging')).rejects.toMatchObject({
      code: 'RELEASE_SECRET_NOT_SET',
      message: expect.stringContaining(NAME),
    })
    expect(
      await db
        .select()
        .from(instances)
        .where(eq(instances.environmentId, environmentId.staging!)),
    ).toEqual([])
    // Nothing of this project exists in Docker: no app, no egress, no network member.
    expect(await containersOf()).toEqual([])
  })

  it('renders a set value into the container, and redacts it from an Incident', async () => {
    // A heuristic would not catch it: only the app's own secret set, read at capture, can.
    expect(makeRedactor([])(VALUE)).toBe(VALUE)
    await appSecrets.setEnvSecret(
      db,
      { projectId, environmentKind: 'staging' },
      NAME,
      VALUE,
    )
    const healthy = await deploy('staging')
    expect(healthy.state).toBe('healthy')
    const inspected = await engine.get<{ Config: { Env: string[] } }>(
      `/containers/${healthy.handle}/json`,
    )
    expect(inspected!.Config.Env).toContain(`${NAME}=${VALUE}`)

    await appSecrets.setEnvSecret(
      db,
      { projectId, environmentKind: 'sandbox' },
      NAME,
      VALUE,
    )
    const failed = await deploy('sandbox')
    expect(failed.state).toBe('failed')
    const [incident] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.instanceId, failed.id))
    expect(incident, 'the failed deploy recorded no Incident').toBeDefined()
    const lines = incident!.logTail.split('\n')
    // The positive control: the app really printed its configuration, and Docker kept it.
    expect(lines).toContain(`config dump: ${NAME}=[REDACTED]`)
    expect(lines.at(-1)).toBe('fatal: cannot start, exiting')
    expect(JSON.stringify(incident)).not.toContain(VALUE)
  })
})
