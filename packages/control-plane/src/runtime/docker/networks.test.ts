import { describe, expect, it } from 'vitest'
import { EngineError, type EngineClient } from './engine.js'
import { appNetwork } from './names.js'
import {
  AI_GATEWAY_NEIGHBOUR,
  PLATFORM_NEIGHBOURS,
  attachPlatformNeighbours,
  destroyAppNetwork,
  ensureAppNetwork,
} from './networks.js'

/**
 * The daemon's network endpoints, in memory, answering the way the real ones were
 * MEASURED to (2026-09-14) in every respect these functions depend on:
 *
 *  * `GET /networks/{name}` returns a `Containers` map of `{ Name }` listing RUNNING
 *    containers only, because `attachPlatformNeighbours` reads the network back and
 *    throws PLATFORM_NEIGHBOUR_NOT_ATTACHED when a connect did nothing (pre-flight 56);
 *  * a connect for a container that does not exist answers 404, which the real
 *    engine client maps to `undefined` — so it attaches nothing;
 *  * a connect for a STOPPED container succeeds and is not listed, and the container
 *    keeps the connection (pre-flight 60);
 *  * disconnecting a container that is not connected is an error saying so, and a
 *    force-disconnect of a stopped one works;
 *  * deleting a network a RUNNING container is attached to is refused, as `docker
 *    network rm` is — and deleting one a STOPPED container still holds succeeds and
 *    strands that container, which then cannot start.
 */
function fakeEngine(
  existingContainers: readonly string[],
  stoppedContainers: readonly string[] = [],
) {
  const endpoints = new Map<string, Set<string>>()
  const deleted: string[] = []
  const stranded: string[] = []
  const known = new Set([...existingContainers, ...stoppedContainers])
  const stopped = new Set(stoppedContainers)
  const networkPath = /^\/networks\/([^/]+)$/
  const actionPath = /^\/networks\/([^/]+)\/(connect|disconnect)$/

  const engine: EngineClient = {
    async get<T>(path: string): Promise<T | undefined> {
      const name = networkPath.exec(path)?.[1]
      if (name === undefined) throw new Error(`unexpected GET ${path}`)
      const held = endpoints.get(name)
      if (held === undefined) return undefined
      const running = [...held].filter((c) => !stopped.has(c))
      return {
        Id: `id-${name}`,
        Containers: Object.fromEntries(
          running.map((container, i) => [`endpoint-${i}`, { Name: container }]),
        ),
      } as T
    },
    async post<T>(path: string, body?: unknown): Promise<T | undefined> {
      if (path === '/networks/create') {
        const name = (body as { Name: string }).Name
        endpoints.set(name, new Set())
        return { Id: `id-${name}` } as T
      }
      const match = actionPath.exec(path)
      if (match === null) throw new Error(`unexpected POST ${path}`)
      const network = match[1]!
      const held = endpoints.get(network)
      const container = (body as { Container: string }).Container
      if (!known.has(container)) return undefined
      if (match[2] === 'connect') {
        held?.add(container)
        return undefined
      }
      if (held === undefined || !held.has(container)) {
        throw new EngineError(
          'DOCKER_ENGINE_ERROR',
          `POST ${path} failed (403): container ${container} is not connected to the network ${network}`,
          '',
          403,
        )
      }
      held.delete(container)
      return undefined
    },
    async del<T>(path: string): Promise<T | undefined> {
      const name = networkPath.exec(path)?.[1]
      if (name === undefined) throw new Error(`unexpected DELETE ${path}`)
      const held = endpoints.get(name)
      if (held === undefined) return undefined
      if ([...held].some((c) => !stopped.has(c))) {
        throw new EngineError(
          'DOCKER_ENGINE_ERROR',
          `DELETE ${path} failed (403): error while removing network: network ${name} has active endpoints`,
          '',
          403,
        )
      }
      for (const container of held) stranded.push(`${container} -> ${name}`)
      endpoints.delete(name)
      deleted.push(name)
      return undefined
    },
    putArchive: () => Promise.reject(new Error('unexpected putArchive')),
    stream: () => Promise.reject(new Error('unexpected stream')),
  }

  return {
    engine,
    deleted,
    /** Containers that still hold a connection to a network that no longer exists. */
    stranded,
    /** Every container holding a connection, running or stopped. */
    connected: (name: string): string[] => [...(endpoints.get(name) ?? [])].sort(),
  }
}

const PLATFORM = [...PLATFORM_NEIGHBOURS, AI_GATEWAY_NEIGHBOUR]

describe('the AI gateway is a conditional neighbour (P4b Task 8)', () => {
  it('attaches manifest-litellm only when asked', async () => {
    const fake = fakeEngine(PLATFORM)
    await ensureAppNetwork(fake.engine, 'chem-labs', 'staging')
    expect(fake.connected(appNetwork('chem-labs', 'staging'))).toEqual(
      [...PLATFORM_NEIGHBOURS].sort(),
    )

    await ensureAppNetwork(fake.engine, 'bio-tools', 'staging', [AI_GATEWAY_NEIGHBOUR])
    expect(fake.connected(appNetwork('bio-tools', 'staging'))).toEqual(
      [...PLATFORM_NEIGHBOURS, AI_GATEWAY_NEIGHBOUR].sort(),
    )
  })

  it('attaches it to a network that ALREADY exists — the path every deploy takes', async () => {
    // `ensureService` creates the network first and passes nothing; `ensureInstance`
    // arrives a moment later asking for the gateway. A version that only attached
    // extras on create would pass the test above and give no AI app a route.
    const fake = fakeEngine(PLATFORM)
    await ensureAppNetwork(fake.engine, 'bio-tools', 'staging')
    await ensureAppNetwork(fake.engine, 'bio-tools', 'staging', [AI_GATEWAY_NEIGHBOUR])
    expect(fake.connected(appNetwork('bio-tools', 'staging'))).toContain(
      AI_GATEWAY_NEIGHBOUR,
    )
  })

  it('reads the extra neighbour back, and refuses when it is not there', async () => {
    // The gateway is down or renamed: the connect answers 404, the client maps that
    // to `undefined`, and without the read-back an AI app would deploy with no route
    // to its models and report success.
    const fake = fakeEngine(PLATFORM_NEIGHBOURS)
    await expect(
      ensureAppNetwork(fake.engine, 'bio-tools', 'staging', [AI_GATEWAY_NEIGHBOUR]),
    ).rejects.toMatchObject({ code: 'PLATFORM_NEIGHBOUR_NOT_ATTACHED' })
  })

  it('does NOT require the gateway for an app that does not ask for it', async () => {
    // Decision 5's coupling, in the form it would take: with LiteLLM absent, an app
    // with no AI at all must still get its network. This is negative control (a)'s
    // unit form; the live form stops `manifest-litellm` itself.
    const fake = fakeEngine(PLATFORM_NEIGHBOURS)
    await expect(
      ensureAppNetwork(fake.engine, 'chem-labs', 'staging'),
    ).resolves.toBeDefined()
  })

  it('destroyAppNetwork disconnects what is ATTACHED, not what is listed', async () => {
    // ORIENTATION §4: `docker network rm` fails while any container is attached, and
    // a previous cleanup reported success while five app networks survived. A
    // conditional neighbour is not in PLATFORM_NEIGHBOURS, so a list-driven teardown
    // reintroduces that defect for exactly the AI apps.
    const fake = fakeEngine([...PLATFORM, 'mf-bio-tools-staging-egress'])
    const name = appNetwork('bio-tools', 'staging')
    await ensureAppNetwork(fake.engine, 'bio-tools', 'staging')
    // Attached by hand rather than through `ensureAppNetwork`'s extras, so this test
    // is about the TEARDOWN alone: it went GREEN against the list-driven version when
    // it depended on the attach it did not test. The egress proxy is here because it
    // is on every app network and is in no list at all.
    await attachPlatformNeighbours(fake.engine, name, [
      AI_GATEWAY_NEIGHBOUR,
      'mf-bio-tools-staging-egress',
    ])
    await destroyAppNetwork(fake.engine, 'bio-tools', 'staging')
    expect(fake.deleted).toEqual([name])
    expect(fake.connected(name)).toEqual([])
  })

  it('does not strand a STOPPED gateway on a network it removes', async () => {
    // Measured 2026-09-14: a stopped container keeps a connection the network's
    // read-back does not list, the network then removes cleanly, and the container
    // can never start again. So a read-back-only teardown, run while LiteLLM is
    // stopped, would leave `manifest-litellm` unstartable.
    const fake = fakeEngine(PLATFORM_NEIGHBOURS, [AI_GATEWAY_NEIGHBOUR])
    const name = appNetwork('bio-tools', 'staging')
    await ensureAppNetwork(fake.engine, 'bio-tools', 'staging')
    // The connect a stopped container accepts and the read-back cannot see.
    await fake.engine.post(`/networks/${name}/connect`, {
      Container: AI_GATEWAY_NEIGHBOUR,
    })
    expect(fake.connected(name)).toContain(AI_GATEWAY_NEIGHBOUR)

    await destroyAppNetwork(fake.engine, 'bio-tools', 'staging')
    expect(fake.deleted).toEqual([name])
    expect(fake.stranded).toEqual([])
  })

  it('destroying a network that does not exist is a no-op', async () => {
    const fake = fakeEngine(PLATFORM)
    await expect(
      destroyAppNetwork(fake.engine, 'never-made', 'staging'),
    ).resolves.toBeUndefined()
    expect(fake.deleted).toEqual([])
  })
})
