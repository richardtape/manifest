// probes/smart-http.mjs — `node smart-http.mjs <bare-repo> <port>`. Basic auth required, any user.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createGunzip } from 'node:zlib'
const [REPO, PORT] = process.argv.slice(2)
const pkt = (s) => (s.length + 4).toString(16).padStart(4, '0') + s
createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (!(req.headers.authorization ?? '').startsWith('Basic ')) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="probe"' }); return res.end()
  }
  if (req.method === 'GET' && url.pathname.endsWith('/info/refs')) {
    const service = url.searchParams.get('service')
    if (service !== 'git-upload-pack' && service !== 'git-receive-pack') { res.writeHead(403); return res.end() }
    res.writeHead(200, { 'Content-Type': `application/x-${service}-advertisement`, 'Cache-Control': 'no-cache' })
    res.write(pkt(`# service=${service}\n`) + '0000')
    spawn('git', [service.slice(4), '--stateless-rpc', '--advertise-refs', REPO]).stdout.pipe(res)
    return
  }
  const m = url.pathname.match(/\/(git-upload-pack|git-receive-pack)$/)
  if (req.method === 'POST' && m) {
    res.writeHead(200, { 'Content-Type': `application/x-${m[1]}-result` })
    const p = spawn('git', [m[1].slice(4), '--stateless-rpc', REPO])
    ;(req.headers['content-encoding'] === 'gzip' ? req.pipe(createGunzip()) : req).pipe(p.stdin)
    p.stdout.pipe(res); return
  }
  res.writeHead(404); res.end()
}).listen(Number(PORT), '127.0.0.1')
