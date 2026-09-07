import { resolve } from 'node:path'
import { demux, type EngineClient } from '../runtime/index.js'

export interface ReadinessResult {
  ready: boolean
  attempts: number
  lastStatus?: number
  reason: string
}

export async function waitForReady(input: {
  url: string
  probe: () => Promise<number>
  timeoutMs: number
  intervalMs: number
}): Promise<ReadinessResult> {
  const deadline = Date.now() + input.timeoutMs
  let attempts = 0
  let lastStatus: number | undefined
  let lastError: string | undefined

  for (;;) {
    attempts += 1
    try {
      lastStatus = await input.probe()
      lastError = undefined
      // 200 only. A 302 to a login page is an app that is running and wrong, and
      // accepting it here defers the discovery to a faculty member.
      if (lastStatus === 200) {
        return { ready: true, attempts, lastStatus, reason: 'the edge served 200' }
      }
    } catch (error) {
      lastStatus = undefined
      lastError = (error as Error).message
    }
    if (Date.now() >= deadline) {
      // Conditional spread, not `lastStatus: … ?? undefined`: `lastStatus` is
      // optional on ReadinessResult and this repo sets exactOptionalPropertyTypes.
      return {
        ready: false,
        attempts,
        ...(lastStatus === undefined ? {} : { lastStatus }),
        reason:
          lastError !== undefined
            ? `the probe could not run: ${lastError}`
            : `the edge last answered ${lastStatus} after ${attempts} attempt(s)`,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, input.intervalMs))
  }
}

/** The image the probe runs in. Mirrored locally by `make seed`, so this is offline. */
const PROBE_IMAGE = 'curlimages/curl:8.11.1'

/**
 * Runs the probe FROM A CONTAINER, through the edge, with the platform resolver.
 *
 * The control plane is a host process (§21) and S1 measured
 * `host -> 10.89.0.2:8080 = UNREACHABLE` — a host process cannot reach a container
 * IP on Docker Desktop. Probing the container address works on Linux, fails on
 * every Mac, and fails as a TIMEOUT, so it reads as a slow-starting app.
 *
 * This also asks a different question from `status().healthy`, which reads Docker's
 * in-container HEALTHCHECK: this one additionally proves DNS, the Caddy route and
 * the listener, which is what "reachable" means to the person who asked for the app.
 *
 * THE PLATFORM CA IS NOT OPTIONAL. `curlimages/curl` trusts no private root, and
 * the edge serves a certificate from the CA `make seed` generates — so without the
 * mount every probe is `curl: (60) unable to get local issuer certificate`,
 * `http_code` 000, and every deploy times out reading "the app is slow to start"
 * (measured 2026-09-06). `-k` would hide a TLS misconfiguration §20 cares about, so
 * the CA is mounted instead, exactly as `scripts/verify.sh` does it.
 */
export function edgeProbe(
  engine: EngineClient,
  hostname: string,
  healthPath: string,
  caCertPath: string,
  options: { network?: string; dnsServer?: string } = {},
): () => Promise<number> {
  // Absolute: a bind source is resolved by the DAEMON, which does not share this
  // process's working directory. A relative path becomes a new empty DIRECTORY at
  // that name — the same trap defect 27 hit with the registry token certificate.
  const ca = resolve(caCertPath)
  return async () => {
    const created = await engine.post<{ Id: string }>('/containers/create', {
      Image: PROBE_IMAGE,
      Cmd: [
        '--cacert',
        '/ca.crt',
        '-sS',
        '-m',
        '5',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        `https://${hostname}${healthPath}`,
      ],
      HostConfig: {
        NetworkMode: options.network ?? 'manifest-platform',
        Dns: [options.dnsServer ?? '10.89.0.53'],
        Binds: [`${ca}:/ca.crt:ro`],
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        Privileged: false,
        RestartPolicy: { Name: 'no' },
      },
    })
    if (!created) {
      throw new Error(
        `no such image: ${PROBE_IMAGE} — \`make seed\` mirrors it for exactly this`,
      )
    }
    const id = created.Id
    try {
      await engine.post(`/containers/${id}/start`)
      await engine.post(`/containers/${id}/wait`)
      // demux, NOT a raw read: the Engine API frames its log stream as
      // `[type:u8][000][size:u32be][payload]`, and stripping non-digits out of the
      // raw bytes is a coincidence that holds only while no frame header happens
      // to carry an ASCII digit.
      const stream = await engine.stream(`/containers/${id}/logs?stdout=true`)
      let out = ''
      for await (const line of demux(stream as unknown as AsyncIterable<Buffer>)) {
        if (line.stream === 'stdout') out += line.text
      }
      const code = Number.parseInt(out.trim().slice(-3), 10)
      return Number.isNaN(code) ? 0 : code
    } finally {
      // `v=true` removes the anonymous volumes with the container. Defect 24 was
      // 42 orphaned volumes from exactly this omission, one per deploy.
      await engine.del(`/containers/${id}?force=true&v=true`)
    }
  }
}
