import { createHash } from 'node:crypto'
import type {
  InstanceHandle,
  InstanceSpec,
  InstanceState,
  InstanceStatus,
} from '../driver.js'
import { EngineError, type EngineClient } from './engine.js'
import { hardenedHostConfig } from './hardening.js'
import { appContainer, filesVolume } from './names.js'
import { proxyEnvironment } from './egress.js'
import { tarArchive } from './archive.js'

export interface DockerState {
  Status: string
  ExitCode: number
  Health?: { Status: string }
  /** Our own marker volume. Docker cannot tell a stop from a crash; this can. */
  hibernationMarker: boolean
}

const hibernationVolume = (container: string) => `${container}-hibernated`

/**
 * `exited` is BOTH hibernation and a crash in Docker's vocabulary. Mapping it to
 * `hibernated` unconditionally passes the contract suite and makes a dead app look
 * asleep — §11's state machine would never reach `failed`, so no Event is raised
 * and nothing backs off. The marker volume is what makes the two distinguishable.
 */
export function dockerStateToInstanceState(state: DockerState): InstanceState {
  switch (state.Status) {
    case 'created':
    case 'restarting':
      return 'starting'
    case 'running':
      if (state.Health?.Status === 'healthy') return 'healthy'
      if (state.Health?.Status === 'unhealthy') return 'failed'
      return 'starting'
    case 'removing':
      return 'destroying'
    case 'exited':
      return state.hibernationMarker ? 'hibernated' : 'failed'
    case 'dead':
    default:
      return 'failed'
  }
}

export interface InstanceDeps {
  networkName: string
  dnsServer: string
  proxyUrl: string
  hostname: string
  diskQuotaEnforceable: boolean
  /**
   * Normally absent: a real app's command is its blueprint's `CMD` (D13), and the
   * driver must not second-guess it. It exists because P3's own lifecycle test
   * needs a container that STAYS UP — `alpine` with no command exits in under a
   * second, and a test that stops an already-exited container proves nothing
   * about the difference between a stop and a crash.
   */
  command?: string[]
}

/** Where `InstanceSpec.files` are mounted. §8's SAML_IDP_CERT_PATH and
 *  SAML_PRIVATE_KEY_PATH point inside here. */
export const FILES_MOUNT = '/manifest'

/**
 * §8's two mounted paths, materialised.
 *
 * Through the ARCHIVE ENDPOINT rather than a bind mount: the SP's private key
 * never touches a host path, which is the whole point of `secrets/`, and §20
 * calls production SP private keys the highest-value identity secrets.
 *
 * Into a VOLUME rather than the container's filesystem, because §12's hardening
 * sets `ReadonlyRootfs` and the daemon refuses outright — measured 2026-09-08:
 *
 *   docker cp … container:/tmp/x        -> container rootfs is marked read-only
 *   docker cp … container:/manifest/x   -> accepted (a volume mount)
 *   …with the volume mounted :ro        -> mounted volume is marked read-only
 *
 * The third line is why the mount is read-write and why FILE OWNERSHIP carries
 * the protection instead: a root-owned, group-readable 0440 key can be read by
 * the app and rewritten by nobody, and the volume's own root-owned directory
 * stops the app creating or deleting entries.
 *
 * Called before every start, so waking a hibernated instance re-asserts the
 * files rather than trusting what the volume still holds.
 */
async function placeFiles(
  engine: EngineClient,
  name: string,
  files: InstanceSpec['files'],
): Promise<void> {
  if (files === undefined || files.length === 0) return
  await engine.putArchive(
    `/containers/${name}/archive?path=${encodeURIComponent(FILES_MOUNT)}`,
    // Paths are absolute and the archive is extracted AT the mount point, so the
    // leading directory is stripped here: `/manifest/idp-signing.crt` becomes
    // `idp-signing.crt` inside `/manifest`.
    tarArchive(
      files.map((file) => ({
        ...file,
        path: file.path.startsWith(`${FILES_MOUNT}/`)
          ? `/${file.path.slice(FILES_MOUNT.length + 1)}`
          : file.path,
      })),
    ),
  )
}

/** Where a container records the hash of the environment it was created with. */
export const ENV_HASH_LABEL = 'manifest.env-sha256'

/**
 * A hash of a container's environment, order-insensitive.
 *
 * A HASH, never the environment: the environment carries `SESSION_SECRET` and, for
 * an app that declares models, a live `LLM_API_KEY`, and a label is readable by
 * anything that can inspect the container. The hash of a 32-byte secret reveals
 * nothing usable.
 */
export function environmentHash(env: readonly string[]): string {
  return createHash('sha256')
    .update(JSON.stringify([...env].sort()))
    .digest('hex')
}

export async function ensureInstanceContainer(
  engine: EngineClient,
  spec: InstanceSpec,
  deps: InstanceDeps,
): Promise<InstanceHandle> {
  const name = appContainer(spec.name)
  const url = `https://${deps.hostname}`
  const env = [
    ...Object.entries(spec.env).map(([k, v]) => `${k}=${v}`),
    ...Object.entries(proxyEnvironment(deps.proxyUrl)).map(([k, v]) => `${k}=${v}`),
  ]
  const envHash = environmentHash(env)
  const existing = await engine.get<{
    Id: string
    State: { Running: boolean }
    Config: { Labels?: Record<string, string> | null }
  }>(`/containers/${name}/json`)
  /**
   * REUSED ONLY WHEN ITS ENVIRONMENT IS THE ONE ASKED FOR (P4b Task 9, finding 72).
   *
   * A container is named for (project, environment, release), and it used to be
   * reused on the name alone, environment included — so a redeploy of the SAME
   * release, such as a retry after a failed health check, left the container with
   * the environment it was first created with. With §10's key minted on every
   * deploy that is not a stale variable, it is a broken app: the deploy commits the
   * new key, which the reused container never received, and revokes the one it
   * holds. The same name with the same hash is the wake path, and is reused; a
   * different hash is replaced. A container created before this label existed has no
   * hash, and is replaced once.
   *
   * The fake driver already replaced the spec on reuse (`existing.spec = spec`), so
   * until this the two drivers disagreed and nothing observed it (finding 73). The
   * contract suite cannot see an environment, so the Docker tier asserts it from
   * inside the container.
   */
  if (existing && existing.Config.Labels?.[ENV_HASH_LABEL] !== envHash) {
    // `v=true` removes only ANONYMOUS volumes. The named files volume survives and
    // `placeFiles` rewrites it below, before the new container starts.
    await engine.del(`/containers/${name}?force=true&v=true`)
  } else if (existing) {
    await placeFiles(engine, name, spec.files)
    if (!existing.State.Running) await engine.post(`/containers/${name}/start`)
    // Waking: the marker goes as soon as we intend it to run again, so a crash
    // one second later is reported as a crash rather than as hibernation.
    await engine.del(`/volumes/${hibernationVolume(name)}?force=true`)
    return { id: name, name, url }
  }

  if (spec.files !== undefined && spec.files.length > 0) {
    await engine.post('/volumes/create', { Name: filesVolume(spec.name) })
  }

  const created = await engine.post<{ Id: string }>(`/containers/create?name=${name}`, {
    // §13: the digest, never the tag. An approval binds to this string.
    Image: `${spec.image.repository}@${spec.image.digest}`,
    Env: env,
    ExposedPorts: { [`${spec.port}/tcp`]: {} },
    ...(deps.command === undefined ? {} : { Cmd: deps.command }),
    // Runs INSIDE the container, so §21's "a host process cannot reach container
    // IPs" does not apply. BusyBox wget is a blueprint contract (D13).
    Healthcheck: {
      Test: [
        'CMD-SHELL',
        // `-Y off` IS LOAD-BEARING. D18 forces egress through the per-app proxy by
        // setting HTTP_PROXY/http_proxy in the container, and BusyBox wget honours
        // `http_proxy` while supporting NO_PROXY NOT AT ALL — so the health check
        // for the app's OWN loopback address was sent to tinyproxy, which denied
        // it. Every instance sat in `health: starting` with a growing failing
        // streak while the app served perfectly through the edge, and §11's state
        // machine recorded the deploy as FAILED.
        //
        // Measured 2026-09-07 inside a running app container, BusyBox v1.37.0:
        //   wget -q -O /dev/null http://127.0.0.1:8080/healthz  -> 403 Filtered, 1
        //   wget -Y off -q -O /dev/null http://127.0.0.1:8080/healthz -> 0
        //
        // Loosening the proxy allowlist was rejected: the app reaching itself is
        // not egress, and the fix belongs in the probe, not in the control.
        `wget -Y off -q -O /dev/null http://127.0.0.1:${spec.port}${spec.healthPath} || exit 1`,
      ],
      Interval: 3_000_000_000,
      Timeout: 2_000_000_000,
      Retries: 20,
      StartPeriod: 2_000_000_000,
    },
    HostConfig: {
      ...hardenedHostConfig({
        resources: spec.resources,
        networkName: deps.networkName,
        dnsServer: deps.dnsServer,
        diskQuotaEnforceable: deps.diskQuotaEnforceable,
      }),
      // READ-WRITE, and not by preference: the daemon refuses to write into a
      // `:ro` mount, so a read-only one could never be populated. See placeFiles.
      ...(spec.files === undefined || spec.files.length === 0
        ? {}
        : { Binds: [`${filesVolume(spec.name)}:${FILES_MOUNT}`] }),
    },
    Labels: {
      'manifest.slug': spec.projectSlug,
      'manifest.environment': spec.environmentKind,
      'manifest.release': spec.releaseId,
      [ENV_HASH_LABEL]: envHash,
    },
  })
  // A CREATE THAT COULD NOT FAIL. Task 1 maps 404 to `undefined` by design, and
  // `/containers/create` answers **404** when the image is not in the daemon's
  // store — measured 2026-09-06, `{"message":"No such image"}`. Without this
  // check the deploy of an unpullable image creates nothing, starts nothing, and
  // RETURNS A HANDLE: `ensureInstance` reports success, `status` says `gone`, and
  // §11's state machine sees a healthy-looking provisioning step. Every contract
  // test that needed a running container was passing or failing for the wrong
  // reason because of this one line.
  if (!created) {
    throw new EngineError(
      'INSTANCE_IMAGE_MISSING',
      `the daemon has no image ${spec.image.repository}@${spec.image.digest}`,
      'A build pushes to the registry without loading into the daemon, so the image ' +
        'must be pulled before an instance is created. See ensureImagePulled.',
    )
  }
  await placeFiles(engine, name, spec.files)
  await engine.del(`/volumes/${hibernationVolume(name)}?force=true`)
  await engine.post(`/containers/${name}/start`)
  return { id: name, name, url }
}

/** §11: hibernate — volumes survive. S1 verified the Mongo row count rose across it. */
export async function stopInstanceContainer(
  engine: EngineClient,
  id: string,
): Promise<void> {
  await engine.post(`/volumes/create`, {
    Name: hibernationVolume(id),
    Labels: { 'manifest.marker': 'hibernated' },
  })
  await engine.post(`/containers/${id}/stop?t=10`)
}

export async function destroyInstanceContainer(
  engine: EngineClient,
  id: string,
): Promise<void> {
  // `v=true` removes anonymous volumes only; named service volumes are D3's and
  // are removed by destroyService, which is the call that carries `deleteData`.
  await engine.del(`/containers/${id}?force=true&v=true`)
  await engine.del(`/volumes/${hibernationVolume(id)}?force=true`)
  // `v=true` removes ANONYMOUS volumes only, so the named files volume needs its
  // own removal — the same omission that leaked 42 volumes as P3's defect 24.
  // It holds a copy of the app's SP private key, so leaving it behind is not
  // merely untidy.
  await engine.del(`/volumes/${id}-files?force=true`)
}

export async function instanceStatus(
  engine: EngineClient,
  id: string,
): Promise<InstanceStatus> {
  const inspect = await engine.get<{
    State: {
      Status: string
      ExitCode: number
      Health?: { Status: string }
      Error?: string
    }
  }>(`/containers/${id}/json`)
  // 404 -> undefined (Task 1). §11 and the contract both require `gone`, never a throw.
  if (!inspect) return { id, state: 'gone', healthy: false }
  const marker = (await engine.get(`/volumes/${hibernationVolume(id)}`)) !== undefined
  const state = dockerStateToInstanceState({
    ...inspect.State,
    hibernationMarker: marker,
  })
  // CONDITIONAL SPREAD, not `cond ? x : undefined`. `message?: string` under
  // `exactOptionalPropertyTypes` rejects an explicit `undefined` — measured,
  // TS2375 — and `pnpm test` is green either way, because Vitest strips types
  // without checking them.
  const error = inspect.State.Error
  return {
    id,
    state,
    healthy: inspect.State.Health?.Status === 'healthy',
    ...(error === undefined || error === '' ? {} : { message: error }),
  }
}
