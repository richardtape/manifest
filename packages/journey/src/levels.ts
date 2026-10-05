import { readFileSync, writeFileSync } from 'node:fs'
import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type ErrorEnvelope,
  type ManifestClient,
} from '@manifest/contract'
import { Checks, JourneyStop } from './check.js'

/**
 * THE U1 PLAN'S ACCEPTANCE (Task 7): Manifest's data classes as UBC's U1 levels, each seen through the
 * edge by nothing but the generated client — `low | medium | high | very-high`, the three earlier names
 * kept as aliases with one meaning each (`public` = `low`, `internal` = `medium`, `confidential` =
 * `very-high`).
 *
 *   node packages/journey/dist/levels.js <phase> <state.json>
 *
 * Signing in and stepping up are a browser's round trips at the IdP, and that is bash's business (P5a
 * Decision 38): `scripts/demo-levels.sh` signs the instructor in, steps them up to delete an earlier
 * run's projects, reads LiteLLM's catalogue for the capable model's level, and hands each phase what it
 * needs.
 *
 *   find     MANIFEST_SESSION            are the two projects here from a run before?
 *   clear    MANIFEST_SESSION_STEPPED    deletes them, so every run is whole
 *   make     MANIFEST_SESSION            step 0's projects: the high one and the very-high one
 *   levels   MANIFEST_SESSION            steps 1–6
 *
 * **THE CAPABLE MODEL** (`default-chat-large`) is read ONCE, by the script: `MANIFEST_CAPABLE` is
 * `listed` or `absent`, `MANIFEST_CAPABLE_LEVEL` its row's `max_classification` as a U1 level, and
 * `MANIFEST_CAPABLE_SETTING_LEVEL` `.env`'s `MANIFEST_CAPABLE_MODEL_CLASSIFICATION` as one (`medium`
 * when unset). Every half that needs it at `high` prints NOT RUN otherwise — a half not run is not a
 * pass, and says so.
 *
 * **NOTHING HERE LAUNCHES**, so the projects from an earlier run are deleted and made again: the fresh
 * path and the re-use path differ only in `clear`.
 *
 * **ASSERT THE CODE, NEVER THE STATUS** (ORIENTATION §9): a `422` is `SPEC_INVALID`, and its detail's
 * code is what says the model is too low for the level — not the slug, not the budget.
 *
 * **`MANIFEST_STOP_AFTER=<0–6>`** ends the run after that step — a negative control's short run.
 */

const PHASES = ['find', 'clear', 'make', 'levels'] as const
type Phase = (typeof PHASES)[number]

const CAPABLE = 'default-chat-large'
const ON_PREMISE = 'default-chat-onprem'
const SMALL = 'default-chat'

/** The privacy assessment's three sentences the Privacy Office reads (Task 3; the plan's *I6*). */
const CLASSIFICATION_FACT =
  'High — every AI model the app uses must be approved for high data.'
const ON_PREMISE_FACT =
  'Approved for very high data: it runs on on-premise hardware, so what the app sends it stays there.'
const ZERO_RETENTION_FACT =
  'Approved for high data at most: it may be answered by a provider off-premise that keeps none of what it is sent (zero data retention), as the platform’s administrator attests, so what the app sends it may leave UBC but is not kept there.'

interface LevelsState {
  driver?: string
  slug?: string
  vhSlug?: string
  runId?: string
  /** What `find` saw: neither project, or one or both an earlier run left (deleted and made again). */
  existing?: 'none' | 'here'
  projectId?: string
  vhProjectId?: string
  stagingEnvironmentId?: string
  sandboxEnvironmentId?: string
  stopped?: boolean
}

const [phaseArg, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
if (!PHASES.includes(phaseArg as Phase) || statePath === undefined) {
  console.error(`usage: levels.js <${PHASES.join('|')}> <state.json>`)
  process.exit(2)
}
const phase = phaseArg as Phase
const path: string = statePath
const stopAfter =
  process.env.MANIFEST_STOP_AFTER === undefined || process.env.MANIFEST_STOP_AFTER === ''
    ? undefined
    : Number(process.env.MANIFEST_STOP_AFTER)

const checks = new Checks()
const state: LevelsState = (() => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as LevelsState
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
  return `${result.response.status} ${envelope?.error?.code ?? '(no envelope)'}: ${envelope?.error?.message ?? ''} ${JSON.stringify(envelope?.error?.details ?? [])}`
}

/** The capable model as the script read it from LiteLLM: listed, and at which U1 level. */
const capable = (() => {
  const listed = process.env.MANIFEST_CAPABLE === 'listed'
  const level = process.env.MANIFEST_CAPABLE_LEVEL ?? ''
  return { listed, level, atHigh: listed && level === 'high' }
})()

/** Prints a half the capable model's level does not reach, as NOT RUN — never as a pass. */
function notRun(half: string): void {
  console.log(
    `  NOT RUN  ${half} — the capable model is ${capable.listed ? `listed at ${capable.level}` : 'not listed'}, not at high`,
  )
}

/**
 * A manifest.yaml declaring a level and its models — the blueprint's minimal one (`renderProjectSeed`),
 * with `ai.models` and `data.classification`. The budget is left out: with models declared it is the
 * project's AI quota (§7).
 */
function manifest(slug: string, level: string, models: readonly string[]): string {
  return [
    'manifest: 1',
    `name: ${slug}`,
    'blueprint: node-ts-mongo@1',
    'runtime:',
    '  port: 3000',
    '  health: /healthz',
    'ai:',
    `  models: [${models.join(', ')}]`,
    'data:',
    `  classification: ${level}`,
    '',
  ].join('\n')
}

async function head(client: ManifestClient, projectId: string): Promise<string> {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId } },
    }),
    'getTree',
  ).commitSha
}

/** One commit of manifest.yaml at a level — a dry run when `dryRun`. The raw answer, to assert on. */
async function commit(
  client: ManifestClient,
  projectId: string,
  slug: string,
  level: string,
  models: readonly string[],
  dryRun: boolean,
) {
  return client.POST('/v1/projects/{projectId}/commits', {
    params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: {
      baseCommit: await head(client, projectId),
      message: `${dryRun ? 'A dry run: ' : ''}data.classification ${level}, ai.models [${models.join(', ')}]`,
      changes: [
        { op: 'write', path: 'manifest.yaml', content: manifest(slug, level, models) },
      ],
      ...(dryRun ? { dryRun: true } : {}),
    },
  })
}

/** A dry run's verdict: valid (the answer is 200 and a dry run), or the SPEC_INVALID detail at `ai.models.<i>`. */
async function dryRunOf(
  client: ManifestClient,
  projectId: string,
  slug: string,
  level: string,
  models: readonly string[],
) {
  const answered = await commit(client, projectId, slug, level, models, true)
  const invalid = refusal(answered, 422, 'SPEC_INVALID')
  return {
    answered,
    valid: answered.response.ok && answered.data?.dryRun === true,
    tooLow: invalid?.details?.find(
      (d) =>
        d.code === 'SPEC_MODEL_CLASSIFICATION_TOO_LOW' && d.path.startsWith('ai.models.'),
    ),
  }
}

async function classificationOf(
  client: ManifestClient,
  projectId: string,
): Promise<unknown> {
  const spec = unwrap(
    await client.GET('/v1/projects/{projectId}/spec', {
      params: { path: { projectId } },
    }),
    'getSpec',
  )
  return (spec.spec.data as { classification?: unknown } | undefined)?.classification
}

// ─── find, clear, make ───────────────────────────────────────────────────────────────

async function findPhase(): Promise<void> {
  checks.step('0. The instructor’s two projects — here from a run before, or not')
  const owner = clientFor('MANIFEST_SESSION')
  const me = unwrap(await owner.GET('/v1/me'), 'getMe')
  checks.ok('signed in as the instructor', me.puid === 'ins000001', me.puid)
  state.slug = env('MANIFEST_SLUG')
  state.vhSlug = env('MANIFEST_VH_SLUG')
  state.driver = env('MANIFEST_DRIVER')
  state.runId = env('MANIFEST_RUN_ID')
  const projects = unwrap(await owner.GET('/v1/projects'), 'listProjects')
  const found = projects.find((p) => p.slug === state.slug)
  const vhFound = projects.find((p) => p.slug === state.vhSlug)
  delete state.projectId
  delete state.vhProjectId
  if (found !== undefined) state.projectId = found.id
  if (vhFound !== undefined) state.vhProjectId = vhFound.id
  state.existing = found === undefined && vhFound === undefined ? 'none' : 'here'
  console.log(
    state.existing === 'none'
      ? `  neither ${state.slug} nor ${state.vhSlug} is here — the FRESH path`
      : `  ${[found?.slug, vhFound?.slug].filter(Boolean).join(' and ')} here from a run before — the RE-USE path: deleted and made again`,
  )
}

async function clearPhase(): Promise<void> {
  checks.step('0. The projects an earlier run left are deleted — nothing here launches')
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  for (const [slug, id] of [
    [state.slug, state.projectId],
    [state.vhSlug, state.vhProjectId],
  ] as const) {
    if (id === undefined) continue
    const deleted = await owner.DELETE('/v1/projects/{projectId}', {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    })
    checks.must(
      `${slug} deleted`,
      deleted.response.status === 200 ? true : undefined,
      describe(deleted),
    )
  }
  delete state.projectId
  delete state.vhProjectId
  state.existing = 'none'
}

async function makePhase(): Promise<void> {
  checks.step('0. The instructor creates the two projects, from the blueprint')
  const owner = clientFor('MANIFEST_SESSION')
  for (const [slug, name] of [
    [checks.must('the slug, from find', state.slug), 'Course feedback (levels: high)'],
    [
      checks.must('the very-high slug, from find', state.vhSlug),
      'Advising notes (levels: very-high)',
    ],
  ] as const) {
    const created = unwrap(
      await owner.POST('/v1/projects', {
        params: { header: { 'Idempotency-Key': idempotencyKey() } },
        body: {
          slug,
          name,
          blueprint: 'node-ts-mongo@1',
          audience: { scale: 'solo', burst: 'steady' },
        },
      }),
      'createProject',
    )
    checks.ok(
      `${slug} created on driver ${state.driver === 'local' ? 1 : 2} (${state.driver})`,
      created.repository?.provider === state.driver,
      JSON.stringify(created.repository),
    )
    if (slug === state.slug) state.projectId = created.id
    else state.vhProjectId = created.id
  }
  const environments = unwrap(
    await owner.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId: checks.must('the high project', state.projectId) } },
    }),
    'listEnvironments',
  )
  state.stagingEnvironmentId = checks.must(
    'its staging environment',
    environments.find((e) => e.kind === 'staging')?.id,
  )
  state.sandboxEnvironmentId = checks.must(
    'its sandbox environment',
    environments.find((e) => e.kind === 'sandbox')?.id,
  )
  save()
  done(0)
}

// ─── levels: steps 1–6 ───────────────────────────────────────────────────────────────

/** Step 1: D17 at `high`, in U1's words — and the capable model's level, as `.env` set it. */
async function step1(owner: ManifestClient, id: string, slug: string): Promise<void> {
  checks.step(
    '1. D17 at high, in U1’s words — default-chat is refused, and the hint names U1, not a law',
  )
  const { answered, tooLow } = await dryRunOf(owner, id, slug, 'high', [SMALL])
  checks.ok(
    'a dry run of high with [default-chat] is 422 SPEC_INVALID',
    refusal(answered, 422, 'SPEC_INVALID') !== undefined,
    describe(answered),
  )
  checks.ok(
    'its detail at ai.models.0 is SPEC_MODEL_CLASSIFICATION_TOO_LOW',
    tooLow?.path === 'ai.models.0',
    describe(answered),
  )
  const hint = tooLow?.hint ?? ''
  checks.ok(
    'its hint: "approved for medium data at most"',
    hint.includes('approved for medium data at most'),
    hint,
  )
  checks.ok(
    'and "(Information Security Standard U1)"',
    hint.includes('(Information Security Standard U1)'),
    hint,
  )
  checks.ok(
    'and not "BC public body" — a level states no law (E14)',
    !hint.includes('BC public body'),
    hint,
  )

  const setting = process.env.MANIFEST_CAPABLE_SETTING_LEVEL ?? ''
  if (capable.listed)
    checks.ok(
      `the capable model is listed at ${capable.level}, the level .env sets (${setting}) — the setting threaded to LiteLLM`,
      capable.level === setting,
      `row ${capable.level}, setting ${setting}`,
    )
  else
    console.log(
      `  NOT RUN  the capable model's level against .env's (${setting}) — it is not listed`,
    )
  done(1)
}

/** Step 2: the alias never widens — `confidential` is `very-high`, whatever a model's earlier name. */
async function step2(owner: ManifestClient, id: string, slug: string): Promise<void> {
  checks.step('2. The alias never widens: confidential is very-high')
  const onPrem = await dryRunOf(owner, id, slug, 'confidential', [ON_PREMISE])
  checks.ok(
    'confidential with [default-chat-onprem] is valid',
    onPrem.valid,
    describe(onPrem.answered),
  )
  const small = await dryRunOf(owner, id, slug, 'confidential', [SMALL])
  checks.ok(
    'confidential with [default-chat] is refused SPEC_MODEL_CLASSIFICATION_TOO_LOW',
    small.tooLow !== undefined,
    describe(small.answered),
  )
  checks.ok(
    'and its message names very-high, the level the alias means',
    small.tooLow?.message.includes('very-high') === true,
    small.tooLow?.message ?? '',
  )
  if (capable.atHigh) {
    const above = await dryRunOf(owner, id, slug, 'confidential', [CAPABLE])
    checks.ok(
      'confidential with [default-chat-large] — the capable model at high — is refused too',
      above.tooLow !== undefined,
      describe(above.answered),
    )
    const at = await dryRunOf(owner, id, slug, 'high', [CAPABLE])
    checks.ok(
      'and high with [default-chat-large] is valid — its positive control',
      at.valid,
      describe(at.answered),
    )
  } else notRun('the capable model’s two dry runs')
  done(2)
}

/** Step 3: stored as the level, answered in U1's names; a rename is not a change. */
async function step3(owner: ManifestClient, id: string, slug: string): Promise<void> {
  checks.step(
    '3. Stored as the level, answered in U1’s names — and a rename is not a change',
  )
  const first = await commit(owner, id, slug, 'internal', [SMALL], false)
  checks.must(
    'internal with [default-chat] is committed',
    first.response.status === 201 ? true : undefined,
    describe(first),
  )
  const answeredFirst = await classificationOf(owner, id)
  checks.ok(
    'getSpec answers data.classification medium — the level, not the alias',
    answeredFirst === 'medium',
    String(answeredFirst),
  )

  const renamed = await commit(owner, id, slug, 'medium', [SMALL], false)
  const renamedOutcome = unwrap(renamed, 'createCommit')
  checks.ok(
    'medium, the same level by its name: its sensitive diff does NOT list data.classification',
    !renamedOutcome.spec.sensitiveDiff.fields.includes('data.classification'),
    renamedOutcome.spec.sensitiveDiff.fields.join(', '),
  )

  const models = capable.atHigh ? [CAPABLE, ON_PREMISE] : [ON_PREMISE]
  if (!capable.atHigh)
    notRun(
      'the spec’s own example, high with [default-chat-large, default-chat-onprem]; committed with [default-chat-onprem] alone',
    )
  const raised = await commit(owner, id, slug, 'high', models, false)
  const raisedOutcome = unwrap(raised, 'createCommit')
  checks.ok(
    `high with [${models.join(', ')}] is committed, valid`,
    raisedOutcome.spec.appSpecId !== null,
    JSON.stringify(raisedOutcome.spec).slice(0, 300),
  )
  const answeredRaised = await classificationOf(owner, id)
  checks.ok('getSpec answers high', answeredRaised === 'high', String(answeredRaised))
  checks.ok(
    'and its sensitive diff DOES list data.classification — the positive control',
    raisedOutcome.spec.sensitiveDiff.fields.includes('data.classification'),
    raisedOutcome.spec.sensitiveDiff.fields.join(', '),
  )
  done(3)
}

/** One agent session's models, its session ended before the answer is returned. */
async function sessionModels(
  owner: ManifestClient,
  projectId: string,
  name: string,
): Promise<string[]> {
  const started = unwrap(
    await owner.POST('/v1/projects/{projectId}/agent-sessions', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: { name, capUsd: 1, durationMinutes: 10 },
    }),
    'startAgentSession',
  )
  unwrap(
    await owner.DELETE('/v1/agent-sessions/{sessionId}', {
      params: {
        path: { sessionId: started.session.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    }),
    'endAgentSession',
  )
  return started.session.models
}

/** Step 4: the agents' models — by rank on the high project, by the builder exception above it. */
async function step4(owner: ManifestClient, id: string): Promise<void> {
  checks.step(
    '4. The agents’ models: by rank at high, by the builder exception at very-high',
  )
  const high = await sessionModels(owner, id, 'levels acceptance (high)')
  checks.ok(
    'the high project’s session holds default-chat-onprem',
    high.includes(ON_PREMISE),
    high.join(', '),
  )
  checks.ok('and NOT default-chat', !high.includes(SMALL), high.join(', '))
  if (capable.atHigh)
    checks.ok(
      'and default-chat-large — by rank, which is D17',
      high.includes(CAPABLE),
      high.join(', '),
    )
  else notRun('the high project’s capable model, by rank')

  const vhSlug = checks.must('the very-high slug', state.vhSlug)
  const vhId = checks.must('the very-high project, from step 0', state.vhProjectId)
  const committed = await commit(owner, vhId, vhSlug, 'very-high', [ON_PREMISE], false)
  checks.must(
    `${vhSlug} committed very-high with [default-chat-onprem]`,
    committed.response.status === 201 ? true : undefined,
    describe(committed),
  )
  const vh = await sessionModels(owner, vhId, 'levels acceptance (very-high)')
  checks.ok(
    'the very-high project’s session holds default-chat-onprem',
    vh.includes(ON_PREMISE),
    vh.join(', '),
  )
  checks.ok('and NOT default-chat', !vh.includes(SMALL), vh.join(', '))
  if (capable.listed)
    checks.ok(
      `and default-chat-large — above its level (${capable.level}), so ONLY by the builder exception (S4/S10)`,
      vh.includes(CAPABLE),
      vh.join(', '),
    )
  else console.log('  NOT RUN  the builder exception — the capable model is not listed')
  done(4)
}

/** Step 5: a delegated token is refused staging's Incident tails at high (S9); the sandbox's are its own. */
async function step5(owner: ManifestClient, id: string): Promise<void> {
  checks.step(
    '5. A token is refused a high project’s staging Incidents — the sandbox’s and a person’s are answered',
  )
  const minted = unwrap(
    await owner.POST('/v1/projects/{projectId}/tokens', {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {
        name: `levels reader ${state.runId}`,
        capabilities: ['project:read'],
        expiresInDays: 1,
      },
    }),
    'mintToken',
  )
  try {
    const agent = createManifestClient({ origin, token: minted.secret })
    const staging = checks.must('staging, from step 0', state.stagingEnvironmentId)
    const sandbox = checks.must('the sandbox, from step 0', state.sandboxEnvironmentId)
    const list = (client: ManifestClient, environmentId: string) =>
      client.GET('/v1/environments/{environmentId}/incidents', {
        params: { path: { environmentId } },
      })
    const refused = await list(agent, staging)
    checks.ok(
      'the token on staging: 403 INCIDENT_LOG_CONFIDENTIAL',
      refusal(refused, 403, 'INCIDENT_LOG_CONFIDENTIAL') !== undefined,
      describe(refused),
    )
    const onSandbox = await list(agent, sandbox)
    checks.ok(
      'the token on the sandbox: 200',
      onSandbox.response.status === 200,
      describe(onSandbox),
    )
    const person = await list(owner, staging)
    checks.ok(
      'the person’s session on staging: 200',
      person.response.status === 200,
      describe(person),
    )
  } finally {
    unwrap(
      await owner.DELETE('/v1/tokens/{tokenId}', {
        params: {
          path: { tokenId: minted.token.id },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
      }),
      'revokeToken',
    )
  }
  done(5)
}

/** Step 6: the privacy assessment the Privacy Office reads — the level, and each model's line. */
async function step6(owner: ManifestClient, id: string): Promise<void> {
  checks.step(
    '6. The privacy assessment: High, the on-premise model’s line, the capable model’s zero retention',
  )
  const assessment = unwrap(
    await owner.POST('/v1/projects/{projectId}/launch-records/privacy-assessment/draft', {
      params: {
        path: { projectId: id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    }),
    'draftPrivacyAssessment',
  )
  const draft = checks.must('the assessment carries its draft', assessment.draft)
  const flows = checks.must(
    'its flows section',
    draft.sections.find((s) => s.id === 'flows'),
  )
  const fact = (label: string) => flows.facts.find((f) => f.label === label)?.value
  checks.ok(
    `Classification: "${CLASSIFICATION_FACT}"`,
    fact('Classification') === CLASSIFICATION_FACT,
    fact('Classification') ?? '(none)',
  )
  checks.ok(
    `default-chat-onprem: "${ON_PREMISE_FACT}"`,
    fact(ON_PREMISE) === ON_PREMISE_FACT,
    fact(ON_PREMISE) ?? '(none)',
  )
  if (capable.atHigh)
    checks.ok(
      'default-chat-large: the zero-retention sentence',
      fact(CAPABLE) === ZERO_RETENTION_FACT,
      fact(CAPABLE) ?? '(none)',
    )
  else notRun('the capable model’s zero-retention sentence')
  console.log(
    `  drafted ${draft.generatedAt} from ${draft.fromCommit.slice(0, 12)} — the console’s Records shows it`,
  )
  done(6)
}

async function levelsPhase(): Promise<void> {
  const owner = clientFor('MANIFEST_SESSION')
  const id = checks.must('the high project, from step 0', state.projectId)
  const slug = checks.must('the slug, from find', state.slug)
  await step1(owner, id, slug)
  await step2(owner, id, slug)
  await step3(owner, id, slug)
  await step4(owner, id)
  await step5(owner, id)
  await step6(owner, id)
}

const phases: Record<Phase, () => Promise<void>> = {
  find: findPhase,
  clear: clearPhase,
  make: makePhase,
  levels: levelsPhase,
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
