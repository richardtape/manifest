import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SAMPLE_SECRETS } from '../build/testing.js'
import { SCAN_COMMIT_LIMIT, scanNewCommits } from './scan-commits.js'

const run = promisify(execFile)
const AWS = SAMPLE_SECRETS['an AWS access key id']
const SLACK = SAMPLE_SECRETS['a Slack token']
const ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
const ID = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false']

let dir: string
let work: string
const git = (args: string[], input?: string) =>
  new Promise<string>((resolve, reject) => {
    const child = execFile('git', args, { cwd: work, env: ENV }, (error, stdout) =>
      error ? reject(error) : resolve(stdout.trim()),
    )
    if (input !== undefined) child.stdin!.end(input)
  })
async function commit(files: Record<string, string | Buffer>, message = 'c') {
  for (const [path, content] of Object.entries(files)) {
    await run('mkdir', ['-p', join(work, path, '..')])
    await writeFile(join(work, path), content)
  }
  await git(['add', '-A'])
  await git([...ID, 'commit', '-qm', message])
  return git(['rev-parse', 'HEAD'])
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mf-scan-'))
  work = join(dir, 'work')
  await run('git', ['init', '-q', '-b', 'main', work], { env: ENV })
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/**
 * THE MIRROR'S SCAN (the D5 plan's Task 11, Decision 14 (c)): the ADDED lines of the commits
 * that are new — never the tree, which misses a secret committed and deleted in the same push,
 * and which is on GitHub for ever once pushed.
 */
describe('scanNewCommits — the added lines of new commits, through THE list', () => {
  it('scans only the commits no excluded ref reaches — and names the commit', async () => {
    const old = await commit({ 'a.txt': `KEY=${AWS}\n` }, 'old secret, already scanned')
    const fresh = await commit({ 'b.txt': `x\nSLACK=${SLACK}\n` }, 'new')
    const scan = await scanNewCommits(join(work, '.git'), [fresh], [old])
    expect(scan).toEqual({
      findings: [{ commit: fresh, path: 'b.txt', line: 2, rule: 'a Slack token' }],
      commits: 1,
      unscannable: [],
    })
    // The positive control for the exclusion: with nothing excluded, the old one is found too.
    const all = await scanNewCommits(join(work, '.git'), [fresh], [])
    expect(all.findings.map((f) => f.commit).sort()).toEqual([fresh, old].sort())
  })

  it('names the line the FILE has, after a hunk’s offset — not the hunk’s own count', async () => {
    const body = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`)
    const first = await commit({ 'big.js': body.join('\n') + '\n' })
    const edited = [...body]
    edited.splice(29, 0, `const k = '${AWS}'`) // becomes line 30
    edited.splice(4, 1, 'line 5, changed') // an earlier hunk
    const second = await commit({ 'big.js': edited.join('\n') + '\n' })
    const scan = await scanNewCommits(join(work, '.git'), [second], [first])
    expect(scan.findings).toEqual([
      { commit: second, path: 'big.js', line: 30, rule: 'an AWS access key id' },
    ])
  })

  it('skips a binary file — and still scans the text beside it in the same commit', async () => {
    const sha = await commit({
      'logo.png': Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]),
        Buffer.from(`\n${AWS}\n`),
      ]),
      'notes.txt': `${AWS}\n`,
    })
    const scan = await scanNewCommits(join(work, '.git'), [sha], [])
    expect(scan.findings).toEqual([
      { commit: sha, path: 'notes.txt', line: 1, rule: 'an AWS access key id' },
    ])
  })

  it('scans a merge’s added lines ONCE: the side branch’s in its own commit, and only the merge’s own additions in the merge', async () => {
    const base = await commit({ 'a.txt': 'a\n' })
    await git(['checkout', '-qb', 'side'])
    const side = await commit({ 'side.txt': `s\n${SLACK}\n` }, 'side')
    await git(['checkout', '-q', 'main'])
    await commit({ 'm.txt': 'm\n' }, 'mainline')
    await git([...ID, 'merge', '-q', '--no-commit', 'side'])
    // An "evil merge": content that is in NEITHER parent, added by the merge itself.
    await writeFile(join(work, 'evil.txt'), `e\n${AWS}\n`)
    await git(['add', '-A'])
    await git([...ID, 'commit', '-qm', 'merge'])
    const merge = await git(['rev-parse', 'HEAD'])
    const scan = await scanNewCommits(join(work, '.git'), [merge], [base])
    expect(scan.commits).toBe(3)
    expect(
      scan.findings
        .map(
          (f) =>
            `${f.commit === merge ? 'merge' : f.commit === side ? 'side' : '?'} ${f.path}:${f.line}`,
        )
        .sort(),
    ).toEqual(['merge evil.txt:2', 'side side.txt:2'])
  })

  it(`reads past ${SCAN_COMMIT_LIMIT} new commits to the OLDEST — the cap it replaced read only the newest`, async () => {
    // 1001 commits in one fast-import stream, the OLDEST carrying the secret: the scan that
    // read the newest 1000 and let its caller mark the branch scanned never read it at all
    // (the D5 plan's final review, Important 3). Two batches now, and it is found.
    const lines: string[] = []
    for (let i = 0; i <= SCAN_COMMIT_LIMIT; i++) {
      const content = i === 0 ? `${AWS}\n` : `n ${i}\n`
      lines.push(
        'commit refs/heads/main',
        `committer t <t@t> ${1_700_000_000 + i} +0000`,
        'data 1',
        'c',
        `M 100644 inline f${i}.txt`,
        `data ${Buffer.byteLength(content)}`,
        content,
      )
    }
    await git(['fast-import', '--quiet'], lines.join('\n') + '\n')
    const head = await git(['rev-parse', 'main'])
    const oldest = await git(['rev-list', '--max-parents=0', 'main'])
    const scan = await scanNewCommits(join(work, '.git'), [head], [])
    expect(scan).toEqual({
      findings: [
        { commit: oldest, path: 'f0.txt', line: 1, rule: 'an AWS access key id' },
      ],
      commits: SCAN_COMMIT_LIMIT + 1,
      unscannable: [],
    })
  })

  it('reads EVERY new commit, in batches — a finding in the first, a middle and the last batch is found', async () => {
    // Ten commits, read three at a time: four batches. A secret in the oldest, the fifth and the
    // newest — a scan capped at one batch, newest first (what this replaced), finds one of three.
    const shas: string[] = []
    for (let i = 1; i <= 10; i++) {
      const secret = i === 1 || i === 5 || i === 10
      shas.push(await commit({ [`f${i}.txt`]: secret ? `KEY=${AWS}\n` : `n ${i}\n` }))
    }
    const scan = await scanNewCommits(join(work, '.git'), [shas[9]!], [], {
      commits: 3,
      bytes: 4096,
    })
    expect(scan.commits).toBe(10)
    expect(scan.unscannable).toEqual([])
    expect(
      scan.findings.map((f) => `${shas.indexOf(f.commit) + 1} ${f.path}`).sort(),
    ).toEqual(['1 f1.txt', '10 f10.txt', '5 f5.txt'])
  })

  it('names a commit whose OWN patch is past the limit as unscannable — never read as scanned — and scans the commits around it', async () => {
    const before = await commit({ 'a.txt': `KEY=${AWS}\n` })
    // ~11 KiB of patch against a 4 KiB limit, with a secret inside it that is NOT found: the
    // scan could not read this commit, and says so rather than counting it read.
    const long = Array.from(
      { length: 300 },
      (_, i) => `line ${i} of a file too large to scan`,
    )
    const big = await commit({ 'big.txt': [...long, `SLACK=${SLACK}`].join('\n') + '\n' })
    const after = await commit({ 'c.txt': `SLACK=${SLACK}\n` })
    const scan = await scanNewCommits(join(work, '.git'), [after], [], {
      commits: 3,
      bytes: 4096,
    })
    expect(scan).toEqual({
      findings: [
        { commit: before, path: 'a.txt', line: 1, rule: 'an AWS access key id' },
        { commit: after, path: 'c.txt', line: 1, rule: 'a Slack token' },
      ],
      commits: 3,
      unscannable: [big],
    })
    // The positive control: the same commit under a limit it fits is read, and its secret found.
    const whole = await scanNewCommits(join(work, '.git'), [big], [before])
    expect(whole.findings).toEqual([
      { commit: big, path: 'big.txt', line: 301, rule: 'a Slack token' },
    ])
  })

  it('answers nothing for nothing new — heads all excluded, or no heads', async () => {
    const sha = await commit({ 'a.txt': `${AWS}\n` })
    expect(await scanNewCommits(join(work, '.git'), [sha], [sha])).toEqual({
      findings: [],
      commits: 0,
      unscannable: [],
    })
    expect(await scanNewCommits(join(work, '.git'), [], [])).toEqual({
      findings: [],
      commits: 0,
      unscannable: [],
    })
  })
})
