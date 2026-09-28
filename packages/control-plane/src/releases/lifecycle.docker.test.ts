import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type pg from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  agentKeyAlias,
  createLiteLlmClient,
  disabledAiKeyService,
  disabledCatalogue,
  personAiUserId,
  revokeKeyByAlias,
  startAgentSession,
  type LiteLlmClient,
} from '../ai/index.js'
import { declaredCatalogue, litellmMasterKey, litellmUrl } from '../ai/testing.js'
import { loadBlueprints } from '../blueprints/index.js'
import { loadConfig } from '../config.js'
import { appSpecs, db, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { createEventBus } from '../observability/index.js'
import { createProject } from '../projects/index.js'
import { sessionActor, testAudience, testReservedLabels } from '../projects/testing.js'
import { createCaddyClient, removeRoute } from '../routing/index.js'
import type { Driver } from '../runtime/index.js'
import {
  CA_CERT,
  createEngineClient,
  describeDocker,
  destroyAppNetwork,
  dockerDriverForTests,
  egressContainer,
  fixtureBareRepo,
  resolveSocketPath,
} from '../runtime/testing.js'
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import {
  createIdpPool,
  createSsoRegistrar,
  deleteSpRow,
  readSpRow,
} from '../sso/index.js'
import { idpDatabaseUrl, idpSigningCertPath } from '../sso/testing.js'
import { tokenActor } from '../tokens/index.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  archiveProject,
  createRelease,
  deployRelease,
  finishTeardowns,
  restoreProject,
  type DeployDeps,
  type LifecycleDeps,
} from './index.js'
import { buildToEnd } from './testing.js'

const run = promisify(execFile)
const engine = createEngineClient({ socketPath: resolveSocketPath() })
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))
/** A slug of the test's OWN (Global Constraints): nothing here reaches another project. */
const SLUG = `arch-${randomBytes(3).toString('hex')}`
const HOST = {
  sandbox: `${SLUG}.sandbox.manifest.internal`,
  staging: `${SLUG}.staging.manifest.internal`,
  production: `${SLUG}.manifest.internal`,
} as const
const SERVICE = `mf-${SLUG}-staging-db`
const ENTITY = (kind: string) => `https://manifest.internal/sp/${SLUG}/${kind}`
/** What the Caddyfile's wildcard answers a name no route holds — the one answer never allowed. */
const WILDCARD = 'manifest OK host='
const routing = {
  caddy: createCaddyClient('http://127.0.0.1:7119'),
  servers: { internal: 'srv0', public: 'srv1' } as const,
}

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

/** One model call with a key, answered RAW — the gateway's own status and error type. */
async function chat(key: string): Promise<{ status: number; type?: string }> {
  const res = await fetch(`${litellmUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'default-chat',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Answer with the single word ok.' }],
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: { type?: unknown } }
  return {
    status: res.status,
    ...(typeof body.error?.type === 'string' ? { type: body.error.type } : {}),
  }
}

/**
 * §11's ARCHIVE AND RESTORE AGAINST THE REAL PLATFORM (the front-end enablement plan's Task 11,
 * Step 8; Review Focus 2 and 4): a real app with a real Mongo, deployed to staging through the
 * Docker driver and the edge; real sandbox and staging SP rows in the Manifest IdP; a real agent
 * key at the running LiteLLM; a delegated token. ONE archive, then named cases over it — each
 * property measured where it lives: the name through the edge, the key at the gateway, the
 * containers and the volume in Docker, the rows in the IdP's database.
 */
describeDocker('archive and restore against the real platform (Task 11)', () => {
  let driver: Driver
  let pool: pg.Pool
  let llm: LiteLlmClient
  let lifecycle: LifecycleDeps
  let deployDeps: DeployDeps
  let projectId = ''
  let userId = ''
  let stagingId = ''
  let releaseId = ''
  let agentKey = ''
  let agentSessionId = ''
  let token = ''
  let before: { boots: number; writes: number }

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
    // A DATABASE: what "stops, and keeps the data" is about. `fixtures/fixture-app` writes a row
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

  const deployStaging = () =>
    deployRelease(db, driver, config, deployDeps, { releaseId, environmentId: stagingId })

  const counts = async (): Promise<{ boots: number; writes: number }> => {
    const answer = await throughEdge(HOST.staging)
    expect(answer.status, answer.body).toBe(200)
    return JSON.parse(answer.body) as { boots: number; writes: number }
  }

  beforeAll(async () => {
    await resetDatabase()
    driver = await dockerDriverForTests({ readinessTimeoutMs: 60_000 })
    pool = createIdpPool(idpDatabaseUrl())
    llm = createLiteLlmClient({ baseUrl: litellmUrl(), masterKey: litellmMasterKey() })
    const repo = fixtureBareRepo(join(tmpdir(), `mf-${SLUG}.git`))
    const [user] = await db
      .insert(users)
      .values({
        ubcCwlPuid: `puid-${SLUG}`,
        email: `${SLUG}@ubc.ca`,
        displayName: 'Archive Owner',
        role: 'member',
      })
      .returning()
    userId = user!.id
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
    projectId = project.id
    stagingId = environments.find((e) => e.kind === 'staging')!.id
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
        createdBy: userId,
        resolvedConfig: {
          sandbox: resolved('sandbox'),
          staging: resolved('staging'),
          production: resolved('production'),
        },
      })
    ).id
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
    lifecycle = {
      db,
      bus,
      driver,
      llm,
      sso,
      ai: disabledAiKeyService(),
      appSecrets,
      drainMs: 2_000,
    }
    expect((await deployStaging()).state).toBe('healthy')
    before = await counts()
    // The Manifest IdP's two registrations an archive removes — registered for real, as a CWL
    // app's deploy registers them, so the rows the IdP reads are the ones that must go.
    for (const environmentKind of ['sandbox', 'staging'] as const) {
      await sso.registerServiceProvider(db, {
        projectId,
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
    const started = await startAgentSession(
      {
        db,
        bus,
        llm,
        catalogue: declaredCatalogue(),
        agent: { monthlyUsd: 10, sessionCapUsd: 2 },
      },
      { actor: sessionActor({ userId }), projectId, name: 'archive-docker', capUsd: 1 },
    )
    agentKey = started.key
    agentSessionId = started.row.id
    token = (
      await mintTestToken(db, { userId, projectId, capabilities: ['project:read'] })
    ).plaintext
    // The positive controls, BEFORE the archive: the key answers, the token authenticates, and
    // the name serves the app.
    expect(await chat(agentKey)).toEqual({ status: 200 })
    expect(await tokenActor(db, token)).not.toBeUndefined()
    expect(before.boots).toBe(1)

    await archiveProject(lifecycle, { projectId, actor: sessionActor({ userId }) })
  }, 600_000)

  afterAll(async () => {
    // Task 12's delete is not built yet, so what an archive KEEPS is removed by hand here — the
    // routes it switched off, the kept volume, the repository — together with what a failed case
    // may have left. No `.catch(() => undefined)` on the sweep: a failure is a leak worth seeing.
    for (const kind of ['sandbox', 'staging', 'production'] as const)
      await removeRoute(routing, HOST[kind], kind)
    const containers =
      (await engine.get<{ Id: string }[]>(
        `/containers/json?all=true&filters=${encodeURIComponent(
          JSON.stringify({ label: [`manifest.slug=${SLUG}`] }),
        )}`,
      )) ?? []
    for (const container of containers)
      await engine.del(`/containers/${container.Id}?force=true&v=true`)
    await engine.del(`/containers/${SERVICE}?force=true&v=true`)
    await engine.del(`/containers/${egressContainer(SLUG, 'staging')}?force=true&v=true`)
    await destroyAppNetwork(engine, SLUG, 'staging')
    await engine.del(`/volumes/${SERVICE}-data?force=true`)
    rmSync(join(tmpdir(), `mf-${SLUG}.git`), { recursive: true, force: true })
    for (const kind of ['sandbox', 'staging']) await deleteSpRow(pool, ENTITY(kind))
    if (agentSessionId !== '') await revokeKeyByAlias(llm, agentKeyAlias(agentSessionId))
    if (userId !== '')
      await llm.post('/user/delete', { user_ids: [personAiUserId(userId)] })
    await pool.end()
    await resetDatabase()
  }, 300_000)

  it('a switched-off name answers 410 and never the wildcard', async () => {
    for (const host of [HOST.staging, HOST.sandbox]) {
      const answer = await throughEdge(host)
      expect(answer.status, `${host}: ${answer.body}`).toBe(410)
      expect(answer.body).toContain('This app has been switched off by its owner.')
      expect(answer.body).not.toContain(WILDCARD)
    }
  })

  it('archiving ends every agent session, and LiteLLM refuses their keys', async () => {
    expect(await chat(agentKey)).toEqual({ status: 401, type: 'token_not_found_in_db' })
    expect(await tokenActor(db, token)).toBeUndefined()
  })

  it('archiving stops what runs and keeps the data', async () => {
    const running =
      (await engine.get<{ Names: string[] }[]>(
        `/containers/json?all=true&filters=${encodeURIComponent(
          JSON.stringify({ label: [`manifest.slug=${SLUG}`] }),
        )}`,
      )) ?? []
    expect(running.map((c) => c.Names)).toEqual([])
    expect(await engine.get(`/containers/${SERVICE}/json`)).toBeUndefined()
    expect(
      await engine.get(`/containers/${egressContainer(SLUG, 'staging')}/json`),
    ).toBeUndefined()
    expect(await engine.get(`/networks/mf-${SLUG}-staging-net`)).toBeUndefined()
    // KEPT: the database's volume, for a restore.
    expect(await engine.get(`/volumes/${SERVICE}-data`)).not.toBeUndefined()
    for (const kind of ['sandbox', 'staging'])
      expect(await readSpRow(pool, ENTITY(kind))).toBeUndefined()
  })

  it('a restored project’s next deploy serves again, on its kept data', async () => {
    await restoreProject(lifecycle, { projectId, actor: sessionActor({ userId }) })
    // Restoring starts nothing: the name is still off until the deploy.
    expect((await throughEdge(HOST.staging)).status).toBe(410)
    expect((await deployStaging()).state).toBe('healthy')
    const after = await counts()
    // The first boot's row, and the request's row, are still there: the SAME data, not a new one.
    expect(after.boots).toBe(before.boots + 1)
    expect(after.writes).toBeGreaterThan(before.writes)
  }, 300_000)

  it('an edge restart leaves a switched-off name switched off, once the boot has finished it', async () => {
    await archiveProject(lifecycle, { projectId, actor: sessionActor({ userId }) })
    expect((await throughEdge(HOST.staging)).status).toBe(410)
    await run('docker', ['restart', 'manifest-caddy'])
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    // The restart dropped the page — the wildcard answers — which is why the boot must put it back.
    expect((await throughEdge(HOST.staging)).body).toContain(WILDCARD)
    const report = await finishTeardowns(lifecycle)
    expect(report).toEqual({ finished: [SLUG], failed: [] })
    const answer = await throughEdge(HOST.staging)
    expect(answer.status, answer.body).toBe(410)
    expect(answer.body).not.toContain(WILDCARD)
  }, 300_000)
})
