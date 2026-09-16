import { listContainers } from './containers.js'
import { EngineError, type EngineClient } from './engine.js'
import { LABEL } from './instances.js'
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
 * The edge, by name — the first of `PLATFORM_NEIGHBOURS` and the one the driver has
 * to be able to say out loud.
 *
 * P4c's readiness probe runs INSIDE it (`probes.ts`): the edge is on every app
 * network, carries no proxy environment, and is the exact network position Caddy
 * will dial from when the route moves. Named here rather than repeated as a literal
 * in the driver, because `PLATFORM_NEIGHBOURS[0]` is a fact about an array's order
 * and this is a fact about which container is the edge.
 */
export const EDGE_NEIGHBOUR = 'manifest-caddy'

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
 * `extraNeighbours` ADDS; it never removes — still, and deliberately. Detaching here
 * would cut the previous release's container, which is still running and still
 * serving until the route moves, off from its models in the middle of the deploy that
 * replaces it. The removal is `detachAiGatewayIfUnused` below, called from the RETIRE
 * (P4c Task 5), which is the first moment the container that needed the gateway is
 * gone.
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

/**
 * Takes §10's gateway off an app network once nothing on it needs one (P4b finding 80).
 *
 * HERE, IN THE RETIRE, because this is the first moment it is safe: the container
 * that was using the gateway has just been removed, and the one that replaced it
 * declared no models. Detaching during the deploy would cut the PREVIOUS release off
 * from its models while it was still serving — and P4b measured what that costs a
 * student: 611 s (finding 181), because the toolkit exposes no timeout.
 *
 * It must run under the same per-app-network mutex as `ensureInstance`'s
 * attach-and-create (Decision 13). Without it, a deploy of an AI release that starts
 * while a retire is deciding can lose its gateway.
 *
 * A container from before P4c carries no `manifest.ai-gateway` label and is read as
 * NEEDING one. That is the safe direction, and it is the direction a negative control
 * watches: flip it to "does not need one" and an app whose only instances predate
 * this label loses its gateway.
 *
 * A STOPPED instance counts too — `listContainers` asks for `all=true`. A hibernated
 * app is one `ensureInstance` away from serving again, and it would wake with no
 * route to its models.
 */
export async function detachAiGatewayIfUnused(
  engine: EngineClient,
  slug: string,
  kind: EnvironmentKind,
): Promise<'detached' | 'kept' | 'absent'> {
  const name = appNetwork(slug, kind)
  // 404 -> undefined: no network, so there is nothing attached to anything.
  if ((await engine.get(`/networks/${name}`)) === undefined) return 'absent'
  const instances = await listContainers(engine, [
    `${LABEL.slug}=${slug}`,
    `${LABEL.environment}=${kind}`,
    // Only an APP container carries `manifest.release` (measured 2026-09-15, M5) —
    // the app's database and its egress proxy carry the slug and the environment too.
    LABEL.release,
  ])
  if (instances.some((container) => container.labels[LABEL.aiGateway] !== 'false')) {
    return 'kept'
  }
  try {
    await engine.post(`/networks/${name}/disconnect`, {
      Container: AI_GATEWAY_NEIGHBOUR,
      Force: true,
    })
  } catch (error) {
    // The one answer that means there was nothing to do. Anything else is a real
    // failure and belongs to the caller — a swallowed one here would leave the
    // gateway on an app network that no longer declares models and say it did not.
    if ((error as Error).message.includes('is not connected')) return 'absent'
    throw error
  }
  return 'detached'
}
