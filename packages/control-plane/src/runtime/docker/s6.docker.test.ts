import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { get as httpsGet } from 'node:https'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Driver, ImageRef, InstanceSpec, ServiceHandle } from '../driver.js'
import { instanceName, serviceName } from '../driver.js'
import { describeDocker } from './docker-tier.js'
import { appContainer, appNetwork, serviceContainer } from './names.js'
import { AI_GATEWAY_NEIGHBOUR } from './networks.js'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { CA_CERT, dockerDriverForTests, fixtureBareRepo } from './testing.js'
import {
  deleteProbeKey,
  deleteProbeKeyByAlias,
  ensureProbeUser,
  mintProbeKey,
} from '../../ai/testing.js'

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
// §11's key gained the INSTANCE (P4c). A constant, not a random uuid: this suite
// names the containers it removes, and a random id would leak one per run.
const INSTANCE_ID = '56565656-0000-4000-8000-000000000006'
const APP = appContainer(instanceName(SLUG, KIND, RELEASE, INSTANCE_ID))
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

/**
 * Probes 13 and 14 read the HTTP STATUS, not the exit code. `allowed_routes` denies at
 * the application layer: the connection succeeds and `curl` exits 0 whether the answer
 * is 200 or 403, so `exitCode()` above — right for every network denial — would pass
 * on both. This is the inverse of the trap recorded beside `exitCode`.
 *
 * And curl prints `000` AND exits non-zero when nothing answered, which makes
 * `execFile` reject — so a bare `await` throws on exactly the result probe 13
 * asserts. The code is read from stdout either way; anything that is not three digits
 * is a harness failure, and says so rather than reading as a denial.
 */
async function statusFromNetwork(
  network: string,
  key: string,
  method: 'GET' | 'POST',
  path: string,
  body?: string,
): Promise<number> {
  const stdout = await run('docker', [
    'run',
    '--rm',
    '--network',
    network,
    '--dns',
    '10.89.0.53',
    PROBE,
    '-sS',
    '-m',
    '15',
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}',
    '-X',
    method,
    '-H',
    `Authorization: Bearer ${key}`,
    '-H',
    'Content-Type: application/json',
    ...(body ? ['-d', body] : []),
    `http://manifest-litellm:4000${path}`,
  ]).then(
    (r) => r.stdout,
    (error: { stdout?: string; stderr?: string }) => {
      if (/^\d{3}$/.test((error.stdout ?? '').trim())) return error.stdout ?? ''
      throw new Error(
        `the probe reported no HTTP status: ${(error.stderr ?? '').slice(0, 300)}`,
      )
    },
  )
  return Number(stdout.trim())
}

const CHAT = JSON.stringify({
  model: 'default-chat',
  messages: [{ role: 'user', content: 'Say OK' }],
  max_tokens: 5,
})
const EMBED = JSON.stringify({
  model: 'default-embed',
  input: 'manifest',
  encoding_format: 'float',
})

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
    /** Kept, so probe 13 can re-ensure THIS instance rather than a lookalike. */
    let instanceSpec: InstanceSpec
    /**
     * Built directly rather than reached through the Driver, which deliberately
     * exposes no engine.
     */
    const engine = createEngineClient({ socketPath: resolveSocketPath() })
    const PROBE_USER = 'p4b-probe-user'
    let confinedKey = ''
    let openKey = ''
    /** The child probe 14 mints with the OPEN key, deleted by alias in afterAll. */
    const orphanAlias = `p4b-probe-orphan-${Date.now()}`
    let orphanMinted = false

    async function attachedToAppNet(): Promise<string[]> {
      const net = await engine.get<{ Containers?: Record<string, { Name: string }> }>(
        `/networks/${APP_NET}`,
      )
      return Object.values(net?.Containers ?? {}).map((c) => c.Name)
    }

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
      instanceSpec = {
        name: instanceName(SLUG, KIND, RELEASE, INSTANCE_ID),
        instanceId: INSTANCE_ID,
        hostname: `${SLUG}.${KIND}.manifest.internal`,
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
        // No models declared, so no route to the gateway. Probe 13 re-ensures this
        // same instance with `true` for its positive control.
        needsAiGateway: false,
      }
      await driver.ensureInstance(instanceSpec)
      internetReachable =
        (await exitCode('bridge', ['https://registry.npmjs.org/'])) === 0
      await ensureProbeUser(PROBE_USER)
      confinedKey = await mintProbeKey({ userId: PROBE_USER, confined: true })
      openKey = await mintProbeKey({ userId: PROBE_USER, confined: false })
    }, 900_000)

    afterAll(async () => {
      // S6's measured matrix ran WITHOUT LiteLLM on this network, and probe 13's first
      // assertion depends on that being the starting state on the NEXT run: nothing
      // detaches the gateway from a network once an ensure has attached it (see
      // `ensureAppNetwork`). Read back, because a disconnect that did nothing looks
      // exactly like one that worked.
      if ((await attachedToAppNet()).includes('manifest-litellm')) {
        await engine.post(`/networks/${APP_NET}/disconnect`, {
          Container: 'manifest-litellm',
          Force: true,
        })
      }
      expect(await attachedToAppNet()).not.toContain('manifest-litellm')
      if (confinedKey) await deleteProbeKey(confinedKey)
      if (openKey) await deleteProbeKey(openKey)
      if (orphanMinted) await deleteProbeKeyByAlias(orphanAlias)
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
      const cp = await exitCode(APP_NET, ['http://host.docker.internal:7100/v1/me'])
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

    /**
     * 15 — §12 and §16 (P5a Task 3): an app cannot reach the control plane THROUGH THE
     * EDGE. The edge is attached to this app's network — that is how traffic reaches the
     * app — and it answers any hostname asked of it by address: inside the app,
     * `console.manifest.internal` does not resolve, and a request to `manifest-caddy`
     * with that name as SNI and Host was answered anyway (P5 brief §3, 2026-09-16).
     *
     * The DENIAL reads the BODY, not a status: the refusal is a 403 whose body nothing
     * else in the platform answers with. `rejectUnauthorized: false` because this probes
     * routing — a TLS failure must not read as a refusal. Node's https ignores the proxy
     * variables the app is given.
     *
     * THE POSITIVE CONTROL is the same path from the host, which the site forwards: the
     * answer is the control plane's 401 envelope when one is running and Caddy's 502
     * when none is — either way NOT the refusal, which is the claim.
     *
     * BEFORE PROBE 11, deliberately, and not after 14 where it was first written. Probe
     * 11 forks `sleep 5 &` up to PidsLimit, and the app's PID 1 is `node`, which does
     * not reap the orphans it adopts: they stay zombies for the container's life and
     * hold every pid (measured 2026-09-16, P5a sitting 2 — `pids.current` 64 seventeen
     * seconds on, 20 of 20 orphaned `sleep`s in state Z under ppid 1). So after probe
     * 11 `docker exec … node` cannot start at all, `inApp` returns '', and this probe
     * failed with `expected '' to be '403 …'` rather than on the hole it exists to see.
     */
    it('15. cannot reach the control plane through the edge, while the host can', async () => {
      const REFUSAL = 'manifest: the control plane is not reachable from this network'
      const fromApp = await inApp(
        `node -e 'const h=require("node:https");h.get({host:"manifest-caddy",port:443,servername:"console.manifest.internal",headers:{host:"console.manifest.internal"},path:"/v1/me",rejectUnauthorized:false},r=>{let b="";r.on("data",d=>b+=d);r.on("end",()=>console.log(r.statusCode+" "+b))}).on("error",e=>console.log("error "+e.code))'`,
      )
      expect(fromApp.trim()).toBe(`403 ${REFUSAL}`)

      // The app's own egress proxy (P5a Task 1, [M2g]) is the other way off an app
      // network. Its deny-by-default filter refuses the console's name; the allowlisted
      // IdP is the positive control, so a proxy that refuses EVERYTHING cannot pass.
      const connect = async (target: string) =>
        (
          await inApp(
            `node -e 'const h=require("node:http");const p=new URL(process.env.HTTPS_PROXY);const q=h.request({host:p.hostname,port:p.port,method:"CONNECT",path:"${target}"});q.on("connect",(r,s)=>{console.log(r.statusCode);s.destroy()});q.on("error",e=>console.log("error "+e.code));q.end()'`,
          )
        ).trim()
      expect(await connect('console.manifest.internal:443')).toBe('403')
      expect(await connect('manifest-idp:80')).toBe('200')

      // THE PLATFORM CA IS PASSED, not inherited — as every other probe here passes
      // `--cacert`. Global `fetch` trusts it only through NODE_EXTRA_CA_CERTS in the
      // environment Vitest was STARTED with, which `pnpm test:docker` does not set, and it
      // failed as `error fetch failed` with the cause (UNABLE_TO_GET_ISSUER_CERT_LOCALLY)
      // hidden (P5a sitting 2). The error CODE is what this reports if it fails again.
      const fromHost = await new Promise<string>((resolve) => {
        const request = httpsGet(
          'https://console.manifest.internal/v1/me',
          { ca: readFileSync(CA_CERT), timeout: 10_000 },
          (r) => {
            let body = ''
            r.on('data', (d: Buffer) => (body += d.toString()))
            r.on('end', () => resolve(`${r.statusCode} ${body}`))
          },
        )
        request.on('timeout', () => request.destroy(new Error('timed out')))
        request.on('error', (e: NodeJS.ErrnoException) =>
          resolve(`error ${e.code ?? e.message}`),
        )
      })
      expect(fromHost).not.toContain(REFUSAL)
      expect(fromHost).toMatch(/^(401 \{"error":\{"code":"UNAUTHENTICATED"|502 )/)
      record('15', `app=${fromApp.trim().slice(0, 3)}`, `host=${fromHost.slice(0, 3)}`)
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

    it('13. an app that declares no ai.models cannot reach LiteLLM at all', async () => {
      // Decision 5's whole justification, asserted rather than argued. fixture-s6 was
      // ensured with `needsAiGateway: false` THROUGH THE DRIVER, so this reads what
      // `ensureInstance` did rather than what a test arranged — both the daemon's own
      // list of the network's containers and the request itself.
      // 000 is curl's "nothing answered" — it never got a status.
      expect(await attachedToAppNet()).not.toContain(AI_GATEWAY_NEIGHBOUR)
      const before = await statusFromNetwork(
        APP_NET,
        'sk-irrelevant',
        'GET',
        '/v1/models',
      )
      expect(before).toBe(0)

      // THE POSITIVE CONTROL, and it is the same probe from the same network: THIS
      // instance, re-ensured with the flag a declaring app's release carries.
      // `ensureInstance` is idempotent by name, so it is not a second container. It
      // used to attach the neighbour BY HAND, which never exercised the driver, so a
      // driver that ignored the flag passed it (P4b pre-flight 59). Without the pair,
      // `000` is indistinguishable from "curl is missing", "LiteLLM is down" and "the
      // timeout is too short" — S6's first run produced exactly that, and it is why
      // the tier requires pairing.
      await driver.ensureInstance({ ...instanceSpec, needsAiGateway: true })
      expect(await attachedToAppNet()).toContain(AI_GATEWAY_NEIGHBOUR)
      const after = await statusFromNetwork(APP_NET, confinedKey, 'GET', '/v1/models')
      expect(after).toBe(200)
      record(
        '13',
        `no route without ai.models (${before})`,
        `ensured with ai -> ${after}`,
      )
    }, 180_000)

    it('14. a confined key reaches the three proxy routes and NO admin route', async () => {
      // Runs after 13, which attached the neighbour; vitest runs `it`s in file order.
      expect(await statusFromNetwork(APP_NET, confinedKey, 'GET', '/v1/models')).toBe(200)
      expect(
        await statusFromNetwork(
          APP_NET,
          confinedKey,
          'POST',
          '/v1/chat/completions',
          CHAT,
        ),
      ).toBe(200)
      expect(
        await statusFromNetwork(APP_NET, confinedKey, 'POST', '/v1/embeddings', EMBED),
      ).toBe(200)

      for (const path of ['/key/generate', '/model/info', '/spend/logs', '/key/info']) {
        const post = path === '/key/generate'
        const status = await statusFromNetwork(
          APP_NET,
          confinedKey,
          post ? 'POST' : 'GET',
          path,
          post ? '{}' : undefined,
        )
        expect(status, `${path} was not refused`).toBe(403)
      }

      // THE MATCHED PAIR S3 NAMES, and the reason `allowed_routes` is not optional: the
      // same user, the same models, the same everything, minus the confinement.
      const openStatus = await statusFromNetwork(
        APP_NET,
        openKey,
        'POST',
        '/key/generate',
        JSON.stringify({ key_alias: orphanAlias }),
      )
      orphanMinted = openStatus === 200
      expect(
        openStatus,
        'the unconfined key did NOT mint — the pair proves nothing',
      ).toBe(200)
      record(
        '14',
        'confined: 4 admin routes 403',
        `unconfined mints a child: ${openStatus}`,
      )
    })

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
