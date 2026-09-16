// A request loop that classifies every response by its BODY and by the edge's
// X-Manifest-Instance header (P4c Task 1).
//
//   node scripts/lib/redeploy-loop.mjs <url> <out.ndjson> <intervalMs> <stopFile>
//
// Ported from docs/superpowers/spikes/p4c-baseline/p4c-loop.mjs, which measured the
// baseline this plan is judged against. THE STATUS IS NEVER EVIDENCE: the edge's
// wildcard answers 200 for a hostname it holds no route to (P4b finding 193), so the
// body says whether an app answered and the header says WHICH instance did.
//
// `reset` is its own class and not a failure: §11 records that every admin change
// reloads Caddy's configuration and that a reload occasionally resets a connection —
// about one request in 300 per change, on any app (measured 2026-09-15).
import { appendFileSync, existsSync } from 'node:fs'

const [url, out, interval, stop] = process.argv.slice(2)
if (stop === undefined) {
  console.error('usage: redeploy-loop.mjs <url> <out.ndjson> <intervalMs> <stopFile>')
  process.exit(2)
}
const marker = process.env.APP_MARKER ?? '"mongo":true'
const RESET_CODES = new Set(['ECONNRESET', 'UND_ERR_SOCKET', 'EPIPE'])

const classify = (status, body) => {
  if (status === 200 && body.startsWith('manifest OK')) return 'wildcard'
  if (status === 200 && body.includes(marker)) return 'app'
  if (status === 502 && body.trim() === '') return '502-empty'
  return `status-${status}`
}

while (!existsSync(stop)) {
  const t = Date.now()
  let record
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const body = await response.text()
    record = {
      t,
      ms: Date.now() - t,
      status: response.status,
      cls: classify(response.status, body),
      instance: response.headers.get('x-manifest-instance'),
    }
  } catch (error) {
    const code = error.code ?? error.cause?.code ?? error.name
    record = {
      t,
      ms: Date.now() - t,
      status: 0,
      cls: RESET_CODES.has(code) ? 'reset' : `error-${code}`,
      instance: null,
    }
  }
  appendFileSync(out, `${JSON.stringify(record)}\n`)
  const wait = Number(interval) - (Date.now() - t)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
}
