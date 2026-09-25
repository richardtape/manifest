import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scanText } from '../build/index.js'
import { SAMPLE_SECRETS, SECRET_CORPUS } from '../build/testing.js'
import { installPreReceiveHook } from './pre-receive.js'

const ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
const ID = [
  '-c',
  'user.name=person',
  '-c',
  'user.email=p@example.org',
  '-c',
  'commit.gpgsign=false',
]

let dir: string
let bare: string
let work: string

/** git in the person's clone; a failure resolves with its stderr rather than throwing. */
function git(
  args: string[],
  env: NodeJS.ProcessEnv = ENV,
): Promise<{ ok: boolean; stderr: string; stdout: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: work, env }, (error, stdout, stderr) =>
      resolve({ ok: error === null, stdout: stdout.trim(), stderr }),
    )
  })
}
async function must(args: string[]) {
  const r = await git(args)
  if (!r.ok) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout
}

/** What the hook named, as `path:line rule` — read back off the pusher's terminal. */
function named(stderr: string): string[] {
  return [
    ...stderr.matchAll(
      /Manifest refused this push \(§20\): (\S+):(\d+) looks like (.+?) in [0-9a-f]{12}/g,
    ),
  ]
    .map((m) => `${m[1]}:${m[2]} ${m[3]}`)
    .sort()
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mf-hook-'))
  bare = join(dir, 'app.git')
  work = join(dir, 'work')
  await new Promise((r) =>
    execFile('git', ['init', '-q', '--bare', '-b', 'main', bare], { env: ENV }, r),
  )
  await installPreReceiveHook(bare)
  await new Promise((r) =>
    execFile('git', ['init', '-q', '-b', 'main', work], { env: ENV }, r),
  )
  await must(['remote', 'add', 'origin', bare])
  await writeFile(join(work, 'README.md'), 'an app\n')
  await must(['add', '-A'])
  await must([...ID, 'commit', '-qm', 'first'])
  await must(['push', '-q', 'origin', 'main'])
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

/**
 * DRIVER 1'S HOOK (the D5 plan's Task 11, Decision 14 (b)): a push to a bare repository on
 * this machine is REFUSED when it carries a secret-shaped value — by the repository's own
 * `pre-receive`, rendered from THE list. **Its loop is the one thing written twice**, in plain
 * JavaScript there and in TypeScript in `scanText`; THIS FILE is what holds the two to one
 * answer, entry by entry, with a real `git push`.
 */
describe('driver 1’s pre-receive hook, rendered from THE list', () => {
  it('is installed executable', async () => {
    expect((await stat(join(bare, 'hooks', 'pre-receive'))).mode & 0o777).toBe(0o755)
  })

  for (const entry of SECRET_CORPUS) {
    it(`gives scanText’s answer for the corpus: ${entry.name}`, async () => {
      const expected = scanText(entry.text, entry.path).map(
        (f) => `${f.path}:${f.line} ${f.rule}`,
      )
      await must(['reset', '-q', '--hard', 'origin/main'])
      await mkdir(join(work, entry.path, '..'), { recursive: true })
      await writeFile(join(work, entry.path), entry.text)
      await must(['add', '-A'])
      await must([...ID, 'commit', '-qm', entry.name])
      const pushed = await git(['push', 'origin', 'main'])
      // Refused EXACTLY when scanText finds something — the clean entry is the positive control.
      expect(pushed.ok, pushed.stderr).toBe(expected.length === 0)
      expect(named(pushed.stderr)).toEqual(expected.sort())
      for (const secret of Object.values(SAMPLE_SECRETS)) {
        expect(pushed.stderr).not.toContain(secret)
      }
    })
  }

  it('refuses a secret ADDED in one commit and DELETED in the next, in the same push — the case a tree scan misses', async () => {
    await must(['reset', '-q', '--hard', 'origin/main'])
    await writeFile(
      join(work, 'oops.txt'),
      `KEY=${SAMPLE_SECRETS['an AWS access key id']}\n`,
    )
    await must(['add', '-A'])
    await must([...ID, 'commit', '-qm', 'add a key'])
    await must(['rm', '-q', 'oops.txt'])
    await must([...ID, 'commit', '-qm', 'remove it again'])
    const pushed = await git(['push', 'origin', 'main'])
    expect(pushed.ok).toBe(false)
    expect(named(pushed.stderr)).toEqual(['oops.txt:1 an AWS access key id'])
    expect(pushed.stderr).toMatch(/remove it from every commit in the push/i)
  })

  it('accepts a clean push — the positive control', async () => {
    await must(['reset', '-q', '--hard', 'origin/main'])
    await writeFile(join(work, 'clean.txt'), 'nothing to see\n')
    await must(['add', '-A'])
    await must([...ID, 'commit', '-qm', 'clean'])
    const pushed = await git(['push', 'origin', 'main'])
    expect(pushed.ok, pushed.stderr).toBe(true)
  })

  it('refuses — FAIL-CLOSED, and says why — when it cannot find Node.js to scan with', async () => {
    const noNode = join(dir, 'no-node.git')
    await new Promise((r) =>
      execFile('git', ['init', '-q', '--bare', '-b', 'main', noNode], { env: ENV }, r),
    )
    await installPreReceiveHook(noNode, '/nonexistent/node')
    await must(['reset', '-q', '--hard', 'origin/main'])
    // A PATH with git and without node: the hook's own path is gone, and none is on PATH.
    const pushed = await git(['push', noNode, 'main'], { ...ENV, PATH: '/usr/bin:/bin' })
    expect(pushed.ok).toBe(false)
    expect(pushed.stderr).toContain(
      'Manifest refused this push (§20): its secret scan needs Node.js',
    )
    // The positive control for the same repository: with Node.js found, the same push lands.
    await installPreReceiveHook(noNode)
    expect((await git(['push', noNode, 'main'])).ok).toBe(true)
  })
})
