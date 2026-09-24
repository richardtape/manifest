import { spawn } from 'node:child_process'
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
 * P6b's ACCEPTANCE (Task 11): D9's SECOND clause — what a LAUNCHED app's next release does —
 * through the edge, by nothing but the generated client.
 *
 *   node packages/journey/dist/releases.js <phase> <state.json>
 *
 * **Three legs, in Decision 17's order.** LEG A, a sensitive change (CWL attribute `sn`
 * removed, an egress host unique to the run added), is refused `RELEASE_REESCALATED` until an
 * administrator — having read a STORED preview (Rich, 2026-09-22) — approves it. LEG B, a
 * code-only change, goes to production SELF-SERVE while a loop on the public listener sees
 * nothing but the app. LEG C is §9's IAM change request: `sn` added back is refused at the
 * BUILD until UBC IAM has registered it, and then re-escalates like any sensitive change.
 * A runs before B, although the hand-off lists B first, because B's *"nothing sensitive"* is a
 * claim about a baseline and only A guarantees one (*Read this first* 21).
 *
 * **Phases, because sign-ins, step-ups, git commits and `docker exec` are bash's**
 * (D23.8, P5a Decision 38): `scripts/demo-releases.sh` does each of those BETWEEN phases and
 * hands the next one the sessions it needs. A step-up lasts ten minutes (`STEP_UP_TTL_MS`) and
 * each leg builds first, so every leg is stepped up right before its stepped-up calls.
 *
 *   status      MANIFEST_SESSION                              is launch-app launched?
 *   setup       both people, plain and stepped                step 1, and the RECOVERY
 *   stageA      MANIFEST_SESSION                              step 2's build → staging
 *   gateA       owner stepped, admin plain                    step 2's refusal; step 3 to the step-up
 *   approveA    both stepped                                  step 3 after the step-up; step 4's deploy
 *   notStaged   owner stepped                                 step 4's RELEASE_NOT_STAGED
 *   stageB      MANIFEST_SESSION                              step 5's build → staging
 *   deployB     owner stepped                                 step 5's self-serve deploy, under a loop
 *   recordC     admin plain                                   step 6: UBC registered the narrower set
 *   buildC      owner plain, admin plain                      step 6: the change request, and the builds
 *   gateC       both stepped                                  step 6's re-escalation, approval, deploy; step 7
 *
 * **Path-independent** (Decision 17): nothing here assumes what an earlier run left. The
 * baseline an assertion compares with is DERIVED through the contract — the newest release
 * whose latest decision is `approved` — rather than assumed to be what production serves, and
 * every leg writes its manifest from the starter, so it is what it claims whatever came before.
 */

const SLUG = 'launch-app'
/** §7: the proof-app starter's `auth.attributes`, and the same list without `sn` (leg A). */
const FIVE = ['ubcEduCwlPuid', 'mail', 'eduPersonAffiliation', 'givenName', 'sn']
const FOUR = FIVE.filter((a) => a !== 'sn')
const PRODUCTION_HOST = `${SLUG}.manifest.internal`
/** Past the builder's own 900 s timeout, as the journey's bound is. */
const BUILD_ENDS_WITHIN_MS = 960_000
/** The ticket every record this demo makes carries — §9's `externalTicketRef`. */
const TICKET = 'IAM-ACCEPTANCE'

type Phase =
  | 'status'
  | 'setup'
  | 'stageA'
  | 'gateA'
  | 'approveA'
  | 'notStaged'
  | 'stageB'
  | 'deployB'
  | 'recordC'
  | 'buildC'
  | 'gateC'

interface ReleasesState {
  projectId?: string
  stagingEnvironmentId?: string
  productionEnvironmentId?: string
  /** `launchedAt`, or absent — `status` writes it and bash reads the flag. */
  launched?: boolean
  launchedAt?: string
  /** What production served when leg A began: the release step 4 asks for again, and its instance. */
  releaseBefore?: string
  instanceBefore?: string
  /** The run hosts production's release declared before leg A — step 4 expects each Filtered. */
  previousHosts?: string[]
  releaseA?: string
  digestA?: string
  /** The last approved release when A was staged — leg A's baseline, derived, never assumed. */
  baselineA?: string
  expectedFieldsA?: string[]
  /** The preview the administrator read before the step-up, as it was read. */
  previewA?: string
  instanceA?: string
  releaseB?: string
  instanceB?: string
  releaseC?: string
  instanceC?: string
  /** Every approval this run recorded, in words, for step 7. */
  approvals?: string[]
}

const PHASES: readonly Phase[] = [
  'status',
  'setup',
  'stageA',
  'gateA',
  'approveA',
  'notStaged',
  'stageB',
  'deployB',
  'recordC',
  'buildC',
  'gateC',
]
const [phaseArg, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
if (!PHASES.includes(phaseArg as Phase) || statePath === undefined) {
  console.error(`usage: releases.js <${PHASES.join('|')}> <state.json>`)
  process.exit(2)
}
const phase = phaseArg as Phase
const path: string = statePath

const checks = new Checks()
const state: ReleasesState = (() => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ReleasesState
  } catch {
    return {}
  }
})()

function env(variable: string): string {
  return checks.must(`${variable} was provided`, process.env[variable])
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
  return `${result.response.status} ${envelope?.error?.code ?? '(no envelope)'}: ${envelope?.error?.message ?? ''}`
}

const sorted = (list: readonly string[]): string => [...list].sort().join(',')

async function readiness(client: ManifestClient): Promise<Schemas['LaunchReadiness']> {
  return unwrap(
    await client.GET('/v1/projects/{projectId}/launch-readiness', {
      params: { path: { projectId: state.projectId! } },
    }),
    'getLaunchReadiness',
  )
}

async function release(
  client: ManifestClient,
  releaseId: string,
): Promise<Schemas['Release']> {
  return unwrap(
    await client.GET('/v1/releases/{releaseId}', { params: { path: { releaseId } } }),
    'getRelease',
  )
}

async function production(client: ManifestClient): Promise<Schemas['Environment']> {
  return unwrap(
    await client.GET('/v1/environments/{environmentId}', {
      params: { path: { environmentId: state.productionEnvironmentId! } },
    }),
    'getEnvironment',
  )
}

/**
 * THE BASELINE, DERIVED THROUGH THE CONTRACT: the newest release other than `except` whose
 * LATEST decision is `approved` — which is what §13 D9.2 compares a candidate with (Task 3).
 * The demo does not assume it is what production serves: a run that stopped after leg B left
 * production serving a SELF-SERVE release, and the baseline is then A, not what serves.
 */
async function lastApproved(
  client: ManifestClient,
  except: string,
): Promise<string | undefined> {
  const releases = unwrap(
    await client.GET('/v1/projects/{projectId}/releases', {
      params: { path: { projectId: state.projectId! } },
    }),
    'listReleases',
  )
  for (const candidate of releases) {
    if (candidate.id === except) continue
    const approval = await client.GET('/v1/releases/{releaseId}/approval', {
      params: { path: { releaseId: candidate.id } },
    })
    if (approval.data?.decision === 'approved') return candidate.id
  }
  return undefined
}

/**
 * One GET over a CHOSEN ADDRESS, with the production hostname as SNI and Host — so the demo
 * asks the public listener (127.0.0.3) and the internal one (127.0.0.2) for the same name,
 * which is §12's split seen from outside. `agent: false` always (P6a F2: a pooled socket
 * answers from the wrong address), and a `lookup` that answers Node 24's `{ all: true }` form
 * (P6a F1). The same probe `production.ts` carries.
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

/** §12's split, both halves: the public listener answers AS `instanceId`, the internal one never. */
async function servesOnlyPublicly(instanceId: string, what: string): Promise<void> {
  const pub = await probe('127.0.0.3', '/healthz')
  console.log(
    `  127.0.0.3 answered ${pub.status}, X-Manifest-Instance: ${pub.instance ?? '(none)'}`,
  )
  checks.ok(
    `the public listener answers as ${what}`,
    pub.status === 200 &&
      pub.instance === instanceId &&
      pub.body.includes('"mongo":true'),
    `${pub.status} ${pub.instance} ${pub.body}`,
  )
  const internal = await probe('127.0.0.2', '/healthz')
  checks.ok(
    'and the same name on the INTERNAL listener is not the app',
    internal.instance === undefined && !internal.body.includes('"mongo":true'),
    `${internal.status} ${internal.instance} ${internal.body}`,
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

/** Validate THIS commit — the one bash just pushed — and hand back what validation said. */
async function validate(
  client: ManifestClient,
  commitSha: string,
): Promise<Schemas['SpecValidation']> {
  const validation = unwrap(
    await client.POST('/v1/projects/{projectId}/spec', {
      params: {
        path: { projectId: state.projectId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { commitSha },
    }),
    'validateSpec',
  )
  console.log(
    `  validated ${commitSha.slice(0, 12)}: valid ${validation.valid}, sensitive [${validation.sensitiveDiff.fields.join(', ')}]`,
  )
  checks.must(
    'manifest.yaml is valid',
    validation.valid ? validation : undefined,
    JSON.stringify(validation.errors),
  )
  return validation
}

/** Build THIS commit and wait for it to end — succeeded or failed; the caller says which. */
async function build(
  client: ManifestClient,
  commitSha: string,
): Promise<Schemas['Build']> {
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
  const ended = await waitForBuild(client, started.id)
  console.log(
    `  build ${started.id.slice(0, 8)} ${ended.status} in ${Date.now() - startedAt} ms`,
  )
  return ended
}

/** Release a SUCCEEDED build and deploy it to staging — the candidate production is asked for. */
async function releaseAndStage(
  client: ManifestClient,
  built: Schemas['Build'],
  summary: string,
): Promise<Schemas['Release']> {
  checks.must(
    'the build succeeded, with a digest',
    built.status === 'succeeded' && built.imageDigest ? built : undefined,
    `${built.status}: ${built.error ?? ''}`,
  )
  const made = unwrap(
    await client.POST('/v1/projects/{projectId}/releases', {
      params: {
        path: { projectId: state.projectId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { buildId: built.id, summary },
    }),
    'createRelease',
  )
  const instance = unwrap(
    await client.POST('/v1/environments/{environmentId}/deploy', {
      params: {
        path: { environmentId: state.stagingEnvironmentId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { releaseId: made.id },
    }),
    'deploy',
  )
  checks.must(
    'staging is healthy on it',
    instance.state === 'healthy' ? instance : undefined,
    instance.state,
  )
  console.log(`  release ${made.id} (${made.imageDigest.slice(0, 19)}…) serves staging`)
  return made
}

function askProduction(client: ManifestClient, releaseId: string) {
  return client.POST('/v1/environments/{environmentId}/deploy', {
    params: {
      path: { environmentId: state.productionEnvironmentId! },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
    body: { releaseId },
  })
}

/** A production deploy that must go through: healthy, and the instance it started. */
async function deployProduction(
  client: ManifestClient,
  releaseId: string,
): Promise<Schemas['Instance']> {
  const askedAt = Date.now()
  const instance = unwrap(await askProduction(client, releaseId), 'deploy')
  console.log(
    `  production deploy answered in ${Date.now() - askedAt} ms: instance ${instance.id}, ${instance.state}`,
  )
  return checks.must(
    'the production instance is healthy',
    instance.state === 'healthy' ? instance : undefined,
    instance.state,
  )
}

function preview(client: ManifestClient, releaseId: string) {
  return client.POST('/v1/releases/{releaseId}/approval-preview', {
    params: { path: { releaseId }, header: { 'Idempotency-Key': idempotencyKey() } },
  })
}

function approve(client: ManifestClient, releaseId: string, previewId?: string) {
  return client.POST('/v1/releases/{releaseId}/approve', {
    params: { path: { releaseId }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: {
      reason: 'P6b acceptance — the stored preview read, the sensitive change accepted',
      ...(previewId === undefined ? {} : { previewId }),
    },
  })
}

/**
 * THE RE-ESCALATION, as a client meets it: a stepped-up owner asks for production and is
 * refused `409 RELEASE_REESCALATED` — the CODE and the field list EXACTLY, because a
 * re-escalation for the wrong field (or a first-launch refusal carrying no fields) is a 409
 * too — and the envelope's checklist is byte for byte what the read answers (P6a Decision 2).
 */
async function reescalated(
  owner: ManifestClient,
  releaseId: string,
  expected: readonly string[],
): Promise<void> {
  const attempt = await askProduction(owner, releaseId)
  const refused = refusal(attempt, 409, 'RELEASE_REESCALATED')
  checks.ok('refused 409 RELEASE_REESCALATED', refused !== undefined, describe(attempt))
  const carried = refused?.launchReadiness
  console.log(
    `  the refusal's checklist: launched ${carried?.launched}, sensitive [${carried?.sensitiveFields.join(', ') ?? ''}], baseline ${carried?.baselineReleaseId}`,
  )
  checks.ok('its checklist says launched: true', carried?.launched === true)
  checks.ok(
    `its sensitive fields are EXACTLY [${[...expected].sort().join(', ')}]`,
    carried !== undefined && sorted(carried.sensitiveFields) === sorted(expected),
    carried === undefined ? 'no checklist' : carried.sensitiveFields.join(','),
  )
  checks.ok(
    'and the envelope’s checklist equals GET launch-readiness',
    carried !== undefined &&
      JSON.stringify(carried) === JSON.stringify(await readiness(owner)),
  )
}

/**
 * The stored preview an administrator reads before deciding (Rich, 2026-09-22; Task 9): no
 * step-up to take one, every sensitive field named with a security note each (R4(d)), D33's
 * coverage limit stated, the reviewer's honest `not_performed`, and a summary that is the
 * model's words or absent for a stated reason — `unavailable` offline.
 */
async function readPreview(
  admin: ManifestClient,
  releaseId: string,
  expected: readonly string[],
  baseline: string,
): Promise<Schemas['ApprovalPreview']> {
  const taken = unwrap(await preview(admin, releaseId), 'createApprovalPreview')
  const d = taken.diff
  console.log(
    `  preview ${taken.id} by ${taken.createdByName}, valid until ${taken.expiresAt}: summary ${d.summarySource}, ` +
      `review ${d.review.state} (${d.review.reviewer}), baseline ${d.baselineReleaseId}`,
  )
  if (d.summary !== null)
    console.log(`  summary: ${d.summary.replace(/\s+/g, ' ').slice(0, 300)}`)
  checks.ok(
    `the preview names exactly [${[...expected].sort().join(', ')}]`,
    sorted(d.sensitiveFields) === sorted(expected),
    d.sensitiveFields.join(','),
  )
  checks.ok(
    'with a security note for each of them',
    sorted(d.security.map((s) => s.field)) === sorted(expected) &&
      d.security.every((s) => s.note.length > 0),
    JSON.stringify(d.security),
  )
  checks.ok('D33’s coverage limit is stated', (d.coverage ?? '').length > 0)
  checks.ok(
    'and R4’s seam says no code review was performed',
    d.review.state === 'not_performed',
    JSON.stringify(d.review),
  )
  checks.ok(
    'the summary is the model’s, or unavailable (offline)',
    (d.summarySource === 'llm' && (d.summary ?? '').length > 0) ||
      d.summarySource === 'unavailable',
    `${d.summarySource}: ${d.summary}`,
  )
  checks.ok(
    'compared with the last approved release, derived through the contract',
    d.baselineReleaseId === baseline,
    `${d.baselineReleaseId} vs ${baseline}`,
  )
  return taken
}

/** The decision names the preview, and the record COPIES it (Task 9): the model is asked once. */
async function approveNaming(
  admin: ManifestClient,
  releaseId: string,
  read: Schemas['ApprovalPreview'],
  label: string,
): Promise<Schemas['Approval']> {
  const approval = unwrap(await approve(admin, releaseId, read.id), 'approveRelease')
  console.log(
    `  approval ${approval.id}: ${approval.decision} by ${approval.decidedByName}, digest ${approval.imageDigest.slice(0, 19)}…, previewId ${approval.previewId}`,
  )
  checks.ok('approved', approval.decision === 'approved', approval.decision)
  checks.ok(
    'the record’s diff DEEP-EQUALS the preview’s, and names it',
    JSON.stringify(approval.diff) === JSON.stringify(read.diff) &&
      approval.previewId === read.id,
    `previewId ${approval.previewId} vs ${read.id}`,
  )
  checks.ok(
    'bound to the release’s digest (§13)',
    approval.imageDigest === read.imageDigest,
    `${approval.imageDigest} vs ${read.imageDigest}`,
  )
  checks.ok(
    'and it says who decided (Decision 18)',
    approval.decidedByName.length > 0,
    approval.decidedByName,
  )
  ;(state.approvals ??= []).push(
    `${label}: release ${releaseId}, approved by ${approval.decidedByName} naming preview ${read.id}`,
  )
  return approval
}

/**
 * The registration as it stands, and ONE writer for every record this demo makes — the
 * entityID, ACS and SLO repeated as UBC has them, since a change to any of those is a new
 * registration or its own change request (Task 7, `[M10]`), never a side effect of this demo.
 */
async function iamRecorder(admin: ManifestClient) {
  const records = unwrap(
    await admin.GET('/v1/projects/{projectId}/launch-records', {
      params: { path: { projectId: state.projectId! } },
    }),
    'getLaunchRecords',
  )
  const existing = checks.must(
    'launch-app has an IAM registration',
    records.iamRegistration,
  )
  const attempt = (
    s: Schemas['RecordIamRegistrationRequest']['state'],
    registeredAttributes: readonly string[],
    requestedAttributes?: readonly string[],
  ) =>
    admin.POST('/v1/projects/{projectId}/launch-records/iam-registration', {
      params: {
        path: { projectId: state.projectId! },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: {
        entityId: existing.entityId,
        acsUrl: existing.acsUrl,
        sloUrl: existing.sloUrl,
        registeredAttributes: [...registeredAttributes],
        ...(requestedAttributes === undefined
          ? {}
          : { requestedAttributes: [...requestedAttributes] }),
        state: s,
        externalTicketRef: TICKET,
      },
    })
  const record = async (...args: Parameters<typeof attempt>) =>
    unwrap(await attempt(...args), 'recordIamRegistration')
  return { existing, attempt, record }
}

/**
 * §9's arrows, walked to `active` FROM WHEREVER A PREVIOUS RUN LEFT THE REGISTRATION (sitting 5:
 * leg C is path-independent only if it does). From `change_requested` or `expired`, `active` is
 * reached only through `submitted`; a record short of `active` must repeat what UBC registered
 * unchanged (Task 7), and the last record says what UBC registered now.
 */
async function registerActive(
  admin: ManifestClient,
  attributes: readonly string[],
): Promise<Schemas['IamRegistration']> {
  const { existing, record } = await iamRecorder(admin)
  if (existing.state !== 'active' && existing.state !== 'submitted') {
    console.log(`  (the registration is '${existing.state}': through 'submitted' first)`)
    await record('submitted', existing.registeredAttributes)
  }
  return record('active', attributes)
}

// ─── status ─────────────────────────────────────────────────────────────────────────────

/** Is launch-app launched? A flag for bash, never a red: a fresh machine is not a failure. */
async function status(): Promise<void> {
  const client = clientFor('MANIFEST_SESSION')
  const found = unwrap(await client.GET('/v1/projects'), 'listProjects').find(
    (p) => p.slug === SLUG,
  )
  state.launched = found?.launchedAt !== undefined && found.launchedAt !== null
  if (found?.launchedAt) state.launchedAt = found.launchedAt
  console.log(
    found === undefined
      ? '  launch-app does not exist yet'
      : `  launch-app ${state.launched ? `launched on ${found.launchedAt}` : 'has not launched'}`,
  )
}

// ─── setup ──────────────────────────────────────────────────────────────────────────────

/** Step 1: launch-app is launched, the two people are who they are, and a token cannot approve. */
async function step1Setup(): Promise<void> {
  checks.step('1. launch-app has launched — and the people are who they say')
  const owner = clientFor('MANIFEST_SESSION')
  const admin = clientFor('MANIFEST_ADMIN_SESSION')
  const me = unwrap(await owner.GET('/v1/me'), 'getMe')
  checks.ok('signed in as the instructor', me.puid === 'ins000001', me.puid)
  const adminMe = unwrap(await admin.GET('/v1/me'), 'getMe')
  checks.ok('the operator is an administrator', adminMe.role === 'admin', adminMe.role)
  const project = checks.must(
    'launch-app exists',
    unwrap(await owner.GET('/v1/projects'), 'listProjects').find((p) => p.slug === SLUG),
  )
  state.projectId = project.id
  checks.must(
    `and it has LAUNCHED — launchedAt ${project.launchedAt}`,
    project.launchedAt ?? undefined,
  )
  const environments = unwrap(
    await owner.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId: project.id } },
    }),
    'listEnvironments',
  )
  state.stagingEnvironmentId = checks.must(
    'it has a staging environment',
    environments.find((e) => e.kind === 'staging'),
  ).id
  state.productionEnvironmentId = checks.must(
    'and a production one',
    environments.find((e) => e.kind === 'production'),
  ).id

  // THE PERSON-ONLY CLASS (Task 2), headless: an administrator HOLDS release:approve, so the
  // minter's own "no more than you hold" rule would let it through — this refusal is the one
  // thing between an administrator and a token that approves.
  const mint = await admin.POST('/v1/projects/{projectId}/tokens', {
    params: {
      path: { projectId: project.id },
      header: { 'Idempotency-Key': idempotencyKey() },
    },
    body: {
      name: 'make demo-releases — must be refused',
      capabilities: ['release:approve'],
      expiresInDays: 1,
    },
  })
  checks.ok(
    'an administrator cannot mint a token holding release:approve — 400 TOKEN_CAPABILITY_FORBIDDEN',
    refusal(mint, 400, 'TOKEN_CAPABILITY_FORBIDDEN') !== undefined,
    describe(mint),
  )
  // A control that removes the refusal mints a real token; leave nothing behind it.
  if (mint.data !== undefined)
    await admin.DELETE('/v1/tokens/{tokenId}', {
      params: {
        path: { tokenId: mint.data.token.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    })

  await recover(owner, admin)

  const serving = checks.must(
    'production is serving an instance',
    (await production(owner)).instance ?? undefined,
  )
  state.releaseBefore = serving.releaseId
  state.instanceBefore = serving.id
  const before = await release(owner, serving.releaseId)
  state.previousHosts = (before.config.production.egressAllow ?? []).filter((h) =>
    h.endsWith('.example.org'),
  )
  console.log(
    `  production serves release ${serving.releaseId} (instance ${serving.id}); ` +
      `its run hosts: [${state.previousHosts.join(', ') || 'none — the fresh path'}]`,
  )
}

/**
 * THE RECOVERY — setup, printed as such, never a claim. A run that stopped part-way leaves a
 * candidate the checklist does not pass; the two items this demo can honestly repair are
 * repaired (UBC registering what the candidate asks for; an administrator approving it, having
 * read a preview), the candidate goes to production, and ANYTHING ELSE unmet stops the run red.
 */
async function recover(owner: ManifestClient, admin: ManifestClient): Promise<void> {
  let r = await readiness(owner)
  checks.ok('the checklist is a launched app’s', r.launched === true)
  if (r.ready) {
    console.log('  the checklist is ready for the candidate — nothing to recover')
    return
  }
  const unmet = r.items.filter((i) => i.blocking && i.state !== 'met').map((i) => i.id)
  console.log(
    `  RECOVERY (setup, not a claim): an earlier run stopped part-way; unmet [${unmet.join(', ')}]`,
  )
  const candidate = checks.must('there is a candidate', r.candidateReleaseId ?? undefined)
  checks.must(
    'and nothing is unmet that this demo cannot honestly repair',
    unmet.every((i) => i === 'iam-registration' || i === 'admin-approval')
      ? true
      : undefined,
    unmet.join(','),
  )
  if (unmet.includes('iam-registration')) {
    const attributes = (await release(owner, candidate)).config.production.auth.attributes
    await registerActive(admin, attributes)
    console.log(
      `  RECOVERY: the registration recorded active with [${attributes.join(', ')}]`,
    )
    r = await readiness(owner)
  }
  if (r.items.some((i) => i.id === 'admin-approval' && i.state !== 'met')) {
    const read = unwrap(await preview(admin, candidate), 'createApprovalPreview')
    unwrap(
      await approve(clientFor('MANIFEST_ADMIN_SESSION_STEPPED'), candidate, read.id),
      'approveRelease',
    )
    ;(state.approvals ??= []).push(
      `recovery: release ${candidate}, approved naming preview ${read.id}`,
    )
    console.log(`  RECOVERY: the candidate approved, naming preview ${read.id}`)
  }
  checks.must(
    'after the recovery the checklist is ready',
    (await readiness(owner)).ready ? true : undefined,
  )
  await deployProduction(clientFor('MANIFEST_SESSION_STEPPED'), candidate)
  console.log(`  RECOVERY: the candidate ${candidate} deployed to production`)
}

// ─── leg A ──────────────────────────────────────────────────────────────────────────────

/** Step 2, first half: the sensitive commit, validated, built, released and staged. */
async function stageA(): Promise<void> {
  checks.step(
    '2. LEG A — a sensitive change: sn removed, and an egress host unique to this run',
  )
  const owner = clientFor('MANIFEST_SESSION')
  const host = env('MANIFEST_RUN_HOST')
  const commit = env('MANIFEST_COMMIT')
  const validation = await validate(owner, commit)
  // Against the previous VALIDATED spec, which is not always the baseline: a run that stopped
  // after validating leg A leaves a spec without sn, and then only the host differs.
  checks.ok(
    'validation says the change is sensitive, egress.allow among it',
    validation.sensitiveDiff.sensitive &&
      validation.sensitiveDiff.fields.includes('egress.allow') &&
      validation.sensitiveDiff.fields.every(
        (f) => f === 'egress.allow' || f === 'auth.attributes',
      ),
    validation.sensitiveDiff.fields.join(','),
  )
  const made = await releaseAndStage(
    owner,
    await build(owner, commit),
    `P6b leg A — ${host}`,
  )
  state.releaseA = made.id
  state.digestA = made.imageDigest
  checks.ok(
    `the release freezes what the commit says: [${FOUR.join(', ')}] and [${host}]`,
    sorted(made.config.production.auth.attributes) === sorted(FOUR) &&
      sorted(made.config.production.egressAllow) === host,
    `${made.config.production.auth.attributes.join(',')} / ${made.config.production.egressAllow.join(',')}`,
  )
  // THE EXPECTED FIELDS, DERIVED from what the baseline declares — never from the platform's
  // own sensitive-field rule, which is what step 2 is testing.
  const baseline = checks.must(
    'there is an approved release to compare with',
    await lastApproved(owner, made.id),
  )
  const was = (await release(owner, baseline)).config.production
  state.baselineA = baseline
  state.expectedFieldsA = [
    ...(sorted(was.auth.attributes) === sorted(FOUR) ? [] : ['auth.attributes']),
    ...(sorted(was.egressAllow) === host ? [] : ['egress.allow']),
  ]
  console.log(
    `  baseline ${baseline} declares [${was.auth.attributes.join(', ')}] and [${was.egressAllow.join(', ')}] — expecting [${state.expectedFieldsA.join(', ')}]`,
  )
}

/** Step 2's refusal, then step 3 up to the administrator's step-up. */
async function gateA(): Promise<void> {
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const admin = clientFor('MANIFEST_ADMIN_SESSION')
  await reescalated(owner, state.releaseA!, state.expectedFieldsA!)
  const pub = await probe('127.0.0.3', '/healthz')
  checks.ok(
    'and production still serves the instance it served before',
    pub.instance === state.instanceBefore,
    `${pub.status} ${pub.instance} vs ${state.instanceBefore}`,
  )

  checks.step('3. The administrator reads a STORED preview, and then decides')
  const read = await readPreview(
    admin,
    state.releaseA!,
    state.expectedFieldsA!,
    state.baselineA!,
  )
  state.previewA = JSON.stringify(read)
  // P6a's F7 lesson, end to end (Task 8): the checklist's code-review item reads the newest
  // verdict — now the preview's — and with no reviewer configured it is honestly not built.
  const review = (await readiness(owner)).items.find((i) => i.id === 'code-review')
  console.log(`  code-review: ${review?.state} — ${review?.why}`)
  checks.ok(
    'the checklist’s code-review item is still not built, and does not block (D33)',
    review?.state === 'not_built' && review.blocking === false,
    JSON.stringify(review),
  )
  const unstepped = await approve(admin, state.releaseA!, read.id)
  checks.ok(
    'approving it on an ordinary session is refused 403 STEP_UP_REQUIRED (§20)',
    refusal(unstepped, 403, 'STEP_UP_REQUIRED') !== undefined,
    describe(unstepped),
  )
  const none = await admin.GET('/v1/releases/{releaseId}/approval', {
    params: { path: { releaseId: state.releaseA! } },
  })
  checks.ok(
    'and nothing was recorded — 404 NOT_FOUND',
    refusal(none, 404, 'NOT_FOUND') !== undefined,
    describe(none),
  )
}

/** Step 3 after the step-up, and step 4's production deploy. */
async function approveA(): Promise<void> {
  const admin = clientFor('MANIFEST_ADMIN_SESSION_STEPPED')
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const read = JSON.parse(state.previewA!) as Schemas['ApprovalPreview']
  // After the step-up, because §20 answers before the preview check: an unstepped
  // administrator naming no preview is refused STEP_UP_REQUIRED, not this.
  const unnamed = await approve(admin, state.releaseA!)
  checks.ok(
    'stepped up, an approval naming NO preview is refused 400 APPROVAL_PREVIEW_REQUIRED',
    refusal(unnamed, 400, 'APPROVAL_PREVIEW_REQUIRED') !== undefined,
    describe(unnamed),
  )
  // The console's round trip, headless: the step-up returns to the SAME preview (Task 10).
  const again = unwrap(
    await admin.GET('/v1/releases/{releaseId}/approval-previews/{previewId}', {
      params: { path: { releaseId: state.releaseA!, previewId: read.id } },
    }),
    'getApprovalPreview',
  )
  checks.ok(
    'the same preview, read again after the step-up, is identical — the same words',
    JSON.stringify(again) === JSON.stringify(read),
  )
  await approveNaming(admin, state.releaseA!, read, 'leg A')

  checks.step('4. The owner deploys it — and production’s proxy follows the release')
  const instance = await deployProduction(owner, state.releaseA!)
  state.instanceA = instance.id
  await servesOnlyPublicly(instance.id, 'leg A’s instance')
}

/** Step 4's last check: production runs exactly what staging ran (Decision 8). */
async function notStaged(): Promise<void> {
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  // Here and not in leg A: RELEASE_NOT_STAGED is decided only once the checklist is READY for
  // the candidate, and during leg A the candidate was re-escalated.
  const attempt = await askProduction(owner, state.releaseBefore!)
  checks.ok(
    `asking for the release production ran before leg A is refused 409 RELEASE_NOT_STAGED`,
    refusal(attempt, 409, 'RELEASE_NOT_STAGED') !== undefined,
    describe(attempt),
  )
  const pub = await probe('127.0.0.3', '/healthz')
  checks.ok(
    'and production still serves leg A',
    pub.instance === state.instanceA,
    `${pub.instance} vs ${state.instanceA}`,
  )
}

// ─── leg B ──────────────────────────────────────────────────────────────────────────────

/** Step 5, first half: a code-only change — a NEW digest (P6a F3), nothing sensitive. */
async function stageB(): Promise<void> {
  checks.step('5. LEG B — a code-only change, self-serve')
  const owner = clientFor('MANIFEST_SESSION')
  const commit = env('MANIFEST_COMMIT')
  const validation = await validate(owner, commit)
  checks.ok(
    'validation says nothing sensitive changed',
    !validation.sensitiveDiff.sensitive && validation.sensitiveDiff.fields.length === 0,
    validation.sensitiveDiff.fields.join(','),
  )
  const made = await releaseAndStage(
    owner,
    await build(owner, commit),
    'P6b leg B — code only',
  )
  state.releaseB = made.id
  checks.ok(
    'a new digest — the builder is reproducible, so it took a commit',
    made.imageDigest !== state.digestA,
    made.imageDigest,
  )
  const r = await readiness(owner)
  console.log(
    `  checklist: launched ${r.launched}, ready ${r.ready}, sensitive [${r.sensitiveFields.join(', ')}], baseline ${r.baselineReleaseId}`,
  )
  checks.ok(
    'the candidate is leg B',
    r.candidateReleaseId === made.id,
    `${r.candidateReleaseId}`,
  )
  checks.ok(
    'launched, READY, and nothing sensitive — so no administrator',
    r.launched && r.ready && r.sensitiveFields.length === 0 && !r.reescalated,
  )
  checks.ok(
    'compared with leg A, the last approved release',
    r.baselineReleaseId === state.releaseA,
    `${r.baselineReleaseId} vs ${state.releaseA}`,
  )
}

interface LoopRecord {
  cls: string
  instance: string | null
}

/**
 * Step 5, second half: the self-serve deploy under `scripts/lib/redeploy-loop.mjs` on the
 * PUBLIC listener — the loop P4c measured and Task 1's `[M14]` re-measured. It classifies by
 * BODY and names the instance by header, because the status is never evidence (the public
 * listener's wildcard answers an EMPTY 200, which the loop reads as `status-200`: F11).
 */
async function deployB(): Promise<void> {
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const loop = env('MANIFEST_LOOP_SCRIPT')
  const work = env('MANIFEST_WORK')
  const out = `${work}/leg-b-loop.ndjson`
  const stop = `${work}/leg-b-loop.stop`
  writeFileSync(out, '')
  const child = spawn(
    process.execPath,
    [loop, `https://${PRODUCTION_HOST}/healthz`, out, '100', stop],
    { stdio: 'inherit' },
  )
  const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()))
  const lines = () =>
    readFileSync(out, 'utf8')
      .split('\n')
      .filter((l) => l !== '')
  const deadline = Date.now() + 10_000
  while (lines().length < 10 && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 200))

  let instanceB: string | undefined
  try {
    const instance = await deployProduction(owner, state.releaseB!)
    instanceB = instance.id
    state.instanceB = instance.id
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  } finally {
    writeFileSync(stop, '')
    await exited
  }
  const records = lines().map((l) => JSON.parse(l) as LoopRecord)
  const counts = new Map<string, number>()
  for (const r of records) counts.set(r.cls, (counts.get(r.cls) ?? 0) + 1)
  const runs: string[] = []
  for (const r of records)
    if (r.instance !== null && runs[runs.length - 1] !== r.instance) runs.push(r.instance)
  console.log(
    `  the loop: ${[...counts].map(([c, n]) => `${n} ${c}`).join(', ')}; instances ${runs.map((i) => i.slice(0, 8)).join(' → ')}`,
  )
  checks.ok(
    'every answer was the app (at most one reset, §11’s reload) — a self-serve redeploy interrupts nobody',
    records.length > 0 &&
      records.every((r) => r.cls === 'app' || r.cls === 'reset') &&
      (counts.get('reset') ?? 0) <= 1,
    [...counts].map(([c, n]) => `${n} ${c}`).join(', '),
  )
  checks.ok(
    'and the instance changed exactly once, from leg A’s to leg B’s',
    runs.length === 2 && runs[0] === state.instanceA && runs[1] === instanceB,
    runs.join(' → '),
  )
  const none = await owner.GET('/v1/releases/{releaseId}/approval', {
    params: { path: { releaseId: state.releaseB! } },
  })
  checks.ok(
    'no administrator was involved — leg B has no approval (404 NOT_FOUND)',
    refusal(none, 404, 'NOT_FOUND') !== undefined,
    describe(none),
  )
  await servesOnlyPublicly(instanceB!, 'leg B’s instance')
}

// ─── leg C ──────────────────────────────────────────────────────────────────────────────

/** Step 6, first: UBC IAM registered the narrower set, and an administrator records it. */
async function recordC(): Promise<void> {
  checks.step('6. LEG C — the IAM change request (§9)')
  const admin = clientFor('MANIFEST_ADMIN_SESSION')
  const registration = await registerActive(admin, FOUR)
  checks.ok(
    `UBC registered the narrower set: active, [${FOUR.join(', ')}]`,
    registration.state === 'active' &&
      sorted(registration.registeredAttributes) === sorted(FOUR) &&
      registration.requestedAttributes === null,
    JSON.stringify(registration),
  )
}

/** Step 6: sn added back fails at the BUILD until UBC registers it; a change request is not enough. */
async function buildC(): Promise<void> {
  const owner = clientFor('MANIFEST_SESSION')
  const admin = clientFor('MANIFEST_ADMIN_SESSION')
  const commit = env('MANIFEST_COMMIT')
  const validation = await validate(owner, commit)
  checks.ok(
    'validation says auth.attributes changed, and nothing else',
    sorted(validation.sensitiveDiff.fields) === 'auth.attributes',
    validation.sensitiveDiff.fields.join(','),
  )
  const first = await build(owner, commit)
  console.log(`  ${first.error ?? '(no error)'}`.slice(0, 500))
  checks.ok(
    'the build FAILS, naming sn and telling the owner to raise a change request',
    first.status === 'failed' &&
      (first.error ?? '').includes(': sn.') &&
      (first.error ?? '').includes('Raise an IAM change request'),
    `${first.status}: ${first.error}`,
  )

  const { attempt, record } = await iamRecorder(admin)
  // [M9]'S EXACT REQUEST FIRST (Task 7): the change request typed in as the REGISTERED set, which
  // is what an administrator filing one naturally writes — and what §7's build-time check reads.
  // Refused, so the registration cannot claim what UBC has not registered. Without this line the
  // registered-set rule has no witness here: the request below repeats the registered four, which
  // the rule allows either way (control (d)).
  const m9 = await attempt('change_requested', FIVE, FIVE)
  checks.ok(
    '[M9]’s request — the change request written as what UBC REGISTERED — is refused 400 LAUNCH_RECORD_INVALID',
    refusal(m9, 400, 'LAUNCH_RECORD_INVALID') !== undefined,
    describe(m9),
  )
  const requested = await record('change_requested', FOUR, FIVE)
  checks.ok(
    'the change request is on file: change_requested, asking for the five, registered still the four',
    requested.state === 'change_requested' &&
      sorted(requested.requestedAttributes ?? []) === sorted(FIVE) &&
      sorted(requested.registeredAttributes) === sorted(FOUR),
    JSON.stringify(requested),
  )
  const second = await build(owner, commit)
  console.log(`  ${second.error ?? '(no error)'}`.slice(0, 500))
  checks.ok(
    'the build STILL fails — a change request is not a registration — and says one is on file',
    second.status === 'failed' &&
      (second.error ?? '').includes(': sn.') &&
      (second.error ?? '').includes("A change request is on file ('change_requested'"),
    `${second.status}: ${second.error}`,
  )

  await record('submitted', FOUR)
  await record('active', FIVE)
  const now = unwrap(
    await admin.GET('/v1/projects/{projectId}/launch-records', {
      params: { path: { projectId: state.projectId! } },
    }),
    'getLaunchRecords',
  ).iamRegistration
  console.log(
    `  registration: ${now?.state}, registered [${now?.registeredAttributes.join(', ')}], requested ${JSON.stringify(now?.requestedAttributes)}`,
  )
  checks.ok(
    'UBC registered it: active, registered = the five, nothing requested',
    now?.state === 'active' &&
      sorted(now.registeredAttributes) === sorted(FIVE) &&
      now.requestedAttributes === null,
    JSON.stringify(now),
  )
  const third = await build(owner, commit)
  const made = await releaseAndStage(
    owner,
    third,
    'P6b leg C — sn, registered by UBC IAM',
  )
  state.releaseC = made.id
}

/** Step 6's re-escalation, the approval and the deploy; then step 7, where things stand. */
async function gateC(): Promise<void> {
  const owner = clientFor('MANIFEST_SESSION_STEPPED')
  const admin = clientFor('MANIFEST_ADMIN_SESSION_STEPPED')
  await reescalated(owner, state.releaseC!, ['auth.attributes'])
  const read = await readPreview(
    admin,
    state.releaseC!,
    ['auth.attributes'],
    state.releaseA!,
  )
  await approveNaming(admin, state.releaseC!, read, 'leg C')
  const instance = await deployProduction(owner, state.releaseC!)
  state.instanceC = instance.id
  await servesOnlyPublicly(instance.id, 'leg C’s instance')

  checks.step('7. Where launch-app stands')
  const project = unwrap(
    await owner.GET('/v1/projects/{projectId}', {
      params: { path: { projectId: state.projectId! } },
    }),
    'getProject',
  )
  const registration = unwrap(
    await owner.GET('/v1/projects/{projectId}/launch-records', {
      params: { path: { projectId: state.projectId! } },
    }),
    'getLaunchRecords',
  ).iamRegistration
  console.log(`  launch-app launched on ${project.launchedAt}`)
  console.log(`  the approvals this run recorded:`)
  for (const line of state.approvals ?? []) console.log(`    ${line}`)
  console.log(
    `  the IAM registration: ${registration?.state}, registered [${registration?.registeredAttributes.join(', ')}]`,
  )
  console.log(
    `  production serves leg C (${state.releaseC}), instance ${state.instanceC}`,
  )
}

const phases: Record<Phase, (() => Promise<void>)[]> = {
  status: [status],
  setup: [step1Setup],
  stageA: [stageA],
  gateA: [gateA],
  approveA: [approveA],
  notStaged: [notStaged],
  stageB: [stageB],
  deployB: [deployB],
  recordC: [recordC],
  buildC: [buildC],
  gateC: [gateC],
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
