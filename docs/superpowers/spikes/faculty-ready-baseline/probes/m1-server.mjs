// [M1] A throwaway cookie server (faculty-ready Task 1): http on 7195, https on 7196 (self-signed, from $CERT_DIR).
// GET /set?c=<a Set-Cookie value, URL-encoded> answers 200 with exactly that Set-Cookie header (repeatable: c=..&c=..).
// GET /echo answers the Cookie header it was sent. Nothing else. Removed at the end of the probe.
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
const dir = process.env.CERT_DIR
const handler = (req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/set') {
    res.setHeader('Set-Cookie', u.searchParams.getAll('c'))
    res.setHeader('Content-Type', 'text/plain')
    return res.end('set\n')
  }
  if (u.pathname === '/echo') return res.end(`cookie: ${req.headers.cookie ?? ''}\n`)
  res.statusCode = 404
  res.end('no\n')
}
http.createServer(handler).listen(7195, '127.0.0.1')
https.createServer({ key: fs.readFileSync(`${dir}/probe.key`), cert: fs.readFileSync(`${dir}/probe.crt`) }, handler).listen(7196, '127.0.0.1')
console.log('m1-server listening on 7195 (http) and 7196 (https)')
