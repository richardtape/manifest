import { afterAll, beforeAll, expect, it } from 'vitest'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { appNetwork } from './names.js'
import {
  AI_GATEWAY_NEIGHBOUR,
  PLATFORM_NEIGHBOURS,
  destroyAppNetwork,
  ensureAppNetwork,
} from './networks.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const SLUG = 'nettest'
const KIND = 'staging' as const

/**
 * Runs one container on a network and returns its EXIT CODE. Judging by exit code
 * rather than by grepping output is deliberate: P1's self-review caught a check
 * whose failure message contained the very word it was grepping for.
 */
async function runExit(network: string, image: string, cmd: string[]): Promise<number> {
  const created = await engine.post<{ Id: string }>('/containers/create', {
    Image: image,
    Cmd: cmd,
    HostConfig: { NetworkMode: network, AutoRemove: false },
  })
  const id = created!.Id
  try {
    await engine.post(`/containers/${id}/start`)
    const wait = await engine.post<{ StatusCode: number }>(`/containers/${id}/wait`)
    return wait!.StatusCode
  } finally {
    await engine.del(`/containers/${id}?force=true&v=true`)
  }
}

const curlExit = (network: string, args: string[]): Promise<number> =>
  runExit(network, 'curlimages/curl:8.11.1', [
    '-sS',
    '-m',
    '5',
    '-o',
    '/dev/null',
    ...args,
  ])

/** 0 = the container has a default route; 1 = it has none. */
const hasDefaultRoute = (network: string): Promise<number> =>
  runExit(network, 'alpine:3.22', ['sh', '-c', 'ip route | grep -q default'])

/** What the DAEMON says is attached — never what a call reported. */
const attachedTo = async (network: string): Promise<string[]> => {
  const net = await engine.get<{ Containers?: Record<string, { Name: string }> }>(
    `/networks/${network}`,
  )
  return Object.values(net?.Containers ?? {}).map((c) => c.Name)
}

describeDocker('per-app networks and §12 east-west denials', () => {
  beforeAll(async () => {
    await ensureAppNetwork(engine, SLUG, KIND)
  })
  afterAll(async () => {
    await destroyAppNetwork(engine, SLUG, KIND)
  })

  it('is idempotent — the second call returns the same network', async () => {
    const first = await ensureAppNetwork(engine, SLUG, KIND)
    const second = await ensureAppNetwork(engine, SLUG, KIND)
    expect(second).toBe(first)
  })

  it('creates the network as internal, which is what makes the denials real', async () => {
    const net = await engine.get<{ Internal: boolean; Name: string }>(
      `/networks/${appNetwork(SLUG, KIND)}`,
    )
    expect(net!.Internal).toBe(true)
    expect(net!.Name).toBe('mf-nettest-staging-net')
  })

  // Nothing else asserts this, and it cannot be inferred from a successful connect:
  // the daemon answers 404 for a container that does not exist, and the engine
  // client maps 404 to `undefined` rather than throwing. Without this readback a
  // renamed platform container produces app networks with no resolver and no edge,
  // silently, and the first symptom is an unexplainable DNS failure at Task 13.
  it('attaches the platform neighbours, and can tell when it did not', async () => {
    const attached = await attachedTo(appNetwork(SLUG, KIND))
    for (const neighbour of PLATFORM_NEIGHBOURS) expect(attached).toContain(neighbour)
    // And NOT the model gateway: this network was ensured with no extras, which is
    // every app that declares no models (P4b Task 8, Decision 5).
    expect(attached).not.toContain(AI_GATEWAY_NEIGHBOUR)
  })

  /**
   * THE TEARDOWN OF A CONDITIONAL NEIGHBOUR, against the daemon (P4b Task 8).
   *
   * `destroyAppNetwork` used to disconnect PLATFORM_NEIGHBOURS and nothing else, and
   * `manifest-litellm` is not in that list. Its own network, so a failure here cannot
   * strand the gateway on the network the denials below are measured from. The
   * gateway must still be RUNNING afterwards: disconnecting it from an app network
   * must not touch the platform network every other app reaches it on.
   */
  it('removes an app network the model gateway is attached to, and leaves the gateway running', async () => {
    const slug = 'nettest-ai'
    const name = appNetwork(slug, KIND)
    await ensureAppNetwork(engine, slug, KIND, [AI_GATEWAY_NEIGHBOUR])
    try {
      expect(await attachedTo(name)).toContain(AI_GATEWAY_NEIGHBOUR)
    } finally {
      await destroyAppNetwork(engine, slug, KIND)
    }
    expect(await engine.get(`/networks/${name}`)).toBeUndefined()
    const gateway = await engine.get<{ State: { Running: boolean } }>(
      `/containers/${AI_GATEWAY_NEIGHBOUR}/json`,
    )
    expect(gateway!.State.Running).toBe(true)
  })

  /**
   * THE MECHANISM, asserted directly. Every denial below is caused by this one
   * fact and nothing else, so it is the assertion that must hold even when a
   * particular destination happens to be unreachable for its own reasons.
   *
   * It also covers the §12 denials that CANNOT be probed on this machine.
   * `169.254.169.254` is the clearest: measured, it times out from an ordinary
   * bridge network too, because Docker Desktop runs no metadata service — so a
   * probe for it is green on any topology and proves nothing. With no default
   * route there is no path to any off-network address, link-local included.
   * Task 18's S6 matrix measures the reachable set directly.
   *
   * Note IPAM is NOT the place to check this: measured, both an internal and an
   * ordinary bridge network report an `IPAM.Config[].Gateway`. The difference is
   * only visible from inside the container's routing table.
   */
  it('has no default route — the mechanism behind every denial below', async () => {
    expect(await hasDefaultRoute(appNetwork(SLUG, KIND))).not.toBe(0)
    expect(await hasDefaultRoute('bridge')).toBe(0)
  })

  /**
   * §12 denies app -> the developer's own machine, where the control plane listens.
   * Probed at 7107 (the registry), NOT 7100: the control plane is a HOST process
   * and is usually not running during tests, so a probe at 7100 fails from an
   * ordinary bridge network too — measured, exit 7 — and the denial would pass on
   * any topology. Reaching *any* host port is the property; 7107 is the one that
   * always answers.
   */
  it('DENIES the host, where the control plane listens', async () => {
    expect(
      await curlExit(appNetwork(SLUG, KIND), ['http://host.docker.internal:7107/v2/']),
    ).not.toBe(0)
  })

  it('DENIES the public internet — there is no egress until Task 5 gives it one', async () => {
    expect(
      await curlExit(appNetwork(SLUG, KIND), ['https://registry.npmjs.org/']),
    ).not.toBe(0)
  })

  // THE NEGATIVE CONTROL. The denials above must be caused by `internal: true` and
  // nothing else. On an ordinary bridge network the same probes must SUCCEED —
  // otherwise they are passing because the image is broken, the timeout is too
  // short, or the machine is offline, and they would keep passing after someone
  // removed the flag.
  it('NEGATIVE CONTROL: the same probes succeed on an ordinary bridge network', async () => {
    expect(await curlExit('bridge', ['http://host.docker.internal:7107/v2/'])).toBe(0)
    expect(await curlExit('bridge', ['https://registry.npmjs.org/'])).toBe(0)
  })
})
