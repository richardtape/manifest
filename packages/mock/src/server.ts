import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import * as f from './fixtures.js'
import { READY, REPLAY, scripted, SCAN_SILENCE_MS } from './script.js'
import { createValidator, type Validate } from './validate.js'
import { MockRefusal } from './refusal.js'
import {
  approvalOf,
  draftAssessment,
  draftRegistration,
  launchReadiness,
  launchRecords,
  queueOf,
  rehearsalOf,
  requestApproval,
  submitAssessment,
  submitRegistration,
  type ApprovalState,
  type LaunchOptions,
  type RecordsStage,
  type SubmitBody,
} from './launch.js'

export { MockRefusal }

/**
 * manifest-mock (§5, §16, §21): the published contract served from fixtures, so a front-end
 * developer needs ONE PROCESS rather than nine containers plus a language model — §21's
 * *"front-end developers are not required to run the platform"*.
 *
 * THE ROUTING TABLE IS KEYED BY `operationId` AND ITS PATHS COME FROM THE DOCUMENT ITSELF.
 * `openapi.json`'s path templates are turned into regexes at startup rather than written out
 * here by hand, so the mock's idea of where an operation lives cannot drift from the
 * contract's — a whole class of "the mock answers 404 and the platform answers 200" that
 * hand-written patterns invite. `server.test.ts` asserts the other direction: every
 * operation the document declares has an entry in `ANSWERS` OR a success `example` in the
 * document itself, which it is then answered with (the authoring API plan's Decision 15).
 *
 * AN OPERATION WITH NEITHER ANSWERS `501`, DELIBERATELY (Task 2's stub, kept), and a path
 * the document does not declare answers `404 ROUTE_NOT_FOUND` exactly as the platform does.
 * The two are different facts and the mock says which: a mock that answers a plausible
 * `200` to everything is the stand-in that produces a real-looking failure (P4c finding 74).
 *
 * WHO IT TRUSTS (FE-26, the front-end enablement plan's sitting 10): ONLY THE SESSION IT ISSUED —
 * `manifest_session=mock-session`, which its own `/auth/login` sets — and any Bearer. A session
 * of any other value, empty included, is `401 UNAUTHENTICATED`, as the platform answers a session
 * it never signed; a Bearer on an operation whose `security` names the session alone is `403
 * TOKEN_CREDENTIAL_REFUSED`, read from the document per operation. **Any Bearer is accepted** on
 * the rest, deliberately (the guides' examples send one the mock never minted): the mock has no
 * token store, and its one mint answers one fixed secret.
 *
 * WHAT IT HOLDS (FE-27): the fixtures' ids. An operation whose path names a project, environment,
 * instance, release, build, pending action, agent or intake session, token, preview or blueprint
 * the mock does not hold answers `404 NOT_FOUND`, naming the mock, before any answer is built —
 * `HELD` below. It KEEPS NO STATE (P5c Decision 9): a rename, an archive or a delete is answered
 * as the platform would answer it, and the next read answers the fixtures again.
 *
 * WHAT IT DOES NOT ENFORCE UNLESS ASKED: the STEP-UP — an archive, a delete or an approval is
 * answered here without a second sign-in; since the launch path plan's Task 13, `MANIFEST_MOCK_STEP_UP=1`
 * (FE-40 (2)) refuses a production deploy and a production secret `403 STEP_UP_REQUIRED` until
 * `/auth/step-up` has been visited. And NEVER the CSRF origin check: A browser pointed at the
 * mock through Vite's proxy sends `Origin: http://127.0.0.1:7104`, and the platform wants
 * the console's origin — so enforcing it here would refuse every mutation the mock exists to
 * let a developer make. It is stated in RUNBOOK as a limit rather than hidden.
 */

const SESSION_COOKIE = 'manifest_session'
/** The mock's own mark of a step-up (FE-40 (2)): not the platform's, which lives in its session. */
const STEP_UP_COOKIE = 'manifest_mock_stepped_up'
/** The one session value the mock issues, and so the one it trusts (FE-26). */
export const ISSUED_SESSION = 'mock-session'
const DOCUMENT = new URL('../../contract/openapi.json', import.meta.url)

export interface MockOptions {
  /** `MANIFEST_MOCK_ROLE=admin` is what makes §26's fleet reachable. */
  role?: 'admin' | 'member'
  /** `MANIFEST_MOCK_FAIL=1` plays the deploy's other ending. */
  fail?: boolean
  /**
   * THE STATES TASK 13 SCRIPTS (sitting 10), each a mock option like `fail` because the mock keeps
   * no state: `MANIFEST_MOCK_LAUNCHED=1` — `mock-app` has been to production, so a delete is `409
   * PROJECT_LAUNCHED_NOT_DELETABLE`; `MANIFEST_MOCK_AGENT_BUDGET=exhausted` — the month is spent, so
   * a session start is `409 AGENT_BUDGET_EXHAUSTED` — or `=unavailable`, the gateway not answering,
   * so every spend reads null with its reason and a start is `503 AI_BACKEND_UNAVAILABLE`;
   * `MANIFEST_MOCK_INTAKE=daily-limit` or `=budget-spent`
   * — describing a new app is paused, `409 INTAKE_DAILY_LIMIT_REACHED` or `INTAKE_BUDGET_EXHAUSTED`.
   */
  launched?: boolean
  /**
   * `MANIFEST_MOCK_CONFIDENTIAL=1` (the front-end enablement plan's Task 14a): `mock-app`'s data is
   * `confidential` and the platform lets its building agent use the capable model (§7, Spec action
   * 10) — so a token is refused staging's and production's Incidents, `403 INCIDENT_LOG_CONFIDENTIAL`,
   * and every agent session holds the on-premise models and `default-chat-large`.
   */
  confidential?: boolean
  agentBudget?: 'ok' | 'exhausted' | 'unavailable'
  intake?: 'open' | 'daily-limit' | 'budget-spent'
  /**
   * WHO MAY BUILD (FE-39): `true` by default — the instructor is faculty. `MANIFEST_MOCK_MAY_BUILD=0`
   * plays a person who may not: `getMe` answers `mayBuild: false`, `createProject` and
   * `startIntakeSession` are refused `403 BUILDING_NOT_OPEN`, and `addMember` is refused `409
   * MEMBER_MAY_NOT_BUILD` — the person named may not be added. An administrator always may build.
   */
  mayBuild?: boolean
  /**
   * WHERE `mock-app` STANDS IN UBC'S ORDER (the launch path plan's Task 13; `launch.ts`):
   * `MANIFEST_MOCK_RECORDS=none` — nothing recorded; `=drafted` — all three drafted, nothing sent;
   * `=assessed` — the assessment approved, both registrations drafted carrying its PIA number;
   * `=approved` — everything approved and registered, so the checklist is ready and a production
   * deploy answers production's own instance (FE-40 (1)). Unset, `sent`: the story every other
   * fixture tells — both registrations active, the assessment sent again and with the Privacy Office.
   * Each draft and send is answered as the platform answers it from that stage.
   */
  records?: RecordsStage
  /**
   * FE-40 (3): `MANIFEST_MOCK_APPROVAL=pending` — nobody has decided (`getApproval` `404`, the
   * checklist's `admin-approval` unmet, `requestApproval` answers an open request); `=rejected` — an
   * administrator rejected it, with a reason (`requestApproval` `409 RELEASE_REJECTED`). Unset,
   * `approved`, and a request is `409 APPROVAL_NOT_NEEDED`.
   */
  approval?: ApprovalState
  /** FE-40 (4): `MANIFEST_MOCK_REHEARSAL=failed` — the rehearsal did not pass, with its evidence. */
  rehearsal?: 'passed' | 'failed'
  /** FE-40 (2): `MANIFEST_MOCK_STEP_UP=1` — see *What it does not enforce unless asked*, above. */
  stepUp?: boolean
  /**
   * `MANIFEST_MOCK_QUEUE=full`: the administrators' queue holds one of each kind — the three beyond
   * what `mock-app`'s stage leaves with UBC are on projects this mock does not hold.
   */
  queue?: 'default' | 'full'
  /** §12's silent scan window; shortened by a test that must not wait ten seconds. */
  scanSilenceMs?: number
}

interface Context {
  params: Record<string, string>
  query: URLSearchParams
  body: unknown
  options: Required<MockOptions>
  /** True while the scripted build's §12 scan window has not yet elapsed (see `getBuild`). */
  buildIsRunning: boolean
  /** The operation's success example in the document, if it prints one (Decision 15). */
  example: Answer | undefined
  /** The document this mock serves from, as read — what `getOpenApiDocument` answers. */
  document: Document
  /** The moment of the request — every time counted from now is counted from this (FE-27). */
  now: number
  /** Which credential the request carried (FE-26). */
  credential: 'session' | 'token'
  /** The session visited `/auth/step-up` in the last ten minutes (FE-40 (2)). */
  steppedUp: boolean
}

interface Answer {
  status: number
  /** The document schema this body claims to be; `null` for a bodyless answer. */
  schema: string | null
  body: unknown
}

type Answerer = (ctx: Context) => Answer

/** `createProject` and `startIntakeSession`, as the platform refuses a person who may not build. */
function refuseUnlessMayBuild(ctx: Context): void {
  if (ctx.options.mayBuild || ctx.options.role === 'admin') return
  throw new MockRefusal(
    403,
    'BUILDING_NOT_OPEN',
    'building apps on Manifest is open only to faculty members for now',
    'Nothing was created. Manifest reads your CWL affiliation when you sign in, so if you are faculty, sign out and sign in again. If you still cannot build, ask a platform administrator.',
  )
}

const ok = (schema: string, body: unknown): Answer => ({ status: 200, schema, body })
const created = (schema: string, body: unknown): Answer => ({ status: 201, schema, body })

/**
 * THE IDS THE MOCK HOLDS, BY THE PATH PARAMETER THAT NAMES THEM (FE-27). Anything else is the
 * platform's `404 NOT_FOUND` — a front-end that asks for the wrong id learns it here, not first
 * against the platform. `userId` is not keyed: removing someone who is not a member is idempotent
 * and answers the list (P5b Task 8). `commitSha`, a file's path and a doc's slug are keyed by their
 * own answers below, in the platform's own codes.
 */
const HELD: Record<string, { what: string; ids: readonly string[] }> = {
  projectId: { what: 'project', ids: [f.PROJECT_ID] },
  environmentId: {
    what: 'environment',
    ids: [f.SANDBOX_ID, f.STAGING_ID, f.PRODUCTION_ID],
  },
  instanceId: {
    what: 'instance',
    ids: [f.INSTANCE_ID, f.SANDBOX_INSTANCE_ID, f.SANDBOX_FAILED_INSTANCE_ID],
  },
  releaseId: { what: 'release', ids: [f.RELEASE_ID] },
  buildId: { what: 'build', ids: [f.BUILD_ID] },
  tokenId: { what: 'token', ids: [f.TOKEN_ID] },
  pendingActionId: { what: 'pending action', ids: f.PENDING_ACTIONS.map((a) => a.id) },
  sessionId: {
    what: 'agent session',
    ids: [f.AGENT_SESSION_ID, f.ENDED_AGENT_SESSION_ID],
  },
  intakeSessionId: { what: 'intake session', ids: [f.INTAKE_SESSION_ID] },
  previewId: {
    what: 'approval preview',
    ids: [f.APPROVAL_PREVIEW_ID, f.WITHHELD_PREVIEW_ID, f.UNAVAILABLE_PREVIEW_ID],
  },
  blueprintRef: { what: 'blueprint', ids: f.BLUEPRINTS.map((b) => b.ref) },
}

function assertHeld(params: Record<string, string>): void {
  for (const [name, value] of Object.entries(params)) {
    const held = HELD[name]
    if (held !== undefined && !held.ids.includes(value))
      throw new MockRefusal(
        404,
        'NOT_FOUND',
        `manifest-mock holds no ${held.what} '${value}'`,
        `The mock answers only its fixtures' ids — ${held.ids.join(', ')}. Drive the platform for any other.`,
      )
  }
}

/** `mock-app` as asked: launched when `MANIFEST_MOCK_LAUNCHED=1` says so (Task 13). */
const projectOf = (ctx: Context): typeof f.PROJECT =>
  ctx.options.launched
    ? { ...f.PROJECT, launchedAt: '2026-09-18T12:00:00.000Z' }
    : f.PROJECT

const bodyOf = <T>(ctx: Context): Partial<T> => (ctx.body ?? {}) as Partial<T>

/**
 * P6b Task 9's RUNTIME RULE, played here because the document cannot state it: `previewId` is
 * optional in the request schema and REQUIRED by the operation (Decision 15). Without this a
 * console that never names a preview would look finished against the mock and be refused by
 * the platform — found by clicking the approvals screen in P6b sitting 6. Stateless like
 * everything here: any id is accepted, and the answer is the one fixture.
 */
function decisionNamingAPreview(ctx: Context): typeof f.APPROVAL {
  if ((ctx.body as { previewId?: unknown } | undefined)?.previewId === undefined)
    throw new MockRefusal(
      400,
      'APPROVAL_PREVIEW_REQUIRED',
      'an approval names the preview the administrator read',
      'POST /v1/releases/{releaseId}/approval-preview, read it, then decide naming its id.',
    )
  return f.APPROVAL
}

/**
 * The operation's own example, copied — for a scripted answer that KEYS the document's answer
 * rather than restating it. `FROM_EXAMPLE` names every caller, and `server.test.ts` holds each
 * one to having an example.
 */
function documentExample(ctx: Context): Answer {
  if (ctx.example === undefined)
    throw new MockRefusal(
      501,
      'INTERNAL',
      'manifest-mock answers this operation from the document’s example, and the document prints none',
    )
  return structuredClone(ctx.example)
}

/** Any launch option set — the opt-in states in which the mock plays a launch's gate (FE-40). */
const scriptsALaunch = (ctx: Context): boolean =>
  ctx.options.records !== 'sent' ||
  ctx.options.approval !== 'approved' ||
  ctx.options.rehearsal !== 'passed' ||
  ctx.options.stepUp

/** The launch path's options, as `launch.ts` reads them. */
const launchOf = (ctx: Context): LaunchOptions => ({
  records: ctx.options.records,
  approval: ctx.options.approval,
  rehearsal: ctx.options.rehearsal,
  queue: ctx.options.queue,
})

/**
 * FE-40 (2): A PRODUCTION DEPLOY OR SECRET WITHOUT A RECENT STEP-UP, when scripted — the platform's
 * `403 STEP_UP_REQUIRED`, whose hint names the route that steps up.
 */
function assertSteppedUp(ctx: Context, capability: string): void {
  // A SESSION'S ROUND TRIP ONLY (the whole-branch review's finding 11): a token can never step up, and
  // the platform answers it otherwise — a production deploy is a question for its person, a production
  // secret is a person's alone. The mock plays neither, so a token is not refused here.
  if (!ctx.options.stepUp || ctx.steppedUp || ctx.credential === 'token') return
  throw new MockRefusal(
    403,
    'STEP_UP_REQUIRED',
    `'${capability}' needs a second authentication round trip`,
    'Navigate the browser to /auth/step-up?returnTo=<the page you are on>, complete the CWL prompt, and make this request again.',
  )
}

/** The `environment` path parameter, as the platform's schema allows it. */
function environmentOf(ctx: Context): 'staging' | 'production' {
  const environment = ctx.params.environment
  if (environment === 'staging' || environment === 'production') return environment
  throw new MockRefusal(
    400,
    'REQUEST_INVALID',
    `environment must be 'staging' or 'production', not '${String(environment)}'`,
  )
}

/**
 * ONE ENTRY PER OPERATION IN THE DOCUMENT, in the document's own order, so a reader can diff
 * the two. Every value here is a fixture from `fixtures.ts` and every fixture is in
 * `FIXTURES`, so both ends of the claim are checked.
 */
const ANSWERS: Record<string, Answerer> = {
  listBlueprints: () => ok('BlueprintList', f.BLUEPRINTS),
  getBlueprint: () => ok('Blueprint', f.BLUEPRINT),
  getKnowledgePack: () => ok('KnowledgePack', f.KNOWLEDGE_PACK),
  // RUNNING UNTIL §12'S SCAN HAS FINISHED, WHICH IS THE POINT OF SCRIPTING THE SILENT
  // WINDOW AT ALL (P5c sitting 6, F12). The log reaches `DONE` about ten seconds before the
  // build row does, and a client that reads the LOG to decide a build is releasable gets a
  // `409 RELEASE_BUILD_NOT_DEPLOYABLE` from the real platform. A mock whose `getBuild`
  // answered `succeeded` throughout would never show a developer that window, so this
  // answer is driven by the same clock as the scripted stream.
  getBuild: (ctx) => ok('Build', ctx.buildIsRunning ? f.BUILD_RUNNING : f.BUILD),
  getBuildLog: (ctx) => {
    const tail = Number(ctx.query.get('tail') ?? '0')
    const lines = tail > 0 ? f.BUILD_LOG.lines.slice(-tail) : f.BUILD_LOG.lines
    return ok('BuildLog', { ...f.BUILD_LOG, lines })
  },
  getEnvironment: () => ok('Environment', f.STAGING),
  // A DEPLOY THAT NEVER BECOMES READY IS A `200` WHOSE STATE IS `failed` (P4b Task 13), so
  // the failing ending is a 200 here too. A client switching on the HTTP status must fail
  // against the mock exactly as it fails against the platform. KEYED ON THE ENVIRONMENT for the
  // sandbox since Task 13 (FE-27): a sandbox deploy answers the sandbox's instance, never
  // staging's. Production still answers staging's fixture — the mock scripts no launch.
  //
  // PRODUCTION (FE-40, the launch path plan's Task 13): step-up first when scripted, and production's
  // own instance once the checklist is ready (`MANIFEST_MOCK_RECORDS=approved`). Otherwise production
  // still answers staging's fixture — the default does not move (FE-40), and that is a known lie.
  deploy: (ctx) => {
    if (ctx.params.environmentId === f.SANDBOX_ID)
      return ok(
        'Instance',
        ctx.options.fail ? f.FAILED_SANDBOX_INSTANCE : f.SANDBOX_INSTANCE,
      )
    if (ctx.params.environmentId === f.PRODUCTION_ID) {
      assertSteppedUp(ctx, 'release:promote')
      const readiness = launchReadiness(launchOf(ctx), ctx.now)
      if (readiness.ready) return ok('Instance', f.PRODUCTION_INSTANCE)
      // NOT READY, WHILE A LAUNCH IS SCRIPTED (the whole-branch review's I3): the platform's gate — `409`
      // with the checklist — so a front-end's *"deploy refused, here is what is missing"* can be played.
      if (scriptsALaunch(ctx))
        throw new MockRefusal(
          409,
          'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
          'first production launch is a checklist, not a button',
          'These items have multi-week lead times and are tracked from project creation.',
          undefined,
          readiness,
        )
    }
    return ok('Instance', ctx.options.fail ? f.FAILED_INSTANCE : f.INSTANCE)
  },
  // EACH ENVIRONMENT'S OWN INSTANCES (FE-27), agreeing with `getProject`'s environments.
  listInstances: (ctx) =>
    ok('InstanceList', f.INSTANCE_LISTS[ctx.params.environmentId ?? '']),
  /**
   * THE SANDBOX INSTANCE'S LINES, AND EVERY OTHER INSTANCE REFUSED BY ITS OWN CODE (Task 13): the
   * failed one no longer runs (`409 INSTANCE_OUTPUT_UNAVAILABLE`, as the platform answers a failed
   * instance whose container is gone), and staging's is `403 INSTANCE_OUTPUT_STAGING` — FE-24's
   * code, the rule decided by the environment's kind. `lines` keeps the newest.
   */
  getInstanceOutput: (ctx) => {
    const id = ctx.params.instanceId
    if (id === f.INSTANCE_ID)
      throw new MockRefusal(
        403,
        'INSTANCE_OUTPUT_STAGING',
        'a staging instance’s output is not readable: staging serves real people; its Incident’s log tail is the only window onto it',
      )
    if (id !== f.SANDBOX_INSTANCE_ID)
      throw new MockRefusal(
        409,
        'INSTANCE_OUTPUT_UNAVAILABLE',
        `instance '${String(id)}' is not running — it never started, or it no longer runs — so there is no output to read; if it failed, its Incident has its last lines`,
      )
    const lines = Number(ctx.query.get('lines') ?? '200')
    return ok('InstanceOutput', {
      ...f.OUTPUT,
      readAt: new Date(ctx.now).toISOString(),
      lines: f.OUTPUT.lines.slice(-lines),
      truncated: { lines: f.OUTPUT.lines.length > lines, bytes: false },
    })
  },
  // KEYED ON THE PATH PARAMETER, because an Incident belongs to ONE environment. Answering
  // the same fixture for every id put a staging incident under `sandbox`, which reads as a
  // failed deploy of an environment that has never been deployed — measured in a browser
  // on 2026-09-19.
  //
  // AND, SCRIPTED CONFIDENTIAL (Task 14a), a token is refused staging's and production's — the
  // platform's rule and words, decided before anything is read; a session and the sandbox are answered.
  listIncidents: (ctx) => {
    const env = ctx.params.environmentId
    if (
      ctx.options.confidential &&
      ctx.credential === 'token' &&
      (env === f.STAGING_ID || env === f.PRODUCTION_ID)
    )
      throw new MockRefusal(
        403,
        'INCIDENT_LOG_CONFIDENTIAL',
        `the ${env === f.STAGING_ID ? 'staging' : 'production'} Incidents of a confidential project are not answered to a delegated token while its building agent may use the capable model; a person reads them in their own session`,
      )
    return ok(
      'IncidentList',
      env === f.STAGING_ID ? f.INCIDENTS : { environmentId: env ?? '', incidents: [] },
    )
  },
  // §26's fleet is administrators only, and a non-administrator is `403`, not `404`: there
  // is no tenant's resource to hide (P5a Task 16).
  listFleet: (ctx) => {
    if (ctx.options.role !== 'admin')
      throw new MockRefusal(
        403,
        'FORBIDDEN',
        'the fleet is for platform administrators',
        'Start the mock with MANIFEST_MOCK_ROLE=admin to see this screen.',
      )
    return ok('Fleet', f.FLEET)
  },
  getMe: (ctx) =>
    ok(
      'Me',
      ctx.options.role === 'admin'
        ? f.ADMIN_ME
        : { ...f.ME, mayBuild: ctx.options.mayBuild },
    ),
  // KEYED ON THE PATH PARAMETER: this route's one caller is the *Check* button on a
  // CONFIRMED row, and answering some other row's state to it would be the mock lying about
  // the one fact that button exists to fetch (P5c sitting 7, F2).
  getPendingAction: (ctx) =>
    ok(
      'PendingAction',
      // `HELD` has refused any id not in the list, so this always finds one (FE-27).
      f.PENDING_ACTIONS.find((a) => a.id === ctx.params.pendingActionId)!,
    ),
  confirmPendingAction: () => ok('PendingAction', f.CONFIRMED_ACTION),
  rejectPendingAction: () => ok('PendingAction', f.REJECTED_ACTION),
  listProjects: (ctx) => ok('ProjectList', [projectOf(ctx)]),
  createProject: (ctx) => {
    refuseUnlessMayBuild(ctx)
    return created('CreatedProject', f.CREATED_PROJECT)
  },
  getProject: (ctx) =>
    ok(
      'Project',
      ctx.query.get('expand') === 'environments'
        ? { ...projectOf(ctx), environments: f.ENVIRONMENTS }
        : projectOf(ctx),
    ),
  /**
   * §11 AND A NAME, ON THE ONE PROJECT (Task 13). A rename answers `mock-app` under the name ASKED
   * — the rename IS the request, so answering the fixture's name would show a person a rename that
   * did not take (the plan's `[S5]` (2)); an archive answers it `archived` now, a restore `active`
   * with the archive's time kept (the platform's answer); a delete its tombstone. **Nothing is
   * kept** (Decision 9): the next read answers the fixture again, and a real delete's `404` after
   * is the platform's to show. A LAUNCHED project (`MANIFEST_MOCK_LAUNCHED=1`) is refused a delete
   * in the platform's words.
   */
  updateProject: (ctx) =>
    ok('Project', {
      ...projectOf(ctx),
      name: bodyOf<{ name: string }>(ctx).name ?? f.PROJECT.name,
    }),
  archiveProject: (ctx) =>
    ok('Project', {
      ...projectOf(ctx),
      state: 'archived',
      archivedAt: new Date(ctx.now).toISOString(),
    }),
  restoreProject: (ctx) =>
    ok('Project', {
      ...projectOf(ctx),
      state: 'active',
      archivedAt: new Date(ctx.now - 60_000).toISOString(),
    }),
  deleteProject: (ctx) => {
    if (ctx.options.launched)
      throw new MockRefusal(
        409,
        'PROJECT_LAUNCHED_NOT_DELETABLE',
        `'${f.PROJECT.slug}' has been to production, so it cannot be deleted: its data is disposed of under its retention period and UBC's sunset procedure, and its production name stays held. Archive it to switch it off`,
      )
    return ok('DeletedProject', {
      id: f.PROJECT_ID,
      slug: f.PROJECT.slug,
      state: 'deleted',
      deletedAt: new Date(ctx.now).toISOString(),
    })
  },
  listBuilds: (ctx) => ok('BuildList', [ctx.buildIsRunning ? f.BUILD_RUNNING : f.BUILD]),
  // `202` WITH THE BUILD `running` (Rich's R6): the answer that arrived is not the answer.
  startBuild: () => ({ status: 202, schema: 'Build', body: f.BUILD_RUNNING }),
  listEnvironments: () => ok('EnvironmentList', f.ENVIRONMENTS),
  // The stream is an upgrade, handled below. A plain GET is what the platform answers 426
  // to, and the code is in the document.
  streamProjectEvents: () => {
    throw new MockRefusal(
      426,
      'EVENTS_UPGRADE_REQUIRED',
      'this route is a WebSocket',
      'Open it with a WebSocket client; @manifest/contract’s subscribe() does.',
    )
  },
  // THE CHECKLIST AND THE RECORDS AT THE SCRIPTED STAGE (the launch path plan's Task 13; `launch.ts`).
  getLaunchReadiness: (ctx) =>
    ok('LaunchReadiness', launchReadiness(launchOf(ctx), ctx.now)),
  getLaunchRecords: (ctx) => ok('LaunchRecords', launchRecords(launchOf(ctx), ctx.now)),
  // THE OWNER'S HALF (Tasks 9–11): each draft and *"I've sent it"* answered as the platform answers
  // it from the stage — the draft, or the refusal, in its words and its order of checks.
  draftIamRegistration: (ctx) =>
    ok('IamRegistration', draftRegistration(launchOf(ctx), environmentOf(ctx), ctx.now)),
  submitIamRegistration: (ctx) =>
    ok(
      'IamRegistration',
      submitRegistration(
        launchOf(ctx),
        environmentOf(ctx),
        bodyOf<SubmitBody>(ctx),
        ctx.now,
      ),
    ),
  draftPrivacyAssessment: (ctx) =>
    ok('PrivacyAssessment', draftAssessment(launchOf(ctx), ctx.now)),
  submitPrivacyAssessment: (ctx) =>
    ok(
      'PrivacyAssessment',
      submitAssessment(launchOf(ctx), bodyOf<SubmitBody>(ctx), ctx.now),
    ),
  // BOTH RECORD ROUTES ANSWER THE FIXTURE, NOT THE REQUEST. The mock does not keep state
  // (P5c Decision 9), and a record route that echoed the body back would let a console bug
  // that sends the wrong state look correct here and wrong against the platform.
  recordIamRegistration: () => ok('IamRegistration', f.IAM_REGISTRATION),
  recordPrivacyAssessment: () => ok('PrivacyAssessment', f.PRIVACY_ASSESSMENT),
  // D21's rehearsal (P6a Task 14): it ANSWERS the fixture immediately. The platform takes
  // up to ~90 s and deploys an application to do it; a mock that slept would teach a
  // front-end developer to build for a delay it cannot reproduce, and one that answered
  // `passed: false` would hide the state the screen is for. `script.ts` is where timing is
  // modelled, deliberately, and only for the stream.
  // FE-40 (4): `MANIFEST_MOCK_REHEARSAL=failed` answers one that did not pass — still a `200`.
  runRehearsal: (ctx) => ok('Rehearsal', rehearsalOf(launchOf(ctx))),
  listMembers: () => ok('MemberList', f.MEMBERS),
  addMember: (ctx) => {
    if (!ctx.options.mayBuild)
      throw new MockRefusal(
        409,
        'MEMBER_MAY_NOT_BUILD',
        `${f.REFUSED_MEMBER_NAME} cannot be added: building apps on Manifest is open only to faculty members for now`,
        'Add a faculty colleague instead. Nobody was added.',
      )
    return created('Member', f.MEMBER)
  },
  // Idempotent, and it answers the WHOLE list (P5b Task 8).
  removeMember: () => ok('MemberList', f.MEMBERS),
  listPendingActions: () => ok('PendingActionList', f.PENDING_ACTIONS),
  listReleases: () => ok('ReleaseList', f.RELEASES),
  createRelease: () => created('Release', f.RELEASE),
  getSpec: () => ok('Spec', f.SPEC),
  validateSpec: () => created('SpecValidation', f.SPEC_VALIDATION),
  listTokens: () => ok('TokenList', f.TOKENS),
  // The one answer in this API that carries a credential, and only ever once.
  mintToken: () => created('MintedToken', f.MINTED_TOKEN),
  getRelease: () => ok('Release', f.RELEASE),
  /**
   * §13's approval (P6a Task 10). **All three answer the same fixture**, for the reason the
   * two record routes above state: the mock keeps no state (P5c Decision 9), and a route
   * that echoed the request back would let a console bug that sends the wrong decision look
   * correct here and wrong against the platform. A screen that needs a REJECTED approval
   * drives the platform, not this.
   */
  approveRelease: (ctx) => created('Approval', decisionNamingAPreview(ctx)),
  rejectRelease: (ctx) => created('Approval', decisionNamingAPreview(ctx)),
  // FE-40 (3): none yet (`404`) while pending, or a rejection with its reason.
  getApproval: (ctx) =>
    ok('Approval', approvalOf(launchOf(ctx), ctx.params.releaseId ?? '')),
  // FE-25 (Task 12): asking an administrator to sign off — not needed, refused after a rejection, or
  // an open request, created now. The note is the administrators' alone and never answered.
  requestApproval: (ctx) =>
    ok('ApprovalRequest', requestApproval(launchOf(ctx), ctx.credential, ctx.now)),
  // §26's queue (Task 12): an administrator's read, what the stage leaves with UBC, oldest first.
  listQueue: (ctx) => ok('Queue', queueOf(launchOf(ctx), ctx.options.role, ctx.now)),
  // P6b Task 9: the stored preview. Taking one and re-reading it answer the SAME fixture, which
  // is the platform's property (a re-read never recomputes) and also all a stateless mock can do.
  createApprovalPreview: () => created('ApprovalPreview', f.APPROVAL_PREVIEW),
  // KEYED ON THE PREVIEW (FE-27): each of the three it holds answers as itself.
  getApprovalPreview: (ctx) =>
    ok(
      'ApprovalPreview',
      ctx.params.previewId === f.WITHHELD_PREVIEW_ID
        ? f.WITHHELD_APPROVAL_PREVIEW
        : ctx.params.previewId === f.UNAVAILABLE_PREVIEW_ID
          ? f.UNAVAILABLE_APPROVAL_PREVIEW
          : f.APPROVAL_PREVIEW,
    ),
  // The slug the fixtures already use is taken; everything else is free, so the create
  // form's check-as-you-type has both answers to render.
  checkSlug: (ctx) =>
    ok(
      'SlugCheck',
      ctx.params.slug === f.PROJECT.slug
        ? f.SLUG_TAKEN
        : { slug: ctx.params.slug ?? '', available: true },
    ),
  revokeToken: () => ok('Token', f.REVOKED_TOKEN),
  /**
   * AGENT AND INTAKE SESSIONS (Task 13; FE-27): on the project asked, under the name asked, their
   * keys living from NOW — 60 minutes, or the life asked for; 30 for intake — and a key that is the
   * mock's alone. The spent month and the paused intake are the scripted options above; a start
   * retried with its key is refused below, as the platform refuses it, and never answers the key
   * twice.
   */
  startAgentSession: (ctx) => {
    // THE PLATFORM READS THE MONTH FRESH TO START ONE (`ai/sessions.ts`), so a gateway that cannot
    // say what was spent refuses the start — `503 AI_BACKEND_UNAVAILABLE`, in `ai/errors.ts`'s words —
    // and never mints a key (the whole-branch review's I2: this state answered 201 here).
    if (ctx.options.agentBudget === 'unavailable')
      throw new MockRefusal(
        503,
        'AI_BACKEND_UNAVAILABLE',
        'The AI service is not answering right now.',
        'Check `make doctor`. If the platform is up, the model host (Ollama, locally) is not answering.',
      )
    if (ctx.options.agentBudget === 'exhausted')
      throw new MockRefusal(
        409,
        'AGENT_BUDGET_EXHAUSTED',
        "this month's agent budget of $10 is spent ($10.00 so far)",
        undefined,
        undefined,
        undefined,
        {
          limit: {
            scope: 'person',
            period: 'month',
            amountUsd: 10,
            resetsAt: f.agentBudget(ctx.now, 'exhausted').resetsAt,
          },
        },
      )
    const body = bodyOf<{ name: string; capUsd: number; durationMinutes: number }>(ctx)
    const minutes = body.durationMinutes ?? 60
    return created('AgentSessionStarted', {
      session: f.agentSession(ctx.now, {
        id: f.AGENT_SESSION_ID,
        models: f.agentModels(ctx.options.confidential),
        name: body.name ?? 'an agent session',
        capUsd: body.capUsd ?? 2,
        via:
          ctx.credential === 'token'
            ? { tokenId: f.TOKEN_ID, tokenName: f.TOKEN.name }
            : null,
        expiresAt: new Date(ctx.now + minutes * 60_000).toISOString(),
        createdAt: new Date(ctx.now).toISOString(),
        spentUsd: 0,
      }),
      key: f.MOCK_MODEL_KEY,
      baseUrl: f.MODEL_BASE_URL,
    })
  },
  listAgentSessions: (ctx) =>
    ok(
      'AgentSessionList',
      f.agentSessions(
        ctx.now,
        ctx.options.agentBudget === 'unavailable' ? 'unavailable' : 'known',
        ctx.options.confidential,
      ),
    ),
  endAgentSession: (ctx) => {
    const held = f
      .agentSessions(ctx.now, 'known')
      .sessions.find((s) => s.id === ctx.params.sessionId)!
    return ok(
      'AgentSession',
      held.state === 'ended'
        ? held
        : {
            ...held,
            state: 'ended',
            endedAt: new Date(ctx.now).toISOString(),
            endReason: 'ended',
          },
    )
  },
  getAgentBudget: (ctx) =>
    ok('AgentBudget', f.agentBudget(ctx.now, ctx.options.agentBudget ?? 'ok')),
  startIntakeSession: (ctx) => {
    refuseUnlessMayBuild(ctx)
    if (ctx.options.intake === 'daily-limit')
      throw new MockRefusal(
        409,
        'INTAKE_DAILY_LIMIT_REACHED',
        'you have started the 10 intake sessions a person may start in a day, so describing new apps is paused for today',
        undefined,
        undefined,
        undefined,
        {
          limit: {
            scope: 'person',
            period: 'day',
            count: 10,
            resetsAt: nextVancouverMidnight(ctx.now),
          },
        },
      )
    if (ctx.options.intake === 'budget-spent')
      throw new MockRefusal(
        409,
        'INTAKE_BUDGET_EXHAUSTED',
        "the platform's monthly intake budget of $25 is spent, so describing new apps is paused until the month resets",
        undefined,
        undefined,
        undefined,
        {
          limit: {
            scope: 'platform',
            period: 'month',
            amountUsd: 25,
            resetsAt: nextMonth(ctx.now),
          },
        },
      )
    return created('IntakeSessionStarted', {
      session: f.intakeSession(ctx.now),
      key: f.MOCK_MODEL_KEY,
      baseUrl: f.MODEL_BASE_URL,
    })
  },
  endIntakeSession: (ctx) =>
    ok(
      'IntakeSession',
      f.intakeSession(ctx.now - 10 * 60_000, {
        state: 'ended',
        endedAt: new Date(ctx.now).toISOString(),
      }),
    ),
  // THE DOCUMENT'S OWN EXAMPLES, KEYED ON WHAT NAMES THEM (the authoring API plan's Task 10).
  // Each answers `ctx.example` — the one statement of the answer (Decision 15) — and nothing
  // hand-written; what these four add is refusing to answer it for something ELSE. A mock
  // that gave `src/app.js`'s text to a request for `manifest.yaml`, or one commit's changes
  // under another's id, would show a person clicking the Code screen one file under another's
  // name — the shape `listIncidents` and `getPendingAction` were keyed for (P5c). The mock
  // NAMES ITSELF in each refusal, so it cannot be read as the platform's.
  getFile: (ctx) => {
    const example = documentExample(ctx)
    const held = (example.body as { path: string }).path
    if (ctx.query.get('path') !== held)
      throw new MockRefusal(
        409,
        'SOURCE_PATH_NOT_FOUND',
        `manifest-mock holds the text of one file, the document's example '${held}'`,
        'Open that file here, or drive the platform to read any other.',
      )
    // A BYTE READ IS ANSWERED AS ONE (the plan's `[S3]` (1)): the same file's bytes, as canonical
    // base64 — the platform answers `encoding=base64` for any file — so a front-end can exercise
    // the byte read here rather than meet it first against the platform.
    if (ctx.query.get('encoding') === 'base64') {
      const file = example.body as { content: string }
      return {
        ...example,
        body: {
          ...file,
          encoding: 'base64',
          content: Buffer.from(file.content, 'utf8').toString('base64'),
        },
      }
    }
    return example
  },
  getCommit: (ctx) => {
    const example = documentExample(ctx)
    const held = (example.body as { commitSha: string }).commitSha
    if (ctx.params.commitSha !== held)
      throw new MockRefusal(
        409,
        'SOURCE_COMMIT_NOT_FOUND',
        `manifest-mock describes one commit, the document's example ${held}`,
        'Open that commit here, or drive the platform to read any other.',
      )
    return example
  },
  // ONE PAGE OF HISTORY. Its `next` is a real cursor, so a screen's *Older* button is
  // reachable — and answering the same page to it would show every commit twice.
  listCommits: (ctx) => {
    const example = documentExample(ctx)
    const cursor = ctx.query.get('cursor')
    const first = (example.body as { commits: { commitSha: string }[] }).commits[0]
    if (cursor !== null && cursor !== first?.commitSha)
      throw new MockRefusal(
        409,
        'SOURCE_COMMIT_NOT_FOUND',
        'manifest-mock has one page of history, the document’s example',
        'Drive the platform to page further back.',
      )
    return example
  },
  // THE DOCUMENTATION (Task 11). A page is answered for ITS slug alone, as `getFile` is for its
  // path; the OpenAPI document is the one this mock serves from, whole — an HTML reference or a
  // Docs screen pointed here renders the API, never the example's three keys.
  getDoc: (ctx) => {
    const example = documentExample(ctx)
    const held = (example.body as { slug: string }).slug
    if (ctx.params.slug !== held)
      throw new MockRefusal(
        404,
        'DOC_NOT_FOUND',
        `manifest-mock holds one page, the document's example '${held}'`,
        'Open that page here, or drive the platform to read the others.',
      )
    return example
  },
  getOpenApiDocument: (ctx) => ok('OpenApiDocument', ctx.document),
  // A PRODUCTION SECRET NEEDS A STEP-UP when scripted (FE-40 (2)); otherwise the document's example.
  setAppSecret: (ctx) => {
    if (ctx.params.environmentId === f.PRODUCTION_ID) assertSteppedUp(ctx, 'secret:write')
    return documentExample(ctx)
  },
  clearAppSecret: (ctx) => {
    if (ctx.params.environmentId === f.PRODUCTION_ID) assertSteppedUp(ctx, 'secret:write')
    return documentExample(ctx)
  },
  // A DRY RUN IS ANSWERED AS ONE — `commitSha: null`, no recorded validation — and it echoes
  // nothing else of the request. The one fact the Check button exists for is that nothing was
  // written; answering it the example's commit would tell a person it had been (the reason
  // `decisionNamingAPreview` plays a rule the document states only in words).
  //
  // AND TWO OF THE PLATFORM'S REFUSALS, each over the one state the mock has (the plan's Task 11),
  // so the guides' examples of handling them can run here: `main` is the tree example's commit,
  // so a commit based on any other is `409 SOURCE_CONFLICT` — the document's own request, based
  // on the parent, included; and a commit that deletes or empties manifest.yaml is the
  // platform's `SPEC_INVALID`, word for word. Both checks come before the answer, dry run or not,
  // in the platform's order: the base, then the manifest.
  createCommit: (ctx) => {
    const example = documentExample(ctx)
    const body = ctx.body as
      | {
          baseCommit?: unknown
          dryRun?: unknown
          changes?: { op?: unknown; path?: unknown; content?: unknown }[]
        }
      | undefined
    const main = treeHeadOf(ctx.document)
    if (body?.baseCommit !== main)
      throw new MockRefusal(
        409,
        'SOURCE_CONFLICT',
        `manifest-mock's main is ${main}, the document's tree example — this commit is based on ${String(body?.baseCommit)}`,
        'Read the tree again (getTree) and commit against the commitSha it answers.',
      )
    const manifest = (body.changes ?? []).find((c) => c.path === 'manifest.yaml')
    if (
      manifest !== undefined &&
      (manifest.op === 'delete' ||
        (typeof manifest.content === 'string' && manifest.content.trim() === ''))
    )
      throw new MockRefusal(
        422,
        f.EMPTIED_MANIFEST.error.code,
        f.EMPTIED_MANIFEST.error.message,
        f.EMPTIED_MANIFEST.error.hint,
        f.EMPTIED_MANIFEST.error.details,
      )
    if (body.dryRun !== true) return example
    const outcome = example.body as { spec: Record<string, unknown> }
    return {
      ...example,
      body: {
        ...outcome,
        dryRun: true,
        commitSha: null,
        spec: { ...outcome.spec, appSpecId: null },
      },
    }
  },
}

/** Where `main` is, for this mock: the commit the document's `getTree` example answers. */
function treeHeadOf(document: Document): string {
  const tree = document.paths['/v1/projects/{projectId}/tree']?.get?.responses?.['200']
  const example = tree?.content?.['application/json']?.example as
    { commitSha?: unknown } | undefined
  if (typeof example?.commitSha !== 'string')
    throw new MockRefusal(
      501,
      'INTERNAL',
      'manifest-mock reads main from the document’s getTree example, and the document prints none',
    )
  return example.commitSha
}

/** The scripted answers above that answer the document's example, keyed (`documentExample`). */
export const FROM_EXAMPLE: readonly string[] = [
  'getFile',
  'getCommit',
  'listCommits',
  'createCommit',
  'getDoc',
  'setAppSecret',
  'clearAppSecret',
]

interface Operation {
  operationId: string
  method: string
  path: string
  pattern: RegExp
  names: string[]
  /** Every mutation the document gives a required `Idempotency-Key` header parameter. */
  needsIdempotencyKey: boolean
  /** The operation's `security` names the session alone (FE-26): a Bearer is refused. */
  sessionOnly: boolean
  /**
   * THE DOCUMENT'S OWN ANSWER (the authoring API plan's Decision 15): the success response's
   * `example`, its status and the component it claims to be — what an operation with no
   * scripted answer in `ANSWERS` is answered with, through the same Ajv check as any other.
   */
  example?: Answer
}

interface Document {
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string
        security?: Record<string, unknown>[]
        parameters?: { in: string; name: string; required?: boolean }[]
        responses?: Record<
          string,
          { content?: Record<string, { schema?: { $ref?: string }; example?: unknown }> }
        >
      }
    >
  >
}

/**
 * An operation's success EXAMPLE as an answer: the 2xx response whose JSON content carries both
 * an `example` and a `$ref` to the component it is — or undefined. **It echoes nothing of the
 * request** (P5c Decision 9's reason: a console that sent the wrong thing must not look right).
 */
export function exampleOf(
  responses: NonNullable<Document['paths'][string][string]['responses']>,
): Answer | undefined {
  for (const [status, response] of Object.entries(responses)) {
    if (!/^2\d\d$/.test(status)) continue
    const json = response.content?.['application/json']
    const ref = json?.schema?.$ref
    if (json === undefined || !('example' in json) || ref === undefined) continue
    return {
      status: Number(status),
      schema: ref.slice(ref.lastIndexOf('/') + 1),
      body: json.example,
    }
  }
  return undefined
}

/** `/v1/projects/{projectId}/members/{userId}` → `^/v1/projects/([^/]+)/members/([^/]+)$`. */
function compile(path: string): { pattern: RegExp; names: string[] } {
  const names: string[] = []
  const source = path.replace(
    /\{([^}]+)\}|[.*+?^${}()|[\]\\]/g,
    (match, name?: string) => {
      if (name === undefined) return `\\${match}`
      names.push(name)
      return '([^/]+)'
    },
  )
  return { pattern: new RegExp(`^${source}$`), names }
}

export function operationsOf(document: Document): Operation[] {
  const operations: Operation[] = []
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (operation.operationId === undefined) continue
      const { pattern, names } = compile(path)
      operations.push({
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path,
        pattern,
        names,
        needsIdempotencyKey: (operation.parameters ?? []).some(
          (p) => p.in === 'header' && p.name === 'Idempotency-Key' && p.required === true,
        ),
        // An operation's own `security` overrides the document's global one (either credential).
        sessionOnly:
          operation.security !== undefined &&
          operation.security.length > 0 &&
          operation.security.every((scheme) => Object.keys(scheme).join() === 'session'),
        ...(() => {
          const example = exampleOf(operation.responses ?? {})
          return example === undefined ? {} : { example }
        })(),
      })
    }
  }
  // Fewer path parameters first, so a literal segment always wins a tie.
  return operations.sort((a, b) => a.names.length - b.names.length)
}

export async function readDocument(): Promise<Document> {
  return JSON.parse(await readFile(DOCUMENT, 'utf8')) as Document
}

/** The operations the routing table above answers. `server.test.ts` compares the two. */
export const ANSWERED = Object.keys(ANSWERS)

/**
 * The platform's envelope, `requestId` included (contract 1.6.0, FE-30): the SAME id as the
 * answer's `x-request-id` header, which the request handler sets on every answer before anything
 * is written.
 */
function envelope(
  requestId: string,
  code: string,
  message: string,
  hint?: string,
  details?: unknown[],
  launchReadiness?: unknown,
  facts: { limit?: unknown; session?: unknown } = {},
): string {
  return JSON.stringify({
    error: {
      code,
      message,
      ...(hint === undefined ? {} : { hint }),
      ...(details === undefined ? {} : { details }),
      ...(launchReadiness === undefined ? {} : { launchReadiness }),
      ...(facts.limit === undefined ? {} : { limit: facts.limit }),
      ...(facts.session === undefined ? {} : { session: facts.session }),
      requestId,
    },
  })
}

/**
 * The next midnight in Vancouver, as the platform's database computes it for the intake day (FE-29):
 * 07:00 or 08:00 UTC by the season. The mock asks the platform's zone of Node's own tz data.
 */
function nextVancouverMidnight(now: number): string {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(now))
    .split('-')
    .map(Number) as [number, number, number]
  const hourThere = (t: number) =>
    Number(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Vancouver',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(t)),
    )
  for (const offset of [7, 8]) {
    const t = Date.UTC(ymd[0], ymd[1] - 1, ymd[2] + 1, offset)
    if (hourThere(t) === 0) return new Date(t).toISOString()
  }
  return new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2] + 1, 8)).toISOString()
}

/** The first of next month, 00:00 UTC — when the gateway's monthly budgets reset. */
const nextMonth = (now: number): string => {
  const d = new Date(now)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString()
}

function send(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

function cookiesOf(request: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name !== undefined && name !== '' && rest.length > 0) out[name] = rest.join('=')
  }
  return out
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return undefined
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new MockRefusal(400, 'REQUEST_INVALID', 'the request body is not JSON')
  }
}

/**
 * D23.6, MIRRORING `api/idempotency.ts` RATHER THAN APPROXIMATING IT: a repeated key on the
 * same route with the same body replays the FIRST response; the same key with a DIFFERENT
 * body is `409 IDEMPOTENCY_KEY_REUSED`; and a key shorter than eight characters is refused
 * before the handler runs, which is what the control plane's own `preHandler` does.
 *
 * The plan's Step 3 says a missing key is `400 REQUEST_INVALID`. IT IS NOT — the platform
 * answers `400 IDEMPOTENCY_KEY_REQUIRED`, a code of its own that is in the document. A mock
 * that answered the plan's code would be a fixture that lies about a refusal a client
 * switches on.
 */
interface Stored {
  hash: string
  status: number
  body: string
}

export function createMockServer(options: MockOptions = {}): Server {
  const resolved: Required<MockOptions> = {
    role:
      options.role ?? (process.env.MANIFEST_MOCK_ROLE === 'admin' ? 'admin' : 'member'),
    fail: options.fail ?? process.env.MANIFEST_MOCK_FAIL === '1',
    launched: options.launched ?? process.env.MANIFEST_MOCK_LAUNCHED === '1',
    confidential: options.confidential ?? process.env.MANIFEST_MOCK_CONFIDENTIAL === '1',
    mayBuild: options.mayBuild ?? process.env.MANIFEST_MOCK_MAY_BUILD !== '0',
    agentBudget:
      options.agentBudget ??
      (process.env.MANIFEST_MOCK_AGENT_BUDGET === 'exhausted' ||
      process.env.MANIFEST_MOCK_AGENT_BUDGET === 'unavailable'
        ? process.env.MANIFEST_MOCK_AGENT_BUDGET
        : 'ok'),
    records:
      options.records ??
      (['none', 'drafted', 'assessed', 'approved'].includes(
        process.env.MANIFEST_MOCK_RECORDS ?? '',
      )
        ? (process.env.MANIFEST_MOCK_RECORDS as RecordsStage)
        : 'sent'),
    approval:
      options.approval ??
      (process.env.MANIFEST_MOCK_APPROVAL === 'pending' ||
      process.env.MANIFEST_MOCK_APPROVAL === 'rejected'
        ? process.env.MANIFEST_MOCK_APPROVAL
        : 'approved'),
    rehearsal:
      options.rehearsal ??
      (process.env.MANIFEST_MOCK_REHEARSAL === 'failed' ? 'failed' : 'passed'),
    stepUp: options.stepUp ?? process.env.MANIFEST_MOCK_STEP_UP === '1',
    queue:
      options.queue ?? (process.env.MANIFEST_MOCK_QUEUE === 'full' ? 'full' : 'default'),
    intake:
      options.intake ??
      (process.env.MANIFEST_MOCK_INTAKE === 'daily-limit' ||
      process.env.MANIFEST_MOCK_INTAKE === 'budget-spent'
        ? process.env.MANIFEST_MOCK_INTAKE
        : 'open'),
    scanSilenceMs:
      options.scanSilenceMs ??
      (process.env.MANIFEST_MOCK_SCAN_MS === undefined
        ? SCAN_SILENCE_MS
        : Number(process.env.MANIFEST_MOCK_SCAN_MS)),
  }

  // Both are created once and awaited per request: reading and compiling the document on
  // every call would make the scripted timings meaningless.
  const ready = (async (): Promise<{
    validate: Validate
    operations: Operation[]
    document: Document
  }> => {
    const document = await readDocument()
    return {
      validate: await createValidator(),
      operations: operationsOf(document),
      document,
    }
  })()
  ready.catch(() => undefined)

  const seen = new Map<string, Stored>()

  /**
   * WHEN THE SCRIPTED BUILD STOPS BEING `running`, IN WALL-CLOCK TIME. Set the moment a
   * subscription starts playing the script and read by `getBuild`/`listBuilds`, so the http
   * half and the stream half agree the way the platform's do — both read one build row.
   * Undefined until a socket opens: a page with no stream shows a build that has finished,
   * which is the ordinary state of a project nobody is building.
   */
  let buildSucceedsAt: number | undefined

  const server = createServer((request, response) => {
    // FE-30 (contract 1.6.0): EVERY answer carries a request id, as the platform's does — set
    // before anything is written, so `writeHead` merges it into a success, a redirect or a refusal.
    const requestId = randomUUID()
    response.setHeader('x-request-id', requestId)
    void handle(request, response, requestId).catch((error: unknown) => {
      send(
        response,
        500,
        envelope(requestId, 'INTERNAL', `manifest-mock failed: ${String(error)}`),
      )
    })
  })

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
    requestId: string,
  ): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://mock.invalid')
    const method = (request.method ?? 'GET').toUpperCase()

    // THE TWO UNVERSIONED ENDPOINTS, AND ONLY THESE TWO (D23.8) — matching the console's
    // auth.ts exactly. There is no IdP here: a mock that made a person sign in would defeat
    // its own purpose, so login sets the cookie and redirects to where it was sent.
    if (url.pathname === '/auth/login') {
      const returnTo = url.searchParams.get('returnTo') ?? '/'
      // `safeReturnTo`'s rule, restated: a same-origin path, never protocol-relative.
      const safe = /^\/(?!\/)[^\s\\]{0,511}$/.test(returnTo) ? returnTo : '/'
      response.writeHead(302, {
        location: safe,
        'set-cookie': `${SESSION_COOKIE}=${ISSUED_SESSION}; Path=/; HttpOnly; SameSite=Lax`,
      })
      response.end()
      return
    }
    // FE-40 (2): THE STEP-UP, with no IdP — it steps up and sends the browser back, as login does.
    // A cookie of its own for ten minutes (§20's window), so the mock keeps no state.
    if (url.pathname === '/auth/step-up') {
      const returnTo = url.searchParams.get('returnTo') ?? '/'
      const safe = /^\/(?!\/)[^\s\\]{0,511}$/.test(returnTo) ? returnTo : '/'
      response.writeHead(302, {
        location: safe,
        'set-cookie': `${STEP_UP_COOKIE}=1; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`,
      })
      response.end()
      return
    }
    if (url.pathname === '/auth/logout' && method === 'POST') {
      // The real route's answer (P6b F10): where the browser goes next. The mock has no IdP,
      // so it is always the console's home.
      response.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0`,
      })
      response.end(JSON.stringify({ redirectTo: '/' }))
      return
    }

    const { validate, operations, document } = await ready
    const body = await readBody(request)

    try {
      const match = operations
        .map((operation) => ({
          operation,
          m: operation.method === method ? operation.pattern.exec(url.pathname) : null,
        }))
        .find((candidate) => candidate.m !== null)

      if (match === undefined) {
        // A path the document does not declare, answered exactly as the platform answers it.
        throw new MockRefusal(
          404,
          'ROUTE_NOT_FOUND',
          `manifest-mock has no route for ${method} ${url.pathname}`,
        )
      }

      const { operation, m } = match
      const { example } = operation
      const answer: Answerer | undefined =
        ANSWERS[operation.operationId] ??
        (example === undefined ? undefined : () => structuredClone(example))
      if (answer === undefined) {
        // DOCUMENTED AND NOT ANSWERED — the one case Task 2's 501 is for, and it means the
        // contract has grown a route this mock has not caught up with.
        throw new MockRefusal(
          501,
          'INTERNAL',
          `manifest-mock does not serve ${operation.operationId} yet`,
          'The document declares this operation with no example, and packages/mock has no fixture for it.',
        )
      }

      const credential = assertOneCredential(request)
      // FE-26: the credential the operation's `security` does not list — the platform's words.
      if (operation.sessionOnly && credential === 'token')
        throw new MockRefusal(
          403,
          'TOKEN_CREDENTIAL_REFUSED',
          'this action is only available in an interactive session',
          'Sign in to the console and do it there. An agent asks a person to confirm the privileged ones.',
        )

      const params: Record<string, string> = {}
      operation.names.forEach((name, i) => {
        params[name] = decodeURIComponent(m![i + 1] ?? '')
      })

      const key = request.headers['idempotency-key']
      if (operation.needsIdempotencyKey) {
        if (typeof key !== 'string' || key.length < 8)
          throw new MockRefusal(
            400,
            'IDEMPOTENCY_KEY_REQUIRED',
            'every mutating request needs an Idempotency-Key header of at least 8 characters',
            'Generate a UUID per user action and reuse it across retries of that action.',
          )
        const stored = seen.get(`${key}|${operation.method} ${operation.path}`)
        const hash = JSON.stringify(body ?? null)
        if (stored !== undefined) {
          if (stored.hash !== hash)
            throw new MockRefusal(
              409,
              'IDEMPOTENCY_KEY_REUSED',
              `Idempotency-Key '${key}' was already used on this route with a different body`,
            )
          // A STARTED SESSION'S KEY IS NEVER REPLAYED EITHER (Task 13): the platform's words.
          if (operation.operationId === 'startAgentSession') {
            const { session } = JSON.parse(stored.body) as {
              session: { id: string; name: string }
            }
            throw new MockRefusal(
              409,
              'AGENT_SESSION_ALREADY_STARTED',
              `this request already started the agent session '${session.name}' (${session.id}); its key was answered then and is never shown again — end it with endAgentSession and start another if that answer was lost`,
              undefined,
              undefined,
              undefined,
              { session: { id: session.id, name: session.name } },
            )
          }
          if (operation.operationId === 'startIntakeSession') {
            const { session } = JSON.parse(stored.body) as { session: { id: string } }
            throw new MockRefusal(
              409,
              'INTAKE_SESSION_ALREADY_STARTED',
              `this request already started the intake session '${session.id}'; its key was answered then and is never shown again — end it with endIntakeSession and start another if that answer was lost`,
              undefined,
              undefined,
              undefined,
              { session: { id: session.id, name: null } },
            )
          }
          // A MINT IS NEVER REPLAYED (the platform's `withholdOnReplay`, the authoring API plan's
          // Task 12): the first answer was the only one with the secret, and what is kept is the
          // token — so the retry is told which token it minted, in the platform's words.
          if (operation.operationId === 'mintToken') {
            const { token } = JSON.parse(stored.body) as {
              token: { id: string; name: string }
            }
            throw new MockRefusal(
              409,
              'TOKEN_ALREADY_MINTED',
              `this Idempotency-Key already minted token ${token.id} ('${token.name}'); its secret was shown once, to the first request, and is not kept`,
              'If the first answer was lost, revoke this token (revokeToken) and mint again with a new Idempotency-Key.',
            )
          }
          send(response, stored.status, stored.body)
          return
        }
      }

      // FE-27: an id the mock does not hold is the platform's 404, before any answer is built.
      assertHeld(params)

      const {
        status,
        schema,
        body: answered,
      } = answer({
        params,
        query: url.searchParams,
        body,
        options: resolved,
        buildIsRunning: buildSucceedsAt !== undefined && Date.now() < buildSucceedsAt,
        example,
        document,
        now: Date.now(),
        credential,
        steppedUp: cookiesOf(request)[STEP_UP_COOKIE] === '1',
      })

      // EVERY BODY IS VALIDATED ON ITS WAY OUT, in-process. A mock that lies is worse than
      // one that is down: the whole exposure of hand-written fixtures (Decision 10) is that
      // a client is built against a shape the platform never sends.
      if (schema !== null) {
        const { ok: valid, errors } = validate(schema, answered)
        if (!valid) {
          send(
            response,
            500,
            envelope(
              requestId,
              'INTERNAL',
              `manifest-mock built a body that is not a ${schema}: ${errors}`,
            ),
          )
          return
        }
      }

      const text = JSON.stringify(answered)
      if (operation.needsIdempotencyKey && typeof key === 'string')
        seen.set(`${key}|${operation.method} ${operation.path}`, {
          hash: JSON.stringify(body ?? null),
          status,
          // The platform keeps a mint's token WITHOUT its secret, and a session WITHOUT its key;
          // so does the mock.
          body:
            operation.operationId === 'mintToken'
              ? JSON.stringify({ token: (answered as { token: unknown }).token })
              : operation.operationId === 'startAgentSession' ||
                  operation.operationId === 'startIntakeSession'
                ? JSON.stringify({ session: (answered as { session: unknown }).session })
                : text,
        })
      send(response, status, text)
    } catch (error) {
      if (error instanceof MockRefusal) {
        send(
          response,
          error.status,
          envelope(
            requestId,
            error.code,
            error.message,
            error.hint,
            error.details,
            error.launchReadiness,
            error.facts,
          ),
        )
        return
      }
      throw error
    }
  }

  /**
   * A REQUEST WITH NO CREDENTIAL IS `401 UNAUTHENTICATED`, so the console's sign-in screen
   * is reachable against the mock — and one carrying BOTH classes is `400
   * CREDENTIAL_AMBIGUOUS`, refused before either is read, exactly as `api/server.ts` does. A
   * SESSION THE MOCK DID NOT ISSUE is refused the same way as none (FE-26): the platform answers a
   * cookie it never signed `401`, and a front-end must be able to prove here that it does not
   * trust one.
   */
  function assertOneCredential(request: IncomingMessage): 'session' | 'token' {
    const session = cookiesOf(request)[SESSION_COOKIE]
    const bearer = request.headers.authorization
    if (session !== undefined && bearer !== undefined)
      throw new MockRefusal(
        400,
        'CREDENTIAL_AMBIGUOUS',
        'a request carries either a session or a delegated token, never both',
      )
    if (bearer !== undefined) return 'token'
    if (session !== ISSUED_SESSION)
      throw new MockRefusal(
        401,
        'UNAUTHENTICATED',
        'a valid credential is required',
        'Sign in at /auth/login for a session, or send Authorization: Bearer <token> for an agent. A token that is unknown, revoked or expired is refused the same way.',
      )
    return 'session'
  }

  // THE SCRIPTED STREAM. `noServer: true` and an explicit `upgrade` handler, because the
  // routing table above is the http half and this is the other one.
  const sockets = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://mock.invalid')
    if (!/^\/v1\/projects\/[^/]+\/events$/.test(url.pathname)) {
      socket.destroy()
      return
    }
    // AUTHORIZED BEFORE IT UPGRADES, which is where the platform does it too — a refusal
    // after the upgrade can only be a close code, on a socket the stranger already holds
    // (P4b sitting 9). An HTTP status written here is what a Node `ws` client sees as
    // `unexpected-response`; a BROWSER is shown nothing but close 1006.
    // FE-26: the session it issued, or a Bearer — as the http half.
    if (
      cookiesOf(request)[SESSION_COOKIE] !== ISSUED_SESSION &&
      request.headers.authorization === undefined
    ) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nconnection: close\r\n\r\n')
      return
    }
    sockets.handleUpgrade(request, socket, head, (ws) => {
      void play(ws)
    })
  })
  server.on('close', () => sockets.close())

  async function play(ws: WebSocket): Promise<void> {
    const { validate } = await ready
    const timers: NodeJS.Timeout[] = []
    ws.on('close', () => timers.forEach(clearTimeout))

    const write = (frame: unknown): void => {
      if (ws.readyState !== ws.OPEN) return
      // THE FRAMES ARE THE HALF OF THE CONTRACT OPENAPI CANNOT DESCRIBE, and they are where
      // a mock most easily drifts — so they are validated too, by the same validator.
      const { ok: valid, errors } = validate('StreamFrame', frame)
      if (!valid) {
        ws.close(1011, `manifest-mock built an invalid frame: ${errors}`.slice(0, 120))
        return
      }
      ws.send(JSON.stringify(frame))
    }

    // Subscribe, then REPLAY, then the CONTROL frame, then live — the order
    // api/routes/events.ts sends and the only order `subscribe`'s `ready` resolves in.
    for (const frame of REPLAY) write(frame)
    write(READY)

    let at = 0
    const timeline = scripted({
      fail: resolved.fail,
      scanSilenceMs: resolved.scanSilenceMs,
    })
    for (const { afterMs, frame } of timeline) {
      at += afterMs
      // The build row stops being `running` at exactly the instant the stream says so.
      if ((frame as { type?: string }).type === 'build.succeeded')
        buildSucceedsAt = Date.now() + at
      timers.push(setTimeout(() => write(frame), at))
    }
  }

  return server
}
