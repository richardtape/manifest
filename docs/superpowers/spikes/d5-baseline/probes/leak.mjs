// probes/leak.mjs — `node leak.mjs` (from the repository root). [M5]: where a token handed to git leaks.
// Three ways to give git a token, each against a port nothing listens on, and for each whether the
// canary (or its base64) appears in String(error) — the exact text local-driver.ts's git() wraps into
// SourceError('SOURCE_GIT_FAILED', `git ${args[0]} failed: ${String(error)}`), which api/errors.ts
// answers as 409 { code, message } ON THE WIRE.
// Then the POSITIVE CONTROL: form C must AUTHENTICATE a real push, against a server that accepts
// exactly this canary and refuses anything else — or "no leak" means only "git never sent it".
import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
const run = promisify(execFile)
const CANARY = 'ghs_LEAKCANARY0123456789abcdefABCDEF0123'
const B64 = Buffer.from(`x-access-token:${CANARY}`).toString('base64')
const DEAD = 'http://127.0.0.1:7196/o/r.git'
const BASE_ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
const viaEnv = (token) => ({
  ...BASE_ENV,
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: 'http.extraHeader',
  GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
  GIT_CONFIG_KEY_1: 'credential.helper',
  GIT_CONFIG_VALUE_1: '',
})
const forms = [
  ['A: -c http.extraHeader in argv', ['-c', `http.extraHeader=Authorization: Basic ${B64}`, 'ls-remote', DEAD], BASE_ENV],
  ['B: token in the URL', ['ls-remote', `http://x-access-token:${CANARY}@127.0.0.1:7196/o/r.git`], BASE_ENV],
  ['C: GIT_CONFIG_* in the environment', ['ls-remote', DEAD], viaEnv(CANARY)],
]
for (const [label, args, env] of forms) {
  try {
    await run('git', args, { env })
    console.log(label, '— git SUCCEEDED against a dead port?!')
  } catch (error) {
    const text = `git ${args[0]} failed: ${String(error)}` // exactly local-driver.ts's message
    console.log(`${label}: canary=${text.includes(CANARY)} base64=${text.includes(B64)}`)
    console.log('   message:', JSON.stringify(text.slice(0, 240)))
  }
}
// POSITIVE CONTROL — a strict smart-HTTP server: the Basic header must be exactly this canary's.
const dir = mkdtempSync(join(tmpdir(), 'm5-'))
const bare = join(dir, 'served.git')
await run('git', ['init', '-q', '--bare', '-b', 'main', bare])
const seen = []
const pkt = (s) => (s.length + 4).toString(16).padStart(4, '0') + s
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  seen.push(req.headers.authorization === `Basic ${B64}` ? 'canary' : String(req.headers.authorization ?? 'none'))
  if (req.headers.authorization !== `Basic ${B64}`) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="m5"' })
    return res.end()
  }
  if (req.method === 'GET' && url.pathname.endsWith('/info/refs')) {
    const service = url.searchParams.get('service')
    res.writeHead(200, { 'Content-Type': `application/x-${service}-advertisement` })
    res.write(pkt(`# service=${service}\n`) + '0000')
    spawn('git', [service.slice(4), '--stateless-rpc', '--advertise-refs', bare]).stdout.pipe(res)
    return
  }
  const m = url.pathname.match(/\/(git-upload-pack|git-receive-pack)$/)
  res.writeHead(200, { 'Content-Type': `application/x-${m[1]}-result` })
  const p = spawn('git', [m[1].slice(4), '--stateless-rpc', bare])
  req.pipe(p.stdin)
  p.stdout.pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/o/r.git`
const work = join(dir, 'work')
await run('git', ['init', '-q', '-b', 'main', work])
writeFileSync(join(work, 'a.txt'), 'hello\n')
const ID = ['-c', 'user.name=probe', '-c', 'user.email=probe@example.invalid', '-c', 'commit.gpgsign=false']
await run('git', ['add', 'a.txt'], { cwd: work })
await run('git', [...ID, 'commit', '-qm', 'one'], { cwd: work })
try {
  await run('git', ['push', '-q', url, 'main'], { cwd: work, env: viaEnv(CANARY) })
  const pushed = (await run('git', ['--git-dir', bare, 'rev-parse', 'main'])).stdout.trim()
  const local = (await run('git', ['rev-parse', 'main'], { cwd: work })).stdout.trim()
  console.log(`C positive control: push exit=0, served main == pushed main: ${pushed === local}`)
} catch (error) {
  console.log('C positive control: push FAILED —', String(error).slice(0, 200))
}
try {
  await run('git', ['push', '-q', url, 'main'], { cwd: work, env: viaEnv('ghs_WRONGTOKEN') })
  console.log('C with a WRONG token: push SUCCEEDED — the server is not checking, the control proves nothing')
} catch (error) {
  console.log(`C with a WRONG token: refused (exit ${error.code}), canary in message: ${String(error).includes(CANARY)}`)
}
console.log('Authorization headers the strict server saw:', [...new Set(seen)].join(', '))
server.close()
