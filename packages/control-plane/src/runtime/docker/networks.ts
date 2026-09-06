import { EngineError, type EngineClient } from './engine.js'
import { appNetwork, type EnvironmentKind } from './names.js'

/**
 * The platform containers that must be able to reach into every app network.
 * Caddy because §21 forbids the control plane from reaching container IPs, so the
 * edge is the only thing that can. dnsmasq because §12 makes the resolver
 * per-container and an internal network cannot forward a query off itself.
 *
 * These are P1's `container_name` values from `infra/compose.yaml`, not guesses.
 */
export const PLATFORM_NEIGHBOURS = ['manifest-caddy', 'manifest-dns-containers']

/**
 * `Internal: true` is the whole east-west section of §12 expressed as one flag: no
 * gateway means no route to the host, so no control plane, no metadata endpoint, no
 * other app, and no accidental egress. Everything that legitimately needs in is
 * attached explicitly below.
 */
export async function ensureAppNetwork(
  engine: EngineClient,
  slug: string,
  kind: EnvironmentKind,
): Promise<string> {
  const name = appNetwork(slug, kind)
  const existing = await engine.get<{ Id: string }>(`/networks/${name}`)
  if (existing) {
    await attachPlatformNeighbours(engine, name, PLATFORM_NEIGHBOURS)
    return existing.Id
  }
  const created = await engine.post<{ Id: string }>('/networks/create', {
    Name: name,
    Driver: 'bridge',
    Internal: true,
    CheckDuplicate: true,
    Labels: { 'manifest.slug': slug, 'manifest.environment': kind },
  })
  await attachPlatformNeighbours(engine, name, PLATFORM_NEIGHBOURS)
  return created!.Id
}

/**
 * Idempotent: the daemon answers 403 when the container is already attached.
 *
 * Then it READS THE NETWORK BACK, because the POST cannot tell us it worked. A
 * container that does not exist answers **404**, and the engine client maps 404 to
 * `undefined` rather than throwing — deliberately, so §11's destroys can be
 * idempotent. The two rules compose into a silent no-op: measured, a connect for
 * `manifest-dnsmasq-containers` (a name that does not exist on this machine; P1
 * calls it `manifest-dns-containers`) returned 404 and this function reported
 * success. Every app network would have come up with no resolver and no edge.
 */
export async function attachPlatformNeighbours(
  engine: EngineClient,
  network: string,
  names: string[],
): Promise<void> {
  for (const container of names) {
    try {
      await engine.post(`/networks/${network}/connect`, { Container: container })
    } catch (error) {
      const message = (error as Error).message
      if (!message.includes('already exists in network')) throw error
    }
  }
  const net = await engine.get<{ Containers?: Record<string, { Name: string }> }>(
    `/networks/${network}`,
  )
  const attached = Object.values(net?.Containers ?? {}).map((c) => c.Name)
  const missing = names.filter((n) => !attached.includes(n))
  if (missing.length > 0) {
    throw new EngineError(
      'PLATFORM_NEIGHBOUR_NOT_ATTACHED',
      `app network ${network} is missing ${missing.join(', ')}`,
      'Is the platform up? `make up`, then `make doctor`. If a platform container ' +
        'was renamed, PLATFORM_NEIGHBOURS in runtime/docker/networks.ts is the ' +
        'single place that names them.',
    )
  }
}

export async function destroyAppNetwork(
  engine: EngineClient,
  slug: string,
  kind: EnvironmentKind,
): Promise<void> {
  const name = appNetwork(slug, kind)
  for (const container of PLATFORM_NEIGHBOURS) {
    try {
      await engine.post(`/networks/${name}/disconnect`, {
        Container: container,
        Force: true,
      })
    } catch {
      /* not attached, or the network is already gone — both are the desired end state */
    }
  }
  await engine.del(`/networks/${name}`)
}
