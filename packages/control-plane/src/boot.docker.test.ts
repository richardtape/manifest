import { execFile, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import pg from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { disabledAiKeyService, disabledCatalogue } from './ai/index.js'
import { loadBlueprints } from './blueprints/index.js'
import { loadConfig } from './config.js'
import { appSpecs, db, instances, users } from './db/index.js'
import { resetDatabase } from './db/testing.js'
import { createEventBus } from './observability/index.js'
import { createProject } from './projects/index.js'
import { createRelease, deployRelease, startBuild } from './releases/index.js'
import { createCaddyClient, removeRoute } from './routing/index.js'
import type { Driver } from './runtime/index.js'
import {
  CA_CERT,
  createEngineClient,
  describeDocker,
  destroyAppNetwork,
  dockerDriverForTests,
  egressContainer,
  ensureContractRepo,
  REPO_ROOT,
  resolveSocketPath,
} from './runtime/testing.js'
import { createAppSecrets, loadMasterKeypair } from './secrets/index.js'
import { createServiceCredentials } from './services/index.js'
import { litellmMasterKey } from './ai/testing.js'
import { deleteSpRow, readSpRow } from './sso/index.js'
import { idpDatabaseUrl } from './sso/testing.js'

/** Its own SP scope. `identity/saml.docker.test.ts` records why at length. */
const TEST_ENTITY_BASE = 'https://test-suite.manifest.internal'
const TEST_ENTITY_ID = `${TEST_ENTITY_BASE}/sp/manifest-control-plane/platform`

const run = promisify(execFile)

/**
 * THE DEFECT THIS PROJECT HAS SHIPPED TWICE.
 *
 * P2 finished with nothing that had ever executed `src/index.ts`. P3's own
 * self-review then found the same shape in P3: no task wired the Docker driver
 * into the boot entry point, so `make demo` — the plan's entire acceptance —
 * would have passed against the in-memory fake, which answers every call happily.
 *
 * So this boots the REAL entry point, the compiled one, and reads back the single
 * fact the file decides. It asserts the VALUE rather than the presence of a line:
 * "expected no match" cannot tell a fake driver from a log line that never
 * printed, and the log line not printing is exactly what happened when it went
 * through `app.log.info` under `logger: false`.
 *
 * Verified to fail on demand 2026-09-06: putting `createFakeDriver()` back prints
 * `"driver":"fake"` and the control plane comes up and serves 401 on /auth/me
 * exactly as before — indistinguishable at every level above this file.
 */
describeDocker('the boot entry point', () => {
  it('constructs the DOCKER driver, not the fake one', async () => {
    await run('pnpm', ['--filter', '@manifest/control-plane', 'build'], {
      cwd: REPO_ROOT,
    })

    const child = spawn('node', ['packages/control-plane/dist/index.js'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        MANIFEST_ENV: 'development',
        // A port of its own: the developer's own control plane may be on 7100.
        // The SP origin moves with it — `loadConfig` refuses a loopback origin
        // whose port is not the one the process listens on, which is the second
        // read of one setting and is exactly what would bite here.
        MANIFEST_PORT: '7188',
        MANIFEST_CONTROL_PLANE_ORIGIN: 'http://127.0.0.1:7188',
        MANIFEST_SP_ENTITY_BASE: TEST_ENTITY_BASE,
        MANIFEST_SESSION_SECRET: 'x'.repeat(32),
        MANIFEST_MASTER_SECRET: 'm'.repeat(32),
        MANIFEST_BLUEPRINTS_ROOT: `${REPO_ROOT}blueprints`,
        MANIFEST_REPOS_ROOT: `${REPO_ROOT}.manifest/repos`,
        // AI ON, with its key: the production shape of boot (P4b sitting 4). The
        // switched-off boot is `identity/saml.docker.test.ts`'s.
        MANIFEST_LITELLM_MASTER_KEY: litellmMasterKey(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      const line = await new Promise<string>((resolve, reject) => {
        let out = ''
        const timer = setTimeout(
          () => reject(new Error(`no boot line in 60s; output was:\n${out}`)),
          60_000,
        )
        const onData = (chunk: Buffer): void => {
          out += chunk.toString('utf8')
          const match = /\{"driver":"[^"]*"[^\n]*\}/.exec(out)
          if (match) {
            clearTimeout(timer)
            resolve(match[0])
          }
        }
        child.stdout.on('data', onData)
        child.stderr.on('data', onData)
        child.on('error', reject)
        child.on('exit', (code) => {
          clearTimeout(timer)
          reject(new Error(`the control plane exited with ${code}:\n${out}`))
        })
      })
      const boot = JSON.parse(line)
      expect(boot.driver).toBe('docker')
      // The second fact this file decides (P4b sitting 4, finding 38).
      expect(boot.ai).toBe('enabled')
      // §12's scrub, asserted at the ONLY place it can be: the real process.
      // `runtime/docker/builder.ts` spawns `docker` with `{ ...process.env }`,
      // so anything still in the environment at that moment reaches the build —
      // and a build log is a place secrets end up. This spawn sets
      // MANIFEST_SESSION_SECRET, MANIFEST_MASTER_SECRET and
      // MANIFEST_LITELLM_MASTER_KEY explicitly, so a scrub that ran removed at
      // least those three.
      expect(boot.secretsScrubbed).toBeGreaterThanOrEqual(3)

      // §9's registration, asserted where it is actually written: THE REAL BOOT.
      // `registerControlPlaneSp` is called from `index.ts` and nowhere else, and
      // "a module with no call site is not built" has been this project's defect
      // three times — twice with passing unit tests. The row is read back out of
      // the IdP's own database, and the ACS is checked against the port THIS
      // process was started on, so a boot that registered a stale origin fails
      // here rather than at somebody's first login.
      const pool = new pg.Pool({ connectionString: idpDatabaseUrl() })
      try {
        const row = await readSpRow(pool, TEST_ENTITY_ID)
        expect(row?.AssertionConsumerService[0]?.Location).toBe(
          'http://127.0.0.1:7188/auth/saml/callback',
        )
        // §9's fail-open rule: a row with no attribute list releases everything.
        // `eduPersonAffiliation` is deliberately NOT among them — a platform
        // role is Manifest's to decide, so the IdP is never asked for one.
        expect(row?.attributes).toEqual(['ubcEduCwlPuid', 'mail', 'givenName', 'sn'])
        expect(row?.certData).toBeTruthy()
        expect(row?.['validate.authnrequest']).toBe(true)
      } finally {
        await pool.end()
      }
    } finally {
      child.kill('SIGTERM')
      // Its OWN row, removed. The shared one is never written — see
      // `identity/saml.docker.test.ts`'s TEST_ENTITY_BASE.
      const pool = new pg.Pool({ connectionString: idpDatabaseUrl() })
      try {
        await deleteSpRow(pool, TEST_ENTITY_ID)
      } finally {
        await pool.end()
      }
    }
  }, 120_000)
})

/**
 * WHAT A CONTROL PLANE REPAIRS BEFORE IT SERVES ITS FIRST REQUEST (P4c Task 9).
 *
 * §12 says the control plane re-applies all routes at its own boot, and nothing did:
 * `reapplyAllRoutes` was exported and had no production caller, so an edge restart —
 * which drops every runtime route (ORIENTATION §4) — left every app answering the
 * wildcard until somebody redeployed it. A deploy this process was running when it
 * stopped left its row in `provisioning`, a state nothing moves. And a drain it was
 * in the middle of left a container running for ever.
 *
 * ONE BOOT, three assertions, because all three are set up before it and all three
 * are things that boot does. `recover.test.ts` pins each of them against the fake
 * driver; this is the only place the REAL entry point runs them, and "a module with
 * no call site is not built" has been this project's defect three times.
 */
describeDocker('boot recovers the routes, the interrupted deploys and the drains', () => {
  const SLUG = 'boot-recover'
  const KIND = 'staging' as const
  const HOST = `${SLUG}.staging.manifest.internal`
  const PORT = 3000
  const routing = {
    caddy: createCaddyClient('http://127.0.0.1:7119'),
    servers: { internal: 'srv0', public: 'srv0' } as const,
  }
  const engine = createEngineClient({ socketPath: resolveSocketPath() })

  let driver: Driver
  let child: ReturnType<typeof spawn> | undefined
  let boot: {
    routesRestored: number
    routesFailed: number
    interrupted: number
  }
  let serving: { id: string; handle: string }
  let retired: { id: string; handle: string }
  let interrupted: string
  let probeAfterBoot: { status: number; body: string; instance: string }

  /**
   * ONE REQUEST THROUGH THE REAL EDGE, from a container, classified by BODY and by
   * the edge's identity header. Never by status alone: the wildcard answers 200 for
   * any path on any `*.manifest.internal` name (P4b finding 193), so a status-only
   * check passes with no route at all — which is this task's negative control (d).
   */
  const probe = async (): Promise<{ status: number; body: string; instance: string }> => {
    const { stdout } = await run('docker', [
      'run',
      '--rm',
      '--network',
      'manifest-platform',
      '--dns',
      '10.89.0.53',
      '-v',
      `${CA_CERT}:/ca.crt:ro`,
      '--entrypoint',
      'sh',
      'curlimages/curl:8.11.1',
      '-c',
      "curl -s --cacert /ca.crt -m 10 -w '|%{http_code}|%header{x-manifest-instance}' " +
        `https://${HOST}/healthz`,
    ])
    const [body = '', status = '0', instance = ''] = stdout.split('|')
    return { body, status: Number(status), instance }
  }

  const appContainers = async (): Promise<string[]> => {
    const { stdout } = await run('docker', [
      'ps',
      '-a',
      '--filter',
      `label=manifest.slug=${SLUG}`,
      '--filter',
      `label=manifest.environment=${KIND}`,
      '--filter',
      'label=manifest.release',
      '--format',
      '{{.Names}}',
    ])
    return stdout.split('\n').filter((line) => line.trim() !== '')
  }

  const stateOf = async (id: string): Promise<string> =>
    (await db.select().from(instances).where(eq(instances.id, id)))[0]!.state

  beforeAll(async () => {
    await run('pnpm', ['--filter', '@manifest/control-plane', 'build'], {
      cwd: REPO_ROOT,
    })
    await resetDatabase()
    driver = await dockerDriverForTests()
    const repoPath = join(tmpdir(), `mf-${SLUG}.git`)
    // The blueprint SKELETON: it serves `/healthz` with no database (ORIENTATION §4).
    ensureContractRepo(repoPath)

    const config = loadConfig({
      MANIFEST_ENV: 'development',
      MANIFEST_DATABASE_URL: 'postgres://unused',
      MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
      MANIFEST_SESSION_SECRET: 'k'.repeat(32),
      MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
      MANIFEST_REPOS_ROOT: '/tmp/repos',
    })
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
        provider: 'none' as const,
        attributes: [] as string[],
        callback: '/auth/ubcshib/callback',
        logout: '/auth/logout',
      },
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
    const { project, environments } = await createProject(db, config, {
      slug: SLUG,
      ownerId: user!.id,
      blueprintRef: 'fixture-node@1',
    })
    const staging = environments.find((e) => e.kind === KIND)!
    expect(staging.hostname).toBe(HOST)
    const [spec] = await db
      .insert(appSpecs)
      .values({
        projectId: project.id,
        commitSha: 'abc123',
        parsed: {},
        schemaVersion: 1,
        valid: true,
      })
      .returning()

    /**
     * THE PLATFORM'S OWN MASTER KEY, not a generated one.
     *
     * The booted control plane reads `infra/secrets/master.key`, and `retireEnvironment`
     * opens the app's WHOLE secret set before it retires anything — to build §14's
     * redactor, which fails closed. A fixture that deployed under a fresh keypair
     * therefore leaves a set the real process cannot open, the pass throws
     * `SECRET_UNWRAP_FAILED` before it removes a single container, and NOTHING IS
     * REAPED — measured 2026-09-15, with both containers still running after 120 s and
     * the reason only in the child's stderr. Every other suite here generates its own
     * key because nothing else reads its rows back from another process.
     */
    const keys = await loadMasterKeypair(join(REPO_ROOT, 'infra/secrets/master.key'))
    const bus = createEventBus()
    // A RECORDING retirer, so this suite's setup leaves the old container running —
    // which is the drain a restart cut short, and what the BOOT is expected to finish.
    const deps = {
      secrets: createServiceCredentials(keys, config.masterSecret),
      appSecrets: createAppSecrets(keys),
      sso: {
        registerServiceProvider: () => {
          throw new Error('this app declares no sign-on')
        },
        idpSigningCertificate: () => {
          throw new Error('this app declares no sign-on')
        },
      },
      blueprints: await loadBlueprints(`${REPO_ROOT}blueprints`),
      ai: disabledAiKeyService(),
      catalogue: disabledCatalogue(),
      bus,
      retirer: { schedule: () => undefined },
    }
    const deployOnce = async () => {
      const build = await startBuild(db, driver, bus, {
        projectId: project.id,
        projectSlug: SLUG,
        appSpecId: spec!.id,
        commitSha: 'abc123',
        blueprintRef: 'fixture-node@1',
        repoPath,
      })
      expect(build.status, build.error ?? '').toBe('succeeded')
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: spec!.id,
        createdBy: user!.id,
        resolvedConfig: {
          sandbox: resolvedFor('sandbox'),
          staging: resolvedFor('staging'),
          production: resolvedFor('production'),
        },
      })
      const row = await deployRelease(db, driver, config, deps, {
        releaseId: release.id,
        environmentId: staging.id,
      })
      expect(row.state).toBe('healthy')
      return { id: row.id, handle: row.handle! }
    }
    // Two deploys, nothing retired: the first is a container that is running, is not
    // serving, and whose row says `destroying` — a drain a restart cut short.
    retired = await deployOnce()
    serving = await deployOnce()
    expect(await stateOf(retired.id)).toBe('destroying')

    // A deploy the restart interrupted: a row in `provisioning`, which nothing moves.
    interrupted = (
      await db
        .insert(instances)
        .values({
          environmentId: staging.id,
          releaseId: (
            await db.select().from(instances).where(eq(instances.id, serving.id))
          )[0]!.releaseId,
          driver: 'docker',
          state: 'provisioning',
        })
        .returning()
    )[0]!.id

    // AND THE EDGE FORGETS THE ROUTE, which is what `docker restart manifest-caddy`
    // does to every runtime route. The hostname now answers the wildcard.
    await removeRoute(routing, HOST, KIND)
    const lost = await probe()
    expect(lost.body).toContain('manifest OK host=')
    expect(lost.instance).toBe('')

    // THE REAL ENTRY POINT.
    child = spawn('node', ['packages/control-plane/dist/index.js'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        MANIFEST_ENV: 'development',
        MANIFEST_PORT: '7189',
        MANIFEST_CONTROL_PLANE_ORIGIN: 'http://127.0.0.1:7189',
        MANIFEST_SP_ENTITY_BASE: TEST_ENTITY_BASE,
        MANIFEST_SESSION_SECRET: 'x'.repeat(32),
        MANIFEST_MASTER_SECRET: 'm'.repeat(32),
        MANIFEST_BLUEPRINTS_ROOT: `${REPO_ROOT}blueprints`,
        MANIFEST_REPOS_ROOT: `${REPO_ROOT}.manifest/repos`,
        MANIFEST_LITELLM_MASTER_KEY: litellmMasterKey(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const line = await new Promise<string>((resolve, reject) => {
      let out = ''
      const timer = setTimeout(
        () => reject(new Error(`no boot line in 120s; output was:\n${out}`)),
        120_000,
      )
      const onData = (chunk: Buffer): void => {
        out += chunk.toString('utf8')
        const match = /\{"driver":"[^"]*"[^\n]*\}/.exec(out)
        if (match) {
          clearTimeout(timer)
          resolve(match[0])
        }
      }
      child!.stdout!.on('data', onData)
      child!.stderr!.on('data', onData)
      child!.on('error', reject)
      child!.on('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`the control plane exited with ${code}:\n${out}`))
      })
    })
    boot = JSON.parse(line)
    probeAfterBoot = await probe()
    // The retire is BACKGROUND WORK and the boot line does not wait for it, so this
    // waits for the one thing it must do — never a fixed sleep, which is how P4c's
    // own acceptance answered zero questions in a whole run (sitting 1).
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      if ((await appContainers()).length <= 1) break
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }, 900_000)

  afterAll(async () => {
    child?.kill('SIGTERM')
    await removeRoute(routing, HOST, KIND).catch(() => undefined)
    const left = await appContainers().catch(() => [])
    if (left.length > 0) {
      await run('docker', ['rm', '-f', '-v', ...left]).catch(() => undefined)
      await run('docker', ['volume', 'rm', '-f', ...left.map((c) => `${c}-files`)]).catch(
        () => undefined,
      )
    }
    await engine.del(`/containers/${egressContainer(SLUG, KIND)}?force=true&v=true`)
    await destroyAppNetwork(engine, SLUG, KIND).catch(() => undefined)
    const pool = new pg.Pool({ connectionString: idpDatabaseUrl() })
    try {
      await deleteSpRow(pool, TEST_ENTITY_ID)
    } finally {
      await pool.end()
    }
    await resetDatabase()
  }, 300_000)

  it('re-applies an app’s route at boot, after the edge lost it', async () => {
    expect(boot.routesRestored).toBe(1)
    expect(boot.routesFailed).toBe(0)
    /**
     * BY IDENTITY, NEVER BY STATUS. The edge's wildcard answers 200 for any path on
     * any `*.manifest.internal` name, so `expect(status).toBe(200)` passes with no
     * route at all — measured in `beforeAll` above, before the boot, which is this
     * task's negative control (d) written into the test rather than only run once.
     */
    expect(probeAfterBoot.instance).toBe(serving.id)
    expect(probeAfterBoot.body).not.toContain('manifest OK host=')
    expect(probeAfterBoot.status).toBe(200)
  }, 120_000)

  it('finishes a drain a restart cut short', async () => {
    // A running, non-serving container and a row in `destroying`: after boot the
    // container is gone and the row says so, with no deploy having happened.
    expect(await appContainers()).toEqual([serving.handle])
    expect(await stateOf(retired.id)).toBe('gone')
    expect(await stateOf(serving.id)).toBe('healthy')
  }, 120_000)

  it('ends a deploy the restart interrupted', async () => {
    expect(boot.interrupted).toBe(1)
    expect(await stateOf(interrupted)).toBe('failed')
  }, 120_000)
})
