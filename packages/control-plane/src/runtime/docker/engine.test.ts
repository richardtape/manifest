import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  EngineError,
  assertApiVersionSupported,
  createEngineClient,
  resolveSocketPath,
} from './engine.js'

let server: Server | undefined
let dir: string | undefined

/** A stand-in daemon on a unix socket. Exercises the transport with no Docker. */
function fakeDaemon(
  handler: (path: string, method: string) => { status: number; body: unknown },
) {
  dir = mkdtempSync(join(tmpdir(), 'mf-engine-'))
  const socketPath = join(dir, 'docker.sock')
  server = createServer((req, res) => {
    const { status, body } = handler(req.url ?? '', req.method ?? 'GET')
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  return new Promise<string>((resolve) =>
    server!.listen(socketPath, () => resolve(socketPath)),
  )
}

afterEach(() => {
  server?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
  server = undefined
  dir = undefined
})

describe('the Engine API client', () => {
  it('prefixes the pinned API version and parses JSON', async () => {
    const seen: string[] = []
    const socketPath = await fakeDaemon((path) => {
      seen.push(path)
      return { status: 200, body: { Id: 'abc123' } }
    })
    const engine = createEngineClient({ socketPath })
    expect(await engine.get<{ Id: string }>('/containers/abc/json')).toEqual({
      Id: 'abc123',
    })
    expect(seen[0]).toBe('/v1.44/containers/abc/json')
  })

  it('turns a daemon error into a machine-actionable EngineError', async () => {
    const socketPath = await fakeDaemon(() => ({
      status: 409,
      body: { message: 'Conflict. The container name is already in use' },
    }))
    const engine = createEngineClient({ socketPath })
    await expect(engine.post('/containers/create', {})).rejects.toThrow(EngineError)
    try {
      await engine.post('/containers/create', {})
    } catch (error) {
      expect((error as EngineError).code).toBe('DOCKER_ENGINE_ERROR')
      expect((error as EngineError).status).toBe(409)
      expect((error as EngineError).message).toContain('already in use')
      expect((error as EngineError).hint).toBeTruthy()
    }
  })

  // 404 is not an error for this driver: destroy is idempotent (§11), so the
  // caller decides. Returning undefined is what lets destroyInstance swallow it
  // without string-matching an exception message.
  it('returns undefined for 404 rather than throwing', async () => {
    const socketPath = await fakeDaemon(() => ({
      status: 404,
      body: { message: 'no such container' },
    }))
    const engine = createEngineClient({ socketPath })
    expect(await engine.get('/containers/nope/json')).toBeUndefined()
    expect(await engine.del('/containers/nope')).toBeUndefined()
  })

  it('refuses a daemon whose API window does not contain the pin', async () => {
    const socketPath = await fakeDaemon(() => ({
      status: 200,
      body: { ApiVersion: '1.39', MinAPIVersion: '1.24', Version: '18.09.0' },
    }))
    const engine = createEngineClient({ socketPath })
    await expect(assertApiVersionSupported(engine)).rejects.toThrow(EngineError)
    try {
      await assertApiVersionSupported(engine)
    } catch (error) {
      expect((error as EngineError).code).toBe('DOCKER_API_VERSION_UNSUPPORTED')
    }
  })

  it('accepts a daemon whose window contains the pin', async () => {
    const socketPath = await fakeDaemon(() => ({
      status: 200,
      body: { ApiVersion: '1.55', MinAPIVersion: '1.40', Version: '29.7.2' },
    }))
    await expect(
      assertApiVersionSupported(createEngineClient({ socketPath })),
    ).resolves.toBeUndefined()
  })

  // Digit-concatenation would compare 1100 against 155 here and reject a daemon
  // that supports the pin. Two-part comparison is the only version of this that
  // survives Docker shipping API 1.100.
  it('compares versions as (major, minor), not as concatenated digits', async () => {
    const socketPath = await fakeDaemon(() => ({
      status: 200,
      body: { ApiVersion: '1.100', MinAPIVersion: '1.40', Version: '99.0.0' },
    }))
    await expect(
      assertApiVersionSupported(createEngineClient({ socketPath })),
    ).resolves.toBeUndefined()
  })
})

describe('socket discovery', () => {
  it('prefers DOCKER_HOST when it is a unix socket', () => {
    expect(resolveSocketPath({ DOCKER_HOST: 'unix:///custom/docker.sock' })).toBe(
      '/custom/docker.sock',
    )
  })

  // A TCP DOCKER_HOST is not a socket path. Silently falling back to the default
  // would talk to a DIFFERENT daemon than `docker` does — the driver would create
  // containers the developer cannot see.
  it('refuses a non-unix DOCKER_HOST rather than falling back', () => {
    expect(() => resolveSocketPath({ DOCKER_HOST: 'tcp://10.0.0.5:2376' })).toThrow(
      EngineError,
    )
  })

  it('honours MANIFEST_DOCKER_SOCKET when DOCKER_HOST is unset', () => {
    expect(resolveSocketPath({ MANIFEST_DOCKER_SOCKET: '/a/b.sock' })).toBe('/a/b.sock')
  })
})
