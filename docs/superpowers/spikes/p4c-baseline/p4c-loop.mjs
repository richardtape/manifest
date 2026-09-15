// A request loop that classifies every response by its BODY (P4b finding 193: the edge's
// wildcard answers 200). node p4c-loop.mjs <url> <out.ndjson> <intervalMs> <stopFile>
// NEWCONN=1 opens a new TLS connection per request (no keep-alive); otherwise fetch reuses one.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import https from 'node:https'
const [url, out, interval, stop] = process.argv.slice(2)
const ca = process.env.NEWCONN ? readFileSync(process.env.NODE_EXTRA_CA_CERTS) : undefined
const classify = (status, body) =>
  status === 200 && body.startsWith('manifest OK') ? 'wildcard'
  : status === 200 && body.includes('"mongo":true') ? 'app'
  : status === 502 && body.trim() === '' ? '502-empty'
  : `status-${status}`
const viaFetch = async (u) => {
  const r = await fetch(u, { signal: AbortSignal.timeout(3000) })
  return { status: r.status, body: await r.text() }
}
const viaNewConnection = (u) =>
  new Promise((resolve, reject) => {
    const req = https.get(u, { agent: false, ca, timeout: 3000 }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })))
    req.on('error', reject)
  })
while (!existsSync(stop)) {
  const t = Date.now()
  let rec
  try {
    const r = process.env.NEWCONN ? await viaNewConnection(url) : await viaFetch(url)
    rec = { t, ms: Date.now() - t, status: r.status, cls: classify(r.status, r.body) }
  } catch (e) {
    rec = { t, ms: Date.now() - t, status: 0, cls: `error-${e.code ?? e.cause?.code ?? e.name}` }
  }
  appendFileSync(out, JSON.stringify(rec) + '\n')
  const wait = Number(interval) - (Date.now() - t)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
}
