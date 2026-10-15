import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scaled } from './test-timeouts.js'

/**
 * scripts/test-gently.sh (the gentler test tiers plan, Task 3) — the wrapper `pnpm test` and
 * `pnpm test:docker` run through. DB-free: it spawns the script around tiny commands.
 *
 * THIS SUITE MAY ITSELF BE RUNNING INSIDE THE WRAPPER, so every run starts from `cleanEnv()`, and the
 * priorities are asserted against this process's own. The QoS control (Step 5) is run unwrapped.
 */
const ROOT = new URL('../../../', import.meta.url).pathname
const SCRIPT = join(ROOT, 'scripts/test-gently.sh')
const OURS = [
  'MANIFEST_TEST_GENTLY',
  'MANIFEST_TEST_QOS',
  'MANIFEST_TEST_TIMEOUT_SCALE',
  'MANIFEST_TEST_FORCE',
  'MANIFEST_TEST_MAX_LOAD',
  'MANIFEST_TEST_LOAD_REPORT',
  'MANIFEST_TEST_SAMPLE_SECONDS',
]

function cleanEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of OURS) delete env[name]
  // A gate no machine reaches, unless a case sets its own.
  return { ...env, MANIFEST_TEST_MAX_LOAD: '100000', ...extra }
}

function gently(
  command: string[],
  extra: Record<string, string> = {},
  stdio: 'pipe' | 'ignore' = 'pipe',
) {
  const run = spawnSync('bash', [SCRIPT, ...command], {
    cwd: ROOT,
    env: cleanEnv(extra),
    encoding: 'utf8',
    stdio,
    // A sampler left running holds the output pipe open and spawnSync waits on it — a hang no Vitest
    // limit can end, since nothing else runs meanwhile. This makes it a red. Its status alone reads 0:
    // the wrapper itself has exited.
    timeout: scaled(10_000),
  })
  if (run.error) throw run.error
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

/** The one line of a run's output that is only a number — what the command printed, not the wrapper. */
function printed(stdout: string): string {
  const lines = stdout
    .split('\n')
    .filter((line) => !line.startsWith('test-gently:') && line.trim() !== '')
  return lines.join('\n').trim()
}

/** `ps -o pri=`: 31 at normal priority, 20 under a utility clamp, 4 in the background (Task 1, Step 3). */
function priorityOf(pid: number): number {
  return Number(
    spawnSync('ps', ['-o', 'pri=', '-p', String(pid)], {
      encoding: 'utf8',
    }).stdout.trim(),
  )
}
const GRANDCHILD_PRI = ['sh', '-c', `sh -c 'ps -o pri= -p $$'`]

let scratch: string | undefined
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true })
  scratch = undefined
})

describe('scripts/test-gently.sh', () => {
  it('runs the command under a utility clamp by default, inherited by a grandchild', () => {
    const run = gently(GRANDCHILD_PRI)
    expect(run.status).toBe(0)
    expect(Number(printed(run.stdout))).toBe(Math.min(20, priorityOf(process.pid)))
  })

  it('runs it in the background when asked', () => {
    const run = gently(GRANDCHILD_PRI, { MANIFEST_TEST_QOS: 'background' })
    expect(run.status).toBe(0)
    expect(Number(printed(run.stdout))).toBe(4)
  })

  it('runs it at the caller’s own priority when asked for normal', () => {
    const run = gently(GRANDCHILD_PRI, { MANIFEST_TEST_QOS: 'normal' })
    expect(run.status).toBe(0)
    expect(Number(printed(run.stdout))).toBe(priorityOf(process.pid))
  })

  it('hands the command the scale for its priority, and keeps one already set', () => {
    const echo = ['sh', '-c', 'echo "$MANIFEST_TEST_TIMEOUT_SCALE"']
    expect(printed(gently(echo).stdout)).toBe('5') // Task 6's utility scale, measured where the gate admits
    expect(printed(gently(echo, { MANIFEST_TEST_QOS: 'background' }).stdout)).toBe('7') // Task 1's background scale
    expect(printed(gently(echo, { MANIFEST_TEST_QOS: 'normal' }).stdout)).toBe('1')
    expect(printed(gently(echo, { MANIFEST_TEST_TIMEOUT_SCALE: '3' }).stdout)).toBe('3')
  })

  it('refuses to start above the gate with 75, naming the load and the gate, and runs nothing', () => {
    const run = gently(['sh', '-c', 'echo RAN'], { MANIFEST_TEST_MAX_LOAD: '-1' })
    expect(run.status).toBe(75)
    expect(run.stdout).not.toContain('RAN')
    expect(run.stderr).toMatch(
      /REFUSED to start: the 1-minute load is [0-9.]+, above the gate of -1 .*MANIFEST_TEST_FORCE=1/,
    )
  })

  it('runs anyway when forced, and its summary says so', () => {
    const run = gently(['sh', '-c', 'echo RAN'], {
      MANIFEST_TEST_MAX_LOAD: '-1',
      MANIFEST_TEST_FORCE: '1',
    })
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('RAN')
    expect(run.stdout).toMatch(/test-gently: load \(1-min\) .* forced yes; exit 0/)
  })

  it('exits with the command’s own status, and its summary names it', () => {
    const run = gently(['sh', '-c', 'exit 3'])
    expect(run.status).toBe(3)
    expect(run.stdout).toMatch(/; exit 3$/m)
  })

  it('samples the load through the run and writes the summary to MANIFEST_TEST_LOAD_REPORT', () => {
    scratch = mkdtempSync(join(tmpdir(), 'gently-'))
    const report = join(scratch, 'load')
    const run = gently(['sleep', '1'], {
      MANIFEST_TEST_LOAD_REPORT: report,
      MANIFEST_TEST_SAMPLE_SECONDS: '0.2',
    })
    expect(run.status).toBe(0)
    const line = readFileSync(report, 'utf8').trim()
    const match = line.match(
      /^load \(1-min\) min ([0-9.]+) \/ median ([0-9.]+) \/ max ([0-9.]+) over ([0-9]+) samples 0\.2 s apart; QoS utility, timeout scale 5, gate 100000, forced no; exit 0$/,
    )
    expect(match).not.toBeNull()
    expect(Number(match![4])).toBeGreaterThanOrEqual(3)
    expect(Number(match![1])).toBeLessThanOrEqual(Number(match![2]))
    expect(Number(match![2])).toBeLessThanOrEqual(Number(match![3]))
  })

  it('writes the refusal to MANIFEST_TEST_LOAD_REPORT too', () => {
    scratch = mkdtempSync(join(tmpdir(), 'gently-'))
    const report = join(scratch, 'load')
    const run = gently(['true'], {
      MANIFEST_TEST_MAX_LOAD: '-1',
      MANIFEST_TEST_LOAD_REPORT: report,
    })
    expect(run.status).toBe(75)
    expect(readFileSync(report, 'utf8')).toMatch(
      /^REFUSED to start: the 1-minute load is /,
    )
  })

  it('leaves nothing running behind it — its sampler carries the command line, `vitest` and all', () => {
    const marker = `gently-marker-${randomUUID()}`
    try {
      // Output ignored: a sampler left behind would hold the pipe, and what this case reads is the sampler.
      const run = gently(
        ['sh', '-c', 'sleep 0.5', marker],
        { MANIFEST_TEST_SAMPLE_SECONDS: '0.1' },
        'ignore',
      )
      expect(run.status).toBe(0)
      const left = spawnSync('pgrep', ['-f', marker], { encoding: 'utf8' })
      expect(left.stdout.trim()).toBe('')
      expect(left.status).toBe(1) // pgrep: nothing matched
    } finally {
      // Red, it leaves a sampler looping every 0.1 s: end it.
      spawnSync('pkill', ['-f', marker])
    }
  })

  it(
    'ends its sampler by itself when the wrapper is killed outright — SIGKILL runs no trap',
    async () => {
      // The whole-branch review's I3 (sitting 2). The sampler's command line is the wrapper's, `vitest` and
      // all, so a sampler that outlives a `kill -9` reads as a run in progress for ever. The wrapper and its
      // sampler carry the script's path; the command (exec'd by taskpolicy) carries only the marker.
      const marker = `gently-marker-${randomUUID()}`
      const ours = () =>
        spawnSync('pgrep', ['-f', `test-gently\\.sh .*${marker}`], { encoding: 'utf8' })
          .stdout.split('\n')
          .filter((line) => line.trim() !== '')
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
      const wrapper = spawn('bash', [SCRIPT, 'sh', '-c', 'sleep 3', marker], {
        cwd: ROOT,
        env: cleanEnv({ MANIFEST_TEST_SAMPLE_SECONDS: '0.1' }),
        stdio: 'ignore',
      })
      const exited = new Promise((resolve) => wrapper.once('exit', resolve))
      try {
        let deadline = Date.now() + 2_000
        while (ours().length < 2 && Date.now() < deadline) await pause(20)
        expect(ours()).toHaveLength(2) // the wrapper, and its sampler
        wrapper.kill('SIGKILL')
        await exited
        // Ten of the sampler's intervals: it ends at its next one.
        deadline = Date.now() + 1_000
        while (ours().length > 0 && Date.now() < deadline) await pause(50)
        expect(ours()).toEqual([])
      } finally {
        // Red, the sampler loops every 0.1 s, and the command runs on: end both.
        spawnSync('pkill', ['-f', marker])
      }
    },
    scaled(15_000),
  )

  it('passes straight through inside a gentle run — no second gate, sampler or summary', () => {
    const run = gently(['sh', '-c', 'echo INNER; exit 5'], {
      MANIFEST_TEST_GENTLY: '1',
      MANIFEST_TEST_MAX_LOAD: '-1',
    })
    expect(run.status).toBe(5)
    expect(run.stdout.trim()).toBe('INNER')
  })

  it('refuses an unknown priority with 64, naming it', () => {
    const run = gently(['true'], { MANIFEST_TEST_QOS: 'urgent' })
    expect(run.status).toBe(64)
    expect(run.stderr).toContain(
      "MANIFEST_TEST_QOS must be utility, background or normal — got 'urgent'",
    )
  })
})
