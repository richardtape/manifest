import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:https'
import {
  createManifestClient,
  idempotencyKey,
  subscribe,
  unwrap,
  type ErrorEnvelope,
  type ManifestClient,
  type Schemas,
  type StreamFrame,
} from '@manifest/contract'
import { Checks, JourneyStop } from './check.js'
import { buildAndWatch } from './example-build.js'
import { readAFile } from './example-read.js'
import { waitFor } from './wait.js'

/**
 * THE AUTHORING API PLAN'S ACCEPTANCE (Task 13): an AGENT, holding a delegated token, builds a
 * course bulletin board from the bare `node-ts-mongo@1` skeleton through nothing but
 * `@manifest/contract` — reads the documentation, reads the tree, checks, commits, is refused
 * six ways, meets a person's symlink, reads the history, builds exactly the commit it wrote,
 * is refused a deploy until it sets the app's secret, and is refused production's secret — on
 * driver 1 AND on driver 2. People then use the board (bash's step 11).
 *
 *   node packages/journey/dist/authoring.js <phase> <state.json>
 *
 * **Phases, because sign-ins and a PERSON's `git push` are bash's** (D23.8, P5a Decision 38):
 * `scripts/demo-authoring.sh` does each of those between phases.
 *
 *   project  MANIFEST_SESSION, MANIFEST_DRIVER, MANIFEST_RUN_ID   step 1: the project, the token
 *   agent    the token (in the state file)                        steps 2–5: read, check, commit, refused
 *   attack   + MANIFEST_MARKER, MANIFEST_PERSON_COMMIT            steps 6–7: the symlink, the history
 *   deploy   the token                                            steps 8–10: build, secret, deploy
 *
 * **`MANIFEST_STOP_AFTER=<step>`** ends the run after that step, green or red — so a negative
 * control whose break shows at step 3 does not build an image to say so.
 *
 * **The re-use path** (`board-*` exists) starts the board again from the skeleton — one commit,
 * back to the project's FIRST commit's `manifest.yaml` and `server.js`, and without anything
 * the first commit did not have — so every run makes step 4's commit with the same five changes
 * and no step depends on the last run.
 */

type Driver = 'local' | 'github'
type Phase = 'project' | 'agent' | 'attack' | 'deploy'
const PHASES: readonly Phase[] = ['project', 'agent', 'attack', 'deploy']

/** One project per driver: a project's repository never moves between drivers. */
const SLUG: Record<Driver, string> = { local: 'board-local', github: 'board-github' }
const BLUEPRINT = 'node-ts-mongo@1'
/** The build loop's capabilities, and the secret's — nothing more (D24). */
const CAPABILITIES = [
  'project:read',
  'source:write',
  'secret:write',
  'build:create',
  'release:create',
  'release:deploy',
] as const
const SECRET_NAME = 'BOARD_ADMIN_CODE'
/** What a stream frame has had time to arrive in, after the answer that caused it. */
const WITHIN_MS = 15_000
/** How long a driver-2 read may take to see a person's push, through the webhook's sync. */
const PUSH_SEEN_WITHIN_MS = 30_000
/** The board's files, as the agent writes them — `fixtures/bulletin-board/`. */
const FIXTURE = new URL('../../../fixtures/bulletin-board/', import.meta.url)
const BOARD_FILES = ['server.js', 'public/index.html', 'public/app.js'] as const

interface AuthoringState {
  driver?: Driver
  slug?: string
  runId?: string
  projectId?: string
  stagingEnvironmentId?: string
  stagingHostname?: string
  stagingUrl?: string
  productionEnvironmentId?: string
  /** The instructor as the platform names them — the sentence and `madeThrough` say it. */
  instructorName?: string
  tokenId?: string
  tokenName?: string
  /** The agent's credential. The state file lives in the run's own `mktemp -d` and dies with it. */
  tokenSecret?: string
  /** Step 2's base; step 5 commits against it again and must be refused. */
  baseCommit?: string
  /** Step 4's commit and its validation — what step 8 builds and must freeze. */
  boardCommit?: string
  boardSpecId?: string
  /** Step 6's deletion: `main`'s newest commit, which step 8 must NOT build. */
  headCommit?: string
  /** Step 9's value, for bash's step 11 to pin a question with. */
  adminCode?: string
  instanceId?: string
}

const [phaseArg, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
if (!PHASES.includes(phaseArg as Phase) || statePath === undefined) {
  console.error(`usage: authoring.js <${PHASES.join('|')}> <state.json>`)
  process.exit(2)
}
const phase = phaseArg as Phase
const path: string = statePath
const stopAfter =
  process.env.MANIFEST_STOP_AFTER === undefined || process.env.MANIFEST_STOP_AFTER === ''
    ? undefined
    : Number(process.env.MANIFEST_STOP_AFTER)

const checks = new Checks()
const state: AuthoringState = (() => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AuthoringState
  } catch {
    return {}
  }
})()

function save(): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
}

function env(variable: string): string {
  return checks.must(`${variable} was provided`, process.env[variable])
}

/** Ends the run after step `n` when the caller asked it to (a negative control's short run). */
function done(n: number): void {
  if (stopAfter === undefined || n < stopAfter) return
  save()
  console.log(`\n(stopped after step ${n}, as MANIFEST_STOP_AFTER asked)`)
  checks.finish()
}

/** The agent: a client, and the credential it holds — never a session. */
function agent(): { client: ManifestClient; token: string; projectId: string } {
  const token = checks.must('the agent’s token, from step 1', state.tokenSecret)
  const projectId = checks.must('the project, from step 1', state.projectId)
  return { client: createManifestClient({ origin, token }), token, projectId }
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

/** The board's `manifest.yaml`, with this project's slug as its name — §7 refuses any other. */
function boardManifest(slug: string, classification = 'internal'): string {
  const source = fixture('manifest.yaml')
  if (!/^name: .*$/m.test(source) || !/^ {2}classification: internal$/m.test(source))
    throw new JourneyStop(
      'the fixture manifest.yaml has no top-level name or no classification',
    )
  return source
    .replace(/^name: .*$/m, `name: ${slug}`)
    .replace(/^ {2}classification: internal$/m, `  classification: ${classification}`)
}

type Change = Schemas['CreateCommitRequest']['changes'][number]

/** The board, as step 4 commits it: four writes, and a NOTES.md that names the run. */
function boardChanges(slug: string, runId: string, classification?: string): Change[] {
  return [
    { op: 'write', path: 'manifest.yaml', content: boardManifest(slug, classification) },
    ...BOARD_FILES.map((file): Change => ({
      op: 'write',
      path: file,
      content: fixture(file),
    })),
    {
      op: 'write',
      path: 'NOTES.md',
      content: `# Notes\n\nThe bulletin board, written by an agent through Manifest's API (make demo-authoring, run ${runId}).\n`,
    },
  ]
}

async function tree(client: ManifestClient, projectId: string, ref?: string) {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId }, ...(ref === undefined ? {} : { query: { ref } }) },
    }),
    'getTree',
  )
}

async function fileAt(
  client: ManifestClient,
  projectId: string,
  file: string,
  ref: string,
) {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/file', {
      params: { path: { projectId }, query: { path: file, ref } },
    }),
    'getFile',
  ).content
}

/** Every commit on `main`, newest first, paged to the end. */
async function history(client: ManifestClient, projectId: string) {
  const all: Schemas['CommitSummary'][] = []
  let cursor: string | undefined
  for (let page = 0; page < 50; page++) {
    const list = unwrap(
      await client.GET('/v1/projects/{projectId}/commits', {
        params: {
          path: { projectId },
          query: { limit: 100, ...(cursor === undefined ? {} : { cursor }) },
        },
      }),
      'listCommits',
    )
    all.push(...list.commits)
    if (list.next === null) return all
    cursor = list.next
  }
  throw new JourneyStop('the history did not end within 5000 commits')
}

function committedEvent(frames: readonly StreamFrame[], sha: string) {
  return frames.find(
    (f) =>
      f.kind === 'event' &&
      f.type === 'repository.committed' &&
      f.machineDetail.commitSha === sha,
  )
}

/**
 * A GET of the deployed app, through the edge's internal listener — `127.0.0.2`, pinned,
 * whatever the resolver says — with the answer's `X-Manifest-Instance`. The probe
 * `github.ts` and `releases.ts` carry.
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

// ─── step 1 ────────────────────────────────────────────────────────────────────────────

async function project(): Promise<void> {
  checks.step(
    '1. The instructor creates the board’s project — the bare skeleton, no starter — and mints the agent’s token',
  )
  const driver = env('MANIFEST_DRIVER')
  if (driver !== 'local' && driver !== 'github')
    throw new JourneyStop(`MANIFEST_DRIVER is '${driver}', not local or github`)
  const runId = env('MANIFEST_RUN_ID')
  const slug = SLUG[driver]
  const human = createManifestClient({ origin, session: env('MANIFEST_SESSION') })
  const me = unwrap(await human.GET('/v1/me'), 'getMe')
  Object.assign(state, { driver, slug, runId, instructorName: me.displayName })

  const existing = unwrap(await human.GET('/v1/projects'), 'listProjects').find(
    (p) => p.slug === slug,
  )
  let projectId: string
  if (existing === undefined) {
    const created = unwrap(
      await human.POST('/v1/projects', {
        params: { header: { 'Idempotency-Key': idempotencyKey() } },
        body: {
          slug,
          blueprint: BLUEPRINT,
          audience: {
            scale: 'class',
            burst: 'steady',
            justification:
              'the authoring API’s acceptance — a bulletin board an agent builds',
          },
        },
      }),
      'createProject',
    )
    projectId = created.id
    checks.ok(
      `created ${slug} with NO starter — the bare skeleton — and its manifest.yaml is valid`,
      created.starter === null && created.spec.valid,
      `starter ${String(created.starter)}, valid ${String(created.spec.valid)}`,
    )
  } else {
    projectId = existing.id
    console.log(`  (${slug} exists from an earlier run — the RE-USE path)`)
  }
  state.projectId = projectId
  const got = unwrap(
    await human.GET('/v1/projects/{projectId}', { params: { path: { projectId } } }),
    'getProject',
  )
  checks.ok(
    `its repository is driver ${driver === 'local' ? '1’s (local)' : '2’s (GitHub)'}`,
    got.repository.provider === driver,
    JSON.stringify(got.repository),
  )
  // §7's private repository, as the mirror last read it on driver 2; driver 1 has no visibility.
  checks.ok(
    `its visibility is ${driver === 'local' ? 'null — a local repository has none' : 'private'}`,
    got.repository.visibility === (driver === 'local' ? null : 'private'),
    String(got.repository.visibility),
  )

  const environments = unwrap(
    await human.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId } },
    }),
    'listEnvironments',
  )
  const staging = checks.must(
    'a staging environment',
    environments.find((e) => e.kind === 'staging'),
  )
  const production = checks.must(
    'a production environment',
    environments.find((e) => e.kind === 'production'),
  )
  Object.assign(state, {
    stagingEnvironmentId: staging.id,
    stagingHostname: staging.hostname,
    stagingUrl: staging.url,
    productionEnvironmentId: production.id,
  })

  // THE MINT IS NOT REPLAYABLE (the plan's Task 12): one fresh key, once. A retry with the same
  // key would answer 409 TOKEN_ALREADY_MINTED — revoke and mint again rather than re-sending it.
  const tokenName = `board agent ${runId}`
  const minted = unwrap(
    await human.POST('/v1/projects/{projectId}/tokens', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: { name: tokenName, capabilities: [...CAPABILITIES], expiresInDays: 1 },
    }),
    'mintToken',
  )
  checks.ok(
    'the token holds exactly the build loop’s six capabilities',
    minted.token.capabilities.slice().sort().join(',') ===
      [...CAPABILITIES].sort().join(','),
    minted.token.capabilities.join(','),
  )
  Object.assign(state, {
    tokenId: minted.token.id,
    tokenName,
    tokenSecret: minted.secret,
  })
  console.log(`  minted '${tokenName}' for ${me.displayName}’s agent`)
  save()
  done(1)
}

// ─── steps 2 to 5 ──────────────────────────────────────────────────────────────────────

async function agentPhase(): Promise<void> {
  const { client, token, projectId } = agent()
  const slug = checks.must('the slug, from step 1', state.slug)
  const runId = checks.must('the run, from step 1', state.runId)
  const frames: StreamFrame[] = []
  const stream = subscribe({ origin, token, projectId, onFrame: (f) => frames.push(f) })
  await stream.ready

  // ── 2 ──
  checks.step(
    '2. The agent reads the documentation first: GET /v1/docs/agents, the knowledge pack, and the tree at main',
  )
  const guide = unwrap(
    await client.GET('/v1/docs/{slug}', { params: { path: { slug: 'agents' } } }),
    'getDoc',
  )
  checks.ok(
    'the agents’ guide names createCommit and baseCommit',
    guide.markdown.includes('createCommit') && guide.markdown.includes('baseCommit'),
    guide.markdown.slice(0, 200),
  )
  const pack = unwrap(
    await client.GET('/v1/blueprints/{blueprintRef}/knowledge-pack', {
      params: { path: { blueprintRef: BLUEPRINT } },
    }),
    'getKnowledgePack',
  )
  checks.ok(
    'the knowledge pack points at the API’s own guide',
    pack.files.some((f) => f.content.includes('GET /v1/docs/agents')),
    pack.files.map((f) => f.path).join(', '),
  )
  // The guide's own function: the tree at main, and one file at the commit it was read at.
  let read = await readAFile(origin, token, projectId, 'manifest.yaml')
  const commits = await history(client, projectId)
  const first = checks.must('the project’s first commit', commits.at(-1))
  if (read.commitSha !== first.commitSha) {
    // THE RE-USE PATH: back to the skeleton, as one commit, so step 4 is the same five changes.
    const at = await tree(client, projectId)
    const firstPaths = new Set(
      (await tree(client, projectId, first.commitSha)).entries
        .filter((e) => e.type !== 'directory')
        .map((e) => e.path),
    )
    const changes: Change[] = at.entries
      .filter((e) => e.type !== 'directory' && !firstPaths.has(e.path))
      .map((e): Change => ({ op: 'delete', path: e.path }))
    for (const file of ['manifest.yaml', 'server.js']) {
      const then = await fileAt(client, projectId, file, first.commitSha)
      if ((await fileAt(client, projectId, file, at.commitSha)) !== then)
        changes.push({ op: 'write', path: file, content: then })
    }
    if (changes.length > 0) {
      const reset = unwrap(
        await client.POST('/v1/projects/{projectId}/commits', {
          params: {
            path: { projectId },
            header: { 'Idempotency-Key': idempotencyKey() },
          },
          body: {
            baseCommit: at.commitSha,
            message: `Start the board again from the skeleton (make demo-authoring ${runId})`,
            changes,
          },
        }),
        'createCommit',
      )
      console.log(
        `  re-use: back to the skeleton in ${reset.commitSha?.slice(0, 12)} — ${changes.map((c) => `${c.op} ${c.path}`).join(', ')}`,
      )
    }
    read = await readAFile(origin, token, projectId, 'manifest.yaml')
  }
  checks.ok(
    'the tree holds the skeleton’s server.js and manifest.yaml, and no board yet',
    read.paths.includes('server.js') &&
      read.paths.includes('manifest.yaml') &&
      !read.paths.includes('public/index.html'),
    read.paths.join(', '),
  )
  const base = read.commitSha
  state.baseCommit = base
  console.log(`  base: ${base}`)
  save()
  done(2)

  // ── 3 ──
  checks.step(
    '3. A dry run of the board with a mistyped manifest — classification: secret',
  )
  const dry = await client.POST('/v1/projects/{projectId}/commits', {
    params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: {
      baseCommit: base,
      message: 'A course bulletin board',
      changes: boardChanges(slug, runId, 'secret'),
      dryRun: true,
    },
  })
  const invalid = refusal(dry, 422, 'SPEC_INVALID')
  checks.ok('422 SPEC_INVALID', invalid !== undefined, describe(dry))
  checks.ok(
    'its first problem is at data.classification',
    invalid?.details?.[0]?.path === 'data.classification',
    JSON.stringify(invalid?.details ?? dry.data ?? null).slice(0, 300),
  )
  checks.ok('and main has not moved', (await tree(client, projectId)).commitSha === base)
  done(3)

  // ── 4 ──
  checks.step('4. The board, committed: four writes and a NOTES.md')
  const made = await client.POST('/v1/projects/{projectId}/commits', {
    params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: {
      baseCommit: base,
      message: 'A course bulletin board: questions, replies, and a pinned question',
      changes: boardChanges(slug, runId),
    },
  })
  checks.ok('201', made.response.status === 201, describe(made))
  const outcome = unwrap(made, 'createCommit')
  const boardCommit = checks.must('a commit, not a dry run', outcome.commitSha)
  const changed = outcome.changes.map((c) => `${c.path} ${c.status}`).join(', ')
  checks.ok(
    'its changes are exactly those five paths',
    changed ===
      'NOTES.md added, manifest.yaml modified, public/app.js added, public/index.html added, server.js modified',
    changed,
  )
  checks.ok(
    'its sensitive diff names auth.attributes and services',
    outcome.spec.sensitiveDiff.fields.includes('auth.attributes') &&
      outcome.spec.sensitiveDiff.fields.includes('services'),
    outcome.spec.sensitiveDiff.fields.join(', '),
  )
  // A warning never stops a commit, so nothing else would show one appearing (the plan's [S9]).
  checks.ok(
    'and it carries no warning — the board declares no AI',
    outcome.spec.warnings.length === 0,
    JSON.stringify(outcome.spec.warnings),
  )
  state.boardCommit = boardCommit
  state.boardSpecId = checks.must('a validation of its manifest', outcome.spec.appSpecId)
  save()
  const committed = await waitFor(
    frames,
    (f) => committedEvent([f], boardCommit) !== undefined,
    WITHIN_MS,
  )
  const who = `${state.instructorName}'s agent (token '${state.tokenName}')`
  checks.ok(
    `repository.committed, whose sentence names ${who}`,
    committed?.kind === 'event' && committed.humanMessage.startsWith(who),
    committed?.kind === 'event'
      ? committed.humanMessage
      : 'no repository.committed for it',
  )
  const validated = await waitFor(
    frames,
    (f) =>
      f.kind === 'event' &&
      f.type === 'spec.validated' &&
      f.machineDetail.commitSha === boardCommit,
    WITHIN_MS,
  )
  checks.ok('spec.validated, for that commit', validated !== undefined)
  done(4)

  // ── 5 ──
  checks.step('5. Refused six ways, each beside step 4’s commit — and main never moves')
  const attempt = (baseCommit: string, message: string, changes: Change[]) =>
    client.POST('/v1/projects/{projectId}/commits', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: { baseCommit, message, changes },
    })
  const stale = await attempt(base, 'A stale base', [
    { op: 'write', path: 'STALE.md', content: 'computed against step 2’s commit\n' },
  ])
  checks.ok(
    'step 2’s base again: 409 SOURCE_CONFLICT',
    refusal(stale, 409, 'SOURCE_CONFLICT') !== undefined,
    describe(stale),
  )

  // AN AWS-KEY-SHAPED VALUE, BUILT AT RUN TIME — never a real key, and never the same twice, so
  // finding it anywhere it should not be is a finding about this run.
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const shaped = 'AKIA' + Array.from(randomBytes(16), (b) => A[b % 32]).join('')
  const before = frames.length
  const secret = await attempt(boardCommit, 'Configure the storage client', [
    {
      op: 'write',
      path: 'config/storage.js',
      content: `export const accessKeyId = '${shaped}'\n`,
    },
  ])
  checks.ok(
    'a secret-shaped value: 409 SOURCE_SECRET_DETECTED',
    refusal(secret, 409, 'SOURCE_SECRET_DETECTED') !== undefined,
    describe(secret),
  )
  checks.ok(
    'and the refusal does not quote it',
    !JSON.stringify(secret.error ?? {}).includes(shaped),
  )
  // Only a frame that arrived AFTER the refusal: a replayed one from an earlier run is not it.
  const earlier = new Set(frames.slice(0, before))
  const found = await waitFor(
    frames,
    (f) =>
      !earlier.has(f) && f.kind === 'event' && f.type === 'repository.secret_refused',
    WITHIN_MS,
  )
  checks.ok(
    'repository.secret_refused names where and which rule — and its JSON holds no value',
    found?.kind === 'event' &&
      found.type === 'repository.secret_refused' &&
      found.machineDetail.findings.some((x) => x.path === 'config/storage.js') &&
      !JSON.stringify(found).includes(shaped),
    found === undefined
      ? 'no repository.secret_refused'
      : JSON.stringify(found).slice(0, 300),
  )

  const dotGit = await attempt(boardCommit, 'Configure git', [
    { op: 'write', path: '.git/config', content: '[core]\n' },
  ])
  checks.ok(
    '.git/config: 400 REQUEST_INVALID',
    refusal(dotGit, 400, 'REQUEST_INVALID') !== undefined,
    describe(dotGit),
  )
  const aFile = await attempt(boardCommit, 'A file where a directory is', [
    { op: 'write', path: 'public', content: 'not a directory\n' },
  ])
  checks.ok(
    'a file named public, where a directory is: 409 SOURCE_PATH_CONFLICT',
    refusal(aFile, 409, 'SOURCE_PATH_CONFLICT') !== undefined,
    describe(aFile),
  )
  const missing = await attempt(boardCommit, 'Delete nothing', [
    { op: 'delete', path: 'nope.txt' },
  ])
  checks.ok(
    'a delete of nope.txt: 409 SOURCE_PATH_NOT_FOUND',
    refusal(missing, 409, 'SOURCE_PATH_NOT_FOUND') !== undefined,
    describe(missing),
  )
  const same = await attempt(boardCommit, 'The same again', [
    { op: 'write', path: 'server.js', content: fixture('server.js') },
  ])
  checks.ok(
    'the same content again: 409 SOURCE_NOTHING_TO_COMMIT',
    refusal(same, 409, 'SOURCE_NOTHING_TO_COMMIT') !== undefined,
    describe(same),
  )
  checks.ok(
    'main is still step 4’s commit, after all six',
    (await tree(client, projectId)).commitSha === boardCommit,
  )
  stream.close()
  save()
  done(5)
}

// ─── steps 6 and 7 ─────────────────────────────────────────────────────────────────────

async function attack(): Promise<void> {
  const { client, projectId } = agent()
  const marker = env('MANIFEST_MARKER')
  const personCommit = env('MANIFEST_PERSON_COMMIT')
  const boardCommit = checks.must('step 4’s commit', state.boardCommit)

  checks.step(
    '6. A PERSON pushed link → .git; the agent commits link/config holding a core.fsmonitor',
  )
  // A driver-2 read syncs the mirror first; the webhook may not have landed yet, so read until
  // main is the person's commit — bounded.
  let at = await tree(client, projectId)
  const deadline = Date.now() + PUSH_SEEN_WITHIN_MS
  while (at.commitSha !== personCommit && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    at = await tree(client, projectId)
  }
  checks.must(
    'the agent reads main at the person’s push',
    at.commitSha === personCommit ? at : undefined,
    `main is ${at.commitSha}, the person pushed ${personCommit}`,
  )
  const link = at.entries.find((e) => e.path === 'link')
  checks.ok('and sees link as a symlink', link?.type === 'symlink', JSON.stringify(link))
  checks.ok('no marker yet — the canary starts absent', !existsSync(marker), marker)
  const through = await client.POST('/v1/projects/{projectId}/commits', {
    params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: {
      baseCommit: at.commitSha,
      message: 'Tune git',
      changes: [
        {
          op: 'write',
          path: 'link/config',
          content: `[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tfsmonitor = "touch '${marker}'"\n`,
        },
      ],
    },
  })
  checks.ok(
    '409 SOURCE_PATH_CONFLICT',
    refusal(through, 409, 'SOURCE_PATH_CONFLICT') !== undefined,
    describe(through),
  )
  checks.ok(
    'main has not moved',
    (await tree(client, projectId)).commitSha === personCommit,
  )
  const removed = await client.POST('/v1/projects/{projectId}/commits', {
    params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: {
      baseCommit: personCommit,
      message: 'Remove the notes',
      changes: [{ op: 'delete', path: 'NOTES.md' }],
    },
  })
  checks.ok(
    'then deleting NOTES.md against the new head: 201',
    removed.response.status === 201,
    describe(removed),
  )
  const outcome = unwrap(removed, 'createCommit')
  checks.ok(
    'NOTES.md deleted, and nothing else changed',
    outcome.changes.length === 1 &&
      outcome.changes[0]?.path === 'NOTES.md' &&
      outcome.changes[0]?.status === 'deleted',
    JSON.stringify(outcome.changes),
  )
  state.headCommit = checks.must('a commit', outcome.commitSha)
  // Checked LAST, after two more commits through the same repository: a command git ran would
  // have had every chance to run.
  checks.ok(
    'and the marker file does not exist — no command ran',
    !existsSync(marker),
    marker,
  )
  save()
  done(6)

  checks.step(
    '7. The history says who made each commit — by the platform’s own record, not the commit’s text',
  )
  const commits = await history(client, projectId)
  const board = commits.find((c) => c.commitSha === boardCommit)
  const person = commits.find((c) => c.commitSha === personCommit)
  const deletion = commits.find((c) => c.commitSha === state.headCommit)
  const agentMade = (c: Schemas['CommitSummary'] | undefined) =>
    c?.madeThrough?.kind === 'agent' &&
    c.madeThrough.name === state.instructorName &&
    c.madeThrough.tokenName === state.tokenName
  checks.ok(
    `step 4’s commit: made through ${state.instructorName}’s agent, token '${state.tokenName}'`,
    agentMade(board),
    JSON.stringify(board?.madeThrough),
  )
  checks.ok(
    'and step 6’s deletion too',
    agentMade(deletion),
    JSON.stringify(deletion?.madeThrough),
  )
  checks.ok(
    'the person’s push: madeThrough null — pushed with git',
    person !== undefined && person.madeThrough === null,
    JSON.stringify(person?.madeThrough),
  )
  const detail = unwrap(
    await client.GET('/v1/projects/{projectId}/commits/{commitSha}', {
      params: { path: { projectId, commitSha: boardCommit } },
    }),
    'getCommit',
  )
  const serverJs = detail.changes.find((c) => c.path === 'server.js')
  checks.ok(
    'getCommit of step 4 has a patch for server.js',
    serverJs?.status === 'modified' &&
      typeof serverJs.patch === 'string' &&
      serverJs.patch.includes('bulletin board'),
    JSON.stringify(serverJs).slice(0, 200),
  )
  save()
  done(7)
}

// ─── steps 8 to 10 ─────────────────────────────────────────────────────────────────────

async function deployPhase(): Promise<void> {
  const { client, token, projectId } = agent()
  const boardCommit = checks.must('step 4’s commit', state.boardCommit)
  const stagingId = checks.must('staging, from step 1', state.stagingEnvironmentId)
  const host = checks.must('staging’s hostname, from step 1', state.stagingHostname)
  const frames: StreamFrame[] = []
  const stream = subscribe({ origin, token, projectId, onFrame: (f) => frames.push(f) })
  await stream.ready
  /** Every answer this phase reads, as text — step 9 looks for the secret's value in each. */
  const answers: string[] = []
  const kept = <T>(value: T): T => {
    answers.push(JSON.stringify(value))
    return value
  }

  // ── 8 ──
  checks.step(
    '8. Build step 4’s commit — not the newest — release it, and deploy to staging BEFORE the secret is set',
  )
  const secretsBefore = kept(
    unwrap(
      await client.GET('/v1/environments/{environmentId}/secrets', {
        params: { path: { environmentId: stagingId } },
      }),
      'listAppSecrets',
    ),
  )
  if (secretsBefore.secrets.some((s) => s.name === SECRET_NAME && s.set)) {
    // The re-use path: the last run set it. Cleared by the agent, so this run proves the refusal.
    unwrap(
      await client.DELETE('/v1/environments/{environmentId}/secrets/{name}', {
        params: {
          path: { environmentId: stagingId, name: SECRET_NAME },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
      }),
      'clearAppSecret',
    )
    console.log(`  re-use: ${SECRET_NAME} was set by the last run, and is cleared`)
  }
  checks.ok(
    `${SECRET_NAME} is declared in staging and not set`,
    kept(
      unwrap(
        await client.GET('/v1/environments/{environmentId}/secrets', {
          params: { path: { environmentId: stagingId } },
        }),
        'listAppSecrets',
      ),
    ).secrets.some((s) => s.name === SECRET_NAME && s.declared && !s.set),
  )
  checks.ok(
    'step 4’s commit is not the newest — step 6’s deletion is',
    state.headCommit !== undefined && state.headCommit !== boardCommit,
  )
  // The guide's own function: subscribe first, build the named commit, watch it end.
  const built = await buildAndWatch(origin, token, projectId, boardCommit)
  checks.must(
    'the build succeeded',
    built.status === 'succeeded' ? built : undefined,
    built.status,
  )
  const build = kept(
    unwrap(
      await client.GET('/v1/builds/{buildId}', {
        params: { path: { buildId: built.buildId } },
      }),
      'getBuild',
    ),
  )
  checks.ok('of step 4’s commit', build.commitSha === boardCommit, build.commitSha)
  const release = kept(
    unwrap(
      await client.POST('/v1/projects/{projectId}/releases', {
        params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
        body: { buildId: built.buildId },
      }),
      'createRelease',
    ),
  )
  // Task 7: a build of a named commit freezes THAT commit's manifest.yaml, not the newest one.
  checks.ok(
    'the release froze step 4’s validation of manifest.yaml',
    release.appSpecId === state.boardSpecId,
    `${release.appSpecId} (want ${state.boardSpecId})`,
  )
  const envBefore = kept(
    unwrap(
      await client.GET('/v1/environments/{environmentId}', {
        params: { path: { environmentId: stagingId } },
      }),
      'getEnvironment',
    ),
  )
  const deployNow = () =>
    client.POST('/v1/environments/{environmentId}/deploy', {
      params: {
        path: { environmentId: stagingId },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { releaseId: release.id },
    })
  const early = await deployNow()
  const notSet = refusal(early, 409, 'RELEASE_SECRET_NOT_SET')
  checks.ok(
    `the deploy: 409 RELEASE_SECRET_NOT_SET, naming ${SECRET_NAME}`,
    notSet !== undefined && notSet.message.includes(SECRET_NAME),
    describe(early),
  )
  const envAfter = kept(
    unwrap(
      await client.GET('/v1/environments/{environmentId}', {
        params: { path: { environmentId: stagingId } },
      }),
      'getEnvironment',
    ),
  )
  checks.ok(
    'and no new instance',
    (envAfter.instance?.id ?? null) === (envBefore.instance?.id ?? null),
    `${envBefore.instance?.id ?? 'none'} → ${envAfter.instance?.id ?? 'none'} (${envAfter.instance?.state ?? ''})`,
  )
  save()
  done(8)

  // ── 9 ──
  checks.step(`9. The agent sets staging’s ${SECRET_NAME}, and deploys again`)
  const value = `board-${randomBytes(12).toString('base64url')}`
  // The stream replays recent events, so a frame from before this set — an earlier run's — is not it.
  const beforeSet = new Set(frames)
  const set = await client.PUT('/v1/environments/{environmentId}/secrets/{name}', {
    params: {
      path: { environmentId: stagingId, name: SECRET_NAME },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
    body: { value },
  })
  const status = kept(unwrap(set, 'setAppSecret'))
  checks.ok(
    'setAppSecret: 200, set: true, and no value in the answer',
    set.response.status === 200 &&
      status.set &&
      status.declared &&
      !JSON.stringify(status).includes(value),
    JSON.stringify(status),
  )
  const again = await deployNow()
  const instance = kept(unwrap(again, 'deploy'))
  checks.must(
    'the deploy is healthy',
    instance.state === 'healthy' ? instance : undefined,
    instance.state,
  )
  state.instanceId = instance.id
  state.adminCode = value
  save()
  const page = await probe(host, '/')
  console.log(
    `  https://${host}/ answered ${page.status}, X-Manifest-Instance: ${page.instance ?? '(none)'}`,
  )
  // THE SHAPE, not a 200: the edge's wildcard answers 200 for any name.
  checks.ok(
    'GET / is the new instance, and it is the bulletin board',
    page.status === 200 &&
      page.instance === instance.id &&
      page.body.includes('Bulletin board'),
    `${page.status} ${page.instance} (want ${instance.id}) ${page.body.slice(0, 120)}`,
  )
  const appStatus = await probe(host, '/api/status')
  answers.push(appStatus.body)
  checks.ok(
    'GET /api/status: { adminCodeConfigured: true }',
    appStatus.status === 200 &&
      appStatus.body.replace(/\s/g, '') === '{"adminCodeConfigured":true}',
    `${appStatus.status} ${appStatus.body.slice(0, 120)}`,
  )
  const log = unwrap(
    await client.GET('/v1/builds/{buildId}/logs', {
      params: { path: { buildId: built.buildId } },
    }),
    'getBuildLog',
  )
  const logText = JSON.stringify(log)
  // Events arrive on the stream after the answers that cause them; let the deploy's land.
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const eventText = JSON.stringify(frames)
  checks.ok(
    `the value appears in no event (${frames.length} frames), no build log and no answer (${answers.length})`,
    frames.length > 0 &&
      !eventText.includes(value) &&
      !logText.includes(value) &&
      !answers.some((a) => a.includes(value)),
  )
  const setEvent = await waitFor(
    frames,
    (f) => !beforeSet.has(f) && f.kind === 'event' && f.type === 'app_secret.set',
    WITHIN_MS,
  )
  checks.ok(
    'app_secret.set was published — and it names the agent’s token, not the value',
    setEvent?.kind === 'event' && setEvent.humanMessage.includes(`${state.tokenName}`),
    setEvent?.kind === 'event' ? setEvent.humanMessage : 'no app_secret.set frame',
  )
  done(9)

  // ── 10 ──
  checks.step(`10. The agent tries production’s ${SECRET_NAME}`)
  const productionId = checks.must(
    'production, from step 1',
    state.productionEnvironmentId,
  )
  const production = await client.PUT('/v1/environments/{environmentId}/secrets/{name}', {
    params: {
      path: { environmentId: productionId, name: SECRET_NAME },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
    body: { value: `prod-${randomBytes(12).toString('base64url')}` },
  })
  // Spec action 2 (Rich's (a)): a production value only in a stepped-up interactive session.
  checks.ok(
    '403 TOKEN_CREDENTIAL_REFUSED',
    refusal(production, 403, 'TOKEN_CREDENTIAL_REFUSED') !== undefined,
    describe(production),
  )
  stream.close()
  save()
  done(10)
}

async function main(): Promise<void> {
  try {
    if (phase === 'project') await project()
    else if (phase === 'agent') await agentPhase()
    else if (phase === 'attack') await attack()
    else await deployPhase()
  } catch (error) {
    save()
    if (!(error instanceof JourneyStop)) {
      console.error(error)
      checks.ok('the phase ran to its end', false, String(error))
    }
  }
  checks.finish()
}

await main()
