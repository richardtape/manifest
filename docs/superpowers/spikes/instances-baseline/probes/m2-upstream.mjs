// [M2]'s tiny upstream: answers its own name, forges X-Manifest-Instance (the edge must
// overwrite it), counts health probes by their X-Manifest-Probe header, holds a slow
// request (the drain's num_requests), and serves a minimal server-push WebSocket.
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'

const name = process.env.NAME ?? 'unnamed'
const mode = process.env.MODE ?? 'ok' // ok | 503 | 503-all
let probes = { withHeader: 0, without: 0 }

const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname
  const headers = { 'content-type': 'text/plain', 'x-manifest-instance': `forged-${name}` }
  if (path === '/healthz') {
    if (req.headers['x-manifest-probe'] === 'health') probes.withHeader++
    else probes.without++
    const status = mode === '503-all' ? 503 : 200
    res.writeHead(status, headers)
    res.end(status === 200 ? 'ok' : 'shedding')
    return
  }
  if (path === '/probes') {
    res.writeHead(200, headers)
    res.end(JSON.stringify(probes))
    return
  }
  if (path === '/slow') {
    const ms = Number(new URL(req.url, 'http://x').searchParams.get('ms') ?? '5000')
    setTimeout(() => {
      res.writeHead(200, headers)
      res.end(name)
    }, ms)
    return
  }
  if (mode === '503' || mode === '503-all') {
    res.writeHead(503, headers)
    res.end(`503 from ${name}`)
    return
  }
  res.writeHead(200, headers)
  res.end(name)
})

// A server-push WebSocket: one text frame "<name> <n>" a second, never reading.
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )
  let n = 0
  const timer = setInterval(() => {
    const payload = Buffer.from(`${name} ${n++}`)
    socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]))
  }, 1000)
  socket.on('data', () => {}) // ignore client frames
  socket.on('close', () => clearInterval(timer))
  socket.on('error', () => clearInterval(timer))
})

server.listen(8080, '0.0.0.0', () => console.log(`${name} listening mode=${mode}`))
