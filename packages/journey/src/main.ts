import { createManifestClient, ManifestApiError, unwrap } from '@manifest/contract'
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

const client = createManifestClient({ origin, session })
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

const phases: Record<'before-app' | 'after-app', (() => Promise<void>)[]> = {
  'before-app': [step1SignedIn, step2MyProjects, step2aCheckTheName],
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
