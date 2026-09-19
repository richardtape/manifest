import { useEffect, useState } from 'react'
import { subscribe, type StreamFrame } from '@manifest/contract'

/**
 * D23.2: ONE event stream per project, never polling. Build logs, instance state
 * transitions, incidents and D24's pending actions all arrive here, so every screen on a
 * project consumes THIS hook rather than opening a second socket.
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
export function useProjectStream(projectId: string) {
  const [frames, setFrames] = useState<StreamFrame[]>([])
  const [status, setStatus] = useState<'connecting' | 'live' | 'closed'>('connecting')
  const [closeCode, setCloseCode] = useState<number | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setFrames([])
    setStatus('connecting')
    setCloseCode(undefined)
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
