import { describe, expect, it } from 'vitest'
import type { CaddyClient, CaddyRoute } from './caddy.js'
import { applyRoute } from './routes.js'

const spec = {
  hostname: 'app.staging.manifest.internal',
  upstream: 'mf-app-staging-app:8080',
  kind: 'staging' as const,
}

function fakeCaddy(overrides: Partial<CaddyClient> = {}): {
  client: CaddyClient
  puts: CaddyRoute[]
} {
  const puts: CaddyRoute[] = []
  const client: CaddyClient = {
    listServers: async () => ({}),
    getRoutes: async () => puts,
    putRoute: async (_server, route) => {
      puts.push(route)
    },
    deleteRoute: async () => undefined,
    ...overrides,
  }
  return { client, puts }
}

describe('applyRoute (§12, S1)', () => {
  it('replaces rather than duplicates: it deletes by id, then puts', async () => {
    const seen: string[] = []
    const { client, puts } = fakeCaddy({
      deleteRoute: async (_server, routeId) => {
        seen.push(routeId)
      },
    })
    await applyRoute(
      { caddy: client, servers: { internal: 'srv0', public: 'srv0' } },
      spec,
    )
    expect(seen).toHaveLength(1)
    expect(puts).toHaveLength(1)
  })

  /**
   * THE DELETE IS NOT ADVISORY. `putRoute` inserts at index 0 unconditionally, so
   * idempotence rests entirely on the delete having happened — and a swallowed
   * failure leaves TWO routes matching one host, the older one shadowed.
   *
   * Measured 2026-09-08: `routes.docker.test.ts`'s "applying twice leaves ONE
   * route" failed once in five Docker-tier runs and passed on the retry. A 404
   * from `DELETE /id/<unknown>` is already tolerated inside the client (removing
   * an absent route is the desired end state), so anything that still throws here
   * is a real failure and must not be turned into a silent duplicate.
   */
  it('refuses to put a duplicate when the delete genuinely failed', async () => {
    const { client, puts } = fakeCaddy({
      deleteRoute: async () => {
        throw new Error('caddy admin DELETE /id/x failed (502): upstream gone')
      },
    })
    await expect(
      applyRoute({ caddy: client, servers: { internal: 'srv0', public: 'srv0' } }, spec),
    ).rejects.toThrow(/502/)
    expect(puts).toHaveLength(0)
  })
})
