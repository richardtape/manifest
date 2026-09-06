import { describe, expect, it } from 'vitest'
import { dockerStateToInstanceState } from './instances.js'

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
