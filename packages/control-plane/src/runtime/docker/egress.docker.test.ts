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

/**
 * THE HTTP STATUS THE PROXY GAVE, not curl's exit code (P6b Task 5a): an allowed host that
 * cannot be reached and a filtered one both fail curl, and only the status tells them
 * apart — `403` is tinyproxy's `Filtered`, anything else means the filter let it through.
 * `Tty: true`, so the logs endpoint returns the bytes unframed.
 */
async function proxyAnswer(host: string): Promise<number> {
  const env = proxyEnvironment(proxyUrl)
  const created = await engine.post<{ Id: string }>('/containers/create', {
    Image: 'curlimages/curl:8.11.1',
    Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
    Tty: true,
    Cmd: ['-s', '-m', '8', '-o', '/dev/null', '-w', '%{http_code}', `http://${host}/`],
    HostConfig: { NetworkMode: appNetwork(SLUG, KIND) },
  })
  const id = created!.Id
  try {
    await engine.post(`/containers/${id}/start`)
    await engine.post(`/containers/${id}/wait`)
    let out = ''
    for await (const chunk of await engine.stream(`/containers/${id}/logs?stdout=true`))
      out += String(chunk)
    const status = Number(out.trim())
    if (!Number.isInteger(status) || status === 0)
      throw new Error(`curl through the proxy printed no status for ${host}: '${out}'`)
    return status
  } finally {
    await engine.del(`/containers/${id}?force=true&v=true`)
  }
}

/** The proxy container's id — what "the same container" means. */
async function containerId(name: string): Promise<string> {
  return (await engine.get<{ Id: string }>(`/containers/${name}/json`))!.Id
}

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
    // The destroy is no longer needed since P6b Task 5a — a changed list recreates the
    // proxy — and it stays: this case proves a FRESH container enforces its list, which the
    // cases below, which change a running one, do not.
    await destroyEgressProxy(engine, SLUG, KIND)
    proxyUrl = (
      await ensureEgressProxy(engine, { slug: SLUG, kind: KIND, allow: ['example.com'] })
    ).url
    expect(await curlThroughProxy('https://example.com/')).toBe(0)
    // Still denied: a neighbour's declaration is not this app's.
    expect(await curlThroughProxy('https://example.org/')).not.toBe(0)
  })

  /**
   * **THE LIST FOLLOWS THE RELEASE (P6b Task 5a, Task 1's F1).** An environment's proxy used
   * to render its allowlist once, at its first deploy, and never again: an ADDED host was
   * refused like an undeclared one, and a REMOVED host stayed reachable. Each case starts
   * from a fresh proxy so its first state is known, and then changes the list the way a
   * deploy does — by asking for it — WITHOUT destroying anything.
   */
  it('re-renders a WIDER list without being destroyed first — the new host is no longer Filtered', async () => {
    await destroyEgressProxy(engine, SLUG, KIND)
    await ensureEgressProxy(engine, { slug: SLUG, kind: KIND, allow: [] })
    expect(await proxyAnswer('added.example.org')).toBe(403) // THE POSITIVE HALF: filtered
    await ensureEgressProxy(engine, {
      slug: SLUG,
      kind: KIND,
      allow: ['added.example.org'],
    })
    expect(await proxyAnswer('added.example.org')).not.toBe(403)
  })

  it('re-renders a NARROWER list — a REMOVED host is Filtered again (the fail-open, Task 1 F1)', async () => {
    await destroyEgressProxy(engine, SLUG, KIND)
    await ensureEgressProxy(engine, {
      slug: SLUG,
      kind: KIND,
      allow: ['gone.example.org'],
    })
    expect(await proxyAnswer('gone.example.org')).not.toBe(403) // THE POSITIVE HALF: allowed
    await ensureEgressProxy(engine, { slug: SLUG, kind: KIND, allow: [] })
    expect(await proxyAnswer('gone.example.org')).toBe(403)
  })

  it('keeps the SAME container when the list has not changed — a redeploy does not bounce the proxy', async () => {
    await ensureEgressProxy(engine, {
      slug: SLUG,
      kind: KIND,
      allow: ['kept.example.org'],
    })
    const settled = await containerId(egressContainer(SLUG, KIND))
    await ensureEgressProxy(engine, {
      slug: SLUG,
      kind: KIND,
      allow: ['kept.example.org'],
    })
    expect(await containerId(egressContainer(SLUG, KIND))).toBe(settled)
  })
})
