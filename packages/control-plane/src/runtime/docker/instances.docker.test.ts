import { afterAll, beforeAll, expect, it } from 'vitest'
import type { InstanceSpec } from '../driver.js'
import { instanceName } from '../driver.js'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { destroyEgressProxy, ensureEgressProxy } from './egress.js'
import { appContainer } from './names.js'
import { destroyAppNetwork, ensureAppNetwork } from './networks.js'
import {
  destroyInstanceContainer,
  ensureInstanceContainer,
  instanceStatus,
  stopInstanceContainer,
} from './instances.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const SLUG = 'insttest'
const RELEASE = '9f1c4d2e-7a3b-4c5d-8e6f-0a1b2c3d4e5f'
let deps: Parameters<typeof ensureInstanceContainer>[2]

// A container that serves nothing: this task tests lifecycle, not the app. Task 17
// runs the real fixture app. `sleep` keeps it running long enough to observe the
// difference between a deliberate stop and a crash — alpine's default command
// exits immediately, which would make every state `exited` before a test looked.
const spec = (): InstanceSpec => ({
  name: instanceName(SLUG, 'staging', RELEASE),
  projectSlug: SLUG,
  environmentKind: 'staging',
  releaseId: RELEASE,
  image: {
    repository: 'alpine',
    // alpine:3.22. The digest this task originally carried was alpine:3.20 —
    // the very thing Task 3's comment warns against, since 3.20 is in neither
    // infra/images.txt nor the local registry and so is unavailable offline.
    digest: 'sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce',
  },
  env: { MANIFEST_ENV: 'staging' },
  port: 8080,
  healthPath: '/healthz',
  resources: { cpu: 0.5, memoryMi: 128, pids: 64, diskMi: 512 },
  services: [],
  egressAllow: [],
})

describeDocker('instance lifecycle (§11)', () => {
  beforeAll(async () => {
    await ensureAppNetwork(engine, SLUG, 'staging')
    const proxy = await ensureEgressProxy(engine, {
      slug: SLUG,
      kind: 'staging',
      allow: [],
    })
    deps = {
      networkName: 'mf-insttest-staging-net',
      dnsServer: '127.0.0.11',
      proxyUrl: proxy.url,
      hostname: `${SLUG}.staging.manifest.internal`,
      diskQuotaEnforceable: false,
      // Holds the container open. Without it `alpine` exits in under a second and
      // every assertion below is made against an already-dead container — the
      // hibernation test then "passes" having never stopped a running one.
      command: ['sleep', '600'],
    }
  })
  afterAll(async () => {
    await destroyInstanceContainer(engine, appContainer(spec().name))
    await destroyEgressProxy(engine, SLUG, 'staging')
    await destroyAppNetwork(engine, SLUG, 'staging')
  })

  it('is idempotent — the second call does not create a second container', async () => {
    const first = await ensureInstanceContainer(engine, spec(), deps)
    const second = await ensureInstanceContainer(engine, spec(), deps)
    expect(second.id).toBe(first.id)
    const all = await engine.get<{ Id: string }[]>(
      `/containers/json?all=true&filters=${encodeURIComponent(
        JSON.stringify({ name: [first.name] }),
      )}`,
    )
    expect(all!.length).toBe(1)
  })

  it('runs the image by DIGEST, which is what an approval binds to (§13)', async () => {
    const inspect = await engine.get<{ Config: { Image: string } }>(
      `/containers/${appContainer(spec().name)}/json`,
    )
    expect(inspect!.Config.Image).toContain('@sha256:')
  })

  it('reports hibernated after a stop, and wakes to the same container', async () => {
    const handle = await ensureInstanceContainer(engine, spec(), deps)
    // The container must actually be UP before it is stopped, or this test is
    // comparing two crashed containers and the marker proves nothing.
    expect((await instanceStatus(engine, handle.id)).state).toBe('starting')
    await stopInstanceContainer(engine, handle.id)
    expect((await instanceStatus(engine, handle.id)).state).toBe('hibernated')
    const woken = await ensureInstanceContainer(engine, spec(), deps)
    expect(woken.id).toBe(handle.id)
    expect((await instanceStatus(engine, handle.id)).state).not.toBe('hibernated')
  })

  // The distinction the marker volume exists for, against a real daemon.
  it('reports a container that stopped on its own as failed, not hibernated', async () => {
    const handle = await ensureInstanceContainer(engine, spec(), deps)
    // Kill it the way a crash would, without going through stopInstance.
    await engine.post(`/containers/${handle.id}/kill`)
    expect((await instanceStatus(engine, handle.id)).state).toBe('failed')
  })

  it('reports an unknown id as gone rather than throwing', async () => {
    expect((await instanceStatus(engine, 'mf-no-such-container')).state).toBe('gone')
  })

  it('destroys idempotently', async () => {
    await ensureInstanceContainer(engine, spec(), deps)
    const id = appContainer(spec().name)
    await destroyInstanceContainer(engine, id)
    await expect(destroyInstanceContainer(engine, id)).resolves.toBeUndefined()
    expect((await instanceStatus(engine, id)).state).toBe('gone')
  })
})
