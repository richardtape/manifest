import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { LogLine, RuntimeLogLine } from '../driver.js'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { containerLogs } from './logs.js'
import { containerExec } from './exec.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const NAME = 'mf-logtest-staging-app'
const BURST = 'mf-logtest-burst-staging-app'

/**
 * The front-end enablement plan's Task 2, from Task 1's M1 and M2: 300 lines, one line of
 * exactly 1 MiB (Docker keeps it as 64 records of 16 KiB and a 65th holding its newline),
 * sixty more with a second's pause in the middle, and `last` with no newline — which Docker
 * writes only when the process EXITS. So the container is read after it has exited.
 */
const BURST_SCRIPT = [
  'i=1; while [ $i -le 300 ]; do echo "before $i"; i=$((i+1)); done',
  "head -c 1048576 /dev/zero | tr '\\0' x; echo",
  'i=1; while [ $i -le 30 ]; do echo "after $i"; i=$((i+1)); done',
  'sleep 1',
  'i=31; while [ $i -le 60 ]; do echo "after $i"; i=$((i+1)); done',
  'printf last',
].join('\n')

const readAll = async (
  opts: Parameters<typeof containerLogs>[2],
): Promise<RuntimeLogLine[]> => {
  const lines: RuntimeLogLine[] = []
  for await (const line of containerLogs(engine, BURST, opts)) lines.push(line)
  return lines
}

describeDocker('logs and exec against a real container', () => {
  afterAll(async () => {
    await engine.del(`/containers/${NAME}?force=true&v=true`)
    await engine.del(`/containers/${BURST}?force=true&v=true`)
  })

  it("demuxes a real container's stdout and stderr", async () => {
    await engine.del(`/containers/${NAME}?force=true&v=true`)
    await engine.post(`/containers/create?name=${NAME}`, {
      // alpine:3.22, NOT 3.20. P1's infra/images.txt mirrors 3.22 into the local
      // registry and `make seed` pulls it; 3.20 is in neither, so this step would
      // fail the moment the network is off — which is this plan's own demo.
      Image: 'alpine:3.22',
      Cmd: ['sh', '-c', 'echo to-stdout; echo to-stderr >&2; sleep 60'],
      HostConfig: { NetworkMode: 'none' },
    })
    await engine.post(`/containers/${NAME}/start`)
    await new Promise((r) => setTimeout(r, 1500))

    const lines: LogLine[] = []
    for await (const line of containerLogs(engine, NAME, { tail: 20 })) lines.push(line)
    expect(lines.find((l) => l.stream === 'stdout')?.text).toBe('to-stdout')
    expect(lines.find((l) => l.stream === 'stderr')?.text).toBe('to-stderr')
  })

  it('closes the stream when the consumer breaks out of the loop', async () => {
    let seen = 0
    for await (const _line of containerLogs(engine, NAME, { follow: true, tail: 100 })) {
      seen += 1
      break
    }
    expect(seen).toBe(1)
  })

  /**
   * Measured before this was fixed: `exitCode` never settled — the caller waited
   * for ever — and the rejection escaped as an unhandled rejection, which Node
   * treats as fatal. Both in a component that holds the Docker socket.
   */
  it('surfaces an exec failure instead of hanging on it', async () => {
    const stream = containerExec(engine, 'mf-no-such-container-at-all', ['echo'], {})
    const outcome = await Promise.race([
      stream.exitCode.then(() => 'resolved').catch((e: unknown) => (e as Error).message),
      new Promise<string>((r) => setTimeout(() => r('NEVER-SETTLED'), 5000)),
    ])
    expect(outcome).toContain('no such container')
  })

  it('runs exec and reports stdout and the exit code', async () => {
    const stream = containerExec(engine, NAME, ['sh', '-c', 'echo hi; exit 3'], {})
    const out: string[] = []
    for await (const line of stream.stdout) out.push(line)
    expect(out).toContain('hi')
    expect(await stream.exitCode).toBe(3)
  })

  describe('a burst with a megabyte line, read after the process exits (Task 2)', () => {
    beforeAll(async () => {
      await engine.del(`/containers/${BURST}?force=true&v=true`)
      await engine.post(`/containers/create?name=${BURST}`, {
        Image: 'alpine:3.22',
        Cmd: ['sh', '-c', BURST_SCRIPT],
        HostConfig: { NetworkMode: 'none' },
      })
      await engine.post(`/containers/${BURST}/start`)
      const deadline = Date.now() + 60_000
      for (;;) {
        const state = await engine.get<{ State: { Running: boolean } }>(
          `/containers/${BURST}/json`,
        )
        if (state?.State.Running === false) break
        if (Date.now() > deadline) throw new Error('the burst container never exited')
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }, 120_000)

    it('answers the last records, each stamped by Docker, their times its own', async () => {
      const lines = await readAll({ tail: 50, lineBytes: 4096, timestamps: true })
      // 50 records after a megabyte line of 65: the window starts clean.
      const after = Array.from({ length: 49 }, (_, i) => `after ${i + 12}`)
      expect(lines.map((l) => l.text)).toEqual([...after, 'last'])
      expect(lines.every((l) => l.stamped && l.cutBytes === 0 && l.entries === 1)).toBe(
        true,
      )
      const times = lines.map((l) => l.at.getTime())
      // The property the time of READING lacks: the times move, and never backwards — the
      // second's pause sits between `after 30` and `after 31`.
      expect(times.every((t, i) => i === 0 || t >= times[i - 1]!)).toBe(true)
      expect(new Set(times).size).toBeGreaterThan(1)
      expect(
        times[lines.findIndex((l) => l.text === 'after 31')]! - times[0]!,
      ).toBeGreaterThanOrEqual(900)
    })

    it('cuts the megabyte line to 4 KiB as it reads it, its 64 stamps stripped, counting its records', async () => {
      const lines = await readAll({ tail: 200, lineBytes: 4096, timestamps: true })
      // 200 records: `last`, sixty `after`, the megabyte line's 65, and 74 `before`.
      expect(lines).toHaveLength(136)
      expect(lines[0]!.text).toBe('before 227')
      const big = lines[74]!
      expect(big).toMatchObject({
        text: 'x'.repeat(4096),
        cutBytes: 1_044_480,
        entries: 65,
        stamped: true,
      })
      expect(lines[75]!.text).toBe('after 1')
      expect(lines.at(-1)!.text).toBe('last')
      expect(lines.reduce((n, l) => n + l.entries, 0)).toBe(200)
    })

    it('can begin INSIDE a long line — the oldest line then a fragment of it', async () => {
      const lines = await readAll({ tail: 100, lineBytes: 4096, timestamps: true })
      // 100 records: `last`, sixty `after`, and the megabyte line's last 39 — 38 of its
      // 16 KiB records and the one holding its newline.
      expect(lines).toHaveLength(62)
      expect(lines[0]).toMatchObject({
        text: 'x'.repeat(4096),
        entries: 39,
        cutBytes: 38 * 16_384 - 4096,
      })
      expect(lines[1]!.text).toBe('after 1')
    })
  })
})
