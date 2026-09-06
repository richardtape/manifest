import { afterAll, beforeAll, expect, it } from 'vitest'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { destroyEgressProxy, ensureEgressProxy, proxyEnvironment } from './egress.js'
import { appNetwork, egressContainer } from './names.js'
import { destroyAppNetwork, ensureAppNetwork } from './networks.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const SLUG = 'egresstest'
const KIND = 'staging' as const
let proxyUrl = ''

async function curlThroughProxy(target: string): Promise<number> {
  const env = proxyEnvironment(proxyUrl)
  const created = await engine.post<{ Id: string }>('/containers/create', {
    Image: 'curlimages/curl:8.11.1',
    Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
    Cmd: ['-sS', '-m', '8', '-o', '/dev/null', '-f', target],
    HostConfig: { NetworkMode: appNetwork(SLUG, KIND) },
  })
  const id = created!.Id
  try {
    await engine.post(`/containers/${id}/start`)
    return (await engine.post<{ StatusCode: number }>(`/containers/${id}/wait`))!
      .StatusCode
  } finally {
    await engine.del(`/containers/${id}?force=true&v=true`)
  }
}

describeDocker('forced default-deny egress (D18)', () => {
  beforeAll(async () => {
    await ensureAppNetwork(engine, SLUG, KIND)
    proxyUrl = (await ensureEgressProxy(engine, { slug: SLUG, kind: KIND, allow: [] }))
      .url
  })
  afterAll(async () => {
    await destroyEgressProxy(engine, SLUG, KIND)
    await destroyAppNetwork(engine, SLUG, KIND)
  })

  it('is idempotent', async () => {
    const again = await ensureEgressProxy(engine, { slug: SLUG, kind: KIND, allow: [] })
    expect(again.url).toBe(proxyUrl)
  })

  // The proxy is the one container that is dual-homed onto the platform network,
  // so its own posture matters. Read back, not requested: `User nobody` inside
  // tinyproxy's config CANNOT work here — CapDrop:["ALL"] removes CAP_SETGID and
  // it dies with `Unable to change to group "nobody"` — so the container itself
  // must start as 65534. Nothing else asserts that, and the failure mode is a
  // proxy that silently runs as root.
  it('runs unprivileged, with no capabilities and no way to regain them', async () => {
    const inspect = await engine.get<{
      Config: { User: string }
      HostConfig: { CapDrop: string[]; SecurityOpt: string[]; Privileged: boolean }
    }>(`/containers/${egressContainer(SLUG, KIND)}/json`)
    expect(inspect!.Config.User).toBe('65534:65534')
    expect(inspect!.HostConfig.CapDrop).toEqual(['ALL'])
    expect(inspect!.HostConfig.SecurityOpt).toEqual(['no-new-privileges'])
    expect(inspect!.HostConfig.Privileged).toBe(false)
  })

  it('ALLOWS the platform baseline — the package mirror', async () => {
    expect(await curlThroughProxy('http://manifest-verdaccio:4873/-/ping')).toBe(0)
  })

  it('DENIES an undeclared destination', async () => {
    expect(await curlThroughProxy('https://example.com/')).not.toBe(0)
  })

  it('ALLOWS a destination this app declared, and only this app', async () => {
    await destroyEgressProxy(engine, SLUG, KIND)
    proxyUrl = (
      await ensureEgressProxy(engine, { slug: SLUG, kind: KIND, allow: ['example.com'] })
    ).url
    expect(await curlThroughProxy('https://example.com/')).toBe(0)
    // Still denied: a neighbour's declaration is not this app's.
    expect(await curlThroughProxy('https://example.org/')).not.toBe(0)
  })
})
