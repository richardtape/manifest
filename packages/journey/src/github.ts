import { createHmac, randomBytes, randomUUID } from 'node:crypto'
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
import { waitFor } from './wait.js'

/**
 * THE D5 PLAN'S ACCEPTANCE (Task 15): D5's driver 2 end to end — an application whose code is
 * on (fake) GitHub, private — through the edge, by nothing but the generated client, plus raw
 * `fetch` for the only two things outside the contract: GitHub's webhook route on the control
 * plane (`/webhooks/github`, unversioned, reached at `127.0.0.1:7100` as the edge reaches it —
 * never through the edge), and the GitHub FAKE itself, asked as a PERSON would ask GitHub
 * (`faculty-dev`'s token), never as Manifest's App.
 *
 *   node packages/journey/dist/github.js <phase> <state.json>
 *
 * **Phases, because sign-ins, git pushes and `docker stop` are bash's** (D23.8, P5a Decision
 * 38): `scripts/demo-github.sh` does each of those BETWEEN phases.
 *
 *   probe       nothing                    step 0: WHICH DRIVER — an unsigned delivery, and the fake
 *   project     MANIFEST_SESSION           steps 1 and 3: github-app, private, `main` protected
 *   pushed      + MANIFEST_COMMIT          step 4: a person's push reaches Manifest, signed
 *   deploy      + MANIFEST_COMMIT, _MARK   step 5: built from the mirror, released, on staging
 *   offline     + MANIFEST_COMMIT          step 6: GitHub gone — the mirror builds, HEAD is 503
 *   publicize   MANIFEST_SESSION           step 7: made public by a person; private again
 *   secrets     + MANIFEST_COMMIT, _SECRET_AWS, _SECRET_TOKEN   step 8: found, never quoted
 *   forcePush   + MANIFEST_FORCE_EXIT, _FORCE_OUTPUT, _COMMIT, _REWRITTEN, _REMOTE_MAIN   step 9
 *   refusals    MANIFEST_SESSION           step 10: the receiver's refusals, and a redelivery
 *
 * **Driver 2's acceptance deploys to STAGING, not production** — the plan's Decision 17, its
 * stated trade: `releases/`, `launch/` and `spec/` import nothing from `source/`, so a
 * production launch on driver 2 would re-prove P6a over a different git host. **And the
 * control plane's OWN commit carrying a secret is not here**: nothing in the contract commits a
 * file before the authoring API. The source-driver contract suite holds it on both drivers.
 */

const SLUG = 'github-app'
const ORG = 'manifest-apps'
const FULL_NAME = `${ORG}/${SLUG}`
/** Past the builder's own 900 s timeout, as the journey's bound is. */
const BUILD_ENDS_WITHIN_MS = 960_000
/** The plan's bound for anything a webhook causes: a delivery, a sync, a revert. */
const WITHIN_MS = 30_000
/** A commit id NOBODY has — the mirror, GitHub, or any repository. */
const NOBODY_HAS = 'deadbeef'.repeat(5)
/** The two rules step 8's commit must be found by — `build/secret-patterns.ts`'s own names. */
const AWS_RULE = 'an AWS access key id'
const TOKEN_RULE = 'a GitHub App installation token'

type Phase =
  | 'probe'
  | 'project'
  | 'pushed'
  | 'deploy'
  | 'offline'
  | 'publicize'
  | 'secrets'
  | 'forcePush'
  | 'refusals'

interface GithubState {
  /** What step 0 learned: `github` proceeds; `local` stops the demo, creating nothing. */
  driver?: 'github' | 'local'
  projectId?: string
  stagingEnvironmentId?: string
  stagingHostname?: string
  /** How many deliveries the fake had logged before bash pushed step 4's commit. */
  deliveriesBefore?: number
  /** Step 4's commit, and the delivery that told Manifest about it — step 10 re-sends it. */
  pushCommit?: string
  pushDeliveryId?: string
  /** Step 5's build of step 4's commit: step 6 builds the same commit to the same digest. */
  digest?: string
}

const PHASES: readonly Phase[] = [
  'probe',
  'project',
  'pushed',
  'deploy',
  'offline',
  'publicize',
  'secrets',
  'forcePush',
  'refusals',
]
const [phaseArg, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
/** Where the edge itself reaches the control plane — and where GitHub's deliveries go. */
const controlPlane = process.env.MANIFEST_CONTROL_PLANE_URL ?? 'http://127.0.0.1:7100'
/** The GitHub fake — `make github-up`'s, loopback only. */
const fake = process.env.MANIFEST_FAKE_URL ?? 'http://127.0.0.1:7110'
if (!PHASES.includes(phaseArg as Phase) || statePath === undefined) {
  console.error(`usage: github.js <${PHASES.join('|')}> <state.json>`)
  process.exit(2)
}
const phase = phaseArg as Phase
const path: string = statePath

const checks = new Checks()
const state: GithubState = (() => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as GithubState
  } catch {
    return {}
  }
})()

function env(variable: string): string {
  return checks.must(`${variable} was provided`, process.env[variable])
}

function signedIn(): { client: ManifestClient; session: string } {
  const session = env('MANIFEST_SESSION')
  return { client: createManifestClient({ origin, session }), session }
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

/**
 * THE FAKE, ASKED AS A PERSON ASKS GITHUB: `faculty-dev`'s token (an organisation member with
 * admin), never Manifest's App — the demo sees what a faculty member would see, and holds no
 * key Manifest holds. The token goes in a header, never a URL.
 */
async function asPerson(
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${fake}/api/v3${pathname}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `token ${env('MANIFEST_FAKE_TOKEN')}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
  } catch {
    json = { unparsed: text.slice(0, 200) }
  }
  return { status: res.status, json }
}

/** One attempt, as the fake's `GET /_fake/deliveries` lists it — GitHub's own delivery log. */
interface Delivery {
  id: string
  event: string
  status: number | null
  answer?: string
  error?: string
}

async function deliveries(): Promise<Delivery[]> {
  const res = await fetch(`${fake}/_fake/deliveries`, {
    signal: AbortSignal.timeout(10_000),
  })
  return (await res.json()) as Delivery[]
}

/** A delivery sent to `/webhooks/github` by THIS demo — the receiver's answer, whole. */
async function deliver(
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${controlPlane}/webhooks/github`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = { unparsed: text.slice(0, 200) }
  }
  return { status: res.status, json }
}

const codeOf = (json: Record<string, unknown>): string | undefined =>
  (json.error as { code?: string } | undefined)?.code

/**
 * The project's stream, OPEN: the replay (the newest 50 events) and then what arrives live.
 * `before` is the replay's event ids, so a phase that causes an event itself can tell a new
 * one from a previous run's of the same type.
 */
async function openStream(session: string): Promise<{
  frames: StreamFrame[]
  before: Set<string>
  close(): void
}> {
  const frames: StreamFrame[] = []
  const stream = subscribe({
    origin,
    session,
    projectId: state.projectId!,
    onFrame: (frame) => frames.push(frame),
  })
  try {
    await stream.ready
  } catch (error) {
    checks.must('the project’s event stream became ready', undefined, String(error))
  }
  const before = new Set(frames.flatMap((f) => (f.kind === 'event' ? [f.id] : [])))
  return { frames, before, close: () => stream.close() }
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

function startBuild(client: ManifestClient, commitSha: string) {
  return client.POST('/v1/projects/{projectId}/builds', {
    params: {
      path: { projectId: state.projectId! },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
    body: { commitSha },
  })
}

/** Build THIS commit and wait for it to end — succeeded or failed; the caller says which. */
async function build(
  client: ManifestClient,
  commitSha: string,
): Promise<Schemas['Build']> {
  const started = unwrap(await startBuild(client, commitSha), 'startBuild')
  const startedAt = Date.now()
  const ended = await waitForBuild(client, started.id)
  console.log(
    `  build ${started.id.slice(0, 8)} of ${commitSha.slice(0, 12)} ${ended.status} in ${Date.now() - startedAt} ms`,
  )
  return ended
}

/**
 * One request to the app on the INTERNAL listener, answered by a fresh socket (`agent: false`
 * — a pooled keep-alive socket once reported an app on a listener it was not on, P6a F2) and
 * pinned to `127.0.0.2`, whatever the resolver says. The same probe `releases.ts` carries, for
 * a staging name.
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
            body,
          })
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error(`${host} did not answer in 10 s`)))
    req.on('error', reject)
    req.end()
  })
}

/** A push-shaped delivery for `fullName` — the four fields the receiver reads, and no more. */
function pushBody(fullName: string, after: string): string {
  return JSON.stringify({
    ref: 'refs/heads/main',
    before: '0'.repeat(40),
    after,
    repository: { full_name: fullName },
  })
}

// ─── step 0 ────────────────────────────────────────────────────────────────────────────

/**
 * WHICH DRIVER IS THIS CONTROL PLANE ON? (Decision 17.) An UNSIGNED delivery — push-shaped,
 * with a delivery id, for a repository no project holds — is the question AND the first
 * negative control: driver 2 must refuse it `401 WEBHOOK_SIGNATURE_MISSING` before it reads a
 * byte of it; driver 1 answers everything `404 WEBHOOKS_NOT_CONFIGURED`, and the demo stops
 * then, CREATING NOTHING — no route deletes a project (P6a F5), so a `github-app` created on
 * driver 1 would block this demo for ever. Anything else stops it too, named.
 */
async function probeDriver(): Promise<void> {
  checks.step('0. Which source driver does the control plane run? (an unsigned delivery)')
  const answer = await deliver(
    { 'x-github-event': 'push', 'x-github-delivery': randomUUID() },
    pushBody(`${ORG}/mf-unsigned-probe`, '0'.repeat(40)),
  )
  console.log(
    `  ${controlPlane}/webhooks/github answered ${answer.status} ${JSON.stringify(answer.json).slice(0, 160)}`,
  )
  if (answer.status === 404 && codeOf(answer.json) === 'WEBHOOKS_NOT_CONFIGURED') {
    state.driver = 'local'
    console.log(
      '  → driver 1 (the local driver). This demo needs driver 2 and stops here, having created nothing.',
    )
    return
  }
  checks.must(
    'an unsigned delivery is refused 401 WEBHOOK_SIGNATURE_MISSING — driver 2',
    answer.status === 401 && codeOf(answer.json) === 'WEBHOOK_SIGNATURE_MISSING'
      ? answer
      : undefined,
    `${answer.status} ${JSON.stringify(answer.json)}`,
  )
  state.driver = 'github'
  const health = await fetch(`${fake}/_fake/health`, {
    signal: AbortSignal.timeout(5_000),
  }).then(
    async (r) => `${r.status} ${(await r.text()).trim()}`,
    (e: unknown) => String(e),
  )
  checks.must(
    `the GitHub fake answers at ${fake}`,
    health === '200 ok' ? health : undefined,
    `${health} — \`make github-up\` starts it`,
  )
}

// ─── steps 1 and 3 ─────────────────────────────────────────────────────────────────────

/** The link §3 promises, exactly — the fake's `team` plan protects `main` (Task 12). */
function repositoryIsExact(r: Schemas['RepositoryLink']): boolean {
  return (
    r.provider === 'github' &&
    r.fullName === FULL_NAME &&
    r.webUrl === `${fake}/${FULL_NAME}` &&
    r.mainProtected &&
    r.protectionDetail === null &&
    r.visibility === 'private'
  )
}

async function project(): Promise<void> {
  const { client } = signedIn()
  checks.step('1. Whose session is it?')
  const me = unwrap(await client.GET('/v1/me'), 'getMe')
  checks.must(
    'signed in as the instructor',
    me.puid === 'ins000001' ? me : undefined,
    me.puid,
  )

  checks.step(`3. ${SLUG}, from the proof-app starter — its code on GitHub, private`)
  const existing = unwrap(await client.GET('/v1/projects'), 'listProjects').find(
    (p) => p.slug === SLUG,
  )
  let repository: Schemas['RepositoryLink']
  if (existing === undefined) {
    const created = unwrap(
      await client.POST('/v1/projects', {
        params: { header: { 'Idempotency-Key': idempotencyKey() } },
        body: {
          slug: SLUG,
          blueprint: 'node-ts-mongo@1',
          starter: 'proof-app',
          audience: {
            scale: 'class',
            burst: 'steady',
            justification:
              'the D5 plan’s acceptance — an application whose code is on GitHub',
          },
        },
      }),
      'createProject',
    )
    state.projectId = created.id
    checks.ok('created, and its manifest.yaml is valid', created.spec.valid)
    repository = unwrap(
      await client.GET('/v1/projects/{projectId}', {
        params: { path: { projectId: created.id } },
      }),
      'getProject',
    ).repository
  } else {
    state.projectId = existing.id
    repository = existing.repository
    console.log(`  (${SLUG} exists from an earlier run — the RE-USE path)`)
  }
  checks.ok(
    `its repository is ${FULL_NAME} on GitHub, main protected`,
    repositoryIsExact(repository),
    JSON.stringify(repository),
  )
  const seen = await asPerson('GET', `/repos/${FULL_NAME}`)
  checks.ok(
    'and GitHub, asked by a person, says it is private',
    seen.status === 200 &&
      seen.json.private === true &&
      seen.json.visibility === 'private',
    `${seen.status} private=${String(seen.json.private)} visibility=${String(seen.json.visibility)}`,
  )
  const environments = unwrap(
    await client.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId: state.projectId } },
    }),
    'listEnvironments',
  )
  const staging = checks.must(
    'it has a staging environment',
    environments.find((e) => e.kind === 'staging'),
  )
  state.stagingEnvironmentId = staging.id
  state.stagingHostname = staging.hostname
  state.deliveriesBefore = (await deliveries()).length
}

// ─── step 4 ────────────────────────────────────────────────────────────────────────────

async function pushed(): Promise<void> {
  const { client, session } = signedIn()
  const commit = env('MANIFEST_COMMIT')
  state.pushCommit = commit
  checks.step(
    `4. faculty-dev pushed ${commit.slice(0, 12)} straight to GitHub — Manifest hears of it`,
  )
  const stream = await openStream(session)
  try {
    const event = await waitFor(
      stream.frames,
      (f) =>
        f.kind === 'event' &&
        f.type === 'repository.pushed' &&
        f.machineDetail.ref === 'refs/heads/main' &&
        f.machineDetail.to === commit,
      WITHIN_MS,
    )
    checks.ok(
      `repository.pushed for ${commit.slice(0, 12)} on the project’s stream, within 30 s`,
      event !== undefined,
    )
    if (event?.kind === 'event') console.log(`  “${event.humanMessage}”`)
  } finally {
    stream.close()
  }
  const spec = unwrap(
    await client.GET('/v1/projects/{projectId}/spec', {
      params: { path: { projectId: state.projectId! } },
    }),
    'getSpec',
  )
  checks.ok(
    'the project’s newest validation is of that commit — validated, never built',
    spec.commitSha === commit,
    spec.commitSha,
  )
  const builds = unwrap(
    await client.GET('/v1/projects/{projectId}/builds', {
      params: { path: { projectId: state.projectId! } },
    }),
    'listBuilds',
  )
  checks.ok(
    'and no build of it was started by the push (builds stay pull-based)',
    !builds.some((b) => b.commitSha === commit),
    JSON.stringify(builds.filter((b) => b.commitSha === commit).map((b) => b.id)),
  )
  const log = (await deliveries()).slice(state.deliveriesBefore ?? 0)
  const pushes = log.filter((d) => d.event === 'push')
  console.log(
    `  the fake's log since the push: ${JSON.stringify(log.map((d) => [d.event, d.status]))}`,
  )
  const accepted = checks.must(
    'GitHub delivered exactly one signed push, and Manifest answered 202',
    pushes.length === 1 && pushes[0]!.status === 202 ? pushes[0] : undefined,
    JSON.stringify(pushes),
  )
  state.pushDeliveryId = accepted.id
}

// ─── step 5 ────────────────────────────────────────────────────────────────────────────

async function deploy(): Promise<void> {
  const { client } = signedIn()
  const commit = env('MANIFEST_COMMIT')
  const mark = env('MANIFEST_MARK')
  checks.step(
    `5. Build ${commit.slice(0, 12)} from the mirror; release; deploy to staging`,
  )
  const nobody = await startBuild(client, NOBODY_HAS)
  checks.ok(
    'first, a commit nobody has is 409 SOURCE_COMMIT_NOT_FOUND (GitHub was asked, and has none)',
    refusal(nobody, 409, 'SOURCE_COMMIT_NOT_FOUND') !== undefined,
    describe(nobody),
  )
  const built = await build(client, commit)
  checks.must(
    'the build succeeded, with a digest',
    built.status === 'succeeded' && built.imageDigest ? built : undefined,
    `${built.status}: ${built.error ?? ''}`,
  )
  state.digest = built.imageDigest!
  const release = unwrap(
    await client.POST('/v1/projects/{projectId}/releases', {
      params: {
        path: { projectId: state.projectId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { buildId: built.id, summary: `make demo-github: ${mark}` },
    }),
    'createRelease',
  )
  const instance = unwrap(
    await client.POST('/v1/environments/{environmentId}/deploy', {
      params: {
        path: { environmentId: state.stagingEnvironmentId! },
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
  const host = state.stagingHostname!
  const page = await probe(host, '/')
  console.log(
    `  https://${host}/ answered ${page.status}, X-Manifest-Instance: ${page.instance ?? '(none)'}`,
  )
  // THE SHAPE, not a 200: the edge's wildcard answers 200 for any name (P4b finding 193).
  checks.ok(
    'the app answers as the new instance',
    page.status === 200 && page.instance === instance.id,
    `${page.status} ${page.instance} (want ${instance.id})`,
  )
  checks.ok(
    'and its page is the text faculty-dev pushed',
    page.body.includes(mark),
    page.body.slice(0, 200),
  )
}

// ─── step 6 ────────────────────────────────────────────────────────────────────────────

async function offline(): Promise<void> {
  const { client } = signedIn()
  const commit = env('MANIFEST_COMMIT')
  checks.step(
    '6. GitHub gone (the fake stopped) — what the mirror has still builds; HEAD is 503',
  )
  const gone = await fetch(`${fake}/_fake/health`, {
    signal: AbortSignal.timeout(3_000),
  }).then(
    (r) => `answered ${r.status}`,
    () => 'unreachable',
  )
  checks.must(
    'the fake really is unreachable',
    gone === 'unreachable' ? gone : undefined,
    gone,
  )
  const again = await build(client, commit)
  checks.ok(
    'the same commit builds, from the mirror (C1)',
    again.status === 'succeeded',
    `${again.status}: ${again.error ?? ''}`,
  )
  checks.ok(
    'to the same digest (§13: same source, same digest)',
    again.imageDigest === state.digest,
    `${again.imageDigest} (step 5: ${state.digest})`,
  )
  const head = await client.POST('/v1/projects/{projectId}/spec', {
    params: {
      path: { projectId: state.projectId! },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
    body: {},
  })
  checks.ok(
    'validating HEAD is 503 SOURCE_UNREACHABLE — never the mirror’s stale head',
    refusal(head, 503, 'SOURCE_UNREACHABLE') !== undefined,
    describe(head),
  )
  // Decision 18's OTHER HALF, beside step 5's positive control: a commit the mirror LACKS,
  // with GitHub gone, cannot be said not to exist — only that GitHub cannot be asked.
  const lacked = await startBuild(client, NOBODY_HAS)
  checks.ok(
    'and a commit the mirror lacks is 503 SOURCE_UNREACHABLE, not SOURCE_COMMIT_NOT_FOUND',
    refusal(lacked, 503, 'SOURCE_UNREACHABLE') !== undefined,
    describe(lacked),
  )
}

// ─── step 7 ────────────────────────────────────────────────────────────────────────────

async function publicize(): Promise<void> {
  const { session } = signedIn()
  checks.step(
    '7. faculty-dev makes the repository PUBLIC on GitHub — Manifest makes it private again',
  )
  const stream = await openStream(session)
  try {
    const made = await asPerson('PATCH', `/repos/${FULL_NAME}`, { private: false })
    checks.must(
      'GitHub made it public',
      made.status === 200 && made.json.private === false ? made : undefined,
      `${made.status} ${JSON.stringify(made.json).slice(0, 200)}`,
    )
    const deadline = Date.now() + WITHIN_MS
    let seen = made
    while (Date.now() < deadline) {
      seen = await asPerson('GET', `/repos/${FULL_NAME}`)
      if (seen.json.private === true) break
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    checks.ok(
      'within 30 s GitHub reads private again',
      seen.json.private === true && seen.json.visibility === 'private',
      `private=${String(seen.json.private)}`,
    )
    const event = await waitFor(
      stream.frames,
      (f) =>
        f.kind === 'event' &&
        !stream.before.has(f.id) &&
        f.type === 'repository.visibility_enforced' &&
        f.machineDetail.observed === 'public' &&
        f.machineDetail.result === 'private',
      WITHIN_MS,
    )
    checks.ok(
      'and repository.visibility_enforced { observed: public, result: private } is on the stream',
      event !== undefined,
    )
    if (event?.kind === 'event') console.log(`  “${event.humanMessage}”`)
  } finally {
    stream.close()
  }
}

// ─── step 8 ────────────────────────────────────────────────────────────────────────────

async function secrets(): Promise<void> {
  const { client, session } = signedIn()
  const commit = env('MANIFEST_COMMIT')
  const values = [env('MANIFEST_SECRET_AWS'), env('MANIFEST_SECRET_TOKEN')]
  checks.step(
    `8. faculty-dev pushed two secret-shaped values in ${commit.slice(0, 12)} — found, never quoted`,
  )
  const stream = await openStream(session)
  let found: StreamFrame | undefined
  try {
    found = await waitFor(
      stream.frames,
      (f) =>
        f.kind === 'event' &&
        f.type === 'repository.secret_detected' &&
        f.machineDetail.commit === commit,
      WITHIN_MS,
    )
  } finally {
    stream.close()
  }
  const detected = checks.must(
    `repository.secret_detected for ${commit.slice(0, 12)}, within 30 s`,
    found?.kind === 'event' && found.type === 'repository.secret_detected'
      ? found
      : undefined,
  )
  const findings = detected.machineDetail.findings
  console.log(`  findings: ${JSON.stringify(findings)}`)
  console.log(`  “${detected.humanMessage}”`)
  checks.ok(
    'it names both files',
    findings.some((f) => f.path === 'aws-credentials.txt') &&
      findings.some((f) => f.path === 'installation-token.txt'),
    JSON.stringify(findings.map((f) => f.path)),
  )
  checks.ok(
    `and both rules — “${AWS_RULE}” and “${TOKEN_RULE}”`,
    findings.some((f) => f.rule === AWS_RULE) &&
      findings.some((f) => f.rule === TOKEN_RULE),
    JSON.stringify(findings.map((f) => f.rule)),
  )
  const text = JSON.stringify(detected)
  checks.ok(
    'and its JSON carries neither value',
    values.every((v) => !text.includes(v)),
  )
  const built = await build(client, commit)
  checks.ok(
    'a build of that commit FAILED, at the secret gate',
    built.status === 'failed' &&
      (built.error ?? '').includes('[secret]') &&
      (built.error ?? '').includes('aws-credentials.txt'),
    `${built.status}: ${built.error ?? ''}`,
  )
  checks.ok(
    'and its reason quotes neither value either',
    values.every((v) => !(built.error ?? '').includes(v)),
  )
}

// ─── step 9 ────────────────────────────────────────────────────────────────────────────

/**
 * git's own words for the force-push bash made, read from the file it wrote. THE RED HALF IS
 * ASSERTED TOO (the plan's control (g)): were GitHub to accept the rewrite, the mirror must
 * still refuse it and say so — `repository.history_rewritten` naming what Manifest kept.
 */
async function forcePush(): Promise<void> {
  const { session } = signedIn()
  const exit = Number(env('MANIFEST_FORCE_EXIT'))
  const output = readFileSync(env('MANIFEST_FORCE_OUTPUT'), 'utf8')
  const kept = env('MANIFEST_COMMIT')
  const rewritten = env('MANIFEST_REWRITTEN')
  const remoteMain = env('MANIFEST_REMOTE_MAIN')
  checks.step('9. faculty-dev force-pushes a rewritten main')
  console.log(
    `  git exited ${exit}: ${output
      .split('\n')
      .filter((l) => /GH006|rejected|error/.test(l))
      .join(' | ')}`,
  )
  const refused =
    exit !== 0 &&
    output.includes('GH006: Protected branch update failed for refs/heads/main.')
  checks.ok(
    'GitHub refused it, in its own words (GH006, the team plan)',
    refused,
    output.slice(0, 400),
  )
  checks.ok(
    `and main is still ${kept.slice(0, 12)} on GitHub`,
    remoteMain === kept,
    `${remoteMain} (the rewrite was ${rewritten})`,
  )
  if (refused) return
  const stream = await openStream(session)
  try {
    const event = await waitFor(
      stream.frames,
      (f) =>
        f.kind === 'event' &&
        f.type === 'repository.history_rewritten' &&
        f.machineDetail.mirror === kept &&
        f.machineDetail.upstream === rewritten,
      WITHIN_MS,
    )
    checks.ok(
      'GitHub took the rewrite — so the MIRROR must have refused it, and said so',
      event !== undefined,
    )
    if (event?.kind === 'event') console.log(`  “${event.humanMessage}”`)
  } finally {
    stream.close()
  }
}

// ─── step 10 ───────────────────────────────────────────────────────────────────────────

async function refusals(): Promise<void> {
  const { session } = signedIn()
  const commit = checks.must('step 4’s commit', state.pushCommit)
  const id = checks.must('step 4’s delivery', state.pushDeliveryId)
  checks.step('10. The receiver’s refusals, each beside step 4’s accepted delivery')
  const accepted = (await deliveries()).find((d) => d.id === id)
  checks.ok(
    `step 4’s delivery ${id.slice(0, 8)} was accepted: 202`,
    accepted?.status === 202,
    JSON.stringify(accepted),
  )
  const body = pushBody(FULL_NAME, commit)
  const hmac = (algorithm: 'sha1' | 'sha256') =>
    createHmac(algorithm, randomBytes(32)).update(body).digest('hex')
  const cases: [string, Record<string, string>, number, string][] = [
    [
      'SHA-1 only',
      { 'x-hub-signature': `sha1=${hmac('sha1')}` },
      401,
      'WEBHOOK_SIGNATURE_MISSING',
    ],
    [
      'malformed',
      { 'x-hub-signature-256': 'sha256=not-a-signature' },
      401,
      'WEBHOOK_SIGNATURE_MALFORMED',
    ],
    [
      'wrong',
      { 'x-hub-signature-256': `sha256=${hmac('sha256')}` },
      401,
      'WEBHOOK_SIGNATURE_INVALID',
    ],
  ]
  for (const [name, headers, status, code] of cases) {
    const answer = await deliver(
      { 'x-github-event': 'push', 'x-github-delivery': randomUUID(), ...headers },
      body,
    )
    checks.ok(
      `${name}: ${status} ${code}`,
      answer.status === status && codeOf(answer.json) === code,
      `${answer.status} ${JSON.stringify(answer.json)}`,
    )
  }
  const before = (await deliveries()).filter((d) => d.id === id).length
  const again = await fetch(`${fake}/_fake/deliveries/${id}/redeliver`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  })
  checks.must(
    `the fake redelivered ${id.slice(0, 8)}, same id, same bytes`,
    again.ok ? again : undefined,
    String(again.status),
  )
  const deadline = Date.now() + WITHIN_MS
  let attempts: Delivery[] = []
  while (Date.now() < deadline) {
    attempts = (await deliveries()).filter((d) => d.id === id)
    if (attempts.length > before) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const redelivery = attempts[before]
  checks.ok(
    'the redelivery: 200 { duplicate: true } — recorded once, and nothing done again',
    redelivery?.status === 200 &&
      redelivery.answer === JSON.stringify({ duplicate: true }),
    JSON.stringify(redelivery),
  )
  const stream = await openStream(session)
  stream.close()
  const pushedEvents = stream.frames.filter(
    (f) =>
      f.kind === 'event' &&
      f.type === 'repository.pushed' &&
      f.machineDetail.to === commit,
  )
  checks.ok(
    `and still exactly one repository.pushed for ${commit.slice(0, 12)}`,
    pushedEvents.length === 1,
    `${pushedEvents.length} in the replay of ${stream.frames.length - 1} frames`,
  )
}

const phases: Record<Phase, () => Promise<void>> = {
  probe: probeDriver,
  project,
  pushed,
  deploy,
  offline,
  publicize,
  secrets,
  forcePush,
  refusals,
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
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`)
}
checks.finish()
