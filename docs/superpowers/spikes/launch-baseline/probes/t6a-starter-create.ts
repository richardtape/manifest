// The launch path plan's Task 6a, Step 1 — FE-41: why a project created WITH a starter fails on real GitHub.
// Drives the control plane's OWN GitHub driver (the BUILT dist/) through `createRepository`, with a
// scratch mirror root in $SCRATCH (never .manifest/repos), and logs every REST call it makes —
// method, path, status and time — never a token, a JWT or the key. Rich's yes (2026-09-29): create
// and delete private `lp-starter-…` repositories in Manifest-local-dev.
//
// Run from the repository root, with `.env` exported by the caller (never printed):
//   set -a; . ./.env; set +a
//   export MANIFEST_DATABASE_URL=…   (dist/'s import chain reads it; the probe never connects)
//   node docs/superpowers/spikes/launch-baseline/probes/t6a-starter-create.ts <slug> <starter|none> <mirrorRoot>
import { loadAppKey } from '../../../../../packages/control-plane/dist/source/github/app-auth.js'
import { createGithubSourceDriver } from '../../../../../packages/control-plane/dist/source/github/driver.js'
import { loadBlueprints } from '../../../../../packages/control-plane/dist/blueprints/registry.js'
import { renderProjectSeed } from '../../../../../packages/control-plane/dist/blueprints/seed.js'

const env = (name: string): string => {
  const v = process.env[name]
  if (v === undefined || v === '') throw new Error(`${name} is not set — export .env first`)
  return v
}
const say = (line: string): void => {
  if (/ghs_|ghp_|github_pat_|-----BEGIN|eyJ/.test(line)) throw new Error('refusing to print a line that holds a credential')
  console.log(line)
}
const [slug, starter, mirrorRoot] = process.argv.slice(2)
if (slug === undefined || !slug.startsWith('lp-starter-') || starter === undefined || mirrorRoot === undefined)
  throw new Error('usage: <lp-starter-…> <starter|none> <mirrorRoot>')
const apiUrl = env('MANIFEST_GITHUB_API_URL')
if (new URL(apiUrl).host !== 'api.github.com') throw new Error(`not real GitHub: ${new URL(apiUrl).host}`)

const t0 = Date.now()
const spy: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const started = Date.now()
  const res = await fetch(input, init)
  const path = url.pathname.replace(/\/access_tokens$/, '/access_tokens')
  let extra = ''
  if (path.endsWith('/access_tokens')) {
    const body = JSON.parse(String(init?.body ?? '{}')) as { repositories?: string[]; permissions?: unknown }
    extra = ` repositories=${JSON.stringify(body.repositories ?? 'ALL')} permissions=${JSON.stringify(body.permissions)}`
  }
  say(`  +${String(started - t0).padStart(5)} ms ${init?.method ?? 'GET'} ${path} → ${res.status} (${Date.now() - started} ms)${extra}`)
  return res
}

const registry = await loadBlueprints(env('MANIFEST_BLUEPRINTS_ROOT'))
const seed = renderProjectSeed(registry, {
  blueprintRef: 'node-ts-mongo@1',
  slug,
  ...(starter === 'none' ? {} : { starter }),
})
const files = Object.entries(seed)
say(`seed: ${files.length} files, ${files.reduce((n, [, c]) => n + Buffer.byteLength(c), 0)} bytes: ${files.map(([p]) => p).sort().join(', ')}`)

const driver = createGithubSourceDriver({
  mirrorRoot,
  apiUrl,
  gitUrl: env('MANIFEST_GITHUB_GIT_URL'),
  org: env('MANIFEST_GITHUB_ORG'),
  appId: env('MANIFEST_GITHUB_APP_ID'),
  installationId: env('MANIFEST_GITHUB_INSTALLATION_ID'),
  appKey: await loadAppKey(env('MANIFEST_GITHUB_APP_KEY')),
  observer: { advanced: async () => {} },
  fetch: spy,
})
try {
  const made = await driver.createRepository(slug, seed)
  say(`createRepository ${slug}: OK in ${Date.now() - t0} ms — mainProtected=${made.link.mainProtected}`)
  const head = await driver.headCommit(made.ref)
  say(`headCommit: ${head}`)
  await driver.destroyRepository(made.ref)
  say(`destroyRepository ${slug}: done`)
} catch (error) {
  const e = error as { code?: string; message?: string }
  say(`createRepository ${slug}: FAILED in ${Date.now() - t0} ms — ${e.code ?? ''} ${e.message ?? String(error)}`)
}
