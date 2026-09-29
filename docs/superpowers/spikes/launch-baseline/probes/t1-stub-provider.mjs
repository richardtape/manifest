// Task 1, Step 4 — an OpenAI-shaped stub provider on 127.0.0.1:7199 (LiteLLM reaches it as host.docker.internal:7199).
//   POST /s<status>/v1/chat/completions → that status, with an OpenAI-shaped error body
//   POST /ok/v1/chat/completions        → a valid completion
//   POST /slow/v1/chat/completions      → a valid completion after 20 s
// Logs one line per request: the path and the status it answered. Stopped by the caller (kill).
import { createServer } from 'node:http'
const PORT = Number(process.env.STUB_PORT ?? 7199)
const completion = () => ({
  id: 'chatcmpl-probe', object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: 'stub',
  choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
})
createServer((req, res) => {
  let body = ''
  req.on('data', (d) => (body += d)).on('end', () => {
    const m = /^\/(s(\d{3})|ok|slow)\//.exec(req.url ?? '')
    const answer = (status, json) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)); console.log(`${req.method} ${req.url} → ${status}`) }
    if (!m) return answer(404, { error: { message: 'no such stub path', type: 'invalid_request_error' } })
    if (m[1] === 'ok') return answer(200, completion())
    if (m[1] === 'slow') return setTimeout(() => answer(200, completion()), 20_000)
    const status = Number(m[2])
    const type = status === 429 ? 'rate_limit_exceeded' : status >= 500 ? 'server_error' : 'invalid_request_error'
    answer(status, { error: { message: `the stub refused this request with ${status}`, type, param: null, code: `stub_${status}` } })
  })
}).listen(PORT, '127.0.0.1', () => console.log(`stub provider on 127.0.0.1:${PORT}`))
