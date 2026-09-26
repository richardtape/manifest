// Usage, from the repository root:
//   MANIFEST_DATABASE_URL=postgres://nobody:nobody@127.0.0.1:1/unreachable \
//   node --experimental-transform-types --import ./packages/github-fake/resolve-ts.mjs \
//     docs/superpowers/spikes/authoring-baseline/probes/driver1-plumbing-escape.ts "$SCRATCH"
// The authoring API plan's Task 3, Step 8, control (a)+(b) — `driver1-escape.ts`'s two attacks, and a
// write under a FILE, through the SHIPPED driver 1's `commit` (plumbing, no worktree). Run it with the
// planner's ancestor loop AND `assertTreeIs` broken to see what the architecture alone still holds;
// run it on the committed tree to see all three refused. Scratchpad only: every path is under argv[2].
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createLocalSourceDriver } from '../../../../../packages/control-plane/src/source/local-driver.ts'

const S = process.argv[2]
if (!S || !existsSync(S)) throw new Error('usage: driver1-plumbing-escape.ts <scratch directory>')
const lab = join(S, 'lab-plumbing')
rmSync(lab, { recursive: true, force: true })
mkdirSync(lab)
const repos = join(lab, 'repos')
const outside = join(lab, 'outside')
mkdirSync(outside)
const marker = join(lab, 'FSMONITOR-RAN')

const driver = createLocalSourceDriver(repos)
const created = await driver.createRepository('escape-lab', {
  'README.md': 'seed\n',
  'manifest.yaml': 'manifest: 1\n',
})
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
const bare = join(repos, 'escape-lab.git')
const git = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8' })
const person = mkdtempSync(join(lab, 'person-'))
git(lab, ['clone', '-q', bare, person])
symlinkSync(outside, join(person, 'out'))
symlinkSync('.git', join(person, 'meta'))
git(person, ['add', '-A'])
git(person, ['-c', 'user.name=Person', '-c', 'user.email=p@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'person: two symlinks'])
git(person, ['push', '-q', 'origin', 'main'])
const ADA = { name: 'Ada Lovelace', email: 'u1@users.manifest.internal' }

async function attempt(label: string, path: string, content: string) {
  const base = await driver.headCommit(created.ref)
  try {
    const r = await driver.commit(created.ref, { base, changes: [{ op: 'write', path, content }], message: label, author: ADA })
    const tree = git(bare, ['ls-tree', '-r', r.commitSha!]).trim().split('\n').map((l) => l.split('\t')[1] + ' ' + l.split(' ')[0]).join(', ')
    console.log(`${label}: LANDED ${r.commitSha!.slice(0, 12)} — tree: ${tree}`)
  } catch (e) {
    console.log(`${label}: REFUSED ${(e as { code?: string }).code} — ${(e as Error).message}`)
  }
}
await attempt('write under the symlink out', 'out/pwned.txt', 'x\n')
await attempt('write through meta -> .git', 'meta/config', `[core]\n\tfsmonitor = touch ${marker}; false\n`)
await attempt('a later ordinary commit', 'ok.txt', 'ok\n')
await attempt('write under the FILE manifest.yaml', 'manifest.yaml/x', 'x\n')
console.log(`outside/pwned.txt exists: ${existsSync(join(outside, 'pwned.txt'))}`)
console.log(`fsmonitor marker exists: ${existsSync(marker)}`)
rmSync(lab, { recursive: true, force: true })
