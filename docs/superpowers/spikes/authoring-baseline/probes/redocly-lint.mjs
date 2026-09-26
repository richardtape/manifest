// Usage, from the repository root, after `pnpm add --offline @redocly/openapi-core@1.34.20` into "$SCRATCH/redocly":
//   node docs/superpowers/spikes/authoring-baseline/probes/redocly-lint.mjs "$SCRATCH/redocly"
// The authoring API plan's Task 1, Step 5 ([M8]): lint packages/contract/openapi.json with the
// `recommended` ruleset of a checker nobody on this project wrote, and record every rule that fires
// with its count. A CANARY wraps every way Node reaches the network (dns, net, http, https, fetch)
// so "offline" is measured, not assumed: any attempt is printed and counted.
// A builtin's DEFAULT export is the very object CommonJS code gets from `require`, so wrapping its
// methods here is what openapi-core (CommonJS) calls. (ESM, not .cjs: the repository's lint forbids
// `require()`.)
import dns from 'node:dns'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const attempts = []
const wrap = (obj, name, label) => {
  const orig = obj[name]
  obj[name] = function (...args) {
    attempts.push(`${label}: ${String(typeof args[0] === 'object' ? JSON.stringify(args[0]).slice(0, 120) : args[0])}`)
    return orig.apply(this, args)
  }
}
wrap(dns, 'lookup', 'dns.lookup')
wrap(net, 'connect', 'net.connect')
wrap(net, 'createConnection', 'net.createConnection')
wrap(http, 'request', 'http.request')
wrap(http, 'get', 'http.get')
wrap(https, 'request', 'https.request')
wrap(https, 'get', 'https.get')
const origFetch = globalThis.fetch
globalThis.fetch = (...args) => { attempts.push(`fetch: ${String(args[0])}`); return origFetch(...args) }

const pkg = process.argv[2]
if (!pkg) throw new Error('usage: redocly-lint.cjs <scratch package holding @redocly/openapi-core>')
const core = await import(pathToFileURL(join(pkg, 'node_modules/@redocly/openapi-core/lib/index.js')).href)
const { createConfig, lintFromString } = core.default ?? core

;(async () => {
  const config = await createConfig({ extends: ['recommended'] })
  const source = readFileSync('packages/contract/openapi.json', 'utf8')
  const problems = await lintFromString({ source, absoluteRef: 'packages/contract/openapi.json', config })
  const byRule = new Map()
  for (const p of problems) {
    const key = `${p.severity}\t${p.ruleId}`
    const entry = byRule.get(key) ?? { n: 0, first: [] }
    entry.n++
    if (entry.first.length < 3) entry.first.push(`${p.location?.[0]?.pointer ?? '?'} — ${p.message}`)
    byRule.set(key, entry)
  }
  console.log(`${problems.length} problems, ${byRule.size} rules`)
  for (const [key, { n, first }] of [...byRule].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`${String(n).padStart(4)}  ${key}`)
    for (const f of first) console.log(`        e.g. ${f}`)
  }
  console.log(`network attempts during the lint: ${attempts.length}`)
  for (const a of attempts) console.log(`  ${a}`)
  // Positive control: the canary must see a deliberate lookup, or "0 attempts" means nothing.
  const before = attempts.length
  await new Promise((done) => dns.lookup('localhost', () => done()))
  console.log(`canary positive control (dns.lookup('localhost') after the lint): ${attempts.length - before} attempt seen`)
})().catch((e) => { console.error('FAILED', e); process.exit(1) })
