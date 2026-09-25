import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { assertNoSecrets, runConformance, type Fact } from './conformance.js'

/**
 * `make github-conformance`'s entry (the D5 plan, Task 6): the conformance script against
 * REAL GitHub, with `Manifest (local dev)`. Writes `conformance/github.com-<date>.json` —
 * committed as evidence — and prints every step whose answer differs from golden.json.
 * Argv: the conformance JSON (`{ appId, installationId, org }`) and the App's key.
 */
const [confPath, keyPath] = process.argv.slice(2)
if (confPath === undefined || keyPath === undefined) {
  console.error('usage: conformance-main.ts <github-conformance.json> <github-app.pem>')
  process.exit(2)
}
// The App's key is the master key's custody class (§20): owner-only, or not used at all.
const loose = statSync(keyPath).mode & 0o077
if (loose !== 0) {
  console.error(
    `${keyPath} is mode ${(statSync(keyPath).mode & 0o777).toString(8)}; chmod 600 it first`,
  )
  process.exit(1)
}
const conf = JSON.parse(readFileSync(confPath, 'utf8')) as {
  appId: number | string
  installationId: number | string
  org: string
}
const date = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local
const label = `github.com ${date}, App ${conf.appId}`
console.log(
  `conformance: against REAL GitHub (${label}), org ${conf.org} — creates two private repositories, pushes one commit, deletes both`,
)

const answers = await runConformance({
  apiUrl: 'https://api.github.com',
  gitUrl: 'https://github.com',
  org: conf.org,
  appId: String(conf.appId),
  installationId: String(conf.installationId),
  appKeyPem: readFileSync(keyPath, 'utf8'),
  label,
})
assertNoSecrets(answers)

const out = new URL(`../conformance/github.com-${date}.json`, import.meta.url)
const steps = Object.fromEntries(
  answers.map((a) => [a.step, { status: a.status, facts: a.facts }]),
)
writeFileSync(
  out,
  JSON.stringify({ source: label, ranAt: new Date().toISOString(), steps }, null, 2) +
    '\n',
)
console.log(`wrote ${out.pathname}`)

interface GoldenStep {
  status?: number
  facts?: Record<string, Fact>
  unknown?: boolean
  byPlan?: Record<string, { status: number; facts?: Record<string, Fact> }>
}
const golden = JSON.parse(
  readFileSync(new URL('../conformance/golden.json', import.meta.url), 'utf8'),
) as { steps: Record<string, GoldenStep> }
for (const a of answers) {
  const want = golden.steps[a.step]
  const expected = want?.byPlan?.free ?? want // the real organisation is on the free plan
  const said = `${a.status} ${JSON.stringify(a.facts)}`
  if (want?.unknown === true) {
    console.log(`${a.step}  UNKNOWN in golden — GitHub says ${said}`)
    continue
  }
  const same =
    expected?.status === a.status &&
    Object.entries(expected.facts ?? {}).every(([k, v]) => a.facts[k] === v)
  console.log(
    `${a.step}  ${same ? 'same' : `DIFFERS — golden ${expected?.status} ${JSON.stringify(expected?.facts ?? {})}, GitHub`} ${said}`,
  )
}
