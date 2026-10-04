// The UBC AI Gateway plan's Task 1: the host stub on 127.0.0.1:7198, reached from gw-probe as host.docker.internal.
// It plays a provider: chat completions (streamed or not), the Responses API (streamed or not) and /models, each
// answering "ok". It RECORDS, per call, only: the path, whether it streamed, the body's top-level FIELD NAMES, the
// header NAMES, and the bearer's CLASS — never a header value, a body value or a bearer. A path containing `/slow/`
// waits SLOW_MS before its first byte ([M3].9's stream_timeout).
//   GET /__log   every record, as JSON          GET /__reset   clears them
// The bearer's class: none (no Authorization) | empty | canary (gw-probe's OPENAI_API_KEY) | literal-reference
// (`os.environ/…` sent as text) | True | stub-bearer (MANIFEST_STUB_BEARER's probe-not-a-key) | wrong-canary |
// GATEWAY-KEY / PROBE-KEY (compared by SHA-256 against digests the up script computed; neither key reaches here
// as text) | other.
import { createHash } from 'node:crypto'
import http from 'node:http'

const PORT = 7198
const SLOW_MS = Number(process.env.STUB_SLOW_MS ?? 6000)
const CANARY = process.env.STUB_CANARY ?? ''
const WRONG = process.env.STUB_WRONG ?? ''
const GW_SHA = process.env.STUB_GW_SHA ?? ''
const PROBE_SHA = process.env.STUB_PROBE_SHA ?? ''
let records = []

function bearerClass(header) {
  if (header === undefined) return 'none'
  const m = /^Bearer\s*(.*)$/i.exec(header)
  const value = m ? m[1] : header
  if (value === '') return 'empty'
  if (CANARY && value === CANARY) return 'canary'
  if (WRONG && value === WRONG) return 'wrong-canary'
  if (value.startsWith('os.environ/')) return 'literal-reference'
  if (value === 'True' || value === 'true') return 'True'
  if (value === 'probe-not-a-key') return 'stub-bearer'
  const sha = createHash('sha256').update(value).digest('hex')
  if (GW_SHA && sha === GW_SHA) return 'GATEWAY-KEY'
  if (PROBE_SHA && sha === PROBE_SHA) return 'PROBE-KEY'
  return 'other'
}

const usage = { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }

function chat(res, body, stream) {
  const model = typeof body.model === 'string' ? body.model : 'stub'
  if (!stream) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        id: 'chatcmpl-stub',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage,
      }),
    )
    return
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const frame = (delta, finish, withUsage) =>
    `data: ${JSON.stringify({
      id: 'chatcmpl-stub',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
      ...(withUsage ? { usage } : {}),
    })}\n\n`
  res.write(frame({ role: 'assistant', content: '' }, null, false))
  res.write(frame({ content: 'ok' }, null, false))
  res.write(frame({}, 'stop', true))
  res.end('data: [DONE]\n\n')
}

function responses(res, body, stream) {
  const model = typeof body.model === 'string' ? body.model : 'stub'
  const response = {
    id: 'resp_stub_1',
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model,
    output: [
      {
        type: 'message',
        id: 'msg_stub_1',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'ok', annotations: [] }],
      },
    ],
    usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 },
  }
  if (!stream) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(response))
    return
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const event = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
  res.write(event('response.created', { response: { ...response, status: 'in_progress', output: [] } }))
  res.write(event('response.output_text.delta', { item_id: 'msg_stub_1', output_index: 0, content_index: 0, delta: 'ok' }))
  res.end(event('response.completed', { response }))
}

http
  .createServer((req, res) => {
    if (req.url === '/__log') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(records))
      return
    }
    if (req.url === '/__reset') {
      records = []
      res.end('reset')
      return
    }
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      let body = {}
      try {
        body = raw ? JSON.parse(raw) : {}
      } catch {
        body = {}
      }
      const stream = body && body.stream === true
      records.push({
        at: new Date().toISOString(),
        method: req.method,
        path: req.url,
        stream,
        bearer: bearerClass(req.headers.authorization),
        fields: body && typeof body === 'object' ? Object.keys(body).sort() : [],
        headers: Object.keys(req.headers).sort(),
      })
      const answer = () => {
        const path = (req.url ?? '').split('?')[0]
        if (path.endsWith('/chat/completions')) return chat(res, body, stream)
        if (path.endsWith('/responses')) return responses(res, body, stream)
        if (path.endsWith('/models')) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ object: 'list', data: [{ id: 'stub', object: 'model' }] }))
          return
        }
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'stub: no such path', type: 'invalid_request_error', code: '404' } }))
      }
      if ((req.url ?? '').includes('/slow/')) setTimeout(answer, SLOW_MS)
      else answer()
    })
  })
  .listen(PORT, '127.0.0.1', () => console.log(`gateway-baseline stub on ${PORT}`))
