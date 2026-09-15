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
 * §10's model gateway — a CONDITIONAL neighbour, attached only to the network of an
 * app whose release declares `ai.models` (P4b Task 8, Decision 5).
 *
 * Not in PLATFORM_NEIGHBOURS, for two reasons. `attachPlatformNeighbours` throws when
 * a named container is missing, so every app network — including every app with no
 * AI at all — would then depend on LiteLLM being up. And §12's least privilege: an
 * app that declared no models has no business holding a route to the model gateway,
 * which S6 probe 13 asserts.
 */
export const AI_GATEWAY_NEIGHBOUR = 'manifest-litellm'

/**
 * `Internal: true` is the whole east-west section of §12 expressed as one flag: no
 * gateway means no route to the host, so no control plane, no metadata endpoint, no
 * other app, and no accidental egress. Everything that legitimately needs in is
 * attached explicitly below.
 *
 * `extraNeighbours` ADDS; it never removes. An app that stops declaring models keeps
 * the gateway attached until its network is destroyed. Detaching here would cut the
 * previous release's container — still running, since nothing retires it — off from
 * its models in the middle of the deploy that replaces it, and that container still
 * holds a live key anyway. Named rather than built: retiring an old instance is the
 * zero-downtime redeploy plan's, and the detach belongs there, beside the revoke.
 */
export async function ensureAppNetwork(
  engine: EngineClient,
  slug: string,
  kind: EnvironmentKind,
  extraNeighbours: readonly string[] = [],
): Promise<string> {
  const name = appNetwork(slug, kind)
  const neighbours = [...PLATFORM_NEIGHBOURS, ...extraNeighbours]
  const existing = await engine.get<{ Id: string }>(`/networks/${name}`)
  if (existing) {
    await attachPlatformNeighbours(engine, name, neighbours)
    return existing.Id
  }
  const created = await engine.post<{ Id: string }>('/networks/create', {
    Name: name,
    Driver: 'bridge',
    Internal: true,
    CheckDuplicate: true,
    Labels: { 'manifest.slug': slug, 'manifest.environment': kind },
  })
  await attachPlatformNeighbours(engine, name, neighbours)
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
 *
 * A STOPPED container is refused the same way, and it is worse than refused: the
 * connect succeeds, the network's read-back does not list it, and the container keeps
 * the connection — it joins this network when it next starts (measured 2026-09-14).
 * `destroyAppNetwork` sweeps the known neighbours for exactly that reason.
 */
export async function attachPlatformNeighbours(
  engine: EngineClient,
  network: string,
  names: readonly string[],
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
        'was renamed, PLATFORM_NEIGHBOURS and AI_GATEWAY_NEIGHBOUR in ' +
        'runtime/docker/networks.ts are the single place that names them.',
    )
  }
}

/**
 * Disconnects everything attached, then removes the network. TWO SOURCES, because
 * each one alone misses a case that has been measured:
 *
 *  * WHAT THE NETWORK LISTS, read back from the daemon. This used to be
 *    PLATFORM_NEIGHBOURS and nothing else, and `docker network rm` refuses while any
 *    container is attached — ORIENTATION §4 records five app networks surviving a
 *    cleanup that reported success. A conditional neighbour is by definition not in
 *    that list, so the list-driven version reintroduced the defect for exactly the
 *    apps that declare models (P4b Task 8).
 *
 *  * EVERY PLATFORM CONTAINER THAT CAN BE ATTACHED, whether listed or not. The
 *    read-back lists running containers only. A STOPPED platform container keeps its
 *    connection unlisted, the network then removes cleanly, and that container can
 *    never start again — measured 2026-09-14 on a throwaway container: `failed to set
 *    up container networking: network … not found`. Here that is `manifest-litellm`
 *    stopped while an AI app's network is destroyed. A force-disconnect of a stopped
 *    container works (measured, the same run), and "is not connected" is the one
 *    answer that means there was nothing to do.
 */
export async function destroyAppNetwork(
  engine: EngineClient,
  slug: string,
  kind: EnvironmentKind,
): Promise<void> {
  const name = appNetwork(slug, kind)
  const net = await engine.get<{ Containers?: Record<string, { Name: string }> }>(
    `/networks/${name}`,
  )
  // 404 -> undefined: the network is already gone, which is the desired end state.
  if (net === undefined) return
  const listed = Object.values(net.Containers ?? {}).map((c) => c.Name)
  for (const container of listed) {
    await engine.post(`/networks/${name}/disconnect`, {
      Container: container,
      Force: true,
    })
  }
  for (const container of [...PLATFORM_NEIGHBOURS, AI_GATEWAY_NEIGHBOUR]) {
    if (listed.includes(container)) continue
    try {
      await engine.post(`/networks/${name}/disconnect`, {
        Container: container,
        Force: true,
      })
    } catch (error) {
      if (!(error as Error).message.includes('is not connected')) throw error
    }
  }
  await engine.del(`/networks/${name}`)
}
