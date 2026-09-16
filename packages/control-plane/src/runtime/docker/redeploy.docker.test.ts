import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Driver, ImageRef, InstanceSpec } from '../driver.js'
import { InstanceNotReadyError, instanceName } from '../driver.js'
import { renderInjection } from '../../spec/index.js'
import {
  applyRoute,
  createCaddyClient,
  instanceIdOf,
  removeRoute,
  servingRoute,
  type CaddyClient,
  type CaddyRoute,
} from '../../routing/index.js'
import { describeDocker } from './docker-tier.js'
import { appContainer, instanceAlias } from './names.js'
import { CA_CERT, dockerDriverForTests, ensureContractRepo } from './testing.js'

const run = promisify(execFile)

/**
 * Its own slug, for the reason `roundtrip.docker.test.ts` gives at length: a slug
 * plus an environment determines the hostname, the route id, the app network and the
 * service container, so two suites sharing one are the same deployment — and this
 * one deliberately runs two instances of it at once.
 */
const SLUG = 'fixture-rd'
const KIND = 'staging' as const
const HOST = `${SLUG}.staging.manifest.internal`
const PORT = 8080

/**
 * Fixed instance ids, not `randomUUID()`. This suite names every container it
 * removes, and a random id leaks one container and one `-files` volume per run —
 * the reason `sso/testing.ts` and `roundtrip.docker.test.ts` both pin theirs
 * (P4c sitting 2, finding 21).
 */
const FIRST_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const SECOND_ID = 'bbbbbbbb-0000-4000-8000-000000000002'
const LYING_ID = 'cccccccc-0000-4000-8000-000000000003'
const NEVER_READY_ID = 'dddddddd-0000-4000-8000-000000000004'

const RELEASE_A = 'release-aaaaaaaa'
const RELEASE_B = 'release-bbbbbbbb'

const nameOf = (releaseId: string, instanceId: string): string =>
  appContainer(instanceName(SLUG, KIND, releaseId, instanceId))

const EVERY_CONTAINER = [
  nameOf(RELEASE_A, FIRST_ID),
  nameOf(RELEASE_B, SECOND_ID),
  nameOf(RELEASE_B, LYING_ID),
  nameOf('release-never', NEVER_READY_ID),
]

const ADMIN = 'http://127.0.0.1:7119'
const SERVERS = { internal: 'srv0', public: 'srv0' } as const
const routing = { caddy: createCaddyClient(ADMIN), servers: SERVERS }

/**
 * A request every 25 ms from inside ONE container, classified by body AND by the
 * edge's identity header, until a stop file appears.
 *
 * ONE container rather than one per request: `docker run` costs ~300 ms, which is
 * longer than the window a route change can leave open, so a loop paying that per
 * request could miss the very gap it exists to find.
 */
const startLoop = async (name: string): Promise<void> => {
  await run('docker', ['rm', '-f', name]).catch(() => undefined)
  await run('docker', [
    'run',
    '-d',
    '--name',
    name,
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
    'while [ ! -f /tmp/stop ]; do ' +
      "curl -s --cacert /ca.crt -m 5 -w '|%{http_code}|%header{x-manifest-instance}|END\\n' " +
      `https://${HOST}/healthz; sleep 0.025; done`,
  ])
}

interface Seen {
  body: string
  status: number
  instance: string
  /** The edge's fallback page, which answers 200 for a hostname with no route. */
  wildcard: boolean
}

const stopLoop = async (name: string): Promise<Seen[]> => {
  await run('docker', ['exec', name, 'touch', '/tmp/stop'])
  await run('docker', ['wait', name])
  const { stdout } = await run('docker', ['logs', name], { maxBuffer: 32 * 1024 * 1024 })
  return stdout
    .split('|END\n')
    .filter((line) => line.includes('|'))
    .map((line) => {
      const [body = '', status = '0', instance = ''] = line.split('|')
      return {
        body,
        status: Number(status),
        instance,
        wildcard: body.includes('manifest OK host='),
      }
    })
}

/**
 * THIS SUITE IS SEQUENTIAL, AND `vitest -t` WILL NOT WORK ON IT.
 *
 * Each test is a step in one story — first deploy, takeover, a release that never
 * becomes ready, a move that could not be confirmed — and each reads the state the
 * one before it left. Running a single test on its own gets `servingRoute` of
 * `undefined` and fails for a reason that has nothing to do with what it asserts,
 * which is how two negative controls in this sitting first came out wrong. Run the
 * whole file, and read the FIRST failure.
 */
describeDocker('a takeover, at the driver (§11 Redeploys)', () => {
  let driver: Driver
  let image: ImageRef
  const LOOP = `mf-${SLUG}-loop`

  const specFor = (releaseId: string, instanceId: string): InstanceSpec => ({
    name: instanceName(SLUG, KIND, releaseId, instanceId),
    instanceId,
    hostname: HOST,
    projectSlug: SLUG,
    environmentKind: KIND,
    releaseId,
    image,
    // Through the PLATFORM's renderer, never a block written here: a hand-built
    // environment is how `MONGODB_DB_NAME` went un-injected for a whole plan while
    // two Docker tests supplied it themselves and passed (P4a).
    env: renderInjection({
      resolved: {
        environmentKind: KIND,
        port: PORT,
        health: '/healthz',
        resources: { cpu: 0.5, memory: '256Mi', pids: 128, disk: '1Gi' },
        env: [],
        services: [],
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
      secrets: { sessionSecret: 'redeploy-session-secret' },
      services: [],
    }),
    port: PORT,
    healthPath: '/healthz',
    needsAiGateway: false,
    resources: { cpu: 0.5, memoryMi: 256, pids: 128, diskMi: 1024 },
    services: [],
    egressAllow: [],
  })

  beforeAll(async () => {
    driver = await dockerDriverForTests()
    /**
     * THE BLUEPRINT SKELETON, not `fixtures/fixture-app`.
     *
     * `fixture-app` connects to Mongo BEFORE it listens and exits if it cannot —
     * measured 2026-09-15 while writing this suite: with no service provisioned it
     * sat with `node server.js` running and nothing bound for 30 s, then died with
     * `MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017`, and the
     * readiness probe read 87 attempts of `000`. This suite is about routing, so it
     * uses the skeleton, which serves `/healthz` with no database at all — and which
     * Task 5 gives `/hold?ms=` for the drain tests.
     *
     * `ensureContractRepo` returns early when `/tmp/repo` exists, so a skeleton
     * edited after the first run is NOT rebuilt (Decision 24 gives it a stamp in
     * Task 5). Nothing here depends on anything the skeleton has gained since P3.
     */
    ensureContractRepo()
    image = await driver.buildImage(
      { repoPath: '/tmp/repo', commitSha: 'abc123' },
      { blueprintRef: 'fixture-node@1', projectSlug: SLUG },
    )
  }, 900_000)

  afterAll(async () => {
    await removeRoute(routing, HOST, KIND).catch(() => undefined)
    // By explicit name, with the named `-files` volumes each instance holds (P4b
    // finding 194) — never `dangling=true`, which lists other people's volumes.
    await run('docker', ['rm', '-f', '-v', ...EVERY_CONTAINER, LOOP]).catch(
      () => undefined,
    )
    await run('docker', [
      'volume',
      'rm',
      '-f',
      ...EVERY_CONTAINER.map((c) => `${c}-files`),
    ]).catch(() => undefined)
    await run('docker', ['rm', '-f', '-v', `mf-${SLUG}-${KIND}-egress`]).catch(
      () => undefined,
    )
    await run('docker', ['network', 'rm', `mf-${SLUG}-${KIND}-net`]).catch(
      () => undefined,
    )
  }, 300_000)

  /**
   * THE PLAN'S WHOLE CLAIM, at the driver, before any control plane exists.
   *
   * Before this task `ensureInstance` moved the route FIRST and then waited for the
   * app at its public hostname, so every redeploy pointed the hostname at a
   * container that had not started. Measured 2026-09-15 across three runs of
   * `make demo-redeploy`: a window of empty 502s 1.0-1.9 s long on every redeploy.
   */
  it('a second instance takes the hostname over with no 502 and no wildcard answer', async () => {
    const first = await driver.ensureInstance(specFor(RELEASE_A, FIRST_ID))
    expect(first.name).toBe(nameOf(RELEASE_A, FIRST_ID))
    // The route reaches the first instance BY IDENTITY before anything is measured.
    expect((await servingRoute(routing, HOST))?.instanceId).toBe(FIRST_ID)

    // The loop starts AFTER the first instance serves: before that the wildcard
    // answers, and counting that would be counting the platform's normal state.
    await startLoop(LOOP)
    await new Promise((r) => setTimeout(r, 2000))
    const second = await driver.ensureInstance(specFor(RELEASE_B, SECOND_ID))
    await new Promise((r) => setTimeout(r, 1000))
    const seen = await stopLoop(LOOP)

    // BESIDE, not instead of: the first container is still running. That is what
    // makes a drain possible at all (Task 5), and it is the difference between a
    // redeploy and the destroy-and-recreate this replaces.
    expect(second.name).toBe(nameOf(RELEASE_B, SECOND_ID))
    expect((await driver.status(first.id)).state).not.toBe('gone')

    expect(seen.length).toBeGreaterThan(50)
    expect(seen.filter((r) => r.wildcard)).toEqual([])
    expect(seen.filter((r) => r.status >= 500)).toEqual([])
    // R1 tolerates the connection reset a Caddy configuration reload occasionally
    // causes — about one request in 300 per admin change, measured 2026-09-15 — and
    // counts it rather than failing on it. This deploy makes ONE admin change.
    expect(seen.filter((r) => r.status === 0).length).toBeLessThanOrEqual(2)
    // And it really did change instance — otherwise a route that never moved would
    // pass every assertion above.
    expect(seen.at(0)!.instance).toBe(FIRST_ID)
    expect(seen.at(-1)!.instance).toBe(SECOND_ID)
    expect((await servingRoute(routing, HOST))?.instanceId).toBe(SECOND_ID)
  }, 900_000)

  /**
   * R5: a release that never becomes ready leaves the previous one serving. The
   * route never moves, so there is nothing to put back.
   */
  it('an instance that never becomes ready leaves the route where it was', async () => {
    const before = await servingRoute(routing, HOST)
    expect(before?.instanceId).toBe(SECOND_ID)

    const impatient = await dockerDriverForTests({ readinessTimeoutMs: 12_000 })
    /**
     * A PORT NOTHING IS BOUND TO, not a path the app does not serve.
     *
     * Both fixture apps answer 200 for ANY path — the skeleton's fallback and
     * `fixture-app`'s catch-all both do — so `healthPath: '/never-ready'` would have
     * made this instance ready and the test pass for the wrong reason. Measured
     * 2026-09-15; it is a correction Task 5's continuity fixtures need too, because
     * they assert the opposite. The app really is up and really is listening; the
     * probe is pointed where nothing answers, so it gets connection-refused for ever
     * and the one thing under test is whether the route moved.
     */
    const refusal = impatient.ensureInstance({
      ...specFor('release-never', NEVER_READY_ID),
      port: 9999,
    })
    await expect(refusal).rejects.toBeInstanceOf(InstanceNotReadyError)
    // WITH THE HANDLE, and the container still there: §14's Incident is read through
    // it, and §11 has the CALLER remove it once that is captured (Decision 10).
    await expect(refusal).rejects.toMatchObject({
      code: 'INSTANCE_NOT_REACHABLE',
      handle: { id: nameOf('release-never', NEVER_READY_ID) },
      /**
       * `readiness:`, NOT `identity:` — and that prefix is the assertion that the
       * route was never touched. A probe that asked the PUBLIC HOSTNAME would be
       * answered 200 by the instance already serving, so readiness would pass, the
       * route would move to this broken instance, and the failure would surface one
       * step later as an identity refusal with a rollback. The app would come back,
       * but it would have been moved away and back under live traffic for nothing.
       */
      check: expect.stringMatching(
        new RegExp(
          `^readiness: GET /\\S+ on ${instanceAlias(NEVER_READY_ID)}:9999 from the edge — `,
        ),
      ),
    })
    expect(
      (await impatient.status(nameOf('release-never', NEVER_READY_ID))).state,
    ).not.toBe('gone')

    // AND THE APP IS UNTOUCHED. This is the assertion the whole rule is for.
    const after = await servingRoute(routing, HOST)
    expect(after?.instanceId).toBe(SECOND_ID)
    expect(after?.upstream).toBe(before?.upstream)
  }, 600_000)

  /**
   * DECISION 7'S ROLLBACK. A move the edge cannot be shown to have made is put back
   * — because a hostname left on a move nobody confirmed is exactly the outage this
   * plan removes, and the previous instance is still running and still healthy.
   *
   * THE ROUTE REALLY HAS TO MOVE FOR THIS TO TEST ANYTHING. The first version of
   * this test used a driver whose route WRITES did nothing, so the route never
   * changed — and negative control (b), deleting the `restoreRouteTo` call
   * altogether, came out GREEN: there was nothing to undo. Measured 2026-09-15, and
   * it is Task 1 finding 11's shape a second time. So this driver's writes SUCCEED
   * and write a route that dials nowhere: the hostname genuinely stops serving, the
   * identity check genuinely cannot pass, and putting the previous route back is the
   * only thing that can restore the app.
   */
  it('a move the edge cannot confirm is put back', async () => {
    const before = await servingRoute(routing, HOST)
    expect(before?.instanceId).toBe(SECOND_ID)

    const real = createCaddyClient(ADMIN)
    /** Breaks the upstream of a route naming THIS instance, and nothing else — so
     *  the rollback, which writes the PREVIOUS route, goes through untouched. */
    const sabotage = (route: CaddyRoute): CaddyRoute =>
      instanceIdOf(route) !== LYING_ID
        ? route
        : {
            ...route,
            handle: route.handle.map((handler) =>
              (handler as { handler?: string }).handler === 'reverse_proxy'
                ? { handler: 'reverse_proxy', upstreams: [{ dial: 'mf-i-nowhere:9999' }] }
                : handler,
            ),
          }
    const sabotaged: CaddyClient = {
      ...real,
      patchRoute: (routeId, route) => real.patchRoute(routeId, sabotage(route)),
      putRoute: (server, route) => real.putRoute(server, sabotage(route)),
    }
    const lying = await dockerDriverForTests({
      routing: { caddy: sabotaged, servers: SERVERS },
    })
    const refusal = lying.ensureInstance(specFor(RELEASE_B, LYING_ID))
    await expect(refusal).rejects.toBeInstanceOf(InstanceNotReadyError)
    // `identity:`, not `readiness:` — this instance IS ready on its own network, and
    // what failed is the edge reaching it. That is the branch the rollback is in.
    await expect(refusal).rejects.toMatchObject({
      check: expect.stringMatching(/^identity: /),
    })

    // AND WHAT SERVED STILL SERVES, read from the REAL edge rather than from the
    // driver's own view of it.
    const after = await servingRoute(routing, HOST)
    expect(after?.instanceId).toBe(SECOND_ID)
    expect(after?.upstream).toBe(`${instanceAlias(SECOND_ID)}:${PORT}`)
    // Through the wire too: the configuration being right is not the same fact as
    // the app answering.
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
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}|%header{x-manifest-instance}',
      `https://${HOST}/healthz`,
    ])
    expect(stdout.trim()).toBe(`200|${SECOND_ID}`)
  }, 600_000)

  /**
   * Decision 2, as a test: the edge dials the ALIAS, and the alias is what resolves.
   * A route pointed at the container NAME is the shape that breaks silently once a
   * slug is long enough to push the name past 63 octets — measured 2026-09-15, a
   * 72-character name does not resolve from inside the edge at all.
   */
  it('routes to the instance alias, never to the container name', async () => {
    const serving = await servingRoute(routing, HOST)
    expect(serving?.upstream).toBe(`${instanceAlias(SECOND_ID)}:${PORT}`)
    expect(serving?.upstream).not.toContain(SLUG)

    // And the alias really is what the edge resolves — asked from inside the edge,
    // which is where Caddy dials from.
    const { stdout } = await run('docker', [
      'exec',
      'manifest-caddy',
      'curl',
      '-sS',
      '-m',
      '5',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      `http://${instanceAlias(SECOND_ID)}:${PORT}/healthz`,
    ])
    expect(stdout.trim()).toBe('200')
  }, 120_000)

  /**
   * The route belongs to the hostname, not to the instance that happened to win it.
   * `restoreRouteTo(undefined, …)` removing the route is what "put back what served
   * before" means when nothing did, and this is the state the next deploy starts in.
   */
  it('re-applies the route for a hostname that has none, with PUT', async () => {
    await removeRoute(routing, HOST, KIND)
    expect(await servingRoute(routing, HOST)).toBeUndefined()
    await applyRoute(routing, {
      hostname: HOST,
      upstream: `${instanceAlias(SECOND_ID)}:${PORT}`,
      kind: KIND,
      instanceId: SECOND_ID,
    })
    expect((await servingRoute(routing, HOST))?.instanceId).toBe(SECOND_ID)
  }, 120_000)
})
