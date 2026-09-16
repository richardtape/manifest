// M5 (P5a Task 1): does Node 24's fetch or WebSocket send an Origin header by itself,
// and does it send one it is given? Decision 15's CSRF check refuses a cookie-bearing
// mutation without one, so the client must set it — and must be ABLE to.
import http from 'node:http'

const server = http.createServer((req, res) => res.end(JSON.stringify({ origin: req.headers.origin ?? null })))
server.on('upgrade', (req, socket) => {
  console.log(`[M5] WebSocket upgrade origin: ${req.headers.origin ?? null}, cookie: ${req.headers.cookie ? 'present' : 'absent'}`)
  socket.destroy()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
console.log('[M5] fetch POST, no headers:', await (await fetch(base, { method: 'POST', body: '{}' })).text())
console.log('[M5] fetch POST, origin given:', await (await fetch(base, { method: 'POST', body: '{}', headers: { origin: 'https://console.manifest.internal' } })).text())
await new Promise((resolve) => { const ws = new WebSocket(`${base.replace('http', 'ws')}/a`); ws.onerror = resolve })
await new Promise((resolve) => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/b`, { headers: { origin: 'https://console.manifest.internal', cookie: 'manifest_session=x' } })
  ws.onerror = resolve
})
server.close()
