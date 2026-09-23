import { readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:https'
import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type ErrorEnvelope,
  type ManifestClient,
  type Schemas,
} from '@manifest/contract'
import { Checks, JourneyStop } from './check.js'

/**
 * P6a's ACCEPTANCE (Task 19): an application reaches production with every one of §13's
 * blocking items HONESTLY met — through the edge, by nothing but the generated client.
 *
 *   node packages/journey/dist/production.js <instructor|admin|launch> <state.json>
 *
 * Three phases, because §20's step-up is a BROWSER round trip at the IdP and that is
 * bash's business (D23.8, P5a Decision 38): `scripts/demo-production.sh` signs people in
 * and steps them up BETWEEN the phases, and hands each phase the sessions it needs.
 *
 *   instructor  MANIFEST_SESSION                 steps 1–3
 *   admin       MANIFEST_ADMIN_SESSION           steps 4–6
 *   launch      MANIFEST_ADMIN_SESSION_STEPPED   steps 7–10
 *               MANIFEST_SESSION_STEPPED
 *
 * **A step-up is a claim on the SESSION COOKIE** (P6a Decision 8) and sessions are
 * stateless, so the cookie from before the step-up is still a valid, un-stepped session
 * after it. That is what lets one bash script hold both and prove §20 from both sides.
 *
 * **`launch-app` is this demo's own project** (sitting 10's F21): `make demo-journey`'s
 * re-use path fails on a project whose launch records exist. There is no route that
 * deletes a project, so a SECOND run re-uses `launch-app` — its records are already
 * recorded — and step 3 asserts the unmet set the platform's own records say is right,
 * printing which path it took. Both sets are asserted as sorted ids, never counted.
 */

const SLUG = 'launch-app'
/** §7: exactly what the proof-app starter's `auth.attributes` asks for. */
const ATTRIBUTES = ['ubcEduCwlPuid', 'mail', 'eduPersonAffiliation', 'givenName', 'sn']
/** §9's SP naming, `{platform-domain}/sp/{slug}/{env}` — `MANIFEST_SP_ENTITY_BASE` on a laptop. */
const ENTITY_ID = `https://manifest.internal/sp/${SLUG}/production`
const PRODUCTION_HOST = `${SLUG}.manifest.internal`
/** Past the builder's own 900 s timeout, as the journey's bound is. */
const BUILD_ENDS_WITHIN_MS = 960_000

interface ProductionState {
  projectId?: string
  stagingEnvironmentId?: string
  productionEnvironmentId?: string
  releaseId?: string
  imageDigest?: string
  /** Whether `launch-app` existed with its records before this run (the re-use path). */
  reused?: boolean
  productionInstanceId?: string
}

const [phase, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
if (
  (phase !== 'instructor' && phase !== 'admin' && phase !== 'launch') ||
  statePath === undefined
) {
  console.error('usage: production.js <instructor|admin|launch> <state.json>')
  process.exit(2)
}
const path: string = statePath

const checks = new Checks()
const state: ProductionState = (() => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ProductionState
  } catch {
    return {}
  }
})()

function clientFor(variable: string): ManifestClient {
  const session = process.env[variable]
  return createManifestClient({
    origin,
    session: checks.must(`${variable} was provided`, session),
  })
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

/** A checklist's unmet BLOCKING ids, sorted — the value step 3 and step 9 assert. */
function unmetBlocking(readiness: Schemas['LaunchReadiness']): string[] {
  return readiness.items
    .filter((i) => i.blocking && i.state !== 'met')
    .map((i) => i.id)
    .sort()
}

async function readiness(client: ManifestClient): Promise<Schemas['LaunchReadiness']> {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/launch-readiness', {
      params: { path: { projectId: state.projectId! } },
    }),
    'getLaunchReadiness',
  )
}

/**
 * One GET over a CHOSEN ADDRESS, with the production hostname as SNI and Host — so the
 * demo can ask the internal listener (127.0.0.2) for a name the host resolves to the
 * public one (127.0.0.3), which is §12's split seen from the outside. `fetch` cannot pin
 * an address. Returns the status, the instance header and the start of the body.
 */
function probe(
  address: string,
  pathname: string,
): Promise<{ status: number; instance: string | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: PRODUCTION_HOST,
        servername: PRODUCTION_HOST,
        path: pathname,
        // A FRESH SOCKET, ALWAYS. The global agent pools keep-alive sockets by hostname, not
        // by address, so the second probe was answered over the FIRST probe's socket to
        // 127.0.0.3 and reported the production app on the internal listener (measured on
        // this demo's fourth run; curl --resolve showed the split was sound). In the other
        // order the same reuse would report a real leak as the split holding.
        agent: false,
        // Node 24's `net` asks with `{ all: true }` and wants an ARRAY back; answering the
        // single-address form throws ERR_INVALID_IP_ADDRESS (measured on this demo's first run).
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
            body: body.slice(0, 200),
          })
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error(`${address} did not answer in 10 s`)))
    req.on('error', reject)
    req.end()
  })
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

/** Build, release and deploy to staging — steps 2 and 10 both do exactly this. */
async function buildReleaseStage(
  client: ManifestClient,
  summary: string,
): Promise<{ release: Schemas['Release']; instance: Schemas['Instance'] }> {
  const started = unwrap(
    await client.POST('/v1/projects/{projectId}/builds', {
      params: {
        path: { projectId: state.projectId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {},
    }),
    'startBuild',
  )
  const startedAt = Date.now()
  const build = await waitForBuild(client, started.id)
  checks.must(
    'the build succeeded, with a digest',
    build.status === 'succeeded' && build.imageDigest ? build : undefined,
    `${build.status}: ${build.error ?? ''}`,
  )
  console.log(`  (built in ${Date.now() - startedAt} ms)`)
  const release = unwrap(
    await client.POST('/v1/projects/{projectId}/releases', {
      params: {
        path: { projectId: state.projectId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { buildId: started.id, summary },
    }),
    'createRelease',
  )
  checks.ok(
    'the release carries the build’s digest',
    release.imageDigest === build.imageDigest,
    `${release.imageDigest} vs ${build.imageDigest}`,
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
  checks.ok('staging is healthy on it', instance.state === 'healthy', instance.state)
  return { release, instance }
}

// ─── instructor ────────────────────────────────────────────────────────────────────────

/** Step 1: `launch-app`, from the proof-app starter — created, or re-used from a run before. */
async function step1Project(): Promise<void> {
  checks.step('1. The instructor has launch-app, from the proof-app starter')
  const client = clientFor('MANIFEST_SESSION')
  const me = unwrap(await client.GET('/v1/me'), 'getMe')
  checks.ok('signed in as the instructor', me.puid === 'ins000001', me.puid)
  const existing = unwrap(await client.GET('/v1/projects'), 'listProjects').find(
    (p) => p.slug === SLUG,
  )
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
            burst: 'synchronised',
            justification: 'P6a’s acceptance — the first production launch',
          },
        },
      }),
      'createProject',
    )
    state.projectId = created.id
    checks.ok('created, and its manifest.yaml is valid', created.spec.valid)
  } else {
    state.projectId = existing.id
    console.log('  (launch-app exists from an earlier run — the RE-USE path)')
  }
  const environments = unwrap(
    await client.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId: state.projectId } },
    }),
    'listEnvironments',
  )
  state.stagingEnvironmentId = checks.must(
    'it has a staging environment',
    environments.find((e) => e.kind === 'staging'),
  ).id
  const production = checks.must(
    'and a production one, on the production zone',
    environments.find((e) => e.kind === 'production'),
  )
  checks.ok(
    `production is ${PRODUCTION_HOST}`,
    production.hostname === PRODUCTION_HOST,
    production.hostname,
  )
  state.productionEnvironmentId = production.id
  const records = unwrap(
    await client.GET('/v1/projects/{projectId}/launch-records', {
      params: { path: { projectId: state.projectId } },
    }),
    'getLaunchRecords',
  )
  state.reused =
    records.iamRegistration?.state === 'active' &&
    records.privacyAssessment?.state === 'approved'
}

/** Step 2: build, release, staging — the digest production will run (§13). */
async function step2Staging(): Promise<void> {
  checks.step('2. Build it, release it, deploy it to staging')
  const client = clientFor('MANIFEST_SESSION')
  const { release } = await buildReleaseStage(client, 'P6a acceptance — the candidate')
  state.releaseId = release.id
  state.imageDigest = release.imageDigest
  console.log(`  candidate digest: ${release.imageDigest}`)
}

/** Step 3: asking for production is refused — by §20 first, and §13 says what is missing. */
async function step3Refused(): Promise<void> {
  checks.step('3. Ask for production — refused, and the checklist says why')
  const client = clientFor('MANIFEST_SESSION')
  const attempt = await client.POST('/v1/environments/{environmentId}/deploy', {
    params: {
      path: { environmentId: state.productionEnvironmentId! },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
    body: { releaseId: state.releaseId! },
  })
  checks.ok(
    'refused 403 STEP_UP_REQUIRED — §20 answers before §13 (sitting 9, F6)',
    refusal(attempt, 403, 'STEP_UP_REQUIRED') !== undefined,
    describe(attempt),
  )
  const r = await readiness(client)
  checks.ok('not ready', r.ready === false)
  checks.ok(
    'the candidate is the release serving staging',
    r.candidateReleaseId === state.releaseId,
    `${r.candidateReleaseId}`,
  )
  checks.ok(
    'six blocking items, and code-review present and non-blocking',
    r.items
      .filter((i) => i.blocking)
      .map((i) => i.id)
      .sort()
      .join(',') ===
      'admin-approval,domain,iam-registration,privacy-assessment,rehearsal,scans' &&
      r.items.find((i) => i.id === 'code-review')?.blocking === false,
    r.items.map((i) => `${i.id}:${i.blocking}`).join(' '),
  )
  // THE IDS, SORTED, NEVER A COUNT (Task 19 Step 2): a checklist that returned six unmet
  // items would satisfy "four" by accident on the wrong day.
  const unmet = unmetBlocking(r)
  console.log(`  unmet at step 3: [${unmet.join(', ')}]`)
  if (!state.reused) {
    const expected = [
      'admin-approval',
      'iam-registration',
      'privacy-assessment',
      'rehearsal',
    ]
    checks.ok(
      `unmet is exactly ${expected.join(', ')}`,
      unmet.join(',') === expected.join(','),
      unmet.join(','),
    )
    return
  }
  // THE RE-USE PATH. The records are met because a run before this one recorded them; the
  // NEW release has no approval; and whether `rehearsal` is met depends on whether an
  // earlier run got that far — a rehearsal covers a registration's SHAPE (ACS and
  // attributes, Decision 10), not a release, so an earlier one legitimately still counts.
  checks.ok(
    'unmet is admin-approval, and at most the rehearsal besides (re-use: the records exist)',
    unmet[0] === 'admin-approval' &&
      (unmet.length === 1 || (unmet.length === 2 && unmet[1] === 'rehearsal')),
    unmet.join(','),
  )
}

// ─── admin ─────────────────────────────────────────────────────────────────────────────

/** Step 4: an administrator records what UBC IAM and the Privacy Office said (R1). */
async function step4Records(): Promise<void> {
  checks.step('4. An administrator records the IAM registration and the PIA (R1)')
  const admin = clientFor('MANIFEST_ADMIN_SESSION')
  const me = unwrap(await admin.GET('/v1/me'), 'getMe')
  checks.ok('the operator is an administrator', me.role === 'admin', me.role)
  const projectId = state.projectId!
  const iam = (s: Schemas['RecordIamRegistrationRequest']['state']) =>
    admin.POST('/v1/projects/{projectId}/launch-records/iam-registration', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        entityId: ENTITY_ID,
        acsUrl: `https://${PRODUCTION_HOST}/auth/ubcshib/callback`,
        sloUrl: `https://${PRODUCTION_HOST}/auth/logout`,
        registeredAttributes: ATTRIBUTES,
        state: s,
        externalTicketRef: 'IAM-ACCEPTANCE',
      },
    })
  const pia = (s: Schemas['RecordPrivacyAssessmentRequest']['state']) =>
    admin.POST('/v1/projects/{projectId}/launch-records/privacy-assessment', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        state: s,
        reviewer: 'UBC Privacy Office',
        externalTicketRef: 'PIA-ACCEPTANCE',
      },
    })

  // An illegal arrow first, on either path — §9's machines refuse a jump by its CODE.
  const jump = await iam(state.reused ? 'submitted' : 'active')
  checks.ok(
    `an illegal jump (${state.reused ? 'active → submitted' : 'draft → active'}) is refused 409 LAUNCH_TRANSITION_INVALID`,
    refusal(jump, 409, 'LAUNCH_TRANSITION_INVALID') !== undefined,
    describe(jump),
  )
  if (!state.reused) {
    unwrap(await iam('submitted'), 'recordIamRegistration')
    unwrap(await pia('submitted'), 'recordPrivacyAssessment')
  }
  const registration = unwrap(await iam('active'), 'recordIamRegistration')
  const assessment = unwrap(await pia('approved'), 'recordPrivacyAssessment')
  checks.ok(
    'the registration is active, listing the five attributes',
    registration.state === 'active' &&
      [...registration.registeredAttributes].sort().join(',') ===
        [...ATTRIBUTES].sort().join(','),
    JSON.stringify(registration),
  )
  checks.ok('the PIA is approved', assessment.state === 'approved', assessment.state)
  const unmet = unmetBlocking(await readiness(admin))
  console.log(`  unmet after the records: [${unmet.join(', ')}]`)
  checks.ok(
    state.reused
      ? 'unmet is admin-approval, and at most the rehearsal besides (re-use)'
      : 'unmet is exactly admin-approval, rehearsal',
    state.reused
      ? unmet[0] === 'admin-approval' &&
          (unmet.length === 1 || (unmet.length === 2 && unmet[1] === 'rehearsal'))
      : unmet.join(',') === 'admin-approval,rehearsal',
    unmet.join(','),
  )
}

/** Step 5: the rehearsal (R2) — the item is met by a MEASUREMENT on the public listener. */
async function step5Rehearsal(): Promise<void> {
  checks.step('5. Manifest runs the rehearsal (R2)')
  const admin = clientFor('MANIFEST_ADMIN_SESSION')
  const startedAt = Date.now()
  const rehearsal = unwrap(
    await admin.POST('/v1/projects/{projectId}/rehearsal', {
      params: {
        path: { projectId: state.projectId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    }),
    'runRehearsal',
  )
  const e = rehearsal.evidence
  console.log(
    `  rehearsal: passed=${rehearsal.passed} in ${Date.now() - startedAt} ms; ${e.hostname} on the ${e.listener} listener, ` +
      `sign-in ${e.signInStatus}, released [${[...e.attributesReleased].sort().join(', ')}] — ${e.reason}`,
  )
  checks.ok('it passed', rehearsal.passed, e.reason)
  checks.ok('of the candidate', rehearsal.releaseId === state.releaseId)
  checks.ok(
    'on the production hostname, on the PUBLIC listener',
    e.hostname === PRODUCTION_HOST && e.listener === 'public',
    `${e.hostname} ${e.listener}`,
  )
  checks.ok(
    'registered under the entityID IAM was told, at its ACS',
    rehearsal.entityId === ENTITY_ID &&
      rehearsal.acsUrl === `https://${PRODUCTION_HOST}/auth/ubcshib/callback`,
    `${rehearsal.entityId} ${rehearsal.acsUrl}`,
  )
  checks.ok(
    'a real sign-in released exactly the five registered attributes',
    e.signInStatus === 200 &&
      [...e.attributesReleased].sort().join(',') === [...ATTRIBUTES].sort().join(','),
    `${e.signInStatus} [${e.attributesReleased.join(', ')}]`,
  )
  const unmet = unmetBlocking(await readiness(admin))
  checks.ok(
    'unmet is exactly admin-approval',
    unmet.join(',') === 'admin-approval',
    unmet.join(','),
  )
}

/** Step 6: approving on an ordinary session is refused — §20: a stolen session is not enough. */
async function step6ApprovalNeedsStepUp(): Promise<void> {
  checks.step('6. Approve — refused until the administrator re-proves themselves (§20)')
  const admin = clientFor('MANIFEST_ADMIN_SESSION')
  const attempt = await admin.POST('/v1/releases/{releaseId}/approve', {
    params: {
      path: { releaseId: state.releaseId! },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
    body: { reason: 'P6a acceptance' },
  })
  const refused = refusal(attempt, 403, 'STEP_UP_REQUIRED')
  checks.ok(
    'refused 403 STEP_UP_REQUIRED, with the remedy in the hint',
    refused !== undefined && (refused.hint ?? '').length > 0,
    describe(attempt),
  )
  const approval = await admin.GET('/v1/releases/{releaseId}/approval', {
    params: { path: { releaseId: state.releaseId! } },
  })
  checks.ok(
    'and nothing was recorded — the approval reads 404',
    approval.response.status === 404,
    describe(approval),
  )
}

// ─── launch ────────────────────────────────────────────────────────────────────────────

/** Step 7: the gate itself, stepped up; then the approval, bound to the digest. */
async function step7Approve(): Promise<void> {
  checks.step('7. Stepped up: §13’s gate answers, and the administrator approves')
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const admin = clientFor('MANIFEST_ADMIN_SESSION_STEPPED')
  // WITH §20 satisfied, the refusal a client meets is §13's own — and its envelope
  // carries the checklist, byte for byte what the read answers.
  const gate = await owner.POST('/v1/environments/{environmentId}/deploy', {
    params: {
      path: { environmentId: state.productionEnvironmentId! },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
    body: { releaseId: state.releaseId! },
  })
  const refused = refusal(gate, 409, 'RELEASE_PRODUCTION_GATE_UNAVAILABLE')
  const carried = refused?.launchReadiness
  checks.ok(
    'a stepped-up owner is refused 409 RELEASE_PRODUCTION_GATE_UNAVAILABLE',
    refused !== undefined,
    describe(gate),
  )
  checks.ok(
    'whose checklist names exactly admin-approval as unmet',
    carried !== undefined && unmetBlocking(carried).join(',') === 'admin-approval',
    carried === undefined ? 'no checklist' : unmetBlocking(carried).join(','),
  )
  const approval = unwrap(
    await admin.POST('/v1/releases/{releaseId}/approve', {
      params: {
        path: { releaseId: state.releaseId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { reason: 'P6a acceptance — every blocking item met' },
    }),
    'approveRelease',
  )
  console.log(
    `  approval: ${approval.decision}, digest ${approval.imageDigest}, summary ${approval.diff.summarySource}, review ${approval.diff.review.state} (${approval.diff.review.reviewer})`,
  )
  checks.ok('approved', approval.decision === 'approved', approval.decision)
  checks.ok(
    'bound to the candidate’s digest (§13)',
    approval.imageDigest === state.imageDigest,
    `${approval.imageDigest} vs ${state.imageDigest}`,
  )
  checks.ok(
    'the diff names the attributes the app asks for',
    [...approval.diff.attributes].sort().join(',') === [...ATTRIBUTES].sort().join(','),
    approval.diff.attributes.join(','),
  )
  // Decision 7: the summary may be ABSENT, and says why in a closed vocabulary. A first
  // launch has nothing to compare with; an offline run may have no model.
  checks.ok(
    'the summary is present, or absent for a stated reason',
    (approval.diff.summarySource === 'llm' && (approval.diff.summary ?? '').length > 0) ||
      approval.diff.summarySource === 'no-previous-release' ||
      approval.diff.summarySource === 'unavailable',
    `${approval.diff.summarySource}: ${approval.diff.summary}`,
  )
  checks.ok(
    'and R4’s seam says no code review was performed',
    approval.diff.review.state === 'not_performed',
    JSON.stringify(approval.diff.review),
  )
  const read = unwrap(
    await admin.GET('/v1/releases/{releaseId}/approval', {
      params: { path: { releaseId: state.releaseId! } },
    }),
    'getApproval',
  )
  checks.ok(
    'the record reads back identically',
    JSON.stringify(read) === JSON.stringify(approval),
  )
}

/** Step 8: the first production launch — and the app, not the wildcard, answers. */
async function step8Launch(): Promise<void> {
  checks.step('8. The owner deploys to production')
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const askedAt = Date.now()
  const instance = unwrap(
    await owner.POST('/v1/environments/{environmentId}/deploy', {
      params: {
        path: { environmentId: state.productionEnvironmentId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { releaseId: state.releaseId! },
    }),
    'deploy',
  )
  console.log(
    `  production deploy answered in ${Date.now() - askedAt} ms: instance ${instance.id}, ${instance.state}`,
  )
  checks.must(
    'the production instance is healthy',
    instance.state === 'healthy' ? instance : undefined,
    instance.state,
  )
  state.productionInstanceId = instance.id

  // §12's split from the outside. The host resolves the production name to the PUBLIC
  // address; the body and the instance header prove it is THIS instance, because the
  // edge's wildcard answers 200 for any name (ORIENTATION §4).
  const pub = await probe('127.0.0.3', '/healthz')
  console.log(
    `  127.0.0.3 answered ${pub.status}, X-Manifest-Instance: ${pub.instance ?? '(none)'}`,
  )
  checks.ok(
    'the app answers on the public listener AS THE INSTANCE THE DEPLOY STARTED',
    pub.status === 200 &&
      pub.instance === instance.id &&
      pub.body.includes('"mongo":true'),
    `${pub.status} ${pub.instance} ${pub.body}`,
  )
  const internal = await probe('127.0.0.2', '/healthz')
  console.log(
    `  127.0.0.2 answered ${internal.status}, X-Manifest-Instance: ${internal.instance ?? '(none)'}`,
  )
  checks.ok(
    'and the same name on the INTERNAL listener is not the app',
    internal.instance === undefined && !internal.body.includes('"mongo":true'),
    `${internal.status} ${internal.instance} ${internal.body}`,
  )
}

/** Step 9: the checklist, met — with R4's seam visible and harmless. */
async function step9Ready(): Promise<void> {
  checks.step('9. The checklist, read again')
  const r = await readiness(clientFor('MANIFEST_SESSION_STEPPED'))
  const unmet = unmetBlocking(r)
  console.log(`  unmet at step 9: [${unmet.join(', ')}]; ready: ${r.ready}`)
  checks.ok('ready: true', r.ready === true)
  checks.ok('no blocking item unmet', unmet.length === 0, unmet.join(','))
  checks.ok(
    'every one of the six blocking items is met',
    r.items.filter((i) => i.blocking && i.state === 'met').length === 6,
    r.items.map((i) => `${i.id}:${i.state}`).join(' '),
  )
  const review = r.items.find((i) => i.id === 'code-review')
  checks.ok(
    'code-review is present, not built, and does not block (D33)',
    review?.state === 'not_built' && review.blocking === false,
    JSON.stringify(review),
  )
}

/**
 * Step 10: a REBUILD has no approval (Decision 11) — asserted as the platform actually
 * behaves, which is not quite what Decision 11 says.
 *
 * **THE BUILDER IS REPRODUCIBLE**: the same commit rebuilds to the SAME digest (measured on
 * this demo's first two runs), so Decision 11's premise — "a new build is a new digest" —
 * does not hold here. The approval is still not carried over, because it is looked up by
 * RELEASE (`latestApprovalFor`), and a rebuild is a new release. That is the safe
 * direction. And sitting 7's F5 holds: the checklist reads "not reviewed yet", never the
 * "rebuilt since it was approved" sentence, which no route can reach. The digest
 * comparison is PRINTED, so a run where it differs is not byte-identical to one where it
 * does not.
 */
async function step10Rebuild(): Promise<void> {
  checks.step(
    '10. Rebuild — the new release has no approval, and production is untouched',
  )
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const { release } = await buildReleaseStage(
    owner,
    'P6a acceptance — rebuilt after the launch',
  )
  console.log(
    `  rebuilt digest: ${release.imageDigest} — ${release.imageDigest === state.imageDigest ? 'IDENTICAL to the approved one (a reproducible build)' : 'different from the approved one'}`,
  )
  checks.ok('the rebuild is a new release', release.id !== state.releaseId, release.id)
  const r = await readiness(owner)
  const approval = r.items.find((i) => i.id === 'admin-approval')
  checks.ok('the candidate is the rebuilt release', r.candidateReleaseId === release.id)
  checks.ok(
    'admin-approval is unmet, and not ready',
    approval?.state === 'unmet' && r.ready === false,
    `${approval?.state}: ${approval?.why}`,
  )
  const production = unwrap(
    await owner.GET('/v1/environments/{environmentId}', {
      params: { path: { environmentId: state.productionEnvironmentId! } },
    }),
    'getEnvironment',
  )
  checks.ok(
    'production still serves the approved launch',
    production.instance?.id === state.productionInstanceId,
    `${production.instance?.id}`,
  )
}

const phases: Record<'instructor' | 'admin' | 'launch', (() => Promise<void>)[]> = {
  instructor: [step1Project, step2Staging, step3Refused],
  admin: [step4Records, step5Rehearsal, step6ApprovalNeedsStepUp],
  launch: [step7Approve, step8Launch, step9Ready, step10Rebuild],
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
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`)
}
checks.finish()
