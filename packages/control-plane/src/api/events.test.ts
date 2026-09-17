import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import pg from 'pg'
import WebSocket from 'ws'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { events } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { SESSION_COOKIE } from '../identity/index.js'
import type { TestUserPuid } from '../identity/testing.js'
import { eventFrame, recordEvent, type StreamFrame } from '../observability/index.js'
import { buildServer } from './server.js'
import { loginAs, mutationHeaders, projectBody, testDeps } from './testing.js'

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
async function streamServer() {
  const deps = await testDeps()
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
    puid: TestUserPuid | 'anonymous',
    id = projectId,
    origin: string | null = deps.config.sp.origin,
  ) => {
    const headers = {
      ...(puid === 'anonymous'
        ? {}
        : { cookie: `${SESSION_COOKIE}=${(await loginAs(deps, puid))[SESSION_COOKIE]}` }),
      ...(origin === null ? {} : { origin }),
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
async function waitUntil(condition: () => boolean, what: string, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
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

  it('replays what was recorded, marks the boundary, then streams live — to a collaborator too', async () => {
    // A client that connects during a build must see what it missed. Without the
    // boundary frame it cannot tell a replayed failure from a new one.
    const { app, deps, owner, projectId, connect, creation } = await streamServer()
    expect(creation).toHaveLength(3)
    // The user row first: a member is added by PUID, and a PUID nobody has logged in
    // with is not a user. Asserted, because a collaborator who is secretly a stranger
    // makes this test indistinguishable from the refusal test above.
    await loginAs(deps, 'bio_student')
    const added = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/members`,
      payload: { puid: 'bio_student', role: 'collaborator' },
      cookies: owner,
      headers: mutationHeaders(deps),
    })
    expect(added.statusCode).toBeLessThan(300)
    const recorded = await recordEvent(
      deps.db,
      {
        projectId,
        subject: 'sp:x',
        type: 'sso.registered',
        machineDetail: {},
        humanMessage: 'Set up.',
      },
      (v) => v,
    )
    const socket = await connect('bio_student')
    const frames = recorder(socket)
    await waitUntil(() => frames.some(isReady), 'the ready frame')
    deps.bus.publish(liveFrame(projectId, 'live-1'))
    await waitUntil(() => frames.some((f) => f.id === 'live-1'), 'the live frame')
    expect(frames.map((f) => f.id)).toEqual([...creation, recorded.id, 'ready', 'live-1'])
    expect(frames[3]).toEqual(eventFrame(recorded))
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
