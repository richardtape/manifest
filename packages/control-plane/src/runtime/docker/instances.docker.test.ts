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
const INSTANCE = 'd4c3b2a1-0000-4000-8000-000000000009'

const spec = (): InstanceSpec => ({
  name: instanceName(SLUG, 'staging', RELEASE, INSTANCE),
  instanceId: INSTANCE,
  hostname: `${SLUG}.staging.manifest.internal`,
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
  needsAiGateway: false,
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

  /**
   * THE WAKE PATH REUSES AND A CHANGED ENVIRONMENT IS REFUSED (P4b finding 72, then
   * P4c Task 2).
   *
   * A container used to be reused on its name alone, environment included, so a
   * redeploy of the SAME release — a retry after a failed health check — kept the
   * environment it was first created with. With §10's key minted on every deploy, the
   * deploy would then commit a key the container never received and revoke the one
   * it holds. P4b made that case DELETE and recreate.
   *
   * P4c makes it REFUSE, because §11's key gained the instance: a legitimate redeploy
   * is a new instance row and therefore a new name, so nothing that arrives here with
   * a changed environment can be a redeploy — and deleting would remove a container
   * that may be the one serving the app. The wake path is unchanged and still reuses.
   * The environment is read from INSIDE the container, because the contract suite
   * cannot see one (finding 73).
   */
  it('reuses a container whose environment is unchanged, and REFUSES one whose environment changed', async () => {
    const base: InstanceSpec = {
      ...spec(),
      // Its own instance name, for the reason the files test below gives.
      name: instanceName(
        SLUG,
        'staging',
        'c3d4e5f6-0000-4000-8000-000000000002',
        INSTANCE,
      ),
      env: { MANIFEST_ENV: 'staging', LLM_API_KEY: 'sk-first-key' },
    }
    const name = appContainer(base.name)
    await destroyInstanceContainer(engine, name).catch(() => undefined)

    const inspect = async () =>
      (await engine.get<{ Id: string; Config: { Labels: Record<string, string> } }>(
        `/containers/${name}/json`,
      ))!
    /** What the PROCESS sees, which is the only environment that matters. */
    const seenInside = async (variable: string): Promise<string> => {
      const exec = await engine.post<{ Id: string }>(`/containers/${name}/exec`, {
        AttachStdout: true,
        Cmd: ['sh', '-c', `printf '%s' "$${variable}"`],
      })
      const stream = await engine.stream(`/exec/${exec!.Id}/start`, 'POST', {
        Detach: false,
        Tty: true,
      })
      let out = ''
      for await (const chunk of stream as unknown as AsyncIterable<Buffer>)
        out += chunk.toString()
      return out
    }

    try {
      await ensureInstanceContainer(engine, base, deps)
      const first = (await inspect()).Id
      expect(await seenInside('LLM_API_KEY')).toBe('sk-first-key')

      // THE WAKE PATH: stopped, then ensured with the same environment — the SAME
      // container, which is what keeps §11's hibernation cheap.
      await stopInstanceContainer(engine, name)
      await ensureInstanceContainer(engine, base, deps)
      expect((await inspect()).Id).toBe(first)

      // THE SAME NAME WITH A NEW KEY IS REFUSED, and — the half that matters — the
      // container that was there is STILL THERE, still holding the value it was
      // created with. A delete here would have removed a container that may be serving.
      await expect(
        ensureInstanceContainer(
          engine,
          { ...base, env: { ...base.env, LLM_API_KEY: 'sk-second-key' } },
          deps,
        ),
      ).rejects.toMatchObject({ code: 'INSTANCE_SPEC_CHANGED' })
      const after = await inspect()
      expect(after.Id).toBe(first)
      expect(await seenInside('LLM_API_KEY')).toBe('sk-first-key')
      // The label carries a hash, never the environment.
      expect(after.Config.Labels['manifest.env-sha256']).toMatch(/^[0-9a-f]{64}$/)
      expect(JSON.stringify(after.Config.Labels)).not.toContain('sk-first-key')
      // And the hostname label `destroyInstance` removes a route by (P4c Task 2).
      expect(after.Config.Labels['manifest.hostname']).toBe(base.hostname)
    } finally {
      await destroyInstanceContainer(engine, name)
    }
  }, 120_000)

  /**
   * §8's two mounted paths, end to end. `SAML_IDP_CERT_PATH` and
   * `SAML_PRIVATE_KEY_PATH` are specified as files Manifest PLACES in the
   * container, and until 2026-09-08 nothing could place one — the rows named
   * paths that did not exist, and the blueprint's readFileSync would have
   * thrown ENOENT at startup.
   *
   * The MODE is asserted, not just the content: a private key at the default
   * 0444 would be readable by every process in the container, and §20 calls
   * production SP private keys the highest-value identity secrets.
   */
  it('places files inside the container, with the mode and owner asked for', async () => {
    // ITS OWN INSTANCE NAME. `ensureInstanceContainer` is idempotent by name, so
    // sharing one with the tests above takes the existing-container branch and
    // silently reuses a container created with no files volume — which is the
    // same trap that let a stale container serve four runs of the SAML suite.
    const withFiles = {
      ...spec(),
      name: instanceName(
        SLUG,
        'staging',
        'a1b2c3d4-0000-4000-8000-000000000001',
        INSTANCE,
      ),
      files: [
        {
          path: '/manifest/idp-signing.crt',
          contents: '-----BEGIN CERTIFICATE-----\npublic\n',
        },
        {
          path: '/manifest/sp-private-key.pem',
          contents: 'secret-key',
          // Root-owned, group-readable by the blueprint's gid. NOT app-owned:
          // the files volume must be mounted read-write (the daemon refuses to
          // write into a :ro mount), so ownership is what stops the app
          // rewriting its own key.
          //
          // AND NOT ROOT-ONLY. §12's hardening drops ALL capabilities, which
          // takes CAP_DAC_OVERRIDE with it — so root inside the container can
          // no longer read past permission bits. Measured 2026-09-08: a 0400
          // file owned by uid 10001 was unreadable by root, `stat` fine and
          // `cat` silent. §8's key has to be reachable by ownership or group,
          // never by privilege.
          mode: 0o440,
          uid: 0,
          gid: 10001,
        },
      ],
    }
    const name = appContainer(withFiles.name)
    await destroyInstanceContainer(engine, name).catch(() => undefined)
    await ensureInstanceContainer(engine, withFiles, deps)

    const read = async (path: string): Promise<string> => {
      const exec = await engine.post<{ Id: string }>(`/containers/${name}/exec`, {
        AttachStdout: true,
        Cmd: ['sh', '-c', `cat ${path}; echo; stat -c '%a %u %g' ${path}`],
      })
      const stream = await engine.stream(`/exec/${exec!.Id}/start`, 'POST', {
        Detach: false,
        Tty: true,
      })
      let out = ''
      for await (const chunk of stream as unknown as AsyncIterable<Buffer>)
        out += chunk.toString()
      return out
    }

    expect(await read('/manifest/idp-signing.crt')).toContain('BEGIN CERTIFICATE')
    const key = await read('/manifest/sp-private-key.pem')
    expect(key).toContain('secret-key')
    // Root-owned, group-readable by the blueprint's gid, and not world-readable.
    // The app can read it and cannot rewrite it — which is the posture a
    // read-write mount forces, since the daemon will not write into a :ro one.
    expect(key).toContain('440 0 10001')

    // The volume holds a copy of an SP private key, so it is removed with the
    // container rather than left for `make reset`.
    await destroyInstanceContainer(engine, name)
    expect(await engine.get(`/volumes/${name}-files`)).toBeUndefined()
  })
})
