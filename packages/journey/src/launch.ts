import { readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:https'
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
import { askForSignOff, sayItWasSent } from './example-launch-path.js'
import { waitFor } from './wait.js'

/**
 * THE LAUNCH PATH PLAN'S ACCEPTANCE (Task 15): a faculty member takes an app to production THEMSELVES
 * — the privacy assessment and both registrations drafted, read and sent in UBC's order, an
 * administrator's sign-off asked for and given, and the launch — and then what a launched app's
 * people, credentials and models do. Through the edge, by nothing but the generated client.
 *
 *   node packages/journey/dist/launch.js <phase> <state.json>
 *
 * The phases, because signing in and stepping up are a browser's round trips at the IdP and that is
 * bash's business (P5a Decision 38): `scripts/demo-launch.sh` signs people in and steps them up
 * BETWEEN the phases, and hands each phase the sessions it needs.
 *
 *   find       MANIFEST_SESSION                      step 1's first half: is the project here?
 *   clear      MANIFEST_SESSION_STEPPED              deletes a project an earlier run left unlaunched
 *   owner      MANIFEST_SESSION                      steps 1–4
 *   admin      MANIFEST_SESSION, MANIFEST_ADMIN_SESSION                steps 5–6
 *   launch     MANIFEST_SESSION_STEPPED, MANIFEST_ADMIN_SESSION_STEPPED  steps 7–8
 *   reuse      MANIFEST_SESSION, MANIFEST_ADMIN_SESSION                steps 1–8 on a project that launched
 *   people     MANIFEST_SESSION_STEPPED, MANIFEST_COLLEAGUE_SESSION    step 9
 *   instances  MANIFEST_SESSION                      step 10
 *   narrow     MANIFEST_SESSION                      step 11
 *
 * **UBC'S ORDER, AS BUILT** (Spec action 9; the plan's Step 1 was written before it): the assessment
 * is sent first; staging's registration only once the assessment is APPROVED WITH ITS PIA NUMBER
 * (a draft made before the number is stale, and drafted again); production's only once staging's is
 * ACTIVE. So the records are sent one by one, with an administrator's answer between, and each
 * refusal of the order is asserted on the way — never "all three at once", which the platform
 * refuses by design.
 *
 * **A LAUNCH HAPPENS ONCE PER PROJECT**, and a launched project is never deleted
 * (`PROJECT_LAUNCHED_NOT_DELETABLE`). So a second run finds `launchpath-<driver>` launched, checks
 * what a launched project durably is (`reuse`), and runs steps 9–11, which repeat. A project an
 * earlier run left UNLAUNCHED is deleted and made again (`clear`), so steps 1–8 always run whole.
 *
 * **`MANIFEST_STOP_AFTER=<0–11>`** ends the run after that step, green or red — a negative control's
 * short run, and the real leg's (`DEMO_LAUNCH_REAL=1`, steps 0–3).
 */

const PHASES = [
  'find',
  'clear',
  'owner',
  'admin',
  'launch',
  'reuse',
  'people',
  'instances',
  'narrow',
] as const
type Phase = (typeof PHASES)[number]

/** The app's files — `fixtures/launch-path-app/`. */
const FIXTURE = new URL('../../../fixtures/launch-path-app/', import.meta.url)
/** Exactly what the fixture's `auth.attributes` asks for — `sn` among them, read nowhere. */
const ATTRIBUTES = ['ubcEduCwlPuid', 'mail', 'givenName', 'sn']
/** §9's SP naming, `{platform-domain}/sp/{slug}/{env}` — `MANIFEST_SP_ENTITY_BASE` on a laptop. */
const entityIdOf = (slug: string, env: string) =>
  `https://manifest.internal/sp/${slug}/${env}`
/** Past the builder's own 900 s timeout, as the journey's bound is. */
const BUILD_ENDS_WITHIN_MS = 960_000
/** The six questions UBC's Privacy Office asks, in its order (`launch/assessment.ts`). */
const SECTIONS = ['collected', 'stored', 'flows', 'retention', 'accountable', 'hosting']
/** Both kinds of private key the platform holds; neither may appear in any answer. */
const PRIVATE_KEY = /-----BEGIN (RSA )?PRIVATE KEY/

interface LaunchState {
  driver?: string
  slug?: string
  runId?: string
  /** What `find` saw: no project, one an earlier run left unlaunched, or one that launched. */
  existing?: 'none' | 'unlaunched' | 'launched'
  projectId?: string
  sandboxEnvironmentId?: string
  stagingEnvironmentId?: string
  productionEnvironmentId?: string
  stagingHost?: string
  productionHost?: string
  releaseId?: string
  imageDigest?: string
  /** The certificate fingerprint `sso.registered` published when staging deployed (step 1). */
  stagingFingerprint?: string
  /** The owner's first draft of the assessment — the one a token's redraft replaces (step 3). */
  assessmentDraftedAt?: string
  /** Step 3's token. Its secret is a credential: the state file is 0600 in a 0700 directory. */
  tokenId?: string
  tokenSecret?: string
  note?: string
  piaNumber?: string
  productionInstanceId?: string
  stopped?: boolean
}

const [phaseArg, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
if (!PHASES.includes(phaseArg as Phase) || statePath === undefined) {
  console.error(`usage: launch.js <${PHASES.join('|')}> <state.json>`)
  process.exit(2)
}
const phase = phaseArg as Phase
const path: string = statePath
const stopAfter =
  process.env.MANIFEST_STOP_AFTER === undefined || process.env.MANIFEST_STOP_AFTER === ''
    ? undefined
    : Number(process.env.MANIFEST_STOP_AFTER)

const checks = new Checks()
const state: LaunchState = (() => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as LaunchState
  } catch {
    return {}
  }
})()

function save(): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
}

/** Quiet when it is set — every client reads one — and a stop when it is unset or empty. */
function env(variable: string): string {
  const value = process.env[variable]
  if (value !== undefined && value !== '') return value
  return checks.must<string>(`${variable} was provided`, undefined)
}

/** Ends the run after step `n` when the caller asked it to. The bash script reads `stopped`. */
function done(n: number): void {
  if (stopAfter === undefined || n < stopAfter) return
  state.stopped = true
  save()
  console.log(`\n(stopped after step ${n}, as MANIFEST_STOP_AFTER asked)`)
  checks.finish()
}

function clientFor(variable: string): ManifestClient {
  return createManifestClient({ origin, session: env(variable) })
}

/** Quiet when it is there — it is read on every call — and a stop when it is not. */
function projectId(): string {
  return state.projectId ?? checks.must<string>('the project, from step 1', undefined)
}

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

/** Today in Vancouver, `YYYY-MM-DD` — what "I've sent it" is told. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(
    new Date(),
  )
}

function fixture(file: string): string {
  return readFileSync(new URL(file, FIXTURE), 'utf8')
}

/** The app's `manifest.yaml`, with this project's slug as its name — §7 refuses any other. */
function appManifest(
  slug: string,
  change: { classification?: string; health?: string } = {},
): string {
  let source = fixture('manifest.yaml')
  if (
    !/^name: .*$/m.test(source) ||
    !/^ {2}classification: internal$/m.test(source) ||
    !/^ {2}health: \/healthz$/m.test(source)
  )
    throw new JourneyStop(
      'the fixture manifest.yaml has no top-level name, is not internal, or has no /healthz',
    )
  source = source.replace(/^name: .*$/m, `name: ${slug}`)
  if (change.classification !== undefined)
    source = source.replace(
      /^ {2}classification: internal$/m,
      `  classification: ${change.classification}`,
    )
  if (change.health !== undefined)
    source = source.replace(/^ {2}health: \/healthz$/m, `  health: ${change.health}`)
  return source
}

/**
 * One GET over a CHOSEN ADDRESS, with the hostname as SNI and Host — so the demo can ask the
 * internal listener (127.0.0.2) or the public one (127.0.0.3) for a name, which is §12's split seen
 * from the outside. `fetch` cannot pin an address. A FRESH SOCKET every time (production.ts
 * measured the pool answering the second probe over the first's socket).
 */
function probe(
  address: string,
  host: string,
  pathname: string,
): Promise<{ status: number; instance: string | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host,
        servername: host,
        path: pathname,
        agent: false,
        lookup: (_host, options, callback) =>
          options.all
            ? (callback as (e: null, a: { address: string; family: number }[]) => void)(
                null,
                [{ address, family: 4 }],
              )
            : (callback as (e: null, a: string, f: number) => void)(null, address, 4),
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
    req.on('timeout', () => req.destroy(new Error(`${host} did not answer in 10 s`)))
    req.on('error', reject)
    req.end()
  })
}

async function readiness(client: ManifestClient): Promise<Schemas['LaunchReadiness']> {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/launch-readiness', {
      params: { path: { projectId: projectId() } },
    }),
    'getLaunchReadiness',
  )
}

function item(r: Schemas['LaunchReadiness'], id: string): Schemas['LaunchReadinessItem'] {
  return (
    r.items.find((i) => i.id === id) ??
    checks.must<Schemas['LaunchReadinessItem']>(
      `the checklist has its ${id} item`,
      undefined,
    )
  )
}

/** A checklist's unmet BLOCKING ids, sorted — asserted as ids, never counted. */
function unmetBlocking(r: Schemas['LaunchReadiness']): string[] {
  return r.items
    .filter((i) => i.blocking && i.state !== 'met')
    .map((i) => i.id)
    .sort()
}

async function records(client: ManifestClient): Promise<Schemas['LaunchRecords']> {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/launch-records', {
      params: { path: { projectId: projectId() } },
    }),
    'getLaunchRecords',
  )
}

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

async function waitForBuild(
  client: ManifestClient,
  buildId: string,
): Promise<Schemas['Build']> {
  const deadline = Date.now() + BUILD_ENDS_WITHIN_MS
  for (;;) {
    const build = unwrap(
      await client.GET('/v1/builds/{buildId}', { params: { path: { buildId } } }),
      'getBuild',
    )
    if (build.status === 'succeeded' || build.status === 'failed') return build
    if (Date.now() > deadline) return build
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}

/** A build of `commitSha`, waited for. */
async function build(
  client: ManifestClient,
  commitSha: string,
): Promise<Schemas['Build']> {
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
  const startedAt = Date.now()
  const ended = await waitForBuild(client, started.id)
  console.log(`  (build ${ended.status} in ${Date.now() - startedAt} ms)`)
  return ended
}

async function release(
  client: ManifestClient,
  buildId: string,
  summary: string,
): Promise<Schemas['Release']> {
  return unwrap(
    await client.POST('/v1/projects/{projectId}/releases', {
      params: {
        path: { projectId: projectId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { buildId, summary },
    }),
    'createRelease',
  )
}

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

async function queueFor(admin: ManifestClient): Promise<Schemas['Queue']> {
  return unwrap(await admin.GET('/v1/queue'), 'listQueue')
}

/**
 * The project's items in the administrators' queue, by kind. THE QUEUE SPANS EVERY PROJECT — another
 * demo's or a person's records wait there too — so they are filtered to this one, and the WHOLE queue
 * is checked oldest first.
 */
function ours(queue: Schemas['Queue']): Schemas['QueueItem'][] {
  return queue.items.filter((i) => i.project.id === state.projectId)
}

function checkOldestFirst(queue: Schemas['Queue']): void {
  const sinces = queue.items.map((i) => Date.parse(i.since))
  checks.ok(
    'the whole queue is oldest first, and oldestSince is its first item’s',
    sinces.every((s, i) => i === 0 || sinces[i - 1]! <= s) &&
      queue.oldestSince === (queue.items[0]?.since ?? null),
    queue.items.map((i) => `${i.kind}@${i.since}`).join(' '),
  )
}

const kindsOf = (items: Schemas['QueueItem'][]) =>
  items.map((i) => `${i.kind}${i.environment === null ? '' : `:${i.environment}`}`).sort()

// ─── find, clear ───────────────────────────────────────────────────────────────────────

async function findPhase(): Promise<void> {
  checks.step('1. The instructor’s project — here already, or not')
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
    return
  }
  state.projectId = found.id
  state.existing =
    found.launchedAt !== undefined && found.launchedAt !== null
      ? 'launched'
      : 'unlaunched'
  console.log(
    state.existing === 'launched'
      ? `  ${state.slug} launched on ${found.launchedAt} — the RE-USE path`
      : `  ${state.slug} is here from a run that did not launch it — it is deleted and made again`,
  )
}

async function clearPhase(): Promise<void> {
  checks.step('1. A project an earlier run left unlaunched is deleted')
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
}

// ─── owner: steps 1–4 ──────────────────────────────────────────────────────────────────

/**
 * Step 1: the project from the bare skeleton, the office-hours app committed, built, released, and
 * deployed to sandbox and staging — and staging answering as the APP, through the edge.
 */
async function step1Staging(): Promise<void> {
  const slug = checks.must('the slug, from find', state.slug)
  checks.step(
    `1. The instructor creates ${slug}, commits the app, and deploys it to staging`,
  )
  const owner = clientFor('MANIFEST_SESSION')
  const created = unwrap(
    await owner.POST('/v1/projects', {
      params: { header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        slug,
        name: 'Office hours',
        blueprint: 'node-ts-mongo@1',
        audience: {
          scale: 'class',
          burst: 'synchronised',
          justification:
            'The launch path’s acceptance — a faculty member launches an app themselves',
        },
      },
    }),
    'createProject',
  )
  state.projectId = created.id
  const repository = created.repository
  checks.ok(
    `created on driver ${state.driver === 'local' ? 1 : 2} (${state.driver})`,
    repository?.provider === state.driver,
    JSON.stringify(repository),
  )
  const environments = unwrap(
    await owner.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId: created.id } },
    }),
    'listEnvironments',
  )
  const of = (kind: Schemas['Environment']['kind']) =>
    checks.must(
      `a ${kind} environment`,
      environments.find((e) => e.kind === kind),
    )
  const sandbox = of('sandbox')
  const staging = of('staging')
  const production = of('production')
  state.sandboxEnvironmentId = sandbox.id
  state.stagingEnvironmentId = staging.id
  state.productionEnvironmentId = production.id
  state.stagingHost = staging.hostname
  state.productionHost = production.hostname
  checks.ok(
    `production is ${slug}.manifest.internal`,
    production.hostname === `${slug}.manifest.internal`,
    production.hostname,
  )
  save()

  const written = await commit(owner, 'Office hours: book a slot with CWL', [
    { op: 'write', path: 'manifest.yaml', content: appManifest(slug) },
    { op: 'write', path: 'server.js', content: fixture('server.js') },
  ])
  checks.ok(
    'the app committed, and its manifest.yaml is valid',
    written.spec.appSpecId !== null,
    JSON.stringify(written.spec).slice(0, 300),
  )
  const built = await build(owner, checks.must('the commit', written.commitSha))
  checks.must(
    'the build succeeded, with a digest',
    built.status === 'succeeded' && built.imageDigest ? built : undefined,
    `${built.status}: ${built.error ?? ''}`,
  )
  const candidate = await release(owner, built.id, 'Office hours — the launch candidate')
  state.releaseId = candidate.id
  state.imageDigest = candidate.imageDigest

  // SUBSCRIBE BEFORE THE DEPLOY, so staging's `sso.registered` is seen as it is published — the
  // certificate the IdP was told, which step 2's package must name (Review Focus 2).
  const frames: StreamFrame[] = []
  const stream = subscribe({
    origin,
    session: env('MANIFEST_SESSION'),
    projectId: created.id,
    onFrame: (f) => frames.push(f),
  })
  await stream.ready
  try {
    const onSandbox = await deploy(owner, sandbox.id, candidate.id)
    checks.ok('sandbox is healthy on it', onSandbox.state === 'healthy', onSandbox.state)
    const onStaging = await deploy(owner, staging.id, candidate.id)
    checks.must(
      'staging is healthy on it',
      onStaging.state === 'healthy' ? onStaging : undefined,
      onStaging.state,
    )
    const registered = await waitFor(
      frames,
      (f) =>
        f.kind === 'event' &&
        f.type === 'sso.registered' &&
        f.subject === `sp:${slug}:staging`,
      15_000,
    )
    const detail =
      registered?.kind === 'event'
        ? (registered.machineDetail as {
            certificateFingerprint?: string
            entityId?: string
          })
        : undefined
    state.stagingFingerprint = checks.must(
      'staging’s deploy published sso.registered, with a certificate fingerprint',
      detail?.certificateFingerprint,
      frames
        .filter((f) => f.kind === 'event')
        .map((f) => (f.kind === 'event' ? `${f.type} ${f.subject}` : ''))
        .join('; ')
        .slice(0, 300),
    )
    checks.ok(
      'registered under staging’s entity id',
      detail?.entityId === entityIdOf(slug, 'staging'),
      detail?.entityId,
    )
    // THE APP'S OWN ANSWER: the body and the instance header — the edge's wildcard answers 200 for
    // any name (ORIENTATION §4).
    const answered = await probe('127.0.0.2', staging.hostname, '/healthz')
    checks.ok(
      `${staging.hostname} answers as the app, the instance the deploy started`,
      answered.status === 200 &&
        answered.instance === onStaging.id &&
        answered.body.includes('"mongo":true'),
      `${answered.status} ${answered.instance} ${answered.body.slice(0, 120)}`,
    )
  } finally {
    stream.close()
  }
  save()
  done(1)
}

/**
 * Step 2: the owner drafts all three — the assessment FIRST, in UBC's order — and reads them. Each
 * package names its own environment and the certificate that environment signs with; `sn` is flagged
 * unread; no private key appears anywhere. And a draft never gates a build (Review Focus 1).
 */
async function step2Drafts(): Promise<void> {
  checks.step(
    '2. The owner drafts the assessment, then both registrations, and reads them',
  )
  const owner = clientFor('MANIFEST_SESSION')
  const slug = checks.must('the slug', state.slug)
  const id = projectId()

  const drafted = await owner.POST(
    '/v1/projects/{projectId}/launch-records/privacy-assessment/draft',
    {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    },
  )
  const assessment = unwrap(drafted, 'draftPrivacyAssessment')
  const draft = checks.must('the assessment carries its draft', assessment.draft)
  state.assessmentDraftedAt = draft.generatedAt
  checks.ok(
    `the assessment's six questions, in the Privacy Office's order (${SECTIONS.join(', ')})`,
    draft.sections.map((s) => s.id).join(',') === SECTIONS.join(','),
    draft.sections.map((s) => s.id).join(','),
  )
  const gaps = draft.sections.flatMap((s) => s.gaps)
  checks.ok(
    'it names what only the owner can add',
    gaps.length > 0,
    `${gaps.length} gaps`,
  )
  checks.ok(
    'the assessment is a draft, and no private key is in the answer',
    assessment.state === 'draft' && !PRIVATE_KEY.test(JSON.stringify(drafted.data)),
    assessment.state,
  )

  const packages: Record<
    'staging' | 'production',
    Schemas['IamRegistration']['package']
  > = {
    staging: null,
    production: null,
  }
  for (const environment of ['staging', 'production'] as const) {
    const answered = await owner.POST(
      '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/draft',
      {
        params: {
          path: { projectId: id, environment },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
      },
    )
    const registration = unwrap(answered, 'draftIamRegistration')
    const sent = checks.must(`${environment}'s package`, registration.package)
    packages[environment] = sent
    const host = environment === 'staging' ? state.stagingHost : state.productionHost
    checks.ok(
      `${environment}'s package names ${environment}'s entity id, ACS and SLO — and nothing of the other's`,
      sent.environment === environment &&
        sent.entityId === entityIdOf(slug, environment) &&
        sent.acsUrl === `https://${host}/auth/ubcshib/callback` &&
        sent.sloUrl === `https://${host}/auth/logout`,
      `${sent.environment} ${sent.entityId} ${sent.acsUrl} ${sent.sloUrl}`,
    )
    checks.ok(
      `${environment}'s package lists exactly the attributes the app asks for`,
      sent.attributes
        .map((a) => a.name)
        .sort()
        .join(',') === [...ATTRIBUTES].sort().join(','),
      sent.attributes.map((a) => a.name).join(','),
    )
    const unread = sent.attributes.filter((a) => a.unused).map((a) => a.name)
    checks.ok(
      `${environment}: sn — and only sn — is flagged unread, and warned about before it is sent`,
      unread.join(',') === 'sn' &&
        sent.warnings.some((w) => w.includes('asks for sn and does not read it')),
      `unread [${unread.join(',')}]; ${sent.warnings.join(' | ').slice(0, 300)}`,
    )
    const mail = sent.attributes.find((a) => a.name === 'mail')
    checks.ok(
      `${environment}: mail is justified by the line of server.js that reads it`,
      (mail?.usedAt ?? []).some((u) => u.path === 'server.js') &&
        (mail?.justification ?? '').includes('server.js:'),
      JSON.stringify(mail?.usedAt),
    )
    checks.ok(
      `${environment}: the PIA number is not recorded yet, and the package says so`,
      sent.privacyAssessmentReference === null &&
        sent.warnings.some((w) => w.includes('PIA number is not recorded yet')),
      `${sent.privacyAssessmentReference}`,
    )
    checks.ok(
      `${environment}: a certificate and its fingerprint — and NO private key anywhere in the answer`,
      sent.certificate.pem.startsWith('-----BEGIN CERTIFICATE-----') &&
        sent.certificate.fingerprint.length > 0 &&
        !PRIVATE_KEY.test(JSON.stringify(answered.data)),
      sent.certificate.fingerprint,
    )
  }
  checks.ok(
    'staging’s package carries the certificate staging registered with — sso.registered’s fingerprint',
    packages.staging?.certificate.fingerprint === state.stagingFingerprint,
    `${packages.staging?.certificate.fingerprint} vs ${state.stagingFingerprint}`,
  )
  checks.ok(
    'and each environment has its own certificate',
    packages.staging?.certificate.fingerprint !==
      packages.production?.certificate.fingerprint,
  )

  const r = await readiness(owner)
  checks.ok(
    'the checklist: the assessment is a draft, and must be approved',
    item(r, 'privacy-assessment').why.includes(
      "The assessment is 'draft' and must be 'approved' before anything goes to production.",
    ),
    item(r, 'privacy-assessment').why,
  )
  checks.ok(
    'the checklist: production’s registration is a draft, and must be active',
    item(r, 'iam-registration').why.includes(
      "The registration is 'draft' and must be 'active' before a first production launch.",
    ),
    item(r, 'iam-registration').why,
  )
  checks.ok(
    'admin-approval, while nobody has asked: "Ask an administrator to sign it off (requestApproval)."',
    item(r, 'admin-approval').why.endsWith(
      'Ask an administrator to sign it off (requestApproval).',
    ),
    item(r, 'admin-approval').why,
  )

  // A DRAFT REGISTERS NOTHING (Task 9; Review Focus 1): production's draft row lists no attribute,
  // so a build that checked it would fail on every attribute the app asks for. Only a registration
  // UBC has registered is checked — so this build, of the same commit, succeeds.
  const rebuilt = await build(owner, await headCommit(owner))
  checks.ok(
    'a build after production’s registration was drafted succeeds — a draft never gates a build',
    rebuilt.status === 'succeeded',
    `${rebuilt.status}: ${rebuilt.error ?? ''}`,
  )
  save()
  done(2)
}

/**
 * Step 3: an agent, on a token holding `launch:draft` and `approval:request`, drafts the assessment
 * again and asks for sign-off — and may not say anything was sent: only a person, in their session.
 */
async function step3Token(): Promise<void> {
  checks.step(
    '3. An agent on the owner’s token drafts again and asks for sign-off — and may not say it was sent',
  )
  const owner = clientFor('MANIFEST_SESSION')
  const id = projectId()
  const minted = unwrap(
    await owner.POST('/v1/projects/{projectId}/tokens', {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {
        name: `launch agent ${state.runId}`,
        capabilities: ['project:read', 'launch:draft', 'approval:request'],
        expiresInDays: 1,
      },
    }),
    'mintToken',
  )
  state.tokenId = minted.token.id
  state.tokenSecret = minted.secret
  save()
  const agent = createManifestClient({ origin, token: minted.secret })

  const redrafted = await agent.POST(
    '/v1/projects/{projectId}/launch-records/privacy-assessment/draft',
    {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    },
  )
  const again = unwrap(redrafted, 'draftPrivacyAssessment')
  checks.ok(
    'the token drafts the assessment again: 200, a newer draft',
    redrafted.response.status === 200 &&
      Date.parse(again.draft?.generatedAt ?? '') >
        Date.parse(checks.must('the owner’s draft', state.assessmentDraftedAt)),
    `${redrafted.response.status} ${again.draft?.generatedAt} after ${state.assessmentDraftedAt}`,
  )

  const sent = await agent.POST(
    '/v1/projects/{projectId}/launch-records/privacy-assessment/submission',
    {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { draftGeneratedAt: again.draft?.generatedAt ?? '' },
    },
  )
  checks.ok(
    'the token is refused saying it was sent: 403 TOKEN_CREDENTIAL_REFUSED — a person’s session only',
    refusal(sent, 403, 'TOKEN_CREDENTIAL_REFUSED') !== undefined,
    describe(sent),
  )
  checks.ok(
    'and the assessment is still a draft',
    (await records(owner)).privacyAssessment?.state === 'draft',
  )

  state.note = `Office hours starts on Monday — could this be signed off this week? (${state.runId})`
  const asked = await askForSignOff(
    agent,
    checks.must('the candidate', state.releaseId),
    state.note,
  )
  checks.ok(
    'the token asks an administrator to sign off the candidate (requestApproval: 200, open)',
    asked.done && asked.open,
    JSON.stringify(asked),
  )
  const r = await readiness(owner)
  const approval = item(r, 'admin-approval')
  checks.ok(
    'admin-approval names who asked — the agent on the instructor’s token — and the day, in words',
    approval.why.includes(
      `An agent on Test Instructor’s token asked an administrator to approve it on ${todayInWords()}.`,
    ) && approval.since === (asked.done ? asked.askedAt : null),
    `${approval.why} (since ${approval.since})`,
  )
  checks.ok(
    'and the note is for administrators alone — it is not in the checklist',
    !JSON.stringify(r).includes(state.note),
  )
  save()
  done(3)
}

/**
 * Step 4: the owner says the assessment was sent — naming the draft they read, which is the agent's
 * now. UBC's order holds: neither registration may be sent before the assessment is approved.
 */
async function step4AssessmentSent(): Promise<void> {
  checks.step(
    '4. The owner says the assessment was sent — and UBC’s order holds the registrations',
  )
  const owner = clientFor('MANIFEST_SESSION')
  const id = projectId()
  const current = checks.must(
    'the assessment’s current draft',
    (await records(owner)).privacyAssessment?.draft?.generatedAt,
  )

  const stale = await sayItWasSent(owner, id, 'privacy-assessment', {
    draftGeneratedAt: checks.must('the owner’s first draft', state.assessmentDraftedAt),
  })
  checks.ok(
    'naming the draft the owner read BEFORE the agent drafted again: 409 LAUNCH_DRAFT_CHANGED',
    !stale.done && stale.refused === 'LAUNCH_DRAFT_CHANGED',
    JSON.stringify(stale),
  )
  const sent = await sayItWasSent(owner, id, 'privacy-assessment', {
    draftGeneratedAt: current,
    sentAt: today(),
  })
  checks.must(
    'naming the current draft, sent today: recorded',
    sent.done ? sent : undefined,
    JSON.stringify(sent),
  )
  const r = await readiness(owner)
  const pia = item(r, 'privacy-assessment')
  checks.ok(
    `the checklist: "It was sent to the UBC Privacy Office on ${todayInWords()}." — and waiting since then`,
    pia.why.startsWith(`It was sent to the UBC Privacy Office on ${todayInWords()}.`) &&
      pia.since === (sent.done ? sent.submittedAt : null),
    `${pia.why} (since ${pia.since})`,
  )

  for (const environment of ['staging', 'production'] as const) {
    const generatedAt = checks.must(
      `${environment}'s draft`,
      (environment === 'staging'
        ? (await records(owner)).stagingRegistration
        : (await records(owner)).iamRegistration
      )?.package?.generatedAt,
    )
    const early = await sayItWasSent(owner, id, environment, {
      draftGeneratedAt: generatedAt,
    })
    checks.ok(
      `${environment}'s registration may not be sent yet: 409 LAUNCH_PIA_NOT_APPROVED, saying what to do first`,
      !early.done && early.refused === 'LAUNCH_PIA_NOT_APPROVED' && early.next.length > 0,
      JSON.stringify(early),
    )
  }
  save()
  done(4)
}

// ─── admin: steps 5–6 ──────────────────────────────────────────────────────────────────

/** Step 5: the administrators' queue — the assessment and the sign-off request — and the PIA approved. */
async function step5Queue(): Promise<void> {
  checks.step(
    '5. The administrators’ queue, and the assessment recorded approved with its PIA number',
  )
  const owner = clientFor('MANIFEST_SESSION')
  const admin = clientFor('MANIFEST_ADMIN_SESSION')
  const me = unwrap(await admin.GET('/v1/me'), 'getMe')
  checks.ok('the operator is an administrator', me.role === 'admin', me.role)

  const refused = await owner.GET('/v1/queue')
  checks.ok(
    'the owner may not read the queue: 403 FORBIDDEN',
    refusal(refused, 403, 'FORBIDDEN') !== undefined,
    describe(refused),
  )
  const queue = await queueFor(admin)
  checkOldestFirst(queue)
  const mine = ours(queue)
  checks.ok(
    'this app waits on the administrators twice: the assessment with the Privacy Office, and the sign-off request',
    kindsOf(mine).join(',') === 'privacy-assessment,release-approval',
    kindsOf(mine).join(','),
  )
  const request = mine.find((i) => i.kind === 'release-approval')
  checks.ok(
    'the sign-off request carries its note, for administrators',
    request !== undefined &&
      request.note === state.note &&
      request.subjectId === state.releaseId,
    JSON.stringify(request),
  )
  const assessmentItem = mine.find((i) => i.kind === 'privacy-assessment')
  checks.ok(
    'the assessment’s item says it was sent, and to record the answer',
    (assessmentItem?.summary ?? '').startsWith(
      `The privacy assessment was sent to the UBC Privacy Office on ${todayInWords()}`,
    ),
    assessmentItem?.summary,
  )

  state.piaNumber = `PIA-${state.runId}`
  const approved = unwrap(
    await admin.POST('/v1/projects/{projectId}/launch-records/privacy-assessment', {
      params: {
        path: { projectId: projectId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {
        state: 'approved',
        reviewer: 'UBC Privacy Office',
        externalTicketRef: state.piaNumber,
      },
    }),
    'recordPrivacyAssessment',
  )
  checks.ok(
    'the assessment is approved, with its PIA number',
    approved.state === 'approved' && approved.externalTicketRef === state.piaNumber,
    `${approved.state} ${approved.externalTicketRef}`,
  )
  const after = ours(await queueFor(admin))
  checks.ok(
    'and it leaves the queue — the sign-off request still waits',
    kindsOf(after).join(',') === 'release-approval',
    kindsOf(after).join(','),
  )
  save()
  done(5)
}

/**
 * Step 6: the two registrations, in UBC's order — each drafted again once the PIA number exists, sent
 * by the owner, waiting in the queue, and recorded active by an administrator from the package.
 */
async function step6Registrations(): Promise<void> {
  checks.step(
    '6. Staging’s registration, then production’s — sent in UBC’s order, and recorded active',
  )
  const owner = clientFor('MANIFEST_SESSION')
  const admin = clientFor('MANIFEST_ADMIN_SESSION')
  const id = projectId()

  const stagingBefore = checks.must(
    'staging’s first draft',
    (await records(owner)).stagingRegistration?.package?.generatedAt,
  )
  const stale = await sayItWasSent(owner, id, 'staging', {
    draftGeneratedAt: stagingBefore,
  })
  checks.ok(
    'staging’s draft from before the PIA number: 409 LAUNCH_DRAFT_STALE — draft it again',
    !stale.done && stale.refused === 'LAUNCH_DRAFT_STALE',
    JSON.stringify(stale),
  )

  for (const environment of ['staging', 'production'] as const) {
    const answered = unwrap(
      await owner.POST(
        '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/draft',
        {
          params: {
            path: { projectId: id, environment },
            header: { 'Idempotency-Key': idempotencyKey() },
          },
        },
      ),
      'draftIamRegistration',
    )
    const sent = checks.must(`${environment}'s package, drafted again`, answered.package)
    checks.ok(
      `${environment}'s package carries the PIA number now, and no warning about it`,
      sent.privacyAssessmentReference === state.piaNumber &&
        !sent.warnings.some((w) => w.includes('PIA number')),
      `${sent.privacyAssessmentReference}; ${sent.warnings.join(' | ').slice(0, 200)}`,
    )
    if (environment === 'production') {
      const early = await sayItWasSent(owner, id, 'production', {
        draftGeneratedAt: sent.generatedAt,
      })
      checks.ok(
        'production’s may not be sent while staging’s is not active: 409 LAUNCH_STAGING_NOT_REGISTERED',
        !early.done && early.refused === 'LAUNCH_STAGING_NOT_REGISTERED',
        JSON.stringify(early),
      )
      // Staging's, recorded active by an administrator, from staging's package.
      const staging = checks.must(
        'staging’s package',
        (await records(owner)).stagingRegistration?.package,
      )
      const recorded = unwrap(
        await admin.POST('/v1/projects/{projectId}/launch-records/iam-registration', {
          params: {
            path: { projectId: id },
            header: { 'Idempotency-Key': idempotencyKey() },
          },
          body: {
            environment: 'staging',
            entityId: staging.entityId,
            acsUrl: staging.acsUrl,
            sloUrl: staging.sloUrl,
            registeredAttributes: staging.attributes.map((a) => a.name),
            state: 'active',
            externalTicketRef: `IAM-STG-${state.runId}`,
          },
        }),
        'recordIamRegistration',
      )
      checks.ok(
        'an administrator records staging’s registration active',
        recorded.state === 'active' && recorded.environment === 'staging',
        `${recorded.environment} ${recorded.state}`,
      )
      checks.ok(
        'and it leaves the queue',
        !ours(await queueFor(admin)).some(
          (i) => i.kind === 'iam-registration' && i.environment === 'staging',
        ),
      )
    }
    const said = await sayItWasSent(owner, id, environment, {
      draftGeneratedAt: sent.generatedAt,
      sentAt: today(),
    })
    checks.must(
      `the owner says ${environment}'s was sent today: recorded`,
      said.done ? said : undefined,
      JSON.stringify(said),
    )
    const queue = await queueFor(admin)
    checkOldestFirst(queue)
    checks.ok(
      `${environment}'s registration waits in the queue beside the sign-off request`,
      kindsOf(ours(queue)).join(',') ===
        `iam-registration:${environment},release-approval`,
      kindsOf(ours(queue)).join(','),
    )
    if (environment === 'production') {
      const iam = item(await readiness(owner), 'iam-registration')
      checks.ok(
        `the checklist: "It was sent to UBC IAM on ${todayInWords()}." — and waiting since then`,
        iam.why.startsWith(`It was sent to UBC IAM on ${todayInWords()}.`) &&
          iam.since === (said.done ? said.submittedAt : null),
        `${iam.why} (since ${iam.since})`,
      )
    }
  }

  const production = checks.must(
    'production’s package',
    (await records(owner)).iamRegistration?.package,
  )
  const recorded = unwrap(
    await admin.POST('/v1/projects/{projectId}/launch-records/iam-registration', {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {
        environment: 'production',
        entityId: production.entityId,
        acsUrl: production.acsUrl,
        sloUrl: production.sloUrl,
        registeredAttributes: production.attributes.map((a) => a.name),
        state: 'active',
        externalTicketRef: `IAM-PRD-${state.runId}`,
      },
    }),
    'recordIamRegistration',
  )
  checks.ok(
    'an administrator records production’s registration active, listing the four attributes',
    recorded.state === 'active' &&
      recorded.registeredAttributes.slice().sort().join(',') ===
        [...ATTRIBUTES].sort().join(','),
    JSON.stringify(recorded.registeredAttributes),
  )
  const r = await readiness(owner)
  checks.ok(
    'the checklist: both records met — what is left is the rehearsal and the sign-off',
    unmetBlocking(r).join(',') === 'admin-approval,rehearsal' &&
      item(r, 'iam-registration').state === 'met' &&
      item(r, 'privacy-assessment').state === 'met',
    `${unmetBlocking(r).join(',')}; ${item(r, 'iam-registration').why}`,
  )
  checks.ok(
    'and only the sign-off request still waits on the administrators',
    kindsOf(ours(await queueFor(admin))).join(',') === 'release-approval',
  )
  save()
  done(6)
}

// ─── launch: steps 7–8 ─────────────────────────────────────────────────────────────────

/** Step 7: the rehearsal, a stored preview, and the approval — stepped up — and the request answered. */
async function step7Approve(): Promise<void> {
  checks.step(
    '7. The administrator rehearses the sign-in, reads a preview, and approves — stepped up',
  )
  const admin = clientFor('MANIFEST_ADMIN_SESSION_STEPPED')
  const slug = checks.must('the slug', state.slug)
  const releaseId = checks.must('the candidate', state.releaseId)
  const rehearsal = unwrap(
    // The operator is not a member of the instructor's app, so they say why (§26; the faculty-ready
    // plan's Task 10). Approving and recording are their own duties, and ask nothing.
    await admin.POST('/v1/projects/{projectId}/rehearsal', {
      params: {
        path: { projectId: projectId() },
        header: {
          'Idempotency-Key': idempotencyKey(),
          'Manifest-Admin-Reason':
            'Rehearsing the launch the instructor asked to sign off',
        },
      },
    }),
    'runRehearsal',
  )
  const e = rehearsal.evidence
  console.log(
    `  rehearsal: passed=${rehearsal.passed}; ${e.hostname} on the ${e.listener} listener, sign-in ${e.signInStatus}, released [${[...e.attributesReleased].sort().join(', ')}] — ${e.reason}`,
  )
  checks.ok(
    'the rehearsal passed, of the candidate, on the public listener, under production’s entity id',
    rehearsal.passed &&
      rehearsal.releaseId === releaseId &&
      e.listener === 'public' &&
      rehearsal.entityId === entityIdOf(slug, 'production'),
    `${rehearsal.passed} ${rehearsal.releaseId} ${e.listener} ${rehearsal.entityId}`,
  )
  checks.ok(
    'a real sign-in released exactly the four registered attributes',
    e.signInStatus === 200 &&
      [...e.attributesReleased].sort().join(',') === [...ATTRIBUTES].sort().join(','),
    `${e.signInStatus} [${e.attributesReleased.join(', ')}]`,
  )
  const preview = unwrap(
    await admin.POST('/v1/releases/{releaseId}/approval-preview', {
      params: { path: { releaseId }, header: { 'Idempotency-Key': idempotencyKey() } },
    }),
    'createApprovalPreview',
  )
  const approval = unwrap(
    await admin.POST('/v1/releases/{releaseId}/approve', {
      params: { path: { releaseId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        reason: 'Every blocking item met — the launch path’s acceptance',
        previewId: preview.id,
      },
    }),
    'approveRelease',
  )
  checks.ok(
    'approved, bound to the candidate’s digest, exactly as previewed',
    approval.decision === 'approved' &&
      approval.imageDigest === state.imageDigest &&
      approval.previewId === preview.id,
    `${approval.decision} ${approval.imageDigest} ${approval.previewId}`,
  )
  checks.ok(
    'the sign-off request is answered — it leaves the queue',
    !ours(await queueFor(admin)).some((i) => i.kind === 'release-approval'),
  )
  const r = await readiness(admin)
  checks.ok(
    'the checklist: ready, nothing blocking unmet',
    r.ready && unmetBlocking(r).length === 0,
    unmetBlocking(r).join(','),
  )
  save()
  done(7)
}

/** Step 8: the owner launches — and the app, not the wildcard, answers on the public listener. */
async function step8Launch(): Promise<void> {
  checks.step('8. The owner deploys to production — stepped up')
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const host = checks.must('production’s host', state.productionHost)
  const instance = await deploy(
    owner,
    checks.must('production', state.productionEnvironmentId),
    checks.must('the candidate', state.releaseId),
  )
  checks.must(
    'the production instance is healthy',
    instance.state === 'healthy' ? instance : undefined,
    instance.state,
  )
  state.productionInstanceId = instance.id
  const pub = await probe('127.0.0.3', host, '/healthz')
  checks.ok(
    `${host} answers on the PUBLIC listener (127.0.0.3) as the instance the deploy started`,
    pub.status === 200 &&
      pub.instance === instance.id &&
      pub.body.includes('"mongo":true'),
    `${pub.status} ${pub.instance} ${pub.body.slice(0, 120)}`,
  )
  const internal = await probe('127.0.0.2', host, '/healthz')
  checks.ok(
    'and the same name on the INTERNAL listener is not the app',
    internal.instance === undefined && !internal.body.includes('"mongo":true'),
    `${internal.status} ${internal.instance} ${internal.body.slice(0, 120)}`,
  )
  const r = await readiness(owner)
  checks.ok('the checklist reads launched, and ready', r.launched && r.ready)
  save()
  done(8)
}

// ─── reuse: a project that launched ────────────────────────────────────────────────────

/**
 * Steps 1–8 ON A PROJECT THAT LAUNCHED: what a launch durably is — the three records, production
 * serving an approved release on the public listener, and nothing of the app's left waiting on the
 * administrators. Then steps 9–11 run as on the fresh path.
 */
async function reusePhase(): Promise<void> {
  checks.step('1–8. The app launched on an earlier run — what that launch durably is')
  const owner = clientFor('MANIFEST_SESSION')
  const admin = clientFor('MANIFEST_ADMIN_SESSION')
  const id = projectId()
  const environments = unwrap(
    await owner.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId: id } },
    }),
    'listEnvironments',
  )
  const of = (kind: Schemas['Environment']['kind']) =>
    checks.must(
      `a ${kind} environment`,
      environments.find((e) => e.kind === kind),
    )
  const production = of('production')
  state.sandboxEnvironmentId = of('sandbox').id
  state.stagingEnvironmentId = of('staging').id
  state.productionEnvironmentId = production.id
  state.stagingHost = of('staging').hostname
  state.productionHost = production.hostname
  const kept = await records(owner)
  checks.ok(
    'the assessment approved, and both registrations active',
    kept.privacyAssessment?.state === 'approved' &&
      kept.stagingRegistration?.state === 'active' &&
      kept.iamRegistration?.state === 'active',
    `${kept.privacyAssessment?.state} ${kept.stagingRegistration?.state} ${kept.iamRegistration?.state}`,
  )
  const serving = checks.must(
    'production serves an instance',
    unwrap(
      await owner.GET('/v1/environments/{environmentId}', {
        params: { path: { environmentId: production.id } },
      }),
      'getEnvironment',
    ).instance ?? undefined,
  )
  state.releaseId = serving.releaseId
  const approval = unwrap(
    await owner.GET('/v1/releases/{releaseId}/approval', {
      params: { path: { releaseId: serving.releaseId } },
    }),
    'getApproval',
  )
  checks.ok(
    'the release production serves was approved',
    approval.decision === 'approved',
    approval.decision,
  )
  const pub = await probe('127.0.0.3', production.hostname, '/healthz')
  checks.ok(
    'the public listener answers as the instance production serves',
    pub.status === 200 && pub.instance === serving.id,
    `${pub.status} ${pub.instance} ${pub.body.slice(0, 120)}`,
  )
  checks.ok(
    'and nothing of the app waits on the administrators',
    ours(await queueFor(admin)).length === 0,
    kindsOf(ours(await queueFor(admin))).join(','),
  )
  save()
  done(8)
}

// ─── people: step 9 ────────────────────────────────────────────────────────────────────

/** Resolves with the close code, or `undefined` if the stream is still open after `ms`. */
async function closedWithin(
  stream: { closed: Promise<{ code: number }> },
  ms: number,
): Promise<number | undefined> {
  return Promise.race([
    stream.closed.then((c) => c.code),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ])
}

/**
 * Step 9: a credential that is gone stops hearing the project AT ONCE (Review Focus 3) — a revoked
 * token's stream closes 4401; a person removed from the project has their tokens there revoked, their
 * token's stream closed 4401, and their own session's stream closed 4404.
 */
async function step9People(): Promise<void> {
  checks.step('9. A revoked token, and a removed colleague, stop hearing the app at once')
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const colleague = clientFor('MANIFEST_COLLEAGUE_SESSION')
  const id = projectId()

  // Step 3's token, if this run made one: its request is answered, and it is done with.
  const mint = async (client: ManifestClient, name: string) =>
    unwrap(
      await client.POST('/v1/projects/{projectId}/tokens', {
        params: {
          path: { projectId: id },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
        body: { name, capabilities: ['project:read'], expiresInDays: 1 },
      }),
      'mintToken',
    )
  const watcher =
    state.tokenId !== undefined && state.tokenSecret !== undefined
      ? { id: state.tokenId, secret: state.tokenSecret }
      : await mint(owner, `launch watcher ${state.runId}`).then((m) => ({
          id: m.token.id,
          secret: m.secret,
        }))
  const onToken = subscribe({
    origin,
    token: watcher.secret,
    projectId: id,
    onFrame: () => undefined,
  })
  await onToken.ready
  const revokedAt = Date.now()
  unwrap(
    await owner.DELETE('/v1/tokens/{tokenId}', {
      params: {
        path: { tokenId: watcher.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    }),
    'revokeToken',
  )
  const tokenClose = await closedWithin(onToken, 2_000)
  checks.ok(
    'the owner revokes the token: its open stream closes 4401 within a second or two',
    tokenClose === 4401,
    `${tokenClose ?? 'still open'} after ${Date.now() - revokedAt} ms`,
  )
  delete state.tokenId
  delete state.tokenSecret
  save()
  const again = subscribe({
    origin,
    token: watcher.secret,
    projectId: id,
    onFrame: () => undefined,
  })
  checks.ok(
    'and a new stream on it is refused',
    await again.ready.then(
      () => false,
      () => true,
    ),
  )

  // The colleague: off the project first if an earlier run left them on it.
  const listed = unwrap(
    await owner.GET('/v1/projects/{projectId}/members', {
      params: { path: { projectId: id } },
    }),
    'listMembers',
  )
  const left = listed.find((m) => m.puid === 'col000001')
  if (left !== undefined) {
    unwrap(
      await owner.DELETE('/v1/projects/{projectId}/members/{userId}', {
        params: {
          path: { projectId: id, userId: left.userId },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
      }),
      'removeMember',
    )
    console.log(
      '  (the colleague was on the project from an earlier run — removed first)',
    )
  }
  const added = await owner.POST('/v1/projects/{projectId}/members', {
    params: { path: { projectId: id }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: { cwlLogin: 'colleague', role: 'collaborator' },
  })
  const member = unwrap(added, 'addMember')
  checks.ok(
    'the owner adds the colleague as a collaborator (201)',
    added.response.status === 201 &&
      member.role === 'collaborator' &&
      member.puid === 'col000001',
    `${added.response.status} ${member.role} ${member.puid}`,
  )
  const theirs = await mint(colleague, `colleague's agent ${state.runId}`)
  const theirToken = createManifestClient({ origin, token: theirs.secret })
  checks.ok(
    'the colleague mints a token on the project, and it reads the project',
    (
      await theirToken.GET('/v1/projects/{projectId}', {
        params: { path: { projectId: id } },
      })
    ).response.status === 200,
  )
  const onTheirToken = subscribe({
    origin,
    token: theirs.secret,
    projectId: id,
    onFrame: () => undefined,
  })
  const onTheirSession = subscribe({
    origin,
    session: env('MANIFEST_COLLEAGUE_SESSION'),
    projectId: id,
    onFrame: () => undefined,
  })
  await Promise.all([onTheirToken.ready, onTheirSession.ready])
  const removedAt = Date.now()
  unwrap(
    await owner.DELETE('/v1/projects/{projectId}/members/{userId}', {
      params: {
        path: { projectId: id, userId: member.userId },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    }),
    'removeMember',
  )
  const [sessionClose, theirTokenClose] = await Promise.all([
    closedWithin(onTheirSession, 2_000),
    closedWithin(onTheirToken, 2_000),
  ])
  checks.ok(
    'the owner removes the colleague: their session’s stream closes 4404',
    sessionClose === 4404,
    `${sessionClose ?? 'still open'} after ${Date.now() - removedAt} ms`,
  )
  checks.ok(
    'and their token’s stream closes 4401 — their token there is revoked',
    theirTokenClose === 4401,
    `${theirTokenClose ?? 'still open'}`,
  )
  const afterwards = await theirToken.GET('/v1/projects/{projectId}', {
    params: { path: { projectId: id } },
  })
  checks.ok(
    'their token is answered 401 UNAUTHENTICATED now',
    refusal(afterwards, 401, 'UNAUTHENTICATED') !== undefined,
    describe(afterwards),
  )
  const theirRead = await colleague.GET('/v1/projects/{projectId}', {
    params: { path: { projectId: id } },
  })
  checks.ok(
    'and the project is not theirs to read: 404 NOT_FOUND',
    refusal(theirRead, 404, 'NOT_FOUND') !== undefined,
    describe(theirRead),
  )
  save()
  done(9)
}

// ─── instances: step 10 ────────────────────────────────────────────────────────────────

/**
 * Step 10: every instance says when it was made (FE-38) — and an attempt that FAILED after the
 * serving one is newer than it, though a list ordered by `lastSeenAt` puts it last. In SANDBOX, so
 * staging's candidate and production are untouched.
 */
async function step10Instances(): Promise<void> {
  checks.step(
    '10. Every instance says when it was made — a failed attempt newer than the one serving',
  )
  const owner = clientFor('MANIFEST_SESSION')
  const slug = checks.must('the slug', state.slug)
  const sandboxId = checks.must('sandbox', state.sandboxEnvironmentId)
  const serving = await deploy(
    owner,
    sandboxId,
    checks.must('a release', state.releaseId),
  )
  checks.must(
    'sandbox serves the launched release, healthy',
    serving.state === 'healthy' ? serving : undefined,
    serving.state,
  )

  const broken = await commit(owner, 'A health check that never answers', [
    {
      op: 'write',
      path: 'manifest.yaml',
      content: appManifest(slug, { health: '/never-ready' }),
    },
  ])
  const built = await build(owner, checks.must('the commit', broken.commitSha))
  checks.must(
    'it builds',
    built.status === 'succeeded' ? built : undefined,
    `${built.status}: ${built.error ?? ''}`,
  )
  const never = await release(owner, built.id, 'A health check that never answers')
  const askedAt = Date.now()
  const failed = await deploy(owner, sandboxId, never.id)
  checks.ok(
    `the deploy answers failed (after ${Math.round((Date.now() - askedAt) / 1000)} s)`,
    failed.state === 'failed',
    failed.state,
  )
  const listed = unwrap(
    await owner.GET('/v1/environments/{environmentId}/instances', {
      params: { path: { environmentId: sandboxId } },
    }),
    'listInstances',
  )
  checks.ok(
    'every instance carries createdAt',
    listed.instances.length >= 2 &&
      listed.instances.every((i) => !Number.isNaN(Date.parse(i.createdAt))),
    listed.instances
      .map((i) => `${i.id.slice(0, 8)} ${i.state} ${i.createdAt}`)
      .join('; '),
  )
  const attempt0 = listed.instances.find((i) => i.id === failed.id)
  // WHEN IT WAS MADE, NOT WHEN IT WAS LAST SEEN: a failed attempt IS seen — its lastSeenAt is stamped
  // when its deploy gives up, ~90 s after it was made and after the serving instance's — so the order
  // alone cannot tell createdAt from lastSeenAt (sitting 12's control (f) stayed green on it).
  checks.ok(
    'the failed attempt’s createdAt is when its deploy was asked for — not when it was last seen',
    attempt0 !== undefined && Math.abs(Date.parse(attempt0.createdAt) - askedAt) < 10_000,
    `asked ${new Date(askedAt).toISOString()}; created ${attempt0?.createdAt}; last seen ${attempt0?.lastSeenAt}`,
  )
  const servingNow = listed.instances.find((i) => i.serving)
  const attempt = listed.instances.find((i) => i.id === failed.id)
  checks.ok(
    'the serving instance is the healthy one; the failed attempt is newer than it',
    servingNow?.id === serving.id &&
      attempt !== undefined &&
      attempt.state === 'failed' &&
      Date.parse(attempt.createdAt) > Date.parse(servingNow.createdAt),
    `serving ${servingNow?.id.slice(0, 8)} ${servingNow?.createdAt}; failed ${attempt?.id.slice(0, 8)} ${attempt?.createdAt}`,
  )
  // Back to the app as it was, so the next run starts from it.
  await commit(owner, 'Back to the health check that answers', [
    { op: 'write', path: 'manifest.yaml', content: appManifest(slug) },
  ])
  save()
  done(10)
}

// ─── narrow: step 11 ───────────────────────────────────────────────────────────────────

async function chat(
  baseUrl: string,
  key: string,
  model: string,
): Promise<{ status: number; errorType: string }> {
  const answer = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Say ok.' }],
      max_tokens: 4,
    }),
    signal: AbortSignal.timeout(300_000),
  })
  const body = (await answer.json().catch(() => ({}))) as { error?: { type?: string } }
  return { status: answer.status, errorType: body.error?.type ?? '' }
}

/**
 * Step 11: the app is raised to `confidential` while an agent session is open. The session is
 * NARROWED, not ended (Spec action 1): the model a confidential app may not use is refused at once
 * through the SAME key, and a model it keeps still answers (Review Focus 4) — measured by calling it.
 */
async function step11Narrow(): Promise<void> {
  checks.step(
    '11. Raised to confidential with an agent session open — narrowed, not ended',
  )
  const owner = clientFor('MANIFEST_SESSION')
  const slug = checks.must('the slug', state.slug)
  const id = projectId()
  const started = await owner.POST('/v1/projects/{projectId}/agent-sessions', {
    params: { path: { projectId: id }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: { name: `launch narrowing ${state.runId}`, capUsd: 1, durationMinutes: 30 },
  })
  const session = unwrap(started, 'startAgentSession')
  checks.must(
    'an internal app’s session holds default-chat and default-chat-onprem',
    session.session.models.includes('default-chat') &&
      session.session.models.includes('default-chat-onprem')
      ? session
      : undefined,
    session.session.models.join(', '),
  )
  try {
    const before = await chat(session.baseUrl, session.key, 'default-chat')
    checks.ok(
      'default-chat answers through the key',
      before.status === 200,
      JSON.stringify(before),
    )

    const raised = await commit(owner, 'The bookings are confidential', [
      {
        op: 'write',
        path: 'manifest.yaml',
        content: appManifest(slug, { classification: 'confidential' }),
      },
    ])
    checks.ok(
      'the commit raises data.classification',
      raised.spec.sensitiveDiff.fields.includes('data.classification'),
      JSON.stringify(raised.spec.sensitiveDiff),
    )
    const listed = unwrap(
      await owner.GET('/v1/projects/{projectId}/agent-sessions', {
        params: { path: { projectId: id } },
      }),
      'listAgentSessions',
    )
    const now = listed.sessions.find((s) => s.id === session.session.id)
    checks.ok(
      'the session is still open, without default-chat, keeping default-chat-onprem',
      now !== undefined &&
        now.endedAt === null &&
        !now.models.includes('default-chat') &&
        now.models.includes('default-chat-onprem'),
      `${now?.endedAt} [${now?.models.join(', ')}]`,
    )
    const withdrawn = await chat(session.baseUrl, session.key, 'default-chat')
    checks.ok(
      'default-chat through the SAME key is refused at once (403 key_model_access_denied)',
      withdrawn.status === 403 && withdrawn.errorType === 'key_model_access_denied',
      JSON.stringify(withdrawn),
    )
    const kept = await chat(session.baseUrl, session.key, 'default-chat-onprem')
    checks.ok(
      'and default-chat-onprem still answers',
      kept.status === 200,
      JSON.stringify(kept),
    )
  } finally {
    await owner.DELETE('/v1/agent-sessions/{sessionId}', {
      params: {
        path: { sessionId: session.session.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    })
    // Back to the app as it was — internal — so the next run raises it again.
    await commit(owner, 'Back to internal, for the next run', [
      { op: 'write', path: 'manifest.yaml', content: appManifest(slug) },
    ])
  }
  save()
  done(11)
}

const phases: Record<Phase, (() => Promise<void>)[]> = {
  find: [findPhase],
  clear: [clearPhase],
  owner: [step1Staging, step2Drafts, step3Token, step4AssessmentSent],
  admin: [step5Queue, step6Registrations],
  launch: [step7Approve, step8Launch],
  reuse: [reusePhase],
  people: [step9People],
  instances: [step10Instances],
  narrow: [step11Narrow],
}

try {
  for (const step of phases[phase]) await step()
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
