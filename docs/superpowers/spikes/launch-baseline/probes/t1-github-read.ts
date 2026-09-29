// Task 1, Step 1 — what REAL GitHub says, read with the control plane's own client and token code.
// READ-ONLY: it lists repositories and reads one; it never creates, changes or deletes anything.
// It prints names, booleans, shas and statuses — never the key, a JWT or a token — and refuses to
// print a line holding `ghs_`, `ghp_`, `github_pat_` or `-----BEGIN` (as conformance.ts does).
//
// It imports the control plane's BUILT dist/ (strip-only mode refuses src/'s parameter properties).
// Run from the repository root, with `.env` exported by the caller (never printed):
//   set -a; . ./.env; set +a
//   export MANIFEST_DATABASE_URL=… (RUNBOOK's line — dist/'s import chain reads it; the probe never connects)
//   node docs/superpowers/spikes/launch-baseline/probes/t1-github-read.ts list
//   … t1-github-read.ts repo <slug>
import { loadAppKey } from '../../../../../packages/control-plane/dist/source/github/app-auth.js'
import { createGithubClient } from '../../../../../packages/control-plane/dist/source/github/client.js'

const env = (name: string): string => {
  const v = process.env[name]
  if (v === undefined || v === '') throw new Error(`${name} is not set — export .env first`)
  return v
}
const apiUrl = env('MANIFEST_GITHUB_API_URL')
const org = env('MANIFEST_GITHUB_ORG')
const installationId = env('MANIFEST_GITHUB_INSTALLATION_ID')
if (new URL(apiUrl).host !== 'api.github.com') throw new Error(`not real GitHub: ${new URL(apiUrl).host}`)

const say = (line: string): void => {
  if (/ghs_|ghp_|github_pat_|-----BEGIN/.test(line)) throw new Error('refusing to print a line that holds a credential')
  console.log(line)
}

const key = await loadAppKey(env('MANIFEST_GITHUB_APP_KEY'))
const client = createGithubClient({ apiUrl, appId: env('MANIFEST_GITHUB_APP_ID'), appKey: key })

/** A token for reading only: metadata everywhere, contents on the named repository when given. */
async function readToken(repository?: string): Promise<{ token?: string; status: number; message?: string }> {
  const body = repository === undefined
    ? { permissions: { metadata: 'read' } }
    : { repositories: [repository], permissions: { metadata: 'read', contents: 'read' } }
  const t0 = Date.now()
  const res = await client.asApp('POST', `/app/installations/${installationId}/access_tokens`, body)
  say(`  mint (${repository ?? 'installation, metadata:read'}): ${res.status} in ${Date.now() - t0} ms`)
  const j = res.json as { token?: string; message?: string } | undefined
  return { token: res.status === 201 ? j?.token : undefined, status: res.status, message: j?.message }
}

const [command, slug] = process.argv.slice(2)
if (command === 'list') {
  const { token } = await readToken()
  if (token === undefined) throw new Error('no token')
  const t0 = Date.now()
  const res = await client.asToken(token, 'GET', '/installation/repositories?per_page=100')
  const j = res.json as { total_count: number; repositories: { name: string; private: boolean; visibility: string; created_at: string }[] }
  say(`list: ${res.status} in ${Date.now() - t0} ms, total_count=${j.total_count}`)
  for (const r of j.repositories) say(`  ${r.name}  private=${r.private} visibility=${r.visibility} created=${r.created_at}`)
} else if (command === 'repo' && slug !== undefined) {
  const scoped = await readToken(slug)
  if (scoped.token === undefined) {
    say(`  scoped mint refused (${scoped.status}): ${scoped.message ?? ''}`)
    const { token } = await readToken()
    if (token === undefined) throw new Error('no token')
    const res = await client.asToken(token, 'GET', `/repos/${org}/${slug}`)
    say(`repo ${slug}: GET → ${res.status} ${(res.json as { message?: string } | undefined)?.message ?? ''}`)
  } else {
    const t0 = Date.now()
    const repo = await client.asToken(scoped.token, 'GET', `/repos/${org}/${slug}`)
    const r = repo.json as { private: boolean; visibility: string; default_branch: string; html_url: string }
    say(`repo ${slug}: GET → ${repo.status} in ${Date.now() - t0} ms; private=${r.private} visibility=${r.visibility} default_branch=${r.default_branch} html_url=${r.html_url}`)
    const head = await client.asToken(scoped.token, 'GET', `/repos/${org}/${slug}/commits/${r.default_branch}`)
    const c = head.json as { sha: string; commit: { message: string; author: { name: string; email: string }; committer: { name: string; email: string } } }
    say(`  main: ${head.status} sha=${c.sha} message=${JSON.stringify(c.commit.message.split('\n')[0])}`)
    say(`  author=${c.commit.author.name} <${c.commit.author.email}> committer=${c.commit.committer.name} <${c.commit.committer.email}>`)
    const commits = await client.asToken(scoped.token, 'GET', `/repos/${org}/${slug}/commits?per_page=10`)
    const list = commits.json as { sha: string; commit: { message: string } }[]
    say(`  commits: ${commits.status}, ${list.length} — ${list.map((x) => `${x.sha.slice(0, 7)} ${JSON.stringify(x.commit.message.split('\n')[0])}`).join(' | ')}`)
    const protection = await client.asToken(scoped.token, 'GET', `/repos/${org}/${slug}/branches/${r.default_branch}/protection`)
    say(`  protection GET: ${protection.status} ${(protection.json as { message?: string } | undefined)?.message ?? ''}`)
  }
} else {
  throw new Error('usage: list | repo <slug>')
}
