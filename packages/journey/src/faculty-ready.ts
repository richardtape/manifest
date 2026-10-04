import { readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:https'
import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  subscribe,
  unwrap,
  type ErrorEnvelope,
  type EventFrame,
  type ManifestClient,
  type StreamFrame,
} from '@manifest/contract'
import { Checks, JourneyStop } from './check.js'
import { waitFor } from './wait.js'

/**
 * THE FACULTY-READY PLAN'S ACCEPTANCE (Task 11): what stood between the platform and a real faculty
 * member's first day, each seen through the edge by nothing but the generated client.
 *
 *   node packages/journey/dist/faculty-ready.js <phase> <state.json>
 *
 * Signing in and stepping up are a browser's round trips at the IdP, and that is bash's business
 * (P5a Decision 38): `scripts/demo-faculty-ready.sh` signs people in, steps them up, reads the jars
 * (step 1), asks the app's container what its PID 1 is (step 5) and walks an app's sign-out (step 8)
 * BETWEEN the phases, and hands each phase the sessions it needs.
 *
 *   find       MANIFEST_SESSION                                   is the project here from a run before?
 *   clear      MANIFEST_SESSION_STEPPED                           deletes it, so every run is whole
 *   basics     MANIFEST_SESSION, MANIFEST_CP_LOG (may be empty)  steps 2–3
 *   app        MANIFEST_SESSION                                   step 4, and step 5's first half
 *   admin      MANIFEST_SESSION, MANIFEST_SESSION_STEPPED,
 *              MANIFEST_ADMIN_SESSION, MANIFEST_ADMIN_SESSION_STEPPED   step 6
 *   question   MANIFEST_SESSION, MANIFEST_SESSION_STEPPED          step 7
 *
 * **NOTHING HERE LAUNCHES**, so a project from an earlier run can always be deleted and made again:
 * the fresh path and the re-use path differ only in `clear`, and every step after it runs whole.
 *
 * **ASSERT THE CODE, NEVER THE STATUS** (ORIENTATION §9): `400 ADMIN_REASON_REQUIRED` and `403
 * STEP_UP_REQUIRED` are both a refusal of the same request, and only the code tells them apart.
 *
 * **`MANIFEST_STOP_AFTER=<0–8>`** ends the run after that step — a negative control's short run.
 */

const PHASES = ['find', 'clear', 'basics', 'app', 'admin', 'question'] as const
type Phase = (typeof PHASES)[number]

/** `make demo-launch`'s app, reused: a CWL sign-in and §8's single logout at `/auth/logout`. */
const FIXTURE = new URL('../../../fixtures/launch-path-app/', import.meta.url)
/** Past the builder's own 900 s timeout, as the journey's bound is. */
const BUILD_ENDS_WITHIN_MS = 960_000
/** The administrator's reasons — NOT plain ASCII on purpose: a header carries Latin-1 only (F2 of
 *  sitting 6), so a person's own words reach the platform percent-encoded, and come back decoded. */
const REASON_NOT_MEMBER = 'A student reported the staging page broken — redeploying it'
const REASON_BEYOND_ROLE = 'Adding the TA the owner asked for — they are away this week'

interface ReadyState {
  driver?: string
  slug?: string
  runId?: string
  /** What `find` saw: no project, or one an earlier run left (it is deleted and made again). */
  existing?: 'none' | 'here'
  meId?: string
  projectId?: string
  stagingEnvironmentId?: string
  stagingHost?: string
  releaseId?: string
  /** The instance the OWNER's deploy started — the container step 5 asks about. */
  instanceId?: string
  colleagueUserId?: string
  stopped?: boolean
}

const [phaseArg, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
if (!PHASES.includes(phaseArg as Phase) || statePath === undefined) {
  console.error(`usage: faculty-ready.js <${PHASES.join('|')}> <state.json>`)
  process.exit(2)
}
const phase = phaseArg as Phase
const path: string = statePath
const stopAfter =
  process.env.MANIFEST_STOP_AFTER === undefined || process.env.MANIFEST_STOP_AFTER === ''
    ? undefined
    : Number(process.env.MANIFEST_STOP_AFTER)

const checks = new Checks()
const state: ReadyState = (() => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ReadyState
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

function projectId(): string {
  return state.projectId ?? checks.must<string>('the project, from step 5', undefined)
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

function fixture(file: string): string {
  return readFileSync(new URL(file, FIXTURE), 'utf8')
}

/** The app's `manifest.yaml`, with this project's slug as its name — §7 refuses any other. */
function appManifest(slug: string): string {
  const source = fixture('manifest.yaml')
  if (!/^name: .*$/m.test(source))
    throw new JourneyStop('the fixture manifest.yaml has no top-level name')
  return source.replace(/^name: .*$/m, `name: ${slug}`)
}

/** The event frames of one type — a replay and the live frames alike. */
const eventsOf = (frames: readonly StreamFrame[], type: string): EventFrame[] =>
  frames.filter((f): f is EventFrame => f.kind === 'event' && f.type === type)

/** A frame's `machineDetail` field, whatever the type's own detail is. */
const detailOf = (frame: EventFrame, field: string): unknown =>
  (frame.machineDetail as Record<string, unknown>)[field]

/**
 * One GET to the INTERNAL listener for a name, its hostname as SNI and Host, on a FRESH socket —
 * the app's own answer and the instance that gave it (launch.ts's probe, P6a's lesson about a pooled
 * socket answering for the wrong listener).
 */
function probe(
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
                [{ address: '127.0.0.2', family: 4 }],
              )
            : (callback as (e: null, a: string, f: number) => void)(null, '127.0.0.2', 4),
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

/** The project's event stream as `who` sees it: the replay first, then live frames, into one array. */
async function watch(
  sessionVariable: string,
): Promise<{ frames: StreamFrame[]; close: () => void }> {
  const frames: StreamFrame[] = []
  const stream = subscribe({
    origin,
    session: env(sessionVariable),
    projectId: projectId(),
    onFrame: (f) => frames.push(f),
  })
  await stream.ready
  return { frames, close: () => stream.close() }
}

/** A short wait for a second copy of an event that must arrive once: what "exactly one" waits for. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 2_000))

// ─── find, clear ───────────────────────────────────────────────────────────────────────

async function findPhase(): Promise<void> {
  checks.step('1. The instructor’s project — here from a run before, or not')
  const owner = clientFor('MANIFEST_SESSION')
  const me = unwrap(await owner.GET('/v1/me'), 'getMe')
  checks.ok('signed in as the instructor', me.puid === 'ins000001', me.puid)
  state.meId = me.id
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
  state.existing = 'here'
  console.log(
    `  ${state.slug} is here from a run before — the RE-USE path: it is deleted and made again`,
  )
}

async function clearPhase(): Promise<void> {
  checks.step('1. The project an earlier run left is deleted — nothing here launches')
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const deleted = await owner.DELETE('/v1/projects/{projectId}', {
    params: {
      path: { projectId: projectId() },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
  })
  checks.must(
    `${state.slug} deleted`,
    deleted.response.status === 200 ? true : undefined,
    describe(deleted),
  )
  delete state.projectId
  state.existing = 'none'
}

// ─── basics: steps 2–4 ─────────────────────────────────────────────────────────────────

/**
 * Step 2 (FE-30): a refusal carries its reference twice — `x-request-id` and `error.requestId`, the
 * same UUID — and the control plane wrote ONE operator line with that id and the refusal's code, which
 * is what a support report is matched to. The line is read from the control plane's own output, when
 * the script could find it; when it could not, it says so, and `api/refusal.test.ts` is the witness.
 */
async function step2Reference(): Promise<void> {
  checks.step('2. A refusal carries its reference, and the control plane logged it once')
  const owner = clientFor('MANIFEST_SESSION')
  const missing = await owner.GET('/v1/blueprints/{blueprintRef}', {
    params: { path: { blueprintRef: 'no-such-blueprint@1' } },
  })
  const error = checks.must(
    'an unknown blueprint is 404 NOT_FOUND',
    refusal(missing, 404, 'NOT_FOUND'),
    describe(missing),
  )
  const header = missing.response.headers.get('x-request-id')
  checks.ok(
    'x-request-id is a UUID, and error.requestId is the same one',
    header !== null &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(header) &&
      error.requestId === header,
    `header ${header} body ${error.requestId}`,
  )
  // A success carries one too (Task 3): the header is on every answer, the body only on a refusal.
  const ok = await owner.GET('/v1/me')
  checks.ok(
    'and a success carries an x-request-id of its own',
    ok.response.status === 200 &&
      (ok.response.headers.get('x-request-id') ?? '') !== '' &&
      ok.response.headers.get('x-request-id') !== header,
    `${ok.response.status} ${ok.response.headers.get('x-request-id')}`,
  )

  const log = process.env.MANIFEST_CP_LOG ?? ''
  if (log === '') {
    console.log(
      '  note — the control plane’s output is not a file this demo can read (it found none on 7100’s\n' +
        '         stderr, and DEMO_FACULTY_READY_CP_LOG is unset): the operator line is not checked here.\n' +
        '         api/refusal.test.ts asserts it on every refusal path.',
    )
  } else {
    // The line is written before the answer is sent, but the file is another process's: poll briefly.
    let lines: string[] = []
    const deadline = Date.now() + 5_000
    for (;;) {
      lines = readFileSync(log, 'utf8')
        .split('\n')
        .filter((l) => l.includes(`"requestId":"${header}"`))
      if (lines.length > 0 || Date.now() > deadline) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const line = (() => {
      try {
        return lines.length === 1
          ? (JSON.parse(lines[0]!) as { msg?: string; code?: string; status?: number })
          : undefined
      } catch {
        return undefined
      }
    })()
    checks.ok(
      `the control plane wrote exactly ONE line with that id (${log})`,
      lines.length === 1,
      `${lines.length} line(s)`,
    )
    checks.ok(
      'and it is the refusal’s: msg refused, its code and its status — no body, no credential',
      line?.msg === 'refused' &&
        line.code === 'NOT_FOUND' &&
        line.status === 404 &&
        !lines[0]!.includes(env('MANIFEST_SESSION')),
      lines[0]?.slice(0, 300) ?? '',
    )
  }
  done(2)
}

/** Step 3 (FE-31): the platform's test blueprint is not offered to a person, and still resolves. */
async function step3Blueprints(): Promise<void> {
  checks.step('3. The test blueprint is not offered — and still resolves')
  const owner = clientFor('MANIFEST_SESSION')
  const listed = unwrap(await owner.GET('/v1/blueprints'), 'listBlueprints').map(
    (b) => b.ref,
  )
  checks.ok(
    'listBlueprints offers node-ts-mongo@1 and NOT fixture-node@1',
    listed.includes('node-ts-mongo@1') && !listed.includes('fixture-node@1'),
    listed.join(', '),
  )
  const fixtureNode = await owner.GET('/v1/blueprints/{blueprintRef}', {
    params: { path: { blueprintRef: 'fixture-node@1' } },
  })
  checks.ok(
    'getBlueprint(fixture-node@1) still answers it — every project on it keeps building',
    fixtureNode.response.status === 200 && fixtureNode.data?.ref === 'fixture-node@1',
    fixtureNode.response.status === 200
      ? String(fixtureNode.data?.ref)
      : describe(fixtureNode),
  )
  done(3)
}

/** The project, from the bare `node-ts-mongo@1` skeleton — what steps 4 to 8 act on. */
async function createProject(): Promise<void> {
  const slug = checks.must('the slug, from find', state.slug)
  checks.step(`4. The instructor creates ${slug}`)
  const owner = clientFor('MANIFEST_SESSION')
  const created = unwrap(
    await owner.POST('/v1/projects', {
      params: { header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        slug,
        name: 'Office hours (faculty-ready)',
        blueprint: 'node-ts-mongo@1',
        audience: { scale: 'solo', burst: 'steady' },
      },
    }),
    'createProject',
  )
  state.projectId = created.id
  checks.ok(
    `created on driver ${state.driver === 'local' ? 1 : 2} (${state.driver})`,
    created.repository?.provider === state.driver,
    JSON.stringify(created.repository),
  )
  const staging = checks.must(
    'a staging environment',
    unwrap(
      await owner.GET('/v1/projects/{projectId}/environments', {
        params: { path: { projectId: created.id } },
      }),
      'listEnvironments',
    ).find((e) => e.kind === 'staging'),
  )
  state.stagingEnvironmentId = staging.id
  state.stagingHost = staging.hostname
  save()
}

/**
 * Step 4 (FE-29): a model session's start replayed — its answer lost — is `409
 * AGENT_SESSION_ALREADY_STARTED`, naming the session as a FIELD and never the key — on the project
 * `createProject` has just made.
 */
async function step4Replayed(): Promise<void> {
  checks.step(
    '4. A model session’s start, replayed, names the session it started — never its key',
  )
  const owner = clientFor('MANIFEST_SESSION')
  const key = idempotencyKey()
  const start = () =>
    owner.POST('/v1/projects/{projectId}/agent-sessions', {
      params: { path: { projectId: projectId() }, header: { 'Idempotency-Key': key } },
      body: { name: 'faculty-ready acceptance', capUsd: 1, durationMinutes: 10 },
    })
  const started = unwrap(await start(), 'startAgentSession')
  try {
    const again = await start()
    const error = refusal(again, 409, 'AGENT_SESSION_ALREADY_STARTED')
    checks.ok(
      'the same Idempotency-Key again is 409 AGENT_SESSION_ALREADY_STARTED',
      error !== undefined,
      describe(again),
    )
    checks.ok(
      'and error.session.id is the session the first answer started',
      error?.session?.id === started.session.id,
      JSON.stringify(error?.session),
    )
    checks.ok(
      'and the refusal carries no key — it was in the first answer and nowhere else',
      !JSON.stringify(again.error).includes(started.key),
    )
  } finally {
    // No key left that nobody holds.
    unwrap(
      await owner.DELETE('/v1/agent-sessions/{sessionId}', {
        params: {
          path: { sessionId: started.session.id },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
      }),
      'endAgentSession',
    )
  }
  done(4)
}

// ─── app: step 5's first half ──────────────────────────────────────────────────────────

/**
 * Step 5, first half: the project from the bare skeleton, `make demo-launch`'s app committed, built,
 * released and deployed to staging BY ITS OWNER — whose act names them and asks them nothing (§26) —
 * and staging answering as the app. The script then asks the app's container what its PID 1 is.
 */
async function step5App(): Promise<void> {
  const slug = checks.must('the slug, from find', state.slug)
  checks.step(`5. The instructor commits an app to ${slug} and deploys it to staging`)
  const owner = clientFor('MANIFEST_SESSION')
  const created = { id: projectId() }
  const staging = {
    id: checks.must('staging, from step 4', state.stagingEnvironmentId),
    hostname: checks.must('staging’s hostname, from step 4', state.stagingHost),
  }
  const tree = unwrap(
    await owner.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId: created.id } },
    }),
    'getTree',
  )
  const written = unwrap(
    await owner.POST('/v1/projects/{projectId}/commits', {
      params: {
        path: { projectId: created.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {
        baseCommit: tree.commitSha,
        message: 'Office hours: book a slot with CWL',
        changes: [
          { op: 'write', path: 'manifest.yaml', content: appManifest(slug) },
          { op: 'write', path: 'server.js', content: fixture('server.js') },
        ],
      },
    }),
    'createCommit',
  )
  checks.ok(
    'the app committed, and its manifest.yaml is valid',
    written.spec.appSpecId !== null,
    JSON.stringify(written.spec).slice(0, 300),
  )
  const startedBuild = unwrap(
    await owner.POST('/v1/projects/{projectId}/builds', {
      params: {
        path: { projectId: created.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { commitSha: checks.must('the commit', written.commitSha) },
    }),
    'startBuild',
  )
  const t0 = Date.now()
  let built = startedBuild
  while (built.status !== 'succeeded' && built.status !== 'failed') {
    if (Date.now() - t0 > BUILD_ENDS_WITHIN_MS) break
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    built = unwrap(
      await owner.GET('/v1/builds/{buildId}', {
        params: { path: { buildId: built.id } },
      }),
      'getBuild',
    )
  }
  console.log(`  (build ${built.status} in ${Date.now() - t0} ms)`)
  checks.must(
    'the build succeeded, with a digest',
    built.status === 'succeeded' && built.imageDigest ? built : undefined,
    `${built.status}: ${built.error ?? ''}`,
  )
  const candidate = unwrap(
    await owner.POST('/v1/projects/{projectId}/releases', {
      params: {
        path: { projectId: created.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { buildId: built.id, summary: 'Office hours — the faculty-ready acceptance' },
    }),
    'createRelease',
  )
  state.releaseId = candidate.id

  const stream = await watch('MANIFEST_SESSION')
  try {
    const onStaging = unwrap(
      await owner.POST('/v1/environments/{environmentId}/deploy', {
        params: {
          path: { environmentId: staging.id },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
        body: { releaseId: candidate.id },
      }),
      'deploy',
    )
    state.instanceId = checks.must(
      'staging is healthy on it',
      onStaging.state === 'healthy' ? onStaging.id : undefined,
      onStaging.state,
    )
    const healthy = await waitFor(
      stream.frames,
      (f) =>
        f.kind === 'event' &&
        f.type === 'instance.healthy' &&
        detailOf(f, 'instanceId') === onStaging.id,
      15_000,
    )
    const actor = healthy?.kind === 'event' ? healthy.actor : undefined
    checks.ok(
      'the stream names the owner as who deployed it — no administrator, no reason (§26)',
      actor?.name === 'Test Instructor' &&
        actor.asAdministrator === false &&
        actor.reason === null &&
        actor.token === null,
      JSON.stringify(actor),
    )
    const answered = await probe(staging.hostname, '/healthz')
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
}

// ─── admin: step 6 ─────────────────────────────────────────────────────────────────────

/**
 * Step 6 (§26, Tasks 10 and 15): an administrator acting on another person's project gives a reason,
 * which the project's people see beside their name — first as somebody who is NOT a member, then as a
 * COLLABORATOR, asked nothing for what that role allows and a reason for what it does not.
 */
async function step6Reason(): Promise<void> {
  checks.step(
    '6. An administrator acting on the instructor’s project gives a reason (§26)',
  )
  const owner = clientFor('MANIFEST_SESSION')
  const ownerStepped = clientFor('MANIFEST_SESSION_STEPPED')
  const admin = clientFor('MANIFEST_ADMIN_SESSION')
  const adminStepped = clientFor('MANIFEST_ADMIN_SESSION_STEPPED')
  const adminMe = unwrap(await admin.GET('/v1/me'), 'getMe')
  checks.must(
    'the operator is a platform administrator',
    adminMe.puid === 'opr000001' && adminMe.role === 'admin' ? adminMe : undefined,
    `${adminMe.puid} ${adminMe.role}`,
  )
  const members = () =>
    owner
      .GET('/v1/projects/{projectId}/members', {
        params: { path: { projectId: projectId() } },
      })
      .then((r) => unwrap(r, 'listMembers'))
  checks.ok(
    'and is not a member of it',
    !(await members()).some((m) => m.puid === 'opr000001'),
  )
  const environmentId = checks.must('staging, from step 5', state.stagingEnvironmentId)
  const releaseId = checks.must('the release, from step 5', state.releaseId)

  const stream = await watch('MANIFEST_SESSION')
  try {
    // ─ as somebody who is not a member ─
    const deploy = (reason: string | undefined) =>
      admin.POST('/v1/environments/{environmentId}/deploy', {
        params: {
          path: { environmentId },
          header: {
            'Idempotency-Key': idempotencyKey(),
            ...(reason === undefined
              ? {}
              : { 'Manifest-Admin-Reason': encodeURIComponent(reason) }),
          },
        },
        body: { releaseId },
      })
    const unasked = await deploy(undefined)
    checks.ok(
      'the operator’s deploy WITHOUT a reason is 400 ADMIN_REASON_REQUIRED',
      refusal(unasked, 400, 'ADMIN_REASON_REQUIRED') !== undefined,
      describe(unasked),
    )
    const given = await deploy(REASON_NOT_MEMBER)
    const instance = checks.must(
      'and WITH one — percent-encoded, because it is not plain ASCII — staging is healthy on it',
      given.response.status === 200 && given.data?.state === 'healthy'
        ? given.data
        : undefined,
      given.response.status === 200 ? String(given.data?.state) : describe(given),
    )
    const healthy = await waitFor(
      stream.frames,
      (f) =>
        f.kind === 'event' &&
        f.type === 'instance.healthy' &&
        detailOf(f, 'instanceId') === instance.id,
      15_000,
    )
    const actor = healthy?.kind === 'event' ? healthy.actor : undefined
    checks.ok(
      'the instructor’s stream, LIVE, names the operator acting as an administrator, with the reason as typed',
      actor?.name === 'Test Operator' &&
        actor.asAdministrator === true &&
        actor.reason === REASON_NOT_MEMBER &&
        actor.token === null,
      JSON.stringify(actor),
    )
    checks.ok(
      'and its sentence says so, for a person reading it',
      healthy?.kind === 'event' &&
        healthy.humanMessage.includes(
          `Test Operator acted as a platform administrator — reason: '${REASON_NOT_MEMBER}'`,
        ),
      healthy?.kind === 'event' ? healthy.humanMessage : '(no frame)',
    )

    // ─ as a collaborator (Task 15) ─
    unwrap(
      await ownerStepped.POST('/v1/projects/{projectId}/members', {
        params: {
          path: { projectId: projectId() },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
        body: { puid: 'opr000001', role: 'collaborator' },
      }),
      'addMember',
    )
    checks.ok(
      'the instructor adds the operator as a COLLABORATOR',
      (await members()).some((m) => m.puid === 'opr000001' && m.role === 'collaborator'),
    )
    const renamed = await admin.PATCH('/v1/projects/{projectId}', {
      params: {
        path: { projectId: projectId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { name: `Office hours (faculty-ready, ${state.runId ?? 'run'})` },
    })
    checks.ok(
      'renaming it — a collaborator’s own power — is asked NO reason',
      renamed.response.status === 200,
      describe(renamed),
    )
    const renamedFrame = await waitFor(
      stream.frames,
      (f) => f.kind === 'event' && f.type === 'project.renamed',
      10_000,
    )
    const renamedBy = renamedFrame?.kind === 'event' ? renamedFrame.actor : undefined
    checks.ok(
      'and is recorded as the collaborator’s act, not an administrator’s',
      renamedBy?.name === 'Test Operator' &&
        renamedBy.asAdministrator === false &&
        renamedBy.reason === null,
      JSON.stringify(renamedBy),
    )

    const addColleague = (client: ManifestClient, reason: string | undefined) =>
      client.POST('/v1/projects/{projectId}/members', {
        params: {
          path: { projectId: projectId() },
          header: {
            'Idempotency-Key': idempotencyKey(),
            ...(reason === undefined
              ? {}
              : { 'Manifest-Admin-Reason': encodeURIComponent(reason) }),
          },
        },
        body: { puid: 'col000001', role: 'collaborator' },
      })
    const beyond = await addColleague(admin, undefined)
    const beyondError = refusal(beyond, 400, 'ADMIN_REASON_REQUIRED')
    checks.ok(
      'adding a person — beyond a collaborator’s role — WITHOUT a reason is 400 ADMIN_REASON_REQUIRED',
      beyondError !== undefined,
      describe(beyond),
    )
    checks.ok(
      'and the refusal says it is beyond their role, not that they are no member',
      beyondError?.message.includes('beyond your role') === true,
      beyondError?.message ?? '',
    )
    const unstepped = await addColleague(admin, REASON_BEYOND_ROLE)
    checks.ok(
      'with a reason but no step-up it is 403 STEP_UP_REQUIRED — the reason is asked first',
      refusal(unstepped, 403, 'STEP_UP_REQUIRED') !== undefined,
      describe(unstepped),
    )
    const added = await addColleague(adminStepped, REASON_BEYOND_ROLE)
    checks.ok(
      'with a reason and a step-up, the colleague is added',
      added.response.status === 201 && added.data?.puid === 'col000001',
      describe(added),
    )
    state.colleagueUserId = checks.must(
      'the colleague’s user id',
      (await members()).find((m) => m.puid === 'col000001')?.userId,
    )
    const addedFrame = await waitFor(
      stream.frames,
      (f) =>
        f.kind === 'event' &&
        f.type === 'member.added' &&
        detailOf(f, 'memberId') === state.colleagueUserId,
      10_000,
    )
    const addedBy = addedFrame?.kind === 'event' ? addedFrame.actor : undefined
    checks.ok(
      'and the stream names the operator acting as an administrator, with that reason',
      addedBy?.name === 'Test Operator' &&
        addedBy.asAdministrator === true &&
        addedBy.reason === REASON_BEYOND_ROLE,
      JSON.stringify(addedBy),
    )
  } finally {
    stream.close()
  }
  save()
  done(6)
}

// ─── question: step 7 ──────────────────────────────────────────────────────────────────

/**
 * Step 7 (Tasks 13, 16 and 16b): an agent's question ends when its token does — revoked by its
 * minter — so nobody is told "confirmed" for a request nothing can retry; and a person taken off the
 * project is recorded exactly once, however often the removal is asked.
 */
async function step7Question(): Promise<void> {
  checks.step('7. An agent’s question ends with its token; a removal is recorded once')
  const owner = clientFor('MANIFEST_SESSION')
  const ownerStepped = clientFor('MANIFEST_SESSION_STEPPED')
  const colleague = checks.must('the colleague, from step 6', state.colleagueUserId)

  const minted = unwrap(
    await owner.POST('/v1/projects/{projectId}/tokens', {
      params: {
        path: { projectId: projectId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {
        name: `faculty-ready acceptance ${state.runId ?? ''}`,
        capabilities: [
          'project:read',
          'build:create',
          'release:create',
          'release:deploy',
        ],
        expiresInDays: 1,
      },
    }),
    'mintToken',
  )
  const agent = createManifestClient({ origin, token: minted.secret })
  const stream = await watch('MANIFEST_SESSION')
  try {
    const asked = await agent.POST('/v1/projects/{projectId}/members', {
      params: {
        path: { projectId: projectId() },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { puid: 'col000002', role: 'collaborator' },
    })
    const question = checks.must(
      'the agent asks to add a person — 403 TOKEN_ACTION_PENDING, a question for a person',
      refusal(asked, 403, 'TOKEN_ACTION_PENDING')?.pendingAction,
      describe(asked),
    )
    unwrap(
      await owner.DELETE('/v1/tokens/{tokenId}', {
        params: {
          path: { tokenId: minted.token.id },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
      }),
      'revokeToken',
    )
    const read = unwrap(
      await owner.GET('/v1/pending-actions/{pendingActionId}', {
        params: { path: { pendingActionId: question.id } },
      }),
      'getPendingAction',
    )
    checks.ok(
      'its minter revokes the token, and the question reads expired',
      read.state === 'expired',
      read.state,
    )
    const lateYes = await ownerStepped.POST(
      '/v1/pending-actions/{pendingActionId}/confirm',
      {
        params: {
          path: { pendingActionId: question.id },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
        body: {},
      },
    )
    checks.ok(
      'the instructor’s yes is 409 PENDING_ACTION_RESOLVED — never "confirmed"',
      refusal(lateYes, 409, 'PENDING_ACTION_RESOLVED') !== undefined,
      describe(lateYes),
    )
    await waitFor(
      stream.frames,
      (f) =>
        f.kind === 'event' &&
        f.type === 'pending_action.expired' &&
        detailOf(f, 'pendingActionId') === question.id,
      10_000,
    )
    await settle()
    const expired = eventsOf(stream.frames, 'pending_action.expired').filter(
      (f) => detailOf(f, 'pendingActionId') === question.id,
    )
    checks.ok(
      'the stream carried exactly ONE pending_action.expired for it',
      expired.length === 1,
      `${expired.length}`,
    )
    const ended = expired[0]
    checks.ok(
      'cause token_revoked, by the instructor — and its sentence names them',
      ended !== undefined &&
        detailOf(ended, 'cause') === 'token_revoked' &&
        detailOf(ended, 'by') === state.meId &&
        ended.humanMessage.includes('Test Instructor'),
      ended === undefined
        ? '(none)'
        : `${String(detailOf(ended, 'cause'))} ${String(detailOf(ended, 'by'))} — ${ended.humanMessage}`,
    )

    // ─ a removal, recorded once (Task 16b) ─
    const remove = () =>
      ownerStepped.DELETE('/v1/projects/{projectId}/members/{userId}', {
        params: {
          path: { projectId: projectId(), userId: colleague },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
      })
    const first = await remove()
    checks.ok(
      'the instructor takes the colleague off the project',
      first.response.status === 200 &&
        first.data?.every((m) => m.userId !== colleague) === true,
      describe(first),
    )
    const second = await remove()
    checks.ok(
      'asked again, with a new key, it answers the same — they are not a member',
      second.response.status === 200 &&
        second.data?.every((m) => m.userId !== colleague) === true,
      describe(second),
    )
    await settle()
    const live = eventsOf(stream.frames, 'member.removed').filter(
      (f) => detailOf(f, 'memberId') === colleague,
    )
    checks.ok(
      'the live stream carried exactly ONE member.removed',
      live.length === 1,
      `${live.length}`,
    )
  } finally {
    stream.close()
  }
  // What the record holds, read as anyone opening the project's history would: the replay.
  const replay = await watch('MANIFEST_SESSION')
  replay.close()
  const recorded = eventsOf(replay.frames, 'member.removed').filter(
    (f) => detailOf(f, 'memberId') === colleague,
  )
  checks.ok(
    'and the record holds exactly ONE member.removed — the removal’s own (that it is written in the removal’s transaction is questions-end-atomic.test.ts’s to prove)',
    recorded.length === 1 && recorded[0]!.actor?.name === 'Test Instructor',
    `${recorded.length} ${JSON.stringify(recorded[0]?.actor ?? null)}`,
  )
  save()
  done(7)
}

const phases: Record<Phase, (() => Promise<void>)[]> = {
  find: [findPhase],
  clear: [clearPhase],
  basics: [step2Reference, step3Blueprints],
  app: [createProject, step4Replayed, step5App],
  admin: [step6Reason],
  question: [step7Question],
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
