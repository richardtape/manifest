import { readFileSync, writeFileSync } from 'node:fs'
import {
  createManifestClient,
  idempotencyKey,
  unwrap,
  type ManifestClient,
  type Schemas,
} from '@manifest/contract'
import { Checks, JourneyStop } from './check.js'

/**
 * THE UBC AI GATEWAY PLAN'S ACCEPTANCE (its Task 6): the capable model, and the gateway's own models, ANSWERED BY
 * UBC'S AI GATEWAY through an agent's key — and every call charged to the person who asked, at the price that binds.
 *
 *   node packages/journey/dist/gateway.js <phase> <state.json>
 *
 * `scripts/demo-gateway.sh` is the other half (P5a Decision 38): it signs the instructor in, reads LiteLLM's
 * catalogue with its master key (phases 0 and 1 — the prices this file checks against arrive in the state file),
 * reads the GATEWAY's own spend for its key before and after (by a direct call, the key never printed), and counts
 * the key in every log (phase 5). This file never sees the gateway's key or LiteLLM's master key: an agent's key,
 * answered once by `startAgentSession`, is the only model credential it holds.
 *
 *   prepare        MANIFEST_SESSION   the two projects — found, or created — each at its classification
 *   internal       MANIFEST_SESSION   phase 2: an internal project's session, through the gateway
 *   confidential   MANIFEST_SESSION   phase 4: a confidential project's session, on the gateway's own model
 *   ended          MANIFEST_SESSION   phase 6: both sessions ended
 *
 * WHAT "ANSWERED BY THE GATEWAY" MEANS HERE (the plan's I6, and its sitting 2's F20): a fallback's answer is a `200`
 * too, and spend rises for it — so every call asserts `x-litellm-attempted-fallbacks: 0` (LiteLLM 1.98.0 sends `0` on
 * an answer the primary gave, never no header), `x-litellm-model-api-base` the gateway's address, and a body `model`
 * that is not the on-premise one.
 *
 * WHAT A CALL COSTS (sitting 1's F4): for a model the gateway PRICES, LiteLLM charges what the gateway REPORTS, never
 * its own pin — for `gpt-6-luna` the two are the same numbers, so `usage × the price LiteLLM lists` is checked as
 * well as the answer's own `x-litellm-response-cost`; for one it does not price (`qwen3.8-27b`), the pin IS the price.
 * Either way the session's spend is checked EXACTLY (12 decimal places, as `capable.docker.test.ts`), never "within a
 * cent": one call costs ~$0.00001, so a looser check passes at a spend of 0.
 *
 * Every call is on Rich's 30 USD key: few, and short.
 */

const PHASES = ['prepare', 'internal', 'confidential', 'ended'] as const
type Phase = (typeof PHASES)[number]

/** `make demo-launch`'s app's manifest — its classification is the only thing this demo changes. */
const FIXTURE = new URL(
  '../../../fixtures/launch-path-app/manifest.yaml',
  import.meta.url,
)
/** LiteLLM writes a key's spend a few seconds after the call (its batch writer). */
const SPEND_WITHIN_MS = 90_000
/** 12 decimal places — `toBeCloseTo(…, 12)`'s bound. */
const EXACT = 5e-13
const CAPABLE = 'default-chat-large'
const ON_PREMISE = /qwen3\.8:27b|ollama/i

interface Price {
  input: number
  output: number
  cacheRead: number | null
}

interface GatewayState {
  driver?: string
  runId?: string
  /** The gateway's address, as LiteLLM's catalogue names it (phase 1). */
  gatewayUrl?: string
  /** Each LiteLLM name's listed price (phase 1, from `/model/info` with the master key). */
  prices?: Record<string, Price>
  /** `MANIFEST_GATEWAY_MODELS`' names, as the catalogue lists them, with each one's classification (phase 1). */
  gatewayModels?: { name: string; classification: string }[]
  internalSlug?: string
  internalProjectId?: string
  confidentialSlug?: string
  confidentialProjectId?: string
  /** What `prepare` found: both projects here from a run before, or made now. */
  existing?: 'made' | 'here'
  internalSessionId?: string
  confidentialSessionId?: string
  /** What phase 2's session was charged — every call the GATEWAY prices. demo-gateway.sh compares the gateway's rise. */
  chargedGatewayUsd?: number
  /** What phase 4's session was charged — the gateway's own model, at the pin. */
  chargedPinnedUsd?: number
  stopped?: boolean
}

const [phaseArg, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
if (!PHASES.includes(phaseArg as Phase) || statePath === undefined) {
  console.error(`usage: gateway.js <${PHASES.join('|')}> <state.json>`)
  process.exit(2)
}
const phase = phaseArg as Phase
const path: string = statePath
const stopAfter =
  process.env.MANIFEST_STOP_AFTER === undefined || process.env.MANIFEST_STOP_AFTER === ''
    ? undefined
    : Number(process.env.MANIFEST_STOP_AFTER)

const checks = new Checks()
const state: GatewayState = (() => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as GatewayState
  } catch {
    return {}
  }
})()

function save(): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
}

function env(variable: string): string {
  const value = process.env[variable]
  if (value !== undefined && value !== '') return value
  return checks.must<string>(`${variable} was provided`, undefined)
}

function done(n: number): void {
  if (stopAfter === undefined || n < stopAfter) return
  state.stopped = true
  save()
  console.log(`\n(stopped after step ${n}, as MANIFEST_STOP_AFTER asked)`)
  checks.finish()
}

function owner(): ManifestClient {
  return createManifestClient({ origin, session: env('MANIFEST_SESSION') })
}

function priceOf(name: string): Price {
  return checks.must(`${name}'s price, from phase 1`, state.prices?.[name])
}

/** The fixture's manifest, named for the project, at a classification. */
function manifestFor(slug: string, classification: string): string {
  const source = readFileSync(FIXTURE, 'utf8')
  if (!/^name: .*$/m.test(source) || !/^ {2}classification: internal$/m.test(source))
    throw new JourneyStop(
      'the fixture manifest.yaml has no top-level name, or is not internal',
    )
  return source
    .replace(/^name: .*$/m, `name: ${slug}`)
    .replace(/^ {2}classification: internal$/m, `  classification: ${classification}`)
}

/** The project of this slug — found, or created — with `manifest.yaml` at the classification. */
async function ensureProject(
  client: ManifestClient,
  slug: string,
  classification: string,
): Promise<{ id: string; made: boolean }> {
  const listed = unwrap(await client.GET('/v1/projects'), 'listProjects')
  let project = listed.find((p) => p.slug === slug)
  const made = project === undefined
  if (project === undefined) {
    project = unwrap(
      await client.POST('/v1/projects', {
        params: { header: { 'Idempotency-Key': idempotencyKey() } },
        body: {
          slug,
          name: `Gateway acceptance (${classification})`,
          blueprint: 'node-ts-mongo@1',
          audience: {
            scale: 'class',
            burst: 'synchronised',
            justification: 'The UBC AI Gateway acceptance — an agent session, no deploy',
          },
        },
      }),
      'createProject',
    )
    checks.ok(
      `${slug} created on driver ${state.driver === 'local' ? 1 : 2} (${state.driver})`,
      project.repository?.provider === state.driver,
      JSON.stringify(project.repository),
    )
  } else {
    console.log(`  ${slug} is here from a run before — the RE-USE path`)
  }
  const id = project.id
  const want = manifestFor(slug, classification)
  const file = await client.GET('/v1/projects/{projectId}/file', {
    params: { path: { projectId: id }, query: { path: 'manifest.yaml' } },
  })
  if (file.data?.content !== want) {
    const base = unwrap(
      await client.GET('/v1/projects/{projectId}/tree', {
        params: { path: { projectId: id } },
      }),
      'getTree',
    ).commitSha
    const outcome = unwrap(
      await client.POST('/v1/projects/{projectId}/commits', {
        params: {
          path: { projectId: id },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
        body: {
          baseCommit: base,
          message: `The gateway acceptance's manifest — ${classification}`,
          changes: [{ op: 'write', path: 'manifest.yaml', content: want }],
        },
      }),
      'createCommit',
    )
    checks.ok(
      `${slug}'s manifest.yaml committed at ${classification} — valid and recorded`,
      outcome.spec.appSpecId !== null,
      JSON.stringify(outcome.spec).slice(0, 300),
    )
  } else {
    console.log(`  ${slug}'s manifest.yaml is already ${classification}`)
  }
  return { id, made }
}

async function preparePhase(): Promise<void> {
  checks.step(
    '2. The instructor’s two projects — internal and confidential — found, or made',
  )
  const client = owner()
  const me = unwrap(await client.GET('/v1/me'), 'getMe')
  checks.ok('signed in as the instructor', me.puid === 'ins000001', me.puid)
  state.driver = env('MANIFEST_DRIVER')
  state.runId = env('MANIFEST_RUN_ID')
  state.internalSlug = env('MANIFEST_INTERNAL_SLUG')
  state.confidentialSlug = env('MANIFEST_CONFIDENTIAL_SLUG')
  const internal = await ensureProject(client, state.internalSlug, 'internal')
  const confidential = await ensureProject(client, state.confidentialSlug, 'confidential')
  state.internalProjectId = internal.id
  state.confidentialProjectId = confidential.id
  state.existing = internal.made || confidential.made ? 'made' : 'here'
  save()
}

/** The session's own spend, polled until it reaches `atLeast` (LiteLLM writes it a few seconds late). */
async function sessionSpend(
  client: ManifestClient,
  projectId: string,
  sessionId: string,
  atLeast: number,
): Promise<number | null> {
  const deadline = Date.now() + SPEND_WITHIN_MS
  for (;;) {
    const listed = unwrap(
      await client.GET('/v1/projects/{projectId}/agent-sessions', {
        params: { path: { projectId } },
      }),
      'listAgentSessions',
    )
    const spent = listed.sessions.find((s) => s.id === sessionId)?.spentUsd ?? null
    if ((spent !== null && spent >= atLeast - EXACT) || Date.now() > deadline)
      return spent
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
}

async function startSession(
  client: ManifestClient,
  projectId: string,
  name: string,
): Promise<Schemas['AgentSessionStarted']> {
  return unwrap(
    await client.POST('/v1/projects/{projectId}/agent-sessions', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: { name, capUsd: 1, durationMinutes: 30 },
    }),
    'startAgentSession',
  )
}

async function endSession(client: ManifestClient, sessionId: string): Promise<void> {
  const ended = await client.DELETE('/v1/agent-sessions/{sessionId}', {
    params: { path: { sessionId }, header: { 'Idempotency-Key': idempotencyKey() } },
  })
  if (ended.response.status !== 200)
    console.error(
      `[demo-gateway] endAgentSession ${sessionId} answered ${ended.response.status}`,
    )
}

interface Usage {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number } | null
}

interface Answer {
  status: number
  headers: Headers
  model: string
  content: string
  usage: Usage | undefined
  errorType: string
  body: string
}

/** One completion through the agent's key. `stream: true` reads the SSE frames to `[DONE]`. */
async function call(
  baseUrl: string,
  key: string,
  asked: string,
  extra: Record<string, unknown> = {},
): Promise<Answer & { done: boolean; contentFrames: number }> {
  const stream = extra.stream === true
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: asked,
      messages: [{ role: 'user', content: 'Reply with the one word: ready' }],
      max_tokens: 64,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...extra,
    }),
    signal: AbortSignal.timeout(180_000),
  })
  const text = await response.text()
  if (!stream || response.status !== 200) {
    let parsed: {
      model?: string
      choices?: { message?: { content?: string } }[]
      usage?: Usage
      error?: { type?: string }
    } = {}
    try {
      parsed = JSON.parse(text) as typeof parsed
    } catch {
      // A non-JSON body is reported as it is.
    }
    return {
      status: response.status,
      headers: response.headers,
      model: parsed.model ?? '',
      content: parsed.choices?.[0]?.message?.content ?? '',
      usage: parsed.usage,
      errorType: parsed.error?.type ?? '',
      body: text,
      done: false,
      contentFrames: 0,
    }
  }
  let model = ''
  let content = ''
  let usage: Usage | undefined
  let done = false
  let contentFrames = 0
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const data = line.slice('data: '.length).trim()
    if (data === '[DONE]') {
      done = true
      continue
    }
    try {
      const frame = JSON.parse(data) as {
        model?: string
        choices?: { delta?: { content?: string | null } }[]
        usage?: Usage | null
      }
      if (frame.model) model = frame.model
      const piece = frame.choices?.[0]?.delta?.content
      if (typeof piece === 'string' && piece.length > 0) {
        content += piece
        contentFrames += 1
      }
      if (frame.usage) usage = frame.usage
    } catch {
      // A frame that is not JSON is not content.
    }
  }
  return {
    status: response.status,
    headers: response.headers,
    model,
    content,
    usage,
    errorType: '',
    body: '',
    done,
    contentFrames,
  }
}

/** `usage × price`, cached input tokens at the cache-read price when the catalogue lists one. */
function costOf(usage: Usage | undefined, price: Price): number | undefined {
  if (usage?.prompt_tokens === undefined || usage.completion_tokens === undefined)
    return undefined
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0
  const cacheRead = price.cacheRead ?? price.input
  return (
    (usage.prompt_tokens - cached) * price.input +
    cached * cacheRead +
    usage.completion_tokens * price.output
  )
}

/** The three checks that tell the gateway's answer from the fallback's (the plan's I6, F20). */
function answeredByGateway(label: string, answer: Answer): void {
  const gatewayUrl = checks.must('the gateway’s address, from phase 1', state.gatewayUrl)
  const fallbacks = answer.headers.get('x-litellm-attempted-fallbacks')
  checks.ok(
    `${label}: x-litellm-attempted-fallbacks is 0 — the primary answered, not the fallback`,
    fallbacks === '0',
    String(fallbacks),
  )
  const apiBase = answer.headers.get('x-litellm-model-api-base')
  checks.ok(
    `${label}: x-litellm-model-api-base is the gateway’s address`,
    apiBase !== null && apiBase.replace(/\/+$/, '') === gatewayUrl.replace(/\/+$/, ''),
    String(apiBase),
  )
  checks.ok(
    `${label}: the body’s model is not the on-premise one (${answer.model || '(none named)'})`,
    answer.model !== '' && !ON_PREMISE.test(answer.model),
    answer.model,
  )
}

/** Phase 2: an internal project's agent session — the capable model, through the gateway, charged exactly. */
async function internalPhase(): Promise<void> {
  checks.step(
    '2. An internal project’s agent session: the capable model, answered by UBC’s AI Gateway',
  )
  const client = owner()
  const projectId = checks.must(
    'the internal project, from prepare',
    state.internalProjectId,
  )
  const capable = priceOf(CAPABLE)
  const started = await startSession(
    client,
    projectId,
    `gateway acceptance ${state.runId} — internal`,
  )
  state.internalSessionId = started.session.id
  save()
  try {
    const models = started.session.models
    const wanted = (state.gatewayModels ?? []).map((m) => m.name)
    checks.ok(
      `the session holds ${CAPABLE} and the gateway’s own models at internal or above (${wanted.join(', ') || 'none set'})`,
      models.includes(CAPABLE) && wanted.every((m) => models.includes(m)),
      models.join(', '),
    )

    const plain = await call(started.baseUrl, started.key, CAPABLE)
    checks.ok(
      `${CAPABLE}, not streamed: 200 with content`,
      plain.status === 200 && plain.content.trim().length > 0,
      `${plain.status} ${JSON.stringify(plain.content).slice(0, 80)} ${plain.body.slice(0, 200)}`,
    )
    answeredByGateway(`${CAPABLE}, not streamed`, plain)
    const plainExpected = costOf(plain.usage, capable)
    const plainReported = Number(
      plain.headers.get('x-litellm-response-cost') ?? Number.NaN,
    )
    checks.ok(
      `its cost is the answer’s own x-litellm-response-cost ($${plainReported}) = usage × ${CAPABLE}’s listed price ($${plainExpected})`,
      plainExpected !== undefined &&
        plainExpected > 0 &&
        Math.abs(plainReported - plainExpected) < EXACT,
      JSON.stringify(plain.usage),
    )

    const streamed = await call(started.baseUrl, started.key, CAPABLE, { stream: true })
    checks.ok(
      `${CAPABLE}, streamed: 200, ${streamed.contentFrames} content frames, ending [DONE]`,
      streamed.status === 200 && streamed.done && streamed.contentFrames > 0,
      `${streamed.status} done=${streamed.done} ${streamed.body.slice(0, 200)}`,
    )
    answeredByGateway(`${CAPABLE}, streamed`, streamed)
    const streamExpected = costOf(streamed.usage, capable)
    checks.ok(
      `the stream’s last frames carry its usage (${JSON.stringify(streamed.usage)}) — its cost $${streamExpected}`,
      streamExpected !== undefined && streamExpected > 0,
    )

    // The plan's control (c), run every time: a request the PROVIDER refuses as malformed is the caller's to
    // correct — the gateway's 400 reaches it, and the fallback is never asked (Spec action 6; sitting 1's (a)).
    const malformed = await call(started.baseUrl, started.key, CAPABLE, {
      max_tokens: -1,
    })
    checks.ok(
      `a malformed request (max_tokens: -1): the provider’s 400 reaches the caller (${malformed.errorType || 'no type'})`,
      malformed.status === 400,
      `${malformed.status} ${malformed.body.slice(0, 200)}`,
    )
    checks.ok(
      'and the fallback was never asked (no x-litellm-attempted-fallbacks: 1)',
      malformed.headers.get('x-litellm-attempted-fallbacks') !== '1',
      String(malformed.headers.get('x-litellm-attempted-fallbacks')),
    )

    const expected = (plainExpected ?? 0) + (streamExpected ?? 0)
    const spent = await sessionSpend(client, projectId, started.session.id, expected)
    checks.ok(
      `the session’s spend is EXACTLY the two answers’ cost: $${spent} = $${expected} (12 places)`,
      spent !== null && expected > 0 && Math.abs(spent - expected) < EXACT,
      `within ${SPEND_WITHIN_MS / 1000} s`,
    )
    const month = unwrap(await client.GET('/v1/agent-budget'), 'getAgentBudget')
    checks.ok(
      `and getAgentBudget counts it — the person’s month $${month.spentUsd} ≥ $${spent}`,
      spent !== null && month.spentUsd !== null && month.spentUsd >= spent - EXACT,
      JSON.stringify(month),
    )
    if (spent !== null) state.chargedGatewayUsd = spent
  } finally {
    await endSession(client, started.session.id)
  }
  save()
  done(2)
}

/** Phase 4: a confidential project's session — the gateway's own confidential model, charged at the stand-in's price. */
async function confidentialPhase(): Promise<void> {
  checks.step(
    '4. A confidential project’s agent session: the gateway’s own models, and the capable model to build with',
  )
  const client = owner()
  const projectId = checks.must(
    'the confidential project, from prepare',
    state.confidentialProjectId,
  )
  const confidential = (state.gatewayModels ?? []).filter(
    (m) => m.classification === 'confidential',
  )
  const target = checks.must(
    'a confidential gateway model in the catalogue (MANIFEST_GATEWAY_MODELS)',
    confidential[0],
    JSON.stringify(state.gatewayModels),
  )
  const price = priceOf(target.name)
  const standIn = priceOf('default-chat-onprem')
  checks.ok(
    `${target.name} is pinned at the on-premise stand-in’s price ($${price.input} / $${price.output} a token)`,
    price.input === standIn.input && price.output === standIn.output,
    JSON.stringify({ price, standIn }),
  )
  const started = await startSession(
    client,
    projectId,
    `gateway acceptance ${state.runId} — confidential`,
  )
  state.confidentialSessionId = started.session.id
  save()
  try {
    const models = started.session.models
    checks.ok(
      `the session holds ${confidential.map((m) => m.name).join(', ')} and ${CAPABLE} (the builder setting, capable), and NOT default-chat`,
      confidential.every((m) => models.includes(m.name)) &&
        models.includes(CAPABLE) &&
        !models.includes('default-chat'),
      models.join(', '),
    )
    const answer = await call(started.baseUrl, started.key, target.name)
    checks.ok(
      `${target.name}: 200`,
      answer.status === 200,
      `${answer.status} ${answer.body.slice(0, 200)}`,
    )
    answeredByGateway(target.name, answer)
    const plainExpected = costOf(answer.usage, price)
    checks.ok(
      `its usage is reported (${JSON.stringify(answer.usage)}) — at the stand-in’s price, $${plainExpected}`,
      plainExpected !== undefined && plainExpected > 0,
    )
    // STREAMED too (the whole-branch review's I1): the gateway prices this model at nothing, so a stream must be
    // charged the pin — never `$0` — and the front-end's agents stream.
    const streamed = await call(started.baseUrl, started.key, target.name, {
      stream: true,
    })
    checks.ok(
      `${target.name}, streamed: 200, ending [DONE]`,
      streamed.status === 200 && streamed.done,
      `${streamed.status} done=${streamed.done} ${streamed.body.slice(0, 200)}`,
    )
    answeredByGateway(`${target.name}, streamed`, streamed)
    const streamExpected = costOf(streamed.usage, price)
    checks.ok(
      `the stream’s usage is reported (${JSON.stringify(streamed.usage)}) — at the stand-in’s price, $${streamExpected}, never $0`,
      streamExpected !== undefined && streamExpected > 0,
    )
    const expected = (plainExpected ?? 0) + (streamExpected ?? 0)
    const spent = await sessionSpend(client, projectId, started.session.id, expected)
    checks.ok(
      `the session’s spend is EXACTLY both answers’ usage × the stand-in’s price: $${spent} = $${expected} (12 places)`,
      spent !== null &&
        plainExpected !== undefined &&
        streamExpected !== undefined &&
        Math.abs(spent - expected) < EXACT,
      `within ${SPEND_WITHIN_MS / 1000} s`,
    )
    if (spent !== null) state.chargedPinnedUsd = spent
  } finally {
    await endSession(client, started.session.id)
  }
  save()
  done(4)
}

/** Phase 6: both sessions this run started are ended. */
async function endedPhase(): Promise<void> {
  checks.step('6. Both sessions ended')
  const client = owner()
  const pairs: [string | undefined, string | undefined, string][] = [
    [state.internalProjectId, state.internalSessionId, 'internal'],
    [state.confidentialProjectId, state.confidentialSessionId, 'confidential'],
  ]
  for (const [projectId, sessionId, label] of pairs) {
    const pid = checks.must(`the ${label} project`, projectId)
    const sid = checks.must(`the ${label} session`, sessionId)
    const listed = unwrap(
      await client.GET('/v1/projects/{projectId}/agent-sessions', {
        params: { path: { projectId: pid } },
      }),
      'listAgentSessions',
    )
    const session = listed.sessions.find((s) => s.id === sid)
    checks.ok(
      `the ${label} session is ended (endAgentSession)`,
      session?.state === 'ended' && session.endReason === 'ended',
      JSON.stringify(session).slice(0, 300),
    )
  }
  save()
  done(6)
}

const run: Record<Phase, () => Promise<void>> = {
  prepare: preparePhase,
  internal: internalPhase,
  confidential: confidentialPhase,
  ended: endedPhase,
}

try {
  await run[phase]()
} catch (error) {
  if (!(error instanceof JourneyStop)) {
    console.error(error)
    checks.ok('the phase ran to its end', false, String(error))
  }
}
save()
checks.finish()
