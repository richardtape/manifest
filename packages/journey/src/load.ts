import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { get as httpGet } from 'node:http'
import { Agent, request } from 'node:https'
import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  subscribe,
  unwrap,
  type ErrorEnvelope,
  type ManifestClient,
  type Schemas,
  type StreamFrame,
} from '@manifest/contract'
import { Checks, JourneyStop } from './check.js'
import { resetCode, resetSafeFetch } from './edge-reset.js'
import { describeSeen, seeEveryMember } from './serving-set.js'

/**
 * THE LOAD REHEARSAL PLAN'S ACCEPTANCE DEMO (Task 8a), `make demo-load`: a `large_course` app is rehearsed under its
 * audience's arrival and passes — staging given production's three instances for the run and its own one back — and a
 * new candidate that cannot take the crowd fails, naming the rule it broke and the number; and the platform's
 * refusals on the way. Through the edge, by nothing but the generated client (and `docker inspect` and the edge's
 * admin API, which read what the platform built rather than asking it).
 *
 *   node packages/journey/dist/load.js <phase> <state.json>
 *
 * The phases, because signing in and stepping up are a browser's round trips at the IdP and that is bash's business
 * (P5a Decision 38) — and a step-up lasts ten minutes, so `scripts/demo-load.sh` steps the owner up right before each
 * rehearsal:
 *
 *   find       MANIFEST_SESSION            is the project here from an earlier run?
 *   clear      MANIFEST_SESSION_STEPPED    deletes it — this demo launches nothing, so every run makes its app afresh
 *   app        MANIFEST_SESSION            steps 1–2: the app, staged; the item; a token and an un-stepped session refused
 *   pass       MANIFEST_SESSION_STEPPED    steps 3–4: the rehearsal, refused-under, passed; staging given back; the item met
 *   candidate  MANIFEST_SESSION            step 5: the app made to fall over, committed — a new candidate, the item unmet
 *   fallover   MANIFEST_SESSION_STEPPED    step 6: the rehearsal fails, naming the answered share; staging given back
 *
 * **THE APP** is `fixtures/load-app/` — `load-<driver>` — whose committed `load-app.json` decides whether it falls over:
 * a commit, so a new image and a new candidate. **`MANIFEST_STOP_AFTER=<1–6>`** ends the run after that step — a
 * negative control's short run. **A run is about thirteen minutes at §24's profile** (two rehearsals of ~6 minutes, and
 * the builds); a control's shorter profile is the control plane's setting (`MANIFEST_LOAD_SYNCHRONISED`), never this
 * demo's — every number it holds a run to is the run's own record.
 */

const PHASES = ['find', 'clear', 'app', 'pass', 'candidate', 'fallover'] as const
type Phase = (typeof PHASES)[number]

/** The app's files — `fixtures/load-app/`. */
const FIXTURE = new URL('../../../fixtures/load-app/', import.meta.url)
/** Past the builder's own 900 s timeout, as the journey's bound is. */
const BUILD_ENDS_WITHIN_MS = 960_000
/** The run's hard stop is 8 minutes, the grant and the take-down a few seconds each: 12 is past anything but a hang. */
const RUN_ENDS_WITHIN_MS = 12 * 60_000
/** The grant is read back within seconds (B sitting 1: a production-shaped set in 3.6 s). */
const GRANTED_WITHIN_MS = 120_000
/** The internal listener: staging answers here, never on the public one. */
const INTERNAL_EDGE = '127.0.0.2'
/** The edge's admin API on the host (`MANIFEST_CADDY_ADMIN_URL`'s default). */
const CADDY_ADMIN = process.env.MANIFEST_CADDY_ADMIN_URL ?? 'http://127.0.0.1:7119'
/** The route's own limit — §20's per-IP rate limit, 600 a minute (`routing/caddy.ts`). */
const RATE_LIMIT = 600
/** Staging's memory, the blueprint's 512Mi — and production's, `fixtures/load-app/manifest.yaml`'s 640Mi. */
const STAGING_MEMORY_BYTES = 512 * 1024 * 1024
const PRODUCTION_MEMORY = '640Mi'
const PRODUCTION_MEMORY_BYTES = 640 * 1024 * 1024
/** Production's count for a `large_course` audience (§24). */
const LARGE_COURSE_INSTANCES = 3

interface LoadState {
  driver?: string
  slug?: string
  runId?: string
  existing?: 'none' | 'here'
  projectId?: string
  stagingEnvironmentId?: string
  stagingHost?: string
  /** The release that passes, and its run. */
  releasePass?: string
  digestPass?: string
  runPass?: string
  /** The release that falls over, and its run. */
  releaseFall?: string
  runFall?: string
  stopped?: boolean
}

const [phaseArg, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
if (!PHASES.includes(phaseArg as Phase) || statePath === undefined) {
  console.error(`usage: load.js <${PHASES.join('|')}> <state.json>`)
  process.exit(2)
}
const phase = phaseArg as Phase
const path: string = statePath
const stopAfter =
  process.env.MANIFEST_STOP_AFTER === undefined || process.env.MANIFEST_STOP_AFTER === ''
    ? undefined
    : Number(process.env.MANIFEST_STOP_AFTER)

const checks = new Checks()
const state: LoadState = (() => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as LoadState
  } catch {
    return {}
  }
})()

function save(): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
}

/** Quiet when it is set, and a stop when it is unset or empty. */
function env(variable: string): string {
  const value = process.env[variable]
  if (value !== undefined && value !== '') return value
  return checks.must<string>(`${variable} was provided`, undefined)
}

/** A value an earlier phase wrote: silent when it is there, a stop naming it when it is not. */
function need<T>(what: string, value: T | undefined | null): T {
  return value === undefined || value === null ? checks.must(what, value) : value
}

/** Ends the run after step `n` when the caller asked it to. The bash script reads `stopped`. */
function done(n: number): void {
  if (stopAfter === undefined || n < stopAfter) return
  state.stopped = true
  save()
  console.log(`\n(stopped after step ${n}, as MANIFEST_STOP_AFTER asked)`)
  checks.finish()
}

/** Every read through the edge survives §11's reset once — a rehearsal moves staging's route twice (`edge-reset.ts`). */
function clientFor(variable: string): ManifestClient {
  return createManifestClient({ origin, session: env(variable), fetch: resetSafeFetch })
}

const projectId = (): string => need('the project, from step 1', state.projectId)
const stagingId = (): string => need('staging, from step 1', state.stagingEnvironmentId)
const stagingHost = (): string =>
  need('staging’s hostname, from step 1', state.stagingHost)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The refusal's envelope when it is exactly this status AND this code; else undefined. */
function refusal(
  result: { error?: unknown; response: Response },
  status: number,
  code: string,
): ErrorEnvelope['error'] | undefined {
  const envelope = result.error as ErrorEnvelope | undefined
  if (result.response.status !== status || envelope?.error?.code !== code)
    return undefined
  return envelope.error
}

function describe(result: { error?: unknown; response: Response }): string {
  const envelope = result.error as ErrorEnvelope | undefined
  return `${result.response.status} ${envelope?.error?.code ?? '(no envelope)'}: ${envelope?.error?.message ?? ''}`
}

/** Today in Vancouver in words, exactly as the platform writes a day (`vancouverDayInWords`). */
function todayInWords(): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'long',
    timeZone: 'America/Vancouver',
  }).format(new Date())
}

function fixture(file: string): string {
  return readFileSync(new URL(file, FIXTURE), 'utf8')
}

/** The app's `manifest.yaml`, with this project's slug as its name — §7 refuses any other. */
function appManifest(slug: string): string {
  const source = fixture('manifest.yaml')
  if (
    !/^name: load-app$/m.test(source) ||
    !/^ {6}memory: 640Mi$/m.test(source) ||
    !/^ {2}provider: cwl$/m.test(source)
  )
    throw new JourneyStop(
      'the fixture manifest.yaml has no `name: load-app`, no production memory of 640Mi, or is not a CWL app',
    )
  return source.replace(/^name: load-app$/m, `name: ${slug}`)
}

/** `load-app.json` as committed: the fixture's own (`fallOver: false`), or the switch thrown. */
function loadAppJson(fallOver: boolean): string {
  const source = fixture('load-app.json')
  if (source !== '{ "fallOver": false }\n')
    throw new JourneyStop(
      'the fixture load-app.json is not exactly { "fallOver": false }',
    )
  return fallOver ? '{ "fallOver": true }\n' : source
}

// ─── the platform's API ─────────────────────────────────────────────────────────────────

async function headCommit(client: ManifestClient): Promise<string> {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId: projectId() } },
    }),
    'getTree',
  ).commitSha
}

async function commit(
  client: ManifestClient,
  message: string,
  changes: Schemas['CreateCommitRequest']['changes'],
): Promise<Schemas['CommitOutcome']> {
  const base = await headCommit(client)
  return unwrap(
    await client.POST('/v1/projects/{projectId}/commits', {
      params: {
        path: { projectId: projectId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { baseCommit: base, message, changes },
    }),
    'createCommit',
  )
}

/** A build of `commitSha`, waited for, released and deployed to staging — healthy — or a stop naming what failed. */
async function stage(
  client: ManifestClient,
  commitSha: string,
  summary: string,
): Promise<{ release: Schemas['Release']; instance: Schemas['Instance'] }> {
  const started = unwrap(
    await client.POST('/v1/projects/{projectId}/builds', {
      params: {
        path: { projectId: projectId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { commitSha },
    }),
    'startBuild',
  )
  const t0 = Date.now()
  let build = started
  while (build.status !== 'succeeded' && build.status !== 'failed') {
    if (Date.now() - t0 > BUILD_ENDS_WITHIN_MS) break
    await sleep(2_000)
    build = unwrap(
      await client.GET('/v1/builds/{buildId}', {
        params: { path: { buildId: started.id } },
      }),
      'getBuild',
    )
  }
  console.log(`  (build ${build.status} in ${Date.now() - t0} ms)`)
  checks.must(
    'the build succeeded, with a digest',
    build.status === 'succeeded' && build.imageDigest ? build : undefined,
    `${build.status}: ${build.error ?? ''}`,
  )
  const release = unwrap(
    await client.POST('/v1/projects/{projectId}/releases', {
      params: {
        path: { projectId: projectId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { buildId: build.id, summary },
    }),
    'createRelease',
  )
  const instance = unwrap(
    await client.POST('/v1/environments/{environmentId}/deploy', {
      params: {
        path: { environmentId: stagingId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { releaseId: release.id },
    }),
    'deploy',
  )
  checks.must(
    'staging is healthy on it',
    instance.state === 'healthy' ? instance : undefined,
    instance.state,
  )
  return { release, instance }
}

async function staging(client: ManifestClient): Promise<Schemas['Environment']> {
  return unwrap(
    await client.GET('/v1/environments/{environmentId}', {
      params: { path: { environmentId: stagingId() } },
    }),
    'getEnvironment',
  )
}

async function loadItem(client: ManifestClient): Promise<Schemas['LaunchReadinessItem']> {
  const readiness = unwrap(
    await client.GET('/v1/projects/{projectId}/launch-readiness', {
      params: { path: { projectId: projectId() } },
    }),
    'getLaunchReadiness',
  )
  return checks.must(
    'the checklist has its load-rehearsal item',
    readiness.items.find((i) => i.id === 'load-rehearsal'),
    readiness.items.map((i) => i.id).join(', '),
  )
}

async function runs(client: ManifestClient): Promise<Schemas['LoadRehearsal'][]> {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/load-rehearsals', {
      params: { path: { projectId: projectId() } },
    }),
    'listLoadRehearsals',
  ).loadRehearsals
}

async function run(
  client: ManifestClient,
  id: string,
): Promise<Schemas['LoadRehearsal']> {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/load-rehearsals/{loadRehearsalId}', {
      params: { path: { projectId: projectId(), loadRehearsalId: id } },
    }),
    'getLoadRehearsal',
  )
}

const startRun = (client: ManifestClient) =>
  client.POST('/v1/projects/{projectId}/load-rehearsal', {
    params: {
      path: { projectId: projectId() },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
  })

/** Polls the run at its own `pollAfterSeconds` until `until` holds of it, or `withinMs` passes. */
async function pollRun(
  client: ManifestClient,
  first: Schemas['LoadRehearsal'],
  until: (r: Schemas['LoadRehearsal']) => boolean,
  withinMs: number,
): Promise<Schemas['LoadRehearsal']> {
  const deadline = Date.now() + withinMs
  let current = first
  while (!until(current) && Date.now() < deadline) {
    await sleep(Math.min(current.pollAfterSeconds ?? 5, 10) * 1000)
    current = await run(client, first.id)
  }
  return current
}

/**
 * THE RUN'S `load_rehearsal.completed`, from the project's stream's replay — exactly one for this run. Read AFTER the
 * run, because a rehearsal moves staging's route twice and the edge's reload closes a WebSocket it carries (§11): a
 * subscription held across the run would see its stream end, not the event.
 */
async function completedEvents(
  session: string,
  runId: string,
): Promise<Extract<StreamFrame, { kind: 'event' }>[]> {
  const frames: StreamFrame[] = []
  const stream = subscribe({
    origin,
    session,
    projectId: projectId(),
    onFrame: (f) => frames.push(f),
  })
  try {
    await stream.ready
  } finally {
    stream.close()
  }
  return frames.filter(
    (f): f is Extract<StreamFrame, { kind: 'event' }> =>
      f.kind === 'event' &&
      f.type === 'load_rehearsal.completed' &&
      (f.machineDetail as { loadRehearsalId?: string }).loadRehearsalId === runId,
  )
}

// ─── what the platform built, read outside the API ──────────────────────────────────────

function docker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim()
}

/** An instance's container's memory limit, `HostConfig.Memory`, in bytes — what Docker was told to give it. */
function memoryOf(instanceId: string): number | undefined {
  const container = docker([
    'ps',
    '-aq',
    '--filter',
    `label=manifest.instance=${instanceId}`,
  ]).split('\n')[0]
  if (container === undefined || container === '') return undefined
  return Number(docker(['inspect', '--format', '{{.HostConfig.Memory}}', container]))
}

/** The generator's containers left for a run — by its label (`manifest.load-rehearsal`); a run removes its own. */
function generatorsOf(runId: string): string[] {
  const out = docker(['ps', '-aq', '--filter', `label=manifest.load-rehearsal=${runId}`])
  return out === '' ? [] : out.split('\n')
}

/**
 * A GET of the edge's admin API by `node:http`, never `fetch`: Caddy refuses a request carrying an `Origin`, and Node's
 * `fetch` sends one (`routing/caddy.ts`'s `adminRequest` says why, measured). The body, or undefined for any non-200.
 */
function adminGet(pathname: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    httpGet(new URL(pathname, CADDY_ADMIN), (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (text += chunk))
      res.on('end', () => resolve(res.statusCode === 200 ? text : undefined))
    }).on('error', reject)
  })
}

interface EdgeZone {
  match?: {
    remote_ip?: { ranges?: string[] }
    not?: { remote_ip?: { ranges?: string[] } }[]
  }[]
  max_events?: number
}

/**
 * STAGING'S RATE LIMIT AS THE EDGE HOLDS IT — every zone of every `rate_limit` handler on the route for staging's
 * hostname, read from the edge's admin API. Each zone's ranges the limit skips (`not remote_ip`), and its limit.
 */
async function stagingLimit(): Promise<
  { exempt: string[]; limits: number[] } | undefined
> {
  const text = await adminGet('/config/apps/http/servers')
  if (text === undefined) return undefined
  const servers = JSON.parse(text) as Record<
    string,
    {
      routes?: {
        match?: { host?: string[] }[]
        handle?: { handler?: string; rate_limits?: Record<string, EdgeZone> }[]
      }[]
    }
  >
  for (const server of Object.values(servers))
    for (const route of server.routes ?? []) {
      if (!(route.match ?? []).some((m) => (m.host ?? []).includes(stagingHost())))
        continue
      const zones = (route.handle ?? [])
        .filter((h) => h.handler === 'rate_limit')
        .flatMap((h) => Object.values(h.rate_limits ?? {}))
      return {
        exempt: zones.flatMap((z) =>
          (z.match ?? []).flatMap((m) =>
            (m.not ?? []).flatMap((n) => n.remote_ip?.ranges ?? []),
          ),
        ),
        limits: zones.map((z) => z.max_events ?? 0),
      }
    }
  return undefined
}

interface Answer {
  status: number
  instance: string | undefined
  body: string
}

/**
 * One GET of staging through the INTERNAL listener, its hostname as SNI and Host. A fresh socket unless `agent` is
 * given (P6a F2: a pooled one answers from the wrong address) — and asked again ONCE when the edge's reload reset it.
 */
async function probe(pathname: string, agent?: Agent): Promise<Answer> {
  try {
    return await probeOnce(pathname, agent)
  } catch (error) {
    const code = resetCode(error)
    if (code === undefined) throw error
    console.log(`  (a probe met the edge's reset, ${code}, and was asked again)`)
    return probeOnce(pathname, agent)
  }
}

function probeOnce(pathname: string, agent?: Agent): Promise<Answer> {
  const name = stagingHost()
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: name,
        servername: name,
        path: pathname,
        agent: agent ?? false,
        lookup: (_host, options, callback) =>
          options.all
            ? (callback as (e: null, a: { address: string; family: number }[]) => void)(
                null,
                [{ address: INTERNAL_EDGE, family: 4 }],
              )
            : (callback as (e: null, a: string, f: number) => void)(
                null,
                INTERNAL_EDGE,
                4,
              ),
        timeout: 10_000,
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (body += chunk))
        res.on('end', () => {
          const header = res.headers['x-manifest-instance']
          resolve({
            status: res.statusCode ?? 0,
            instance: Array.isArray(header) ? header[0] : header,
            body: body.slice(0, 300),
          })
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error(`${name} did not answer in 10 s`)))
    req.on('error', reject)
    req.end()
  })
}

/** Staging serves exactly `set` through the edge — each member answering `/healthz` as the app — and nothing else. */
async function servesAs(set: readonly string[], what: string): Promise<void> {
  const seen = await seeEveryMember(
    () => probe('/healthz'),
    set,
    (answer) => answer.status === 200 && answer.body.includes('"mongo":true'),
  )
  checks.ok(
    `${what}: staging answers through the edge as exactly [${set.join(', ')}]`,
    seen.ok,
    describeSeen(set, seen),
  )
}

/**
 * STAGING'S OWN SHAPE, BACK: one instance, healthy, not one of the granted set, at staging's memory — Docker's
 * `HostConfig.Memory`, which the granted members had at production's — serving through the edge; no generator left;
 * and the route's limit back for everyone: no address skipped, and a 601st request in a minute from one address `429`.
 */
async function givenBack(
  client: ManifestClient,
  ended: Schemas['LoadRehearsal'],
  what: string,
): Promise<void> {
  const back = await staging(client)
  const one = back.instances[0]
  checks.ok(
    `${what}: staging is back to ONE instance, healthy`,
    back.instances.length === 1 && one?.state === 'healthy',
    back.instances.map((m) => `${m.id} ${m.state}`).join(', '),
  )
  if (one === undefined) return
  checks.ok(
    `${what}: a fresh instance, not one of the ${ended.granted?.count ?? 0} granted`,
    !(ended.granted?.instanceIds ?? []).includes(one.id),
    one.id,
  )
  const memory = memoryOf(one.id)
  checks.ok(
    `${what}: at staging’s own memory — HostConfig.Memory ${STAGING_MEMORY_BYTES} (512Mi), not production’s ${PRODUCTION_MEMORY_BYTES}`,
    memory === STAGING_MEMORY_BYTES,
    String(memory),
  )
  await servesAs([one.id], what)
  const left = generatorsOf(ended.id)
  checks.ok(
    `${what}: the generator’s container is gone`,
    left.length === 0,
    left.join(', '),
  )
  const limit = await stagingLimit()
  checks.ok(
    `${what}: the edge’s route for ${stagingHost()} limits every address again — no range skipped, ${RATE_LIMIT} a minute`,
    limit !== undefined &&
      limit.exempt.length === 0 &&
      limit.limits.length > 0 &&
      limit.limits.every((l) => l === RATE_LIMIT),
    JSON.stringify(limit),
  )
}

/**
 * §20'S LIMIT, FROM THE OUTSIDE: requests from this one address, one after another on one connection, until the edge
 * answers `429` — which must come by the 601st, and not before ~590 (the window also holds the few requests this demo
 * sent staging in the last minute). The demo's LAST request to staging: it spends the minute.
 */
async function limitedAt(): Promise<{ first429: number | undefined; statuses: string }> {
  const agent = new Agent({ keepAlive: true, maxSockets: 1 })
  const counts: Record<number, number> = {}
  let first429: number | undefined
  try {
    for (let n = 1; n <= RATE_LIMIT + 1; n += 1) {
      const answer = await probe('/healthz', agent)
      counts[answer.status] = (counts[answer.status] ?? 0) + 1
      if (answer.status === 429) {
        first429 = n
        break
      }
    }
  } finally {
    agent.destroy()
  }
  return {
    first429,
    statuses: Object.entries(counts)
      .map(([s, c]) => `${s}×${c}`)
      .join(' '),
  }
}

/** The run's evidence on one line, as a person reads it. */
function evidenceLine(r: Schemas['LoadRehearsal']): string {
  const e = r.evidence
  if (e === null) return '(no evidence)'
  const phases = (e.phases ?? [])
    .map(
      (p) =>
        `${p.name} ${p.achieved.toFixed(2)}/${p.asked}/s ${p.answered}/${p.requests}`,
    )
    .join(', ')
  return `${e.answered ?? '?'}/${e.requests ?? '?'} answered, p50 ${e.p50Ms ?? '?'} / p95 ${e.p95Ms ?? '?'} / p99 ${e.p99Ms ?? '?'} ms, ${phases}; exits ${e.instanceExits ?? '?'}, out of memory ${String(e.outOfMemory)}, unhealthy ${String(e.unhealthy)}; byPath ${JSON.stringify(e.byPath ?? {})}`
}

/** Seconds between two of a run's own timestamps. */
const secondsBetween = (from: string, to: string | null) =>
  to === null ? '?' : ((Date.parse(to) - Date.parse(from)) / 1000).toFixed(1)

// ─── find, clear ───────────────────────────────────────────────────────────────────────

async function findPhase(): Promise<void> {
  checks.step('1. The instructor’s app — here from an earlier run, or not')
  const owner = clientFor('MANIFEST_SESSION')
  const me = unwrap(await owner.GET('/v1/me'), 'getMe')
  checks.ok('signed in as the instructor', me.puid === 'ins000001', me.puid)
  state.slug = env('MANIFEST_SLUG')
  state.driver = env('MANIFEST_DRIVER')
  state.runId = env('MANIFEST_RUN_ID')
  const found = unwrap(await owner.GET('/v1/projects'), 'listProjects').find(
    (p) => p.slug === state.slug,
  )
  if (found === undefined) {
    state.existing = 'none'
    console.log(`  ${state.slug} is not here — the FRESH path`)
  } else {
    state.projectId = found.id
    state.existing = 'here'
    console.log(
      `  ${state.slug} is here from an earlier run — the RE-USE path: it is deleted, with what its rehearsals recorded, and made again`,
    )
  }
  save()
}

async function clearPhase(): Promise<void> {
  checks.step('1. The app an earlier run left is deleted')
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const deleted = await owner.DELETE('/v1/projects/{projectId}', {
    params: {
      path: { projectId: projectId() },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
  })
  checks.must(
    `${state.slug} deleted — it never launched`,
    deleted.response.status === 200 ? true : undefined,
    describe(deleted),
  )
  delete state.projectId
  state.existing = 'none'
  save()
}

// ─── app: steps 1–2 ────────────────────────────────────────────────────────────────────

async function appPhase(): Promise<void> {
  const slug = need('the slug, from find', state.slug)
  checks.step(
    `1. The instructor creates ${slug} for a large course, commits the app, and stages it`,
  )
  const owner = clientFor('MANIFEST_SESSION')
  const created = unwrap(
    await owner.POST('/v1/projects', {
      params: { header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        slug,
        name: 'Course notices',
        blueprint: 'node-ts-mongo@1',
        audience: {
          scale: 'large_course',
          burst: 'synchronised',
          justification:
            'The load rehearsal’s acceptance — a large course reads its notices the minute an assignment is released',
        },
      },
    }),
    'createProject',
  )
  state.projectId = created.id
  checks.ok(
    `created on driver ${state.driver === 'local' ? 1 : 2} (${state.driver}), a large course arriving at once`,
    created.repository?.provider === state.driver &&
      created.audience?.scale === 'large_course' &&
      created.audience.burst === 'synchronised',
    `${JSON.stringify(created.repository)} ${JSON.stringify(created.audience)}`,
  )
  const environments = unwrap(
    await owner.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId: created.id } },
    }),
    'listEnvironments',
  )
  const stagingEnvironment = checks.must(
    'a staging environment',
    environments.find((e) => e.kind === 'staging'),
  )
  state.stagingEnvironmentId = stagingEnvironment.id
  state.stagingHost = stagingEnvironment.hostname
  save()

  const written = await commit(
    owner,
    'Course notices: the front page a large course reads at once',
    [
      { op: 'write', path: 'manifest.yaml', content: appManifest(slug) },
      { op: 'write', path: 'server.js', content: fixture('server.js') },
      { op: 'write', path: 'load-app.json', content: loadAppJson(false) },
    ],
  )
  checks.ok(
    'the app committed, and its manifest.yaml is valid',
    written.spec.appSpecId !== null,
    JSON.stringify(written.spec).slice(0, 300),
  )
  const { release, instance } = await stage(
    owner,
    checks.must('the commit', written.commitSha),
    'Course notices — the launch candidate',
  )
  state.releasePass = release.id
  state.digestPass = release.imageDigest
  save()
  const front = await probe('/')
  const login = await probe('/login')
  checks.ok(
    `${stagingHost()} answers as the app, the instance the deploy started: / 200, /login 302`,
    front.status === 200 &&
      front.instance === instance.id &&
      front.body.includes('Course notices') &&
      login.status === 302,
    `/ ${front.status} ${front.instance} ${front.body.slice(0, 80)}; /login ${login.status}`,
  )
  const serving = await staging(owner)
  checks.ok(
    'staging serves ONE instance before any rehearsal',
    serving.instances.length === 1 && serving.instances[0]?.id === instance.id,
    serving.instances.map((m) => m.id).join(', '),
  )
  const memory = memoryOf(instance.id)
  checks.ok(
    `staging’s instance has staging’s memory — HostConfig.Memory ${STAGING_MEMORY_BYTES} (512Mi)`,
    memory === STAGING_MEMORY_BYTES,
    String(memory),
  )
  const item = await loadItem(owner)
  checks.ok(
    'the checklist’s load-rehearsal item is unmet and blocking: “This app has not been rehearsed yet”',
    item.state === 'unmet' &&
      item.blocking &&
      item.why.includes('This app has not been rehearsed yet') &&
      item.why.includes('runLoadRehearsal'),
    `${item.state} ${String(item.blocking)}: ${item.why}`,
  )
  done(1)

  checks.step('2. Who may not run it: an agent’s token, and the owner not stepped up')
  const minted = unwrap(
    await owner.POST('/v1/projects/{projectId}/tokens', {
      params: {
        path: { projectId: projectId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {
        name: `load agent ${state.runId}`,
        capabilities: ['project:read', 'launch:draft'],
        expiresInDays: 1,
      },
    }),
    'mintToken',
  )
  const agent = createManifestClient({
    origin,
    token: minted.secret,
    fetch: resetSafeFetch,
  })
  try {
    const byToken = await startRun(agent)
    checks.ok(
      'the owner’s token is refused: 403 TOKEN_CREDENTIAL_REFUSED — a person runs it',
      refusal(byToken, 403, 'TOKEN_CREDENTIAL_REFUSED') !== undefined,
      describe(byToken),
    )
  } finally {
    const revoked = await owner.DELETE('/v1/tokens/{tokenId}', {
      params: {
        path: { tokenId: minted.token.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    })
    checks.ok(
      'the token revoked',
      revoked.response.status === 200 || revoked.response.status === 204,
      describe(revoked),
    )
  }
  const unstepped = await startRun(owner)
  checks.ok(
    'the owner not stepped up is refused: 403 STEP_UP_REQUIRED',
    refusal(unstepped, 403, 'STEP_UP_REQUIRED') !== undefined,
    describe(unstepped),
  )
  const none = await runs(owner)
  checks.ok('nothing was started by either', none.length === 0, String(none.length))
  done(2)
}

// ─── pass: steps 3–4 ───────────────────────────────────────────────────────────────────

async function passPhase(): Promise<void> {
  checks.step(
    '3. The owner, stepped up, runs the load rehearsal — staging is the run’s while it lasts',
  )
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const release = need('the candidate, from step 1', state.releasePass)
  const started = await startRun(owner)
  const record = checks.must(
    'answered at once: 202, the run’s record in state running',
    started.response.status === 202 && started.data?.state === 'running'
      ? started.data
      : undefined,
    started.data === undefined
      ? describe(started)
      : JSON.stringify(started.data).slice(0, 300),
  )
  state.runPass = record.id
  save()
  const asked = record.profile.phases.reduce((n, p) => n + p.rps * p.seconds, 0)
  console.log(
    `  profile: ${record.profile.phases.map((p) => `${p.name} ${p.rps}/s × ${p.seconds} s`).join(', ')} — ${asked} requests over ${record.profile.paths.join(' ')}; pass: ${record.profile.pass.answeredRatio} answered, p95 under ${record.profile.pass.p95Ms} ms`,
  )
  checks.ok(
    'it rehearses the candidate for a large course arriving at once, polled after a few seconds',
    record.releaseId === release &&
      record.audience.scale === 'large_course' &&
      record.audience.burst === 'synchronised' &&
      record.granted === null &&
      record.evidence === null &&
      (record.pollAfterSeconds ?? 0) > 0,
    JSON.stringify({
      releaseId: record.releaseId,
      audience: record.audience,
      pollAfterSeconds: record.pollAfterSeconds,
    }),
  )

  const granted = await pollRun(
    owner,
    record,
    (r) => r.granted !== null || r.state !== 'running',
    GRANTED_WITHIN_MS,
  )
  const set = granted.granted
  checks.ok(
    `production’s shape, READ BACK: ${LARGE_COURSE_INSTANCES} instances at production’s ${PRODUCTION_MEMORY}`,
    granted.state === 'running' &&
      set !== null &&
      set.count === LARGE_COURSE_INSTANCES &&
      new Set(set.instanceIds).size === LARGE_COURSE_INSTANCES &&
      set.resources.environment === 'production' &&
      set.resources.memory === PRODUCTION_MEMORY,
    `${granted.state} ${JSON.stringify(set)} ${granted.evidence?.reason ?? ''}`,
  )
  if (granted.state === 'running' && set !== null) {
    const now = await staging(owner)
    checks.ok(
      'getEnvironment says staging serves exactly the granted set',
      now.instances.length === set.count &&
        now.instances.every((m) => set.instanceIds.includes(m.id)),
      now.instances.map((m) => `${m.id} ${m.state}`).join(', '),
    )
    const memories = set.instanceIds.map(memoryOf)
    checks.ok(
      `each granted member has production’s memory — HostConfig.Memory ${PRODUCTION_MEMORY_BYTES} (640Mi)`,
      memories.every((m) => m === PRODUCTION_MEMORY_BYTES),
      memories.join(', '),
    )
    const limit = await stagingLimit()
    checks.ok(
      'the edge skips ONE address — the generator’s, as its own /32 — and limits everyone else as before',
      limit !== undefined &&
        limit.exempt.length > 0 &&
        limit.exempt.every((r) => r.endsWith('/32')) &&
        new Set(limit.exempt).size === 1 &&
        limit.limits.every((l) => l === RATE_LIMIT),
      JSON.stringify(limit),
    )

    const deployed = await owner.POST('/v1/environments/{environmentId}/deploy', {
      params: {
        path: { environmentId: stagingId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { releaseId: release },
    })
    checks.ok(
      'a staging deploy while it runs is refused: 409 LOAD_REHEARSAL_RUNNING — nothing replaces the granted set',
      refusal(deployed, 409, 'LOAD_REHEARSAL_RUNNING') !== undefined,
      describe(deployed),
    )
    const again = await startRun(owner)
    checks.ok(
      'asked again while it runs: 409 LOAD_REHEARSAL_RUNNING',
      refusal(again, 409, 'LOAD_REHEARSAL_RUNNING') !== undefined,
      describe(again),
    )
    const d21 = await owner.POST('/v1/projects/{projectId}/rehearsal', {
      params: {
        path: { projectId: projectId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    })
    checks.ok(
      'the pre-production sign-in rehearsal while it runs: 409 LOAD_REHEARSAL_RUNNING',
      refusal(d21, 409, 'LOAD_REHEARSAL_RUNNING') !== undefined,
      describe(d21),
    )
    const item = await loadItem(owner)
    checks.ok(
      'the item says it is running now',
      item.state === 'unmet' && item.why.includes('running now'),
      `${item.state}: ${item.why}`,
    )
  }

  console.log('  (the arrival is on it — polling until the run ends, about six minutes)')
  const ended = await pollRun(
    owner,
    granted,
    (r) => r.state !== 'running',
    RUN_ENDS_WITHIN_MS,
  )
  console.log(
    `  ${ended.state} in ${secondsBetween(ended.createdAt, ended.finishedAt)} s: ${ended.evidence?.reason ?? '(no reason)'}`,
  )
  console.log(`  ${evidenceLine(ended)}`)
  // NOT a stop: whatever the run's end, staging must be given back — step 4 reads it either way.
  checks.ok(
    'the rehearsal PASSED',
    ended.state === 'passed',
    `${ended.state}: ${ended.evidence?.reason ?? ''}`,
  )
  const e = ended.evidence
  checks.ok(
    `at least ${ended.profile.pass.answeredRatio * 100}% answered and p95 under ${ended.profile.pass.p95Ms} ms, by the run’s own numbers, with every member healthy`,
    ended.state === 'passed' &&
      e !== null &&
      (e.answeredRatio ?? 0) >= ended.profile.pass.answeredRatio &&
      (e.p95Ms ?? Infinity) < ended.profile.pass.p95Ms &&
      e.instanceExits === 0 &&
      e.outOfMemory === false &&
      e.unhealthy === false &&
      e.requests === asked,
    evidenceLine(ended),
  )
  checks.ok(
    'it ended after staging was given back',
    ended.takenDownAt !== null &&
      ended.finishedAt !== null &&
      ended.pollAfterSeconds === null,
    `takenDownAt ${ended.takenDownAt} finishedAt ${ended.finishedAt}`,
  )
  done(3)

  checks.step(
    '4. Staging given back its own shape, the edge its limit — and the item met by the measurement',
  )
  await givenBack(owner, ended, 'after the pass')
  const item = await loadItem(owner)
  checks.ok(
    `the item is MET: “A load rehearsal passed on ${todayInWords()} for the release serving staging”`,
    item.state === 'met' &&
      item.why.startsWith(
        `A load rehearsal passed on ${todayInWords()} for the release serving staging`,
      ),
    `${item.state}: ${item.why}`,
  )
  const events = await completedEvents(env('MANIFEST_SESSION_STEPPED'), ended.id)
  checks.ok(
    'ONE load_rehearsal.completed, saying who ran it and that it passed',
    events.length === 1 &&
      (events[0]?.machineDetail as { state?: string }).state === 'passed' &&
      /Test Instructor/.test(events[0]?.humanMessage ?? '') &&
      /passed/.test(events[0]?.humanMessage ?? ''),
    events.map((f) => f.humanMessage).join(' | ') || '(none in the replay)',
  )
  done(4)
}

// ─── candidate: step 5 ─────────────────────────────────────────────────────────────────

async function candidatePhase(): Promise<void> {
  checks.step(
    '5. The app is made to fall over under a crowd — committed, so a NEW candidate',
  )
  const owner = clientFor('MANIFEST_SESSION')
  const written = await commit(
    owner,
    'Course notices: slow the front page, and refuse past two at once',
    [{ op: 'write', path: 'load-app.json', content: loadAppJson(true) }],
  )
  const { release, instance } = await stage(
    owner,
    checks.must('the commit', written.commitSha),
    'Course notices — one that cannot take a crowd',
  )
  state.releaseFall = release.id
  save()
  checks.ok(
    'a new image, so a new candidate',
    release.imageDigest !== need('the first candidate’s digest', state.digestPass),
    `${release.imageDigest} after ${state.digestPass}`,
  )
  const front = await probe('/')
  checks.ok(
    'one person at a time is still served: / 200 from the new instance',
    front.status === 200 && front.instance === instance.id,
    `${front.status} ${front.instance}`,
  )
  const item = await loadItem(owner)
  checks.ok(
    'the item is unmet again: “The release serving staging has not been rehearsed yet”',
    item.state === 'unmet' &&
      item.why.includes('The release serving staging has not been rehearsed yet'),
    `${item.state}: ${item.why}`,
  )
  done(5)
}

// ─── fallover: step 6 ──────────────────────────────────────────────────────────────────

async function falloverPhase(): Promise<void> {
  checks.step(
    '6. The rehearsal of the app that falls over FAILS — naming the rule it broke, and the number',
  )
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const release = need('the new candidate, from step 5', state.releaseFall)
  const started = await startRun(owner)
  const record = checks.must(
    'answered at once: 202, running',
    started.response.status === 202 && started.data?.state === 'running'
      ? started.data
      : undefined,
    started.data === undefined
      ? describe(started)
      : JSON.stringify(started.data).slice(0, 300),
  )
  state.runFall = record.id
  save()
  checks.ok(
    'it rehearses the new candidate',
    record.releaseId === release,
    record.releaseId,
  )
  console.log('  (the arrival is on it — polling until the run ends, about six minutes)')
  const ended = await pollRun(
    owner,
    record,
    (r) => r.state !== 'running',
    RUN_ENDS_WITHIN_MS,
  )
  console.log(
    `  ${ended.state} in ${secondsBetween(ended.createdAt, ended.finishedAt)} s: ${ended.evidence?.reason ?? '(no reason)'}`,
  )
  console.log(`  ${evidenceLine(ended)}`)
  const e = ended.evidence
  const mark = ended.profile.pass.answeredRatio
  // NOT a stop: whatever the run's end, staging must be given back — read below either way.
  checks.ok(
    'the rehearsal FAILED, on the production shape it was granted',
    ended.state === 'failed' && ended.granted?.count === LARGE_COURSE_INSTANCES,
    `${ended.state} granted ${JSON.stringify(ended.granted)}: ${e?.reason ?? ''}`,
  )
  const named =
    /^(\d+(?:\.\d)?)% of requests were answered \((\d+) of (\d+)\); the mark is (\d+(?:\.\d)?)%$/.exec(
      e?.reason ?? '',
    )
  checks.ok(
    'its reason is the FIRST rule it broke — the share answered — with the number and the mark',
    named !== null &&
      Number(named[2]) === e?.answered &&
      Number(named[3]) === e?.requests &&
      (e?.answeredRatio ?? 1) < mark &&
      Number(named[4]) === mark * 100,
    e?.reason ?? '(none)',
  )
  const front = e?.byPath?.['/'] ?? {}
  const health = e?.byPath?.['/healthz'] ?? {}
  checks.ok(
    'the refusals were the front page’s 503s; /healthz was answered throughout and no member fell out',
    (front['503'] ?? 0) > 0 &&
      Object.keys(health).every((status) => status === '200') &&
      e?.instanceExits === 0 &&
      e.outOfMemory === false &&
      e.unhealthy === false,
    evidenceLine(ended),
  )
  await givenBack(owner, ended, 'after the fall-over')
  const item = await loadItem(owner)
  checks.ok(
    `the item stays unmet, with the reason: “The load rehearsal did not pass on ${todayInWords()}: …”`,
    item.state === 'unmet' &&
      item.why.startsWith(
        `The load rehearsal did not pass on ${todayInWords()}: ${e?.reason ?? '(none)'}`,
      ),
    `${item.state}: ${item.why}`,
  )
  const events = await completedEvents(env('MANIFEST_SESSION_STEPPED'), ended.id)
  checks.ok(
    'ONE load_rehearsal.completed, saying it failed',
    events.length === 1 &&
      (events[0]?.machineDetail as { state?: string }).state === 'failed',
    events.map((f) => f.humanMessage).join(' | ') || '(none in the replay)',
  )
  // LAST, because it spends this address's minute on staging's hostname — and the limiter's counters outlive every
  // redeploy (the load baseline's F5): a probe of staging after it, in the same minute, would be answered 429.
  const limited = await limitedAt()
  checks.ok(
    `from one address, the edge answers 429 by the ${RATE_LIMIT + 1}st request in a minute — and not before ~${RATE_LIMIT - 10}`,
    limited.first429 !== undefined &&
      limited.first429 > RATE_LIMIT - 10 &&
      limited.first429 <= RATE_LIMIT + 1,
    `first 429 at ${String(limited.first429)}; ${limited.statuses}`,
  )
  done(6)
}

const phases: Record<Phase, () => Promise<void>> = {
  find: findPhase,
  clear: clearPhase,
  app: appPhase,
  pass: passPhase,
  candidate: candidatePhase,
  fallover: falloverPhase,
}

try {
  await phases[phase]()
} catch (error) {
  if (error instanceof ManifestApiError)
    checks.ok(`no call refused (${error.operation})`, false, error.message)
  else if (!(error instanceof JourneyStop)) {
    const cause = (error as { cause?: { code?: unknown } }).cause?.code
    checks.ok(
      'no step threw',
      false,
      `${cause === undefined ? '' : `[cause ${String(cause)}] `}${(error as Error).stack ?? String(error)}`,
    )
  }
} finally {
  save()
}
checks.finish()
