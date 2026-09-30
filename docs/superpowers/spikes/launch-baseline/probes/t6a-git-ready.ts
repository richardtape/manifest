// The launch path plan's Task 6a, Step 1 — FE-41's cause, MEASURED: how long after GitHub answers `201` to
// `POST /orgs/{org}/repos` does the new repository accept a PUSH, and then answer a FETCH of it? Creates one
// private `lp-starter-…` repository and, exactly as the driver does, mints a `contents: write` token and
// pushes one commit at once — retried every 500 ms until it lands (up to 60 s), logging every answer —
// then fetches it back with a `contents: read` token the same way, and deletes the repository. Uses the
// control plane's BUILT client, token cache and git runner; prints statuses, times and git's words —
// never a token, a JWT or the key. Rich's yes (2026-09-29).
//
//   set -a; . ./.env; set +a; export MANIFEST_DATABASE_URL=…
//   node …/t6a-git-ready.ts <lp-starter-…> <scratch dir>
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadAppKey } from '../../../../../packages/control-plane/dist/source/github/app-auth.js'
import { createGithubClient } from '../../../../../packages/control-plane/dist/source/github/client.js'
import { createTokenCache } from '../../../../../packages/control-plane/dist/source/github/tokens.js'
import { gitWithToken } from '../../../../../packages/control-plane/dist/source/github/git.js'

const env = (name: string): string => {
  const v = process.env[name]
  if (v === undefined || v === '') throw new Error(`${name} is not set — export .env first`)
  return v
}
const say = (line: string): void => {
  if (/ghs_|ghp_|github_pat_|-----BEGIN|eyJ/.test(line)) throw new Error('refusing to print a line that holds a credential')
  console.log(line)
}
const [slug, scratchRoot] = process.argv.slice(2)
if (slug === undefined || !slug.startsWith('lp-starter-') || scratchRoot === undefined) throw new Error('usage: <lp-starter-…> <scratch>')
const apiUrl = env('MANIFEST_GITHUB_API_URL')
if (new URL(apiUrl).host !== 'api.github.com') throw new Error(`not real GitHub: ${new URL(apiUrl).host}`)
const org = env('MANIFEST_GITHUB_ORG')
const remote = `${env('MANIFEST_GITHUB_GIT_URL')}/${org}/${slug}.git`

const client = createGithubClient({ apiUrl, appId: env('MANIFEST_GITHUB_APP_ID'), appKey: await loadAppKey(env('MANIFEST_GITHUB_APP_KEY')) })
const tokens = createTokenCache({ client, installationId: env('MANIFEST_GITHUB_INSTALLATION_ID'), now: () => new Date() })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const words = (e: unknown) => tokens.redact((e as { message?: string }).message ?? String(e)).slice(0, 200)

// One commit in a scratch bare repository — plain local git, the machine's config ignored.
const scratch = await mkdtemp(join(scratchRoot, 't6a-ready-'))
const src = join(scratch, 'src.git')
const localGit = (args: string[], input?: string) =>
  execFileSync('git', args, {
    cwd: scratch,
    input,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_INDEX_FILE: join(scratch, 'idx'), GIT_AUTHOR_NAME: 'probe', GIT_AUTHOR_EMAIL: 'probe@manifest.internal', GIT_COMMITTER_NAME: 'probe', GIT_COMMITTER_EMAIL: 'probe@manifest.internal' },
  }).toString().trim()
localGit(['init', '-q', '--bare', '--initial-branch=main', src])
await writeFile(join(scratch, 'f'), 'FE-41 probe\n')
const blob = localGit(['--git-dir', src, 'hash-object', '-w', join(scratch, 'f')])
const tree = localGit(['--git-dir', src, 'mktree'], `100644 blob ${blob}\tREADME.md\n`)
const commit = localGit(['--git-dir', src, 'commit-tree', tree, '-m', 'FE-41 probe'])

const admin = await tokens.installationWide({ administration: 'write' })
const created = await client.asToken(admin, 'POST', `/orgs/${org}/repos`, { name: slug, private: true, auto_init: false })
const t0 = Date.now()
say(`create ${slug}: ${created.status}`)
try {
  if (created.status !== 201) throw new Error('not created')
  let pushedAt = -1
  for (let i = 0; i < 120 && pushedAt < 0; i++) {
    const at = Date.now() - t0
    try {
      const out = await gitWithToken(
        ['--git-dir', src, 'push', '--porcelain', remote, `${commit}:refs/heads/main`],
        { cwd: scratch, token: await tokens.forRepository(slug, { contents: 'write' }), acceptExit: [1], timeoutMs: 30_000 },
      )
      const line = out.split('\n').find((l) => l.includes('refs/heads/main'))
      if (line !== undefined && /^[ *=]\t/.test(line)) {
        pushedAt = at
        say(`  +${String(at).padStart(5)} ms push OK: ${JSON.stringify(line)}`)
      } else say(`  +${String(at).padStart(5)} ms push NOT OK (exit 1): ${JSON.stringify(out.trim().slice(0, 200))}`)
    } catch (e) {
      say(`  +${String(at).padStart(5)} ms push FAILED: ${(e as { code?: string }).code} ${words(e)}`)
    }
    if (pushedAt < 0) await sleep(500)
  }
  const dst = join(scratch, 'dst.git')
  localGit(['init', '-q', '--bare', '--initial-branch=main', dst])
  let fetchedAt = -1
  for (let i = 0; i < 120 && fetchedAt < 0; i++) {
    const at = Date.now() - t0
    try {
      await gitWithToken(['fetch', '--porcelain', '--no-write-fetch-head', remote, 'refs/heads/*:refs/heads/*'], {
        cwd: dst, token: await tokens.forRepository(slug, { contents: 'read' }), timeoutMs: 30_000,
      })
      const got = localGit(['--git-dir', dst, 'rev-parse', '--verify', '--quiet', 'refs/heads/main'])
      if (got === commit) { fetchedAt = at; say(`  +${String(at).padStart(5)} ms fetch OK (main = the pushed commit)`) }
      else say(`  +${String(at).padStart(5)} ms fetch answered, main=${got || 'none'}`)
    } catch (e) {
      say(`  +${String(at).padStart(5)} ms fetch FAILED: ${(e as { code?: string }).code} ${words(e)}`)
    }
    if (fetchedAt < 0) await sleep(500)
  }
  say(`RESULT ${slug}: push landed at +${pushedAt} ms, fetch saw it at +${fetchedAt} ms`)
} finally {
  await rm(scratch, { recursive: true, force: true })
  const del = await client.asToken(await tokens.forRepository(slug, { administration: 'write' }), 'DELETE', `/repos/${org}/${slug}`)
  say(`delete ${slug}: ${del.status}`)
}
