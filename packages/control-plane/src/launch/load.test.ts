import { readFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import type { EngineClient } from '../runtime/index.js'
import { loadConfig } from '../config.js'
import {
  LOAD_GENERATOR_IMAGE,
  LoadRehearsalError,
  createLoadGenerator,
  judge,
  loadPathsFor,
  phasesFor,
  readLoadResult,
  type LoadPhase,
  type LoadReport,
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
function byPathOf(
  all: VegetaReport,
  paths: readonly string[] = TARGET.paths,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = Object.fromEntries(
    paths.map((path) => [path, {}]),
  )
  let i = 0
  for (const [code, n] of Object.entries(all.status_codes)) {
    for (let k = 0; k < n; k++) {
      const path = paths[i++ % paths.length]!
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
  /** What `GET /containers/json` lists — the containers a label filter finds. */
  listed?: { Id: string }[]
}) {
  const calls: Call[] = []
  let releaseWait: () => void = () => {}
  const waited = new Promise<void>((resolve) => {
    releaseWait = resolve
  })
  const engine: EngineClient = {
    async get<T>(path: string): Promise<T | undefined> {
      calls.push({ method: 'GET', path })
      if (path.startsWith('/containers/json?')) return (opts.listed ?? []) as T
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
        // In targetCycle's order (F3): three rounds, each rotated by one.
        'PATHS=/ /healthz /login /healthz /login / /login / /healthz',
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

  it('orders the targets so no round-robin set of 1, 2 or 3 members lines up with them: each member is asked every path equally (F3)', async () => {
    // vegeta hands the targets file out round robin, and the edge hands requests to the granted set round robin
    // (`routing/caddy.ts`'s `round_robin`). With three paths in a row and three members, member m was asked only
    // path m: one member took every `/` (sitting 6's F3). Any offset between the two counters relabels members only.
    for (const paths of [
      ['/', '/healthz', '/login'],
      ['/', '/healthz'],
    ]) {
      const { engine, calls, finish } = fakeEngine({
        lastLine: lineOf({ byPath: byPathOf(allOf(captured(50), captured(100)), paths) }),
      })
      const handle = await createLoadGenerator({ engine, ...OPTIONS }).start(
        { ...TARGET, paths },
        PHASES,
        { loadRehearsalId: 'lr-1' },
      )
      const env = (
        calls.find((c) => c.path === '/containers/create')!.body as { Env: string[] }
      ).Env
      const order = env
        .find((e) => e.startsWith('PATHS='))!
        .slice('PATHS='.length)
        .split(' ')
      // The mix is the paths', one each: every path, nothing else, equally often.
      expect([...new Set(order)].sort()).toEqual([...paths].sort())
      for (const path of paths)
        expect(order.filter((p) => p === path)).toHaveLength(order.length / paths.length)
      for (const members of [1, 2, 3]) {
        const asked = Array.from({ length: members }, () => new Map<string, number>())
        for (let k = 0; k < order.length * members * 2; k++) {
          const member = asked[k % members]!
          const path = order[k % order.length]!
          member.set(path, (member.get(path) ?? 0) + 1)
        }
        for (const member of asked) {
          expect(
            [...member.keys()].sort(),
            `${members} members, ${order.join(' ')}`,
          ).toEqual([...paths].sort())
          expect(
            new Set(member.values()).size,
            `${members} members, ${order.join(' ')}`,
          ).toBe(1)
        }
      }
      finish()
      await handle.done
    }
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

  it('removes whatever a run left by its label — every container labelled with that run, with its volumes', async () => {
    const { engine, calls } = fakeEngine({
      lastLine: '',
      listed: [{ Id: 'gen-7' }, { Id: 'gen-8' }],
    })
    expect(await createLoadGenerator({ engine, ...OPTIONS }).removeLeft('lr-9')).toBe(2)
    const filter = encodeURIComponent(
      JSON.stringify({ label: ['manifest.load-rehearsal=lr-9'] }),
    )
    expect(calls).toEqual([
      { method: 'GET', path: `/containers/json?all=true&filters=${filter}` },
      { method: 'DELETE', path: '/containers/gen-7?force=true&v=true' },
      { method: 'DELETE', path: '/containers/gen-8?force=true&v=true' },
    ])
  })

  it('refuses to remove by an id it could not have labelled with, before asking the daemon anything', async () => {
    const { engine, calls } = fakeEngine({ lastLine: '' })
    await expect(
      createLoadGenerator({ engine, ...OPTIONS }).removeLeft('lr-1,other=x'),
    ).rejects.toThrow(
      "a load rehearsal id the generator cannot label with: 'lr-1,other=x'",
    )
    expect(calls).toEqual([])
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

// --- the judgement and the profile (Task 4) -----------------------------------------------------------------------

const MARK = { answeredRatio: 0.99, p95Ms: 2_000, achievedRatio: 0.9 }
const ARRIVAL: LoadPhase[] = [
  { name: 'arrive', rps: 75, seconds: 60 },
  { name: 'sustain', rps: 50, seconds: 300 },
]
const CALM = { exits: 0, outOfMemory: false, unhealthy: false }

/** A clean run of §24's synchronised profile: every request answered, quick, each phase at its rate. */
function cleanReport(overrides: Partial<LoadReport> = {}): LoadReport {
  const phases = [
    {
      name: 'arrive' as const,
      asked: 75,
      achieved: 75.01,
      requests: 4500,
      answered: 4500,
      statusCounts: { '200': 3000, '302': 1500 },
      p50Ms: 3,
      p95Ms: 9,
      p99Ms: 20,
    },
    {
      name: 'sustain' as const,
      asked: 50,
      achieved: 50.0,
      requests: 15000,
      answered: 15000,
      statusCounts: { '200': 10000, '302': 5000 },
      p50Ms: 2,
      p95Ms: 7,
      p99Ms: 15,
    },
  ]
  return {
    phases,
    p50Ms: 2,
    p95Ms: 8,
    p99Ms: 18,
    requests: 19500,
    answered: 19500,
    timeouts: 0,
    achievedRps: 54.2,
    answeredRatio: 1,
    byPath: {
      '/': { '200': 6500 },
      '/healthz': { '200': 6500 },
      '/login': { '302': 6500 },
    },
    durationMs: 360_010,
    ...overrides,
  }
}

describe('judge — the pass mark, every rule, the first broken one named (Review Focus 2 and 5)', () => {
  it('passes a clean run, saying what it measured', () => {
    const verdict = judge(cleanReport(), CALM, ARRIVAL, MARK)
    expect(verdict.passed).toBe(true)
    expect(verdict.reason).toContain('100% of requests answered')
  })

  it('fails 98.9% answered, naming the ratio and the mark', () => {
    const verdict = judge(
      cleanReport({ answered: 19287, answeredRatio: 19287 / 19500 }),
      CALM,
      ARRIVAL,
      MARK,
    )
    expect(verdict).toEqual({
      passed: false,
      reason: '98.9% of requests were answered (19287 of 19500); the mark is 99%',
    })
    // Exactly the mark passes.
    expect(
      judge(cleanReport({ answered: 19305, answeredRatio: 0.99 }), CALM, ARRIVAL, MARK)
        .passed,
    ).toBe(true)
  })

  it('fails a p95 of 2.1 s, naming it — and a p95 of exactly 2 s is not under the mark', () => {
    expect(judge(cleanReport({ p95Ms: 2_100 }), CALM, ARRIVAL, MARK)).toEqual({
      passed: false,
      reason: 'p95 was 2.1 s; the mark is under 2 s',
    })
    expect(judge(cleanReport({ p95Ms: 2_000 }), CALM, ARRIVAL, MARK).passed).toBe(false)
    expect(judge(cleanReport({ p95Ms: 1_999 }), CALM, ARRIVAL, MARK).passed).toBe(true)
  })

  it('fails a run the generator could not drive — a phase under nine-tenths of its rate — never a pass', () => {
    const short = cleanReport()
    short.phases[1] = { ...short.phases[1]!, achieved: 44.9 }
    expect(judge(short, CALM, ARRIVAL, MARK)).toEqual({
      passed: false,
      reason:
        "the generator reached 44.9 of 50 requests a second in its 'sustain' phase, under nine-tenths of the rate asked — a run it could not drive measures the generator, not the app",
    })
    const enough = cleanReport()
    enough.phases[1] = { ...enough.phases[1]!, achieved: 45 }
    expect(judge(enough, CALM, ARRIVAL, MARK).passed).toBe(true)
  })

  it('fails an instance that exited, one that ran out of memory, and one that was unhealthy — each named', () => {
    expect(judge(cleanReport(), { ...CALM, exits: 1 }, ARRIVAL, MARK)).toEqual({
      passed: false,
      reason: 'an instance exited during the run',
    })
    expect(judge(cleanReport(), { ...CALM, exits: 2 }, ARRIVAL, MARK).reason).toBe(
      '2 instances exited during the run',
    )
    expect(judge(cleanReport(), { ...CALM, outOfMemory: true }, ARRIVAL, MARK)).toEqual({
      passed: false,
      reason: 'an instance ran out of memory during the run',
    })
    expect(judge(cleanReport(), { ...CALM, unhealthy: true }, ARRIVAL, MARK)).toEqual({
      passed: false,
      reason: 'an instance was unhealthy during the run',
    })
  })

  it('counts a 302 and a 404 as answered and a 429 as not — through the report it is given', () => {
    // The ratio is the report's own (readLoadResult's tests hold how it counts); judge reads it, never recounts.
    const limited = cleanReport({ answered: 15000, answeredRatio: 15000 / 19500 })
    limited.byPath = {
      '/': { '200': 6500 },
      '/healthz': { '429': 4500, '404': 2000 },
      '/login': { '302': 6500 },
    }
    expect(judge(limited, CALM, ARRIVAL, MARK).reason).toBe(
      '76.9% of requests were answered (15000 of 19500); the mark is 99%',
    )
  })

  it("names the FIRST broken rule, in the pass mark's order: answered, p95, the generator's rate, then the instances", () => {
    const everything = cleanReport({
      answered: 100,
      answeredRatio: 100 / 19500,
      p95Ms: 9_000,
    })
    everything.phases[0] = { ...everything.phases[0]!, achieved: 10 }
    const watched = { exits: 3, outOfMemory: true, unhealthy: true }
    expect(judge(everything, watched, ARRIVAL, MARK).reason).toMatch(/^0\.5% of requests/)
    expect(
      judge({ ...everything, answered: 19500, answeredRatio: 1 }, watched, ARRIVAL, MARK)
        .reason,
    ).toBe('p95 was 9 s; the mark is under 2 s')
    expect(
      judge(
        { ...everything, answered: 19500, answeredRatio: 1, p95Ms: 10 },
        watched,
        ARRIVAL,
        MARK,
      ).reason,
    ).toMatch(/^the generator reached 10 of 75/)
    // Among the instances: out of memory, then an exit, then unhealthy — the most specific first.
    expect(judge(cleanReport(), watched, ARRIVAL, MARK).reason).toBe(
      'an instance ran out of memory during the run',
    )
    expect(
      judge(cleanReport(), { ...watched, outOfMemory: false }, ARRIVAL, MARK).reason,
    ).toBe('3 instances exited during the run')
  })

  it('fails a run that sent nothing', () => {
    const none = cleanReport({ requests: 0, answered: 0, answeredRatio: 0 })
    expect(judge(none, CALM, ARRIVAL, MARK).passed).toBe(false)
  })
})

describe('phasesFor — §24’s arrival, from the settings', () => {
  const settings = loadConfig({
    MANIFEST_DATABASE_URL: 'postgres://unused',
    MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
    MANIFEST_SESSION_SECRET: 'k'.repeat(32),
    MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
    MANIFEST_REPOS_ROOT: '/tmp/repos',
  }).loadRehearsal

  it('gives `synchronised` its arrival and its stay — 75 a second for a minute, then 50 for five', () => {
    expect(phasesFor({ scale: 'large_course', burst: 'synchronised' }, settings)).toEqual(
      [
        { name: 'arrive', rps: 75, seconds: 60 },
        { name: 'sustain', rps: 50, seconds: 300 },
      ],
    )
  })

  it('gives `steady` its ramp — 10, 20, 30, 40 and 50 a second, a minute each', () => {
    expect(phasesFor({ scale: 'public', burst: 'steady' }, settings)).toEqual(
      [10, 20, 30, 40, 50].map((rps, i) => ({ name: `ramp-${i + 1}`, rps, seconds: 60 })),
    )
  })

  it('gives `public` the same as `large_course` — the stated cap on a laptop', () => {
    for (const burst of ['steady', 'synchronised'] as const)
      expect(phasesFor({ scale: 'public', burst }, settings)).toEqual(
        phasesFor({ scale: 'large_course', burst }, settings),
      )
  })

  it('refuses a solo or a class app: LOAD_REHEARSAL_NOT_NEEDED', () => {
    for (const scale of ['solo', 'class'] as const) {
      const refused = (() => {
        try {
          phasesFor({ scale, burst: 'synchronised' }, settings)
        } catch (error) {
          return error
        }
      })()
      expect(refused).toBeInstanceOf(LoadRehearsalError)
      expect(refused).toMatchObject({ code: 'LOAD_REHEARSAL_NOT_NEEDED' })
    }
  })
})

describe('loadPathsFor — what a crowd asks for first (Decision 4)', () => {
  it('loads the front page and the health path — and, for a CWL app, its sign-in redirect', () => {
    expect(loadPathsFor({ health: '/healthz', auth: { provider: 'none' } })).toEqual([
      '/',
      '/healthz',
    ])
    expect(loadPathsFor({ health: '/healthz', auth: { provider: 'cwl' } })).toEqual([
      '/',
      '/healthz',
      '/login',
    ])
  })

  it('loads a path once, even when the health path is the front page', () => {
    expect(loadPathsFor({ health: '/', auth: { provider: 'cwl' } })).toEqual([
      '/',
      '/login',
    ])
  })
})
