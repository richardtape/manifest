import { createHash } from 'node:crypto'
import http from 'node:http'
import type { Duplex } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { subscribe, type StreamFrame } from './index.js'

/** One unmasked server text frame (RFC 6455 §5.2) — enough for a test's short JSON. */
function textFrame(text: string): Buffer {
  const payload = Buffer.from(text)
  const header =
    payload.length < 126
      ? Buffer.from([0x81, payload.length])
      : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff])
  return Buffer.concat([header, payload])
}

/**
 * A WebSocket server with no dependency: the handshake by hand, then the frames it is
 * told to send. `ws` is the control plane's, not this package's, and adding one needs the
 * network — so the protocol is written out, and what `subscribe` sends is read raw.
 */
async function streamServer(
  answer: (headers: http.IncomingHttpHeaders, socket: Duplex, accept: string) => void,
) {
  const seen: http.IncomingHttpHeaders[] = []
  const server = http.createServer((_req, res) => res.writeHead(426).end())
  server.on('upgrade', (req, socket) => {
    seen.push(req.headers)
    const accept = createHash('sha1')
      .update(
        `${String(req.headers['sec-websocket-key'])}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`,
      )
      .digest('base64')
    answer(req.headers, socket, accept)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  return { origin, seen, close: () => server.close() }
}

const PROJECT = '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f'

describe('subscribe (D23.2)', () => {
  it('sends the session and the origin on the upgrade, and is ready only after the replay', async () => {
    const replay = {
      kind: 'event',
      id: '7a1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f',
      projectId: PROJECT,
      subject: 'project:journey-app',
      type: 'project.created',
      humanMessage: 'journey-app was created.',
      machineDetail: {
        slug: 'journey-app',
        blueprint: 'node-ts-mongo@1',
        starter: 'proof-app',
        audience: { scale: 'class', burst: 'synchronised' },
      },
      createdAt: new Date().toISOString(),
    }
    const ready = {
      kind: 'control',
      id: 'ready',
      projectId: PROJECT,
      type: 'manifest.stream.ready',
    }
    // The ready frame is HELD until the test has seen the replay arrive alone. Written
    // together, both frames land in one chunk and are dispatched in one turn, so a `ready`
    // that resolved on the replayed event would be indistinguishable — measured, P5a
    // sitting 8 control (l): `markReady()` on every frame, and this test stayed green.
    let sendReady: () => void = () => undefined
    const server = await streamServer((_headers, socket, accept) => {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
      )
      socket.write(textFrame(JSON.stringify(replay)))
      sendReady = () => socket.write(textFrame(JSON.stringify(ready)))
      // The closing handshake: a client's close frame (opcode 8) is answered with one.
      socket.on('data', (data: Buffer) => {
        if ((data[0]! & 0x0f) === 0x8) socket.end(Buffer.from([0x88, 0]))
      })
    })
    const frames: StreamFrame[] = []
    const stream = subscribe({
      origin: server.origin,
      session: 'good',
      projectId: PROJECT,
      onFrame: (frame) => frames.push(frame),
    })
    let isReady = false
    void stream.ready.then(() => {
      isReady = true
    })
    for (let i = 0; i < 200 && frames.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(frames.map((f) => f.kind)).toEqual(['event'])
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(isReady, 'ready before the ready frame').toBe(false)
    sendReady()
    await stream.ready
    expect(frames.map((f) => f.kind)).toEqual(['event', 'control'])
    expect(server.seen[0]).toMatchObject({
      origin: server.origin,
      cookie: 'manifest_session=good',
    })
    stream.close()
    await stream.closed
    server.close()
  })

  it('rejects `ready` when the upgrade is refused — the only way a WebSocket client learns it', async () => {
    const server = await streamServer((_headers, socket) => {
      socket.end(
        'HTTP/1.1 403 Forbidden\r\ncontent-type: application/json\r\nconnection: close\r\n\r\n' +
          '{"error":{"code":"CSRF_ORIGIN_REFUSED","message":"no"}}',
      )
    })
    const stream = subscribe({
      origin: server.origin,
      projectId: PROJECT,
      onFrame: () => undefined,
    })
    await expect(stream.ready).rejects.toThrow(/closed before it was ready \(1006\)/)
    expect((await stream.closed).code).toBe(1006)
    server.close()
  })
})
