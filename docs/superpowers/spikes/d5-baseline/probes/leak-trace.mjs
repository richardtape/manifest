// probes/leak-trace.mjs — [M5] addendum. Form C (the token in GIT_CONFIG_* only) is safe from argv,
// but the environment is also where GIT_TRACE*/GIT_CURL_VERBOSE live. If the driver spreads
// process.env into git's environment, an operator's trace variable reaches git too. Does the
// token then reach stderr — which String(error) carries onto the wire?
// A server that answers 401 to everything makes git fail AFTER sending the header.
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
const run = promisify(execFile)
const CANARY = 'ghs_LEAKCANARY0123456789abcdefABCDEF0123'
const B64 = Buffer.from(`x-access-token:${CANARY}`).toString('base64')
const server = createServer((_req, res) => { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="t"' }); res.end() })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/o/r.git`
const base = {
  ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: 'http.extraHeader', GIT_CONFIG_VALUE_0: `Authorization: Basic ${B64}`,
  GIT_CONFIG_KEY_1: 'credential.helper', GIT_CONFIG_VALUE_1: '',
}
for (const [label, extra] of [
  ['no trace variables', {}],
  ['GIT_CURL_VERBOSE=1', { GIT_CURL_VERBOSE: '1' }],
  ['GIT_TRACE_CURL=1', { GIT_TRACE_CURL: '1' }],
  ['GIT_TRACE_CURL=1 GIT_TRACE_REDACT=0', { GIT_TRACE_CURL: '1', GIT_TRACE_REDACT: '0' }],
  ['GIT_CURL_VERBOSE=1 GIT_TRACE_REDACT=0', { GIT_CURL_VERBOSE: '1', GIT_TRACE_REDACT: '0' }],
  ['GIT_TRACE=1 GIT_TRACE_PACKET=1', { GIT_TRACE: '1', GIT_TRACE_PACKET: '1' }],
]) {
  try { await run('git', ['ls-remote', url], { env: { ...base, ...extra } }); console.log(label, 'succeeded?!') }
  catch (error) {
    const t = String(error)
    console.log(`${label}: stderr carries canary=${t.includes(CANARY)} base64=${t.includes(B64)} redacted-marker=${t.includes('<redacted>')} (${t.length} chars)`)
  }
}
server.close()
