import type { FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'
import { originOf } from './origins.js'

/**
 * Decision 16 (the front-end enablement plan's Task 8): a request is judged against the
 * configured origin it ARRIVED on — named by its `Host`, which the edge preserves — and the
 * answer is always one of Manifest's own origins, never one the request names.
 */
const ORIGINS = ['https://console.manifest.internal', 'https://app.manifest.internal']

const arriving = (headers: Record<string, string>) =>
  ({ headers }) as unknown as FastifyRequest

describe('originOf', () => {
  it('answers the configured origin whose host the request arrived on', () => {
    expect(originOf(arriving({ host: 'app.manifest.internal' }), ORIGINS)).toBe(
      'https://app.manifest.internal',
    )
    expect(originOf(arriving({ host: 'console.manifest.internal' }), ORIGINS)).toBe(
      'https://console.manifest.internal',
    )
  })

  it('answers the first origin for a host it does not know — never the request’s own', () => {
    expect(
      originOf(
        arriving({ host: 'evil.example', origin: 'https://evil.example' }),
        ORIGINS,
      ),
    ).toBe('https://console.manifest.internal')
    // The ORIGIN header is not what chooses: a request on the console naming app's origin is
    // judged as the console's — so CSRF refuses it rather than being told it came from app.
    expect(
      originOf(
        arriving({
          host: 'console.manifest.internal',
          origin: 'https://app.manifest.internal',
        }),
        ORIGINS,
      ),
    ).toBe('https://console.manifest.internal')
    // No Host at all (a bare HTTP/1.0 request) is the first, not a crash.
    expect(originOf(arriving({}), ORIGINS)).toBe('https://console.manifest.internal')
  })

  it('compares hosts with their port, case-insensitively', () => {
    expect(originOf(arriving({ host: 'App.Manifest.Internal' }), ORIGINS)).toBe(
      'https://app.manifest.internal',
    )
    const loopback = ['http://127.0.0.1:7188', 'http://localhost:7188']
    expect(originOf(arriving({ host: 'localhost:7188' }), loopback)).toBe(
      'http://localhost:7188',
    )
    expect(originOf(arriving({ host: '127.0.0.1:7188' }), loopback)).toBe(
      'http://127.0.0.1:7188',
    )
    // The port is part of the host: the same name on another port is another origin.
    expect(originOf(arriving({ host: 'localhost:7189' }), loopback)).toBe(
      'http://127.0.0.1:7188',
    )
    // An https origin's default port may arrive spelled out, and is the same host.
    expect(originOf(arriving({ host: 'app.manifest.internal:443' }), ORIGINS)).toBe(
      'https://app.manifest.internal',
    )
  })
})
