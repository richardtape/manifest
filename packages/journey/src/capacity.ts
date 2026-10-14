import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:https'
import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  subscribe,
  unwrap,
  type ManifestClient,
  type Schemas,
  type StreamFrame,
} from '@manifest/contract'
import { Checks, JourneyStop } from './check.js'
import {
  crashLoop,
  notTheApp,
  overlapping,
  setRuns,
  wavesOf,
  type Exit,
  type LoopRecord,
} from './capacity-checks.js'
import { describeSeen, seeEveryMember } from './serving-set.js'

/**
 * A1's ACCEPTANCE DEMO (Task 9), `make demo-capacity`: a launched `class` app's production runs TWO instances
 * behind one edge route, a redeploy across them interrupts nobody, a release that never becomes ready changes
 * nothing, a member that dies is replaced, and a crash loop is stopped at its cap — through the edge, by
 * nothing but the generated client (and `docker kill`, which is the failure under test, not a platform call).
 *
 *   node packages/journey/dist/capacity.js <phase> <state.json>
 *
 * **The app** is a launched `class` app: `launch-app` on driver 1 (`make demo-production` launches it), and
 * `launchpath-github` on driver 2, the GitHub fake (`make demo-launch` launches it — `make demo-production` is
 * driver 1's). Every commit goes through the authoring API, so one path serves both drivers.
 *
 * **Phases, because a step-up is a browser's round trip at the IdP and lasts ten minutes** (P5a Decision 38):
 * `scripts/demo-capacity.sh` steps the owner up right before each phase that deploys production.
 *
 *   status    MANIFEST_SESSION            is the app here, and launched?
 *   serve     MANIFEST_SESSION            1  two instances serve; the releases the later phases deploy, built
 *   same      MANIFEST_SESSION_STEPPED    2  a SAME-release redeploy under two loops
 *   fresh     MANIFEST_SESSION_STEPPED    2  a NEW-release redeploy under two loops
 *   never     MANIFEST_SESSION_STEPPED    3  a release that never becomes ready in production
 *   kill      MANIFEST_SESSION            4  one member killed, recorded and replaced
 *   crash     MANIFEST_SESSION_STEPPED    5  a crash loop, stopped at its cap (~7 minutes)
 *   recover   MANIFEST_SESSION_STEPPED    5  a good release by the owner; the count starts again
 *   signin    MANIFEST_SESSION            6  a sign-in across instances — NOT RUNNABLE here, and why
 *
 * **WHAT THIS CANNOT RUN ON A LAPTOP** (manifest-coord3's decision under Rich's delegation, `ede301c`): a
 * launched production app signs people in with UBC's own IdP — `SAML_ENVIRONMENT=PRODUCTION`, its entry
 * point `authentication.ubc.ca` — which no laptop can complete a sign-in against. So P4c's signed-in half
 * (nobody signed out, every question answered) and the sign-in across instances are not run here; phase 6
 * says so, and shows every member sending its sign-in to UBC. They are held by the skeleton's Docker case
 * (`blueprints/node-ts-mongo.docker.test.ts`: a sign-in crossing two instances both ways, a replay refused) and
 * by the sessions the skeleton keeps in the app's own database.
 *
 * **The failing releases fail ONLY in production** (`MANIFEST_ENV`, which the platform injects): production
 * deploys only the release serving staging (§13), so a release that never became ready on staging could never
 * be asked of production at all.
 */

const PHASES = [
  'status',
  'serve',
  'same',
  'fresh',
  'never',
  'kill',
  'crash',
  'recover',
  'signin',
] as const
type Phase = (typeof PHASES)[number]

/** Past the builder's own 900 s timeout, as the journey's bound is. */
const BUILD_ENDS_WITHIN_MS = 960_000
/** `MANIFEST_SET_WATCH_SECONDS`' default — the watcher's pass. */
const WATCH_SECONDS = 15
/** UBC's production IdP, as the platform injects it for a launched app (§8). */
const UBC_SSO = 'https://authentication.ubc.ca/idp/profile/SAML2/Redirect/SSO'
/** The marker around everything this demo writes into `server.js`, so a run that died mid-way is undone by the next. */
const BEGIN = '// >>> make demo-capacity'
const END = '// <<< make demo-capacity'

interface CapacityState {
  slug?: string
  runId?: string
  projectId?: string
  launched?: boolean
  stagingEnvironmentId?: string
  productionEnvironmentId?: string
  productionHost?: string
  /** The app declares a model: each member holds its own key. */
  hasModel?: boolean
  releaseGood?: string
  releaseNever?: string
  releaseCrash?: string
  /** The serving set after each phase that changed it. */
  sets?: Record<string, string[]>
  /** One line per phase, for the run's summary. */
  timings?: string[]
}

const [phaseArg, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
if (!PHASES.includes(phaseArg as Phase) || statePath === undefined) {
  console.error(`usage: capacity.js <${PHASES.join('|')}> <state.json>`)
  process.exit(2)
}
const phase = phaseArg as Phase
const path: string = statePath

const checks = new Checks()
const state: CapacityState = (() => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CapacityState
  } catch {
    return {}
  }
})()
const save = (): void => writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`)

function env(variable: string): string {
  return need(`${variable} was provided`, process.env[variable])
}

/** A value an earlier phase wrote: silent when it is there, a stop naming it when it is not. */
function need<T>(what: string, value: T | undefined | null): T {
  return value === undefined || value === null ? checks.must(what, value) : value
}

/** The socket errors a reset leaves: the edge closed a connection the client was about to use. */
const RESET_CODES = new Set(['UND_ERR_SOCKET', 'ECONNRESET', 'EPIPE'])
const resetCode = (error: unknown): string | undefined => {
  const code =
    (error as { cause?: { code?: string } }).cause?.code ??
    (error as { code?: string }).code
  return code !== undefined && RESET_CODES.has(code) ? code : undefined
}

/**
 * §11'S RESET, ON THE CONSOLE'S OWN ROUTE: every route change reloads the edge's whole configuration, and a
 * reload closes the idle keep-alive sockets it held — so a read that reuses one as the reload lands fails
 * `UND_ERR_SOCKET`, whichever app's route moved. Measured here (driver 2, phase 4): the watcher's
 * replacement moved `launchpath-github`'s route between two reads of the environment. The request loops
 * count a reset as its own tolerated class; the client asks a READ again, ONCE, and says so — never a
 * mutation, which is retried only by its caller with its own `Idempotency-Key`.
 */
const resetSafeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const again =
    input instanceof Request && input.method === 'GET' ? input.clone() : undefined
  try {
    return await fetch(input, init)
  } catch (error) {
    const code = resetCode(error)
    if (again === undefined || code === undefined) throw error
    console.log(`  (a read met the edge's reset, ${code}, and was asked again)`)
    return fetch(again, init)
  }
}) as typeof fetch

function clientFor(variable: string): ManifestClient {
  return createManifestClient({ origin, session: env(variable), fetch: resetSafeFetch })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const host = (): string => need('the production hostname', state.productionHost)

// ─── reads ──────────────────────────────────────────────────────────────────────────────

async function environment(
  client: ManifestClient,
  environmentId: string,
): Promise<Schemas['Environment']> {
  return unwrap(
    await client.GET('/v1/environments/{environmentId}', {
      params: { path: { environmentId } },
    }),
    'getEnvironment',
  )
}

const production = (client: ManifestClient) =>
  environment(client, need('production', state.productionEnvironmentId))

const ids = (e: Schemas['Environment']): string[] => e.instances.map((m) => m.id)
const states = (e: Schemas['Environment']): string =>
  e.instances.map((m) => `${m.id} ${m.state}`).join(', ')

/** TWO members, every one healthy — a `class` app's production. */
const twoHealthy = (e: Schemas['Environment']): boolean =>
  e.instances.length === 2 && e.instances.every((m) => m.state === 'healthy')

async function incidents(client: ManifestClient): Promise<Schemas['Incident'][]> {
  return unwrap(
    await client.GET('/v1/environments/{environmentId}/incidents', {
      params: { path: { environmentId: state.productionEnvironmentId! } },
    }),
    'listIncidents',
  ).incidents
}

interface Probed {
  status: number
  instance: string | undefined
  location: string | undefined
  body: string
}

/** `probeOnce`, asked again ONCE when the edge's reload reset its connection (§11) — and said. */
async function probe(pathname: string): Promise<Probed> {
  try {
    return await probeOnce(pathname)
  } catch (error) {
    const code = resetCode(error)
    if (code === undefined) throw error
    console.log(`  (a probe met the edge's reset, ${code}, and was asked again)`)
    return probeOnce(pathname)
  }
}

/**
 * One GET of the PUBLIC listener (127.0.0.3) with production's hostname as SNI and Host — §12's listener for
 * a production app. A fresh socket every time (P6a F2: a pooled one answers from the wrong address).
 */
function probeOnce(pathname: string): Promise<Probed> {
  const name = host()
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: name,
        servername: name,
        path: pathname,
        agent: false,
        lookup: (_host, options, callback) =>
          options.all
            ? (callback as (e: null, a: { address: string; family: number }[]) => void)(
                null,
                [{ address: '127.0.0.3', family: 4 }],
              )
            : (callback as (e: null, a: string, f: number) => void)(null, '127.0.0.3', 4),
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
            location: res.headers.location,
            body: body.slice(0, 200),
          })
        })
      },
    )
    req.on('timeout', () =>
      req.destroy(new Error('the public listener did not answer in 10 s')),
    )
    req.on('error', reject)
    req.end()
  })
}

/** Every member of `set` answers `/healthz` through the public listener — within 4 × N requests — and nothing else does. */
async function servesAs(set: readonly string[], what: string): Promise<void> {
  const seen = await seeEveryMember(
    () => probe('/healthz'),
    set,
    (answer) => answer.status === 200 && answer.body.includes('"mongo":true'),
  )
  console.log(
    `  127.0.0.3 answered as [${seen.seen.join(', ')}] in ${seen.asked} requests`,
  )
  checks.ok(
    `${what}: every member answers through the public listener, bare, and nothing outside the set does`,
    seen.ok,
    describeSeen(set, seen),
  )
}

/**
 * §8 FOR A LAUNCHED APP: `/login` on every member sends the person to UBC's production IdP — the reason a
 * sign-in cannot be completed on this laptop. Quoted, with the request's own payload cut.
 */
async function signsInWithUbc(set: readonly string[], what: string): Promise<void> {
  let quoted = ''
  const seen = await seeEveryMember(
    () => probe('/login'),
    set,
    (answer) => {
      const ok =
        answer.status === 302 && (answer.location ?? '').startsWith(`${UBC_SSO}?`)
      if (ok && quoted === '')
        quoted = answer.location!.replace(/=([^&]{24})[^&]*/g, '=$1…')
      return ok
    },
  )
  console.log(`  GET https://${host()}/login → 302 Location: ${quoted || '(none)'}`)
  checks.ok(
    `${what}: GET /login on every member answers 302 to UBC’s production IdP (${UBC_SSO})`,
    seen.ok,
    describeSeen(set, seen),
  )
}

// ─── the platform's own state, outside the API ─────────────────────────────────────────

function docker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim()
}

/** Every app container of production — app containers carry `manifest.release`; its database and egress proxy do not. */
function productionAppContainers(): string[] {
  const out = docker([
    'ps',
    '-a',
    '--filter',
    `label=manifest.slug=${state.slug}`,
    '--filter',
    'label=manifest.environment=production',
    '--filter',
    'label=manifest.release',
    '--format',
    '{{.Label "manifest.instance"}}',
  ])
  return out === '' ? [] : out.split('\n').sort()
}

/** Containers of one release in production — a failed set must leave none. */
function productionContainersOf(releaseId: string): number {
  const out = docker([
    'ps',
    '-a',
    '--filter',
    `label=manifest.release=${releaseId}`,
    '--filter',
    'label=manifest.environment=production',
    '--format',
    '{{.Names}}',
  ])
  return out === '' ? 0 : out.split('\n').length
}

/** The live keys LiteLLM holds for production's user, `mf-<projectId>-production` — one per member. */
async function productionKeys(): Promise<number> {
  const master = env('MANIFEST_LITELLM_MASTER_KEY')
  const url = new URL('http://127.0.0.1:7106/key/list')
  url.searchParams.set('user_id', `mf-${state.projectId}-production`)
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${master}` },
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await response.json()) as { keys?: unknown[] }
  return Array.isArray(body.keys) ? body.keys.length : -1
}

/** Exactly the set's containers, and — where the app declares a model — exactly one key for each. */
async function exactlyTheSet(set: readonly string[], what: string): Promise<void> {
  const containers = productionAppContainers()
  checks.ok(
    `${what}: exactly two app containers serve production — the set’s`,
    containers.join(',') === [...set].sort().join(','),
    `containers [${containers.join(', ')}], set [${set.join(', ')}]`,
  )
  if (state.hasModel) {
    const keys = await productionKeys()
    checks.ok(
      `${what}: LiteLLM holds exactly two live keys for production`,
      keys === 2,
      `${keys}`,
    )
  }
}

// ─── the event stream ──────────────────────────────────────────────────────────────────

type AnyEvent = Extract<StreamFrame, { kind: 'event' }>
type EventOf<T extends AnyEvent['type']> = Extract<AnyEvent, { type: T }>

function stream(): { frames: StreamFrame[]; ready: Promise<void>; close(): void } {
  const frames: StreamFrame[] = []
  const subscription = subscribe({
    origin,
    session: env('MANIFEST_SESSION'),
    projectId: need('the project', state.projectId),
    onFrame: (frame) => frames.push(frame),
  })
  return { frames, ready: subscription.ready, close: () => subscription.close() }
}

/** The events of one type for production, created at or after `since` (host ms; two seconds of clock slack). */
function eventsOf<T extends AnyEvent['type']>(
  frames: readonly StreamFrame[],
  type: T,
  since: number,
): EventOf<T>[] {
  return frames.filter(
    (f): f is EventOf<T> =>
      f.kind === 'event' &&
      f.type === type &&
      Date.parse(f.createdAt) >= since - 2_000 &&
      (f.machineDetail as { environment?: string }).environment === 'production',
  )
}

/** Each member of `set` retired, said by the stream — never a sleep: the drain is bounded at 120 s. */
async function retired(
  frames: readonly StreamFrame[],
  set: readonly string[],
  since: number,
): Promise<boolean> {
  const done = () =>
    set.every((id) =>
      eventsOf(frames, 'instance.retired', since).some(
        (f) => f.machineDetail.instanceId === id,
      ),
    )
  const deadline = Date.now() + 150_000
  while (!done() && Date.now() < deadline) await sleep(500)
  return done()
}

/** The first production event of `type` since `since` that `match`es, waited for up to `withinMs`. */
async function firstEvent<T extends AnyEvent['type']>(
  frames: readonly StreamFrame[],
  type: T,
  since: number,
  match: (frame: EventOf<T>) => boolean,
  withinMs: number,
): Promise<EventOf<T> | undefined> {
  const found = () => eventsOf(frames, type, since).find(match)
  const deadline = Date.now() + withinMs
  while (found() === undefined && Date.now() < deadline) await sleep(250)
  return found()
}

// ─── the request loops ─────────────────────────────────────────────────────────────────

interface Loop {
  name: string
  records(): LoopRecord[]
  stop(): Promise<void>
}

/**
 * `scripts/lib/redeploy-loop.mjs` — P4c's loop: each answer classified by its BODY (the marker) and named by
 * the edge's `X-Manifest-Instance`, because a status is never evidence (the public listener's wildcard
 * answers an empty 200).
 */
function startLoop(
  name: string,
  pathname: string,
  intervalMs: number,
  marker?: string,
): Loop {
  const work = env('MANIFEST_WORK')
  const out = `${work}/${name}.ndjson`
  const stop = `${work}/${name}.stop`
  writeFileSync(out, '')
  const child = spawn(
    process.execPath,
    [
      env('MANIFEST_LOOP_SCRIPT'),
      `https://${host()}${pathname}`,
      out,
      String(intervalMs),
      stop,
    ],
    {
      stdio: 'inherit',
      env: marker === undefined ? process.env : { ...process.env, APP_MARKER: marker },
    },
  )
  const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()))
  // Every COMPLETE line: one read while the loop is appending may end part-way through its last.
  const records = () =>
    readFileSync(out, 'utf8')
      .split('\n')
      .slice(0, -1)
      .map((line) => JSON.parse(line) as LoopRecord)
  return {
    name,
    records,
    stop: async () => {
      writeFileSync(stop, '')
      await exited
    },
  }
}

/** The two loops: production's health check, and the app's own page — a person's requests, back to back. */
async function startLoops(label: string, healthzMs = 200): Promise<Loop[]> {
  const loops = [
    startLoop(`${label}-healthz`, '/healthz', healthzMs),
    startLoop(`${label}-page`, '/', 500, 'Sign in with CWL'),
  ]
  const deadline = Date.now() + 15_000
  while (loops.some((l) => l.records().length < 3) && Date.now() < deadline)
    await sleep(200)
  for (const loop of loops)
    checks.must(
      `the ${loop.name} loop sees the app before anything changes`,
      loop.records().length >= 3 && notTheApp(loop.records()).length === 0
        ? loop
        : undefined,
      JSON.stringify(loop.records().slice(0, 3)),
    )
  return loops
}

/**
 * §11's RESETS, EACH COUNTED: an edge configuration reload occasionally resets one connection, on any app
 * (P4c measured one in ~300 requests per change). The loops never retry — a reset is recorded as its own
 * class — and every phase allows at most one per loop, P4c's rule; a second is a failure.
 */
const resets = (records: readonly LoopRecord[]): number =>
  records.filter((r) => r.cls === 'reset').length

function counts(records: readonly LoopRecord[]): string {
  const by = new Map<string, number>()
  for (const r of records) by.set(r.cls, (by.get(r.cls) ?? 0) + 1)
  return [...by].map(([cls, n]) => `${n} ${cls}`).join(', ')
}

// ─── deploys ───────────────────────────────────────────────────────────────────────────

async function deploy(
  client: ManifestClient,
  environmentId: string,
  releaseId: string,
): Promise<Schemas['Instance']> {
  return unwrap(
    await client.POST('/v1/environments/{environmentId}/deploy', {
      params: {
        path: { environmentId },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { releaseId },
    }),
    'deploy',
  )
}

/** Staging on `releaseId` — production deploys only the release serving staging (§13). */
async function stage(client: ManifestClient, releaseId: string): Promise<void> {
  const staging = await environment(client, need('staging', state.stagingEnvironmentId))
  if (staging.instance?.releaseId === releaseId && staging.instance.state === 'healthy') {
    console.log(`  staging already serves ${releaseId}`)
    return
  }
  const instance = await deploy(client, state.stagingEnvironmentId!, releaseId)
  checks.must(
    `staging is healthy on ${releaseId} — the release production may then run`,
    instance.state === 'healthy' ? instance : undefined,
    instance.state,
  )
  console.log(`  staging serves ${releaseId}`)
}

/** A production deploy the owner asks for, timed. */
async function deployProduction(
  client: ManifestClient,
  releaseId: string,
): Promise<{ answered: Schemas['Instance']; ms: number }> {
  const askedAt = Date.now()
  const answered = await deploy(
    client,
    need('production', state.productionEnvironmentId),
    releaseId,
  )
  const ms = Date.now() - askedAt
  console.log(
    `  production deploy answered in ${seconds(ms)}: ${answered.id}, ${answered.state}`,
  )
  return { answered, ms }
}

/** Waits until production is two healthy members, none of them in `old`. */
async function newPair(
  client: ManifestClient,
  old: readonly string[],
  withinMs: number,
): Promise<Schemas['Environment']> {
  const deadline = Date.now() + withinMs
  for (;;) {
    const e = await production(client)
    if (twoHealthy(e) && ids(e).every((id) => !old.includes(id))) return e
    if (Date.now() > deadline) return e
    await sleep(500)
  }
}

/** Kills a member's container — the failure under test — and says when. */
function kill(instanceId: string): { from: number; to: number } {
  const container = docker([
    'ps',
    '-q',
    '--filter',
    `label=manifest.instance=${instanceId}`,
  ])
  checks.must(
    `exactly one running container is ${instanceId}`,
    container !== '' && !container.includes('\n') ? container : undefined,
    container,
  )
  const from = Date.now()
  docker(['kill', container])
  const to = Date.now()
  console.log(
    `  docker kill ${container.slice(0, 12)} (${instanceId}) in ${to - from} ms`,
  )
  return { from, to }
}

function remember(label: string, set: string[]): void {
  state.sets = { ...(state.sets ?? {}), [label]: set }
}

function timed(line: string): void {
  state.timings = [...(state.timings ?? []), line]
}

// ─── status ────────────────────────────────────────────────────────────────────────────

async function statusPhase(): Promise<void> {
  const client = clientFor('MANIFEST_SESSION')
  state.slug = env('MANIFEST_SLUG')
  state.runId = env('MANIFEST_RUN_ID')
  const found = unwrap(await client.GET('/v1/projects'), 'listProjects').find(
    (p) => p.slug === state.slug,
  )
  state.launched = found?.launchedAt !== undefined && found.launchedAt !== null
  console.log(
    found === undefined
      ? `  ${state.slug} does not exist yet`
      : `  ${state.slug} ${state.launched ? `launched on ${found.launchedAt}` : 'has not launched'}`,
  )
  if (found === undefined) return
  state.projectId = found.id
  const environments = unwrap(
    await client.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId: found.id } },
    }),
    'listEnvironments',
  )
  const of = (kind: Schemas['Environment']['kind']) =>
    checks.must(
      `a ${kind} environment`,
      environments.find((e) => e.kind === kind),
    )
  state.stagingEnvironmentId = of('staging').id
  state.productionEnvironmentId = of('production').id
  state.productionHost = of('production').hostname
  checks.ok(
    `${state.slug} is a class app — two instances in production`,
    found.audience?.scale === 'class',
    `${found.audience?.scale}`,
  )
}

// ─── 1. two instances serve; the releases, built ───────────────────────────────────────

/** `server.js` with everything an earlier run of this demo wrote taken out. */
function withoutDemo(source: string): string {
  return source.replace(new RegExp(`${BEGIN}[^\\n]*\\n[\\s\\S]*?${END}\\n`, 'g'), '')
}

/** `server.js` with `snippet` inserted before the health route — after `app` exists, before anything answers. */
function withSnippet(base: string, snippet: string): string {
  const anchor = "app.get('/healthz'"
  checks.must(
    `server.js declares its health route once, at the start of a line (${anchor})`,
    base.split(`\n${anchor}`).length === 2 ? base : undefined,
  )
  return base.replace(
    `\n${anchor}`,
    `\n${BEGIN} (${state.runId})\n${snippet}\n${END}\n${anchor}`,
  )
}

const GOOD = `// A code-only change: a new digest, nothing sensitive — the release the redeploys run.`
const NEVER = `// Never ready IN PRODUCTION: its health check answers 503 there and only there (MANIFEST_ENV), so
// staging runs it healthy, which production must run first.
app.use('/healthz', (_req, res, next) =>
  process.env.MANIFEST_ENV === 'production'
    ? res.status(503).json({ status: 'never ready in production (make demo-capacity)' })
    : next(),
)`
const CRASH = `// A crash loop IN PRODUCTION: the process exits 15 s after its health check first answers there.
let demoCapacityExitArmed = false
app.use('/healthz', (_req, _res, next) => {
  if (process.env.MANIFEST_ENV === 'production' && !demoCapacityExitArmed) {
    demoCapacityExitArmed = true
    setTimeout(() => process.exit(3), 15_000)
  }
  next()
})`

async function commitServer(
  client: ManifestClient,
  content: string,
  message: string,
): Promise<string> {
  const head = unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId: state.projectId! } },
    }),
    'getTree',
  ).commitSha
  const outcome = unwrap(
    await client.POST('/v1/projects/{projectId}/commits', {
      params: {
        path: { projectId: state.projectId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {
        baseCommit: head,
        message,
        changes: [{ op: 'write', path: 'server.js', content }],
      },
    }),
    'createCommit',
  )
  checks.ok(
    `${message}: committed, its manifest.yaml valid, nothing sensitive since the last approval`,
    outcome.commitSha !== null &&
      outcome.spec.appSpecId !== null &&
      !outcome.spec.sensitiveDiff.sensitive &&
      (outcome.spec.sensitiveSinceApproved ?? []).length === 0,
    JSON.stringify(outcome.spec).slice(0, 300),
  )
  return checks.must('the commit', outcome.commitSha)
}

async function releaseOf(
  client: ManifestClient,
  commitSha: string,
  summary: string,
): Promise<string> {
  const started = unwrap(
    await client.POST('/v1/projects/{projectId}/builds', {
      params: {
        path: { projectId: state.projectId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { commitSha },
    }),
    'startBuild',
  )
  const startedAt = Date.now()
  let build: Schemas['Build']
  for (;;) {
    build = unwrap(
      await client.GET('/v1/builds/{buildId}', {
        params: { path: { buildId: started.id } },
      }),
      'getBuild',
    )
    if (build.status === 'succeeded' || build.status === 'failed') break
    if (Date.now() - startedAt > BUILD_ENDS_WITHIN_MS) break
    await sleep(2_000)
  }
  checks.must(
    `${summary}: built`,
    build.status === 'succeeded' && build.imageDigest ? build : undefined,
    `${build.status}: ${build.error ?? ''}`,
  )
  const release = unwrap(
    await client.POST('/v1/projects/{projectId}/releases', {
      params: {
        path: { projectId: state.projectId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { buildId: build.id, summary },
    }),
    'createRelease',
  )
  console.log(
    `  ${summary}: build ${seconds(Date.now() - startedAt)}, release ${release.id} (${release.imageDigest.slice(0, 19)}…)`,
  )
  return release.id
}

async function servePhase(): Promise<void> {
  checks.step('1. Two instances serve')
  const client = clientFor('MANIFEST_SESSION')
  const e = await production(client)
  const set = ids(e)
  checks.must(
    'production runs TWO instances — a class’s count — every one healthy',
    twoHealthy(e) ? e : undefined,
    states(e),
  )
  remember('start', set)
  await servesAs(set, 'the two')
  await signsInWithUbc(set, 'a launched app')
  console.log(
    '  So no sign-in can complete on this laptop against a launched app: the signed-in half of phase 2',
  )
  console.log('  and phase 6 are NOT RUN here (phase 6 says what holds them instead).')

  const serving = unwrap(
    await client.GET('/v1/releases/{releaseId}', {
      params: { path: { releaseId: e.instances[0]!.releaseId } },
    }),
    'getRelease',
  )
  state.hasModel = serving.config.production.ai.models.length > 0
  console.log(
    `  it ${state.hasModel ? `declares [${serving.config.production.ai.models.join(', ')}] — a key per member` : 'declares no model — no keys to count'}`,
  )
  await exactlyTheSet(set, 'before anything changes')

  checks.step('1. The releases the later phases deploy — each a code-only commit, built')
  const file = unwrap(
    await client.GET('/v1/projects/{projectId}/file', {
      params: { path: { projectId: state.projectId! }, query: { path: 'server.js' } },
    }),
    'getFile',
  )
  const base = withoutDemo(file.content)
  if (base !== file.content)
    console.log('  an earlier run’s change was still in server.js — taken out first')
  const run = state.runId!
  state.releaseGood = await releaseOf(
    client,
    await commitServer(
      client,
      withSnippet(base, GOOD),
      `make demo-capacity ${run}: a code-only change`,
    ),
    `make demo-capacity ${run}: a good release`,
  )
  state.releaseNever = await releaseOf(
    client,
    await commitServer(
      client,
      withSnippet(base, NEVER),
      `make demo-capacity ${run}: never ready in production`,
    ),
    `make demo-capacity ${run}: never ready in production`,
  )
  state.releaseCrash = await releaseOf(
    client,
    await commitServer(
      client,
      withSnippet(base, CRASH),
      `make demo-capacity ${run}: a crash loop in production`,
    ),
    `make demo-capacity ${run}: a crash loop in production`,
  )
  await commitServer(client, base, `make demo-capacity ${run}: server.js as it was`)
  console.log('  server.js is back as it was')
}

// ─── 2. P4c's witness, across two ──────────────────────────────────────────────────────

async function redeployPhase(label: 'same-release' | 'new-release'): Promise<void> {
  checks.step(
    `2. A ${label === 'same-release' ? 'SAME' : 'NEW'}-release redeploy, under a loop on /healthz and a person’s requests to the app’s page`,
  )
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const before = await production(owner)
  checks.must(
    'production serves two healthy instances before it',
    twoHealthy(before) ? before : undefined,
    states(before),
  )
  const old = ids(before)
  const releaseId =
    label === 'same-release'
      ? before.instances[0]!.releaseId
      : need('the good release', state.releaseGood)
  await stage(owner, releaseId)

  const events = stream()
  await events.ready
  const loops = await startLoops(label)
  const start = Date.now()
  let deployed: Awaited<ReturnType<typeof deployProduction>>
  try {
    deployed = await deployProduction(owner, releaseId)
    await sleep(3_000)
  } finally {
    await Promise.all(loops.map((l) => l.stop()))
  }
  const after = await production(owner)
  const set = ids(after)
  checks.ok(
    `${label}: production runs TWO new instances, every one healthy, the deploy’s answer the first`,
    deployed.answered.state === 'healthy' &&
      twoHealthy(after) &&
      set[0] === deployed.answered.id &&
      set.every((id) => !old.includes(id)),
    `answer ${deployed.answered.id} ${deployed.answered.state}; before [${old.join(', ')}]; after [${states(after)}]`,
  )
  for (const loop of loops) {
    const records = loop.records()
    const window = overlapping(records, start, Date.now())
    const runs = setRuns(records, { old, new: set })
    console.log(
      `  ${loop.name}: ${records.length} requests — ${counts(records)}; sets ${runs.join(' → ')}`,
    )
    checks.ok(
      `${loop.name}: every answer was the app — no 5xx, no wildcard page, no refusal (at most one reset, §11’s reload)`,
      window.length > 0 && notTheApp(records).length === 0 && resets(records) <= 1,
      counts(records),
    )
    checks.ok(
      `${loop.name}: the SET changed exactly once — the old pair’s answers, then only the new pair’s`,
      runs.length === 2 && runs[0] === 'old' && runs[1] === 'new',
      runs.join(' → '),
    )
  }
  await servesAs(set, `${label}: the new pair`)
  checks.ok(
    `${label}: the old pair was retired, said by the stream`,
    await retired(events.frames, old, start),
    `[${old.join(', ')}]`,
  )
  events.close()
  await exactlyTheSet(set, label)
  remember(label, set)
  timed(`${label}: deploy ${seconds(deployed.ms)}`)
}

// ─── 3. a release that never becomes ready ─────────────────────────────────────────────

async function neverPhase(): Promise<void> {
  checks.step(
    '3. A release that never becomes ready in production — the pair serving keeps serving',
  )
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const releaseId = need('the never-ready release', state.releaseNever)
  const before = await production(owner)
  checks.must(
    'production serves two healthy instances before it',
    twoHealthy(before) ? before : undefined,
    states(before),
  )
  const old = ids(before)
  await stage(owner, releaseId)
  const loops = await startLoops('never-ready')
  let deployed: Awaited<ReturnType<typeof deployProduction>>
  try {
    deployed = await deployProduction(owner, releaseId)
    await sleep(3_000)
  } finally {
    await Promise.all(loops.map((l) => l.stop()))
  }
  checks.ok(
    'the deploy is recorded failed — its answer the member that failed',
    deployed.answered.state === 'failed' && deployed.answered.releaseId === releaseId,
    `${deployed.answered.id} ${deployed.answered.state} ${deployed.answered.releaseId}`,
  )
  const after = await production(owner)
  checks.ok(
    'production still runs the pair that was serving, both healthy',
    twoHealthy(after) && ids(after).join(',') === old.join(','),
    states(after),
  )
  for (const loop of loops) {
    const records = loop.records()
    const runs = setRuns(records, { old })
    console.log(
      `  ${loop.name}: ${records.length} requests — ${counts(records)}; sets ${runs.join(' → ')}`,
    )
    checks.ok(
      `${loop.name}: every answer was the app, from the pair that was serving — the route never moved (at most one reset)`,
      notTheApp(records).length === 0 &&
        resets(records) <= 1 &&
        runs.length === 1 &&
        runs[0] === 'old',
      `${counts(records)}; ${runs.join(' → ')}`,
    )
  }
  await servesAs(old, 'the pair that was serving')
  const incident = (await incidents(owner)).find(
    (i) => i.instanceId === deployed.answered.id && i.cause === 'deploy',
  )
  checks.ok(
    'an Incident names the member that failed',
    incident !== undefined,
    (await incidents(owner)).map((i) => `${i.instanceId} ${i.cause}`).join('; '),
  )
  if (incident !== undefined)
    console.log(`  its failed check: ${incident.failedCheck.slice(0, 160)}`)
  checks.ok(
    'and the failed set left no container in production',
    productionContainersOf(releaseId) === 0,
    `${productionContainersOf(releaseId)}`,
  )
  await exactlyTheSet(old, 'after the failed release')
  timed(`never-ready: deploy failed in ${seconds(deployed.ms)}`)
}

// ─── 4. one member killed ──────────────────────────────────────────────────────────────

/**
 * A member killed under the loops, its exit recorded and the set replaced. Returns the new pair. `loops`
 * false for the recover phase's reset check, which reads the exit's attempt and not the traffic.
 */
async function killOne(
  client: ManifestClient,
  label: string,
  withLoops: boolean,
): Promise<string[]> {
  const before = await production(client)
  checks.must(
    'production serves two healthy instances before it',
    twoHealthy(before) ? before : undefined,
    states(before),
  )
  const old = ids(before)
  const victim = old[0]!
  const events = stream()
  await events.ready
  const loops = withLoops ? await startLoops(label) : []
  await sleep(2_000)
  let killed: { from: number; to: number }
  let servingAt = 0
  let after: Schemas['Environment']
  try {
    killed = kill(victim)
    const exited = await firstEvent(
      events.frames,
      'instance.exited',
      killed.from,
      (f) => f.machineDetail.instanceId === victim,
      60_000,
    )
    const detail = exited?.machineDetail
    const after_ = exited === undefined ? NaN : Date.parse(exited.createdAt) - killed.to
    console.log(
      `  instance.exited ${seconds(after_)} after the kill: ${JSON.stringify(detail)}`,
    )
    checks.ok(
      `${label}: instance.exited within the watcher’s interval (${WATCH_SECONDS} s, and a pass’s own time) — exited 137, attempt 1, replaced at once`,
      detail !== undefined &&
        after_ <= (WATCH_SECONDS + 5) * 1000 &&
        detail.reason === 'exited' &&
        detail.exitCode === 137 &&
        detail.attempt === 1 &&
        detail.replacement === 'scheduled' &&
        detail.nextInSeconds === 0,
      JSON.stringify(detail),
    )
    after = await newPair(client, old, 90_000)
    servingAt = Date.now()
    console.log(
      `  two new members healthy ${seconds(servingAt - killed.to)} after the kill: ${states(after)}`,
    )
    if (withLoops) await sleep(3_000)
  } finally {
    await Promise.all(loops.map((l) => l.stop()))
  }
  const set = ids(after)
  checks.ok(
    `${label}: two healthy members again — a new set, neither of the old`,
    twoHealthy(after) && set.every((id) => !old.includes(id)),
    states(after),
  )
  for (const loop of loops) {
    const records = loop.records()
    const failed = notTheApp(records)
    const atTheKill = overlapping(failed, killed.from, killed.to)
    console.log(
      `  ${loop.name}: ${records.length} requests — ${counts(records)}; ${failed.length} not the app, ${atTheKill.length} of them in flight at the kill`,
    )
    checks.ok(
      `${loop.name}: no request failed but one in flight at the kill (at most one reset, counted)`,
      failed.length === atTheKill.length && failed.length <= 1 && resets(records) <= 1,
      JSON.stringify(failed),
    )
    const later = records.filter((r) => r.t >= servingAt)
    checks.ok(
      `${loop.name}: every request once the new pair served was answered by it`,
      later.length > 0 &&
        notTheApp(later).length === 0 &&
        later.every((r) => r.instance === null || set.includes(r.instance)),
      counts(later),
    )
  }
  await servesAs(set, `${label}: the new pair`)
  const incident = (await incidents(client)).find(
    (i) => i.instanceId === victim && i.cause === 'exit',
  )
  checks.ok(`${label}: an Incident records the exit`, incident !== undefined)
  checks.ok(
    `${label}: the killed member and its sibling were retired`,
    await retired(events.frames, old, killed.from),
    `[${old.join(', ')}]`,
  )
  events.close()
  await exactlyTheSet(set, label)
  return set
}

async function killPhase(): Promise<void> {
  checks.step('4. One member killed — routed around, recorded, and replaced')
  remember('kill', await killOne(clientFor('MANIFEST_SESSION'), 'killed', true))
}

// ─── 5. a crash loop, stopped at its cap ───────────────────────────────────────────────

async function crashPhase(): Promise<void> {
  checks.step(
    '5. A crash loop, stopped at its cap — three replacements: at once, a minute, four minutes (~7 minutes)',
  )
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const releaseId = need('the crash-looping release', state.releaseCrash)
  await stage(owner, releaseId)
  const events = stream()
  await events.ready
  const start = Date.now()
  const deployed = await deployProduction(owner, releaseId)
  checks.must(
    'the crash-looping release is healthy when it is deployed — it exits 15 s after its first health check',
    deployed.answered.state === 'healthy' ? deployed.answered : undefined,
    deployed.answered.state,
  )
  const person = ids(await production(owner))
  console.log(
    `  the owner’s pair: [${person.join(', ')}] — now waiting for the watcher to stop`,
  )
  const stopped = checks.must(
    'an exit said replacing had stopped, within 12 minutes',
    await firstEvent(
      events.frames,
      'instance.exited',
      start,
      (f) => f.machineDetail.replacement === 'stopped',
      12 * 60_000,
    ),
  )
  console.log(
    `  stopped ${seconds(Date.parse(stopped.createdAt) - start)} after the owner’s deploy; watching two more passes`,
  )
  await sleep((2 * WATCH_SECONDS + 10) * 1000)

  const exits: Exit[] = eventsOf(events.frames, 'instance.exited', start).map((f) => ({
    instanceId: f.machineDetail.instanceId,
    at: Date.parse(f.createdAt),
    attempt: f.machineDetail.attempt,
    replacement: f.machineDetail.replacement,
    nextInSeconds: f.machineDetail.nextInSeconds,
  }))
  const waves = wavesOf(
    eventsOf(events.frames, 'instance.provisioning', start)
      .filter((f) => !person.includes(f.machineDetail.instanceId))
      .map((f) => ({ id: f.machineDetail.instanceId, at: Date.parse(f.createdAt) })),
  )
  const loop = crashLoop(exits, waves)
  for (const row of loop.rows) console.log(`  ${row}`)
  checks.ok(
    'three replacements — at once, ≥ 60 s and ≥ 240 s after the exit before — then the fourth exit stopped, and nothing more started',
    loop.ok,
    loop.problems.join('; '),
  )
  const crashed = eventsOf(events.frames, 'instance.exited', start)
  checks.ok(
    'every exit was the app’s own (code 3), never a kill',
    crashed.length > 0 && crashed.every((f) => f.machineDetail.exitCode === 3),
    crashed
      .map((f) => `${f.machineDetail.reason} ${f.machineDetail.exitCode}`)
      .join(', '),
  )
  events.close()
  const e = await production(owner)
  checks.ok(
    'the stopped pair stays in the set, failed — nothing replaces it',
    e.instances.length > 0 && e.instances.every((m) => m.state === 'failed'),
    states(e),
  )
  const stop = (await incidents(owner))
    .filter((i) => i.cause === 'exit_stopped' && Date.parse(i.createdAt) >= start - 2_000)
    .at(0)
  console.log(
    `  its Incident’s prompt: ${(stop?.prompt ?? '(none)').slice(0, 400).replace(/\n/g, ' ')}`,
  )
  checks.ok(
    'its Incident says the platform has stopped replacing it',
    stop !== undefined && stop.prompt.includes('has stopped replacing it'),
    stop?.prompt.slice(0, 200) ?? '(no exit_stopped Incident)',
  )
  timed(
    `crash loop: stopped ${seconds(Date.parse(stopped.createdAt) - start)} after the owner’s deploy`,
  )
}

async function recoverPhase(): Promise<void> {
  checks.step(
    '5. The owner deploys a good release — two healthy members, and the count starts again',
  )
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const releaseId = need('the good release', state.releaseGood)
  const dead = ids(await production(owner))
  await stage(owner, releaseId)
  const deployed = await deployProduction(owner, releaseId)
  const e = await production(owner)
  checks.ok(
    'production runs TWO new healthy instances on the good release',
    deployed.answered.state === 'healthy' &&
      twoHealthy(e) &&
      ids(e).every((id) => !dead.includes(id)) &&
      e.instances.every((m) => m.releaseId === releaseId),
    states(e),
  )
  await servesAs(ids(e), 'the good pair')
  console.log(
    '  and the count: one member killed — replaced AT ONCE, attempt 1, as if no loop had happened',
  )
  remember('recover', await killOne(owner, 'after the owner’s deploy', false))
}

// ─── 6. a sign-in across instances ─────────────────────────────────────────────────────

async function signinPhase(): Promise<void> {
  checks.step(
    '6. A sign-in across instances — NOT RUN on this laptop against a launched app',
  )
  console.log(
    [
      '  A launched app signs people in with UBC’s production IdP (authentication.ubc.ca), which a laptop',
      '  cannot complete a sign-in against — so neither this phase nor phase 2’s signed-in half (nobody',
      '  signed out, every question answered) can run here. What holds them instead:',
      '    - blueprints/node-ts-mongo.docker.test.ts: a CWL sign-in started on one instance and completed on',
      '      the other, both ways, and a replayed assertion refused (the SAML request cache in the app’s own',
      '      database, A1 Task 8a);',
      '    - the skeleton keeps every session in the app’s own database, which every member reads.',
      '  What this run CAN show: every member sends its sign-in to UBC.',
    ].join('\n'),
  )
  const client = clientFor('MANIFEST_SESSION')
  const e = await production(client)
  await signsInWithUbc(ids(e), 'the pair serving now')
}

const phases: Record<Phase, () => Promise<void>> = {
  status: statusPhase,
  serve: servePhase,
  same: () => redeployPhase('same-release'),
  fresh: () => redeployPhase('new-release'),
  never: neverPhase,
  kill: killPhase,
  crash: crashPhase,
  recover: recoverPhase,
  signin: signinPhase,
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
