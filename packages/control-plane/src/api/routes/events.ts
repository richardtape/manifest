import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import { AuthorizationError, assertCapability, type Actor } from '../../projects/index.js'
import {
  CLOSE_CREDENTIAL_GONE,
  CLOSE_NOT_FOUND,
  MAX_BUFFERED_BYTES,
  REPLAY_LIMIT,
  readyFrame,
  recentFramesFor,
  type StreamFrame,
} from '../../observability/index.js'
import { tokenStillACredential } from '../../tokens/index.js'
import { assertSameOrigin } from '../csrf.js'
import { originOf } from '../origins.js'
import { requireActor, type ServerDeps } from '../server.js'

// A refusal AFTER the upgrade — "you may not", distinct from 1011's "I broke" — is `CLOSE_NOT_FOUND`
// (4404), and a credential gone while the stream is open `CLOSE_CREDENTIAL_GONE` (4401): both the
// registry's (`observability/streams.ts`), which closes streams with them too.
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
async function authorizeStream(deps: ServerDeps, request: FastifyRequest): Promise<void> {
  const actor = requireActor(request)
  const { projectId } = request.params as { projectId: string }
  await assertCapability(deps.db, actor, projectId, 'project:read')
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
  /**
   * Every stream THIS server holds open, by its stop — so closing the server stops each one: its
   * registration and its expiry timer go with it (FE-33). `@fastify/websocket`'s own `preClose` has
   * already sent each socket its close frame by then, but a socket's `close` event waits for the
   * other end's reply, and a registry entry or a timer must not wait with it.
   */
  const open = new Set<() => void>()
  app.addHook('onClose', async () => {
    for (const stop of [...open]) stop()
  })
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
        assertSameOrigin(request, originOf(request, deps.config.origins))
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
        assertSameOrigin(request, originOf(request, deps.config.origins))
      } catch {
        socket.close(CLOSE_FORBIDDEN, 'forbidden')
        return
      }
      // The hook's actor, which it has already refused the upgrade without. If the hook is ever
      // lost, no actor is no stream — the answer the second read below gives a stranger.
      const actor = request.actor
      if (actor === undefined) {
        socket.close(CLOSE_NOT_FOUND, 'not found')
        return
      }
      await streamProject(deps, socket, request, actor, open)
    },
  })
}

/**
 * **Registered, then authorized again, then subscribed, replayed and flushed — in that order.**
 *
 * REGISTERED FIRST (FE-33, the launch path plan's Task 5): the credential hook read the credential
 * before this ran, and a revoke, an archive or a delete that commits between that read and the
 * registration closes NOTHING — nothing is registered yet — so the stream would stay open for good.
 * Registered before the reads below, every such change is either SEEN by them or FINDS the stream
 * registered: the second authorization read reads the project (a delete in the window), and a
 * token's stream reads its token again (a revoke, an expiry or an archive in the window).
 *
 * **Then subscribe, then replay, then flush**, because that order is the correctness of the
 * stream. Replaying before subscribing loses every frame published while the replay is read;
 * subscribing after replaying repeats the overlap. So frames that arrive during the replay are
 * HELD, the replay is sent, the boundary frame is sent, and the held frames follow — minus any the
 * replay already carried.
 */
async function streamProject(
  deps: ServerDeps,
  socket: WebSocket,
  request: FastifyRequest,
  actor: Actor,
  open: Set<() => void>,
): Promise<void> {
  const { projectId } = request.params as { projectId: string }
  let live = false
  let stopped = false
  let heldBytes = 0
  const held: { id: string; data: string }[] = []
  // Assigned below. `stop` can run before the subscription exists — a client that leaves, or a
  // credential that goes, while the stream is still being authorized.
  let unregister = (): void => undefined
  let unsubscribe = (): void => undefined

  /**
   * THE ONE WAY THIS STREAM ENDS, whoever ends it — its client, the registry, the server's close, a
   * refusal below, a slow reader: unregistered and UNSUBSCRIBED BEFORE the socket is closed, so a
   * close that throws still leaves a stream that hears nothing.
   */
  const stop = (code?: number, reason?: string): void => {
    if (stopped) return
    stopped = true
    open.delete(stop)
    unregister()
    unsubscribe()
    if (code !== undefined && socket.readyState === socket.OPEN)
      socket.close(code, reason)
  }

  unregister = deps.streams.register(
    {
      projectId,
      tokenId: actor.credential === 'token' ? actor.tokenId : null,
      userId: actor.userId,
      // The token's `expires_at` or the session's cookie expiry — the registry closes 4401 at it.
      expiresAt: new Date(actor.expiresAt),
    },
    (code, reason) => stop(code, reason),
  )
  open.add(stop)
  socket.on('close', () => stop())

  // A SECOND READ, after the hook's. A guard whose enabling condition is written once is one
  // edit from gone: if the hook is ever lost, a stranger's socket is closed here before it is
  // subscribed to anything.
  try {
    await authorizeStream(deps, request)
    // A token's authority is its row's, and the hook read that row before the registration
    // above: read it again, now that a revoke can find this stream (the window above).
    if (
      actor.credential === 'token' &&
      !(await tokenStillACredential(deps.db, actor.tokenId))
    ) {
      stop(CLOSE_CREDENTIAL_GONE, 'the credential was revoked or expired')
      return
    }
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      (error as { statusCode?: number } | null | undefined)?.statusCode === 401
    ) {
      stop(CLOSE_NOT_FOUND, 'not found')
      return
    }
    // `finally`: whatever the report does, this stream is stopped and unregistered (M7).
    try {
      reportStreamFailure('the event stream could not authorize a connection', error)
    } finally {
      stop(CLOSE_INTERNAL_ERROR, 'the stream could not be opened')
    }
    return
  }
  // Ended while it was being authorized — its client left, or its credential went.
  if (stopped) return

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

  unsubscribe = deps.bus.subscribe(projectId, (frame: StreamFrame) => {
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
      error:
        (error as { code?: string } | null | undefined)?.code ??
        (error as Error | null | undefined)?.name,
    }),
  )
}
