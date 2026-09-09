import { afterAll, beforeAll, expect, it } from 'vitest'
import type { ServiceBinding } from '../driver.js'
import { serviceName } from '../driver.js'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { serviceVolume } from './names.js'
import { destroyAppNetwork, ensureAppNetwork } from './networks.js'
import { destroyServiceContainer, ensureServiceContainer } from './services.js'
import { withSecretScope } from '../../secrets/testing.js'
import { ensureServiceCredentials, deriveCredentials } from '../../services/index.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const SLUG = 'svctest'
// The credentials the CALLER resolved. §12 stores them and §5 keeps the driver
// away from `db/`, so `deriveCredentials` no longer runs in here at all — the
// container is created with exactly what it is handed, and the endpoint below
// is asserted to carry the same values.
const CREDENTIALS = {
  username: 'app_svctest',
  password: 'x'.repeat(32),
  database: 'svctest',
}
const binding: ServiceBinding = {
  name: serviceName(SLUG, 'staging', 'db'),
  type: 'mongo',
  version: '7',
  environmentId: 'env-1',
  projectSlug: SLUG,
  credentials: CREDENTIALS,
}

/**
 * Does this URI actually authenticate? Exit status from a throwaway `mongosh`.
 *
 * insertOne, NOT ping. `ping` is one of the few commands MongoDB serves BEFORE
 * authentication — measured, it answers ok=1 on an unauthenticated connection —
 * so a ping-based check passes identically against a Mongo started with no
 * authentication at all, which is the exact failure this file exists to catch.
 */
const probe = async (uri: string): Promise<number> => {
  const created = await engine.post<{ Id: string }>('/containers/create', {
    Image: 'mongodb/mongodb-community-server:7.0.28-ubi8',
    Entrypoint: ['mongosh'],
    Cmd: [uri, '--quiet', '--eval', 'db.probe.insertOne({a:1}).acknowledged'],
    HostConfig: { NetworkMode: 'mf-svctest-staging-net' },
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

const volumeExists = async (): Promise<boolean> =>
  (await engine.get(`/volumes/${serviceVolume(binding.name)}`)) !== undefined

describeDocker('dedicated backing services (D3)', () => {
  beforeAll(async () => {
    await ensureAppNetwork(engine, SLUG, 'staging')
  })
  afterAll(async () => {
    await destroyServiceContainer(engine, `mf-${binding.name}`, { deleteData: true })
    await destroyAppNetwork(engine, SLUG, 'staging')
  })

  it('creates the service and the second call is a no-op', async () => {
    const first = await ensureServiceContainer(engine, binding, 'staging')
    const second = await ensureServiceContainer(engine, binding, 'staging')
    expect(second.id).toBe(first.id)
    expect(second.endpoint).toBe(first.endpoint)
  })

  it('publishes no port and sits on the app network only', async () => {
    const inspect = await engine.get<{
      NetworkSettings: {
        Ports: Record<string, unknown>
        Networks: Record<string, unknown>
      }
      HostConfig: { PortBindings: Record<string, unknown> }
    }>(`/containers/mf-${binding.name}/json`)
    // PUBLISHED, not EXPOSED. `NetworkSettings.Ports` lists what the IMAGE
    // exposes — measured, `{"27017/tcp": null}` — and the null is the whole
    // point: exposed, bound to nothing. Asserting that map is empty fails
    // against a perfectly private container and says nothing about publication.
    expect(inspect!.HostConfig.PortBindings).toEqual({})
    expect(Object.values(inspect!.NetworkSettings.Ports)).toEqual([null])
    expect(Object.keys(inspect!.NetworkSettings.Networks)).toEqual([
      'mf-svctest-staging-net',
    ])
  })

  it('runs the digest-pinned catalogue image, not a tag', async () => {
    const inspect = await engine.get<{ Config: { Image: string } }>(
      `/containers/mf-${binding.name}/json`,
    )
    expect(inspect!.Config.Image).toContain('@sha256:')
  })

  // THE ASSERTION THAT MATTERS, and the one it is easiest to leave out. "The
  // container is running" and "the credentials in the endpoint actually
  // authenticate" are different claims, and the environment-variable names are
  // image-specific: `mongodb/mongodb-community-server` reads MONGODB_INITDB_*
  // while the Docker-official `mongo` image reads MONGO_INITDB_*. Getting that
  // wrong starts a Mongo with NO authentication at all and every other test here
  // stays green.
  it('accepts the derived credentials, rejects a wrong one, and refuses none at all', async () => {
    const handle = await ensureServiceContainer(engine, binding, 'staging')
    expect(await probe(handle.endpoint)).toBe(0)
    expect(await probe(handle.endpoint.replace(/:[^:@]+@/, ':wrong-password@'))).not.toBe(
      0,
    )
    // THE ONE THAT MATTERS: no credentials at all must be refused. This is what
    // detects a service started without authentication actually enforced.
    expect(await probe(handle.endpoint.replace(/\/\/[^@]+@/, '//'))).not.toBe(0)
  })

  // The container leaves nothing behind but its named data volume. The mongo
  // image declares /data/configdb as a VOLUME too, so without `v=true` on the
  // container delete every deploy orphans one anonymous volume for ever — which
  // is unbounded disk growth on the laptop C1 requires this to run on.
  it('leaves no anonymous volume behind', async () => {
    const anonymous = async (): Promise<string[]> => {
      const list = await engine.get<{ Volumes: { Name: string }[] }>('/volumes')
      return (list?.Volumes ?? [])
        .map((v) => v.Name)
        .filter((n) => /^[0-9a-f]{64}$/.test(n))
        .sort()
    }
    // Clean slate first: an earlier test in this file leaves a service running,
    // and destroying it correctly reclaims ITS anonymous volume — which would
    // make the count go DOWN and read as a failure of this assertion.
    await destroyServiceContainer(engine, `mf-${binding.name}`, { deleteData: false })
    const before = await anonymous()
    await ensureServiceContainer(engine, binding, 'staging')
    await destroyServiceContainer(engine, `mf-${binding.name}`, { deleteData: false })
    expect(await anonymous()).toEqual(before)
  })

  it('honours deleteData:false — the volume survives', async () => {
    await destroyServiceContainer(engine, `mf-${binding.name}`, { deleteData: false })
    expect(await volumeExists()).toBe(true)
  })

  it('honours deleteData:true — the volume goes', async () => {
    await ensureServiceContainer(engine, binding, 'staging')
    await destroyServiceContainer(engine, `mf-${binding.name}`, { deleteData: true })
    expect(await volumeExists()).toBe(false)
  })

  /**
   * THE MIGRATION, against a real Mongo — and the outage it exists to prevent.
   *
   * Moving credentials onto the binding means this file now constructs them,
   * which is a real reduction in what the tests above prove: they show that
   * whatever the caller supplies authenticates, not that what `secrets/`
   * supplies does. This closes that, and then goes one step further.
   *
   * A container's root password is fixed when the container is created. So the
   * second half regenerates the master secret — exactly what happens when a
   * developer's `.env` is rebuilt — and shows that the STORED password still
   * authenticates while the newly DERIVED one does not. That second assertion
   * is the failure this whole task exists to prevent, and `config.ts` warns
   * about it in prose: "the failure reads as a Mongo fault".
   */
  it('a service created from the STORE still authenticates after the master secret changes', async () => {
    const NAME = serviceName(SLUG, 'staging', 'stored')
    try {
      await withSecretScope(async (db, { projectId, keys, masterSecret }) => {
        const stub = { name: NAME, type: 'mongo', projectSlug: SLUG }
        const credentials = await ensureServiceCredentials(
          db,
          keys,
          projectId,
          'staging',
          stub,
          masterSecret,
        )
        const handle = await ensureServiceContainer(
          engine,
          { ...binding, name: NAME, credentials },
          'staging',
        )
        expect(await probe(handle.endpoint)).toBe(0)

        // `.env` regenerated. The stored value must win — and it must still work.
        const rotated = 'z'.repeat(64)
        const afterRotation = await ensureServiceCredentials(
          db,
          keys,
          projectId,
          'staging',
          stub,
          rotated,
        )
        expect(afterRotation.password).toBe(credentials.password)
        expect(
          await probe(
            handle.endpoint.replace(
              `:${credentials.password}@`,
              `:${afterRotation.password}@`,
            ),
          ),
        ).toBe(0)

        // And the value a cut-over WOULD have used is refused by the running
        // container. This is the outage, reproduced deliberately.
        const derivedNow = deriveCredentials(rotated, stub)
        expect(derivedNow.password).not.toBe(credentials.password)
        expect(
          await probe(
            handle.endpoint.replace(
              `:${credentials.password}@`,
              `:${derivedNow.password}@`,
            ),
          ),
        ).not.toBe(0)
      })
    } finally {
      await destroyServiceContainer(engine, `mf-${NAME}`, { deleteData: true })
    }
  }, 180_000)
})
