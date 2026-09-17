import { createHash } from 'node:crypto'
import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  subscribe,
  unwrap,
  type StreamFrame,
} from '@manifest/contract'
import { Checks, JourneyStop } from './check.js'
import { readState, writeState, type JourneyState } from './state.js'

/**
 * §22's journey, through the edge, by nothing but the generated client (P5a's acceptance).
 *
 *   node packages/journey/dist/main.js <before-app|after-app> <state.json>
 *
 * Reads MANIFEST_ORIGIN (default the console's) and MANIFEST_SESSION — the instructor's
 * session, which `scripts/demo-journey.sh` obtained through the one CWL flow. Each P5a task
 * that adds a route adds the step that calls it.
 */
const [phase, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
const session = process.env.MANIFEST_SESSION
if (
  (phase !== 'before-app' && phase !== 'after-app') ||
  statePath === undefined ||
  session === undefined
) {
  console.error('usage: MANIFEST_SESSION=… main.js <before-app|after-app> <state.json>')
  process.exit(2)
}

// Narrowed by the guard above; a function below would see `string | undefined` again.
const signedIn = { origin, session }
const client = createManifestClient(signedIn)
const checks = new Checks()
const state: JourneyState = readState(statePath)

/** §22 step 1 — the sign-in happened in bash; this proves the session is the instructor's. */
async function step1SignedIn(): Promise<void> {
  checks.step('1. Signed in with CWL, through the edge')
  const me = unwrap(await client.GET('/v1/me'), 'getMe')
  checks.ok('GET /v1/me is the instructor', me.puid === 'ins000001', JSON.stringify(me))
  checks.ok(
    'and carries exactly the fields the contract names',
    Object.keys(me).sort().join(',') === 'displayName,email,id,puid,role',
    Object.keys(me).join(','),
  )
}

/** §22 step 2, the half before creating: what the instructor already has. */
async function step2MyProjects(): Promise<void> {
  checks.step('2. My projects')
  const mine = unwrap(await client.GET('/v1/projects'), 'listProjects')
  checks.ok('GET /v1/projects answers a list', Array.isArray(mine))
  // The RUNNING system's answer, not the types: a column the representation stopped
  // stripping would reach here while tsc stayed green.
  const internals = mine.flatMap((p) =>
    ['quota', 'ownerId', 'visibility', 'blueprintRef'].filter((k) => k in p),
  )
  checks.ok(
    'no project carries a database-only field',
    internals.length === 0,
    internals.join(','),
  )
  const journeyApp = mine.find((p) => p.slug === 'journey-app')
  if (journeyApp !== undefined) state.projectId = journeyApp.id
}

/** §23: the name is checked while it is typed, with the answer creation will give. */
async function step2aCheckTheName(): Promise<void> {
  checks.step('2a. The project’s name, checked while it is typed (§23)')
  const check = async (slug: string) =>
    unwrap(
      await client.GET('/v1/slugs/{slug}', { params: { path: { slug } } }),
      'checkSlug',
    )
  const platform = await check('console')
  checks.ok(
    'console is reserved for the platform',
    platform.available === false && platform.reasons?.[0]?.code === 'SLUG_RESERVED',
    JSON.stringify(platform),
  )
  const unit = await check('chem')
  checks.ok(
    'chem says it is Chemistry',
    unit.reasons?.[0]?.message.includes('Chemistry') === true,
    JSON.stringify(unit),
  )
  const invalid = await check('Journey_App')
  checks.ok(
    'Journey_App is SLUG_INVALID',
    invalid.reasons?.[0]?.code === 'SLUG_INVALID',
    JSON.stringify(invalid),
  )
  const ours = await check('journey-app')
  checks.ok(
    'journey-app is free — or already ours from an earlier run',
    ours.available ||
      (state.projectId !== undefined && ours.reasons?.[0]?.code === 'SLUG_TAKEN'),
    JSON.stringify(ours),
  )
}

/** §22 step 2: choose a blueprint and a starter (§25), and read what an agent would (D25). */
async function step2bChooseABlueprint(): Promise<void> {
  checks.step('2b. A blueprint and a starter, from the catalogue')
  const catalogue = unwrap(await client.GET('/v1/blueprints'), 'listBlueprints')
  const ntm = checks.must(
    'node-ts-mongo@1 is in the catalogue',
    catalogue.find((b) => b.ref === 'node-ts-mongo@1'),
    JSON.stringify(catalogue.map((b) => b.ref)),
  )
  checks.ok(
    'it offers the proof-app starter',
    ntm.starters.some((s) => s.name === 'proof-app'),
    JSON.stringify(ntm.starters),
  )
  // The RUNNING system's answer again: a descriptor field the representation stopped
  // stripping — the base image's digest above all — would reach here with tsc green.
  checks.ok(
    'no blueprint carries a build internal',
    !JSON.stringify(catalogue).includes('@sha256:') &&
      catalogue.every((b) => !('baseImage' in b) && !('runAsUid' in b)),
    JSON.stringify(ntm),
  )
  const pack = unwrap(
    await client.GET('/v1/blueprints/{blueprintRef}/knowledge-pack', {
      params: { path: { blueprintRef: 'node-ts-mongo@1' } },
    }),
    'getKnowledgePack',
  )
  const agents = pack.files.find((f) => f.path === 'AGENTS.md')
  checks.ok(
    'its knowledge pack teaches manifest.yaml',
    agents?.content.includes('manifest.yaml') === true,
    JSON.stringify(pack.files.map((f) => f.path)),
  )
  checks.ok(
    'and each file’s sha256 is the digest of what arrived',
    pack.files.length > 0 &&
      pack.files.every(
        (f) => createHash('sha256').update(f.content).digest('hex') === f.sha256,
      ),
  )
}

/** §22 steps 2–3: name, blueprint, starter, and who it is for (§24). Re-runnable: reuses journey-app. */
async function step2Create(): Promise<void> {
  checks.step(
    '2. Create a project — journey-app, from the proof-app starter, for a class',
  )
  if (state.projectId === undefined) {
    const created = unwrap(
      await client.POST('/v1/projects', {
        params: { header: { 'Idempotency-Key': idempotencyKey() } },
        body: {
          slug: 'journey-app',
          blueprint: 'node-ts-mongo@1',
          starter: 'proof-app',
          audience: {
            scale: 'class',
            burst: 'synchronised',
            justification: 'P5a’s acceptance journey',
          },
        },
      }),
      'createProject',
    )
    state.projectId = created.id
    checks.ok('created with the proof-app starter', created.starter === 'proof-app')
    checks.ok(
      'for a class that arrives at once',
      created.audience?.scale === 'class' && created.audience.burst === 'synchronised',
      JSON.stringify(created.audience),
    )
    checks.ok(
      'its seeded manifest.yaml is valid',
      created.spec.valid,
      JSON.stringify(created.spec.errors),
    )
  } else {
    console.log('  (journey-app exists from an earlier run — reused)')
  }
  const project = unwrap(
    await client.GET('/v1/projects/{projectId}', {
      params: { path: { projectId: state.projectId }, query: { expand: 'environments' } },
    }),
    'getProject',
  )
  state.projectSlug = project.slug
  checks.ok(
    'it reads back with its starter and its audience',
    project.starter === 'proof-app' && project.audience?.scale === 'class',
    JSON.stringify({ starter: project.starter, audience: project.audience }),
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
  checks.ok(
    'staging is journey-app.staging.manifest.internal',
    staging.hostname === 'journey-app.staging.manifest.internal',
    staging.hostname,
  )
}

/** `x-manifest-websocket.replay` in the document: how many events a new connection is sent. */
const REPLAY = 50

/**
 * §22 step 3: watch provisioning — REPLAYED, because creation finished before anyone could
 * subscribe (§14 carries provisioning since P5a's spec actions). Through the edge, with the
 * session and the console's Origin on the upgrade (§20).
 */
async function step3WatchProvisioning(): Promise<void> {
  checks.step('3. Watch provisioning on the project’s stream')
  const projectId = checks.must('a project to watch', state.projectId)
  const frames: StreamFrame[] = []
  const stream = subscribe({
    ...signedIn,
    projectId,
    onFrame: (frame) => frames.push(frame),
  })
  try {
    await stream.ready
  } catch (error) {
    checks.ok('the stream became ready', false, (error as Error).message)
    return
  }
  // What had arrived when the ready frame did: the replay, and the ready frame last.
  const replay = [...frames]
  stream.close()
  checks.ok(
    'the replay ended with the ready frame',
    replay.at(-1)?.kind === 'control',
    JSON.stringify(replay.at(-1)),
  )
  const events = replay.flatMap((f) => (f.kind === 'event' ? [f] : []))
  checks.ok(
    'every replayed event is this project’s',
    events.every((f) => f.projectId === projectId),
  )
  const types = events.map((f) => f.type)
  if (!types.includes('project.created') && events.length >= REPLAY) {
    // A project built and deployed many times has pushed creation out of the newest 50;
    // step 2 has already read it back through GET /v1/projects/{projectId}.
    console.log(
      `  (creation is older than the replay's ${REPLAY} newest events — step 2 read the project back instead)`,
    )
    return
  }
  const created = types.indexOf('project.created')
  const seeded = types.indexOf('repository.seeded')
  const validated = events.find((f) => f.type === 'spec.validated')
  checks.ok(
    'the replay carries project.created, repository.seeded and spec.validated, in order',
    created >= 0 && seeded > created && types.indexOf('spec.validated') > seeded,
    types.join(', '),
  )
  // Narrowed by `type` with no cast: the generated EventFrame is a union of one object type
  // per event type, so `machineDetail` is spec.validated's own shape here.
  checks.ok(
    'the manifest was valid when it was seeded, and says at which commit',
    validated?.type === 'spec.validated' &&
      validated.machineDetail.valid &&
      validated.machineDetail.errorCount === 0 &&
      /^[0-9a-f]{40}$/.test(validated.machineDetail.commitSha),
    JSON.stringify(validated?.machineDetail),
  )
  const creation = events.find((f) => f.type === 'project.created')
  checks.ok(
    'and creation says what it was made from, and for whom',
    creation?.type === 'project.created' &&
      creation.machineDetail.slug === 'journey-app' &&
      creation.machineDetail.starter === 'proof-app' &&
      creation.machineDetail.audience.scale === 'class',
    JSON.stringify(creation?.machineDetail),
  )
}

const phases: Record<'before-app' | 'after-app', (() => Promise<void>)[]> = {
  'before-app': [
    step1SignedIn,
    step2MyProjects,
    step2aCheckTheName,
    step2bChooseABlueprint,
    step2Create,
    step3WatchProvisioning,
  ],
  'after-app': [],
}

try {
  for (const step of phases[phase]) await step()
} catch (error) {
  if (error instanceof ManifestApiError)
    checks.ok(`no call refused (${error.operation})`, false, error.message)
  else if (!(error instanceof JourneyStop)) {
    // `fetch failed` says nothing on its own; the reason is its cause's code — for this
    // origin most often UNABLE_TO_GET_ISSUER_CERT_LOCALLY, a Node process started without
    // NODE_EXTRA_CA_CERTS (P5a sitting 2).
    const cause = (error as { cause?: { code?: unknown } }).cause?.code
    checks.ok(
      'no step threw',
      false,
      `${cause === undefined ? '' : `[cause ${String(cause)}] `}${(error as Error).stack ?? String(error)}`,
    )
  }
} finally {
  writeState(statePath, state)
}
checks.finish()
