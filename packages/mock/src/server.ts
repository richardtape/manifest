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
 * operation the document declares has an entry in `ANSWERS`.
 *
 * AN OPERATION WITH NO ENTRY ANSWERS `501`, DELIBERATELY (Task 2's stub, kept), and a path
 * the document does not declare answers `404 ROUTE_NOT_FOUND` exactly as the platform does.
 * The two are different facts and the mock says which: a mock that answers a plausible
 * `200` to everything is the stand-in that produces a real-looking failure (P4c finding 74).
 *
 * WHAT IT DELIBERATELY DOES NOT ENFORCE: §20's CSRF origin check. A browser pointed at the
 * mock through Vite's proxy sends `Origin: http://127.0.0.1:7104`, and the platform wants
 * the console's origin — so enforcing it here would refuse every mutation the mock exists to
 * let a developer make. It is stated in RUNBOOK as a limit rather than hidden.
 */

const SESSION_COOKIE = 'manifest_session'
const DOCUMENT = new URL('../../contract/openapi.json', import.meta.url)

export interface MockOptions {
  /** `MANIFEST_MOCK_ROLE=admin` is what makes §26's fleet reachable. */
  role?: 'admin' | 'member'
  /** `MANIFEST_MOCK_FAIL=1` plays the deploy's other ending. */
  fail?: boolean
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
}

interface Answer {
  status: number
  /** The document schema this body claims to be; `null` for a bodyless answer. */
  schema: string | null
  body: unknown
}

type Answerer = (ctx: Context) => Answer

const ok = (schema: string, body: unknown): Answer => ({ status: 200, schema, body })
const created = (schema: string, body: unknown): Answer => ({ status: 201, schema, body })

export class MockRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message)
    this.name = 'MockRefusal'
  }
}

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
  // against the mock exactly as it fails against the platform.
  deploy: (ctx) => ok('Instance', ctx.options.fail ? f.FAILED_INSTANCE : f.INSTANCE),
  // KEYED ON THE PATH PARAMETER, because an Incident belongs to ONE environment. Answering
  // the same fixture for every id put a staging incident under `sandbox`, which reads as a
  // failed deploy of an environment that has never been deployed — measured in a browser
  // on 2026-09-19.
  listIncidents: (ctx) =>
    ok(
      'IncidentList',
      ctx.params.environmentId === f.STAGING_ID
        ? f.INCIDENTS
        : { environmentId: ctx.params.environmentId ?? '', incidents: [] },
    ),
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
  getMe: (ctx) => ok('Me', ctx.options.role === 'admin' ? f.ADMIN_ME : f.ME),
  // KEYED ON THE PATH PARAMETER: this route's one caller is the *Check* button on a
  // CONFIRMED row, and answering some other row's state to it would be the mock lying about
  // the one fact that button exists to fetch (P5c sitting 7, F2).
  getPendingAction: (ctx) =>
    ok(
      'PendingAction',
      f.PENDING_ACTIONS.find((a) => a.id === ctx.params.pendingActionId) ??
        f.CONFIRMED_ACTION,
    ),
  confirmPendingAction: () => ok('PendingAction', f.CONFIRMED_ACTION),
  rejectPendingAction: () => ok('PendingAction', f.REJECTED_ACTION),
  listProjects: () => ok('ProjectList', f.PROJECTS),
  createProject: () => created('CreatedProject', f.CREATED_PROJECT),
  getProject: (ctx) =>
    ok(
      'Project',
      ctx.query.get('expand') === 'environments' ? f.PROJECT_EXPANDED : f.PROJECT,
    ),
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
  getLaunchReadiness: () => ok('LaunchReadiness', f.LAUNCH_READINESS),
  getLaunchRecords: () => ok('LaunchRecords', f.LAUNCH_RECORDS),
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
  runRehearsal: () => ok('Rehearsal', f.REHEARSAL),
  listMembers: () => ok('MemberList', f.MEMBERS),
  addMember: () => created('Member', f.MEMBER),
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
  getApproval: () => ok('Approval', f.APPROVAL),
  // P6b Task 9: the stored preview. Taking one and re-reading it answer the SAME fixture, which
  // is the platform's property (a re-read never recomputes) and also all a stateless mock can do.
  createApprovalPreview: () => created('ApprovalPreview', f.APPROVAL_PREVIEW),
  getApprovalPreview: () => ok('ApprovalPreview', f.APPROVAL_PREVIEW),
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
}

interface Operation {
  operationId: string
  method: string
  path: string
  pattern: RegExp
  names: string[]
  /** Every mutation the document gives a required `Idempotency-Key` header parameter. */
  needsIdempotencyKey: boolean
}

interface Document {
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string
        parameters?: { in: string; name: string; required?: boolean }[]
      }
    >
  >
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

function envelope(code: string, message: string, hint?: string): string {
  return JSON.stringify({
    error: { code, message, ...(hint === undefined ? {} : { hint }) },
  })
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
    scanSilenceMs:
      options.scanSilenceMs ??
      (process.env.MANIFEST_MOCK_SCAN_MS === undefined
        ? SCAN_SILENCE_MS
        : Number(process.env.MANIFEST_MOCK_SCAN_MS)),
  }

  // Both are created once and awaited per request: reading and compiling the document on
  // every call would make the scripted timings meaningless.
  const ready = (async (): Promise<{ validate: Validate; operations: Operation[] }> => ({
    validate: await createValidator(),
    operations: operationsOf(await readDocument()),
  }))()
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
    void handle(request, response).catch((error: unknown) => {
      send(response, 500, envelope('INTERNAL', `manifest-mock failed: ${String(error)}`))
    })
  })

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
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
        'set-cookie': `${SESSION_COOKIE}=mock-session; Path=/; HttpOnly; SameSite=Lax`,
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

    const { validate, operations } = await ready
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
      const answer = ANSWERS[operation.operationId]
      if (answer === undefined) {
        // DOCUMENTED AND NOT ANSWERED — the one case Task 2's 501 is for, and it means the
        // contract has grown a route this mock has not caught up with.
        throw new MockRefusal(
          501,
          'INTERNAL',
          `manifest-mock does not serve ${operation.operationId} yet`,
          'The document declares this operation and packages/mock has no fixture for it.',
        )
      }

      assertOneCredential(request)

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
          send(response, stored.status, stored.body)
          return
        }
      }

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
          body: text,
        })
      send(response, status, text)
    } catch (error) {
      if (error instanceof MockRefusal) {
        send(response, error.status, envelope(error.code, error.message, error.hint))
        return
      }
      throw error
    }
  }

  /**
   * A REQUEST WITH NO CREDENTIAL IS `401 UNAUTHENTICATED`, so the console's sign-in screen
   * is reachable against the mock — and one carrying BOTH classes is `400
   * CREDENTIAL_AMBIGUOUS`, refused before either is read, exactly as `api/server.ts` does.
   */
  function assertOneCredential(request: IncomingMessage): void {
    const session = cookiesOf(request)[SESSION_COOKIE]
    const bearer = request.headers.authorization
    if (session !== undefined && bearer !== undefined)
      throw new MockRefusal(
        400,
        'CREDENTIAL_AMBIGUOUS',
        'a request carries either a session or a delegated token, never both',
      )
    if (session === undefined && bearer === undefined)
      throw new MockRefusal(
        401,
        'UNAUTHENTICATED',
        'a valid credential is required',
        'Sign in at /auth/login for a session, or send Authorization: Bearer <token>.',
      )
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
    if (
      cookiesOf(request)[SESSION_COOKIE] === undefined &&
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
