import { readFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import type { EngineClient } from '../runtime/index.js'
import {
  LOAD_GENERATOR_IMAGE,
  createLoadGenerator,
  readLoadResult,
  type LoadPhase,
  type LoadTarget,
} from './load.js'

/**
 * THE LOAD GENERATOR (the load rehearsal plan's Task 2) — its result read honestly (Review Focus 2), and its
 * container created hardened and always removed. DB-free: no Postgres, no Docker (`load.docker.test.ts` runs
 * the real container through the real edge).
 *
 * The vegeta reports here are vegeta's OWN output, captured whole by `[M3b]` on 2026-10-15 (12:57–13:00 PDT,
 * vegeta 12.13.0 through a throwaway Caddy — `spikes/load-baseline/probes/m3b-vegeta.sh`); every variant below
 * changes one field of one of them.
 */

interface VegetaReport {
  latencies: Record<
    'total' | 'mean' | '50th' | '90th' | '95th' | '99th' | 'max' | 'min',
    number
  >
  duration: number
  wait: number
  requests: number
  rate: number
  status_codes: Record<string, number>
  [key: string]: unknown
}

function captured(rate: 10 | 50 | 100 | 200 | 400): VegetaReport {
  const report = JSON.parse(
    readFileSync(new URL(`./load-fixtures/report-${rate}.json`, import.meta.url), 'utf8'),
  ) as VegetaReport
  // The container drops vegeta's `errors` list before it prints (one string per distinct error, a local port
  // in many — per-connection data that must not leave it), so the line never carries one.
  delete report['errors']
  return report
}

const TARGET: LoadTarget = {
  origin: 'https://load-app.staging.manifest.internal',
  paths: ['/', '/healthz', '/login'],
  timeoutMs: 10_000,
}
const PHASES: LoadPhase[] = [
  { name: 'arrive', rps: 50, seconds: 30 },
  { name: 'sustain', rps: 100, seconds: 30 },
]

/** The whole run's report as vegeta writes it over both phases' results: counts summed, latencies its own. */
function allOf(
  a: VegetaReport,
  b: VegetaReport,
  latencies?: Partial<VegetaReport['latencies']>,
): VegetaReport {
  const codes: Record<string, number> = { ...a.status_codes }
  for (const [code, n] of Object.entries(b.status_codes))
    codes[code] = (codes[code] ?? 0) + n
  return {
    ...b,
    requests: a.requests + b.requests,
    status_codes: codes,
    rate: (a.requests + b.requests) / ((a.duration + b.duration) / 1e9),
    duration: a.duration + b.duration,
    wait: b.wait,
    latencies: { ...b.latencies, ...latencies },
  }
}

/** Per path, per status, as the container's awk folds it: the round robin over three paths. */
function byPathOf(all: VegetaReport): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {
    '/': {},
    '/healthz': {},
    '/login': {},
  }
  let i = 0
  for (const [code, n] of Object.entries(all.status_codes)) {
    for (let k = 0; k < n; k++) {
      const path = TARGET.paths[i++ % 3]!
      out[path]![code] = (out[path]![code] ?? 0) + 1
    }
  }
  return out
}

function lineOf(parts: {
  phases?: { name: string; report: VegetaReport }[]
  all?: VegetaReport
  byPath?: Record<string, Record<string, number>> | undefined
  timeouts?: number
  omit?: 'byPath' | 'all' | 'timeouts'
}): string {
  const arrive = captured(50)
  const sustain = captured(100)
  const all = parts.all ?? allOf(arrive, sustain)
  const body: Record<string, unknown> = {
    phases: parts.phases ?? [
      { name: 'arrive', report: arrive },
      { name: 'sustain', report: sustain },
    ],
    all,
    byPath: parts.byPath ?? byPathOf(all),
    timeouts: parts.timeouts ?? 0,
  }
  if (parts.omit) delete body[parts.omit]
  return JSON.stringify(body)
}

describe('readLoadResult — the report is honest (Review Focus 2)', () => {
  it("reads vegeta's own run: each phase's achieved rate is vegeta's `rate`, and its latencies in milliseconds", () => {
    const report = readLoadResult(lineOf({}), TARGET, PHASES)
    const arrive = captured(50)
    expect(report.phases.map((p) => [p.name, p.asked, p.achieved, p.requests])).toEqual([
      ['arrive', 50, arrive.rate, 1500],
      ['sustain', 100, captured(100).rate, 3000],
    ])
    expect(report.phases[0]!.achieved).toBeCloseTo(50.03, 2)
    expect(report.phases[0]!.p95Ms).toBeCloseTo(arrive.latencies['95th'] / 1e6, 6)
    expect(report.phases[0]!.statusCounts).toEqual({ '200': 1000, '302': 500 })
    // A 302 is answered (Rich's "non-5xx"): every one of [M3b]'s requests was.
    expect(report.requests).toBe(4500)
    expect(report.answered).toBe(4500)
    expect(report.answeredRatio).toBe(1)
    expect(report.timeouts).toBe(0)
  })

  it('reports the rate vegeta ACHIEVED, never the rate asked — a generator that fell short says so', () => {
    const short = { ...captured(50), rate: 31.2 }
    const report = readLoadResult(
      lineOf({
        phases: [
          { name: 'arrive', report: short },
          { name: 'sustain', report: captured(100) },
        ],
        all: allOf(short, captured(100)),
      }),
      TARGET,
      PHASES,
    )
    expect(report.phases[0]!.asked).toBe(50)
    expect(report.phases[0]!.achieved).toBe(31.2)
  })

  it('counts a 429 and a 5xx as NOT answered, and a 302 and a 404 as answered', () => {
    const mixed = {
      ...captured(50),
      requests: 1500,
      status_codes: {
        '200': 1000,
        '302': 200,
        '404': 100,
        '429': 100,
        '500': 50,
        '503': 50,
      },
    }
    const report = readLoadResult(
      lineOf({
        phases: [
          { name: 'arrive', report: mixed },
          { name: 'sustain', report: captured(100) },
        ],
        all: allOf(mixed, captured(100)),
      }),
      TARGET,
      PHASES,
    )
    expect(report.phases[0]!.answered).toBe(1300)
    expect(report.answered).toBe(1300 + 3000)
    expect(report.answeredRatio).toBeCloseTo(4300 / 4500, 10)
  })

  it("counts a timeout and a connection error (vegeta's status 0) as not answered, and carries the timeouts the container counted", () => {
    const failing = { ...captured(50), status_codes: { '200': 1400, '0': 100 } }
    const report = readLoadResult(
      lineOf({
        phases: [
          { name: 'arrive', report: failing },
          { name: 'sustain', report: captured(100) },
        ],
        all: allOf(failing, captured(100)),
        timeouts: 60,
      }),
      TARGET,
      PHASES,
    )
    expect(report.phases[0]!.answered).toBe(1400)
    expect(report.answered).toBe(4400)
    expect(report.timeouts).toBe(60)
  })

  it("takes the whole run's latencies from vegeta's report over EVERY phase, never a mean of the phases'", () => {
    const arrive = captured(50)
    const sustain = captured(100)
    // Chosen so the phases' mean (≈ 3.0 ms) is nothing like the whole run's: a reader that averaged would be caught.
    const all = allOf(arrive, sustain, {
      '50th': 7_000_000,
      '95th': 1_234_000_000,
      '99th': 1_900_000_000,
    })
    const report = readLoadResult(lineOf({ all }), TARGET, PHASES)
    expect(report.p95Ms).toBe(1234)
    expect(report.p50Ms).toBe(7)
    expect(report.p99Ms).toBe(1900)
    expect(report.achievedRps).toBe(all.rate)
    expect(report.durationMs).toBe((all.duration + all.wait) / 1e6)
  })

  it('carries the per-path status counts whole', () => {
    const byPath = {
      '/': { '200': 1500 },
      '/healthz': { '200': 1500 },
      '/login': { '302': 1000, '503': 500 },
    }
    const report = readLoadResult(lineOf({ byPath }), TARGET, PHASES)
    expect(report.byPath).toEqual(byPath)
  })

  it.each([
    ['byPath', 'byPath'],
    ['all', 'report of the whole run'],
    ['timeouts', 'timeouts'],
  ] as const)('refuses a line with no %s, naming it', (omit, named) => {
    expect(() => readLoadResult(lineOf({ omit }), TARGET, PHASES)).toThrow(named)
  })

  it('refuses a line missing a phase, naming the phase', () => {
    const line = lineOf({
      phases: [{ name: 'arrive', report: captured(50) }],
      all: captured(50),
      byPath: byPathOf(captured(50)),
    })
    expect(() => readLoadResult(line, TARGET, PHASES)).toThrow(
      "no report for the phase 'sustain'",
    )
  })

  it("refuses a run whose phases do not add up to the whole run's requests", () => {
    const all = { ...allOf(captured(50), captured(100)), requests: 4000 }
    expect(() =>
      readLoadResult(
        lineOf({ all, byPath: byPathOf(allOf(captured(50), captured(100))) }),
        TARGET,
        PHASES,
      ),
    ).toThrow("the phases' 4500 requests are not the whole run's 4000")
  })

  it("refuses per-path counts that do not add up to the whole run's requests", () => {
    const byPath = {
      '/': { '200': 1500 },
      '/healthz': { '200': 1500 },
      '/login': { '302': 1499 },
    }
    expect(() => readLoadResult(lineOf({ byPath }), TARGET, PHASES)).toThrow(
      "the per-path counts' 4499 requests are not the whole run's 4500",
    )
  })

  it('refuses a path the run did not load', () => {
    const byPath = {
      '/': { '200': 1500 },
      '/healthz': { '200': 1500 },
      '/admin': { '200': 1500 },
    }
    expect(() => readLoadResult(lineOf({ byPath }), TARGET, PHASES)).toThrow(
      "a path the run did not load: '/admin'",
    )
  })

  it('refuses a line that is not JSON, quoting it', () => {
    expect(() =>
      readLoadResult('vegeta: unknown flag -max-body', TARGET, PHASES),
    ).toThrow('the load generator printed no result: vegeta: unknown flag -max-body')
  })

  it("reports the generator's own failure in its words", () => {
    expect(() =>
      readLoadResult(
        '{"error":"the generator was never told to go within 60 s"}',
        TARGET,
        PHASES,
      ),
    ).toThrow('the load generator failed: the generator was never told to go within 60 s')
  })
})

describe('LOAD_GENERATOR_IMAGE', () => {
  it("is the image infra/seed/build-vegeta.sh builds: manifest/vegeta at the lock's version, in the daemon's own store", () => {
    const lock = readFileSync(
      new URL('../../../../infra/vegeta/vegeta.lock', import.meta.url),
      'utf8',
    )
    const version = /^version\t(\S+)$/m.exec(lock)?.[1]
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(LOAD_GENERATOR_IMAGE).toBe(`manifest/vegeta:${version}`)
    // Never under the registry's app prefix, which scripts/app-images.sh sweeps (the second review's M5).
    expect(LOAD_GENERATOR_IMAGE.startsWith('127.0.0.1:7107/')).toBe(false)
  })
})

// --- the container: a fake Engine that records every call -------------------------------------------------------

/** Docker's multiplexed log framing — `[stream:u8][000][size:u32be][payload]` — for one stdout payload. */
function frame(text: string): Buffer {
  const payload = Buffer.from(text)
  const header = Buffer.alloc(8)
  header[0] = 1
  header.writeUInt32BE(payload.length, 4)
  return Buffer.concat([header, payload])
}

interface Call {
  method: string
  path: string
  body?: unknown
}

function fakeEngine(opts: {
  lastLine: string
  address?: string
  created?: boolean
  exitCode?: number
}) {
  const calls: Call[] = []
  let releaseWait: () => void = () => {}
  const waited = new Promise<void>((resolve) => {
    releaseWait = resolve
  })
  const engine: EngineClient = {
    async get<T>(path: string): Promise<T | undefined> {
      calls.push({ method: 'GET', path })
      if (path.startsWith('/containers/') && path.endsWith('/json')) {
        return {
          NetworkSettings: {
            Networks: {
              'manifest-platform': { IPAddress: opts.address ?? '10.89.0.77' },
            },
          },
        } as T
      }
      if (path.startsWith('/exec/')) return { ExitCode: 0 } as T
      return undefined
    },
    async post<T>(path: string, body?: unknown): Promise<T | undefined> {
      calls.push({ method: 'POST', path, body })
      if (path === '/containers/create')
        return opts.created === false ? undefined : ({ Id: 'gen-1' } as T)
      if (path.endsWith('/exec')) return { Id: 'exec-1' } as T
      if (path.endsWith('/wait')) {
        await waited
        return { StatusCode: opts.exitCode ?? 0 } as T
      }
      return {} as T
    },
    async del<T>(path: string): Promise<T | undefined> {
      calls.push({ method: 'DELETE', path })
      return undefined
    },
    async putArchive(): Promise<void> {
      throw new Error(
        'the generator never uses the archive API: it cannot write onto a tmpfs (the second review M7)',
      )
    },
    async stream(
      path: string,
      method?: 'GET' | 'POST',
      body?: unknown,
    ): Promise<IncomingMessage> {
      calls.push({ method: method ?? 'GET', path, body })
      const chunks = path.includes('/logs')
        ? [frame(`attacking\n${opts.lastLine}\n`)]
        : []
      return (async function* () {
        yield* chunks
      })() as unknown as IncomingMessage
    },
  }
  return { engine, calls, finish: () => releaseWait() }
}

const OPTIONS = {
  caCertPath: '/repo/infra/ca/manifest-root.crt',
  dnsServer: '10.89.0.53',
}

describe('createLoadGenerator — the container', () => {
  it('creates ONE hardened container on the platform network, labelled for the boot to find, and answers its address before any load', async () => {
    const { engine, calls, finish } = fakeEngine({ lastLine: lineOf({}) })
    const generator = createLoadGenerator({ engine, ...OPTIONS })
    const handle = await generator.start(TARGET, PHASES, { loadRehearsalId: 'lr-1' })
    expect(handle.address).toBe('10.89.0.77')
    const create = calls.find((c) => c.path === '/containers/create')!
    const body = create.body as {
      Image: string
      Labels: Record<string, string>
      HostConfig: { Tmpfs: Record<string, string> } & Record<string, unknown>
    }
    expect(body.Image).toBe(LOAD_GENERATOR_IMAGE)
    expect(body.Labels).toEqual({ 'manifest.load-rehearsal': 'lr-1' })
    expect(body.HostConfig).toMatchObject({
      NetworkMode: 'manifest-platform',
      Dns: ['10.89.0.53'],
      Binds: ['/repo/infra/ca/manifest-root.crt:/ca.crt:ro'],
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      ReadonlyRootfs: true,
      PidsLimit: 256,
      Memory: 512 * 1024 * 1024,
      MemorySwap: 512 * 1024 * 1024,
      RestartPolicy: { Name: 'no' },
      Privileged: false,
    })
    expect(body.HostConfig.Tmpfs['/work']).toMatch(/size=\d+m/)
    // Nothing is loaded until go(): the go-file is touched by an Engine exec, never the archive API.
    expect(calls.some((c) => c.path.endsWith('/exec'))).toBe(false)
    await handle.go()
    const exec = calls.find((c) => c.path === '/containers/gen-1/exec')!
    expect((exec.body as { Cmd: string[] }).Cmd).toEqual(['touch', '/work/go'])
    finish()
    await handle.done
  })

  it('passes the targets, the phases and the timeout to the container, and loads with the CA, no redirects followed and no body kept', async () => {
    const { engine, calls, finish } = fakeEngine({ lastLine: lineOf({}) })
    const handle = await createLoadGenerator({ engine, ...OPTIONS }).start(
      TARGET,
      PHASES,
      { loadRehearsalId: 'lr-1' },
    )
    const body = (calls.find((c) => c.path === '/containers/create')!.body ?? {}) as {
      Env: string[]
      Cmd: string[]
    }
    expect(body.Env).toEqual(
      expect.arrayContaining([
        'ORIGIN=https://load-app.staging.manifest.internal',
        'PATHS=/ /healthz /login',
        'PHASES=arrive:50:30 sustain:100:30',
        'TIMEOUT_MS=10000',
      ]),
    )
    const script = body.Cmd.join(' ')
    for (const flag of ['-root-certs=/ca.crt', '-redirects=-1', '-max-body=0'])
      expect(script).toContain(flag)
    finish()
    await handle.done
  })

  it('resolves done with the report read from the LAST line, and removes the container with its volumes', async () => {
    const { engine, calls, finish } = fakeEngine({ lastLine: lineOf({}) })
    const handle = await createLoadGenerator({ engine, ...OPTIONS }).start(
      TARGET,
      PHASES,
      { loadRehearsalId: 'lr-1' },
    )
    await handle.go()
    finish()
    const report = await handle.done
    expect(report.requests).toBe(4500)
    expect(calls.at(-1)).toEqual({
      method: 'DELETE',
      path: '/containers/gen-1?force=true&v=true',
    })
  })

  it("rejects done with the generator's own words when it fails — and still removes the container", async () => {
    const { engine, calls, finish } = fakeEngine({
      lastLine: '{"error":"the generator was never told to go within 60 s"}',
      exitCode: 3,
    })
    const handle = await createLoadGenerator({ engine, ...OPTIONS }).start(
      TARGET,
      PHASES,
      { loadRehearsalId: 'lr-1' },
    )
    finish()
    await expect(handle.done).rejects.toThrow(
      'the generator was never told to go within 60 s',
    )
    expect(calls.at(-1)).toEqual({
      method: 'DELETE',
      path: '/containers/gen-1?force=true&v=true',
    })
  })

  it('removes the container and refuses to start when its platform address cannot be read', async () => {
    const { engine, calls } = fakeEngine({ lastLine: '', address: '' })
    await expect(
      createLoadGenerator({ engine, ...OPTIONS }).start(TARGET, PHASES, {
        loadRehearsalId: 'lr-1',
      }),
    ).rejects.toThrow('no address on manifest-platform')
    expect(calls.at(-1)).toEqual({
      method: 'DELETE',
      path: '/containers/gen-1?force=true&v=true',
    })
  })

  it('says `make seed` builds the image when the daemon does not have it', async () => {
    const { engine } = fakeEngine({ lastLine: '', created: false })
    await expect(
      createLoadGenerator({ engine, ...OPTIONS }).start(TARGET, PHASES, {
        loadRehearsalId: 'lr-1',
      }),
    ).rejects.toThrow(`no such image: ${LOAD_GENERATOR_IMAGE} — \`make seed\` builds it`)
  })

  it.each([
    [
      'a path with a space',
      { ...TARGET, paths: ['/a b'] },
      PHASES,
      'a path the generator cannot load',
    ],
    [
      'an origin that is not https',
      { ...TARGET, origin: 'http://x.staging.manifest.internal' },
      PHASES,
      'an origin the generator cannot load',
    ],
    ['no phases', TARGET, [], 'at least one phase'],
    [
      'a fractional rate',
      TARGET,
      [{ name: 'arrive', rps: 7.5, seconds: 30 }],
      'a whole number of requests a second',
    ],
    [
      'phases longer than the hard stop',
      TARGET,
      [{ name: 'arrive', rps: 10, seconds: 480 }],
      'longer than the hard stop',
    ],
  ] satisfies [string, LoadTarget, LoadPhase[], string][])(
    'refuses %s before creating anything',
    async (_, target, phases, message) => {
      const { engine, calls } = fakeEngine({ lastLine: '' })
      await expect(
        createLoadGenerator({ engine, ...OPTIONS }).start(target, phases, {
          loadRehearsalId: 'lr-1',
        }),
      ).rejects.toThrow(message)
      expect(calls).toEqual([])
    },
  )
})
