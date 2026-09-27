import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { disabledAiKeyService, disabledCatalogue } from '../ai/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { loadConfig } from '../config.js'
import { appSpecs, db, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import {
  OUTPUT_DEFAULTS,
  captureIncident,
  createEventBus,
  makeRedactor,
  readRecentOutput,
  type LineRedactor,
} from '../observability/index.js'
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
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import { createRelease, deployRelease } from './index.js'
import { buildToEnd } from './testing.js'
import { testAudience, testReservedLabels } from '../projects/testing.js'

/**
 * A RUNNING APP'S RECENT OUTPUT, READ FROM A REAL CONTAINER (the front-end enablement plan's
 * Task 2; Review Focus 1).
 *
 * `observability/output.test.ts` drives the reader against the fake driver, which answers
 * what it is told. What no fake can show is Docker's own output — its records, its stamps, a
 * megabyte line kept in 16 KiB pieces — read through the Docker driver and redacted with the
 * secret set a deploy reads. And the claim that matters: §14's *"redacted at read with the
 * rules that redact `Incident.log_tail`"* is ONE code path, so the same instance's output and
 * its Incident say the same thing, line for line.
 *
 * A HEALTHY instance, and an Incident captured of it directly: a FAILED deploy removes its
 * container once its Incident is captured (§11, `release.ts`), so no reader can read a failed
 * instance afterwards — which is why a client reads a failed instance's Incident, not its output.
 */
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))
const SLUG = 'recent-output-probe'
const NAME = 'BOARD_ADMIN_CODE'
/** Fourteen characters, which no heuristic redacts: only the app's own set can. */
const VALUE = 'swordfish-7c2e'
/**
 * A MULTI-LINE secret (the review's C1): a key the app prints line by line. Its body lines split
 * at `/` into pieces under 24 characters, so the entropy rule — run one line at a time — redacts
 * none of them: only a match over the lines JOINED can.
 */
const KEY_NAME = 'SIGNING_KEY'
const KEY_BODY = [
  'MIIEvQ/IBADANBgk/qhkiG9w0BAQEF/AASCBKcw',
  'ggSjAgEA/AoIBAQC7VJT/Ut9Us8cKjMzEfYyj',
]
const KEY = [
  '-----BEGIN PRIVATE KEY-----',
  ...KEY_BODY,
  '-----END PRIVATE KEY-----',
].join('\n')

/**
 * Prints its secret, its key line by line, one line of exactly 1 MiB, its secret again, and
 * `listening` once it is.
 */
const SERVER = [
  "import { createServer } from 'node:http'",
  `console.log('config dump: ${NAME}=' + process.env.${NAME})`,
  `console.log('signing key:\\n' + process.env.${KEY_NAME})`,
  "console.log('x'.repeat(1048576))",
  `console.log('also: ' + JSON.stringify({ code: process.env.${NAME} }))`,
  'createServer((req, res) => {',
  "  res.writeHead(req.url === '/healthz' ? 200 : 404, { 'content-type': 'text/plain' })",
  "  res.end('ok')",
  "}).listen(Number(process.env.PORT ?? 3000), () => console.log('listening'))",
  '',
].join('\n')

const routing = {
  caddy: createCaddyClient('http://127.0.0.1:7119'),
  servers: { internal: 'srv0', public: 'srv0' } as const,
}
const engine = createEngineClient({ socketPath: resolveSocketPath() })

describeDocker('an app’s recent output, read from a real container (Task 2)', () => {
  let driver: Driver
  let redact: LineRedactor
  let instance: { id: string; handle: string }

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
    env: [
      { name: NAME, secret: true },
      { name: KEY_NAME, secret: true },
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

  const containersOf = async (): Promise<{ Id: string }[]> =>
    (await engine.get<{ Id: string }[]>(
      `/containers/json?all=true&filters=${encodeURIComponent(
        JSON.stringify({ label: [`manifest.slug=${SLUG}`] }),
      )}`,
    )) ?? []

  beforeAll(async () => {
    await resetDatabase()
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
    const staging = environments.find((e) => e.kind === 'staging')!
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
    const bus = createEventBus()
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
    const release = await createRelease(db, {
      projectId: project.id,
      buildId: build.id,
      appSpecId: appSpec!.id,
      createdBy: user!.id,
      resolvedConfig: {
        sandbox: resolved('sandbox'),
        staging: resolved('staging'),
        production: resolved('production'),
      },
    })
    const keys = await generateMasterKeypair()
    const appSecrets = createAppSecrets(keys)
    const scope = { projectId: project.id, environmentKind: 'staging' as const }
    await appSecrets.setEnvSecret(db, scope, NAME, VALUE)
    await appSecrets.setEnvSecret(db, scope, KEY_NAME, KEY)
    const deployed = await deployRelease(
      db,
      driver,
      config,
      {
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
        retirer: { schedule: () => undefined },
      },
      { releaseId: release.id, environmentId: staging.id },
    )
    expect(deployed.state).toBe('healthy')
    instance = { id: deployed.id, handle: deployed.handle! }
    // The platform's OWN set for this scope — what the route and the deploy both read.
    redact = makeRedactor(await appSecrets.secretValues(db, scope))
    // A heuristic would not catch it: only the app's own set can.
    expect(makeRedactor([])(VALUE)).toBe(VALUE)
  }, 300_000)

  afterAll(async () => {
    await removeRoute(routing, `${SLUG}.staging.manifest.internal`, 'staging')
    // No `.catch(() => undefined)` on the sweep: a failure is a leak worth seeing.
    for (const container of await containersOf())
      await engine.del(`/containers/${container.Id}?force=true&v=true`)
    await engine.del(`/containers/${egressContainer(SLUG, 'staging')}?force=true&v=true`)
    await destroyAppNetwork(engine, SLUG, 'staging')
    await resetDatabase()
  }, 300_000)

  it('redacts an app’s own secrets from its recent output exactly as from its Incident', async () => {
    const out = await readRecentOutput(driver, instance.handle, OUTPUT_DEFAULTS, redact)
    const texts = out.lines.map((line) => line.text)
    // The positive control: the app really printed its secret, and Docker kept both lines.
    expect(texts).toContain(`config dump: ${NAME}=[REDACTED]`)
    expect(texts).toContain('also: {"code":"[REDACTED]"}')
    // The megabyte line: cut at 4 KiB, its 64 embedded stamps never counted.
    expect(texts).toContain(`${'x'.repeat(4096)}…[cut: 1044480 bytes]`)
    expect(texts.at(-1)).toBe('listening')
    expect(JSON.stringify(out)).not.toContain(VALUE)
    // The key: every line of it redacted, and none of its body anywhere.
    const signing = texts.indexOf('signing key:')
    expect(texts.slice(signing + 1, signing + 5)).toEqual(Array(4).fill('[REDACTED]'))
    for (const piece of KEY_BODY.flatMap((l) => l.split('/')))
      expect(JSON.stringify(out)).not.toContain(piece)
    expect(out.lines.every((line) => line.stamped)).toBe(true)
    expect(out.truncated).toEqual({ lines: false, bytes: false })
    expect(out.failure).toBeNull()

    // THE SAME INSTANCE'S INCIDENT, through the platform's own capture: line for line.
    const incident = await captureIncident(
      db,
      driver,
      { instanceId: instance.id, failedCheck: 'a probe of the reader, not a failure' },
      redact,
    )
    expect(incident.logTail.split('\n')).toEqual(texts)
    expect(JSON.stringify(incident)).not.toContain(VALUE)
    for (const piece of KEY_BODY.flatMap((l) => l.split('/')))
      expect(JSON.stringify(incident)).not.toContain(piece)
  })

  // Task 1's M1: Docker's `tail` counts its own records, and the megabyte line is dozens — so
  // asking for four records can begin INSIDE it.
  it('drops the fragment a tail begins inside, and says the log was longer', async () => {
    const out = await readRecentOutput(
      driver,
      instance.handle,
      { ...OUTPUT_DEFAULTS, lines: 3 },
      redact,
    )
    expect(out.lines.map((line) => line.text)).toEqual([
      'also: {"code":"[REDACTED]"}',
      'listening',
    ])
    expect(out.truncated.lines).toBe(true)
  })
})
