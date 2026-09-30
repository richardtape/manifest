import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import pg from 'pg'
import WebSocket from 'ws'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, asc, eq } from 'drizzle-orm'
import { fakeLiteLlm } from '../ai/testing.js'
import { events } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { SESSION_COOKIE, SESSION_TTL_MS } from '../identity/index.js'
import {
  ensureTestUser,
  testSessionCookies,
  type TestUserPuid,
} from '../identity/testing.js'
import { eventFrame, recordEvent, type StreamFrame } from '../observability/index.js'
import { EXAMPLE_DETAILS } from '../observability/testing.js'
import { mintTestToken } from '../tokens/testing.js'
import { buildServer, type ServerDeps } from './server.js'
import { loginAs, mutationHeaders, projectBody, refusal, testDeps } from './testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

/**
 * Every server and socket a test opens, closed after it — a listening server left
 * behind holds a port and the event loop, and the next file inherits both.
 */
const opened: { apps: FastifyInstance[]; sockets: WebSocket[] } = {
  apps: [],
  sockets: [],
}
afterEach(async () => {
  for (const socket of opened.sockets.splice(0)) socket.terminate()
  for (const app of opened.apps.splice(0)) await app.close()
})

/**
 * A LISTENING server, because `app.inject` cannot perform a WebSocket upgrade — which
 * is the whole reason the route has an HTTP half.
 */
async function streamServer(
  /** Laid over `testDeps()`'s — `{ llm: fakeLiteLlm() }` for a test that starts an agent session. */
  overrides: Partial<ServerDeps> = {},
) {
  const deps = { ...(await testDeps()), ...overrides }
  const app = await buildServer(deps)
  opened.apps.push(app)
  const owner = await loginAs(deps, 'bio_prof')
  const created = await app.inject({
    method: 'POST',
    url: '/v1/projects',
    payload: projectBody(`chem-${randomUUID().slice(0, 6)}`),
    cookies: owner,
    headers: mutationHeaders(deps),
  })
  const projectId: string = created.json().id
  // Creation records three events of its own (P5a Task 11), so every replay starts with them.
  const creation = (
    await deps.db
      .select({ id: events.id, type: events.type })
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(asc(events.createdAt))
  ).map((row) => row.id)
  await app.listen({ port: 0, host: '127.0.0.1' })
  const { port } = app.server.address() as AddressInfo
  const urlFor = (id: string) => `ws://127.0.0.1:${port}/v1/projects/${id}/events`
  /**
   * `origin` is the console's own by default, which is what a browser on the console
   * sends on every handshake (P5a Task 4); `null` sends none at all.
   */
  const connect = async (
    /**
     * A person by PUID, a session cookie already made (one close to its expiry), or a delegated
     * token's plaintext (the launch path plan's Task 5).
     */
    who:
      | TestUserPuid
      | 'anonymous'
      | { cookies: Record<string, string> }
      | { bearer: string },
    id = projectId,
    origin: string | null = deps.config.sp.origin,
    /** The `Host` the handshake ARRIVES on (the front-end enablement plan's Task 8). */
    host?: string,
  ) => {
    const bearer = typeof who === 'object' && 'bearer' in who ? who.bearer : undefined
    const cookie =
      typeof who === 'object'
        ? 'cookies' in who
          ? who.cookies[SESSION_COOKIE]
          : undefined
        : who === 'anonymous'
          ? undefined
          : (await loginAs(deps, who))[SESSION_COOKIE]
    const headers = {
      ...(cookie === undefined ? {} : { cookie: `${SESSION_COOKIE}=${cookie}` }),
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
      // A TOKEN SENDS NO ORIGIN, as `packages/contract`'s `subscribe` sends none for one: §20's
      // origin check is for a credential a browser sends by itself.
      ...(origin === null || bearer !== undefined ? {} : { origin }),
      ...(host === undefined ? {} : { host }),
    }
    const socket = new WebSocket(urlFor(id), { headers })
    // `ws` emits 'error' for a refused upgrade, and an 'error' with no listener is an
    // uncaught exception that lands on whichever test runs next. Each test reads the
    // refusal through `outcomeOf`, or times out naming what it was waiting for.
    socket.on('error', () => undefined)
    opened.sockets.push(socket)
    return socket
  }
  return { app, deps, owner, projectId, connect, creation }
}

/** Every frame a socket receives, from the moment it is created. */
function recorder(socket: WebSocket) {
  const frames: StreamFrame[] = []
  socket.on('message', (data) => frames.push(JSON.parse(String(data)) as StreamFrame))
  return frames
}

// Shorter than Vitest's 5 s test timeout, so a wait that fails names what it waited for.
async function waitUntil(
  // A database read too (Task 5's window test), so a promise is awaited rather than read as truthy.
  condition: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 3_000,
) {
  const deadline = Date.now() + timeoutMs
  while (!(await condition())) {
    if (Date.now() > deadline)
      throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/**
 * How the server ended a connection: an HTTP status before the upgrade, or a close code after
 * it — or `opened`, for an upgrade that was ACCEPTED. Without that third answer an upgrade that
 * should have been refused neither refuses nor closes, and the test dies on Vitest's 5 s
 * timeout without saying why (P5a Task 4's control (b) read exactly that way).
 */
function outcomeOf(socket: WebSocket, timeoutMs = 10_000) {
  return new Promise<{ status?: number; closeCode?: number; opened?: true }>(
    (resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `the server neither refused nor closed the socket within ${timeoutMs} ms`,
            ),
          ),
        timeoutMs,
      )
      socket.on('unexpected-response', (_request, response) => {
        clearTimeout(timer)
        resolve({ status: response.statusCode ?? 0 })
      })
      socket.on('close', (code) => {
        clearTimeout(timer)
        resolve({ closeCode: code })
      })
      // Only a socket that has not opened yet can report it: one a test already watched open
      // (the 1013 test) never emits 'open' again, so its close code still decides.
      if (socket.readyState === socket.CONNECTING) {
        socket.on('open', () => {
          clearTimeout(timer)
          resolve({ opened: true })
        })
      }
      socket.on('error', () => undefined)
    },
  )
}

const liveFrame = (
  projectId: string,
  id: string,
  type = 'instance.failed',
): StreamFrame => ({
  kind: 'event',
  id,
  projectId,
  subject: 'instance:x',
  type,
  humanMessage: 'Live.',
  machineDetail: {},
  createdAt: new Date().toISOString(),
})

const isReady = (f: StreamFrame) =>
  f.kind === 'control' && f.type === 'manifest.stream.ready'

describe('WS /v1/projects/:projectId/events (D23.2)', () => {
  it('answers a plain GET from an authorized actor with 426 and the Upgrade header', async () => {
    // What makes the stream coverable by §16's authorization contract suite, which can
    // only speak HTTP. RFC 9110 requires the Upgrade header on a 426.
    const { app, owner, projectId } = await streamServer()
    const res = await app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}/events`,
      cookies: owner,
    })
    expect(res.statusCode).toBe(426)
    expect(res.headers.upgrade).toBe('websocket')
    expect(res.json().error.code).toBe('EVENTS_UPGRADE_REQUIRED')
  })

  it('refuses the UPGRADE itself for a stranger (404) and for nobody (401) — no socket, no subscription', async () => {
    // The assertion that matters, and the one app.inject cannot make. A route whose
    // HTTP half is guarded and whose socket half is not passes the whole contract
    // suite and leaks every event. An HTTP status is only possible BEFORE the upgrade:
    // a refusal after it can only be a close code.
    const { deps, projectId, connect } = await streamServer()
    const stranger = await connect('unrelated_user')
    const strangerFrames = recorder(stranger)
    expect(await outcomeOf(stranger)).toEqual({ status: 404 })
    const nobody = await connect('anonymous')
    expect(await outcomeOf(nobody)).toEqual({ status: 401 })
    expect(strangerFrames).toEqual([])
    expect(deps.bus.listenerCount(projectId)).toBe(0)
  })

  it('refuses an UPGRADE carrying a member’s session from another origin, or from none (P5a Task 4)', async () => {
    // Cross-site WebSocket hijacking. A deployed app is SAME-SITE with the console, so a
    // page it serves can open this stream with a member's cookie and READ the project's
    // events — `SameSite=Lax` does not stop it. An HTTP status, not a close code: the
    // refusal is before the upgrade, and no subscription ever exists.
    const { deps, projectId, connect } = await streamServer()
    const sibling = await connect(
      'bio_prof',
      projectId,
      'https://proof-app.staging.manifest.internal',
    )
    const siblingFrames = recorder(sibling)
    expect(await outcomeOf(sibling)).toEqual({ status: 403 })
    const none = await connect('bio_prof', projectId, null)
    expect(await outcomeOf(none)).toEqual({ status: 403 })
    expect(siblingFrames).toEqual([])
    expect(deps.bus.listenerCount(projectId)).toBe(0)

    // THE POSITIVE CONTROL, on the same server: the same member from the console's own
    // origin gets the stream — so the refusals above are the origin's, not the member's.
    const own = await connect('bio_prof')
    const frames = recorder(own)
    await waitUntil(() => frames.some(isReady), 'the ready frame from the console origin')
  })

  it('refuses an UPGRADE on app whose Origin is the console, and streams one whose Origin is app (Task 8)', async () => {
    // The front-end enablement plan's Task 8, Decision 16: each origin's stream is exactly as
    // same-origin as the console's alone was. The handshake's Host is the origin it arrived on.
    const { deps, projectId, connect } = await streamServer()
    const crossed = await connect(
      'bio_prof',
      projectId,
      'https://console.manifest.internal',
      'app.manifest.internal',
    )
    const crossedFrames = recorder(crossed)
    expect(await outcomeOf(crossed)).toEqual({ status: 403 })
    expect(crossedFrames).toEqual([])
    expect(deps.bus.listenerCount(projectId)).toBe(0)

    // THE POSITIVE CONTROL: the same member on app, from app, gets the stream.
    const own = await connect(
      'bio_prof',
      projectId,
      'https://app.manifest.internal',
      'app.manifest.internal',
    )
    const frames = recorder(own)
    await waitUntil(() => frames.some(isReady), 'the ready frame on the app origin')
  })

  it('replays what was recorded, marks the boundary, then streams live — to a collaborator too', async () => {
    // A client that connects during a build must see what it missed. Without the
    // boundary frame it cannot tell a replayed failure from a new one.
    const { app, deps, projectId, connect, creation } = await streamServer()
    expect(creation).toHaveLength(3)
    // The user row first: a member is added by PUID, and a PUID nobody has logged in
    // with is not a user. Asserted, because a collaborator who is secretly a stranger
    // makes this test indistinguishable from the refusal test above.
    await loginAs(deps, 'bio_student')
    const added = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/members`,
      payload: { puid: 'bio_student', role: 'collaborator' },
      // STEPPED UP: §20 guards `members:manage` since P6a Task 9, and this test is about
      // what the STREAM replays rather than about the second round trip.
      cookies: await loginAs(deps, 'bio_prof', { steppedUp: true }),
      headers: mutationHeaders(deps),
    })
    expect(added.statusCode).toBeLessThan(300)
    // Adding a member is itself an event since the front-end enablement plan's Task 7, so the
    // replay carries it between the creation and the row recorded below.
    const [memberAdded] = await deps.db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.projectId, projectId), eq(events.type, 'member.added')))
    expect(memberAdded).toBeDefined()
    const recorded = await recordEvent(
      deps.db,
      {
        projectId,
        subject: 'sp:x',
        type: 'sso.registered',
        machineDetail: EXAMPLE_DETAILS['sso.registered'],
        humanMessage: 'Set up.',
      },
      (v) => v,
    )
    const socket = await connect('bio_student')
    const frames = recorder(socket)
    await waitUntil(() => frames.some(isReady), 'the ready frame')
    deps.bus.publish(liveFrame(projectId, 'live-1'))
    await waitUntil(() => frames.some((f) => f.id === 'live-1'), 'the live frame')
    expect(frames.map((f) => f.id)).toEqual([
      ...creation,
      memberAdded!.id,
      recorded.id,
      'ready',
      'live-1',
    ])
    expect(frames[4]).toEqual(eventFrame(recorded))
  })

  it('delivers a frame published WHILE the replay is being read — once, after the boundary', async () => {
    // The ordering is the correctness of the whole route: replaying before subscribing
    // loses everything published in between, and not de-duplicating repeats what the
    // replay already sent. Made deterministic rather than hoped for: a second
    // connection holds `audit.events` locked, so the replay's read waits while an event
    // is recorded (invisible until COMMIT) and published, alongside one never recorded.
    const { deps, projectId, connect, creation } = await streamServer()
    const admin = new pg.Pool({
      connectionString: process.env.MANIFEST_ADMIN_DATABASE_URL,
    })
    const lock = await admin.connect()
    try {
      await lock.query('BEGIN')
      await lock.query('LOCK TABLE audit.events IN ACCESS EXCLUSIVE MODE')
      const socket = await connect('bio_prof')
      const frames = recorder(socket)
      await waitUntil(() => deps.bus.listenerCount(projectId) === 1, 'the subscription')
      const { rows } = await lock.query<{ id: string; created_at: Date }>(
        `INSERT INTO audit.events (project_id, subject, type, machine_detail, human_message)
         VALUES ($1, 's', 'instance.failed', '{}', 'Recorded during the replay.')
         RETURNING id, created_at`,
        [projectId],
      )
      const during = rows[0]!
      deps.bus.publish(
        eventFrame({
          id: during.id,
          projectId,
          subject: 's',
          type: 'instance.failed',
          machineDetail: {},
          humanMessage: 'Recorded during the replay.',
          createdAt: during.created_at,
        }),
      )
      deps.bus.publish(liveFrame(projectId, 'live-during'))
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(frames, 'nothing is sent while the replay is still being read').toEqual([])
      await lock.query('COMMIT')
      await waitUntil(
        () => frames.some((f) => f.id === 'live-during'),
        'the frame published during the replay',
      )
      expect(frames.map((f) => f.id)).toEqual([
        ...creation,
        during.id,
        'ready',
        'live-during',
      ])
    } finally {
      await lock.query('ROLLBACK')
      lock.release()
      await admin.end()
    }
  })

  it('does not deliver another project’s frames', async () => {
    const { app, deps, owner, projectId, connect, creation } = await streamServer()
    const other = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: projectBody(`other-${randomUUID().slice(0, 6)}`),
      cookies: owner,
      headers: mutationHeaders(deps),
    })
    const socket = await connect('bio_prof')
    const frames = recorder(socket)
    await waitUntil(() => frames.some(isReady), 'the ready frame')
    deps.bus.publish(liveFrame(other.json().id, 'theirs'))
    deps.bus.publish(liveFrame(projectId, 'ours'))
    await waitUntil(() => frames.some((f) => f.id === 'ours'), 'our frame')
    // Our creation's three replayed, the other project's never.
    expect(frames.map((f) => f.id)).toEqual([...creation, 'ready', 'ours'])
  })

  it('closes a socket that cannot keep up with 1013, stops sending to it, and unsubscribes it', async () => {
    // A stream with no backpressure is a memory leak with a URL. Past the cap the
    // socket is closed with 1013 (Try Again Later); the client reconnects, and the
    // replay reads what it can from the table.
    const { deps, projectId, connect } = await streamServer()
    const socket = await connect('bio_prof')
    const frames = recorder(socket)
    await waitUntil(() => frames.some(isReady), 'the ready frame')
    const outcome = outcomeOf(socket)
    socket.pause()
    const text = 'x'.repeat(500)
    const published = 20_000
    for (let seq = 0; seq < published; seq++) {
      deps.bus.publish({
        kind: 'log',
        id: `b1:${seq}`,
        projectId,
        buildId: 'b1',
        seq,
        stream: 'stdout',
        text,
        createdAt: new Date().toISOString(),
      })
    }
    socket.resume()
    expect(await outcome).toEqual({ closeCode: 1013 })
    // STOPPED, not merely closed at the end: a server that queued all 20,000 and then
    // closed would pass the line above.
    expect(frames.filter((f) => f.kind === 'log').length).toBeLessThan(published / 2)
    expect(deps.bus.listenerCount(projectId)).toBe(0)
  })

  it('unsubscribes a socket its client closes', async () => {
    const { deps, projectId, connect } = await streamServer()
    const socket = await connect('bio_prof')
    const frames = recorder(socket)
    await waitUntil(() => frames.some(isReady), 'the ready frame')
    expect(deps.bus.listenerCount(projectId)).toBe(1)
    socket.close()
    await waitUntil(() => deps.bus.listenerCount(projectId) === 0, 'the unsubscribe')
  })
})

/**
 * How the server closed a stream that was OPEN — its code, its reason, and when — or a named
 * timeout. Listen BEFORE the action that should close it: a close already seen is never seen again.
 */
function closeOf(socket: WebSocket, timeoutMs = 3_000) {
  return new Promise<{ code: number; reason: string; at: number }>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error(`the server did not close the stream within ${timeoutMs} ms`)),
      timeoutMs,
    )
    socket.on('close', (code, reason) => {
      clearTimeout(timer)
      resolve({ code, reason: String(reason), at: Date.now() })
    })
  })
}

const eventTypesOf = (frames: StreamFrame[]) =>
  frames.flatMap((f) => (f.kind === 'event' ? [f.type] : []))

/**
 * FE-33 (the launch path plan's Task 5): a stream whose credential is gone is CLOSED, at the moment
 * it goes. Task 1 measured a revoked token's socket open 30 s later and still hearing
 * `project.renamed` — the credential gone, the project still heard. `4401` for a revoked, expired or
 * archived credential; `4404` for a deleted project.
 */
describe('a stream whose credential is gone is closed, at the moment it goes (FE-33)', () => {
  type Server = Awaited<ReturnType<typeof streamServer>>

  /** A token of the project's owner, on it, and its stream — open, and past its replay. */
  async function tokenStream(
    server: Server,
    options: { capabilities?: string[]; expiresAt?: Date } = {},
  ) {
    const owner = await ensureTestUser(server.deps.db, 'bio_prof')
    const token = await mintTestToken(server.deps.db, {
      userId: owner.id,
      projectId: server.projectId,
      capabilities: options.capabilities ?? ['project:read'],
      ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
    })
    const socket = await server.connect({ bearer: token.plaintext })
    const frames = recorder(socket)
    await waitUntil(() => frames.some(isReady), 'the token stream’s ready frame')
    return { token, socket, frames }
  }

  /** The owner's own session stream — open, and past its replay. */
  async function sessionStream(server: Server) {
    const socket = await server.connect('bio_prof')
    const frames = recorder(socket)
    await waitUntil(() => frames.some(isReady), 'the session stream’s ready frame')
    return { socket, frames }
  }

  const revoke = (server: Server, tokenId: string) =>
    server.app.inject({
      method: 'DELETE',
      url: `/v1/tokens/${tokenId}`,
      cookies: server.owner,
      headers: mutationHeaders(server.deps),
    })

  /** `updateProject`, which publishes `project.renamed` — what Task 1 measured a revoked stream hear. */
  async function rename(server: Server, name: string) {
    const res = await server.app.inject({
      method: 'PATCH',
      url: `/v1/projects/${server.projectId}`,
      payload: { name },
      cookies: server.owner,
      headers: mutationHeaders(server.deps),
    })
    expect(res.statusCode, res.body).toBe(200)
  }

  it('a revoked token’s open stream closes 4401, and hears nothing after the revoke', async () => {
    const server = await streamServer()
    const { token, socket, frames } = await tokenStream(server)
    const closed = closeOf(socket)
    const res = await revoke(server, token.row.id)
    expect(res.statusCode, res.body).toBe(200)
    expect(await closed).toMatchObject({
      code: 4401,
      reason: expect.stringContaining('revoked'),
    })
    await rename(server, 'Renamed after the revoke')
    expect(eventTypesOf(frames)).not.toContain('project.renamed')
    // UNSUBSCRIBED, and UNREGISTERED: nothing of the stream is left for a later revoke to find.
    expect(server.deps.bus.listenerCount(server.projectId)).toBe(0)
    expect(server.deps.streams.closeToken(token.row.id)).toBe(0)
  })

  it('a second token’s stream on the same project stays open — closing is per token', async () => {
    const server = await streamServer()
    const revoked = await tokenStream(server)
    const kept = await tokenStream(server)
    const closed = closeOf(revoked.socket)
    expect((await revoke(server, revoked.token.row.id)).statusCode).toBe(200)
    expect((await closed).code).toBe(4401)
    // THE POSITIVE CONTROL for the test above: the same rename, heard by the stream still open.
    await rename(server, 'Renamed while the second token watches')
    await waitUntil(
      () => eventTypesOf(kept.frames).includes('project.renamed'),
      'project.renamed on the second token’s stream',
    )
    expect(kept.socket.readyState).toBe(WebSocket.OPEN)
    expect(eventTypesOf(revoked.frames)).not.toContain('project.renamed')
    expect(server.deps.bus.listenerCount(server.projectId)).toBe(1)
  })

  it('a session stream stays open when a token on the project is revoked', async () => {
    const server = await streamServer()
    const session = await sessionStream(server)
    const { token, socket } = await tokenStream(server)
    const closed = closeOf(socket)
    expect((await revoke(server, token.row.id)).statusCode).toBe(200)
    expect((await closed).code).toBe(4401)
    await rename(server, 'Renamed while the owner watches')
    await waitUntil(
      () => eventTypesOf(session.frames).includes('project.renamed'),
      'project.renamed on the session stream',
    )
    expect(session.socket.readyState).toBe(WebSocket.OPEN)
  })

  it('an expired token’s stream closes 4401 at its expiry', async () => {
    // A REAL timer, not a fake one: the route arms it from the token's own `expires_at`.
    const server = await streamServer()
    const expiresAt = new Date(Date.now() + 1_500)
    const { socket } = await tokenStream(server, { expiresAt })
    const closed = await closeOf(socket, 3_000)
    expect(closed).toMatchObject({
      code: 4401,
      reason: expect.stringContaining('expired'),
    })
    // AT its expiry, not before: a timer armed at nought closes at once, which this refuses.
    expect(closed.at).toBeGreaterThanOrEqual(expiresAt.getTime())
  }, 10_000)

  it('a session’s stream closes 4401 when the session expires — a session is armed too', async () => {
    // A Phase 1 session cannot be revoked (§20), so its expiry is the bound this stream can enforce.
    const server = await streamServer()
    const owner = await ensureTestUser(server.deps.db, 'bio_prof')
    const expiresAt = Date.now() + 1_500
    const cookies = testSessionCookies(
      owner,
      server.deps.config.sessionSecret,
      expiresAt - SESSION_TTL_MS,
    )
    const socket = await server.connect({ cookies })
    const frames = recorder(socket)
    await waitUntil(() => frames.some(isReady), 'the ready frame')
    const closed = await closeOf(socket, 3_000)
    expect(closed).toMatchObject({
      code: 4401,
      reason: expect.stringContaining('expired'),
    })
    expect(closed.at).toBeGreaterThanOrEqual(expiresAt)
  }, 10_000)

  it('a revoked token’s stream closes even when ending its sessions fails', async () => {
    // Ending an agent session needs the model gateway; closing a stream does not — so the close comes
    // FIRST, and a gateway outage never leaves a revoked token listening.
    const lite = fakeLiteLlm()
    const server = await streamServer({ llm: lite })
    const { token, socket } = await tokenStream(server, {
      capabilities: ['project:read', 'agent:session'],
    })
    const started = await server.app.inject({
      method: 'POST',
      url: `/v1/projects/${server.projectId}/agent-sessions`,
      payload: { name: 'Build the bulletin board' },
      headers: {
        authorization: `Bearer ${token.plaintext}`,
        'idempotency-key': randomUUID(),
      },
    })
    expect(started.statusCode, started.body).toBe(201)
    const closed = closeOf(socket)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let res: Awaited<ReturnType<typeof revoke>>
    try {
      // The control plane restarted with AI off while the session's key is still live.
      server.deps.llm = undefined
      res = await revoke(server, token.row.id)
    } finally {
      server.deps.llm = lite
      logged.mockRestore()
    }
    expect(refusal(res)).toEqual({ status: 503, code: 'AI_CATALOGUE_DISABLED' })
    expect(await closed).toMatchObject({
      code: 4401,
      reason: expect.stringContaining('revoked'),
    })
  })

  it('a token revoked after its upgrade authenticated, and before its stream registered, is closed 4401 by the stream’s own second read', async () => {
    // THE WINDOW (the controller's ruling): the credential hook reads the token, then the stream
    // registers. A revoke that commits in between calls `closeToken` on NOTHING — so the stream
    // reads the token again once it is registered. Made deterministic: a second connection holds
    // the token's row with the revoke written and not committed, so the hook's read sees it live
    // and its `last_used_at` stamp waits on the row; the revoke commits while it waits. No
    // `closeToken` is called here at all — the one the route would call found nothing registered.
    const server = await streamServer()
    const owner = await ensureTestUser(server.deps.db, 'bio_prof')
    const token = await mintTestToken(server.deps.db, {
      userId: owner.id,
      projectId: server.projectId,
      capabilities: ['project:read'],
    })
    const admin = new pg.Pool({
      connectionString: process.env.MANIFEST_ADMIN_DATABASE_URL,
    })
    const lock = await admin.connect()
    try {
      await lock.query('BEGIN')
      await lock.query('UPDATE delegated_tokens SET revoked_at = now() WHERE id = $1', [
        token.row.id,
      ])
      const socket = await server.connect({ bearer: token.plaintext })
      const frames = recorder(socket)
      const outcome = closeOf(socket, 5_000)
      await waitUntil(async () => {
        const { rows } = await admin.query<{ waiting: string }>(
          `SELECT count(*) AS waiting FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query ILIKE '%delegated_tokens%'`,
        )
        return Number(rows[0]!.waiting) > 0
      }, 'the hook’s last_used_at stamp waiting on the token’s row')
      await lock.query('COMMIT')
      expect(await outcome).toMatchObject({ code: 4401 })
      // Never subscribed: it was closed before its replay, and heard nothing of the project.
      expect(frames).toEqual([])
      expect(server.deps.bus.listenerCount(server.projectId)).toBe(0)
      expect(server.deps.streams.closeToken(token.row.id)).toBe(0)
    } finally {
      await lock.query('ROLLBACK')
      lock.release()
      await admin.end()
    }
  }, 15_000)

  it('archiving closes the streams of the tokens it revoked, 4401, and leaves a member’s session stream open', async () => {
    // `project:read` is allowed on an archived project (§11, Decision 27): a person may still watch
    // it. Closing their stream would be a second, unstated rule.
    const server = await streamServer()
    const session = await sessionStream(server)
    const { socket, frames } = await tokenStream(server)
    const closed = closeOf(socket)
    const archived = await server.app.inject({
      method: 'POST',
      url: `/v1/projects/${server.projectId}/archive`,
      cookies: await loginAs(server.deps, 'bio_prof', { steppedUp: true }),
      headers: mutationHeaders(server.deps),
      payload: {},
    })
    expect(archived.statusCode, archived.body).toBe(200)
    expect(await closed).toMatchObject({
      code: 4401,
      reason: expect.stringContaining('revoked'),
    })
    // The member's stream hears the archive end — it is open, and live — and the token's never did:
    // it was closed when the revoke committed, before the teardown that ends in `project.archived`.
    await waitUntil(
      () => eventTypesOf(session.frames).includes('project.archived'),
      'project.archived on the member’s session stream',
    )
    expect(session.socket.readyState).toBe(WebSocket.OPEN)
    expect(eventTypesOf(frames)).not.toContain('project.archived')
    expect(server.deps.bus.listenerCount(server.projectId)).toBe(1)
  }, 15_000)

  it('deleting a project closes every stream on it: a session’s 4404 at the tombstone, a token’s 4401 when the switch-off revoked it', async () => {
    const server = await streamServer()
    const session = await sessionStream(server)
    const token = await tokenStream(server)
    const sessionClosed = closeOf(session.socket, 10_000)
    const tokenClosed = closeOf(token.socket, 10_000)
    const deleted = await server.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${server.projectId}`,
      cookies: await loginAs(server.deps, 'bio_prof', { steppedUp: true }),
      headers: mutationHeaders(server.deps),
    })
    expect(deleted.statusCode, deleted.body).toBe(200)
    expect(await sessionClosed).toMatchObject({ code: 4404 })
    expect(await tokenClosed).toMatchObject({
      code: 4401,
      reason: expect.stringContaining('revoked'),
    })
    // The session's stream heard the delete itself before it closed: closed AFTER the tombstone's
    // event, not before it.
    expect(eventTypesOf(session.frames)).toContain('project.deleted')
    expect(server.deps.bus.listenerCount(server.projectId)).toBe(0)
    expect(server.deps.streams.closeProject(server.projectId)).toBe(0)
  }, 15_000)

  it('closing the server unregisters every stream it holds — nothing is left for the next test', async () => {
    // An entry left registered keeps its expiry timer, and the timer keeps the socket's closure.
    const server = await streamServer()
    const session = await sessionStream(server)
    const { token } = await tokenStream(server)
    opened.apps.splice(opened.apps.indexOf(server.app), 1)
    await server.app.close()
    // Unregistered by the close itself, whether or not each socket's own `close` has fired yet.
    expect(server.deps.streams.closeToken(token.row.id)).toBe(0)
    expect(server.deps.streams.closeProject(server.projectId)).toBe(0)
    expect(server.deps.bus.listenerCount(server.projectId)).toBe(0)
    // And the sockets were closed, not merely forgotten.
    await waitUntil(
      () => session.socket.readyState === WebSocket.CLOSED,
      'the session stream closed by the server’s close',
    )
  })
})
