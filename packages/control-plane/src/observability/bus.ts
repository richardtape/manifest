import { desc, eq } from 'drizzle-orm'
import { events, type Db } from '../db/index.js'
import type { StoredBuildLogLine } from './build-logs.js'
import { EventError, recordEvent, type Event, type EventInput } from './events.js'
import type { Redactor } from './redact.js'

/** The frame that ends a connection's replay and begins its live stream. */
export const STREAM_READY = 'manifest.stream.ready'

/**
 * What travels over `WS /projects/:projectId/events` (D23.2). `kind` is what a client
 * switches on.
 *
 * TWO KINDS OF CONTENT, deliberately. An `event` is a row of the append-only
 * `audit.events` table, so a client that reconnects is replayed it. A `log` is one line
 * of a build's output: durable in `audit.build_logs` and served by
 * `GET /builds/:buildId/logs`, but never written to `events` — a two-minute build is
 * hundreds of lines, and §6's `Event` is an audit record, not a transport.
 */
export type StreamFrame =
  | {
      kind: 'event'
      id: string
      projectId: string
      subject: string
      type: string
      humanMessage: string
      machineDetail: unknown
      createdAt: string
    }
  | {
      kind: 'log'
      /** `<buildId>:<seq>` — the line's key in `audit.build_logs`. */
      id: string
      projectId: string
      buildId: string
      seq: number
      stream: 'stdout' | 'stderr'
      text: string
      createdAt: string
    }
  | { kind: 'control'; id: string; projectId: string; type: typeof STREAM_READY }

/**
 * Past this many bytes queued for one socket, the socket is closed with 1013 (Try Again
 * Later) rather than buffered further. A stream with no backpressure is a memory leak
 * with a URL: one tab left open behind a slow link during a chatty build would hold
 * every line of it in this process. The client reconnects, and is replayed.
 */
export const MAX_BUFFERED_BYTES = 1_048_576

/** How many recorded events a new connection is replayed. */
export const REPLAY_LIMIT = 50

/** An `events` row as a frame. The one producer of that shape. */
export function eventFrame(event: Event): StreamFrame {
  return {
    kind: 'event',
    id: event.id,
    projectId: event.projectId,
    subject: event.subject,
    type: event.type,
    humanMessage: event.humanMessage,
    machineDetail: event.machineDetail,
    createdAt: event.createdAt.toISOString(),
  }
}

/**
 * A stored build-log line as a frame. The line's text must already be REDACTED — it is
 * what `createBuildLogWriter` hands its `onLine`, which is the only caller.
 */
export function logFrame(
  projectId: string,
  buildId: string,
  line: StoredBuildLogLine,
): StreamFrame {
  return {
    kind: 'log',
    id: `${buildId}:${line.seq}`,
    projectId,
    buildId,
    seq: line.seq,
    stream: line.stream,
    text: line.text,
    createdAt: line.at.toISOString(),
  }
}

export function readyFrame(projectId: string): StreamFrame {
  return { kind: 'control', id: 'ready', projectId, type: STREAM_READY }
}

export interface EventBus {
  /** Hands a frame to every current subscriber of its project. Never throws. */
  publish(frame: StreamFrame): void
  /** Returns the unsubscribe. Each call is its own subscription. */
  subscribe(projectId: string, listener: (frame: StreamFrame) => void): () => void
  /**
   * How many subscriptions a project has. A socket that closed and stayed subscribed is
   * a leak nothing else would show, so this is what the stream's tests read.
   */
  listenerCount(projectId: string): number
}

/**
 * The in-process fan-out, per project.
 *
 * In-process because one control-plane process serves the platform (P4b's *What this
 * plan does not build*). A second process would need Postgres `LISTEN`/`NOTIFY`, and
 * this function is the seam.
 */
export function createEventBus(): EventBus {
  const byProject = new Map<string, Set<(frame: StreamFrame) => void>>()
  return {
    publish(frame) {
      const listeners = byProject.get(frame.projectId)
      if (listeners === undefined) return
      // A copy: a listener that unsubscribes while being called must not skip the next.
      for (const listener of [...listeners]) {
        try {
          listener(frame)
        } catch (error) {
          // ONE socket failing must not stop the others, and must not vanish either —
          // `.catch(() => undefined)` is this codebase's most productive defect. The
          // operator's copy, on stderr, because the server runs with `logger: false`.
          // The frame's id and type, never its content.
          console.error(
            JSON.stringify({
              level: 'error',
              msg: 'an event-stream subscriber threw; the other subscribers still received the frame',
              projectId: frame.projectId,
              frame: frame.id,
              error: error instanceof Error ? error.message : String(error),
            }),
          )
        }
      }
    },
    subscribe(projectId, listener) {
      let listeners = byProject.get(projectId)
      if (listeners === undefined) {
        listeners = new Set()
        byProject.set(projectId, listeners)
      }
      // A wrapper per call, so subscribing one function twice is two subscriptions and
      // each unsubscribe removes exactly its own.
      const subscription = (frame: StreamFrame): void => listener(frame)
      const set = listeners
      set.add(subscription)
      return () => {
        set.delete(subscription)
        if (set.size === 0 && byProject.get(projectId) === set)
          byProject.delete(projectId)
      }
    },
    listenerCount(projectId) {
      return byProject.get(projectId)?.size ?? 0
    },
  }
}

/**
 * **The one way an event is written** (P4b Task 15): recorded, then streamed.
 *
 * One helper rather than two calls at each site. A site that records without publishing
 * is a silent stream; a site that publishes without recording is an event that vanishes
 * on reconnect, because the replay reads the TABLE. Written separately at every call
 * site, that is a chance per site to do one and not the other — and both failures pass
 * every test that looks at only one of them.
 *
 * RECORDED FIRST, and what is published is the row AS STORED — redacted, with its id and
 * time — never the caller's input. A refused record publishes nothing.
 *
 * One limit, named: if `db` is a transaction its caller later rolls back, the frame has
 * already gone out. Every production call site writes on the pool.
 */
export async function publishEvent(
  db: Db,
  bus: EventBus,
  input: EventInput,
  redact: Redactor,
): Promise<Event> {
  const event = await recordEvent(db, input, redact)
  bus.publish(eventFrame(event))
  return event
}

/**
 * The replay: a project's newest `limit` events, returned OLDEST FIRST — a build's
 * events read newest first are a build that fails before it starts.
 *
 * Ordered by `created_at`, which is `clock_timestamp()` rather than `now()` (migration
 * 0007): `now()` is the transaction's start, so every event one transaction wrote
 * carried the same instant and came back in whatever order the index held. `id` breaks
 * a tie at the microsecond, so the order is at least stable.
 */
export async function recentFramesFor(
  db: Db,
  projectId: string,
  limit: number,
): Promise<StreamFrame[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new EventError(
      'EVENT_REPLAY_LIMIT_INVALID',
      `a replay is a whole number of events of at least 1, not ${limit}`,
    )
  }
  const newestFirst = await db
    .select()
    .from(events)
    .where(eq(events.projectId, projectId))
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(limit)
  return newestFirst.reverse().map(eventFrame)
}
