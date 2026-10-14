import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
// Through `runtime/`'s public TEST surface, not a deep path into runtime/docker/.
// §5's boundary rule is enforced by `module-boundaries.test.ts`, which is why
// `runtime/testing.ts` exists.
import {
  createEngineClient,
  describeDocker,
  REPO_ROOT,
  resolveSocketPath,
} from '../runtime/testing.js'
import { appHealthPolicy, buildRoute, createCaddyClient } from './caddy.js'
import { routeIdFor } from './hostnames.js'
import { edgeIdentityProbe, waitForIdentities } from './readiness.js'
import { applyRoute, removeRoute, servingRoute } from './routes.js'
import { stubAppArgs } from './testing.js'

const run = promisify(execFile)
const caddy = createCaddyClient('http://127.0.0.1:7119')
const deps = { caddy, servers: { internal: 'srv0', public: 'srv0' } }
const HOST = 'routetest.staging.manifest.internal'
const APP = 'mf-routetest-staging-app'
/** A second app, so a route can be MOVED rather than only created and removed. */
const APP_B = 'mf-routetest-staging-app-b'
/** An app that serves its OWN X-Manifest-Instance. The forgery `deferred` refuses. */
const FORGER = 'mf-routetest-staging-forger'
const INSTANCE_A = '11111111-1111-4111-8111-111111111111'
const INSTANCE_B = '22222222-2222-4222-8222-222222222222'
/** The forger's own instance — never another stub's, or two containers would share an alias. */
const INSTANCE_F = '77777777-7777-4777-8777-777777777777'
/**
 * What a route dials for an instance: its `mf-i-<id>` alias, which each stub carries on the
 * network. Since A1 (Task 2) the edge reads `X-Manifest-Instance` off the alias it dialled,
 * so a stub reached by its container name would answer as no instance at all.
 */
const dial = (instanceId: string) => `mf-i-${instanceId}:8080`
/** One instance's route — a set of one, no health policy — as the driver writes it today. */
const routeTo = (instanceId: string) => ({
  hostname: HOST,
  kind: 'staging' as const,
  upstreams: [{ dial: dial(instanceId), instanceId }],
  health: 'none' as const,
})
/** The request loop that watches a move happen. */
const LOOP = 'mf-routetest-staging-loop'
const CA = join(REPO_ROOT, 'infra/ca/manifest-root.crt')

/**
 * Through the edge, FROM A CONTAINER, over HTTPS, with the platform CA — the same
 * path `scripts/verify.sh` uses. A host process cannot reach container IPs on
 * Docker Desktop (S1), so the probe has to run inside one.
 *
 * It returns the BODY, not the status code, and that is the whole point. The
 * Caddyfile's `*.staging.manifest.internal` wildcard answers **200** for every host
 * in the zone whether or not a route exists (measured 2026-09-06:
 * `manifest OK host=routetest.staging.manifest.internal`). A status assertion
 * therefore cannot tell "reached the app" from "reached the fallback" — it passes
 * with no route at all, and can never go red when the route is removed.
 * `plain HTTP` is wrong for a second reason: the edge listens on :443 only and
 * answers **308** to http://, so every positive assertion would fail too.
 */
const bodyThroughEdge = async (host: string): Promise<string> =>
  (
    await run('docker', [
      'run',
      '--rm',
      '--network',
      'manifest-platform',
      '--dns',
      '10.89.0.53',
      '-v',
      `${CA}:/ca.crt:ro`,
      'curlimages/curl:8.11.1',
      '--cacert',
      '/ca.crt',
      '-sS',
      '-m',
      '10',
      `https://${host}/`,
    ])
  ).stdout.trim()

/** The response headers, so §20's protections are asserted ON THE WIRE. */
const headersThroughEdge = async (host: string): Promise<string> =>
  (
    await run('docker', [
      'run',
      '--rm',
      '--network',
      'manifest-platform',
      '--dns',
      '10.89.0.53',
      '-v',
      `${CA}:/ca.crt:ro`,
      'curlimages/curl:8.11.1',
      '--cacert',
      '/ca.crt',
      '-sS',
      '-m',
      '10',
      '-o',
      '/dev/null',
      '-D',
      '-',
      `https://${host}/`,
    ])
  ).stdout.toLowerCase()

/** What the app says. */
const APP_BODY = 'ok'
/** What the SECOND app says. A different length, so a truncated read is visible. */
const APP_B_BODY = 'okay-b'
/** What the Caddyfile wildcard says when NO route matches. The discriminator. */
const FALLBACK = 'manifest OK host='

const spec = routeTo(INSTANCE_A)

/**
 * A request every 25 ms from inside ONE container, classified by body AND by the
 * identity header, until a stop file appears.
 *
 * One container, not one per request: `docker run` costs ~300 ms here, which is
 * longer than the window a delete-then-insert move leaves open — a loop that paid
 * that per request could miss the very gap it exists to find. The body is what
 * discriminates (the wildcard answers 200, so a status cannot), and the identity
 * says which instance served.
 */
const startLoop = async (host: string, name: string): Promise<void> => {
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
    `${CA}:/ca.crt:ro`,
    '--entrypoint',
    'sh',
    'curlimages/curl:8.11.1',
    '-c',
    'while [ ! -f /tmp/stop ]; do ' +
      "curl -s --cacert /ca.crt -m 5 -w '|%{http_code}|%header{x-manifest-instance}|END\\n' " +
      `https://${host}/; sleep 0.025; done`,
  ])
}

/** Stops the loop and reads back one record per request. */
const stopLoop = async (
  name: string,
): Promise<{ body: string; status: number; instance: string }[]> => {
  await run('docker', ['exec', name, 'touch', '/tmp/stop'])
  await run('docker', ['wait', name])
  const { stdout } = await run('docker', ['logs', name], { maxBuffer: 32 * 1024 * 1024 })
  return stdout
    .split('|END\n')
    .filter((line) => line.includes('|'))
    .map((line) => {
      const [body = '', status = '0', instance = ''] = line.split('|')
      return { body, status: Number(status), instance }
    })
}

describeDocker('runtime routing through the Caddy admin API', () => {
  /**
   * IN beforeAll, NOT in the first `it`.
   *
   * Every test below reaches one of these three containers, and three of them reach
   * `APP`, which used to be created by the first test alone — so running any other
   * one on its own (`vitest -t …`, which is how a negative control is watched) got
   * an empty body and failed for a reason that had nothing to do with what it
   * asserts. Measured 2026-09-15 while watching control (a): it went red on
   * `expected '' to be 'ok'` before the loop had run at all. That is P2's defect 7
   * exactly — three tests depending on a side effect of the first — and
   * `readiness.docker.test.ts` already avoids it this way.
   *
   * The route is removed here too, so the first test's wildcard control still has
   * something to control for.
   */
  beforeAll(async () => {
    await removeRoute(deps, HOST, 'staging').catch(() => undefined)
    await run('docker', ['rm', '-f', APP, APP_B, FORGER]).catch(() => undefined)
    // Real HTTP servers, never `nc`: an `nc` stand-in answers before it is asked, and
    // the edge's pooled connection to it turned one request into an empty 502
    // (`stubAppArgs` has the measurement).
    await run(
      'docker',
      stubAppArgs(APP, APP_BODY, {}, { aliases: [`mf-i-${INSTANCE_A}`] }),
    )
    await run(
      'docker',
      stubAppArgs(APP_B, APP_B_BODY, {}, { aliases: [`mf-i-${INSTANCE_B}`] }),
    )
    await run(
      'docker',
      stubAppArgs(
        FORGER,
        APP_BODY,
        { 'X-Manifest-Instance': 'forged' },
        { aliases: [`mf-i-${INSTANCE_F}`] },
      ),
    )
    // A server needs a moment before it accepts; a probe of a container that has not
    // bound yet reads as the app being broken.
    await new Promise((r) => setTimeout(r, 1500))
  }, 120_000)

  afterAll(async () => {
    await removeRoute(deps, HOST, 'staging').catch(() => undefined)
    // Explicit names, never a label or repeated `name` filters — repeated `name`
    // filters OR, and once listed another app's container during a cleanup (P4b 192).
    await run('docker', ['rm', '-f', APP, APP_B, FORGER, LOOP]).catch(() => undefined)
  })

  it('routes a hostname to a container after boot', async () => {
    // The control: BEFORE the route exists the wildcard already answers 200. This
    // is what makes the assertions below mean something.
    expect(await bodyThroughEdge(HOST)).toContain(FALLBACK)

    await applyRoute(deps, spec)
    expect(await bodyThroughEdge(HOST)).toBe(APP_BODY)
  })

  // §20's "baseline protections live where an app cannot remove them", asserted on
  // the wire rather than in the JSON we sent. The app is 30 bytes of `nc` and sets
  // no headers of its own, so every one of these came from the route.
  it("serves §20's edge protections on the app's own responses", async () => {
    const headers = await headersThroughEdge(HOST)
    expect(headers).toContain('strict-transport-security: max-age=31536000')
    expect(headers).toContain('x-content-type-options: nosniff')
    expect(headers).toContain('referrer-policy: strict-origin-when-cross-origin')
    expect(headers).toContain("content-security-policy: frame-ancestors 'self'")
  })

  it('is idempotent — applying twice leaves ONE route for the host', async () => {
    await applyRoute(deps, spec)
    const routes = await caddy.getRoutes('srv0')
    expect(routes.filter((r) => r.match?.[0]?.host?.includes(HOST))).toHaveLength(1)
    expect(await bodyThroughEdge(HOST)).toBe(APP_BODY)
  })

  it('removes the route by id, and the host falls back to the wildcard', async () => {
    await removeRoute(deps, HOST, 'staging')
    expect(await bodyThroughEdge(HOST)).toContain(FALLBACK)
  })

  /**
   * S1's lost route, as a test. This is the property §12 gained a sentence for, and
   * `applyRoute` is what re-applies it since P4c deleted `reapplyAllRoutes` — a
   * function with no production caller (Decision 22). Task 9 gives the re-apply its
   * caller at the control plane's boot; until then nothing on this machine does it,
   * which is why a Docker-tier run leaves every app on the wildcard.
   */
  it('re-applies a route after the edge is restarted', async () => {
    await applyRoute(deps, spec)
    expect(await bodyThroughEdge(HOST)).toBe(APP_BODY)

    await run('docker', ['restart', 'manifest-caddy'])
    await new Promise((r) => setTimeout(r, 5000))
    // The route is GONE, and this assertion is the finding rather than a bug.
    expect(await bodyThroughEdge(HOST)).toContain(FALLBACK)

    await applyRoute(deps, spec)
    expect(await bodyThroughEdge(HOST)).toBe(APP_BODY)
  })

  /**
   * THE MEASUREMENT THIS WHOLE PLAN RESTS ON, as a test.
   *
   * `applyRoute` used to DELETE by `@id` and then PUT at index 0. Between those two
   * calls the hostname has no route, and the edge's wildcard answers it — 200, with
   * a body that is not the app's. Measured 2026-09-15: 4 wildcard answers in 320
   * requests across 20 delete-then-insert moves, 0 in 330 across 20 in-place
   * PATCHes. Nothing that reads a status can see the difference, which is why this
   * asserts on the body and on the identity header.
   */
  it('moves a route between two upstreams with no wildcard answer', async () => {
    await applyRoute(deps, spec)
    // The loop starts only once the app is serving: before that the wildcard is the
    // platform's normal state, and counting it would be counting nothing.
    expect(await bodyThroughEdge(HOST)).toBe(APP_BODY)

    await startLoop(HOST, LOOP)
    await new Promise((r) => setTimeout(r, 2000))
    for (let i = 1; i <= 20; i += 1) {
      const toB = i % 2 === 1
      await applyRoute(deps, routeTo(toB ? INSTANCE_B : INSTANCE_A))
      await new Promise((r) => setTimeout(r, 300))
    }
    await new Promise((r) => setTimeout(r, 1000))
    const seen = await stopLoop(LOOP)

    // Enough requests to have covered the moves at all: 20 moves, 300 ms apart.
    expect(seen.length).toBeGreaterThan(100)
    expect(seen.filter((r) => r.body.includes(FALLBACK))).toEqual([])
    // R1 tolerates the connection reset a Caddy configuration reload occasionally causes,
    // and counts it — the brief measured ONE in about 300 requests across 20 changes,
    // which is this test's own shape. So a reset is counted here the way both takeover
    // tests count it, and never read for an identity it cannot carry (P4c finding 49).
    // Measured 2026-09-16 (P4c sitting 8): a full `pnpm test:docker` failed this test on
    // exactly one status-0 record with an empty body — no wildcard, no 5xx. A 502 is
    // NOT tolerated: the one this test once saw was its `nc` stand-in's (finding 74).
    const answered = seen.filter((r) => r.status !== 0)
    expect(seen.length - answered.length).toBeLessThanOrEqual(2)
    expect(answered.filter((r) => r.status !== 200)).toEqual([])
    // And it really did move — otherwise a route that never changed would pass every
    // assertion above.
    expect(new Set(answered.map((r) => r.instance))).toEqual(
      new Set([INSTANCE_A, INSTANCE_B]),
    )
    // Each answer's identity matches the body that came with it, so the header is
    // the app's own route rather than a value left over from the previous one.
    for (const record of answered) {
      expect(record.instance).toBe(record.body === APP_BODY ? INSTANCE_A : INSTANCE_B)
    }
  }, 120_000)

  /**
   * §20's "protections live where an app cannot remove them", tested against an app
   * that tries. An undeferred `headers` handler ADDS the edge's value beside the
   * app's, and a client reading the header then gets `"edge-value, forged"` — so a
   * deploy could be told the instance it started is serving when it is not.
   */
  it('sets X-Manifest-Instance itself, and an app cannot serve its own', async () => {
    // THE POSITIVE CONTROL FIRST. Without it a green result below is equally
    // consistent with an app that never served the header at all, and Task 1's M2
    // was exactly that: a probe that printed nothing read as "not set" (finding 12).
    const direct = (
      await run('docker', [
        'exec',
        'manifest-caddy',
        'curl',
        '-sS',
        '-m',
        '5',
        '-o',
        '/dev/null',
        '-D',
        '-',
        `http://${FORGER}:8080/`,
      ])
    ).stdout.toLowerCase()
    expect(direct).toContain('x-manifest-instance: forged')

    await applyRoute(deps, routeTo(INSTANCE_F))
    const headers = await headersThroughEdge(HOST)
    // EXACTLY the bare id, once — read off the alias the edge dialled, its `mf-i-` taken off.
    expect(headers.match(/x-manifest-instance: .*/g)).toEqual([
      `x-manifest-instance: ${INSTANCE_F}`,
    ])
    expect(headers).not.toContain('forged')
  }, 120_000)

  // `servingRoute` reads the edge's own configuration rather than the wire, which is
  // what Task 5's `servingInstances` and Task 4's rollback both rest on.
  it('reports what the hostname reaches, from the edge’s own configuration', async () => {
    await applyRoute(deps, spec)
    const serving = await servingRoute(deps, HOST)
    expect(serving?.upstreams).toEqual([dial(INSTANCE_A)])
    expect(serving?.instanceIds).toEqual([INSTANCE_A])
    await removeRoute(deps, HOST, 'staging')
    expect(await servingRoute(deps, HOST)).toBeUndefined()
  })
})

/**
 * A1's ROUTE ON THE REAL EDGE (Task 2, Decision 4): one hostname, a SET of instances behind
 * it — round robin, an app's health policy, each answer naming exactly the instance that gave
 * it. What Task 1 measured in a throwaway Caddy (`[M2]`), here on `manifest-caddy` itself,
 * written by the code that writes every app's route. Its own hostname and stubs, so nothing
 * above is disturbed and each case runs alone (`vitest -t`), which is how a negative control
 * is watched.
 */
const SET_HOST = 'routeset.staging.manifest.internal'
const SET_ONE = 'mf-routeset-staging-one'
const SET_TWO = 'mf-routeset-staging-two'
/** Answers `503` to everything but `/healthz` — an app shedding load (`[M2]` (c′)). */
const SET_SHED = 'mf-routeset-staging-shed'
/**
 * Answer `502` and `504` to everything but `/healthz` — an app whose OWN dependency failed (the proof
 * app answers `502` when its model's gateway does), not a member the edge cannot reach (A1 sitting 8,
 * the whole-branch review's I1).
 */
const SET_BADGW = 'mf-routeset-staging-badgw'
const SET_GWTIMEOUT = 'mf-routeset-staging-gwtimeout'
const ONE_ID = '8a8a8a8a-0000-4000-8000-000000000001'
const TWO_ID = '8b8b8b8b-0000-4000-8000-000000000002'
const SHED_ID = '8c8c8c8c-0000-4000-8000-000000000003'
const BADGW_ID = '8d8d8d8d-0000-4000-8000-000000000004'
const GWTIMEOUT_ID = '8e8e8e8e-0000-4000-8000-000000000005'
const BODIES: Record<string, string> = {
  [ONE_ID]: 'one',
  [TWO_ID]: 'two',
  [SHED_ID]: 'shed',
  [BADGW_ID]: 'badgw',
  [GWTIMEOUT_ID]: 'gwtimeout',
}
const SET_STUBS = [SET_ONE, SET_TWO, SET_SHED, SET_BADGW, SET_GWTIMEOUT]
const engine = createEngineClient({ socketPath: resolveSocketPath() })

const setOf = (...ids: string[]) => ({
  hostname: SET_HOST,
  kind: 'staging' as const,
  upstreams: ids.map((instanceId) => ({ dial: dial(instanceId), instanceId })),
  health: appHealthPolicy('/healthz'),
})

/**
 * `n` requests through the edge, one after another, from ONE container — each classified by
 * body, status and identity. Sequential, so round robin's order is the requests' order.
 */
const requestsThroughEdge = async (
  host: string,
  n: number,
): Promise<{ body: string; status: number; instance: string }[]> => {
  const { stdout } = await run('docker', [
    'run',
    '--rm',
    '--network',
    'manifest-platform',
    '--dns',
    '10.89.0.53',
    '-v',
    `${CA}:/ca.crt:ro`,
    '--entrypoint',
    'sh',
    'curlimages/curl:8.11.1',
    '-c',
    `for i in $(seq ${n}); do ` +
      "curl -s --cacert /ca.crt -m 5 -w '|%{http_code}|%header{x-manifest-instance}|END\\n' " +
      `https://${host}/; done`,
  ])
  return stdout
    .split('|END\n')
    .filter((line) => line.includes('|'))
    .map((line) => {
      const [body = '', status = '0', instance = ''] = line.split('|')
      return { body, status: Number(status), instance }
    })
}

describeDocker('A1: one route, a set of instances, on the real edge (Task 2)', () => {
  beforeAll(async () => {
    await removeRoute(deps, SET_HOST, 'staging').catch(() => undefined)
    await run('docker', ['rm', '-f', ...SET_STUBS]).catch(() => undefined)
    await run('docker', stubAppArgs(SET_ONE, 'one', {}, { aliases: [`mf-i-${ONE_ID}`] }))
    await run('docker', stubAppArgs(SET_TWO, 'two', {}, { aliases: [`mf-i-${TWO_ID}`] }))
    await run(
      'docker',
      stubAppArgs(SET_SHED, 'shed', {}, { aliases: [`mf-i-${SHED_ID}`], status: 503 }),
    )
    await run(
      'docker',
      stubAppArgs(SET_BADGW, 'badgw', {}, { aliases: [`mf-i-${BADGW_ID}`], status: 502 }),
    )
    await run(
      'docker',
      stubAppArgs(
        SET_GWTIMEOUT,
        'gwtimeout',
        {},
        {
          aliases: [`mf-i-${GWTIMEOUT_ID}`],
          status: 504,
        },
      ),
    )
    await new Promise((r) => setTimeout(r, 1500))
  }, 120_000)

  afterAll(async () => {
    await removeRoute(deps, SET_HOST, 'staging').catch(() => undefined)
    // Explicit names (P4b finding 192).
    await run('docker', ['rm', '-f', ...SET_STUBS]).catch(() => undefined)
  })

  /**
   * THE SITTING'S STOP, AS A TEST: an N-upstream route applied to the real edge and READ BACK
   * — the JSON the edge holds is the JSON written, health policy and all — and then asked.
   */
  it('a route of two reaches both, each answer naming exactly the instance that gave it', async () => {
    await applyRoute(deps, setOf(ONE_ID, TWO_ID))
    expect(await caddy.getRoute(routeIdFor(SET_HOST))).toEqual(
      buildRoute({ ...setOf(ONE_ID, TWO_ID), routeId: routeIdFor(SET_HOST) }),
    )
    const serving = await servingRoute(deps, SET_HOST)
    expect(serving?.upstreams).toEqual([dial(ONE_ID), dial(TWO_ID)])
    expect(serving?.instanceIds).toEqual([ONE_ID, TWO_ID])

    const seen = await requestsThroughEdge(SET_HOST, 10)
    expect(seen).toHaveLength(10)
    for (const answer of seen) {
      expect(answer.status).toBe(200)
      // EXACTLY one of the two ids — never the alias, never a list — and the one whose
      // body came with it, so the header is the answering instance's and no other's.
      expect([ONE_ID, TWO_ID]).toContain(answer.instance)
      expect(answer.body).toBe(BODIES[answer.instance])
    }
    // Round robin, sequential requests: five each.
    expect(seen.filter((a) => a.instance === ONE_ID)).toHaveLength(5)
    expect(seen.filter((a) => a.instance === TWO_ID)).toHaveLength(5)

    // And the deploy's own wait sees the whole set through the edge (its unit rows stub the
    // probe, so they never see a route).
    const both = await waitForIdentities({
      url: `https://${SET_HOST}/`,
      expected: [ONE_ID, TWO_ID],
      probe: edgeIdentityProbe(engine, SET_HOST, '/', CA),
      timeoutMs: 30_000,
      intervalMs: 100,
    })
    expect(both).toMatchObject({ ready: true })
  }, 180_000)

  /**
   * A MEMBER'S OWN ANSWER NEVER EJECTS IT (Decision 4, `[M2]` (c′); A1 sitting 8, the review's I1). Its
   * health path answers `200` and everything else `503` (shedding load), `502` or `504` (its own
   * dependency failed): the passive policy counts no status at all — Caddy counts the failures the EDGE
   * meets (a dial or transport failure) without one — so each keeps its share, and an outage of what an
   * app depends on never takes a set of healthy members out of the edge. Put a status back in the list
   * and that member is ejected after two: its count goes to 2.
   */
  it.each([
    [503, SHED_ID, 'shed'],
    [502, BADGW_ID, 'badgw'],
    [504, GWTIMEOUT_ID, 'gwtimeout'],
  ] as const)(
    'a member answering %i itself stays in rotation — its load is not moved onto its sibling',
    async (status, id, body) => {
      await applyRoute(deps, setOf(ONE_ID, id))
      const seen = await requestsThroughEdge(SET_HOST, 20)
      expect(seen).toHaveLength(20)
      const own = seen.filter((a) => a.instance === id)
      expect(own.every((a) => a.status === status && a.body === body)).toBe(true)
      expect(own.length).toBeGreaterThanOrEqual(8)
      expect(
        seen.filter((a) => a.instance === ONE_ID && a.status === 200).length,
      ).toBeGreaterThanOrEqual(8)
    },
    120_000,
  )

  /**
   * REVIEW FOCUS 2's FIRST HALF: one of two killed, and every request after it reaches the
   * survivor — a dial that fails is retried on the other member within `try_duration`
   * (`[M2]` (c): 0 of 391 failed with it, 3 without). LAST in the file: it kills a stub.
   */
  it('one member killed: every request reaches the survivor', async () => {
    await applyRoute(deps, setOf(ONE_ID, TWO_ID))
    const before = await requestsThroughEdge(SET_HOST, 4)
    expect(new Set(before.map((a) => a.instance))).toEqual(new Set([ONE_ID, TWO_ID]))

    await run('docker', ['kill', SET_TWO])
    const after = await requestsThroughEdge(SET_HOST, 10)
    expect(after.map((a) => `${a.status} ${a.instance}`)).toEqual(
      Array.from({ length: 10 }, () => `200 ${ONE_ID}`),
    )
  }, 120_000)
})
