import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import { AuthorizationError, assertCapability } from '../../projects/index.js'
import {
  MAX_BUFFERED_BYTES,
  REPLAY_LIMIT,
  readyFrame,
  recentFramesFor,
  type StreamFrame,
} from '../../observability/index.js'
import { assertSameOrigin } from '../csrf.js'
import { requireActor, type ServerDeps } from '../server.js'

/** A refusal AFTER the upgrade: "you may not", distinct from 1011's "I broke". */
const CLOSE_NOT_FOUND = 4404
/** The same, for a handshake from another origin (P5a Task 4) — HTTP's 403 in the 4000s. */
const CLOSE_FORBIDDEN = 4403
/** RFC 6455's Try Again Later: the client reconnects and is replayed. */
const CLOSE_TRY_AGAIN_LATER = 1013
const CLOSE_INTERNAL_ERROR = 1011

/**
 * ONE authorization for both halves of the route. `project:read` — the capability
 * every project, build, log, environment and incident read uses — because a stream
 * carries nothing a GET on the project does not (P4b finding 153: the plan's `'read'`
 * is not a capability).
 */
async function authorizeStream(
  deps: ServerDeps,
  request: FastifyRequest,
): Promise<string> {
  const actor = requireActor(request)
  const { projectId } = request.params as { projectId: string }
  await assertCapability(deps.db, actor, projectId, 'project:read')
  return projectId
}

/** An RFC 6455 handshake, which is what a browser page can open cross-origin. */
function isUpgrade(request: FastifyRequest): boolean {
  return request.headers.upgrade?.toLowerCase() === 'websocket'
}

/**
 * `WS /v1/projects/:projectId/events` — D23.2's one stream per project, never polling.
 *
 * **AUTHORIZED BEFORE IT UPGRADES, in a route hook.** `@fastify/websocket` 11.3.0 sends
 * an upgrade through Fastify's router, so the route's hooks run before its handler calls
 * `handleUpgrade` — and a hook that throws answers with an ordinary HTTP status on the
 * raw socket, which the plugin then destroys. So a stranger's upgrade is a `404` and no
 * socket ever exists. The plan put the check inside `wsHandler`, which runs AFTER the
 * upgrade: the stranger's socket would open and then close with 4404, and the plan's own
 * test — which expects a 404 — could not pass (P4b finding 155). A hook also cannot guard
 * one half and not the other, which is the defect the plan's shared function existed to
 * prevent.
 *
 * **A plain GET is answered 426**, which is what lets §16's authorization contract suite
 * — HTTP only, `app.inject` cannot upgrade — cover the stream as all five actors. The
 * route is declared in full, `handler` plus `wsHandler`, WITHOUT `websocket: true`: with
 * that flag the plugin uses `handler` as the socket handler and answers every plain GET
 * 404 (P4b finding 156).
 */
export async function registerEventRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
): Promise<void> {
  app.route({
    method: 'GET',
    url: '/v1/projects/:projectId/events',
    preValidation: async (request) => {
      // Cross-site WebSocket hijacking (P5a Task 4): a same-site app's page can open this
      // stream with the member's cookie and READ it — `SameSite=Lax` does not stop it.
      // Browsers always send Origin on a handshake. A plain GET — the authorization
      // suite's 426 — is not an upgrade and reads nothing. First, so a refused origin
      // learns nothing about the project either.
      if (isUpgrade(request)) {
        assertSameOrigin(request, deps.config.sp.origin)
      }
      await authorizeStream(deps, request)
    },
    handler: async (_request, reply) =>
      reply
        .code(426)
        // RFC 9110: a 426 names the protocol to switch to.
        .header('upgrade', 'websocket')
        .send({
          error: {
            code: 'EVENTS_UPGRADE_REQUIRED',
            message: 'this endpoint is a WebSocket stream',
            hint: 'Connect with a WebSocket client to wss://<host>/v1/projects/<projectId>/events. D23.2: one stream per project, never polling. The frames are StreamFrame in packages/contract/openapi.json.',
          },
        }),
    wsHandler: async (socket, request) => {
      // The origin, read a second time for the same reason authorization is below.
      try {
        assertSameOrigin(request, deps.config.sp.origin)
      } catch {
        socket.close(CLOSE_FORBIDDEN, 'forbidden')
        return
      }
      // A SECOND READ, after the hook's. A guard whose enabling condition is written
      // once is one edit from gone: if the hook is ever lost, a stranger's socket is
      // closed here before it is subscribed to anything.
      let projectId: string
      try {
        projectId = await authorizeStream(deps, request)
      } catch (error) {
        if (
          error instanceof AuthorizationError ||
          (error as { statusCode?: number }).statusCode === 401
        ) {
          socket.close(CLOSE_NOT_FOUND, 'not found')
          return
        }
        reportStreamFailure('the event stream could not authorize a connection', error)
        socket.close(CLOSE_INTERNAL_ERROR, 'the stream could not be opened')
        return
      }
      await streamProject(deps, socket, projectId)
    },
  })
}

/**
 * **Subscribe, then replay, then flush — in that order**, because the order is the
 * correctness of the stream. Replaying before subscribing loses every frame published
 * while the replay is read; subscribing after replaying repeats the overlap. So frames
 * that arrive during the replay are HELD, the replay is sent, the boundary frame is
 * sent, and the held frames follow — minus any the replay already carried.
 */
async function streamProject(
  deps: ServerDeps,
  socket: WebSocket,
  projectId: string,
): Promise<void> {
  let live = false
  let stopped = false
  let heldBytes = 0
  const held: { id: string; data: string }[] = []

  const stop = (code?: number, reason?: string): void => {
    if (stopped) return
    stopped = true
    unsubscribe()
    if (code !== undefined && socket.readyState === socket.OPEN)
      socket.close(code, reason)
  }

  const send = (data: string): void => {
    if (stopped || socket.readyState !== socket.OPEN) return
    // What `ws` has not yet handed to the kernel. Past the cap this socket is not
    // keeping up, and every further frame would be held in this process for it.
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      stop(
        CLOSE_TRY_AGAIN_LATER,
        'the stream fell behind; reconnect to replay what was missed',
      )
      return
    }
    socket.send(data)
  }

  const unsubscribe = deps.bus.subscribe(projectId, (frame: StreamFrame) => {
    const data = JSON.stringify(frame)
    if (live) {
      send(data)
      return
    }
    // The hold is capped by the same rule, so a flood during a slow replay read cannot
    // grow it without bound either.
    heldBytes += data.length
    if (heldBytes > MAX_BUFFERED_BYTES) {
      stop(
        CLOSE_TRY_AGAIN_LATER,
        'the stream fell behind; reconnect to replay what was missed',
      )
      return
    }
    held.push({ id: frame.id, data })
  })
  socket.on('close', () => stop())

  let replay: StreamFrame[]
  try {
    replay = await recentFramesFor(deps.db, projectId, REPLAY_LIMIT)
  } catch (error) {
    reportStreamFailure('the event stream could not read its replay', error, projectId)
    stop(CLOSE_INTERNAL_ERROR, 'the stream could not be opened')
    return
  }
  if (stopped) return

  const sent = new Set<string>()
  for (const frame of replay) {
    sent.add(frame.id)
    send(JSON.stringify(frame))
  }
  send(JSON.stringify(readyFrame(projectId)))
  live = true
  for (const frame of held.splice(0)) {
    if (!sent.has(frame.id)) send(frame.data)
  }
}

/**
 * The operator's copy, on stderr: the server runs with `logger: false`, under which the
 * plugin's own `fastify.log.error` writes nothing. A code or a class name, never a
 * message — a database error's message can quote the query.
 */
function reportStreamFailure(msg: string, error: unknown, projectId?: string): void {
  console.error(
    JSON.stringify({
      level: 'error',
      msg,
      ...(projectId === undefined ? {} : { projectId }),
      error: (error as { code?: string }).code ?? (error as Error).name,
    }),
  )
}
