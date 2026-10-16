import { resolve } from 'node:path'
import type { LoadRehearsalSettings } from '../config.js'
import type { StoredAudience } from '../projects/index.js'
import { demux, type EngineClient } from '../runtime/index.js'

/**
 * §24'S LOAD GENERATOR (the load rehearsal plan's Task 2, Decision 3) — vegeta, in a throwaway container on the
 * platform network, putting an audience's arrival on an app's staging hostname THROUGH THE EDGE, and printing
 * what it measured as ONE JSON line, last.
 *
 * **IT RUNS THROUGH THE ENGINE SEAM, NOT THE `Driver`**, exactly as D21's sign-in probe does (`sso/sign-in.ts`):
 * §11 keeps the driver to what the control plane asks of infrastructure for an app, and this is the platform's
 * own measuring instrument. Create, start, WAIT FOR `go()`, wait, read the last line, remove with `v=true`.
 *
 * **IT IS STARTED BEFORE IT LOADS.** `start()` answers the container's own address on the platform network —
 * the address the edge sees it from ([M2]: no NAT, no proxy header), which the run exempts from the staging
 * route's per-IP limit through `Driver.setRateLimitExemption` — and the container waits for a go-file that
 * `go()` writes by an Engine exec (the archive API cannot write onto a tmpfs mount — the second review's M7).
 *
 * **NOTHING PER-REQUEST LEAVES THE CONTAINER.** Its results stay on its tmpfs; what comes out is each phase's
 * `vegeta report -type=json`, the whole run's over every phase's results, and the per-path status counts folded
 * by busybox `awk` — evidence of where a failure was, never a rule (Decision 8). vegeta's own `errors` list is
 * dropped from each report before printing: one string per distinct error, a local port in many, so it is
 * per-connection data and can be thousands long.
 */

/** One phase of the arrival: a rate, for a time. Spec action A's profile is two or five of these. */
export interface LoadPhase {
  name: 'arrive' | 'sustain' | 'ramp-1' | 'ramp-2' | 'ramp-3' | 'ramp-4' | 'ramp-5'
  rps: number
  seconds: number
}

export interface LoadTarget {
  /** `https://<staging hostname>` — reached through the edge. */
  origin: string
  /** The paths loaded, round robin — `['/', '/healthz', '/login']` for a CWL app (Decision 4). No expected class: a status below 500
   *  other than 429, in time, is answered on every path (Decision 8; the second review's I2). */
  paths: string[]
  /** Each request's own timeout. */
  timeoutMs: number
}

export interface PhaseReport {
  name: LoadPhase['name']
  asked: number
  /** vegeta's own `rate` — what it actually sent, a second. */
  achieved: number
  requests: number
  /** Answered: a status below 500 other than 429, within the timeout — never a 5xx, a 429, a timeout or a connection error. */
  answered: number
  statusCounts: Record<string, number>
  p50Ms: number
  p95Ms: number
  p99Ms: number
}

export interface LoadReport {
  phases: PhaseReport[]
  /** The whole run's latencies, from vegeta's report over EVERY phase's results — never an average of the phases'. */
  p50Ms: number
  p95Ms: number
  p99Ms: number
  /** The whole run: every request, those answered, those that timed out, and the rate vegeta achieved. */
  requests: number
  answered: number
  timeouts: number
  achievedRps: number
  answeredRatio: number
  /** Per path, per status — EVIDENCE of where a failure was, folded inside the container; nothing per-request leaves it. */
  byPath: Record<string, Record<string, number>>
  durationMs: number
}

export interface LoadGenerator {
  /**
   * The container started and WAITING: its own address on the platform network (Task 3 exempts it), `go()` to begin the load once
   * the exemption is set, and `done` — which also settles, rejected, if `go()` is never called before the hard stop.
   */
  start(
    target: LoadTarget,
    phases: LoadPhase[],
    labels: { loadRehearsalId: string },
  ): Promise<{ address: string; go(): Promise<void>; done: Promise<LoadReport> }>
  /**
   * Removes, with its volumes, every container labelled with this run — what a run left behind when it stopped (the
   * boot's pass 2⅞, Decision 13), or a generator the run itself must end now (a `go()` that failed, a set that went
   * away). Answers how many it removed. Removing one ends its `done`, rejected.
   */
  removeLeft(loadRehearsalId: string): Promise<number>
}

export interface LoadGeneratorOptions {
  engine: EngineClient
  /** `config.caCertPath`. Mounted into the container and handed to vegeta as its only root — never `-insecure`. */
  caCertPath: string
  /** `config.dnsServer` — the platform resolver, which answers every app hostname with the edge. */
  dnsServer: string
  /** The network the edge is reached on. `manifest-platform`, as the sign-in probe's. */
  network?: string
  /** The daemon's image. `LOAD_GENERATOR_IMAGE`, which `make seed` builds. */
  image?: string
  /**
   * WHATEVER HAPPENS, THE CONTAINER IS GONE THIS LONG AFTER `start()` (Decision 7: eight minutes). It bounds the wait for
   * `go()`, the phases and the report together; phases that cannot fit are refused before anything is created.
   */
  hardStopMs?: number
}

/**
 * The generator's image: vegeta's release binary on the mirrored alpine, BUILT HERE by `make seed`
 * (`infra/seed/build-vegeta.sh`) into the Docker daemon's own store — where the Engine API creates a container from —
 * never under `127.0.0.1:7107/local/`, which `scripts/app-images.sh` sweeps. Its version is `infra/vegeta/vegeta.lock`'s
 * (`load.test.ts` holds the two equal).
 */
export const LOAD_GENERATOR_IMAGE = 'manifest/vegeta:12.13.0'

/** The label the boot's pass 2⅞ finds a generator a dead run left behind by (Decision 13). */
export const LOAD_REHEARSAL_LABEL = 'manifest.load-rehearsal'

const PLATFORM_NETWORK = 'manifest-platform'
const EIGHT_MINUTES = 8 * 60_000
/** The seconds the container is given, after its last phase, to build and print its report. */
const REPORT_SECONDS = 15
const MiB = 1024 * 1024
/**
 * The results' tmpfs. A result is ~260 bytes with `-max-body=0` ([M3b]: 2,589 bytes for ten), so the synchronised profile's
 * ~19,500 requests are ~5 MiB; 128 MiB is room for twenty times that. It counts against the container's 512 MiB.
 */
const RESULTS_TMPFS = 'rw,noexec,nosuid,size=128m,mode=1777'

/**
 * THE CONTAINER'S SCRIPT, busybox `sh` (`[M3]`: alpine 3.22's busybox v1.37.0 has every applet it uses).
 *
 * It writes the targets file (the paths round robin, vegeta's own order), waits for `/work/go` — at most
 * `GO_WAIT_SECONDS`, then it says so in its one line and exits 3 — runs each phase in turn, and prints the line.
 * `-redirects=-1`: a `302` to the IdP is the app's answer, never followed (Decision 4). `-max-body=0`: no body kept
 * (the second review's M6). `-root-certs=/ca.crt`: the platform CA is the only root.
 *
 * THE FOLD: per path, per status code, and the timeouts — status `0` whose error is one of Go's timeout errors
 * (measured on vegeta 12.13.0: *"(Client.Timeout exceeded while awaiting headers)"*) — read off each result's own
 * `code`, `url` and `error` fields. The error is matched on Go's own words, never on `timeout` alone: the error
 * string carries the URL, and an app's slug may contain the word.
 *
 * Written with no `${…}` and no backquote, because it is a JavaScript template.
 */
const SCRIPT = String.raw`
set -eu
cd /work
: > targets
for p in $PATHS; do printf 'GET %s%s\n\n' "$ORIGIN" "$p" >> targets; done
waited=0
while [ ! -e /work/go ]; do
  if [ "$waited" -ge "$GO_WAIT_SECONDS" ]; then
    printf '{"error":"the generator was never told to go within %s s"}\n' "$GO_WAIT_SECONDS"
    exit 3
  fi
  sleep 1
  waited=$((waited + 1))
done
names=''
for phase in $PHASES; do
  set -- $(echo "$phase" | tr ':' ' ')
  vegeta attack -name="$1" -rate="$2/s" -duration="$3"s -timeout="$TIMEOUT_MS"ms \
    -root-certs=/ca.crt -redirects=-1 -max-body=0 -targets=targets > "$1.bin"
  names="$names $1"
done
report() { vegeta report -type=json "$@" | sed 's/,"errors":\[.*\]}$/}/'; }
phases=''
files=''
sep=''
for name in $names; do
  phases="$phases$sep{\"name\":\"$name\",\"report\":$(report "$name.bin")}"
  files="$files $name.bin"
  sep=','
done
all=$(report $files)
fold=$(vegeta encode -to json $files | awk -v origin="$ORIGIN" '
{
  code = ""; url = ""; err = ""
  if (match($0, /"code":[0-9]+/)) code = substr($0, RSTART + 7, RLENGTH - 7)
  if (match($0, /"url":"[^"]*"/)) url = substr($0, RSTART + 7, RLENGTH - 8)
  if (match($0, /"error":"([^"\\]|\\.)*"/)) err = substr($0, RSTART + 9, RLENGTH - 10)
  path = (url == "") ? "?" : substr(url, length(origin) + 1)
  if (path == "") path = "/"
  if (!(path in seen)) { seen[path] = 1; order[++np] = path }
  n[path, code]++
  if (code == "0" && err ~ /Client\.Timeout exceeded|context deadline exceeded|i\/o timeout|TLS handshake timeout/) t++
}
END {
  printf "\"byPath\":{"
  for (i = 1; i <= np; i++) {
    p = order[i]
    printf "%s\"%s\":{", (i > 1 ? "," : ""), p
    first = 1
    for (k in n) {
      split(k, a, SUBSEP)
      if (a[1] == p) { printf "%s\"%s\":%d", (first ? "" : ","), a[2], n[k]; first = 0 }
    }
    printf "}"
  }
  printf "},\"timeouts\":%d", t + 0
}')
printf '{"phases":[%s],"all":%s,%s}\n' "$phases" "$all" "$fold"
`

const PATH_SHAPE = /^\/[A-Za-z0-9._~/-]*$/
const ORIGIN_SHAPE = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/
const LABEL_SHAPE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

/** Everything that reaches the container's environment and its JSON is checked here, before anything is created. */
function refuseUnloadable(
  target: LoadTarget,
  phases: LoadPhase[],
  labels: { loadRehearsalId: string },
  hardStopMs: number,
): number {
  if (!ORIGIN_SHAPE.test(target.origin)) {
    throw new Error(
      `an origin the generator cannot load: '${target.origin}' (https://<hostname>, nothing after it)`,
    )
  }
  if (target.paths.length === 0)
    throw new Error('the generator needs at least one path to load')
  for (const path of target.paths) {
    if (!PATH_SHAPE.test(path))
      throw new Error(`a path the generator cannot load: '${path}'`)
  }
  if (!Number.isInteger(target.timeoutMs) || target.timeoutMs <= 0) {
    throw new Error(
      `a request timeout must be a whole number of milliseconds above zero, not ${target.timeoutMs}`,
    )
  }
  if (phases.length === 0) throw new Error('the generator needs at least one phase')
  const names = new Set<string>()
  for (const phase of phases) {
    if (names.has(phase.name)) throw new Error(`the phase '${phase.name}' is named twice`)
    names.add(phase.name)
    if (!Number.isInteger(phase.rps) || phase.rps <= 0) {
      throw new Error(
        `the phase '${phase.name}' must ask a whole number of requests a second above zero, not ${phase.rps}`,
      )
    }
    if (!Number.isInteger(phase.seconds) || phase.seconds <= 0) {
      throw new Error(
        `the phase '${phase.name}' must last a whole number of seconds above zero, not ${phase.seconds}`,
      )
    }
  }
  if (!LABEL_SHAPE.test(labels.loadRehearsalId)) {
    throw new Error(
      `a load rehearsal id the generator cannot label with: '${labels.loadRehearsalId}'`,
    )
  }
  const loading = phases.reduce((sum, phase) => sum + phase.seconds, 0)
  const goWait = Math.floor(hardStopMs / 1000) - loading - REPORT_SECONDS
  if (goWait < 1) {
    throw new Error(
      `the phases take ${loading} s, longer than the hard stop of ${Math.floor(hardStopMs / 1000)} s allows (with ${REPORT_SECONDS} s for the report)`,
    )
  }
  return goWait
}

export function createLoadGenerator(options: LoadGeneratorOptions): LoadGenerator {
  const engine = options.engine
  const network = options.network ?? PLATFORM_NETWORK
  const image = options.image ?? LOAD_GENERATOR_IMAGE
  const hardStopMs = options.hardStopMs ?? EIGHT_MINUTES

  return {
    async removeLeft(loadRehearsalId) {
      if (!LABEL_SHAPE.test(loadRehearsalId)) {
        throw new Error(
          `a load rehearsal id the generator cannot label with: '${loadRehearsalId}'`,
        )
      }
      const filters = encodeURIComponent(
        JSON.stringify({ label: [`${LOAD_REHEARSAL_LABEL}=${loadRehearsalId}`] }),
      )
      const left =
        (await engine.get<{ Id: string }[]>(
          `/containers/json?all=true&filters=${filters}`,
        )) ?? []
      for (const container of left)
        await engine.del(`/containers/${container.Id}?force=true&v=true`)
      return left.length
    },

    async start(target, phases, labels) {
      const goWaitSeconds = refuseUnloadable(target, phases, labels, hardStopMs)
      const startedAt = Date.now()
      const created = await engine.post<{ Id: string }>('/containers/create', {
        Image: image,
        Entrypoint: ['/bin/sh'],
        Cmd: ['-c', SCRIPT],
        Env: [
          `ORIGIN=${target.origin}`,
          `PATHS=${target.paths.join(' ')}`,
          `PHASES=${phases.map((p) => `${p.name}:${p.rps}:${p.seconds}`).join(' ')}`,
          `TIMEOUT_MS=${target.timeoutMs}`,
          `GO_WAIT_SECONDS=${goWaitSeconds}`,
        ],
        Labels: { [LOAD_REHEARSAL_LABEL]: labels.loadRehearsalId },
        HostConfig: {
          NetworkMode: network,
          Dns: [options.dnsServer],
          Binds: [`${resolve(options.caCertPath)}:/ca.crt:ro`],
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges'],
          Privileged: false,
          ReadonlyRootfs: true,
          Tmpfs: { '/work': RESULTS_TMPFS },
          PidsLimit: 256,
          // No swap: a generator that swaps measures itself, not the app (an app's container may swap — [M7]'s F3).
          Memory: 512 * MiB,
          MemorySwap: 512 * MiB,
          RestartPolicy: { Name: 'no' },
        },
      })
      if (!created) {
        throw new Error(
          `no such image: ${image} — \`make seed\` builds it (infra/seed/build-vegeta.sh)`,
        )
      }
      const id = created.Id
      const remove = async (): Promise<void> => {
        try {
          await engine.del(`/containers/${id}?force=true&v=true`)
        } catch (error) {
          // Never swallowed: a generator left running would keep loading an app nobody is measuring.
          console.error(
            `launch/load: the load generator's container ${id} could not be removed: ${(error as Error).message}`,
          )
          throw error
        }
      }

      let address: string
      try {
        await engine.post(`/containers/${id}/start`)
        const inspected = await engine.get<{
          NetworkSettings?: { Networks?: Record<string, { IPAddress?: string }> }
        }>(`/containers/${id}/json`)
        address = inspected?.NetworkSettings?.Networks?.[network]?.IPAddress ?? ''
        if (address === '') {
          throw new Error(`the load generator's container has no address on ${network}`)
        }
      } catch (error) {
        await remove().catch(() => undefined) // its own failure is already logged; the cause is `error`
        throw error
      }

      const done = (async (): Promise<LoadReport> => {
        let timer: NodeJS.Timeout | undefined
        try {
          const exited = await Promise.race([
            engine.post<{ StatusCode?: number }>(`/containers/${id}/wait`),
            new Promise<'hard-stop'>((resolveStop) => {
              timer = setTimeout(
                () => resolveStop('hard-stop'),
                Math.max(0, hardStopMs - (Date.now() - startedAt)),
              )
            }),
          ])
          if (exited === 'hard-stop') {
            throw new Error(
              `the load generator did not finish within the hard stop of ${Math.floor(hardStopMs / 1000)} s`,
            )
          }
          const { stdout, stderr } = await readOutput(engine, id)
          const last = stdout.at(-1) ?? ''
          try {
            return readLoadResult(last, target, phases)
          } catch (error) {
            const code = exited?.StatusCode ?? 0
            const said = stderr.at(-1)
            throw new Error(
              `${(error as Error).message}${code === 0 ? '' : ` (its container exited ${code})`}${said ? ` — its last error line: ${said.slice(0, 300)}` : ''}`,
            )
          }
        } finally {
          clearTimeout(timer)
          await remove()
        }
      })()
      // Marked handled so a caller that has not awaited it yet cannot crash the process with an unhandled rejection;
      // `done` itself still rejects for whoever awaits it, which is where the run records the reason.
      done.catch(() => undefined)

      return {
        address,
        async go(): Promise<void> {
          const exec = await engine.post<{ Id: string }>(`/containers/${id}/exec`, {
            AttachStdout: true,
            AttachStderr: true,
            Cmd: ['touch', '/work/go'],
          })
          if (!exec)
            throw new Error(
              `the load generator's container ${id} is gone; it cannot be told to go`,
            )
          const started = await engine.stream(`/exec/${exec.Id}/start`, 'POST', {
            Detach: false,
            Tty: false,
          })
          for await (const line of demux(started as unknown as AsyncIterable<Buffer>))
            void line
          const inspected = await engine.get<{ ExitCode: number | null }>(
            `/exec/${exec.Id}/json`,
          )
          if (inspected?.ExitCode !== 0) {
            throw new Error(
              `the load generator could not be told to go: touch exited ${inspected?.ExitCode ?? 'unknown'}`,
            )
          }
        },
        done,
      }
    },
  }
}

async function readOutput(
  engine: EngineClient,
  id: string,
): Promise<{ stdout: string[]; stderr: string[] }> {
  // demux, NOT a raw read: the Engine API frames its log stream (P3 defect 52), and a line longer than 16 KiB is stored
  // in pieces that demux joins.
  const stream = await engine.stream(`/containers/${id}/logs?stdout=true&stderr=true`)
  const out = { stdout: [] as string[], stderr: [] as string[] }
  for await (const line of demux(stream as unknown as AsyncIterable<Buffer>)) {
    if (line.text.trim() !== '') out[line.stream].push(line.text)
  }
  return out
}

/** vegeta's `vegeta report -type=json`, as the container prints it (its `errors` list dropped). Latencies in nanoseconds. */
interface VegetaReport {
  latencies: { '50th': number; '95th': number; '99th': number }
  duration: number
  wait: number
  requests: number
  rate: number
  status_codes: Record<string, number>
}

/** A request is ANSWERED when its status is below 500 and is not 429 (Decision 8). vegeta's `0` is a timeout or a connection error. */
function answeredOf(codes: Record<string, number>): number {
  let answered = 0
  for (const [code, count] of Object.entries(codes)) {
    const status = Number(code)
    if (status >= 100 && status < 500 && status !== 429) answered += count
  }
  return answered
}

const ms = (ns: number): number => ns / 1e6

function vegetaReport(value: unknown, what: string): VegetaReport {
  const r = value as Partial<VegetaReport> | undefined
  if (
    typeof r !== 'object' ||
    r === null ||
    typeof r.requests !== 'number' ||
    typeof r.rate !== 'number' ||
    typeof r.duration !== 'number' ||
    typeof r.wait !== 'number' ||
    typeof r.status_codes !== 'object' ||
    r.status_codes === null ||
    typeof r.latencies?.['95th'] !== 'number'
  ) {
    throw new Error(`the load generator's result has no usable report for ${what}`)
  }
  return r as VegetaReport
}

/** The container's last stdout line → a LoadReport; anything else is an error naming what was missing. */
export function readLoadResult(
  line: string,
  target: LoadTarget,
  phases: LoadPhase[],
): LoadReport {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line) as Record<string, unknown>
  } catch {
    throw new Error(`the load generator printed no result: ${line.slice(0, 300)}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`the load generator printed no result: ${line.slice(0, 300)}`)
  }
  if (typeof parsed['error'] === 'string')
    throw new Error(`the load generator failed: ${parsed['error']}`)

  if (parsed['all'] === undefined)
    throw new Error("the load generator's result has no report of the whole run")
  const all = vegetaReport(parsed['all'], 'the whole run')
  if (typeof parsed['byPath'] !== 'object' || parsed['byPath'] === null) {
    throw new Error("the load generator's result has no byPath")
  }
  const byPath = parsed['byPath'] as Record<string, Record<string, number>>
  if (typeof parsed['timeouts'] !== 'number')
    throw new Error("the load generator's result has no timeouts")
  const timeouts = parsed['timeouts']

  const printed = Array.isArray(parsed['phases'])
    ? (parsed['phases'] as { name?: string; report?: unknown }[])
    : []
  const reports: PhaseReport[] = phases.map((phase) => {
    const found = printed.find((p) => p.name === phase.name)
    if (!found)
      throw new Error(
        `the load generator's result has no report for the phase '${phase.name}'`,
      )
    const r = vegetaReport(found.report, `the phase '${phase.name}'`)
    return {
      name: phase.name,
      asked: phase.rps,
      achieved: r.rate,
      requests: r.requests,
      answered: answeredOf(r.status_codes),
      statusCounts: r.status_codes,
      p50Ms: ms(r.latencies['50th']),
      p95Ms: ms(r.latencies['95th']),
      p99Ms: ms(r.latencies['99th']),
    }
  })

  // THE COUNTS AGREE, OR THE RESULT IS NOT BELIEVED: a fold that missed lines, or a report over the wrong files, would
  // otherwise pass as a smaller, cleaner run.
  const phaseRequests = reports.reduce((sum, p) => sum + p.requests, 0)
  if (phaseRequests !== all.requests) {
    throw new Error(
      `the phases' ${phaseRequests} requests are not the whole run's ${all.requests}`,
    )
  }
  let pathRequests = 0
  for (const [path, codes] of Object.entries(byPath)) {
    if (!target.paths.includes(path))
      throw new Error(
        `the load generator's result names a path the run did not load: '${path}'`,
      )
    for (const count of Object.values(codes)) pathRequests += count
  }
  if (pathRequests !== all.requests) {
    throw new Error(
      `the per-path counts' ${pathRequests} requests are not the whole run's ${all.requests}`,
    )
  }

  const answered = answeredOf(all.status_codes)
  return {
    phases: reports,
    p50Ms: ms(all.latencies['50th']),
    p95Ms: ms(all.latencies['95th']),
    p99Ms: ms(all.latencies['99th']),
    requests: all.requests,
    answered,
    timeouts,
    achievedRps: all.rate,
    answeredRatio: all.requests === 0 ? 0 : answered / all.requests,
    byPath,
    durationMs: ms(all.duration + all.wait),
  }
}

// --- Task 4: the profile and the judgement -------------------------------------------------------------------------

/** Every code a load rehearsal refuses with that is its own (the load rehearsal plan's Decision 6). On the wire from Task 5. */
export type LoadRehearsalCode =
  'LOAD_REHEARSAL_BUSY' | 'LOAD_REHEARSAL_RUNNING' | 'LOAD_REHEARSAL_NOT_NEEDED'

export class LoadRehearsalError extends Error {
  constructor(
    readonly code: LoadRehearsalCode,
    message: string,
  ) {
    super(message)
    this.name = 'LoadRehearsalError'
  }
}

/**
 * §24'S ARRIVAL FOR AN AUDIENCE, IN RATES (Decision 7): `synchronised` is its arrival and its stay, `steady` its ramp,
 * each phase the settings' (Decision 12). `public` is `large_course`'s on a laptop — the stated cap — and a `solo` or
 * `class` app has no load rehearsal at all: §24 gives neither a load gate.
 */
export function phasesFor(
  audience: Pick<StoredAudience, 'scale' | 'burst'>,
  settings: Pick<LoadRehearsalSettings, 'synchronised' | 'steady'>,
): LoadPhase[] {
  if (audience.scale !== 'large_course' && audience.scale !== 'public')
    throw new LoadRehearsalError(
      'LOAD_REHEARSAL_NOT_NEEDED',
      `a load rehearsal is for an app whose audience is a large course or the public; this app's is ${
        audience.scale === 'class' ? 'one class' : 'its owner alone'
      }, so its launch does not ask for one and nothing was started`,
    )
  if (audience.burst === 'synchronised') {
    const [arrive, sustain] = settings.synchronised
    return [
      { name: 'arrive', ...arrive! },
      { name: 'sustain', ...sustain! },
    ]
  }
  return settings.steady.map((phase, index) => ({
    name: `ramp-${index + 1}` as LoadPhase['name'],
    ...phase,
  }))
}

/**
 * THE PATHS A CROWD ASKS FOR FIRST (Decision 4): the app's front page, its health path, and — for a CWL app — the
 * skeleton's `/login`, its sign-in redirect, never followed (each `/login` writes a sign-in request to the app's own
 * database, as a real arrival's does). Each once, in that order.
 */
export function loadPathsFor(staging: {
  health: string
  auth?: { provider: 'cwl' | 'none' } | undefined
}): string[] {
  const paths = ['/', staging.health]
  if (staging.auth?.provider === 'cwl') paths.push('/login')
  return [...new Set(paths)]
}

/** What the run's watch saw of the granted set while the load ran (Decision 8). */
export interface Watched {
  /** Members that exited — or were gone — at any poll. */
  exits: number
  /** Any member ran out of memory (`InstanceStatus.outOfMemory`: the grant starts fresh members, so "during this run"). */
  outOfMemory: boolean
  /** Any member was running and not healthy at any poll. */
  unhealthy: boolean
}

/** A share as a person reads it: one decimal, never rounded UP past a mark (98.96% is 98.9%, not 99%). */
const percent = (ratio: number): string =>
  `${String(Math.floor(ratio * 1000 + 1e-9) / 10)}%`
/** Milliseconds as seconds, to two decimals at most. */
const seconds = (ms: number): string => String(Math.round(ms / 10) / 100)
const oneDecimal = (n: number): string => String(Math.round(n * 10) / 10)

/**
 * DID IT PASS? §24's pass mark, every rule, in its order — and a failure names the FIRST rule it broke, with the
 * number (Decision 8; Review Focus 2 and 5):
 *
 * 1. **At least the mark's share of requests answered** — a status below 500 that is not `429`, in time; the report's
 *    own count (`readLoadResult`), never recounted here. A run that sent nothing has answered nothing.
 * 2. **The 95th percentile UNDER the mark** — exactly the mark is not under it.
 * 3. **Each phase at least nine-tenths of its rate** — vegeta's own achieved rate; a run the generator could not drive
 *    measures the generator, so it is a failure, never a pass.
 * 4. **Every instance healthy throughout, with no exit and no out-of-memory exit** — the most specific first: out of
 *    memory (an exit too), then an exit, then a member running unhealthy.
 */
export function judge(
  report: LoadReport,
  watched: Watched,
  phases: LoadPhase[],
  mark: LoadRehearsalSettings['pass'],
): { passed: boolean; reason: string } {
  const ratio = report.requests === 0 ? 0 : report.answered / report.requests
  if (report.requests === 0 || ratio < mark.answeredRatio)
    return {
      passed: false,
      reason: `${percent(ratio)} of requests were answered (${report.answered} of ${report.requests}); the mark is ${percent(mark.answeredRatio)}`,
    }
  if (report.p95Ms >= mark.p95Ms)
    return {
      passed: false,
      reason: `p95 was ${seconds(report.p95Ms)} s; the mark is under ${seconds(mark.p95Ms)} s`,
    }
  for (const phase of phases) {
    const reached = report.phases.find((p) => p.name === phase.name)
    const achieved = reached?.achieved ?? 0
    if (achieved < mark.achievedRatio * phase.rps)
      return {
        passed: false,
        reason: `the generator reached ${oneDecimal(achieved)} of ${phase.rps} requests a second in its '${phase.name}' phase, under nine-tenths of the rate asked — a run it could not drive measures the generator, not the app`,
      }
  }
  if (watched.outOfMemory)
    return { passed: false, reason: 'an instance ran out of memory during the run' }
  if (watched.exits > 0)
    return {
      passed: false,
      reason:
        watched.exits === 1
          ? 'an instance exited during the run'
          : `${watched.exits} instances exited during the run`,
    }
  if (watched.unhealthy)
    return { passed: false, reason: 'an instance was unhealthy during the run' }
  return {
    passed: true,
    reason: `${percent(ratio)} of requests answered, p95 ${seconds(report.p95Ms)} s, at ${oneDecimal(report.achievedRps)} requests a second; every instance stayed healthy`,
  }
}
