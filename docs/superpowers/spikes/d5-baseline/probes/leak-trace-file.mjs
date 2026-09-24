// probes/leak-trace-file.mjs — [M5] addendum 2. A trace variable can name a FILE, where no message
// redactor reaches. With the operator's GIT_TRACE_REDACT=0 inherited, is the token written to disk,
// and does forcing GIT_TRACE_REDACT=1 AFTER the spread (Task 7's correction) stop it?
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
const run = promisify(execFile)
const CANARY = 'ghs_LEAKCANARY0123456789abcdefABCDEF0123'
const B64 = Buffer.from(`x-access-token:${CANARY}`).toString('base64')
const server = createServer((_q, res) => { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="t"' }); res.end() })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/o/r.git`
const dir = mkdtempSync(join(tmpdir(), 'm5c-'))
const operator = (f) => ({ ...process.env, GIT_TRACE_CURL: f, GIT_TRACE_REDACT: '0' }) // what the control plane inherited
for (const [label, forced] of [['spread only (Task 7 as written)', {}], ['spread, then GIT_TRACE_REDACT=1 forced', { GIT_TRACE_REDACT: '1' }]]) {
  const f = join(dir, `${forced.GIT_TRACE_REDACT ? 'forced' : 'spread'}.trace`)
  const env = {
    ...operator(f), ...forced, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'http.extraHeader', GIT_CONFIG_VALUE_1: `Authorization: Basic ${B64}`,
  }
  try { await run('git', ['ls-remote', url], { env }) } catch {}
  const t = existsSync(f) ? readFileSync(f, 'utf8') : ''
  console.log(`${label}: trace file ${t.length} bytes, base64 on disk=${t.includes(B64)}, <redacted>=${t.includes('<redacted>')}`)
}
server.close()
