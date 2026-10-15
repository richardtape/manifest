import { describe, expect, it } from 'vitest'
import type { EngineClient } from './engine.js'
import {
  dockerStateToInstanceState,
  environmentHash,
  instanceStatus,
} from './instances.js'

const state = (over: Partial<Parameters<typeof dockerStateToInstanceState>[0]> = {}) => ({
  Status: 'running',
  ExitCode: 0,
  hibernationMarker: false,
  ...over,
})

describe('Docker state -> §11 InstanceState', () => {
  it('maps a running, healthy container to healthy', () => {
    expect(dockerStateToInstanceState(state({ Health: { Status: 'healthy' } }))).toBe(
      'healthy',
    )
  })

  it('maps a running container that has not passed its healthcheck to starting', () => {
    expect(dockerStateToInstanceState(state({ Health: { Status: 'starting' } }))).toBe(
      'starting',
    )
    expect(dockerStateToInstanceState(state({}))).toBe('starting')
  })

  it('maps a running container failing its healthcheck to failed', () => {
    expect(dockerStateToInstanceState(state({ Health: { Status: 'unhealthy' } }))).toBe(
      'failed',
    )
  })

  it('maps created to starting and removing to destroying', () => {
    expect(dockerStateToInstanceState(state({ Status: 'created' }))).toBe('starting')
    expect(dockerStateToInstanceState(state({ Status: 'removing' }))).toBe('destroying')
  })

  // THE DISTINCTION THIS FUNCTION EXISTS FOR. Docker leaves both in `exited`.
  it('maps a deliberate stop to hibernated and a crash to failed', () => {
    expect(
      dockerStateToInstanceState(
        state({ Status: 'exited', ExitCode: 0, hibernationMarker: true }),
      ),
    ).toBe('hibernated')
    // Same exit code, no marker: nobody asked for this. It is a failure.
    expect(
      dockerStateToInstanceState(
        state({ Status: 'exited', ExitCode: 0, hibernationMarker: false }),
      ),
    ).toBe('failed')
    expect(
      dockerStateToInstanceState(
        state({ Status: 'exited', ExitCode: 137, hibernationMarker: false }),
      ),
    ).toBe('failed')
    // A marker plus a non-zero code is still a stop we asked for: `docker stop`
    // SIGKILLs a container that ignores SIGTERM, and 137 is what that looks like.
    expect(
      dockerStateToInstanceState(
        state({ Status: 'exited', ExitCode: 137, hibernationMarker: true }),
      ),
    ).toBe('hibernated')
  })

  it('maps dead to failed', () => {
    expect(dockerStateToInstanceState(state({ Status: 'dead' }))).toBe('failed')
  })
})

describe('environmentHash — what decides reuse against replacement (P4b Task 9)', () => {
  it('is the same for the same environment in any order, and differs when one value does', () => {
    const hash = environmentHash(['MANIFEST_ENV=staging', 'LLM_API_KEY=sk-first'])
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    // Order is not a change: a spurious replacement is a container restarted for nothing.
    expect(environmentHash(['LLM_API_KEY=sk-first', 'MANIFEST_ENV=staging'])).toBe(hash)
    // A rotated key is: finding 72's redeploy of the same release.
    expect(environmentHash(['MANIFEST_ENV=staging', 'LLM_API_KEY=sk-second'])).not.toBe(
      hash,
    )
    // And the hash is not the environment: a label is readable by anything that can
    // inspect the container.
    expect(hash).not.toContain('sk-first')
  })
})

/**
 * AN OUT-OF-MEMORY EXIT, AS DOCKER REPORTS IT (the load rehearsal plan's Task 3; the second review's I5). B sitting 1's `[M7]`
 * measured three throwaways on Docker Desktop 4.95.0 (cgroup v2) — and these rows are exactly what it recorded: an
 * out-of-memory exit is `exited` / `137` / `OOMKilled: true`; a plain `SIGKILL` is `exited` / `137` / `false`, so only the
 * flag tells them apart; and under the init every app runs with, a process killed at the ceiling leaves the container
 * RUNNING with the flag set — and it stays set.
 */
describe('instanceStatus — out of memory, read from Docker’s own flag', () => {
  const engineFor = (state: Record<string, unknown>): EngineClient =>
    ({
      get: async (path: string) =>
        path.startsWith('/containers/') ? { State: state } : undefined,
    }) as unknown as EngineClient

  it('an out-of-memory exit: failed, exit 137, outOfMemory true', async () => {
    const status = await instanceStatus(
      engineFor({ Status: 'exited', ExitCode: 137, OOMKilled: true }),
      'mf-app',
    )
    expect(status).toMatchObject({ state: 'failed', exitCode: 137, outOfMemory: true })
  })

  it('a kill is not out of memory: exit 137 with OOMKilled false is outOfMemory false', async () => {
    const status = await instanceStatus(
      engineFor({ Status: 'exited', ExitCode: 137, OOMKilled: false }),
      'mf-app',
    )
    expect(status).toMatchObject({ state: 'failed', exitCode: 137, outOfMemory: false })
  })

  it('a RUNNING instance that lost a process to its ceiling has run out of memory — whatever its state (F2)', async () => {
    const status = await instanceStatus(
      engineFor({
        Status: 'running',
        ExitCode: 0,
        OOMKilled: true,
        Health: { Status: 'healthy' },
      }),
      'mf-app',
    )
    expect(status).toMatchObject({ state: 'healthy', healthy: true, outOfMemory: true })
    expect(status.exitCode).toBeUndefined()
  })

  it('a running instance with no such kill reads outOfMemory false, and a gone one says nothing', async () => {
    expect(
      (
        await instanceStatus(
          engineFor({ Status: 'running', ExitCode: 0, OOMKilled: false }),
          'mf-app',
        )
      ).outOfMemory,
    ).toBe(false)
    const gone = await instanceStatus(
      { get: async () => undefined } as unknown as EngineClient,
      'mf-x',
    )
    expect(gone).toEqual({ id: 'mf-x', state: 'gone', healthy: false })
  })
})
