import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Driver, ImageRef, ServiceHandle } from '../driver.js'
import { InstanceNotReadyError, instanceName, serviceName } from '../driver.js'
import { appContainer, serviceContainer } from './names.js'
import { describeDocker } from './docker-tier.js'
import { renderInjection } from '../../spec/index.js'
import { CA_CERT, dockerDriverForTests, fixtureBareRepo } from './testing.js'

const run = promisify(execFile)
/**
 * DELIBERATELY NOT `fixture-app`, which is what `make demo` uses.
 *
 * A slug plus an environment kind determines the hostname (§23), the Caddy route
 * id, the app network and the service container — so two things using the same
 * slug are the same deployment. Sharing it meant this suite's `afterAll` removed
 * the demo's route and destroyed the demo's database with `deleteData: true`,
 * leaving a running app that had been healthy a minute earlier reporting
 * `unhealthy`, and this suite in turn failed INSTANCE_NOT_REACHABLE against a
 * route the demo owned. Measured 2026-09-07.
 */
const SLUG = 'fixture-rt'
const KIND = 'staging' as const
const RELEASE = 'r1'
const HOST = `${SLUG}.staging.manifest.internal`
const INSTANCE = appContainer(instanceName(SLUG, KIND, RELEASE))
const SERVICE = serviceName(SLUG, KIND, 'db')

/**
 * From a container, through the edge. The control plane is a host process and a
 * host process cannot reach a container IP on Docker Desktop (§21, S1) — and this
 * additionally proves DNS, the Caddy route and the listener, which is what
 * "reachable" means to the faculty member who asked for the app.
 *
 * NO `-k`, and the CA is mounted rather than trusted blindly: S7 put trust in three
 * places deliberately, and `-k` would make this pass against a certificate the edge
 * had no business serving.
 */
async function throughEdge(path: string): Promise<Record<string, unknown>> {
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
    '15',
    `https://${HOST}${path}`,
  ])
  return JSON.parse(stdout) as Record<string, unknown>
}

/**
 * Docker's own HEALTHCHECK runs on an interval (2 s start period, then every 3 s),
 * so the answer is not instant even once the app serves. Polled rather than slept
 * on, and it still FAILS if health never arrives — this is an assertion with
 * patience, not a wait that always passes.
 */
async function healthWithin(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const status = await driverRef!.status(INSTANCE)
    if (status.healthy || Date.now() >= deadline) return status
    await new Promise((r) => setTimeout(r, 500))
  }
}

let driverRef: Driver | undefined

// §12 stores service credentials, so the CALLER resolves them. In production
// that is `deployRelease`; here it is this constant. The driver uses what it is
// handed and derives nothing — driver-contract.ts asserts that for both drivers.
const CREDENTIALS = {
  username: 'app_docker_tier',
  password: 'd'.repeat(32),
  database: 'docker_tier',
}

describeDocker('P3 acceptance: bare repo to a healthy manifest.internal URL', () => {
  let driver: Driver
  let repo: { repoPath: string; commitSha: string }
  let image: ImageRef
  let service: ServiceHandle

  const specFor = () => ({
    name: instanceName(SLUG, KIND, RELEASE),
    projectSlug: SLUG,
    environmentKind: KIND,
    releaseId: RELEASE,
    image,
    /**
     * §8's variables through the PLATFORM's renderer, not a block written here.
     *
     * This test used to set `MONGODB_DB_NAME: 'app'` itself, and that is exactly
     * why nobody could see that `deployRelease` never injected it: the app read
     * the value the test supplied, while every real deploy fell back to a
     * database called `app` whose credentials had been minted for another one.
     * Removing the hand-built block is the point of Task 11 — the name now comes
     * out of the endpoint, so this asserts the contract instead of restating it.
     *
     * `port: 8080` is deliberately NOT the blueprint's default_port of 3000. If
     * PORT were not really injected the app would listen on 3000 while the health
     * check and the Caddy upstream both point at 8080, and this deploy would fail
     * rather than pass by coincidence.
     */
    env: renderInjection({
      resolved: {
        environmentKind: KIND,
        port: 8080,
        health: '/healthz',
        resources: { cpu: 0.5, memory: '256Mi', pids: 128, disk: '1Gi' },
        env: [],
        services: [{ type: 'mongo', version: '7', name: 'db' }],
        egressAllow: [],
        classification: 'internal',
        auth: {
          provider: 'none',
          attributes: [],
          callback: '/auth/ubcshib/callback',
          logout: '/auth/logout',
        },
        ai: { models: [], budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 } },
      },
      environmentKind: KIND,
      hostname: HOST,
      projectSlug: SLUG,
      idp: {
        entityId: 'https://idp.manifest.internal/idp/shibboleth',
        baseUrl: 'https://idp.manifest.internal',
        spEntityBase: 'https://manifest.internal',
      },
      secrets: { sessionSecret: 'roundtrip-session-secret' },
      services: [{ type: 'mongo', endpoint: service.endpoint }],
    }),
    port: 8080,
    healthPath: '/healthz',
    needsAiGateway: false,
    resources: { cpu: 0.5, memoryMi: 256, pids: 128, diskMi: 1024 },
    services: [service],
    egressAllow: [],
  })

  beforeAll(async () => {
    driver = await dockerDriverForTests()
    driverRef = driver
    repo = fixtureBareRepo()
  }, 120_000)

  afterAll(async () => {
    await driver.destroyInstance(INSTANCE).catch(() => undefined)
    await driver
      .destroyService(serviceContainer(SERVICE), { deleteData: true })
      .catch(() => undefined)
    // `-v`, for the reason `make reset` now carries: a container removed without
    // it orphans any anonymous volume its image declared.
    await run('docker', ['rm', '-f', '-v', `mf-${SLUG}-${KIND}-egress`]).catch(
      () => undefined,
    )
  }, 120_000)

  it('builds an app the platform did not write, from a bare repo at a commit', async () => {
    image = await driver.buildImage(repo, {
      blueprintRef: 'fixture-node@1',
      projectSlug: SLUG,
    })
    expect(image.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(image.repository).toContain(`local/${SLUG}`)
  }, 600_000)

  it('provisions Mongo, starts the app, routes it, and serves it over trusted TLS', async () => {
    service = await driver.ensureService({
      name: SERVICE,
      type: 'mongo',
      version: '7',
      environmentId: 'env-1',
      projectSlug: SLUG,
      credentials: CREDENTIALS,
    })
    const handle = await driver.ensureInstance(specFor())
    expect(handle.url).toBe(`https://${HOST}`)

    // The certificate has to actually verify. `ssl_verify_result` of 0 is the
    // assertion; an http_code alone would pass with -k against anything.
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
      '-o',
      '/dev/null',
      '-w',
      '%{ssl_verify_result} %{http_code}',
      '--retry',
      '10',
      '--retry-all-errors',
      '--retry-delay',
      '2',
      `https://${HOST}/healthz`,
    ])
    expect(stdout.trim()).toBe('0 200')

    // The SHAPE of the answer. `{status:'ok'}` alone would pass with no database:
    // `mongo: true` is only written after a successful ping against the bound
    // service, which is what makes this evidence the binding is real.
    expect(await throughEdge('/healthz')).toEqual({ status: 'ok', mongo: true })

    /**
     * AND THE CONTAINER'S OWN HEALTHCHECK AGREES. Nothing in this repository had
     * ever asserted `healthy === true` against the real driver — the contract
     * suite checks `state`, not health — and it was FALSE for every instance the
     * platform ever started: D18 puts `http_proxy` in the container, BusyBox wget
     * honours it and ignores NO_PROXY, so the probe for the app's own loopback
     * went to the egress proxy and came back `403 Filtered`. §11's state machine
     * then recorded a working deploy as `failed`. Measured 2026-09-07.
     *
     * The two questions are different — this one is the container's, the one above
     * is the edge's — and a deploy needs both.
     */
    const status = await healthWithin(20_000)
    expect(status.state).toBe('healthy')
    expect(status.healthy).toBe(true)
  }, 300_000)

  it('runs non-root, and its data survives a stop and a start', async () => {
    const before = (await throughEdge('/')) as {
      boots: number
      uid: number
      env: string
      url: string
    }
    expect(before.uid).not.toBe(0)
    // The §8 contract is P4's, but these three are already injected and an app
    // that cannot see its own environment is not deployed, only running.
    expect(before.env).toBe(KIND)
    expect(before.url).toBe(`https://${HOST}`)

    await driver.stopInstance(INSTANCE)
    expect((await driver.status(INSTANCE)).state).toBe('hibernated')

    // Waking is the same call that created it (§11's idempotent ensureInstance).
    await driver.ensureInstance(specFor())
    const after = (await throughEdge('/')) as { boots: number }
    // `boots` is written ONCE PER PROCESS START, never by a request. Rising is
    // therefore evidence of BOTH halves of this test's name: the app really
    // restarted, and the previous run's row is still in the volume. A counter that
    // rose per request would rise whether or not either had happened.
    expect(after.boots).toBe(before.boots + 1)
  }, 300_000)

  /**
   * THE CONTROL FOR THE READINESS GATE, which is a control this plan added because
   * it was missing: `waitForReady`/`edgeProbe` existed from Task 14 and NOTHING
   * called them, so `ensureInstance` returned a handle for an app that was not yet
   * answering. The wake path above is what caught it — Caddy's 502, empty body.
   *
   * A gate nobody has watched fail is not a gate. Here the container is healthy and
   * routed, and only the upstream PORT is wrong, so the single thing under test is
   * "does the deploy notice that the hostname does not serve?".
   */
  it('REFUSES to call a deploy done when the hostname does not serve', async () => {
    const impatient = await dockerDriverForTests({ readinessTimeoutMs: 12_000 })
    const spec = specFor()
    const refusal = impatient.ensureInstance({
      ...spec,
      name: instanceName(SLUG, KIND, 'unreachable'),
      releaseId: 'unreachable',
      // The app really is up and really is routed. It listens on 8080; the route
      // and the health check are pointed at a port nothing is bound to, so the
      // edge answers 502 for ever.
      port: 9999,
    })
    // WITH THE HANDLE (P4b Task 13). The container exists, and `deployRelease` reads
    // its exit code and log through this handle to record §14's Incident — an error
    // carrying only a code left it nothing to read.
    await expect(refusal).rejects.toBeInstanceOf(InstanceNotReadyError)
    await expect(refusal).rejects.toMatchObject({
      code: 'INSTANCE_NOT_REACHABLE',
      handle: { id: appContainer(instanceName(SLUG, KIND, 'unreachable')) },
      check: expect.stringMatching(
        /^readiness: GET \/\S+ at https:\/\/fixture-rt\.staging\.manifest\.internal through the edge — /,
      ),
    })
    await impatient
      .destroyInstance(appContainer(instanceName(SLUG, KIND, 'unreachable')))
      .catch(() => undefined)
  }, 300_000)
})
