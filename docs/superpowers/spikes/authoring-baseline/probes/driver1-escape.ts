// Usage, from the repository root (Node 24 strips the types; the hook resolves `./x.js` to `./x.ts`):
//   node --import ./packages/github-fake/resolve-ts.mjs docs/superpowers/spikes/authoring-baseline/probes/driver1-escape.ts "$SCRATCH"
// The authoring API plan's Task 1, [M1] — escape.mjs's two holes, driven through the SHIPPED driver 1
// (`createLocalSourceDriver` → `createRepository` → `commitFiles`), not a copy of its loop.
// A person's push carries two symlinks — `out → <scratch>/outside` and `meta → .git` — into the
// bare repository, through its real pre-receive hook. Scratchpad only: every path is under argv[2].
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLocalSourceDriver } from '../../../../../packages/control-plane/src/source/local-driver.ts'

const S = process.argv[2]
if (!S || !existsSync(S)) throw new Error('usage: driver1-escape.ts <scratch directory>')
const lab = join(S, 'lab-driver1')
rmSync(lab, { recursive: true, force: true })
mkdirSync(lab)
const repos = join(lab, 'repos')
const outside = join(lab, 'outside')
mkdirSync(outside)
const marker = join(lab, 'FSMONITOR-RAN')

const driver = createLocalSourceDriver(repos)
const created = await driver.createRepository('escape-lab', { 'README.md': 'seed\n' })
console.log('created', created.ref, 'mainProtected', created.link.mainProtected)

// A PERSON's push, straight into the bare repository, through its pre-receive hook.
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
const git = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8' })
const person = mkdtempSync(join(lab, 'person-'))
git(lab, ['clone', '-q', join(repos, 'escape-lab.git'), person])
symlinkSync(outside, join(person, 'out'))
symlinkSync('.git', join(person, 'meta'))
git(person, ['add', '-A'])
git(person, ['-c', 'user.name=Person', '-c', 'user.email=p@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'person: two symlinks'])
git(person, ['push', '-q', 'origin', 'main'])
console.log('person pushed:', git(join(repos, 'escape-lab.git'), ['ls-tree', 'main']).trim().split('\n').join(' | '))

async function attempt(label: string, files: Record<string, string>) {
  try {
    const sha = await driver.commitFiles(created.ref, files, `api: ${label}`)
    console.log(`${label}: commitFiles RETURNED ${sha}`)
  } catch (error) {
    const e = error as { code?: string; message?: string }
    console.log(`${label}: commitFiles THREW ${e.code ?? '?'} — ${String(e.message).split('\n')[0].slice(0, 160)}`)
  }
}

await attempt('(a) out/pwned.txt', { 'out/pwned.txt': 'written outside the worktree\n' })
console.log('(a) <outside>/pwned.txt exists:', existsSync(join(outside, 'pwned.txt')))

const cfg = `[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tfsmonitor = touch ${marker}; false\n`
await attempt('(b) meta/config', { 'meta/config': cfg })
console.log('(b) the fsmonitor marker exists (a command RAN):', existsSync(marker))
console.log('main after both:', git(join(repos, 'escape-lab.git'), ['log', '--oneline', 'main']).trim().split('\n').join(' | '))
writeFileSync(join(lab, 'done'), 'ok\n')
