import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { and, eq } from 'drizzle-orm'
import type pg from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  aiUserId,
  createLiteLlmClient,
  disabledAiKeyService,
  disabledCatalogue,
  ensureAiUser,
  type LiteLlmClient,
} from '../ai/index.js'
import { litellmMasterKey, litellmUrl } from '../ai/testing.js'
import { loadBlueprints } from '../blueprints/index.js'
import { loadConfig } from '../config.js'
import { appSpecs, db, events, projects, secrets, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { createEventBus, type EventBus } from '../observability/index.js'
import { checkSlug, createProject, recordRepository } from '../projects/index.js'
import { sessionActor, testAudience, testReservedLabels } from '../projects/testing.js'
import type { Driver } from '../runtime/index.js'
import {
  CA_CERT,
  createEngineClient,
  describeDocker,
  dockerDriverForTests,
  fixtureBareRepo,
  resolveSocketPath,
} from '../runtime/testing.js'
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import { createLocalSourceDriver, type SourceDriver } from '../source/index.js'
import {
  createIdpPool,
  createSsoRegistrar,
  deleteSpRow,
  readSpRow,
} from '../sso/index.js'
import { idpDatabaseUrl, idpSigningCertPath } from '../sso/testing.js'
import {
  createRelease,
  deleteProject,
  deployRelease,
  type DeleteDeps,
  type DeployDeps,
} from './index.js'
import { buildToEnd } from './testing.js'

const run = promisify(execFile)
const engine = createEngineClient({ socketPath: resolveSocketPath() })
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))
/** A slug of the test's OWN (Global Constraints): nothing here reaches another project. */
const SLUG = `del-${randomBytes(3).toString('hex')}`
const HOST = {
  sandbox: `${SLUG}.sandbox.manifest.internal`,
  staging: `${SLUG}.staging.manifest.internal`,
  production: `${SLUG}.manifest.internal`,
} as const
const SERVICE = `mf-${SLUG}-staging-db`
const ENTITY = (kind: string) => `https://manifest.internal/sp/${SLUG}/${kind}`
/** What the Caddyfile's wildcard answers a name no route holds — a name nobody has. */
const WILDCARD = 'manifest OK host='
const KINDS = ['sandbox', 'staging', 'production'] as const

/**
 * A request to `host` THROUGH THE EDGE, from a container on the platform network — the way a
 * person's browser reaches it, with the platform's own CA and DNS. Answers the status and the body.
 */
async function throughEdge(host: string): Promise<{ status: number; body: string }> {
  const { stdout } = await run('docker', [
    'run',
    '--rm',
    '--network',
    'manifest-platform',
    '--dns',
    '10.89.0.53',
    '-v',
    `${CA_CERT}:/ca.crt:ro`,
    'curlimages/curl:8.11.1',
    '--cacert',
    '/ca.crt',
    '-sS',
    '-m',
    '10',
    '-w',
    '\n%{http_code}',
    `https://${host}/`,
  ])
  const at = stdout.lastIndexOf('\n')
  return { status: Number(stdout.slice(at + 1)), body: stdout.slice(0, at) }
}

/** Every container Docker holds for the slug, running or not — by the driver's own label. */
const containersOf = async (): Promise<string[]> =>
  (
    (await engine.get<{ Names: string[] }[]>(
      `/containers/json?all=true&filters=${encodeURIComponent(
        JSON.stringify({ label: [`manifest.slug=${SLUG}`] }),
      )}`,
    )) ?? []
  ).flatMap((c) => c.Names)

/**
 * §11's DELETE AGAINST THE REAL PLATFORM (the front-end enablement plan's Task 12, Step 5): a real
 * app with a real Mongo, deployed to staging through the Docker driver and the edge; real sandbox,
 * staging and production SP rows in the Manifest IdP; a real LiteLLM user; a real bare repository
 * held by driver 1. ONE delete, then named cases over it — each property measured where it lives.
 * Then the slug TAKEN AGAIN by a new project, deployed cleanly on what the first left (nothing), a
 * launched project refused, and the second one deleted too: the last case finds nothing left.
 */
describeDocker('delete against the real platform (Task 12)', () => {
  let driver: Driver
  let pool: pg.Pool
  let llm: LiteLlmClient
  let bus: EventBus
  let source: SourceDriver
  let deleteDeps: DeleteDeps
  let deployDeps: DeployDeps
  let reposRoot = ''
  let userId = ''
  let first = { projectId: '', stagingId: '', releaseId: '' }
  let second = { projectId: '', stagingId: '', releaseId: '' }

  const config = loadConfig({
    MANIFEST_ENV: 'development',
    MANIFEST_DATABASE_URL: 'postgres://unused',
    MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
    MANIFEST_SESSION_SECRET: 'k'.repeat(32),
    MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
    MANIFEST_REPOS_ROOT: '/tmp/repos',
  })

  const resolved = (kind: 'sandbox' | 'staging' | 'production') => ({
    environmentKind: kind,
    port: 3000,
    health: '/healthz',
    resources: { cpu: 0.5, memory: '256Mi', pids: 128, disk: '1Gi' },
    env: [],
    // A DATABASE: what "destroys every data volume" is about. `fixtures/fixture-app` writes a row
    // per request and one per boot, and reports both counts.
    services: [{ name: 'db', type: 'mongo' as const, version: '7' }],
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

  /**
   * A project of the slug, with its repository held by driver 1 at the root this test's source
   * driver owns, built, released and deployed to staging — healthy. What `POST /v1/projects` and
   * the build, release and deploy routes do, in the functions they call.
   */
  async function deployedProject(): Promise<typeof first> {
    const { project, environments } = await createProject(
      db,
      config,
      await testReservedLabels(),
      {
        slug: SLUG,
        ownerId: userId,
        blueprintRef: 'fixture-node@1',
        starter: null,
        audience: testAudience(userId),
      },
    )
    const repo = fixtureBareRepo(join(reposRoot, `${SLUG}.git`))
    await recordRepository(db, project.id, {
      provider: 'local',
      fullName: SLUG,
      webUrl: null,
      mainProtected: true,
      protectionDetail: null,
      apiHost: null,
    })
    const stagingId = environments.find((e) => e.kind === 'staging')!.id
    const [appSpec] = await db
      .insert(appSpecs)
      .values({
        projectId: project.id,
        commitSha: repo.commitSha,
        parsed: {},
        schemaVersion: 1,
        valid: true,
      })
      .returning()
    const build = await buildToEnd(
      { db, driver, bus },
      {
        projectId: project.id,
        projectSlug: SLUG,
        appSpecId: appSpec!.id,
        commitSha: repo.commitSha,
        blueprintRef: 'fixture-node@1',
        repoPath: repo.repoPath,
      },
    )
    expect(build.status, build.error ?? '').toBe('succeeded')
    const releaseId = (
      await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec!.id,
        createdBy: userId,
        resolvedConfig: {
          sandbox: resolved('sandbox'),
          staging: resolved('staging'),
          production: resolved('production'),
        },
      })
    ).id
    const instance = await deployRelease(db, driver, config, deployDeps, {
      releaseId,
      environmentId: stagingId,
    })
    expect(instance.state).toBe('healthy')
    return { projectId: project.id, stagingId, releaseId }
  }

  const counts = async (): Promise<{ boots: number; writes: number }> => {
    const answer = await throughEdge(HOST.staging)
    expect(answer.status, answer.body).toBe(200)
    return JSON.parse(answer.body) as { boots: number; writes: number }
  }

  const remove = (projectId: string) =>
    deleteProject(deleteDeps, { projectId, actor: sessionActor({ userId }) })

  beforeAll(async () => {
    await resetDatabase()
    driver = await dockerDriverForTests({ readinessTimeoutMs: 60_000 })
    pool = createIdpPool(idpDatabaseUrl())
    llm = createLiteLlmClient({ baseUrl: litellmUrl(), masterKey: litellmMasterKey() })
    bus = createEventBus()
    reposRoot = mkdtempSync(join(tmpdir(), 'mf-delete-repos-'))
    source = createLocalSourceDriver(reposRoot)
    const [user] = await db
      .insert(users)
      .values({
        ubcCwlPuid: `puid-${SLUG}`,
        email: `${SLUG}@ubc.ca`,
        displayName: 'Delete Owner',
        role: 'member',
      })
      .returning()
    userId = user!.id
    const keys = await generateMasterKeypair()
    const appSecrets = createAppSecrets(keys)
    const sso = createSsoRegistrar(
      pool,
      keys,
      'https://manifest.internal',
      idpSigningCertPath(),
      bus,
    )
    deployDeps = {
      secrets: createServiceCredentials(keys, config.masterSecret),
      appSecrets,
      sso,
      blueprints: await loadBlueprints(BLUEPRINTS_ROOT),
      ai: disabledAiKeyService(),
      catalogue: disabledCatalogue(),
      bus,
      retirer: { schedule: () => undefined },
    }
    deleteDeps = {
      db,
      bus,
      driver,
      llm,
      sso,
      ai: disabledAiKeyService(),
      appSecrets,
      drainMs: 2_000,
      source,
    }
    first = await deployedProject()
    expect((await counts()).boots).toBe(1)
    // The Manifest IdP's THREE registrations a delete removes — production's as a laptop's launch
    // rehearsal writes it for a project that has not launched — registered for real.
    for (const environmentKind of KINDS) {
      await sso.registerServiceProvider(db, {
        projectId: first.projectId,
        slug: SLUG,
        environmentKind,
        hostname: HOST[environmentKind],
        auth: {
          provider: 'cwl',
          callback: '/auth/ubcshib/callback',
          logout: '/auth/logout',
          attributes: ['ubcEduCwlPuid', 'mail'],
        },
      })
      expect(await readSpRow(pool, ENTITY(environmentKind))).not.toBeUndefined()
    }
    // One of the project's model users, as a deploy with AI makes it — on the REAL gateway.
    await ensureAiUser(llm, {
      projectId: first.projectId,
      kind: 'staging',
      monthlyUsd: 5,
    })
    await expect(
      llm.get('/user/info', { user_id: aiUserId(first.projectId, 'staging') }),
    ).resolves.toBeDefined()
    // The positive controls, BEFORE the delete: the volume, the repository and the secrets exist.
    expect(await engine.get(`/volumes/${SERVICE}-data`)).not.toBeUndefined()
    expect(existsSync(join(reposRoot, `${SLUG}.git`))).toBe(true)
    expect(
      (await db.select().from(secrets).where(eq(secrets.projectId, first.projectId)))
        .length,
    ).toBeGreaterThan(0)

    await remove(first.projectId)
  }, 600_000)

  afterAll(async () => {
    // THE DELETE IS THE CLEANUP (Task 11's afterAll removed by hand what an archive keeps). What is
    // swept here is only what a FAILED case left — so each sweep names what it found: on a green run
    // the last case has already asserted there is nothing to find. No `.catch(() => undefined)`: a
    // failure is a leak worth seeing.
    const left = await containersOf()
    if (left.length > 0) {
      console.error(`[delete.docker] containers left for ${SLUG}: ${left.join(', ')}`)
      for (const name of left) await engine.del(`/containers/${name}?force=true&v=true`)
    }
    for (const kind of KINDS) {
      await engine.del(`/containers/mf-${SLUG}-${kind}-db?force=true&v=true`)
      await engine.del(`/containers/mf-${SLUG}-${kind}-egress?force=true&v=true`)
      await engine.del(`/networks/mf-${SLUG}-${kind}-net`)
      await engine.del(`/volumes/mf-${SLUG}-${kind}-db-data?force=true`)
      await deleteSpRow(pool, ENTITY(kind))
    }
    for (const projectId of [first.projectId, second.projectId]) {
      if (projectId === '') continue
      for (const kind of KINDS)
        await llm.post('/user/delete', { user_ids: [aiUserId(projectId, kind)] }).catch(
          // 404 is the green run's answer — every user already gone; anything else is re-thrown.
          (error: unknown) => {
            if ((error as { status?: number }).status !== 404) throw error
          },
        )
    }
    rmSync(reposRoot, { recursive: true, force: true })
    await pool.end()
    await resetDatabase()
  }, 300_000)

  it('the names answer nothing of the project — the wildcard, never the switched-off page', async () => {
    for (const host of [HOST.staging, HOST.sandbox]) {
      const answer = await throughEdge(host)
      expect(answer.body, host).toContain(WILDCARD)
      expect(answer.body).not.toContain('This app has been switched off by its owner.')
    }
  })

  it('destroys what runs AND its data: no container, no network, no volume', async () => {
    expect(await containersOf()).toEqual([])
    expect(await engine.get(`/containers/${SERVICE}/json`)).toBeUndefined()
    expect(await engine.get(`/networks/mf-${SLUG}-staging-net`)).toBeUndefined()
    // GONE — what an archive keeps (`releases/lifecycle.docker.test.ts` asserts it kept).
    expect(await engine.get(`/volumes/${SERVICE}-data`)).toBeUndefined()
  })

  it('destroys the repository, every secret, every SP row and the model users', async () => {
    expect(existsSync(join(reposRoot, `${SLUG}.git`))).toBe(false)
    expect(
      await db.select().from(secrets).where(eq(secrets.projectId, first.projectId)),
    ).toEqual([])
    for (const kind of KINDS) expect(await readSpRow(pool, ENTITY(kind))).toBeUndefined()
    await expect(
      llm.get('/user/info', { user_id: aiUserId(first.projectId, 'staging') }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('leaves a tombstone the audit trail keeps, and frees the slug', async () => {
    const [row] = await db
      .select({ state: projects.state, deletedAt: projects.deletedAt })
      .from(projects)
      .where(eq(projects.id, first.projectId))
    expect(row!.state).toBe('deleted')
    expect(row!.deletedAt).not.toBeNull()
    const deleted = await db
      .select()
      .from(events)
      .where(
        and(eq(events.projectId, first.projectId), eq(events.type, 'project.deleted')),
      )
    expect(deleted).toHaveLength(1)
    expect(await checkSlug(db, await testReservedLabels(), SLUG)).toEqual({
      slug: SLUG,
      available: true,
    })
  })

  it('a new project takes the slug and deploys cleanly — on a NEW, empty database', async () => {
    second = await deployedProject()
    // One boot, on a fresh volume: nothing of the first project's data came back.
    expect((await counts()).boots).toBe(1)
  }, 600_000)

  it('refuses a launched project by its own code, and takes nothing down', async () => {
    await db
      .update(projects)
      .set({ launchedAt: new Date() })
      .where(eq(projects.id, second.projectId))
    await expect(remove(second.projectId)).rejects.toMatchObject({
      name: 'ProjectStateError',
      code: 'PROJECT_LAUNCHED_NOT_DELETABLE',
    })
    expect((await throughEdge(HOST.staging)).status).toBe(200)
    expect(await engine.get(`/volumes/${SERVICE}-data`)).not.toBeUndefined()
  })

  it('the second project deleted too leaves NOTHING of the slug behind', async () => {
    // Never launched after all — the test's own row, put back as it was.
    await db
      .update(projects)
      .set({ launchedAt: null })
      .where(eq(projects.id, second.projectId))
    await remove(second.projectId)
    expect(await containersOf()).toEqual([])
    for (const kind of KINDS) {
      expect(await engine.get(`/networks/mf-${SLUG}-${kind}-net`)).toBeUndefined()
      expect(await engine.get(`/volumes/mf-${SLUG}-${kind}-db-data`)).toBeUndefined()
    }
    // The internal listener's two names, through the edge; production's is the public listener's,
    // which a container on the platform network does not reach — `release-names` removed it by the
    // same `@id` rule (the driver contract's `removeName`).
    for (const host of [HOST.sandbox, HOST.staging])
      expect((await throughEdge(host)).body).toContain(WILDCARD)
    expect(existsSync(join(reposRoot, `${SLUG}.git`))).toBe(false)
    expect(
      (
        await db
          .select({ state: projects.state })
          .from(projects)
          .where(eq(projects.slug, SLUG))
      ).map((r) => r.state),
    ).toEqual(['deleted', 'deleted'])
  }, 300_000)
})
