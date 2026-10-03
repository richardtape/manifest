// [M3] The provider stub (faculty-ready Task 1): answers EVERY chat completion 422, as a provider refusing a
// malformed request does, and counts the calls. On the host, port 7198; LiteLLM reaches it as host.docker.internal.
import http from 'node:http'
let hits = 0
http.createServer((req, res) => {
  if (req.url === '/hits') { res.end(String(hits)); return }
  if (req.url === '/reset') { hits = 0; res.end('0'); return }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    hits++
    res.writeHead(422, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'probe: unprocessable entity', type: 'invalid_request_error', param: null, code: '422' } }))
  })
}).listen(7198, '127.0.0.1', () => console.log('m3 stub on 7198'))
