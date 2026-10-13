// [M2] (d): a WebSocket through the throwaway edge (a raw upgrade over node:http, so the
// Host header is ours); prints every tick with its time and how the socket ended.
import { request } from 'node:http'
import { randomBytes } from 'node:crypto'
const seconds = Number(process.argv[2] ?? 30)
const t0 = Date.now()
const log = (s) => console.log(`${Date.now() - t0} ${s}`)
const req = request({
  host: '127.0.0.1', port: 7190, path: '/ws',
  headers: { host: 'm2.manifest.internal', connection: 'Upgrade', upgrade: 'websocket',
    'sec-websocket-key': randomBytes(16).toString('base64'), 'sec-websocket-version': '13' },
})
req.on('upgrade', (res, socket, head) => {
  log(`open (101, x-manifest-instance=${res.headers['x-manifest-instance'] ?? '(none)'})`)
  let buf = head
  const drain = () => {
    while (buf.length >= 2) {
      const op = buf[0] & 0x0f, len = buf[1] & 0x7f
      if (buf.length < 2 + len) return
      const payload = buf.subarray(2, 2 + len).toString()
      buf = buf.subarray(2 + len)
      if (op === 1) log(`tick ${payload}`)
      else if (op === 8) log(`CLOSE frame`)
    }
  }
  drain()
  socket.on('data', (d) => { buf = Buffer.concat([buf, d]); drain() })
  socket.on('close', () => log('CLOSED (socket)'))
  socket.on('error', (e) => log(`ERROR ${e.code}`))
})
req.on('response', (res) => log(`no upgrade: ${res.statusCode}`))
req.on('error', (e) => log(`ERROR ${e.code}`))
req.end()
setTimeout(() => { log('done'); process.exit(0) }, seconds * 1000)
