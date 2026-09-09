import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Driver, ImageRef, ServiceHandle } from '../driver.js'
import { instanceName, serviceName } from '../driver.js'
import { describeDocker } from './docker-tier.js'
import { appContainer, appNetwork, serviceContainer } from './names.js'
import { resolveSocketPath } from './engine.js'
import { CA_CERT, dockerDriverForTests, fixtureBareRepo } from './testing.js'

const run = promisify(execFile)

/**
 * S6, run as P3's acceptance exercise (roadmap gap 4) and kept as §16's SECURITY
 * REGRESSION TIER rather than as a one-off report.
 *
 * The question is *what can a hostile process inside an app container actually
 * reach* — not what the configuration says it can reach. So every probe runs from
 * inside the app's own network with the app's own hardening, and every denial is
 * paired with THE SAME PROBE SUCCEEDING from somewhere it should. A matrix of
 * twelve denials with no positive control is a matrix that would look identical if
 * `curl` were missing from the image, the target were down, or the timeout were too
 * short.
 *
 * Two probes are deferred and named so nobody thinks they were forgotten:
 *
 *  * **app -> LiteLLM's admin routes** is enforced per key with `allowed_routes`
 *    (§10, §12, S3) and keys are P4's. P4 adds it here, with the negative control
 *    S3 names: a key minted without `allowed_routes`.
 *  * **sandbox isolation specifically.** P3 builds no sandbox environment; §11
 *    gives sandboxes `exec`, a wider egress baseline and session-scoped AI keys,
 *    none of which exist. These probes run against a STAGING app, which shares the
 *    container hardening baseline. S5 exercises the sandbox itself.
 */
const SLUG = 'fixture-s6'
/** A second app, so "another app's service" is a real neighbour and not a fiction. */
const NEIGHBOUR = 'fixture-s6nb'
const KIND = 'staging' as const
const RELEASE = 's6'

const APP_NET = appNetwork(SLUG, KIND)
const NEIGHBOUR_NET = appNetwork(NEIGHBOUR, KIND)
const APP = appContainer(instanceName(SLUG, KIND, RELEASE))
const APP_DB = serviceContainer(serviceName(SLUG, KIND, 'db'))
const NEIGHBOUR_DB = serviceContainer(serviceName(NEIGHBOUR, KIND, 'db'))

const PROBE = 'curlimages/curl:8.11.1'

/**
 * The EXIT CODE, never the output. The failure text of a denied request very often
 * contains the words a naive grep would match — P1's self-review caught exactly
 * that, and a proxy's own 403 page says "manifest" as readily as a success does.
 */
async function exitCode(network: string, args: string[]): Promise<number> {
  return run('docker', [
    'run',
    '--rm',
    '--network',
    network,
    // The platform resolver ONLY where it is reachable. `10.89.0.53` lives on the
    // platform network, so forcing it on a `bridge` container makes every probe
    // fail with exit 6, "couldn't resolve host" — which is indistinguishable from
    // the denial the probe is trying to prove, and it hit the POSITIVE controls
    // first, where it was loud. `bridge` keeps Docker's own embedded resolver,
    // which is what knows `host.docker.internal`.
    ...(network === 'bridge' ? [] : ['--dns', '10.89.0.53']),
    PROBE,
    '-sS',
    '-m',
    '6',
    '-o',
    '/dev/null',
    ...args,
  ]).then(
    () => 0,
    (error: { code?: number }) => error.code ?? 1,
  )
}

/** Inside the app container itself, as whatever user the image runs as. */
async function inApp(script: string): Promise<string> {
  return run('docker', ['exec', APP, 'sh', '-c', script])
    .then((r) => r.stdout)
    .catch((e: { stdout?: string }) => e.stdout ?? '')
}

/** Is there a route to the public internet at all? Probe 7's control needs one. */
let internetReachable = false

/**
 * The matrix reports its own measurements. A findings note written from memory is
 * a findings note that drifts from the tier; this way the numbers in
 * `S6-findings.md` are copied from a run rather than recalled.
 */
function record(probe: string, denied: string, control: string): void {
  console.log(`[S6] ${probe.padEnd(5)} denied=${denied.padEnd(24)} control=${control}`)
}

// §12 stores service credentials, so the CALLER resolves them. In production
// that is `deployRelease`; here it is this constant. The driver uses what it is
// handed and derives nothing — driver-contract.ts asserts that for both drivers.
const CREDENTIALS = {
  username: 'app_docker_tier',
  password: 'd'.repeat(32),
  database: 'docker_tier',
}

describeDocker(
  'S6 probe matrix — what a hostile process in an app container reaches',
  () => {
    let driver: Driver
    let image: ImageRef
    let service: ServiceHandle

    beforeAll(async () => {
      driver = await dockerDriverForTests()
      const repo = fixtureBareRepo()
      image = await driver.buildImage(repo, {
        blueprintRef: 'fixture-node@1',
        projectSlug: SLUG,
      })
      service = await driver.ensureService({
        name: serviceName(SLUG, KIND, 'db'),
        type: 'mongo',
        version: '7',
        environmentId: 'env-s6',
        projectSlug: SLUG,
        credentials: CREDENTIALS,
      })
      // A SECOND app with its own database, so probes 4 and 5 have a real neighbour
      // to fail to reach — and a real network from which reaching it must succeed.
      await driver.ensureService({
        name: serviceName(NEIGHBOUR, KIND, 'db'),
        type: 'mongo',
        version: '7',
        environmentId: 'env-s6nb',
        projectSlug: NEIGHBOUR,
        credentials: { ...CREDENTIALS, database: 'neighbour' },
      })
      await driver.ensureInstance({
        name: instanceName(SLUG, KIND, RELEASE),
        projectSlug: SLUG,
        environmentKind: KIND,
        releaseId: RELEASE,
        image,
        env: { PORT: '8080', MONGODB_URI: service.endpoint },
        port: 8080,
        healthPath: '/healthz',
        resources: { cpu: 0.5, memoryMi: 256, pids: 64, diskMi: 1024 },
        services: [service],
        // Nothing declared. Probe 8 checks that a declared host is the ONLY thing
        // that gets through, so this app declares none.
        egressAllow: [],
      })
      internetReachable =
        (await exitCode('bridge', ['https://registry.npmjs.org/'])) === 0
    }, 900_000)

    afterAll(async () => {
      await driver.destroyInstance(APP).catch(() => undefined)
      await driver.destroyService(APP_DB, { deleteData: true }).catch(() => undefined)
      await driver
        .destroyService(NEIGHBOUR_DB, { deleteData: true })
        .catch(() => undefined)
      for (const name of [
        `mf-${SLUG}-${KIND}-egress`,
        `mf-${NEIGHBOUR}-${KIND}-egress`,
      ]) {
        // `-v`, as `make reset` does: no anonymous volume outlives its container.
        await run('docker', ['rm', '-f', '-v', name]).catch(() => undefined)
      }
      await run('docker', ['network', 'rm', NEIGHBOUR_NET]).catch(() => undefined)
    }, 300_000)

    // 1 — the Docker socket. Reaching it is game over: it is root on the host.
    it('1. has NO Docker socket, while the host plainly does', async () => {
      const inside = (
        await inApp('test -S /var/run/docker.sock && echo PRESENT || echo ABSENT')
      ).trim()
      expect(inside).toBe('ABSENT')
      record('1', inside, `host socket exists=${existsSync(resolveSocketPath())}`)
      // THE CONTROL: the socket this suite is itself driving exists.
      expect(existsSync(resolveSocketPath())).toBe(true)
    })

    // 12 — and no client to talk to one with, so a mounted socket would still need
    // a tool. Both halves, because either alone is half a mitigation.
    it('12. has no Docker client either', async () => {
      expect((await inApp('command -v docker || echo NONE')).trim()).toBe('NONE')
    })

    /**
     * 2 — the platform's own control surfaces on the host. The control plane holds
     * every project's secrets and the registry issuer key; **Caddy's admin API is
     * arguably the juicier target**, because anything that reaches it can rewrite
     * the routing table for every app on the machine.
     *
     * The POSITIVE CONTROL is the Caddy admin port, NOT the control plane's. The
     * control plane is a dev process that may or may not be running, and aiming a
     * control at it made this test fail for the honest reason that its target was
     * down — the control working, but also making `pnpm test:docker` depend on
     * something the tier does not require. The admin API is published by
     * `infra/compose.yaml` and is up whenever `make up` has run, which the tier
     * already requires. Measured 2026-09-07.
     */
    it('2. cannot reach the platform on the host, while a bridge container can', async () => {
      const cp = await exitCode(APP_NET, ['http://host.docker.internal:7100/auth/me'])
      const admin = await exitCode(APP_NET, ['http://host.docker.internal:7119/config/'])
      expect(cp).not.toBe(0)
      expect(admin).not.toBe(0)
      // THE CONTROL, and it needs no internet: the same host, the same port, from
      // an ordinary bridge network. Without it these denials prove only that
      // nothing is listening.
      const control = await exitCode('bridge', [
        'http://host.docker.internal:7119/config/',
      ])
      expect(control).toBe(0)
      record('2', `7100=${cp} 7119(caddy admin)=${admin}`, `bridge 7119=${control}`)
    })

    // 6 — §21 divergence 8, the one the spec calls "a real security weakening rather
    // than a convenience". Task 4's --internal app network removes the route entirely,
    // so this is expected to be BETTER than the divergence as written. Record the
    // measurement, not the expectation.
    it("6. cannot reach the developer's own machine (§21 divergence 8)", async () => {
      const mongo = await exitCode(APP_NET, ['http://host.docker.internal:27017/'])
      const qdrant = await exitCode(APP_NET, ['http://host.docker.internal:6333/'])
      expect(mongo).not.toBe(0)
      expect(qdrant).not.toBe(0)
      // THE CONTROL: both of those really are listening, from a bridge network.
      // mongodb and qdrant are this developer's own, unrelated to Manifest.
      const control = await exitCode('bridge', ['http://host.docker.internal:6333/'])
      expect(control).toBe(0)
      record('6', `27017=${mongo} 6333=${qdrant}`, `bridge 6333=${control}`)
    })

    // 3 — cloud metadata. No positive control exists locally and saying so is the
    // point: on UBC infrastructure this endpoint is real and this probe is the one
    // that matters most.
    it('3. cannot reach a cloud metadata endpoint (no local positive control exists)', async () => {
      const denied = await exitCode(APP_NET, ['http://169.254.169.254/latest/meta-data/'])
      expect(denied).not.toBe(0)
      record('3', `curl exit ${denied}`, 'none exists locally')
    })

    // 4 and 5 — east-west. Another app's database is another faculty member's data.
    it("4/5. cannot resolve or reach ANOTHER app's database", async () => {
      const denied = await exitCode(APP_NET, [`http://${NEIGHBOUR_DB}:27017/`])
      expect(denied).not.toBe(0)
      // THE CONTROL: that same container is reachable from its OWN app's network, so
      // the denial is the topology and not a container that failed to start.
      const control = await exitCode(NEIGHBOUR_NET, [`http://${NEIGHBOUR_DB}:27017/`])
      expect(control).toBe(0)
      record('4/5', `curl exit ${denied}`, `own network exit ${control}`)
    })

    it('5b. CAN reach its own database — the denial above is not a broken network', async () => {
      expect(await exitCode(APP_NET, [`http://${APP_DB}:27017/`])).toBe(0)
    })

    // 7 — the internet, with no proxy. D18: default deny.
    it('7. cannot reach the public internet directly', async () => {
      const denied = await exitCode(APP_NET, ['https://registry.npmjs.org/'])
      expect(denied).not.toBe(0)
      record('7', `curl exit ${denied}`, 'see 7b')
    })

    it('7b. CONTROL: the same request succeeds from a bridge network', async () => {
      if (!internetReachable) {
        // Said out loud rather than passed quietly. Offline, this pairing cannot be
        // made, and a denial with no reachable target proves nothing about the
        // control — so the tier must SAY that rather than report twelve greens.
        console.warn(
          '[S6] probe 7 positive control SKIPPED: no route to the public internet ' +
            'from a bridge network either, so the denial above is unpaired.',
        )
        return
      }
      expect(await exitCode('bridge', ['https://registry.npmjs.org/'])).toBe(0)
    })

    // 8 — through the app's OWN forced proxy. This app declared nothing.
    it('8. is refused by its own egress proxy for an undeclared destination', async () => {
      const code = await run('docker', [
        'run',
        '--rm',
        '--network',
        APP_NET,
        '--dns',
        '10.89.0.53',
        '-e',
        `http_proxy=http://mf-${SLUG}-${KIND}-egress:8888`,
        PROBE,
        '-sS',
        '-m',
        '8',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        'http://example.com/',
      ]).then((r) => r.stdout.trim())
      // 403 from tinyproxy, not a connection failure: the proxy is reachable and
      // REFUSING, which is a different fact from "there is no route".
      expect(code).toBe('403')
      // The paired positive — a DECLARED host succeeding through the same proxy —
      // is `egress.docker.test.ts`, "ALLOWS a destination this app declared, and
      // only this app". Named rather than duplicated, so the pair cannot drift.
      record(
        '8',
        `http ${code} from its own proxy`,
        'egress.docker.test.ts, declared host',
      )
    })

    // 9 — the filesystem.
    it('9. runs on a read-only root with a writable /tmp', async () => {
      const out = await inApp(
        'touch /nope 2>/dev/null && echo ROOT-WRITABLE || echo ROOT-READONLY; ' +
          'touch /tmp/ok 2>/dev/null && echo TMP-WRITABLE || echo TMP-READONLY',
      )
      expect(out).toContain('ROOT-READONLY')
      expect(out).toContain('TMP-WRITABLE')
      record('9', out.trim().replace(/\n/g, ' '), '/tmp is the control')
    })

    // 10 — capabilities. All of them dropped.
    it('10. holds NO capabilities, while an unhardened container holds several', async () => {
      const eff = (await inApp('grep CapEff /proc/self/status')).trim()
      expect(eff).toMatch(/CapEff:\s+0+$/)
      // THE CONTROL: the same read in a container started without CapDrop is
      // non-zero. Without it, "all zeros" could just as well mean the file moved.
      const { stdout } = await run('docker', [
        'run',
        '--rm',
        'alpine:3.22',
        'grep',
        'CapEff',
        '/proc/self/status',
      ])
      expect(stdout.trim()).not.toMatch(/CapEff:\s+0+$/)
      record('10', eff, stdout.trim())
    })

    it('10b. cannot regain privilege — no-new-privileges is set', async () => {
      const { stdout } = await run('docker', [
        'inspect',
        APP,
        '--format',
        '{{json .HostConfig.SecurityOpt}}',
      ])
      expect(stdout).toContain('no-new-privileges')
    })

    // 11 — process count. The limit IS the assertion; there is no positive control
    // for "a bounded thing is bounded".
    it('11. bounds its process count at PidsLimit', async () => {
      const { stdout } = await run('docker', [
        'inspect',
        APP,
        '--format',
        '{{.HostConfig.PidsLimit}}',
      ])
      expect(Number(stdout.trim())).toBe(64)
      // And it bites: asking for far more than the limit must fail rather than
      // succeed slowly. `sh` reports the fork failure on stderr and exits non-zero.
      const forked = await run('docker', [
        'exec',
        APP,
        'sh',
        '-c',
        'i=0; while [ $i -lt 300 ]; do sleep 5 & i=$((i+1)); done; echo ALL-FORKED',
      ]).then(
        (r) => r.stdout.trim(),
        () => 'FORK-REFUSED',
      )
      expect(forked).not.toBe('ALL-FORKED')
      record(
        '11',
        `PidsLimit=${stdout.trim()} 300 forks -> ${forked}`,
        'the limit is the assertion',
      )
    }, 120_000)

    // The app is nonetheless SERVING, through the edge, with the platform CA. Every
    // denial above is worthless if the container is simply broken.
    it('and the app is still reachable at its hostname — the denials are not a dead app', async () => {
      const { stdout } = await run('docker', [
        'run',
        '--rm',
        '--network',
        'manifest-platform',
        '--dns',
        '10.89.0.53',
        '-v',
        `${CA_CERT}:/ca.crt:ro`,
        PROBE,
        '--cacert',
        '/ca.crt',
        '-sS',
        '-m',
        '15',
        `https://${SLUG}.staging.manifest.internal/healthz`,
      ])
      expect(JSON.parse(stdout)).toEqual({ status: 'ok', mongo: true })
    }, 120_000)
  },
)
