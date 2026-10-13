// [M2]'s request loop through the throwaway edge: one request every INTERVAL ms for
// SECONDS, each classified by status, X-Manifest-Instance and body. Prints a summary and
// every failure with its time offset.
//   node loop.mjs <seconds> <intervalMs> [path]
import { request, Agent } from 'node:http'

const seconds = Number(process.argv[2] ?? 10)
const interval = Number(process.argv[3] ?? 50)
const path = process.argv[4] ?? '/'
const agent = new Agent({ keepAlive: true, maxSockets: 8 })
const t0 = Date.now()
const byInstance = new Map()
const failures = []
let total = 0
let inflight = 0
const lat = []
const seq = []

function one() {
  return new Promise((resolve) => {
    const at = Date.now() - t0
    const req = request(
      { host: '127.0.0.1', port: 7190, path, headers: { host: 'm2.manifest.internal' }, agent, timeout: 10000 },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          const inst = res.headers['x-manifest-instance'] ?? '(none)'
          lat.push(Date.now() - t0 - at)
          seq.push([at, Date.now() - t0, res.statusCode, inst])
          const ok = res.statusCode === 200 && body === inst
          if (ok) byInstance.set(inst, (byInstance.get(inst) ?? 0) + 1)
          else failures.push({ at, ms: Date.now() - t0 - at, status: res.statusCode, inst, body: body.slice(0, 60) })
          resolve()
        })
      },
    )
    req.on('error', (e) => {
      failures.push({ at, ms: Date.now() - t0 - at, status: 'ERR', inst: '', body: e.code ?? String(e) })
      resolve()
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.end()
  })
}

const pending = []
while (Date.now() - t0 < seconds * 1000) {
  total++
  inflight++
  pending.push(one().then(() => inflight--))
  await new Promise((r) => setTimeout(r, interval))
}
await Promise.all(pending)
const first = failures[0]?.at
const last = failures.at(-1)?.at
console.log(
  JSON.stringify({
    total,
    ok: total - failures.length,
    failed: failures.length,
    failureWindowMs: failures.length ? [first, last] : null,
    byInstance: Object.fromEntries(byInstance),
    latencyMs: (() => { const l = [...lat].sort((a, b) => a - b); return { p50: l[Math.floor(l.length / 2)], p99: l[Math.floor(l.length * 0.99)], max: l.at(-1), over1s: l.filter((x) => x > 1000).length } })(),
  }),
)
if (process.env.SEQ) (await import('node:fs')).writeFileSync(process.env.SEQ, JSON.stringify(seq))
for (const f of failures.slice(0, 15)) console.log('  FAIL', JSON.stringify(f))
if (failures.length > 15) console.log(`  … ${failures.length - 15} more`)
