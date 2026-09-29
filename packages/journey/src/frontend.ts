import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:https'
import { crc32, deflateSync } from 'node:zlib'
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
import { switchOff, bringBack, deleteForGood } from './example-archive.js'
import { readBytes } from './example-binary.js'
import { buildAndWatch } from './example-build.js'
import { startDescribing, stopDescribing } from './example-intake.js'
import { whatTheAppPrinted } from './example-output.js'
import { waitFor } from './wait.js'

/**
 * THE FRONT-END ENABLEMENT PLAN'S ACCEPTANCE (Task 15): everything the faculty front-end at
 * `https://app.manifest.internal` needs from the platform, driven end to end — a person signed
 * in ON THE `app` ORIGIN, a project named and renamed, a delegated token handed to the
 * front-end's server, a model session charged to that person, an app written as text AND bytes,
 * the app's recent output read back redacted, a collaborator added by CWL login name, the app
 * switched off and brought back with its data, a scratch project deleted — on driver 1 AND on
 * driver 2, through nothing but `@manifest/contract`.
 *
 *   node packages/journey/dist/frontend.js <phase> <state.json>
 *
 * **Phases, because sign-ins, step-ups and the app's own pages are bash's** (D23.8, P5a Decision
 * 38): `scripts/demo-frontend.sh` does each of those between phases.
 *
 * **Two credentials, and which one acts is the point** (sitting 11's Critical):
 * - **THE PERSON** — steps 2, 7, 8, 9 and 10's revocation — acts in their own SESSION. On the
 *   real front-end that is BROWSER CODE: the page's own client, `createManifestClient({ origin:
 *   location.origin })`, which carries no credential because the browser sends the person's
 *   cookie and `Origin` itself. This demo has no browser, so it passes the cookie's value — the
 *   way every headless demo stands in for a browser. **It is not a pattern for a front-end's
 *   server**, which never holds a person's cookie.
 * - **THE FRONT-END'S SERVER** — steps 3 to 6, and 8's redeploy — acts on the delegated TOKEN
 *   the person minted for it at step 2, and on the model KEY it started a session for.
 *
 *   person   MANIFEST_SESSION, MANIFEST_DRIVER, MANIFEST_RUN_ID      step 2
 *   session  the token                                              step 3: the manifest, the session
 *   agent    the token, the key                                     steps 3 (the model) and 4
 *   deploy   the token                                              step 5: build, release, deploy
 *   output   the token, + MANIFEST_SESSION                          step 6
 *   people   MANIFEST_SESSION(_STEPPED), MANIFEST_STUDENT_SESSION   step 7
 *   archive  MANIFEST_SESSION(_STEPPED), the token and key          step 8: switched off
 *   restore  MANIFEST_SESSION, then a new token                     step 8: brought back
 *   delete   MANIFEST_SESSION_STEPPED                               step 9
 *   end      MANIFEST_SESSION, the new token                        step 10
 *
 * **`MANIFEST_STOP_AFTER=<step>`** ends the run after that step, green or red.
 *
 * **The state file holds two CREDENTIALS** — the token and the model key — because a later phase,
 * in another process, must show each REFUSED. It lives in the run's own `mktemp -d`, 0600, and
 * dies with the run; nothing prints either.
 *
 * **The re-use path** (`frontend-<driver>` exists) starts the app again from the project's first
 * commit — one commit — so every run commits the same changes and no step depends on the last run.
 */

type Driver = 'local' | 'github'
type Phase =
  | 'person'
  | 'session'
  | 'agent'
  | 'deploy'
  | 'output'
  | 'people'
  | 'archive'
  | 'restore'
  | 'delete'
  | 'end'
const PHASES: readonly Phase[] = [
  'person',
  'session',
  'agent',
  'deploy',
  'output',
  'people',
  'archive',
  'restore',
  'delete',
  'end',
]

const BLUEPRINT = 'node-ts-mongo@1'
/** The cheapest thing that deploys, for a project that exists to be deleted. */
const SCRATCH_BLUEPRINT = 'fixture-node@1'
const FIRST_NAME = 'Week 3 — reading responses'
const SECOND_NAME = 'Reading responses'
/** What the front-end's server may do, and nothing more (D24): step 2's list. */
const CAPABILITIES = [
  'project:read',
  'source:write',
  'secret:write',
  'build:create',
  'release:create',
  'release:deploy',
  'output:read',
  'agent:session',
] as const
/**
 * The chat models a front-end's agent may use, most preferred first — NEVER `default-chat-large`:
 * it needs the network and a provider key, and this demo is the offline acceptance's step 15
 * (C1). Which one a session may call is read from `session.models`, never assumed: on a
 * `confidential` project there is no `default-chat` (the plan's `[S11a]`).
 */
const CHAT_MODELS = ['default-chat', 'default-chat-onprem'] as const
/** What the fixture prints once per request — step 6 finds its own line by it. */
const MARKER = 'reading-responses request'
/** What a stream frame has had time to arrive in, after the answer that caused it. */
const WITHIN_MS = 15_000
/** How long the gateway may take to report a call's spend — it batches its writes. */
const SPEND_WITHIN_MS = 45_000
/** The app's files, as the agent writes them — `fixtures/frontend-app/`. */
const FIXTURE = new URL('../../../fixtures/frontend-app/', import.meta.url)

interface FrontendState {
  driver?: Driver
  slug?: string
  scratchSlug?: string
  runId?: string
  projectId?: string
  scratchProjectId?: string
  instructorId?: string
  instructorName?: string
  /** What the person's own session says of their month — step 3 compares the token's answer. */
  personBudget?: { monthlyUsd: number; resetsAt: string | null }
  sandboxEnvironmentId?: string
  sandboxUrl?: string
  stagingEnvironmentId?: string
  stagingUrl?: string
  tokenId?: string
  tokenName?: string
  /** The server's credential. The state file lives in the run's own `mktemp -d` and dies with it. */
  tokenSecret?: string
  sessionId?: string
  /** The model key — a credential, kept for step 8 to show it refused, and never printed. */
  sessionKey?: string
  baseUrl?: string
  /** Read from `session.models` — bash warms the model behind it before step 3's call. */
  chatModel?: string
  appCommit?: string
  logoSha256?: string
  buildId?: string
  releaseId?: string
  stagingInstanceId?: string
  sandboxInstanceId?: string
  token2Id?: string
  token2Secret?: string
  session2Id?: string
  session2Key?: string
}

const [phaseArg, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://app.manifest.internal'
if (!PHASES.includes(phaseArg as Phase) || statePath === undefined) {
  console.error(`usage: frontend.js <${PHASES.join('|')}> <state.json>`)
  process.exit(2)
}
const phase = phaseArg as Phase
const path: string = statePath
const stopAfter =
  process.env.MANIFEST_STOP_AFTER === undefined || process.env.MANIFEST_STOP_AFTER === ''
    ? undefined
    : Number(process.env.MANIFEST_STOP_AFTER)

const checks = new Checks()
const state: FrontendState = (() => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as FrontendState
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

/** The person, in their session — browser code on the real front-end (see the head of this file). */
function person(variable = 'MANIFEST_SESSION'): ManifestClient {
  return createManifestClient({ origin, session: env(variable) })
}

/** The front-end's server: a client, and the token it holds — never a session. */
function server(secret = state.tokenSecret): { client: ManifestClient; token: string } {
  const token = checks.must('the server’s token, from step 2', secret)
  return { client: createManifestClient({ origin, token }), token }
}

function projectId(): string {
  return checks.must('the project, from step 2', state.projectId)
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
  if (!/^name: .*$/m.test(source) || !/^ {2}classification: confidential$/m.test(source))
    throw new JourneyStop(
      'the fixture manifest.yaml has no top-level name, or is not classified confidential',
    )
  return source.replace(/^name: .*$/m, `name: ${slug}`)
}

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

// ─── the bytes the demo makes — never a file from this Mac ─────────────────────────────

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** A 1×1 PNG, one opaque pixel: the signature, IHDR, one deflated scanline and IEND. */
function onePixelPng(): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(1, 0) // width
  header.writeUInt32BE(1, 4) // height
  header[8] = 8 // bits per channel
  header[9] = 6 // RGBA; compression, filter and interlace stay 0
  const scanline = Buffer.from([0, 0x00, 0x2a, 0x5c, 0xff]) // filter 0, then one pixel
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanline)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** The first bytes of a 64-bit ELF executable — the kind an agent must never commit. */
function elfHeader(): Buffer {
  const bytes = Buffer.alloc(64)
  Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]).copy(bytes)
  bytes.writeUInt16LE(2, 16) // an executable
  bytes.writeUInt16LE(0x3e, 18) // x86-64
  return bytes
}

/**
 * A PDF with a key pasted into it. AN AWS-KEY-SHAPED VALUE, BUILT AT RUN TIME — never a real
 * key, and never the same twice, so finding it anywhere it should not be is a finding about
 * this run. Its second line is the binary marker every PDF writer adds, which is not UTF-8 — so
 * the platform reads it as bytes (Decision 8), and only its printable runs are scanned (Decision
 * 10).
 */
function pdfWithAKey(): { bytes: Buffer; key: string } {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const key = 'AKIA' + Array.from(randomBytes(16), (b) => A[b % 32]).join('')
  const bytes = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
    Buffer.from(
      `1 0 obj\n<< /Type /Catalog >>\nendobj\n% storage accessKeyId = '${key}'\n%%EOF\n`,
      'latin1',
    ),
  ])
  return { bytes, key }
}

// ─── the model gateway, as the key's holder meets it ───────────────────────────────────

/**
 * `GET <baseUrl>/models` with a key: what the gateway says of the KEY, loading no model. Answers
 * the status, the model ids it lists, and a refusal's `error.type` — never the body's text,
 * which quotes the start of the key.
 */
async function keyAnswer(
  baseUrl: string,
  key: string,
): Promise<{ status: number; models: string[]; errorType: string }> {
  const response = await fetch(`${baseUrl}/models`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await response.json().catch(() => undefined)) as
    { data?: { id?: unknown }[]; error?: { type?: unknown } } | undefined
  return {
    status: response.status,
    models: (body?.data ?? []).map((m) => String(m.id)),
    errorType: typeof body?.error?.type === 'string' ? body.error.type : '(none)',
  }
}

/**
 * The gateway REFUSES the key because it no longer HOLDS it: `401 token_not_found_in_db` —
 * LiteLLM 1.98.0's answer for an `sk-` key it has no row for (measured at this demo's first run,
 * for a deleted key and for one that never existed; a bearer that is not `sk-…` at all is
 * `auth_error`). The platform ends a session by DELETING its key, so this is what an ended session
 * looks like — and each use is paired with the same key ANSWERED before, which is what makes it
 * the deletion rather than a key that never worked.
 */
const refusedKey = (a: { status: number; errorType: string }): boolean =>
  a.status === 401 && a.errorType === 'token_not_found_in_db'

/**
 * A GET of a deployed app, through the edge's internal listener — `127.0.0.2`, pinned,
 * whatever the resolver says — with the answer's `X-Manifest-Instance`. The probe
 * `authoring.ts`, `github.ts` and `releases.ts` carry.
 */
function probe(
  url: string,
): Promise<{ status: number; instance: string | undefined; body: string }> {
  const { hostname, pathname } = new URL(url)
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: hostname,
        servername: hostname,
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
    req.on('timeout', () => req.destroy(new Error(`${hostname} did not answer in 10 s`)))
    req.on('error', reject)
    req.end()
  })
}

async function tree(client: ManifestClient, id: string, ref?: string) {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: {
        path: { projectId: id },
        ...(ref === undefined ? {} : { query: { ref } }),
      },
    }),
    'getTree',
  )
}

async function fileAt(client: ManifestClient, id: string, file: string, ref: string) {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/file', {
      params: { path: { projectId: id }, query: { path: file, ref } },
    }),
    'getFile',
  ).content
}

/** Every commit on `main`, newest first, paged to the end. */
async function history(client: ManifestClient, id: string) {
  const all: Schemas['CommitSummary'][] = []
  let cursor: string | undefined
  for (let page = 0; page < 50; page++) {
    const list = unwrap(
      await client.GET('/v1/projects/{projectId}/commits', {
        params: {
          path: { projectId: id },
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

async function environmentsOf(client: ManifestClient, id: string) {
  const all = unwrap(
    await client.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId: id } },
    }),
    'listEnvironments',
  )
  const of = (kind: Schemas['Environment']['kind']) =>
    checks.must(
      `a ${kind} environment`,
      all.find((e) => e.kind === kind),
    )
  return { sandbox: of('sandbox'), staging: of('staging') }
}

async function deployTo(
  client: ManifestClient,
  environmentId: string,
  releaseId: string,
) {
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

async function mint(client: ManifestClient, id: string, name: string) {
  // THE MINT IS NOT REPLAYABLE: one fresh key, once. A retry with the same key would answer
  // 409 TOKEN_ALREADY_MINTED — revoke and mint again rather than re-sending it.
  const minted = unwrap(
    await client.POST('/v1/projects/{projectId}/tokens', {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { name, capabilities: [...CAPABILITIES], expiresInDays: 1 },
    }),
    'mintToken',
  )
  checks.ok(
    `'${name}' holds exactly the eight capabilities step 2 names — output:read and agent:session among them`,
    minted.token.capabilities.slice().sort().join(',') ===
      [...CAPABILITIES].sort().join(','),
    minted.token.capabilities.join(','),
  )
  return minted
}

async function sessionsOf(client: ManifestClient, id: string) {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/agent-sessions', {
      params: { path: { projectId: id } },
    }),
    'listAgentSessions',
  ).sessions
}

// ─── step 2 ────────────────────────────────────────────────────────────────────────────

async function personPhase(): Promise<void> {
  checks.step(
    '2. The instructor, in their session on the app origin: an intake key, a project named and renamed, and the front-end server’s token',
  )
  const driver = env('MANIFEST_DRIVER')
  if (driver !== 'local' && driver !== 'github')
    throw new JourneyStop(`MANIFEST_DRIVER is '${driver}', not local or github`)
  const runId = env('MANIFEST_RUN_ID')
  const slug = `frontend-${driver}`
  const scratchSlug = `frontend-scratch-${driver}`
  const page = person()
  const me = unwrap(await page.GET('/v1/me'), 'getMe')
  Object.assign(state, {
    driver,
    slug,
    scratchSlug,
    runId,
    instructorId: me.id,
    instructorName: me.displayName,
  })

  // THE INTAKE KEY (FE-1, the plan's [S7]): a model before a project exists, which the platform
  // pays for — started from the person's session, and ended.
  const intake = await startDescribing(page)
  if (!intake.started)
    throw new JourneyStop(`startIntakeSession: ${intake.code} — ${intake.why}`)
  checks.ok(
    `startIntakeSession: a key for the platform’s intake model, ${intake.model}`,
    intake.key.startsWith('sk-') && intake.model.length > 0,
  )
  const liveIntake = await keyAnswer(intake.baseUrl, intake.key)
  checks.ok(
    'the gateway lists that model for the intake key',
    liveIntake.status === 200 && liveIntake.models.includes(intake.model),
    `${liveIntake.status} ${liveIntake.errorType} [${liveIntake.models.join(', ')}]`,
  )
  const intakeEnd = await stopDescribing(page, intake.intakeSessionId)
  checks.ok('endIntakeSession: ended', intakeEnd === 'ended', intakeEnd)
  const deadIntake = await keyAnswer(intake.baseUrl, intake.key)
  checks.ok(
    'and the gateway no longer holds the intake key — 401 token_not_found_in_db',
    refusedKey(deadIntake),
    `${deadIntake.status} ${deadIntake.errorType}`,
  )

  const month = unwrap(await page.GET('/v1/agent-budget'), 'getAgentBudget')
  state.personBudget = { monthlyUsd: month.monthlyUsd, resetsAt: month.resetsAt }

  // ── the project, and the scratch project step 9 deletes ──
  const projects = unwrap(await page.GET('/v1/projects'), 'listProjects')
  const existing = projects.find((p) => p.slug === slug)
  let id: string
  if (existing === undefined) {
    const created = unwrap(
      await page.POST('/v1/projects', {
        params: { header: { 'Idempotency-Key': idempotencyKey() } },
        body: {
          slug,
          name: FIRST_NAME,
          blueprint: BLUEPRINT,
          audience: {
            scale: 'class',
            burst: 'synchronised',
            justification:
              'the front-end enablement plan’s acceptance — a reading-responses page for one class',
          },
        },
      }),
      'createProject',
    )
    id = created.id
    checks.ok(
      `created ${slug}, named “${FIRST_NAME}”, from the bare skeleton`,
      created.name === FIRST_NAME && created.starter === null && created.spec.valid,
      `name ${created.name}, starter ${String(created.starter)}, valid ${String(created.spec.valid)}`,
    )
  } else {
    id = existing.id
    console.log(`  (${slug} exists from an earlier run — the RE-USE path)`)
    if (existing.state === 'archived') {
      // An earlier run stopped between its archive and its restore.
      const back = await bringBack(page, id)
      console.log(
        `  re-use: ${slug} was left switched off by an earlier run — restored (${back.done ? back.state : JSON.stringify(back)})`,
      )
    }
    if (existing.name !== FIRST_NAME) {
      unwrap(
        await page.PATCH('/v1/projects/{projectId}', {
          params: {
            path: { projectId: id },
            header: { 'Idempotency-Key': idempotencyKey() },
          },
          body: { name: FIRST_NAME },
        }),
        'updateProject',
      )
      console.log(`  re-use: named “${FIRST_NAME}” again, so this run renames it`)
    }
  }
  state.projectId = id
  const got = unwrap(
    await page.GET('/v1/projects/{projectId}', { params: { path: { projectId: id } } }),
    'getProject',
  )
  checks.ok(
    `its repository is driver ${driver === 'local' ? '1’s (local)' : '2’s (GitHub)'}`,
    got.repository.provider === driver,
    JSON.stringify(got.repository),
  )

  const scratch = projects.find((p) => p.slug === scratchSlug)
  if (scratch === undefined) {
    const created = unwrap(
      await page.POST('/v1/projects', {
        params: { header: { 'Idempotency-Key': idempotencyKey() } },
        body: {
          slug: scratchSlug,
          name: 'A trial, deleted by make demo-frontend',
          blueprint: SCRATCH_BLUEPRINT,
          audience: { scale: 'solo', burst: 'steady' },
        },
      }),
      'createProject',
    )
    state.scratchProjectId = created.id
    console.log(`  created ${scratchSlug} (${SCRATCH_BLUEPRINT}), which step 9 deletes`)
  } else {
    state.scratchProjectId = scratch.id
    console.log(
      `  (${scratchSlug} was left by an earlier run that stopped before step 9)`,
    )
    if (scratch.state === 'archived') await bringBack(page, scratch.id)
  }

  // ── the rename, seen on the project's stream ──
  const frames: StreamFrame[] = []
  const stream = subscribe({
    origin,
    session: env('MANIFEST_SESSION'),
    projectId: id,
    onFrame: (f) => frames.push(f),
  })
  await stream.ready
  // The stream replays recent events — an earlier run's rename is not this one.
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const replayed = new Set(frames)
  const renamed = unwrap(
    await page.PATCH('/v1/projects/{projectId}', {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { name: SECOND_NAME },
    }),
    'updateProject',
  )
  checks.ok(`updateProject: “${SECOND_NAME}”`, renamed.name === SECOND_NAME, renamed.name)
  const event = await waitFor(
    frames,
    (f) => !replayed.has(f) && f.kind === 'event' && f.type === 'project.renamed',
    WITHIN_MS,
  )
  checks.ok(
    `project.renamed on the stream: from “${FIRST_NAME}” to “${SECOND_NAME}”, by ${me.displayName} in a session`,
    event?.kind === 'event' &&
      event.type === 'project.renamed' &&
      event.machineDetail.from === FIRST_NAME &&
      event.machineDetail.to === SECOND_NAME &&
      event.machineDetail.via === 'session' &&
      event.machineDetail.userId === me.id,
    event === undefined
      ? 'no project.renamed frame'
      : JSON.stringify(event).slice(0, 300),
  )
  stream.close()

  const { sandbox, staging } = await environmentsOf(page, id)
  Object.assign(state, {
    sandboxEnvironmentId: sandbox.id,
    sandboxUrl: sandbox.url,
    stagingEnvironmentId: staging.id,
    stagingUrl: staging.url,
  })

  const tokenName = `reading responses server ${runId}`
  const minted = await mint(page, id, tokenName)
  Object.assign(state, {
    tokenId: minted.token.id,
    tokenName,
    tokenSecret: minted.secret,
  })
  console.log(`  minted '${tokenName}' (a day) for the front-end’s server`)
  save()
  done(2)
}

// ─── step 3, before the model is called ────────────────────────────────────────────────

async function sessionPhase(): Promise<void> {
  const { client } = server()
  const id = projectId()
  const slug = checks.must('the slug, from step 2', state.slug)
  const runId = checks.must('the run, from step 2', state.runId)
  checks.step(
    '3. The front-end’s server, on the token: the confidential manifest FIRST, then a model session charged to the person who minted it',
  )

  // THE RE-USE PATH: back to the project's first commit, as one commit, so step 4's commit is the
  // same two changes every run. On a new project main IS the first commit and this does nothing.
  const commits = await history(client, id)
  const first = checks.must('the project’s first commit', commits.at(-1))
  const at = await tree(client, id)
  if (at.commitSha !== first.commitSha) {
    const firstPaths = new Set(
      (await tree(client, id, first.commitSha)).entries
        .filter((e) => e.type !== 'directory')
        .map((e) => e.path),
    )
    const changes: Schemas['CreateCommitRequest']['changes'] = at.entries
      .filter((e) => e.type !== 'directory' && !firstPaths.has(e.path))
      .map((e) => ({ op: 'delete' as const, path: e.path }))
    for (const file of ['manifest.yaml', 'server.js']) {
      const then = await fileAt(client, id, file, first.commitSha)
      if ((await fileAt(client, id, file, at.commitSha)) !== then)
        changes.push({ op: 'write', path: file, content: then })
    }
    if (changes.length > 0) {
      const reset = unwrap(
        await client.POST('/v1/projects/{projectId}/commits', {
          params: {
            path: { projectId: id },
            header: { 'Idempotency-Key': idempotencyKey() },
          },
          body: {
            baseCommit: at.commitSha,
            message: `Start the app again from the skeleton (make demo-frontend ${runId})`,
            changes,
          },
        }),
        'createCommit',
      )
      console.log(
        `  re-use: back to the skeleton in ${reset.commitSha?.slice(0, 12)} — ${changes.map((c) => `${c.op} ${c.path}`).join(', ')}`,
      )
    }
  }

  // [S11a]: A COMMIT THAT RAISES THE CLASSIFICATION ENDS EVERY SESSION STARTED BEFORE IT
  // (`models_withdrawn`). So the manifest — `confidential`, because the app keeps students' names —
  // is committed BEFORE the session starts, and the session is the confidential one.
  const base = (await tree(client, id)).commitSha
  const manifest = await client.POST('/v1/projects/{projectId}/commits', {
    params: { path: { projectId: id }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: {
      baseCommit: base,
      message: 'Reading responses: what the app is, and that its data is confidential',
      changes: [{ op: 'write', path: 'manifest.yaml', content: appManifest(slug) }],
    },
  })
  const declared = unwrap(manifest, 'createCommit')
  checks.ok(
    'manifest.yaml committed, valid, and its sensitive diff names data.classification',
    manifest.response.status === 201 &&
      declared.spec.appSpecId !== null &&
      declared.spec.sensitiveDiff.fields.includes('data.classification'),
    `${manifest.response.status} ${JSON.stringify(declared.spec).slice(0, 300)}`,
  )

  // getAgentBudget ON THE TOKEN: its MINTER's month (Decision 24), the one the person read at step 2.
  const month = unwrap(await client.GET('/v1/agent-budget'), 'getAgentBudget')
  const theirs = checks.must('the person’s own reading, from step 2', state.personBudget)
  checks.ok(
    `getAgentBudget on the token is its minter’s month — $${month.monthlyUsd}, resetting ${month.resetsAt ?? '(unknown)'}`,
    month.monthlyUsd === theirs.monthlyUsd && month.resetsAt === theirs.resetsAt,
    `${JSON.stringify(month)} (the person read ${JSON.stringify(theirs)})`,
  )

  const key = idempotencyKey()
  const body = { name: `reading responses ${runId}`, capUsd: 1, durationMinutes: 60 }
  const startSession = () =>
    client.POST('/v1/projects/{projectId}/agent-sessions', {
      params: { path: { projectId: id }, header: { 'Idempotency-Key': key } },
      body,
    })
  const started = await startSession()
  const session = unwrap(started, 'startAgentSession')
  checks.ok(
    'startAgentSession: 201, a key, and the session names the token it was started with',
    started.response.status === 201 &&
      session.key.startsWith('sk-') &&
      session.session.via?.tokenId === state.tokenId &&
      session.session.state === 'active',
    `${started.response.status} via ${JSON.stringify(session.session.via)} ${session.session.state}`,
  )
  const models = session.session.models
  checks.ok(
    'a confidential project’s session holds no default-chat, and holds default-chat-onprem ([S11a])',
    !models.includes('default-chat') && models.includes('default-chat-onprem'),
    models.join(', '),
  )
  console.log(
    `  session.models: ${models.join(', ')} — default-chat-large ${models.includes('default-chat-large') ? 'IS' : 'is NOT'} listed (reported, never used: it needs the network)`,
  )
  const chatModel = checks.must(
    'a chat model this key may call, read from session.models',
    CHAT_MODELS.find((m) => models.includes(m)),
    models.join(', '),
  )

  // THE KEY IS ANSWERED ONCE: a retry of the same start is refused, naming the session, and never
  // carries the key again.
  const replay = await startSession()
  checks.ok(
    'the same Idempotency-Key again: 409 AGENT_SESSION_ALREADY_STARTED',
    refusal(replay, 409, 'AGENT_SESSION_ALREADY_STARTED') !== undefined,
    describe(replay),
  )
  const replayText = JSON.stringify(replay.error ?? replay.data ?? null)
  checks.ok(
    'and its body holds no sk- — the key is never shown twice',
    !replayText.includes('sk-') && !replayText.includes(session.key),
  )
  Object.assign(state, {
    sessionId: session.session.id,
    sessionKey: session.key,
    baseUrl: session.baseUrl,
    chatModel,
  })
  save()
}

// ─── step 3, the model; step 4 ─────────────────────────────────────────────────────────

async function agentPhase(): Promise<void> {
  const { client, token } = server()
  const id = projectId()
  const sessionId = checks.must('the session, from step 3', state.sessionId)
  const key = checks.must('the key, from step 3', state.sessionKey)
  const baseUrl = checks.must('the gateway, from step 3', state.baseUrl)
  const chatModel = checks.must('the model, from step 3', state.chatModel)

  checks.step(
    `3. (cont.) One real completion with the key, on ${chatModel}, through baseUrl`,
  )
  const asked = Date.now()
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: chatModel,
      messages: [{ role: 'user', content: 'Reply with the one word: ready' }],
      max_tokens: 16,
    }),
    signal: AbortSignal.timeout(180_000),
  })
  const answer = (await response.json().catch(() => undefined)) as
    { model?: string; choices?: { message?: { content?: string } }[] } | undefined
  const text = answer?.choices?.[0]?.message?.content ?? ''
  checks.ok(
    `200 and an answer, in ${Date.now() - asked} ms, from ${answer?.model ?? '(no model named)'}`,
    response.status === 200 && text.trim().length > 0,
    `${response.status} ${JSON.stringify(text).slice(0, 80)}`,
  )
  const listed = (await sessionsOf(client, id)).find((s) => s.id === sessionId)
  checks.ok(
    `listAgentSessions: the session is active, started by '${state.tokenName}'`,
    listed?.state === 'active' && listed.via?.tokenName === state.tokenName,
    JSON.stringify(listed).slice(0, 300),
  )
  // Spend lands a few seconds after a call — the gateway batches its writes.
  let spent = listed?.spentUsd ?? null
  const deadline = Date.now() + SPEND_WITHIN_MS
  while ((spent === null || spent <= 0) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    spent =
      (await sessionsOf(client, id)).find((s) => s.id === sessionId)?.spentUsd ?? null
  }
  const month = unwrap(await client.GET('/v1/agent-budget'), 'getAgentBudget')
  checks.ok(
    `the call is charged to the session — spentUsd ${spent === null ? 'null' : `$${spent.toFixed(6)}`}; the month: $${month.spentUsd?.toFixed(6) ?? '(unknown)'} of $${month.monthlyUsd}`,
    spent !== null && spent > 0,
    `within ${SPEND_WITHIN_MS / 1000} s`,
  )
  // THE MINTER'S MONTH, shown by its spend: on a fresh machine the person has no gateway user until
  // their first session starts, so step 3's first reading compared `resetsAt: null` with itself.
  // Now the month the TOKEN reads holds what this session spent — someone else's month would not.
  checks.ok(
    'and getAgentBudget on the token counts it — the month is the minter’s',
    spent !== null && month.spentUsd !== null && month.spentUsd >= spent,
    JSON.stringify(month),
  )
  done(3)

  // ── 4 ──
  checks.step(
    '4. The agent writes the app: server.js as TEXT and logo.png as BYTES — a dry run, then the commit',
  )
  const frames: StreamFrame[] = []
  const stream = subscribe({
    origin,
    token,
    projectId: id,
    onFrame: (f) => frames.push(f),
  })
  await stream.ready
  const logo = onePixelPng()
  const changes: Schemas['CreateCommitRequest']['changes'] = [
    { op: 'write', path: 'server.js', content: fixture('server.js') },
    {
      op: 'write',
      path: 'logo.png',
      content: logo.toString('base64'),
      encoding: 'base64',
    },
  ]
  const base = (await tree(client, id)).commitSha
  const commit = (
    message: string,
    body: Schemas['CreateCommitRequest']['changes'],
    baseCommit = base,
    dryRun = false,
  ) =>
    client.POST('/v1/projects/{projectId}/commits', {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { baseCommit, message, changes: body, ...(dryRun ? { dryRun: true } : {}) },
    })
  const summary = (outcome: Schemas['CommitOutcome']) =>
    outcome.changes.map((c) => `${c.path} ${c.status}`).join(', ')

  const dry = await commit(
    'Reading responses: the page, and the course logo',
    changes,
    base,
    true,
  )
  const dryOutcome = unwrap(dry, 'createCommit')
  checks.ok(
    'the dry run: no commit, and exactly logo.png added and server.js modified',
    dryOutcome.dryRun &&
      dryOutcome.commitSha === null &&
      summary(dryOutcome) === 'logo.png added, server.js modified',
    `${dry.response.status} ${String(dryOutcome.commitSha)} ${summary(dryOutcome)}`,
  )
  checks.ok('and main has not moved', (await tree(client, id)).commitSha === base)

  const made = await commit('Reading responses: the page, and the course logo', changes)
  const outcome = unwrap(made, 'createCommit')
  const appCommit = checks.must('a commit, not a dry run', outcome.commitSha)
  checks.ok(
    '201: logo.png added, server.js modified',
    made.response.status === 201 &&
      summary(outcome) === 'logo.png added, server.js modified',
    `${made.response.status} ${summary(outcome)}`,
  )
  state.appCommit = appCommit
  state.logoSha256 = sha256(logo)
  save()

  // THE CONTROLS, each against the new head, and none of them may move it.
  const asBytes = await commit(
    'server.js, sent as bytes',
    [
      {
        op: 'write',
        path: 'server2.js',
        content: Buffer.from(fixture('server.js')).toString('base64'),
        encoding: 'base64',
      },
    ],
    appCommit,
  )
  checks.ok(
    'server.js sent as base64: 400 REQUEST_INVALID — text is never sent as bytes',
    refusal(asBytes, 400, 'REQUEST_INVALID') !== undefined,
    describe(asBytes),
  )
  const elf = await commit(
    'A logo that is a program',
    [
      {
        op: 'write',
        path: 'logo2.png',
        content: elfHeader().toString('base64'),
        encoding: 'base64',
      },
    ],
    appCommit,
  )
  checks.ok(
    'an ELF header named logo2.png: 400 REQUEST_INVALID — not one of the ten kinds',
    refusal(elf, 400, 'REQUEST_INVALID') !== undefined,
    describe(elf),
  )
  const before = frames.length
  const { bytes: pdf, key: planted } = pdfWithAKey()
  const syllabus = await commit(
    'The syllabus',
    [
      {
        op: 'write',
        path: 'syllabus.pdf',
        content: pdf.toString('base64'),
        encoding: 'base64',
      },
    ],
    appCommit,
  )
  const secret = refusal(syllabus, 409, 'SOURCE_SECRET_DETECTED')
  checks.ok(
    'a PDF with a key pasted in it: 409 SOURCE_SECRET_DETECTED, naming syllabus.pdf',
    secret !== undefined && secret.message.includes('syllabus.pdf:'),
    describe(syllabus),
  )
  checks.ok(
    'and the refusal does not quote the key',
    !JSON.stringify(syllabus.error ?? syllabus.data ?? {}).includes(planted),
  )
  const earlier = new Set(frames.slice(0, before))
  const found = await waitFor(
    frames,
    (f) =>
      !earlier.has(f) && f.kind === 'event' && f.type === 'repository.secret_refused',
    WITHIN_MS,
  )
  checks.ok(
    'repository.secret_refused names syllabus.pdf and its rule — and its JSON holds no key',
    found?.kind === 'event' &&
      found.type === 'repository.secret_refused' &&
      found.machineDetail.findings.some((x) => x.path === 'syllabus.pdf') &&
      !JSON.stringify(found).includes(planted),
    found === undefined
      ? 'no repository.secret_refused'
      : JSON.stringify(found).slice(0, 300),
  )
  const head = await tree(client, id)
  checks.ok(
    'main is still the app’s commit, after all three',
    head.commitSha === appCommit,
    head.commitSha,
  )
  const entry = head.entries.find((e) => e.path === 'logo.png')
  checks.ok(
    'getTree marks logo.png binary',
    entry?.binary === true,
    JSON.stringify(entry),
  )
  const back = await readBytes(origin, token, id, 'logo.png', appCommit)
  checks.ok(
    `getFile?encoding=base64 of logo.png: the same ${logo.length} bytes`,
    sha256(back) === state.logoSha256,
    `${back.length} bytes, sha256 ${sha256(back).slice(0, 16)}…`,
  )
  stream.close()
  save()
  done(4)
}

// ─── step 5 ────────────────────────────────────────────────────────────────────────────

async function deployPhase(): Promise<void> {
  const { client, token } = server()
  const id = projectId()
  const appCommit = checks.must('the app’s commit, from step 4', state.appCommit)
  const stagingId = checks.must('staging, from step 2', state.stagingEnvironmentId)
  const sandboxId = checks.must('the sandbox, from step 2', state.sandboxEnvironmentId)
  checks.step(
    '5. The server builds the app’s commit, releases it, and deploys it to staging — and to the sandbox, whose output step 6 reads',
  )
  const built = await buildAndWatch(origin, token, id, appCommit)
  const build = unwrap(
    await client.GET('/v1/builds/{buildId}', {
      params: { path: { buildId: built.buildId } },
    }),
    'getBuild',
  )
  checks.must(
    'the build of the app’s commit succeeded',
    build.status === 'succeeded' && build.commitSha === appCommit ? build : undefined,
    `${build.status} ${build.commitSha} ${build.error ?? ''}`,
  )
  const release = unwrap(
    await client.POST('/v1/projects/{projectId}/releases', {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { buildId: build.id, summary: `make demo-frontend ${state.runId}` },
    }),
    'createRelease',
  )
  checks.ok(
    'the release froze a confidential manifest',
    release.config.staging.classification === 'confidential',
    release.config.staging.classification,
  )
  const staging = await deployTo(client, stagingId, release.id)
  checks.must(
    'staging is healthy',
    staging.state === 'healthy' ? staging : undefined,
    staging.state,
  )
  const sandbox = await deployTo(client, sandboxId, release.id)
  checks.must(
    'the sandbox is healthy',
    sandbox.state === 'healthy' ? sandbox : undefined,
    sandbox.state,
  )
  Object.assign(state, {
    buildId: build.id,
    releaseId: release.id,
    stagingInstanceId: staging.id,
    sandboxInstanceId: sandbox.id,
  })
  console.log(
    `  staging ${staging.id} and sandbox ${sandbox.id}, both of release ${release.id}`,
  )
  save()
}

// ─── step 6 ────────────────────────────────────────────────────────────────────────────

async function outputPhase(): Promise<void> {
  const { client, token } = server()
  const runId = checks.must('the run, from step 2', state.runId)
  const sandboxId = checks.must('the sandbox, from step 2', state.sandboxEnvironmentId)
  const stagingId = checks.must('staging, from step 2', state.stagingEnvironmentId)
  checks.step(
    '6. The agent reads what the app printed — the SANDBOX instance’s output, redacted',
  )
  const list = unwrap(
    await client.GET('/v1/environments/{environmentId}/instances', {
      params: { path: { environmentId: sandboxId } },
    }),
    'listInstances',
  )
  const serving = list.instances.find((i) => i.serving)
  checks.ok(
    'listInstances names the serving instance — step 5’s sandbox deploy',
    serving !== undefined && serving.id === state.sandboxInstanceId,
    `${serving?.id ?? 'none serving'} (want ${state.sandboxInstanceId})`,
  )
  const printed = await whatTheAppPrinted(origin, token, sandboxId, 200)
  if (!printed.read)
    throw new JourneyStop(`getInstanceOutput: ${printed.code} — ${printed.next}`)
  const mine = printed.lines.filter(
    (l) => l.text.includes(MARKER) && l.text.includes(`from=${runId}`),
  )
  const line = mine.at(-1)
  checks.ok(
    `getInstanceOutput holds the marker line for this run’s request (${printed.lines.length} lines read)`,
    line !== undefined && line.stream === 'stdout',
    printed.lines
      .map((l) => l.text)
      .join(' | ')
      .slice(-300),
  )
  // A CREDENTIAL IN A URL: `mongodb://user:secret@` — anything between the user's colon and the `@`
  // that is not `[REDACTED]`.
  const unredacted = /mongodb:\/\/[^\s:@/"]+:(?!\[REDACTED\]@)[^\s@/"]+@/
  checks.ok(
    'where the app printed its own MONGODB_URI, the line reads [REDACTED]',
    line !== undefined &&
      line.text.includes('"mongo":') &&
      line.text.includes('[REDACTED]'),
    line?.text.replace(unredacted, '<A CREDENTIAL>').slice(0, 300) ?? '',
  )
  checks.ok(
    'and no line of the output holds the URI’s password',
    !printed.lines.some((l) => unredacted.test(l.text)),
  )
  const stagingOutput = await whatTheAppPrinted(origin, token, stagingId, 10)
  checks.ok(
    'staging’s instance: 403 INSTANCE_OUTPUT_STAGING — recent output is the sandbox’s (FE-24)',
    !stagingOutput.read && stagingOutput.code === 'INSTANCE_OUTPUT_STAGING',
    JSON.stringify(stagingOutput),
  )
  // Production's refusal, 403 INSTANCE_OUTPUT_PRODUCTION, is the UNIT tier's
  // (`api/instances.test.ts`): this demo never deploys to production.
  console.log(
    '  (production’s refusal, 403 INSTANCE_OUTPUT_PRODUCTION, is shown in the unit tier — this demo never deploys to production)',
  )

  // [S11a]'s SAFEGUARD: while the platform lets a confidential project's building agent use the
  // capable model, a TOKEN is refused staging's Incidents; the person's session is not, and every
  // token reads the sandbox's.
  const incidents = (client: ManifestClient, environmentId: string) =>
    client.GET('/v1/environments/{environmentId}/incidents', {
      params: { path: { environmentId } },
    })
  const tokenStaging = await incidents(client, stagingId)
  checks.ok(
    'the token’s staging listIncidents: 403 INCIDENT_LOG_CONFIDENTIAL',
    refusal(tokenStaging, 403, 'INCIDENT_LOG_CONFIDENTIAL') !== undefined,
    describe(tokenStaging),
  )
  const tokenSandbox = await incidents(client, sandboxId)
  checks.ok(
    'the token’s sandbox listIncidents: 200, a list',
    tokenSandbox.response.status === 200 &&
      tokenSandbox.data?.environmentId === sandboxId &&
      Array.isArray(tokenSandbox.data.incidents),
    describe(tokenSandbox),
  )
  const personStaging = await incidents(person(), stagingId)
  checks.ok(
    'the person’s staging listIncidents: 200, a list',
    personStaging.response.status === 200 &&
      personStaging.data?.environmentId === stagingId &&
      Array.isArray(personStaging.data.incidents),
    describe(personStaging),
  )
}

// ─── step 7 ────────────────────────────────────────────────────────────────────────────

async function peoplePhase(): Promise<void> {
  const id = projectId()
  const plain = person()
  const stepped = person('MANIFEST_SESSION_STEPPED')
  const student = unwrap(await person('MANIFEST_STUDENT_SESSION').GET('/v1/me'), 'getMe')
  checks.step(
    `7. People: the instructor, stepped up on the app origin, adds ${student.displayName} by CWL login name`,
  )
  const members = unwrap(
    await plain.GET('/v1/projects/{projectId}/members', {
      params: { path: { projectId: id } },
    }),
    'listMembers',
  )
  if (members.some((m) => m.userId === student.id)) {
    // THE RE-USE PATH: the last run added them; an add that changes nothing publishes nothing.
    unwrap(
      await stepped.DELETE('/v1/projects/{projectId}/members/{userId}', {
        params: {
          path: { projectId: id, userId: student.id },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
      }),
      'removeMember',
    )
    console.log(
      `  re-use: ${student.displayName} was added by an earlier run — removed first`,
    )
  }
  const frames: StreamFrame[] = []
  const stream = subscribe({
    origin,
    session: env('MANIFEST_SESSION'),
    projectId: id,
    onFrame: (f) => frames.push(f),
  })
  await stream.ready
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const replayed = new Set(frames)
  const add = (client: ManifestClient, cwlLogin: string) =>
    client.POST('/v1/projects/{projectId}/members', {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { cwlLogin, role: 'collaborator' },
    })
  const unstepped = await add(plain, 'student')
  checks.ok(
    'without a step-up: 403 STEP_UP_REQUIRED',
    refusal(unstepped, 403, 'STEP_UP_REQUIRED') !== undefined,
    describe(unstepped),
  )
  const added = await add(stepped, 'student')
  const member = unwrap(added, 'addMember')
  checks.ok(
    `stepped up: 201 — ${member.displayName}, cwlLogin student, a collaborator`,
    added.response.status === 201 &&
      member.userId === student.id &&
      member.cwlLogin === 'student' &&
      member.role === 'collaborator',
    JSON.stringify(member),
  )
  const event = await waitFor(
    frames,
    (f) => !replayed.has(f) && f.kind === 'event' && f.type === 'member.added',
    WITHIN_MS,
  )
  // memberId is the person ADDED; userId keeps its meaning in every event — who ACTED (sitting 5).
  checks.ok(
    'member.added: memberId is the student, userId the instructor who acted',
    event?.kind === 'event' &&
      event.type === 'member.added' &&
      event.machineDetail.memberId === student.id &&
      event.machineDetail.userId === state.instructorId &&
      event.machineDetail.role === 'collaborator',
    event === undefined ? 'no member.added frame' : JSON.stringify(event).slice(0, 300),
  )
  stream.close()
  const nobody = await add(stepped, 'nobody')
  checks.ok(
    'adding nobody: 400 MEMBER_USER_NOT_FOUND',
    refusal(nobody, 400, 'MEMBER_USER_NOT_FOUND') !== undefined,
    describe(nobody),
  )
}

// ─── step 8 ────────────────────────────────────────────────────────────────────────────

async function archivePhase(): Promise<void> {
  const id = projectId()
  const plain = person()
  const stepped = person('MANIFEST_SESSION_STEPPED')
  const { client } = server()
  const key = checks.must('the model key, from step 3', state.sessionKey)
  const baseUrl = checks.must('the gateway, from step 3', state.baseUrl)
  checks.step(
    '8. The instructor, stepped up, switches the app off — and everything it handed out stops',
  )
  const alive = await keyAnswer(baseUrl, key)
  checks.ok(
    'before: the gateway answers the agent’s key (200)',
    alive.status === 200,
    `${alive.status} ${alive.errorType}`,
  )
  const unstepped = await switchOff(plain, id, '/')
  checks.ok(
    'archiveProject without a step-up: the browser is sent to /auth/step-up',
    !unstepped.done &&
      'stepUpAt' in unstepped &&
      unstepped.stepUpAt.startsWith('/auth/step-up'),
    JSON.stringify(unstepped),
  )
  const off = await switchOff(stepped, id, '/')
  checks.must(
    'archiveProject, stepped up: archived',
    off.done && off.state === 'archived' ? off : undefined,
    JSON.stringify(off),
  )
  const dead = await keyAnswer(baseUrl, key)
  checks.ok(
    'the agent’s key: refused BY THE GATEWAY, which no longer holds it — 401 token_not_found_in_db',
    refusedKey(dead),
    `${dead.status} ${dead.errorType}`,
  )
  const withToken = await client.GET('/v1/projects/{projectId}', {
    params: { path: { projectId: id } },
  })
  checks.ok(
    'the token: 401 UNAUTHENTICATED',
    refusal(withToken, 401, 'UNAUTHENTICATED') !== undefined,
    describe(withToken),
  )
  const build = await plain.POST('/v1/projects/{projectId}/builds', {
    params: { path: { projectId: id }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: { commitSha: checks.must('the app’s commit', state.appCommit) },
  })
  checks.ok(
    'the instructor’s startBuild: 409 PROJECT_ARCHIVED',
    refusal(build, 409, 'PROJECT_ARCHIVED') !== undefined,
    describe(build),
  )
  const ended = (await sessionsOf(plain, id)).find((s) => s.id === state.sessionId)
  checks.ok(
    'listAgentSessions: step 3’s session ended, project_archived',
    ended?.state === 'ended' && ended.endReason === 'project_archived',
    JSON.stringify(ended).slice(0, 300),
  )
  save()
}

async function restorePhase(): Promise<void> {
  const id = projectId()
  const plain = person()
  const releaseId = checks.must('the release, from step 5', state.releaseId)
  const stagingId = checks.must('staging, from step 2', state.stagingEnvironmentId)
  checks.step('8. (cont.) Restored, and the same release deployed again')
  const back = await bringBack(plain, id)
  checks.must(
    'restoreProject: active — no step-up',
    back.done && back.state === 'active' ? back : undefined,
    JSON.stringify(back),
  )
  const old = await server().client.GET('/v1/projects/{projectId}', {
    params: { path: { projectId: id } },
  })
  checks.ok(
    'step 2’s token stays revoked: 401 UNAUTHENTICATED',
    refusal(old, 401, 'UNAUTHENTICATED') !== undefined,
    describe(old),
  )
  // The archive revoked the server's token, so the person mints it a new one.
  const tokenName = `reading responses server ${state.runId} (after the restore)`
  const minted = await mint(plain, id, tokenName)
  Object.assign(state, { token2Id: minted.token.id, token2Secret: minted.secret })
  save()
  const { client } = server(minted.secret)
  const instance = await deployTo(client, stagingId, releaseId)
  checks.must(
    'the server deploys the same release to staging: healthy',
    instance.state === 'healthy' && instance.releaseId === releaseId
      ? instance
      : undefined,
    `${instance.state} ${instance.releaseId}`,
  )
  state.stagingInstanceId = instance.id
  // A new model session, which step 10 ends.
  const started = unwrap(
    await client.POST('/v1/projects/{projectId}/agent-sessions', {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {
        name: `reading responses ${state.runId}, resumed`,
        capUsd: 1,
        durationMinutes: 30,
      },
    }),
    'startAgentSession',
  )
  Object.assign(state, { session2Id: started.session.id, session2Key: started.key })
  save()
  const live = await keyAnswer(started.baseUrl, started.key)
  checks.ok(
    'a new model session, whose key the gateway answers',
    live.status === 200 && live.models.length > 0,
    `${live.status} ${live.errorType}`,
  )
}

// ─── step 9 ────────────────────────────────────────────────────────────────────────────

async function deletePhase(): Promise<void> {
  const stepped = person('MANIFEST_SESSION_STEPPED')
  const scratchId = checks.must(
    'the scratch project, from step 2',
    state.scratchProjectId,
  )
  const scratchSlug = checks.must('its slug, from step 2', state.scratchSlug)
  checks.step(`9. ${scratchSlug}, deployed once and never launched, is deleted for good`)
  const main = (await tree(stepped, scratchId)).commitSha
  const started = unwrap(
    await stepped.POST('/v1/projects/{projectId}/builds', {
      params: {
        path: { projectId: scratchId },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { commitSha: main },
    }),
    'startBuild',
  )
  let build = started
  const deadline = Date.now() + 960_000
  while (
    (build.status === 'pending' || build.status === 'running') &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    build = unwrap(
      await stepped.GET('/v1/builds/{buildId}', {
        params: { path: { buildId: started.id } },
      }),
      'getBuild',
    )
  }
  checks.must(
    'its build succeeded',
    build.status === 'succeeded' ? build : undefined,
    build.status,
  )
  const release = unwrap(
    await stepped.POST('/v1/projects/{projectId}/releases', {
      params: {
        path: { projectId: scratchId },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { buildId: build.id },
    }),
    'createRelease',
  )
  const { sandbox } = await environmentsOf(stepped, scratchId)
  const instance = await deployTo(stepped, sandbox.id, release.id)
  checks.must(
    'deployed to its sandbox: healthy',
    instance.state === 'healthy' ? instance : undefined,
    instance.state,
  )
  const serving = await probe(sandbox.url)
  checks.ok(
    `${sandbox.hostname} answers the app`,
    serving.status === 200 && serving.body.startsWith('fixture-app in sandbox'),
    `${serving.status} ${serving.body.slice(0, 120)}`,
  )

  const gone = await deleteForGood(stepped, scratchId, '/')
  checks.must(
    'deleteProject, stepped up: deleted',
    gone.done && gone.state === 'deleted' ? gone : undefined,
    JSON.stringify(gone),
  )
  const after = await probe(sandbox.url)
  // The edge's WILDCARD, not the switched-off page: a deleted project's names answer nothing of
  // its own (`releases/delete.docker.test.ts`).
  checks.ok(
    `${sandbox.hostname} no longer answers the app — the edge’s wildcard does`,
    after.body.startsWith(`manifest OK host=${sandbox.hostname}`),
    `${after.status} ${after.body.slice(0, 120)}`,
  )
  const slug = unwrap(
    await stepped.GET('/v1/slugs/{slug}', { params: { path: { slug: scratchSlug } } }),
    'checkSlug',
  )
  checks.ok(
    `checkSlug: ${scratchSlug} is available`,
    slug.available,
    JSON.stringify(slug),
  )
  const read = await stepped.GET('/v1/projects/{projectId}', {
    params: { path: { projectId: scratchId } },
  })
  checks.ok(
    'getProject of it: 404 NOT_FOUND',
    refusal(read, 404, 'NOT_FOUND') !== undefined,
    describe(read),
  )

  // THE ONE CALL THIS DEMO MAKES TO A PROJECT IT DID NOT CREATE — and it is READ-ONLY: a launched
  // project's delete is refused before anything is touched (the plan's [S9]). Asked only when
  // `launch-app` has launched (`make demo-production` launches it).
  const launched = unwrap(await stepped.GET('/v1/projects'), 'listProjects').find(
    (p) => p.slug === 'launch-app' && p.launchedAt !== null,
  )
  if (launched === undefined) {
    console.log(
      '  (launch-app has not launched on this machine — make demo-production launches it — so PROJECT_LAUNCHED_NOT_DELETABLE is not asked here)',
    )
  } else {
    const refused = await stepped.DELETE('/v1/projects/{projectId}', {
      params: {
        path: { projectId: launched.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    })
    const still = unwrap(
      await stepped.GET('/v1/projects/{projectId}', {
        params: { path: { projectId: launched.id } },
      }),
      'getProject',
    )
    checks.ok(
      'launch-app, launched: 409 PROJECT_LAUNCHED_NOT_DELETABLE — refused before anything was touched, and still active',
      refusal(refused, 409, 'PROJECT_LAUNCHED_NOT_DELETABLE') !== undefined &&
        still.state === 'active',
      `${describe(refused)} (state ${still.state})`,
    )
  }
}

// ─── step 10 ───────────────────────────────────────────────────────────────────────────

async function endPhase(): Promise<void> {
  const id = projectId()
  const plain = person()
  const { client } = server(state.token2Secret)
  const session2Id = checks.must('the resumed session, from step 8', state.session2Id)
  const key2 = checks.must('its key, from step 8', state.session2Key)
  const baseUrl = checks.must('the gateway, from step 3', state.baseUrl)
  const token2Id = checks.must('the new token, from step 8', state.token2Id)
  checks.step(
    '10. The server ends the session it started; the instructor revokes its token',
  )
  const ended = unwrap(
    await client.DELETE('/v1/agent-sessions/{sessionId}', {
      params: {
        path: { sessionId: session2Id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    }),
    'endAgentSession',
  )
  checks.ok(
    'endAgentSession: ended',
    ended.state === 'ended' && ended.endReason === 'ended',
    `${ended.state} ${String(ended.endReason)}`,
  )
  const dead = await keyAnswer(baseUrl, key2)
  checks.ok(
    'its key: refused by the gateway, which no longer holds it — 401 token_not_found_in_db',
    refusedKey(dead),
    `${dead.status} ${dead.errorType}`,
  )
  const revoked = unwrap(
    await plain.DELETE('/v1/tokens/{tokenId}', {
      params: {
        path: { tokenId: token2Id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    }),
    'revokeToken',
  )
  checks.ok('revokeToken: revoked', revoked.revokedAt !== null, String(revoked.revokedAt))
  const refused = await client.GET('/v1/projects/{projectId}', {
    params: { path: { projectId: id } },
  })
  checks.ok(
    'the token: 401 UNAUTHENTICATED',
    refusal(refused, 401, 'UNAUTHENTICATED') !== undefined,
    describe(refused),
  )
  const active = (await sessionsOf(plain, id)).filter((s) => s.state === 'active')
  checks.ok(
    'no session of this project is active',
    active.length === 0,
    active.map((s) => `${s.id} ${s.name}`).join(', '),
  )
}

async function main(): Promise<void> {
  try {
    if (phase === 'person') await personPhase()
    else if (phase === 'session') await sessionPhase()
    else if (phase === 'agent') await agentPhase()
    else if (phase === 'deploy') await deployPhase()
    else if (phase === 'output') await outputPhase()
    else if (phase === 'people') await peoplePhase()
    else if (phase === 'archive') await archivePhase()
    else if (phase === 'restore') await restorePhase()
    else if (phase === 'delete') await deletePhase()
    else await endPhase()
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
