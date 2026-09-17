import { SESSION_COOKIE } from './client.js'
import type { components } from './schema.js'

export type StreamFrame = components['schemas']['StreamFrame']
export type EventFrame = components['schemas']['EventFrame']
export type LogFrame = components['schemas']['LogFrame']
export type ControlFrame = components['schemas']['ControlFrame']

export interface SubscribeOptions {
  /** The console's origin. The stream is `wss://<origin>/v1/projects/<projectId>/events`. */
  origin: string
  /** The session cookie's value, for a client that is not a browser. */
  session?: string
  projectId: string
  onFrame(frame: StreamFrame): void
}

export interface Subscription {
  /**
   * Resolves on the ready frame, after the replay; rejects if the socket closes first —
   * which is also how a REFUSED upgrade shows (close 1006: a WebSocket client is shown no
   * HTTP status).
   */
  ready: Promise<void>
  /** Resolves when the socket closes, for any reason, with the close code and reason. */
  closed: Promise<{ code: number; reason: string }>
  close(): void
}

const inBrowser = typeof (globalThis as { document?: unknown }).document !== 'undefined'

/** Node's global WebSocket is undici's, which takes headers where a browser takes protocols. */
type NodeWebSocket = new (
  url: string,
  init: { headers: Record<string, string> },
) => WebSocket

/**
 * D23.2's stream (P5a Task 12). In Node, the global WebSocket is undici's, which sends the
 * headers given in its second argument (P4b sitting 10; P5a Task 1, M5) — so the session
 * and §20's Origin go there, and without the Origin a session-bearing upgrade is refused.
 * A browser sends both itself, and its WebSocket's second argument is protocols.
 *
 * Every frame reaches `onFrame` in the order it arrived, the ready frame included; `ready`
 * resolves as that frame is handed over, so a caller that awaits it has already been given
 * the whole replay.
 */
export function subscribe(options: SubscribeOptions): Subscription {
  const origin = new URL(options.origin).origin
  const url = `${origin.replace(/^http/, 'ws')}/v1/projects/${encodeURIComponent(options.projectId)}/events`
  const socket = inBrowser
    ? new WebSocket(url)
    : new (WebSocket as unknown as NodeWebSocket)(url, {
        headers: {
          origin,
          ...(options.session === undefined
            ? {}
            : { cookie: `${SESSION_COOKIE}=${options.session}` }),
        },
      })

  let markReady: () => void = () => undefined
  const ready = new Promise<void>((resolve, reject) => {
    markReady = resolve
    socket.addEventListener(
      'close',
      (event) =>
        reject(new Error(`the event stream closed before it was ready (${event.code})`)),
      { once: true },
    )
  })
  // A rejection nobody awaited would end a Node process. It is still observable by anyone
  // who awaits `ready`, and `closed` reports the same close — so it is handled, not hidden.
  ready.catch(() => undefined)

  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    socket.addEventListener('close', (event) =>
      resolve({ code: event.code, reason: event.reason }),
    )
  })

  socket.addEventListener('message', (message) => {
    const frame = JSON.parse(String(message.data)) as StreamFrame
    options.onFrame(frame)
    if (frame.kind === 'control') markReady()
  })

  return { ready, closed, close: () => socket.close() }
}
