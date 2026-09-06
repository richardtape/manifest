import { afterAll, expect, it } from 'vitest'
import type { LogLine } from '../driver.js'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { containerLogs } from './logs.js'
import { containerExec } from './exec.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const NAME = 'mf-logtest-staging-app'

describeDocker('logs and exec against a real container', () => {
  afterAll(async () => {
    await engine.del(`/containers/${NAME}?force=true&v=true`)
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
})
