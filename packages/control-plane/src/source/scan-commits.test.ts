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
      truncated: false,
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

  it(`reads at most ${SCAN_COMMIT_LIMIT} new commits, newest first, and says it was truncated`, async () => {
    // 1001 commits in one fast-import stream, the OLDEST carrying the secret: a scan that read
    // every commit would find it, and one capped at the newest 1000 must not.
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
    const scan = await scanNewCommits(join(work, '.git'), [head], [])
    expect(scan).toEqual({ findings: [], commits: SCAN_COMMIT_LIMIT, truncated: true })
    // The positive control: the oldest one, asked for alone, IS found.
    const oldest = await git(['rev-list', '--max-parents=0', 'main'])
    expect(
      (await scanNewCommits(join(work, '.git'), [oldest], [])).findings,
    ).toHaveLength(1)
  })

  it('answers nothing for nothing new — heads all excluded, or no heads', async () => {
    const sha = await commit({ 'a.txt': `${AWS}\n` })
    expect(await scanNewCommits(join(work, '.git'), [sha], [sha])).toEqual({
      findings: [],
      commits: 0,
      truncated: false,
    })
    expect(await scanNewCommits(join(work, '.git'), [], [])).toEqual({
      findings: [],
      commits: 0,
      truncated: false,
    })
  })
})
