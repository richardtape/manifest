import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  appHealthPolicy,
  applyRoute,
  createCaddyClient,
  removeRoute,
} from '../routing/index.js'
import { stubAppArgs } from '../routing/testing.js'
import {
  createEngineClient,
  describeDocker,
  dockerDriverForTests,
  REPO_ROOT,
  resolveSocketPath,
} from '../runtime/testing.js'
import {
  LOAD_REHEARSAL_LABEL,
  createLoadGenerator,
  type LoadPhase,
  type LoadTarget,
} from './load.js'

/**
 * THE LOAD GENERATOR, FOR REAL (the load rehearsal plan's Task 2): vegeta's image as `make seed` builds it, in its hardened
 * container on the platform network, through the REAL edge with the platform CA — the unit tier's fake engine cannot tell
 * whether busybox's awk folds vegeta's JSON, whether an exec can touch the tmpfs as the image's non-root user, or whether the
 * one line survives Docker's log framing.
 *
 * THE HOSTNAME HOLDS NO ROUTE: the edge's `*.staging.manifest.internal` site answers it (`200`, every path), exactly as
 * `routing/readiness.docker.test.ts` uses the wildcard — so this exercises the generator and the edge, never an app, and moves
 * nothing a project holds. A real app under load is Task 4's Docker case.
 */
const engine = createEngineClient({ socketPath: resolveSocketPath() })
const CA = join(REPO_ROOT, 'infra/ca/manifest-root.crt')
/** `infra/lib/common.sh`'s DNS_C_IP, `config.dnsServer`'s default. */
const DNS = '10.89.0.53'
const TARGET: LoadTarget = {
  origin: 'https://loadgen-unrouted.staging.manifest.internal',
  paths: ['/', '/healthz', '/login'],
  timeoutMs: 5_000,
}

async function generatorContainers(id: string): Promise<{ Id: string; State: string }[]> {
  const filters = encodeURIComponent(
    JSON.stringify({ label: [`${LOAD_REHEARSAL_LABEL}=${id}`] }),
  )
  return (
    (await engine.get<{ Id: string; State: string }[]>(
      `/containers/json?all=true&filters=${filters}`,
    )) ?? []
  )
}

describeDocker('the load generator — vegeta through the real edge', () => {
  it('answers its own platform address BEFORE any load, loads only after go(), reads a two-phase result whole, and is gone after', async () => {
    const id = `docker-test-${Date.now()}`
    const phases: LoadPhase[] = [
      { name: 'arrive', rps: 15, seconds: 10 },
      { name: 'sustain', rps: 6, seconds: 10 },
    ]
    const handle = await createLoadGenerator({
      engine,
      caCertPath: CA,
      dnsServer: DNS,
    }).start(TARGET, phases, {
      loadRehearsalId: id,
    })
    expect(handle.address).toMatch(/^10\.89\.0\.\d{1,3}$/)
    const waiting = await generatorContainers(id)
    expect(waiting.map((c) => c.State)).toEqual(['running'])

    await handle.go()
    const report = await handle.done

    expect(report.phases.map((p) => [p.name, p.asked, p.requests])).toEqual([
      ['arrive', 15, 150],
      ['sustain', 6, 60],
    ])
    // vegeta's own rate, measured — close to, never set from, the asked one.
    expect(report.phases[0]!.achieved).toBeGreaterThan(14)
    expect(report.phases[0]!.achieved).toBeLessThan(16)
    expect(report.requests).toBe(210)
    expect(report.answered).toBe(210)
    expect(report.answeredRatio).toBe(1)
    expect(report.timeouts).toBe(0)
    // Round robin over three paths, folded by busybox awk inside the container.
    expect(report.byPath).toEqual({
      '/': { '200': 70 },
      '/healthz': { '200': 70 },
      '/login': { '200': 70 },
    })
    expect(report.p95Ms).toBeGreaterThan(0)
    expect(report.p95Ms).toBeLessThan(2_000)
    expect(report.durationMs).toBeGreaterThan(19_000)

    expect(await generatorContainers(id)).toEqual([])
  })

  it("counts a real timeout as a timeout, never as answered — Go's own words, read inside the container", async () => {
    const id = `docker-test-${Date.now()}-timeout`
    // A millisecond: no TLS handshake through the edge completes in one, so at least the first request times out — and a
    // request that timed out takes its connection with it, so the next needs a handshake of its own.
    const handle = await createLoadGenerator({
      engine,
      caCertPath: CA,
      dnsServer: DNS,
    }).start({ ...TARGET, timeoutMs: 1 }, [{ name: 'arrive', rps: 5, seconds: 2 }], {
      loadRehearsalId: id,
    })
    await handle.go()
    const report = await handle.done
    const zeros = Object.values(report.byPath).reduce(
      (sum, codes) => sum + (codes['0'] ?? 0),
      0,
    )
    expect(report.requests).toBe(10)
    expect(report.timeouts).toBeGreaterThan(0)
    // Every status-0 result was a timeout, and none of them was answered.
    expect(report.timeouts).toBe(zeros)
    expect(report.answered).toBe(report.requests - zeros)
    expect(await generatorContainers(id)).toEqual([])
  })

  it('rejects done when go() never comes before the hard stop — and the container is still removed', async () => {
    const id = `docker-test-${Date.now()}-nogo`
    // One second of phases, fifteen for the report, a hard stop of nineteen: the container waits three seconds for go().
    const handle = await createLoadGenerator({
      engine,
      caCertPath: CA,
      dnsServer: DNS,
      hardStopMs: 19_000,
    }).start(TARGET, [{ name: 'arrive', rps: 1, seconds: 1 }], { loadRehearsalId: id })
    await expect(handle.done).rejects.toThrow(
      'the generator was never told to go within 3 s',
    )
    expect(await generatorContainers(id)).toEqual([])
  })
})

/**
 * TASKS 2 AND 3 TOGETHER, AS TASK 4'S RUN WILL CALL THEM (the sitting's stop: one generator run through the real edge): a
 * real route on the edge — its per-IP limit 600 a minute — to a stub app, and the generator loading it at 30 a second for
 * 25 s (750 requests). EXEMPTED through the Docker driver's own `setRateLimitExemption`, every request is answered; NOT
 * exempted, the same run meets the limiter — 600 answered, 150 `429` — and the report counts those as not answered
 * (Review Focus 2: a pass that measured the limiter is impossible).
 */
const ROUTE_HOST = 'loadgen-route.staging.manifest.internal'
const ROUTE_APP = 'mf-loadgen-route-staging-app'
const ROUTE_ID = '99999999-9999-4999-8999-999999999999'
const run = promisify(execFile)
const routing = {
  caddy: createCaddyClient('http://127.0.0.1:7119'),
  servers: { internal: 'srv0', public: 'srv0' },
}

describeDocker(
  'the load generator through a real route, exempted by the driver (Tasks 2 and 3)',
  () => {
    beforeAll(async () => {
      await removeRoute(routing, ROUTE_HOST, 'staging').catch(() => undefined)
      await run('docker', ['rm', '-f', ROUTE_APP]).catch(() => undefined)
      await run(
        'docker',
        stubAppArgs(ROUTE_APP, 'ok', {}, { aliases: [`mf-i-${ROUTE_ID}`] }),
      )
      await new Promise((r) => setTimeout(r, 1500))
      await applyRoute(routing, {
        hostname: ROUTE_HOST,
        kind: 'staging',
        upstreams: [{ dial: `mf-i-${ROUTE_ID}:8080`, instanceId: ROUTE_ID }],
        health: appHealthPolicy('/healthz'),
      })
    }, 120_000)

    afterAll(async () => {
      await removeRoute(routing, ROUTE_HOST, 'staging').catch(() => undefined)
      // Explicit names (P4b finding 192).
      await run('docker', ['rm', '-f', ROUTE_APP]).catch(() => undefined)
    })

    const target: LoadTarget = { ...TARGET, origin: `https://${ROUTE_HOST}` }
    const phases: LoadPhase[] = [{ name: 'arrive', rps: 30, seconds: 25 }]

    it('exempted, 750 requests in 25 s through a route limited to 600 a minute are every one answered', async () => {
      const driver = await dockerDriverForTests({ routing })
      const id = `docker-test-${Date.now()}-exempt`
      const handle = await createLoadGenerator({
        engine,
        caCertPath: CA,
        dnsServer: DNS,
      }).start(target, phases, {
        loadRehearsalId: id,
      })
      await driver.setRateLimitExemption(ROUTE_HOST, handle.address)
      try {
        await handle.go()
        const report = await handle.done
        expect(report.requests).toBe(750)
        expect(report.answered).toBe(750)
        expect(report.byPath).toEqual({
          '/': { '200': 250 },
          '/healthz': { '200': 250 },
          '/login': { '200': 250 },
        })
        expect(report.phases[0]!.achieved).toBeGreaterThan(29)
        console.log(
          `[load.docker] exempted: ${report.requests} requests, ${report.answered} answered, ` +
            `achieved ${report.achievedRps.toFixed(2)}/s, p50 ${report.p50Ms.toFixed(1)} ms, p95 ${report.p95Ms.toFixed(1)} ms, ` +
            `p99 ${report.p99Ms.toFixed(1)} ms, from ${handle.address}`,
        )
      } finally {
        await driver.setRateLimitExemption(ROUTE_HOST, null)
      }
      expect(await generatorContainers(id)).toEqual([])
    }, 120_000)

    it('NOT exempted, the same run meets the limiter — 600 answered, 150 refused 429, and the report does not count them', async () => {
      const id = `docker-test-${Date.now()}-limited`
      const handle = await createLoadGenerator({
        engine,
        caCertPath: CA,
        dnsServer: DNS,
      }).start(target, phases, {
        loadRehearsalId: id,
      })
      await handle.go()
      const report = await handle.done
      const codes: Record<string, number> = {}
      for (const byStatus of Object.values(report.byPath))
        for (const [code, n] of Object.entries(byStatus))
          codes[code] = (codes[code] ?? 0) + n
      expect(codes).toEqual({ '200': 600, '429': 150 })
      expect(report.answered).toBe(600)
      expect(report.answeredRatio).toBe(0.8)
      console.log(
        `[load.docker] not exempted: ${report.requests} requests, ${report.answered} answered, ` +
          `${JSON.stringify(codes)}, from ${handle.address}`,
      )
    }, 120_000)
  },
)
