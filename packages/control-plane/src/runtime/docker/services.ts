import type { ServiceBinding, ServiceHandle } from '../driver.js'
import { deriveCredentials, resolveServiceImage } from '../../services/index.js'
import { EngineError, type EngineClient } from './engine.js'
import {
  appNetwork,
  serviceContainer,
  serviceVolume,
  type EnvironmentKind,
} from './names.js'

/** D3: dedicated per app+environment. The container IS the isolation boundary. */
export async function ensureServiceContainer(
  engine: EngineClient,
  binding: ServiceBinding,
  kind: EnvironmentKind,
  masterSecret: string,
): Promise<ServiceHandle> {
  const image = resolveServiceImage(binding.type, binding.version)
  const creds = deriveCredentials(masterSecret, binding)
  // `binding.name` is P2's serviceName(project, environment, declared); the Docker
  // name is that with our prefix. One derivation, not two.
  const name = serviceContainer(binding.name)
  const volume = serviceVolume(binding.name)
  // The scheme comes from the CATALOGUE, not from binding.type: the type is
  // `mongo` and the scheme is `mongodb`, and `mongo://…` is not a valid URI.
  // The query carries authSource=admin, without which the root user — which
  // lives in `admin` — cannot authenticate against the app's own database.
  const query = image.uriQuery === '' ? '' : `?${image.uriQuery}`
  const endpoint = `${image.uriScheme}://${creds.username}:${creds.password}@${name}:${image.port}/${creds.database}${query}`

  const existing = await engine.get<{ Id: string; State: { Running: boolean } }>(
    `/containers/${name}/json`,
  )
  if (existing) {
    if (!existing.State.Running) await engine.post(`/containers/${name}/start`)
    return { id: name, name, endpoint }
  }

  await engine.post('/volumes/create', {
    Name: volume,
    Labels: { 'manifest.slug': binding.projectSlug },
  })
  await engine.post(`/containers/create?name=${name}`, {
    Image: `${image.image}@${image.digest}`,
    Env: [
      `MONGODB_INITDB_ROOT_USERNAME=${creds.username}`,
      `MONGODB_INITDB_ROOT_PASSWORD=${creds.password}`,
    ],
    HostConfig: {
      // On the app's INTERNAL network only. A service is never reachable from
      // another app, and never publishes a port.
      NetworkMode: appNetwork(binding.projectSlug, kind),
      Binds: [`${volume}:/data/db`],
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Privileged: false,
      PidsLimit: 256,
      Memory: 512 * 1024 * 1024,
      RestartPolicy: { Name: 'unless-stopped' },
    },
    Healthcheck: {
      Test: image.healthTest,
      Interval: 1_000_000_000,
      Timeout: 5_000_000_000,
      Retries: 30,
      StartPeriod: 1_000_000_000,
    },
    Labels: { 'manifest.slug': binding.projectSlug, 'manifest.environment': kind },
  })
  await engine.post(`/containers/${name}/start`)
  await waitForServiceHealthy(engine, name)
  return { id: name, name, endpoint }
}

/**
 * A handle whose endpoint is not yet connectable is not a handle. Measured: Mongo
 * refuses connections for roughly the first five seconds — at t=0 the probe gets
 * `ECONNREFUSED`, at t=5 it succeeds — so returning as soon as the container is
 * *started* hands the caller an endpoint that fails, and Task 7's app container
 * connects at boot.
 *
 * This asks the DAEMON for the healthcheck result rather than connecting: the
 * control plane is a host process and cannot reach container IPs (§21).
 */
async function waitForServiceHealthy(
  engine: EngineClient,
  name: string,
  timeoutMs = 90_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const inspect = await engine.get<{
      State: { Running: boolean; Health?: { Status: string } }
    }>(`/containers/${name}/json`)
    const status = inspect?.State.Health?.Status
    if (status === 'healthy') return
    if (Date.now() > deadline) {
      throw new EngineError(
        'SERVICE_NOT_HEALTHY',
        `service ${name} did not become healthy within ${timeoutMs} ms (last status: ${status ?? 'none'})`,
        'Check `docker logs ' +
          name +
          '`. A service that never reports healthy ' +
          'usually failed to initialise its data directory.',
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

/**
 * §11 makes `deleteData` meaningful in BOTH directions, and S1 verified both:
 * false keeps the volume, true removes it. Getting this backwards destroys a
 * production database on a redeploy, so the Docker-tier test asserts each way.
 */
export async function destroyServiceContainer(
  engine: EngineClient,
  name: string,
  opts: { deleteData: boolean },
): Promise<void> {
  await engine.del(`/containers/${name}?force=true`)
  if (opts.deleteData) await engine.del(`/volumes/${name}-data?force=true`)
}
