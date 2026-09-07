import type {
  InstanceHandle,
  InstanceSpec,
  InstanceState,
  InstanceStatus,
} from '../driver.js'
import { EngineError, type EngineClient } from './engine.js'
import { hardenedHostConfig } from './hardening.js'
import { appContainer } from './names.js'
import { proxyEnvironment } from './egress.js'

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

export async function ensureInstanceContainer(
  engine: EngineClient,
  spec: InstanceSpec,
  deps: InstanceDeps,
): Promise<InstanceHandle> {
  const name = appContainer(spec.name)
  const url = `https://${deps.hostname}`
  const existing = await engine.get<{ Id: string; State: { Running: boolean } }>(
    `/containers/${name}/json`,
  )
  if (existing) {
    if (!existing.State.Running) await engine.post(`/containers/${name}/start`)
    // Waking: the marker goes as soon as we intend it to run again, so a crash
    // one second later is reported as a crash rather than as hibernation.
    await engine.del(`/volumes/${hibernationVolume(name)}?force=true`)
    return { id: name, name, url }
  }

  const created = await engine.post<{ Id: string }>(`/containers/create?name=${name}`, {
    // §13: the digest, never the tag. An approval binds to this string.
    Image: `${spec.image.repository}@${spec.image.digest}`,
    Env: [
      ...Object.entries(spec.env).map(([k, v]) => `${k}=${v}`),
      ...Object.entries(proxyEnvironment(deps.proxyUrl)).map(([k, v]) => `${k}=${v}`),
    ],
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
    HostConfig: hardenedHostConfig({
      resources: spec.resources,
      networkName: deps.networkName,
      dnsServer: deps.dnsServer,
      diskQuotaEnforceable: deps.diskQuotaEnforceable,
    }),
    Labels: {
      'manifest.slug': spec.projectSlug,
      'manifest.environment': spec.environmentKind,
      'manifest.release': spec.releaseId,
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
