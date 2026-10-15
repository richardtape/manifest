import { useEffect, useState } from 'react'
import { subscribe, type EventFrame, type StreamFrame } from '@manifest/contract'

/**
 * D23.2: ONE event stream per project, never polling — copied from the reference console's
 * `src/stream.ts` with its comments (this console may not import that one: §26's boundary). The
 * approval pane opens it for its project on entering and closes it on leaving (Decision 18): it is
 * the one read of through which token a sign-off was asked, and of the project's recent events.
 *
 * The browser supplies the cookie and §20's `Origin` itself — `subscribe`'s browser branch
 * is `new WebSocket(url)` with neither — and a refused upgrade reaches a browser as close
 * **1006 with no status**, because a WebSocket client is never shown an HTTP status. So
 * `closeCode` is all the diagnosis there is, and the screen says so rather than spinning.
 *
 * `1013` is the server saying this client fell behind: RECONNECT, and the replay returns
 * what was missed (api/routes/events.ts). That is the one close code worth retrying, and it
 * is retried once — a reconnect loop against a struggling control plane makes it worse.
 *
 * `sub.ready` resolves on the `control` frame, AFTER the replay, so `status === 'live'`
 * means the whole replay is already in `frames` and a count rendered before that is a
 * partial history.
 */
export function useProjectStream(projectId: string | null) {
  const [frames, setFrames] = useState<StreamFrame[]>([])
  const [status, setStatus] = useState<'connecting' | 'live' | 'closed'>('connecting')
  const [closeCode, setCloseCode] = useState<number | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setFrames([])
    setStatus('connecting')
    setCloseCode(undefined)
    // Not known yet: the pane learns its project from the release it reads.
    if (projectId === null) return
    // EVERY HANDLER IS GUARDED BY `live`. React 19's StrictMode runs an effect twice in
    // development, and a navigation unmounts this one while its socket is still closing —
    // without the guard the DEAD subscription's `closed` handler sets `status: 'closed'`
    // on the LIVE one, and the screen shows a closed stream while frames keep arriving.
    let live = true
    const sub = subscribe({
      origin: window.location.origin,
      projectId,
      onFrame: (frame) => live && setFrames((f) => [...f, frame]),
    })
    sub.ready.then(
      () => live && setStatus('live'),
      () => undefined, // `closed` reports it; a rejection handled twice is noise
    )
    sub.closed.then(({ code }) => {
      if (!live) return
      setStatus('closed')
      setCloseCode(code)
      if (code === 1013 && attempt === 0) setAttempt(1)
    })
    return () => {
      live = false
      sub.close()
    }
  }, [projectId, attempt])

  return { frames, status, closeCode }
}

const isEvent = (frame: StreamFrame): frame is EventFrame => frame.kind === 'event'
const at = (iso: string) => new Date(iso).getTime()

/**
 * THROUGH WHICH TOKEN A SIGN-OFF WAS ASKED (I4; the design's A21). No operation reads an
 * `ApprovalRequest`, `QueueItem` carries no token, and `approval.requested`'s `machineDetail.viaToken`
 * is a boolean — the token's NAME is that event's `actor.token`. So the newest request for the release
 * in the replay is read: its token's name, or `null` when it was asked in a session. With no request
 * for the release in the replay the answer is `null` itself, and the pane then names no token —
 * it is not said, never guessed.
 */
export function askedThrough(
  frames: readonly StreamFrame[],
  releaseId: string,
): { token: string | null } | null {
  let newest: EventFrame | null = null
  for (const frame of frames) {
    if (!isEvent(frame) || frame.type !== 'approval.requested') continue
    if (frame.machineDetail.releaseId !== releaseId) continue
    if (newest === null || at(frame.createdAt) >= at(newest.createdAt)) newest = frame
  }
  return newest === null ? null : { token: newest.actor?.token?.name ?? null }
}

/**
 * WHETHER THE RELEASE WAS DECIDED AFTER IT WAS ASKED FOR — another administrator's decision, live on
 * the stream. The platform never refuses a second decision on a release whose preview is still current
 * (this plan's sitting 3, F1), so the pane learns of one here and from the queue's next read, and then
 * reads it whole from `getApproval`. A decision from an earlier round of asking is not this one.
 */
export function decidedAfter(
  frames: readonly StreamFrame[],
  releaseId: string,
  askedAt: string,
): boolean {
  return frames.some(
    (frame) =>
      isEvent(frame) &&
      (frame.type === 'release.approved' || frame.type === 'release.approval_rejected') &&
      frame.machineDetail.releaseId === releaseId &&
      at(frame.createdAt) > at(askedAt),
  )
}

/** The project's events — the replay and what came live after it — newest first, at most `limit`. */
export function eventsNewestFirst(
  frames: readonly StreamFrame[],
  limit: number,
): EventFrame[] {
  return frames
    .filter(isEvent)
    .sort((a, b) => at(b.createdAt) - at(a.createdAt))
    .slice(0, limit)
}
