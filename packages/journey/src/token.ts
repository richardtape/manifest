import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  subscribe,
  unwrap,
  type ErrorEnvelope,
  type ManifestClient,
  type StreamFrame,
} from '@manifest/contract'
import { Checks, JourneyStop } from './check.js'
import { waitFor } from './wait.js'

/**
 * D24's LOOP, END TO END — P5b's acceptance (Task 12).
 *
 *   node packages/journey/dist/token.js
 *
 * Reads MANIFEST_ORIGIN (default the console's) and MANIFEST_SESSION — the instructor's
 * session, which `scripts/demo-token.sh` obtained through the one CWL flow.
 *
 * WHY THIS IS A SIBLING OF `main.ts` AND NOT A PHASE OF IT. §22's journey is one person
 * doing one thing with one credential, and every function in `main.ts` closes over the
 * single `client` that credential builds. This is the other shape: TWO credentials in one
 * story — an agent that acts and a person who answers it — and the whole point is which
 * of them each call is made with. Threading a second client through `main.ts` would have
 * made every existing step take an argument it does not use. `packages/journey`'s import
 * boundary (`boundary.test.ts`) reads every non-test file in `src/`, so this one inherits
 * it: the contract, `node:` builtins, and its own siblings. Nothing else.
 *
 * WHAT THIS IS FOR, beyond the checks. Until this file existed, every route P5b built had
 * exactly one client: a test calling `app.inject`, which never asks whether the edge, the
 * credential and the generated client agree — the gap P5a sitting 10 finding 8 named, and
 * the one this project's two worst discoveries both came through (ORIENTATION §9).
 */
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
const session = process.env.MANIFEST_SESSION
if (session === undefined) {
  console.error('usage: MANIFEST_SESSION=… node dist/token.js')
  process.exit(2)
}

/** The project the agent works on. `scripts/demo-token.sh` clears its orphaned repository. */
const SLUG = 'token-app'

/**
 * What the agent is allowed to do: the build loop, and nothing else. **None of D24's
 * privileged four**, because the mint route refuses them by name — which is the point of
 * step 2's negative half, and the reason step 6's refusal is D24's central rule rather
 * than an ordinary "you do not hold this capability".
 */
const AGENT_CAPABILITIES = [
  'project:read',
  'build:create',
  'release:create',
  'release:deploy',
] as const

/** The person who signed in. Every mutation of theirs carries the console's Origin (§20). */
const human = createManifestClient({ origin, session })
const checks = new Checks()

/** Past the builder's own 900 s timeout, so a stalled build fails this step (P5a). */
const BUILD_ENDS_WITHIN_MS = 960_000
/** R6: `POST …/builds` answers once the build is RECORDED, not once it is built. */
const BUILD_ANSWERS_WITHIN_MS = 5_000

/**
 * The refusal's envelope, or `undefined` if the call was not refused the way it should be.
 *
 * ASSERT THE CODE, NEVER THE STATUS. `403 FORBIDDEN`, `403 TOKEN_ACTION_PENDING` and `403
 * TOKEN_CREDENTIAL_REFUSED` are one status and three different answers — one of them a
 * loop that closes, one a dead end and one a rule that was never applied. A status-only
 * check passes through all three (P5b sitting 4's F1, sitting 7's F5).
 */
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

/** How a refusal reads in a `checks.ok` detail when it was not the one expected. */
function describe(result: { error?: unknown; response: Response }): string {
  const envelope = result.error as ErrorEnvelope | undefined
  return `${result.response.status} ${envelope?.error?.code ?? '(no envelope)'}`
}

interface Agent {
  client: ManifestClient
  secret: string
  id: string
}

const state: {
  projectId?: string
  stagingEnvironmentId?: string
  productionEnvironmentId?: string
  appUrl?: string
  agent?: Agent
  buildId?: string
  /** The Idempotency-Key of step 6's ask, REUSED by step 8's retry — D23.6's own hint. */
  memberKey?: string
  memberBody?: { puid: string; role: 'collaborator' }
  pendingActionId?: string
  askedAt?: number
} = {}

/**
 * Step 1 — the person. The sign-in happened in bash through the one CWL flow
 * (`infra/lib/idp-login.sh`); this proves the session is the instructor's, and sets up the
 * project the agent will work on.
 *
 * CREATING THE PROJECT IS THE PERSON'S JOB, not the agent's, and not incidentally:
 * `POST /v1/projects` is interactive-only (D24's scope rule — a token is scoped to a
 * project, so it cannot be the thing that brings one into being). So it belongs here even
 * though the plan's step list starts the agent at step 2.
 */
async function step1SignedIn(): Promise<void> {
  checks.step('1. Signed in as the instructor, who owns the project (§20, D24)')
  const me = unwrap(await human.GET('/v1/me'), 'getMe')
  checks.ok('GET /v1/me is the instructor', me.puid === 'ins000001', JSON.stringify(me))

  const mine = unwrap(await human.GET('/v1/projects'), 'listProjects')
  const existing = mine.find((p) => p.slug === SLUG)
  if (existing === undefined) {
    const created = unwrap(
      await human.POST('/v1/projects', {
        params: { header: { 'Idempotency-Key': idempotencyKey() } },
        body: {
          slug: SLUG,
          blueprint: 'node-ts-mongo@1',
          starter: 'proof-app',
          audience: {
            scale: 'class',
            burst: 'synchronised',
            justification: 'P5b’s acceptance: an agent runs the build loop on a token',
          },
        },
      }),
      'createProject',
    )
    state.projectId = created.id
    checks.ok(
      `created ${SLUG} from the proof-app starter`,
      created.starter === 'proof-app' && created.spec.valid,
      JSON.stringify(created.spec.errors),
    )
  } else {
    state.projectId = existing.id
    console.log(`  (${SLUG} exists from an earlier run — reused)`)
  }
  const project = unwrap(
    await human.GET('/v1/projects/{projectId}', {
      params: {
        path: { projectId: state.projectId },
        query: { expand: 'environments' },
      },
    }),
    'getProject',
  )
  const staging = checks.must(
    'it has a staging environment',
    project.environments?.find((e) => e.kind === 'staging'),
  )
  const production = checks.must(
    'and a production one',
    project.environments?.find((e) => e.kind === 'production'),
  )
  state.stagingEnvironmentId = staging.id
  state.productionEnvironmentId = production.id
  state.appUrl = staging.url
}

/**
 * Step 2 — the person mints a delegated token for the agent (D24, P5b Task 4).
 *
 * The negative half is the one that matters: a mint carrying one of D24's privileged four
 * is refused BY NAME, so the token step 6 is refused with could not simply have been minted
 * with that capability instead. Without this check, "the platform refused the agent
 * members:manage" and "nobody ever gave the agent members:manage" are the same observation.
 */
async function step2Mint(): Promise<void> {
  checks.step('2. The instructor mints a delegated token for the agent (D24)')
  const projectId = checks.must('a project to mint for', state.projectId)

  const forbidden = await human.POST('/v1/projects/{projectId}/tokens', {
    params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: {
      name: 'an agent that could manage members',
      capabilities: ['members:manage'],
      expiresInDays: 1,
    },
  })
  checks.ok(
    'a token holding one of D24’s privileged four cannot be minted at all',
    refusal(forbidden, 400, 'TOKEN_CAPABILITY_FORBIDDEN') !== undefined,
    describe(forbidden),
  )

  const minted = unwrap(
    await human.POST('/v1/projects/{projectId}/tokens', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        name: `p5b acceptance ${new Date().toISOString()}`,
        capabilities: [...AGENT_CAPABILITIES],
        expiresInDays: 1,
      },
    }),
    'mintToken',
  )
  // THE SHAPE OF THE ANSWER, not that an answer arrived (ORIENTATION §9) — and the shape
  // is `mft_<the row id WITH ITS DASHES STRIPPED>_<43 base64url characters>`. The id is
  // embedded so that verification is one indexed lookup rather than a scan of every live
  // token, and asserting that relationship is what proves it: a secret that merely LOOKS
  // like a credential would pass a pattern match. Written against the dashed uuid first,
  // this check failed on the demo's own first run — the credential was right and the
  // reader's model of it was wrong, which is the only way that gets found.
  const embeddedId = minted.secret.slice(4, 36)
  checks.ok(
    'the secret is returned in full, exactly once, and carries the token’s own id',
    /^mft_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/.test(minted.secret) &&
      embeddedId === minted.token.id.replaceAll('-', ''),
    `${minted.secret.slice(0, 12)}… (${minted.secret.length} characters), id ${minted.token.id}`,
  )
  checks.ok(
    'and the token itself carries no secret field at all',
    !('secret' in minted.token) && !JSON.stringify(minted.token).includes(minted.secret),
    Object.keys(minted.token).join(','),
  )
  checks.ok(
    'scoped to this one project, with exactly the capabilities asked for, and not expired',
    minted.token.projectId === projectId &&
      minted.token.capabilities.slice().sort().join(',') ===
        [...AGENT_CAPABILITIES].sort().join(',') &&
      minted.token.expired === false,
    JSON.stringify(minted.token.capabilities),
  )

  const listed = unwrap(
    await human.GET('/v1/projects/{projectId}/tokens', {
      params: { path: { projectId } },
    }),
    'listTokens',
  )
  const ours = listed.find((t) => t.id === minted.token.id)
  checks.ok(
    'the project’s tokens list it, and the list carries no secret',
    ours !== undefined && !JSON.stringify(listed).includes(minted.secret),
    `${listed.length} token(s)`,
  )
  // A green `checks.ok` prints no detail (check.ts), so the numbers this run is filed as
  // evidence for would otherwise be computed and thrown away (P5a sitting 12, finding 1).
  console.log(
    `  (token minted: ${minted.token.capabilities.length} capabilities, expires ${minted.token.expiresAt}, ${minted.token.rateLimit} requests a minute)`,
  )
  state.agent = {
    client: createManifestClient({ origin, token: minted.secret }),
    secret: minted.secret,
    id: minted.token.id,
  }
}

/**
 * Step 3 — what the agent's authority IS, and what it is not.
 *
 * The negative half is the one an agent-shaped demo would leave out, and sitting 6's F5 is
 * why it cannot be: a claim that something is NOT refused is true of a platform that
 * refuses nothing. So each read here is paired with a refusal, asserted by CODE.
 *
 * **THIS STEP DOES NOT `unwrap`, AND THAT IS DELIBERATE.** It is the first step the agent's
 * credential is used in, so it is where a credential that does not work shows — and
 * `unwrap` THROWS, which ends the whole run at the first line. Measured in this task's own
 * control (f): with the bearer withheld from the client, the run reported ONE red check,
 * `no call refused (getProject)`, and said nothing about the three claims underneath it.
 * Reporting instead of throwing makes a dead credential four measurements rather than one,
 * which is what `check.ts`'s *a red run is a measurement, not the first thing that broke*
 * asks for (P4c Decision 26). The steps after this one still `unwrap`, because a build
 * cannot be released and a release cannot be deployed — there, stopping is the honest answer.
 */
async function step3Scope(): Promise<void> {
  checks.step('3. The agent reads its own project — and cannot read the fleet')
  const agent = checks.must('a token to act with', state.agent)
  const projectId = checks.must('a project', state.projectId)

  const read = await agent.client.GET('/v1/projects/{projectId}', {
    params: { path: { projectId } },
  })
  checks.ok(
    'it reads the project it is scoped to',
    read.data?.slug === SLUG,
    read.data === undefined ? describe(read) : read.data.slug,
  )

  // Sitting 1's F2: `listProjectsFor` selected by the ACTOR's user id and no capability
  // check ran on this route at all, so a token scoped to one project listed every project
  // its minter owned. The route scopes it now; this is the running system saying so.
  const visible = await agent.client.GET('/v1/projects')
  checks.ok(
    'and GET /v1/projects answers it exactly its one project, never its minter’s others',
    visible.data?.length === 1 && visible.data[0]?.id === projectId,
    visible.data === undefined
      ? describe(visible)
      : JSON.stringify(visible.data.map((p) => p.slug)),
  )

  const fleet = await agent.client.GET('/v1/fleet')
  checks.ok(
    'the fleet is refused — 403 TOKEN_CREDENTIAL_REFUSED, not 403 FORBIDDEN',
    refusal(fleet, 403, 'TOKEN_CREDENTIAL_REFUSED') !== undefined,
    describe(fleet),
  )

  // The other half of D24's scope rule: a token cannot bring a project into being, so
  // `POST /v1/projects` is interactive-only too.
  const another = await agent.client.POST('/v1/projects', {
    params: { header: { 'Idempotency-Key': idempotencyKey() } },
    body: {
      slug: 'token-app-second',
      blueprint: 'node-ts-mongo@1',
      audience: { scale: 'class', burst: 'synchronised', justification: 'never created' },
    },
  })
  checks.ok(
    'and it cannot create a project of its own',
    refusal(another, 403, 'TOKEN_CREDENTIAL_REFUSED') !== undefined,
    describe(another),
  )
}

/**
 * Step 4 — the build loop's first half, on the agent's own authority, watched on the
 * agent's own stream.
 *
 * The stream is the part that had no client at all before this file: `SubscribeOptions`
 * gained `token` for it (P5b Task 12). It is `project:read` like every other read, so an
 * agent that may read the project may watch it — and the upgrade carries the bearer and no
 * Origin, because §20's CSRF control keys on the session cookie.
 */
async function step4Build(): Promise<void> {
  checks.step('4. The agent builds — 202 at once, and it ends on the agent’s own stream')
  const agent = checks.must('a token to act with', state.agent)
  const projectId = checks.must('a project', state.projectId)

  const frames: StreamFrame[] = []
  const stream = subscribe({
    origin,
    token: agent.secret,
    projectId,
    onFrame: (frame) => frames.push(frame),
  })
  try {
    await stream.ready
    checks.ok('the agent’s bearer opened the project’s event stream', true)
  } catch (error) {
    checks.ok(
      'the agent’s bearer opened the project’s event stream',
      false,
      (error as Error).message,
    )
    return
  }
  try {
    const startedAt = Date.now()
    const started = unwrap(
      await agent.client.POST('/v1/projects/{projectId}/builds', {
        params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
        body: {},
      }),
      'startBuild',
    )
    const answeredMs = Date.now() - startedAt
    checks.ok(
      'the build answered at once, still running (R6)',
      (started.status === 'running' || started.status === 'pending') &&
        answeredMs < BUILD_ANSWERS_WITHIN_MS,
      `${started.status} after ${answeredMs} ms`,
    )
    const ended = checks.must(
      'and it ended on the stream the token is holding',
      await waitFor(
        frames,
        (f) =>
          f.kind === 'event' &&
          (f.type === 'build.succeeded' || f.type === 'build.failed') &&
          f.machineDetail.buildId === started.id,
        BUILD_ENDS_WITHIN_MS,
      ),
      `no build.succeeded or build.failed for ${started.id} within ${BUILD_ENDS_WITHIN_MS} ms`,
    )
    const endedMs = Date.now() - startedAt
    checks.ok(
      'it succeeded',
      ended.kind === 'event' && ended.type === 'build.succeeded',
      ended.kind === 'event' ? ended.type : ended.kind,
    )
    const build = unwrap(
      await agent.client.GET('/v1/builds/{buildId}', {
        params: { path: { buildId: started.id } },
      }),
      'getBuild',
    )
    checks.ok(
      'with a digest and §12’s scan, read back on the token’s own authority',
      /^sha256:[0-9a-f]{64}$/.test(build.imageDigest ?? '') && build.scan !== null,
      `${build.status}: ${build.error ?? ''}`,
    )
    console.log(`  (build ended ${endedMs} ms after the token asked for it)`)
    state.buildId = started.id
  } finally {
    stream.close()
  }
}

/**
 * Step 5 — the build loop's second half. The agent releases and deploys to STAGING on its
 * own authority, and the app answers through the edge.
 *
 * And the negative half, which is the clearest single picture of D24 there is: the SAME
 * agent asking to deploy the SAME release to PRODUCTION is refused, because promoting is
 * `release:promote` and that is one of the privileged four (P5b Task 2). A token can hold
 * `release:deploy` and can never hold `release:promote`.
 */
async function step5Deploy(): Promise<void> {
  checks.step('5. The agent deploys to staging — and may not promote to production')
  const agent = checks.must('a token to act with', state.agent)
  const projectId = checks.must('a project', state.projectId)
  const buildId = checks.must('a build to release', state.buildId)

  const release = unwrap(
    await agent.client.POST('/v1/projects/{projectId}/releases', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: { buildId, summary: 'P5b acceptance: released by an agent' },
    }),
    'createRelease',
  )
  const instance = unwrap(
    await agent.client.POST('/v1/environments/{environmentId}/deploy', {
      params: {
        path: { environmentId: checks.must('staging', state.stagingEnvironmentId) },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { releaseId: release.id },
    }),
    'deploy',
  )
  checks.ok('the instance is healthy', instance.state === 'healthy', instance.state)

  // THE BODY, NEVER ONLY THE STATUS. The edge's wildcard answers `200 manifest OK host=…`
  // for any name and any path, so a status-only reachability check passes against a
  // hostname nothing has ever deployed (ORIENTATION §4, P4b finding 193).
  const appUrl = checks.must('the staging URL', state.appUrl)
  const health = await fetch(`${appUrl.replace(/\/$/, '')}/healthz`)
  const body = await health.text()
  checks.ok(
    'and the APP answers through the edge — its own body, not the edge’s wildcard page',
    health.ok && body.includes('"mongo":true'),
    `${health.status} ${body.slice(0, 120)}`,
  )

  const promote = await agent.client.POST('/v1/environments/{environmentId}/deploy', {
    params: {
      path: { environmentId: checks.must('production', state.productionEnvironmentId) },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
    body: { releaseId: release.id },
  })
  checks.ok(
    'promoting the same release to production is D24’s refusal, not the launch gate',
    refusal(promote, 403, 'TOKEN_ACTION_PENDING') !== undefined,
    describe(promote),
  )
  console.log(`  (deployed release ${release.id} to staging at ${appUrl})`)
}

/**
 * Step 6 — the agent asks for one of D24's privileged four, and is refused with the
 * question a person must answer (P5b Task 6).
 *
 * THE IDEMPOTENCY-KEY IS KEPT. The confirmed retry reuses it, exactly as D23.7's own hint
 * instructs, and that works only because sitting 4 put the refusal's catch OUTSIDE
 * `app.idempotent` — caught inside, the 403 caches under `(key, userId, route)` and the
 * retry replays a cached refusal for ever. A demo that minted a fresh key per retry would
 * pass while that placement was wrong (sitting 1's `[M5]`).
 */
async function step6Refused(): Promise<void> {
  checks.step('6. The agent asks to add a member — 403 TOKEN_ACTION_PENDING')
  const agent = checks.must('a token to act with', state.agent)
  const projectId = checks.must('a project', state.projectId)

  state.memberKey = idempotencyKey()
  state.memberBody = { puid: 'stu000001', role: 'collaborator' }
  state.askedAt = Date.now()
  const asked = await agent.client.POST('/v1/projects/{projectId}/members', {
    params: { path: { projectId }, header: { 'Idempotency-Key': state.memberKey } },
    body: state.memberBody,
  })
  const error = refusal(asked, 403, 'TOKEN_ACTION_PENDING')
  checks.ok(
    'refused — and the code is TOKEN_ACTION_PENDING, so D24’s loop has started',
    error !== undefined,
    describe(asked),
  )
  const question = checks.must(
    'and the refusal carries the question a person must answer (D23.7)',
    error?.pendingAction,
    JSON.stringify(error),
  )
  state.pendingActionId = question.id
  checks.ok(
    'which names what was asked for, of this project, by this token',
    question.state === 'pending' &&
      question.action === 'members:manage' &&
      question.method === 'POST' &&
      question.path === `/v1/projects/${projectId}/members` &&
      question.tokenId === agent.id,
    JSON.stringify(question),
  )
  // A person reads this row on a screen (§26). The body is hashed, never stored — so the
  // PUID the agent asked about is not in it.
  checks.ok(
    'and carries a hash of the request, never the request itself',
    /^[0-9a-f]{64}$/.test(question.bodySha256) &&
      !JSON.stringify(question).includes('stu000001'),
    question.bodySha256.slice(0, 16),
  )
}

/**
 * Step 7 — a person answers it (P5b Task 7). The queue is §26's primary screen, read here
 * as the API call a console would make.
 *
 * The negative half is placed HERE deliberately. Task 12's own control table asks that
 * breaking `requireSession` on confirm turns step 7 red and *not* step 6 — and it can only
 * do that if step 7 is the step that asserts a token cannot confirm its own action. A loop
 * with no human in it is not D24's loop.
 */
async function step7Confirmed(): Promise<void> {
  checks.step('7. The instructor sees it in the queue, and confirms it')
  const agent = checks.must('a token to act with', state.agent)
  const projectId = checks.must('a project', state.projectId)
  const pendingActionId = checks.must('a question to answer', state.pendingActionId)

  const queue = unwrap(
    await human.GET('/v1/projects/{projectId}/pending-actions', {
      params: { path: { projectId } },
    }),
    'listPendingActions',
  )
  checks.ok(
    'the queue holds both questions this agent has asked, newest first',
    queue.length >= 2 && queue[0]!.id === pendingActionId,
    JSON.stringify(queue.map((q) => `${q.action} ${q.state}`)),
  )
  checks.ok(
    'and the platform says how long each has waited (§26’s headline number)',
    queue.every((q) => q.waitingSeconds >= 0),
    JSON.stringify(queue.map((q) => q.waitingSeconds)),
  )

  const byTheAgent = await agent.client.POST(
    '/v1/pending-actions/{pendingActionId}/confirm',
    {
      params: {
        path: { pendingActionId },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {},
    },
  )
  checks.ok(
    'the AGENT cannot confirm its own question — 403 TOKEN_CREDENTIAL_REFUSED',
    refusal(byTheAgent, 403, 'TOKEN_CREDENTIAL_REFUSED') !== undefined,
    describe(byTheAgent),
  )

  const confirmed = unwrap(
    await human.POST('/v1/pending-actions/{pendingActionId}/confirm', {
      params: {
        path: { pendingActionId },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {},
    }),
    'confirmPendingAction',
  )
  const waitedMs = Date.now() - checks.must('when it was asked', state.askedAt)
  checks.ok(
    'the person who holds the capability confirms it',
    confirmed.state === 'confirmed' && confirmed.resolvedAt !== null,
    JSON.stringify({ state: confirmed.state, resolvedAt: confirmed.resolvedAt }),
  )
  checks.ok(
    'and confirming ran nothing — the grant is not a replay',
    confirmed.consumedAt === null,
    String(confirmed.consumedAt),
  )
  console.log(
    `  (pending action ${pendingActionId} waited ${waitedMs} ms for a human; the platform recorded ${confirmed.waitingSeconds} s)`,
  )
}

/**
 * Step 8 — the agent makes its own retry, and it works EXACTLY once (P5b Task 7).
 *
 * "EXACTLY ONCE" DESCRIBES THE ACTION, NOT THE ANSWER. The confirmed retry's `2xx` is
 * stored under its `Idempotency-Key` and replays for ever without reaching the handler —
 * so a second send of the SAME key answering `201` again is not a second escalation, and a
 * reader who assumes otherwise mis-reads `consumedAt`. It is a FRESH key that shows the
 * grant is spent, and this step asserts both, in that order.
 */
async function step8RetriedOnce(): Promise<void> {
  checks.step('8. The agent retries — it succeeds, once, and only once')
  const agent = checks.must('a token to act with', state.agent)
  const projectId = checks.must('a project', state.projectId)
  const key = checks.must('the key step 6 asked with', state.memberKey)
  const body = checks.must('the body step 6 asked with', state.memberBody)
  const pendingActionId = checks.must('the question', state.pendingActionId)

  const first = await agent.client.POST('/v1/projects/{projectId}/members', {
    params: { path: { projectId }, header: { 'Idempotency-Key': key } },
    body,
  })
  const member = unwrap(first, 'addMember')
  checks.ok(
    'the retry — same token, same body, same Idempotency-Key — is 201',
    first.response.status === 201 &&
      member.puid === 'stu000001' &&
      member.role === 'collaborator',
    `${first.response.status} ${JSON.stringify(member)}`,
  )

  const spent = unwrap(
    await human.GET('/v1/pending-actions/{pendingActionId}', {
      params: { path: { pendingActionId } },
    }),
    'getPendingAction',
  )
  checks.ok(
    'and the grant is now spent — consumedAt is stamped AFTER the handler resolved',
    spent.consumedAt !== null,
    JSON.stringify({ state: spent.state, consumedAt: spent.consumedAt }),
  )

  const before = unwrap(
    await human.GET('/v1/projects/{projectId}/pending-actions', {
      params: { path: { projectId } },
    }),
    'listPendingActions',
  )
  const replayed = await agent.client.POST('/v1/projects/{projectId}/members', {
    params: { path: { projectId }, header: { 'Idempotency-Key': key } },
    body,
  })
  const after = unwrap(
    await human.GET('/v1/projects/{projectId}/pending-actions', {
      params: { path: { projectId } },
    }),
    'listPendingActions',
  )
  checks.ok(
    'the SAME key replays that answer for ever, and asks nobody anything (D23.6)',
    replayed.response.status === 201 && after.length === before.length,
    `${replayed.response.status}, ${before.length} → ${after.length} questions`,
  )

  const againKey = idempotencyKey()
  const again = await agent.client.POST('/v1/projects/{projectId}/members', {
    params: { path: { projectId }, header: { 'Idempotency-Key': againKey } },
    body,
  })
  const error = refusal(again, 403, 'TOKEN_ACTION_PENDING')
  checks.ok(
    'but a FRESH key is a new question — the grant was for one request, and it is spent',
    error !== undefined && error.pendingAction?.id !== pendingActionId,
    `${describe(again)} ${error?.pendingAction?.id ?? ''}`,
  )
  console.log(
    `  (retry 1: ${first.response.status}; retry 2, same key: ${replayed.response.status} replayed; retry 3, new key: ${again.response.status} ${(again.error as ErrorEnvelope | undefined)?.error?.code ?? ''})`,
  )

  // D24'S OTHER ANSWER, which nothing outside a unit test had ever exercised. A rejection
  // is not a refusal the agent should retry past: it is a person's decision, carried back
  // in that person's own words, so an agent STOPS rather than loops (P5b Task 7). It also
  // leaves this run's last question answered rather than pending.
  const rejectable = checks.must('the new question', error?.pendingAction?.id)
  const reason = 'Not this term — ask me again after the course starts.'
  const rejected = unwrap(
    await human.POST('/v1/pending-actions/{pendingActionId}/reject', {
      params: {
        path: { pendingActionId: rejectable },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { reason },
    }),
    'rejectPendingAction',
  )
  checks.ok(
    'the instructor rejects the second ask, in their own words',
    rejected.state === 'rejected' && rejected.reason === reason,
    JSON.stringify({ state: rejected.state, reason: rejected.reason }),
  )
  const stopped = await agent.client.POST('/v1/projects/{projectId}/members', {
    params: { path: { projectId }, header: { 'Idempotency-Key': againKey } },
    body,
  })
  const told = refusal(stopped, 403, 'TOKEN_ACTION_REJECTED')
  checks.ok(
    'and the agent’s retry is TOKEN_ACTION_REJECTED — a different code from PENDING, so it stops',
    told !== undefined && told.message.includes(reason),
    `${describe(stopped)} ${told?.message ?? ''}`,
  )
}

/**
 * Step 9 — the end of the loop. Revoking is the minter's, and it is what stops a token:
 * a token outlives its minter's membership, so nothing else does (D24, P5b Task 4).
 */
async function step9Revoked(): Promise<void> {
  checks.step('9. The instructor revokes the token, and its next call is 401')
  const agent = checks.must('a token to act with', state.agent)
  const projectId = checks.must('a project', state.projectId)

  const revoked = unwrap(
    await human.DELETE('/v1/tokens/{tokenId}', {
      params: {
        path: { tokenId: agent.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    }),
    'revokeToken',
  )
  checks.ok(
    'revoked — and it is NOT expired: a clock and a person are different answers',
    revoked.revokedAt !== null && revoked.expired === false,
    JSON.stringify({ revokedAt: revoked.revokedAt, expired: revoked.expired }),
  )

  const after = await agent.client.GET('/v1/projects/{projectId}', {
    params: { path: { projectId } },
  })
  checks.ok(
    'the agent’s next call is 401 UNAUTHENTICATED — the same answer any bad token gets',
    refusal(after, 401, 'UNAUTHENTICATED') !== undefined,
    describe(after),
  )
  // The person's own view is unchanged: revoking a credential is not deleting a record.
  const listed = unwrap(
    await human.GET('/v1/projects/{projectId}/tokens', {
      params: { path: { projectId } },
    }),
    'listTokens',
  )
  checks.ok(
    'and the instructor still sees it, revoked, in the project’s tokens',
    listed.find((t) => t.id === agent.id)?.revokedAt !== null,
    JSON.stringify(
      listed.map((t) => ({ id: t.id.slice(0, 8), revoked: t.revokedAt !== null })),
    ),
  )
}

const steps = [
  step1SignedIn,
  step2Mint,
  step3Scope,
  step4Build,
  step5Deploy,
  step6Refused,
  step7Confirmed,
  step8RetriedOnce,
  step9Revoked,
]

try {
  for (const step of steps) await step()
} catch (error) {
  if (error instanceof ManifestApiError)
    checks.ok(`no call refused (${error.operation})`, false, error.message)
  else if (!(error instanceof JourneyStop)) {
    // `fetch failed` says nothing on its own; the reason is its cause's code — for this
    // origin most often UNABLE_TO_GET_ISSUER_CERT_LOCALLY, a Node process started without
    // NODE_EXTRA_CA_CERTS (S7: Node does not read the macOS keychain).
    const cause = (error as { cause?: { code?: unknown } }).cause?.code
    checks.ok(
      'no step threw',
      false,
      `${cause === undefined ? '' : `[cause ${String(cause)}] `}${(error as Error).stack ?? String(error)}`,
    )
  }
}
checks.finish()
