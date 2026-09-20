import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
// Through `runtime/`'s public TEST surface, not a deep path into runtime/docker/.
import {
  createEngineClient,
  describeDocker,
  REPO_ROOT,
  resolveSocketPath,
} from '../runtime/testing.js'
import { createCaddyClient } from './caddy.js'
import { edgeIdentityProbe, edgeProbe } from './readiness.js'
import { applyRoute, removeRoute } from './routes.js'
import { stubAppArgs } from './testing.js'

const run = promisify(execFile)

/**
 * §12: "The staging-is-UBC-only requirement is met by listener assignment, not IP
 * allowlisting: a misconfigured allowlist leaks quietly, whereas a route bound to the
 * wrong listener is simply unreachable."
 *
 * THIS IS THE FIRST TEST IN THE REPOSITORY THAT COULD EVER HAVE FAILED FOR THAT REASON.
 * Both listeners were `srv0` until P6a (R3), so the claim was modelled and untested —
 * §21's honest divergence 2. The edge now runs TWO servers in ONE container: `srv0` on
 * :443 (the internal listener, 127.0.0.2 from the host) and `srv1` on :8443 (the public
 * listener, 127.0.0.3 from the host). One container, so one `caddy-data` volume and one
 * internal CA.
 *
 * IT ASSERTS THE SHAPE OF THE ANSWER AND NOT A STATUS. The edge's wildcard answers 200
 * for any name in its zone, so `200` proves nothing and could never go red; the
 * placeholder's own `listener=` word is the only thing that tells the two servers apart
 * from outside. That is this repository's most repeated lesson (`routes.docker.test.ts`).
 *
 * AND WHAT "UNREACHABLE" LOOKS LIKE IS `200` WITH AN EMPTY BODY — measured in sitting 2,
 * and it is NOT what sitting 1's F3 predicted. F3 expected a TLS handshake failure, from
 * probing a name in no zone at all; but Caddy's certificate cache is APP-GLOBAL rather
 * than per-server, so the `*.manifest.internal` certificate srv1's site causes to be
 * issued is presented by srv0 too. The handshake succeeds, srv0 matches no site for that
 * Host, and Caddy answers an empty 200. Only a name no certificate anywhere in the config
 * covers produces the `(35) … tlsv1 alert internal error` F3 recorded.
 *
 * THAT IS WHY THESE ASSERTIONS READ THE BODY AND NEVER THE STATUS, AND WHY THEY ASSERT
 * THE ABSENCE OF `listener=` RATHER THAN A FAILURE. `200` is the answer whether the split
 * is intact or leaking, so a status assertion would be green in both directions, and an
 * assertion that curl FAILS would be red against a correctly configured platform.
 *
 * IT READS THE REAL EDGE RATHER THAN A MODEL OF ONE. Unlike
 * `edge-source-refusal.docker.test.ts`, which must build a throwaway because its negative
 * direction would weaken the running edge, every probe here is a plain GET — nothing is
 * reloaded, nothing is edited, and the configuration under test is the one the platform
 * is actually serving, which is what Task 4's routes will be written into.
 */
const NET = 'manifest-platform'
const DNS = '10.89.0.53'
const PROBE = 'curlimages/curl:8.11.1'
const CA = join(REPO_ROOT, 'infra/ca/manifest-root.crt')

/**
 * A production-zone name NO Caddyfile site names, so only a wildcard can answer it.
 * `cdn` is reserved (§23), so no project can ever take the slug and quietly turn this
 * into a test of an app's own route. It is deliberately NOT `edge.manifest.internal`:
 * that name has its own `srv0` site and is pinned to the internal listener, so it cannot
 * stand for a production hostname (infra/lib/common.sh says so where the constant lives).
 */
const PRODUCTION_HOST = 'cdn.manifest.internal'
/** A staging-zone name, matched by the srv0 wildcard and by nothing on srv1. */
const STAGING_HOST = 'split-probe.staging.manifest.internal'

/**
 * THE PLATFORM'S OWN SETTINGS, not two literals restated in a test.
 *
 * `MANIFEST_CADDY_SERVER_PUBLIC` is the ONE setting that says which Caddy server a
 * production route is written to, and a test that hardcoded `srv1` could not be
 * turned red by changing it — which is precisely Task 4's control (a). Sitting 2
 * measured that with the variable set to `srv0` nothing in this file went red, and
 * said so: "Task 3 makes two servers exist; nothing yet writes a route to the right
 * one, and that is Task 4."
 *
 * `loadConfig` requires five settings. Two — the database URLs — are already in the
 * environment (`vitest.setup.ts`), and the other three are given `config.test.ts`'s
 * fixture values here; none of the five is read. `process.env` is spread LAST so the
 * real environment always wins, which is what makes the control fire.
 */
const { caddyServers: SERVERS, edgePublicPort: PUBLIC_PORT } = loadConfig({
  MANIFEST_SESSION_SECRET: 'x'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
  ...process.env,
})

/**
 * The internal server's container-side port, and it is a literal on purpose: :443 is
 * where the edge listens for everything, it is `infra/compose.yaml`'s `127.0.0.2:443:443`,
 * and there is no setting for it. Decision 15: the PROBE carries a port, a person's
 * URL does not.
 */
const INTERNAL_PORT = 443

/**
 * From a container on the platform network, over HTTPS, with the platform CA — the same
 * path `scripts/verify.sh` and `routes.docker.test.ts` use. A host process cannot reach a
 * container address on Docker Desktop (S1), so the probe has to run inside one.
 *
 * Returns stdout AND stderr together, and never throws. The expected answer for a
 * cross-listener probe is an EMPTY body with status 200, so an empty string here is a
 * pass rather than a fault — but if a probe ever does fail at the transport (a name no
 * certificate covers, say), curl writes that to stderr, and a helper that threw would
 * turn a readable measurement into a test failure with no message worth reading.
 */
async function probe(host: string, port: number): Promise<string> {
  const args = [
    'run',
    '--rm',
    '--network',
    NET,
    '--dns',
    DNS,
    '-v',
    `${CA}:/ca.crt:ro`,
    PROBE,
    '--cacert',
    '/ca.crt',
    '-sS',
    '-m',
    '10',
    `https://${host}:${port}/`,
  ]
  try {
    const { stdout } = await run('docker', args)
    return stdout.trim()
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string }
    return `${e.stdout ?? ''}${e.stderr ?? ''}`.trim()
  }
}

describeDocker('§12: a route bound to the wrong listener is simply unreachable', () => {
  it('a production hostname is answered by the public server and not by the internal one', async () => {
    // THE POSITIVE HALF FIRST. Without it a platform serving nothing at all would pass
    // the refusal below, which is P5c sitting 9's F16 in one line: every test fired
    // garbage at a route that refuses everything, and they all passed.
    const onPublic = await probe(PRODUCTION_HOST, PUBLIC_PORT)
    expect(onPublic, 'the public server must serve the production zone').toContain(
      `host=${PRODUCTION_HOST}`,
    )
    expect(onPublic, 'and must say which listener it is').toContain('listener=public')

    // THE REFUSAL. Not "answered by the other server" but "not served at all" — asserting
    // the absence of `listener=` entirely is what makes this able to fail. `edge.` was
    // rejected as the probe name for exactly this reason: its own srv0 site would answer
    // `listener=internal` here and the assertion would pass straight through the leak.
    const onInternal = await probe(PRODUCTION_HOST, INTERNAL_PORT)
    expect(
      onInternal,
      'a production name must not be served on the internal listener',
    ).not.toContain('listener=')
  }, 120_000)

  it('a staging hostname is answered by the internal server and not by the public one', async () => {
    const onInternal = await probe(STAGING_HOST, INTERNAL_PORT)
    expect(onInternal, 'the internal server must serve the staging zone').toContain(
      `host=${STAGING_HOST}`,
    )
    expect(onInternal, 'and must say which listener it is').toContain('listener=internal')

    const onPublic = await probe(STAGING_HOST, PUBLIC_PORT)
    expect(
      onPublic,
      'a staging name must not be served on the public listener',
    ).not.toContain('listener=')
  }, 120_000)
})

/**
 * AND NOW A REAL ROUTE ON EACH SERVER (P6a Task 4).
 *
 * The block above proves the two servers EXIST and answer differently. This proves
 * the platform WRITES AN APP'S ROUTE TO THE RIGHT ONE — which is the claim §12
 * actually makes, and which nothing here could test while both names were `srv0`.
 * It is the difference between "the edge is configured with two listeners" and "a
 * production app is reachable on the public one and by nobody on the internal one".
 *
 * ONE STUB APP BEHIND BOTH ROUTES, with two different instance ids. The route sets
 * `X-Manifest-Instance` itself (`buildRoute`), so the same container can stand for
 * both without the test having to run two.
 */
const ROUTED_PRODUCTION_HOST = 'split-route.manifest.internal'
const ROUTED_STAGING_HOST = 'split-route.staging.manifest.internal'
/**
 * A production name that is NEVER routed. The wildcard's own answer, which is what
 * every routed assertion below must differ from — and it is probed live in its own
 * test rather than captured before the routes are written, so no case here depends
 * on another one having run first (P2's defect 7).
 */
const UNROUTED_PRODUCTION_HOST = 'split-unrouted.manifest.internal'
const STUB_APP = 'mf-splitroute-app'
const STUB_BODY = 'split-route ok'
const PRODUCTION_INSTANCE = '44444444-4444-4444-8444-444444444444'
const STAGING_INSTANCE = '55555555-5555-4555-8555-555555555555'

const deps = { caddy: createCaddyClient('http://127.0.0.1:7119'), servers: SERVERS }
const engine = createEngineClient({ socketPath: resolveSocketPath() })

/**
 * THE SHIPPED PROBE, not a second curl written for the test.
 *
 * `edgeIdentityProbe` with a `port` is the code this task adds, and it is what the
 * Docker driver will call for a production deploy (Task 15) — so running the real
 * one here means the option is exercised rather than modelled. `'/'` is the health
 * path: the stub answers every path.
 */
const identityOf = (host: string, port: number) =>
  edgeIdentityProbe(engine, host, '/', CA, { port })()

describeDocker('§12: the platform writes a route to the right listener', () => {
  beforeAll(async () => {
    // IN beforeAll, NOT in the first `it`. Every case below reaches this container
    // and one of these two routes, and a case run alone (`vitest -t …`, which is how
    // a negative control is watched) must not fail for want of a side effect of the
    // first one — P2's defect 7, and the reason `routes.docker.test.ts` does the same.
    await removeRoute(deps, ROUTED_PRODUCTION_HOST, 'production').catch(() => undefined)
    await removeRoute(deps, ROUTED_STAGING_HOST, 'staging').catch(() => undefined)
    await run('docker', ['rm', '-f', STUB_APP]).catch(() => undefined)
    // A real HTTP server, never `nc`: an `nc` stand-in answers before it is asked and
    // the edge's pooled connection to it turned one request into an empty 502
    // (`stubAppArgs` carries the measurement).
    await run('docker', stubAppArgs(STUB_APP, STUB_BODY))
    await new Promise((r) => setTimeout(r, 1500))
    await applyRoute(deps, {
      hostname: ROUTED_PRODUCTION_HOST,
      upstream: `${STUB_APP}:8080`,
      kind: 'production',
      instanceId: PRODUCTION_INSTANCE,
    })
    await applyRoute(deps, {
      hostname: ROUTED_STAGING_HOST,
      upstream: `${STUB_APP}:8080`,
      kind: 'staging',
      instanceId: STAGING_INSTANCE,
    })
  }, 180_000)

  afterAll(async () => {
    await removeRoute(deps, ROUTED_PRODUCTION_HOST, 'production').catch(() => undefined)
    await removeRoute(deps, ROUTED_STAGING_HOST, 'staging').catch(() => undefined)
    // An explicit name, never a `--filter name=` — repeated name filters OR, and one
    // once listed another app's container during a cleanup (P4b finding 192).
    await run('docker', ['rm', '-f', STUB_APP]).catch(() => undefined)
  })

  /**
   * THE CONTROL THAT MAKES THE THREE BELOW MEAN ANYTHING. A production name with no
   * route is answered by the wildcard on the public listener: 200, the placeholder's
   * body, and NO instance header. So "200" is not evidence of a route, and neither is
   * a body — only `X-Manifest-Instance`, which a route sets and the wildcard does not
   * (P4b finding 193).
   */
  it('a production name with NO route is the wildcard: 200, and no instance', async () => {
    const seen = await identityOf(UNROUTED_PRODUCTION_HOST, PUBLIC_PORT)
    expect(seen.status).toBe(200)
    expect(seen.instance, 'the wildcard sets no instance header').toBeUndefined()
    expect(await probe(UNROUTED_PRODUCTION_HOST, PUBLIC_PORT)).toContain(
      'listener=public',
    )
  }, 120_000)

  it('a production route is reachable on the public listener AS THE INSTANCE', async () => {
    const onPublic = await identityOf(ROUTED_PRODUCTION_HOST, PUBLIC_PORT)
    expect(onPublic.status).toBe(200)
    // A ROUTE answered, not the wildcard. This is the assertion the whole task is
    // for, and `expect(status).toBe(200)` in its place is green either way — Step 5's
    // control (c), which sitting 2's F5 turned from a hypothesis into a measurement.
    expect(onPublic.instance).toBe(PRODUCTION_INSTANCE)
    expect(await probe(ROUTED_PRODUCTION_HOST, PUBLIC_PORT)).toBe(STUB_BODY)
  }, 120_000)

  /**
   * AND THE SAME HOSTNAME ON THE INTERNAL LISTENER REACHES NOTHING AT ALL.
   *
   * NOT the wildcard, and not a 404: `srv0` holds no site for the production zone
   * since Task 3 moved that wildcard to `srv1`, so it matches nothing and Caddy
   * answers an EMPTY 200 — sitting 2's F5, and not what sitting 1's F3 predicted.
   * The handshake succeeds because Caddy's certificate cache is app-global.
   *
   * So there are two facts here and the status is neither of them: no instance
   * header, and no `listener=` word.
   */
  it('and the SAME hostname on the internal listener is served by nothing', async () => {
    const onInternal = await identityOf(ROUTED_PRODUCTION_HOST, INTERNAL_PORT)
    expect(onInternal.instance, 'the route must not be on the internal server').toBe(
      undefined,
    )
    expect(
      await probe(ROUTED_PRODUCTION_HOST, INTERNAL_PORT),
      'and no site on srv0 may answer for it either',
    ).not.toContain('listener=')
  }, 120_000)

  /**
   * THE MIRROR IMAGE, and it is not decoration. A version of this platform that wrote
   * EVERY route to `srv1` would pass both production cases above — the staging half
   * is what refuses it, and it is the half that protects §12's actual requirement,
   * which is that staging is not reachable from outside UBC.
   */
  it('and a STAGING route is the mirror image — internal serves it, public does not', async () => {
    const onInternal = await identityOf(ROUTED_STAGING_HOST, INTERNAL_PORT)
    expect(onInternal.status).toBe(200)
    expect(onInternal.instance).toBe(STAGING_INSTANCE)
    expect(await probe(ROUTED_STAGING_HOST, INTERNAL_PORT)).toBe(STUB_BODY)

    const onPublic = await identityOf(ROUTED_STAGING_HOST, PUBLIC_PORT)
    expect(onPublic.instance).toBeUndefined()
    expect(await probe(ROUTED_STAGING_HOST, PUBLIC_PORT)).not.toContain('listener=')
  }, 120_000)

  /**
   * STEP 5'S CONTROL (c), AS A STANDING TEST RATHER THAN A ONE-OFF EXPERIMENT.
   *
   * The plan asks for the production assertion to be weakened to `status === 200`,
   * watched staying green with the route on the wrong server, and restored. That is
   * worth doing once, and it was; but a control that has to be re-performed by hand
   * is a control nobody performs again. This asserts the same fact permanently and in
   * the direction that survives: `edgeProbe` reads a STATUS and nothing else, and it
   * answers **200 on both listeners** — for a routed production name and for the same
   * name where no site exists at all.
   *
   * A reader who is about to replace an identity assertion with a status one has this
   * test sitting under it saying why the status cannot distinguish the two. It is also
   * `edgeProbe`'s only caller for the `port` option, which is why the option is there.
   */
  it('a STATUS cannot tell the two listeners apart — 200 on both, routed or not', async () => {
    const status = (host: string, port: number) =>
      edgeProbe(engine, host, '/', CA, { port })()
    expect(await status(ROUTED_PRODUCTION_HOST, PUBLIC_PORT)).toBe(200)
    expect(await status(ROUTED_PRODUCTION_HOST, INTERNAL_PORT)).toBe(200)
  }, 120_000)
})
