import { resolve } from 'node:path'
import { demux, type EngineClient } from '../runtime/index.js'
import { INSTANCE_HEADER } from './caddy.js'

export interface ReadinessResult {
  ready: boolean
  attempts: number
  lastStatus?: number
  reason: string
  /**
   * `waitForIdentities` alone, when it gives up: the expected instances the edge never
   * answered as, in the order they were expected — what a set's failed move names (A1 Task 4).
   */
  unseen?: string[]
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

/**
 * What the edge answered, and WHO answered it.
 *
 * `instance` is the edge's own `X-Manifest-Instance`, which only a route sets. It is
 * absent for the wildcard — which answers 200 for any path on any hostname in the
 * zone that holds no route (P4b finding 193) — and absent for a route written before
 * P4c.
 */
export interface IdentityProbeResult {
  status: number
  instance: string | undefined
}

/**
 * Waits until the public hostname answers 200 AS EACH INSTANCE OF THE SET.
 *
 * `waitForReady` asks whether something answered; this asks whether the things that
 * answered are the instances we just started. A status alone cannot tell this instance
 * from the previous one, or either from the edge's wildcard, so a status-only check
 * of a hostname whose route never moved passes while the app is unreachable — which
 * is exactly the failure Decision 7 exists to refuse.
 *
 * **A SET, NOT ONE** (A1 Task 2): the route balances round robin, so one probe sees one
 * member, and the wait collects identities until EVERY expected id has answered. Seeing
 * one is not enough — a member the edge cannot reach would leave the hostname on fewer
 * instances than it was given, and the deploy would call that a success. Once the edge has
 * answered as any member (the move is live), every member must answer within **`4 × N`**
 * more probes — N for the rotation, the rest for whatever else is using the route
 * meanwhile, since every request advances the same rotation — and one still unseen is named
 * then, rather than after the whole timeout.
 *
 * Called by the Docker driver's `ensureInstances`, after the one in-place move.
 */
export async function waitForIdentities(input: {
  url: string
  expected: readonly string[]
  probe: () => Promise<IdentityProbeResult>
  timeoutMs: number
  intervalMs: number
}): Promise<ReadinessResult> {
  if (input.expected.length === 0)
    throw new Error(
      `waitForIdentities at ${input.url} was given no instance to wait for — a move to an empty set is a caller's defect`,
    )
  const expected = new Set(input.expected)
  const window = 4 * expected.size
  const seen = new Set<string>()
  const deadline = Date.now() + input.timeoutMs
  let attempts = 0
  /** The attempt at which the edge first answered as a member of the set. */
  let firstSeenAt: number | undefined
  let lastStatus: number | undefined
  let reason = 'the edge was never asked'
  const unseen = () => [...expected].filter((id) => !seen.has(id))
  const others = new Set<string>()

  for (;;) {
    attempts += 1
    try {
      const answer = await input.probe()
      lastStatus = answer.status
      if (answer.status !== 200) {
        reason = `the edge answered ${answer.status} after ${attempts} attempt(s)`
      } else if (answer.instance === undefined) {
        // A 200 with no identity is the WILDCARD, not the app: the route either does
        // not exist or is not the one we wrote.
        reason =
          `the edge answered 200 with no X-Manifest-Instance after ${attempts} ` +
          'attempt(s) — that is the edge’s wildcard, not a routed app'
      } else if (!expected.has(answer.instance)) {
        others.add(answer.instance)
        reason =
          `the edge answered 200 as ${[...others].join(', ')}, not ${[...expected].join(', ')}, ` +
          `after ${attempts} attempt(s)`
      } else {
        seen.add(answer.instance)
        firstSeenAt ??= attempts
        if (seen.size === expected.size)
          return {
            ready: true,
            attempts,
            lastStatus: answer.status,
            reason: `the edge served 200 as each of ${[...expected].join(', ')}`,
          }
        reason = `the edge served 200 as ${[...seen].join(', ')} and never as ${unseen().join(', ')}`
      }
    } catch (error) {
      lastStatus = undefined
      reason = `the probe could not run: ${(error as Error).message}`
    }
    const windowSpent = firstSeenAt !== undefined && attempts - firstSeenAt >= window
    if (windowSpent || Date.now() >= deadline) {
      // Conditional spread, not `lastStatus: … ?? undefined`: `lastStatus` is
      // optional on ReadinessResult and this repo sets exactOptionalPropertyTypes.
      return {
        ready: false,
        attempts,
        ...(lastStatus === undefined ? {} : { lastStatus }),
        unseen: unseen(),
        reason: windowSpent
          ? `the edge served 200 as ${[...seen].join(', ')} and never as ${unseen().join(', ')} ` +
            `within ${window} answers after the first (${attempts} attempt(s)) — round robin reaches every member within that`
          : `${reason}; never answered as ${unseen().join(', ')}`,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, input.intervalMs))
  }
}

/** The image the probe runs in. Mirrored locally by `make seed`, so this is offline. */
const PROBE_IMAGE = 'curlimages/curl:8.11.1'

/**
 * `hostname`, or `hostname:port` when a probe must name ONE of the edge's servers.
 *
 * §12'S SPLIT IS BY ADDRESS FROM THE HOST AND BY PORT FROM A CONTAINER (P6a
 * Decision 15). `manifest-dns-containers` answers the edge's single address,
 * 10.89.0.10, for the whole zone, so a container cannot pick a server by name the
 * way the host does with 127.0.0.2 and 127.0.0.3 — it picks one by port: `:443` is
 * `srv0`, the internal listener, and `:8443` is `srv1`, the public one.
 *
 * THIS IS A PORT IN A PROBE URL AND NEVER IN A PERSON'S. The faculty-facing URL is
 * `https://<slug>.manifest.internal` with no port, which is why the host publishes
 * `srv1` on `127.0.0.3:443` at all (infra/compose.yaml says so in its own words).
 * Only the probe carries it, and only for production.
 *
 * ONE COPY, shared by both probes, for the reason `curlThroughEdge` is shared: a
 * second place that knows how a port joins a hostname is a second place for it to
 * drift.
 */
function probeAuthority(hostname: string, port: number | undefined): string {
  return port === undefined ? hostname : `${hostname}:${port}`
}

/**
 * Runs one curl FROM A CONTAINER, through the edge, with the platform resolver, and
 * returns exactly what curl's `-w` printed.
 *
 * The control plane is a host process (§21) and S1 measured
 * `host -> 10.89.0.2:8080 = UNREACHABLE` — a host process cannot reach a container
 * IP on Docker Desktop. Probing the container address works on Linux, fails on
 * every Mac, and fails as a TIMEOUT, so it reads as a slow-starting app.
 *
 * THE PLATFORM CA IS NOT OPTIONAL. `curlimages/curl` trusts no private root, and
 * the edge serves a certificate from the CA `make seed` generates — so without the
 * mount every probe is `curl: (60) unable to get local issuer certificate`,
 * `http_code` 000, and every deploy times out reading "the app is slow to start"
 * (measured 2026-09-06). `-k` would hide a TLS misconfiguration §20 cares about, so
 * the CA is mounted instead, exactly as `scripts/verify.sh` does it.
 *
 * ONE COPY, shared by both probes (P4c Task 3). The identity probe differs from the
 * status probe in its `-w` format and nothing else; a second copy of the container
 * body would be a second place for the CA mount, the resolver and the `v=true` to
 * drift, and every one of those three has been a live defect here.
 */
async function curlThroughEdge(
  engine: EngineClient,
  caCertPath: string,
  writeOut: string,
  url: string,
  // `port` is deliberately absent from this signature. It belongs to the URL, which
  // both callers have already built with `probeAuthority`, and the container body
  // below has no use for it — a reader looking for where the port is consumed should
  // find it in the URL and nowhere else.
  options: { network?: string; dnsServer?: string },
): Promise<string> {
  // Absolute: a bind source is resolved by the DAEMON, which does not share this
  // process's working directory. A relative path becomes a new empty DIRECTORY at
  // that name — the same trap defect 27 hit with the registry token certificate.
  const ca = resolve(caCertPath)
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
      writeOut,
      url,
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
    /**
     * JOINED WITH THE NEWLINES `demux` TOOK OUT.
     *
     * `demux` yields one record per LINE, with the terminator stripped — it exists to
     * serve §14's log stream, where a line is the unit. Concatenating `text` here
     * therefore ran the lines together: measured 2026-09-15, a two-line `-w` format
     * came back as `20033333333-3333-…`, so the status read as 20,033,333,333 and the
     * identity as nothing. `edgeProbe` never saw it, because a one-line format has no
     * newline to lose, and no unit test could — both tiers fake the probe.
     */
    const lines: string[] = []
    for await (const line of demux(stream as unknown as AsyncIterable<Buffer>)) {
      if (line.stream === 'stdout') lines.push(line.text)
    }
    return lines.join('\n')
  } finally {
    // `v=true` removes the anonymous volumes with the container. Defect 24 was
    // 42 orphaned volumes from exactly this omission, one per deploy.
    await engine.del(`/containers/${id}?force=true&v=true`)
  }
}

/**
 * Is the app reachable at its public hostname? A status, and nothing more.
 *
 * NOT FOR READINESS, AND NO PRODUCTION CALLER SINCE P4c TASK 4. It is kept, and
 * exported, because it is the CONTROL: `readiness.docker.test.ts` runs it against a
 * hostname the platform holds no route to and it answers **200**, from the edge's
 * wildcard, for any path — which is the whole reason `waitForIdentities` exists and
 * the reason a deploy that checked a status could report success against an app that
 * never started (P4b finding 193, measured again 2026-09-15).
 *
 * Kept rather than deleted, deliberately, against this project's rule that a
 * function with no call site is not built (Decision 22 deleted `reapplyAllRoutes`
 * under it the same day). That rule exists because uncalled code has never run — and
 * this runs on every Docker-tier pass, as the negative control that makes the
 * identity check mean something. Deleting it would mean rebuilding the probe
 * container inside a test to keep the control, which is the duplication
 * `curlThroughEdge` was factored out to prevent.
 *
 * If you are reaching for this to decide whether an app is up: you want
 * `edgeIdentityProbe` with `waitForIdentities`, or `privateProbe` if the route has not
 * moved yet.
 *
 * `port` is here for the same reason the function is (P6a Task 4): it is what lets
 * the control assert that §12's split answers **200 on both listeners**, so that
 * "the production route is on the right server" cannot be confused with "something
 * answered". See `probeAuthority`.
 */
export function edgeProbe(
  engine: EngineClient,
  hostname: string,
  healthPath: string,
  caCertPath: string,
  options: { network?: string; dnsServer?: string; port?: number } = {},
): () => Promise<number> {
  return async () => {
    const out = await curlThroughEdge(
      engine,
      caCertPath,
      '%{http_code}',
      `https://${probeAuthority(hostname, options.port)}${healthPath}`,
      options,
    )
    const code = Number.parseInt(out.trim().slice(-3), 10)
    return Number.isNaN(code) ? 0 : code
  }
}

/**
 * Asks the public hostname WHO answered.
 *
 * `%header{}` needs curl >= 7.84; the mirrored probe image is 8.11.1, and the name
 * is matched case-insensitively. An absent header prints nothing, which is exactly
 * the wildcard's answer and is reported as `instance: undefined` rather than as an
 * empty string — "no route set this" is a fact, not a value.
 *
 * Two LINES rather than one, because a single line would have to be split on a
 * separator that the header's value could contain.
 *
 * `port` IS §12'S PUBLIC LISTENER, AND IT IS ABSENT FOR EVERYTHING ELSE (P6a
 * Decision 15). Every sandbox and staging app is on the internal listener, which is
 * the edge's `:443` and needs no port; only a production app's probe carries one,
 * and the driver spreads it for `environmentKind === 'production'` alone. Without it
 * a production probe arrives at `manifest-caddy:443` — the INTERNAL server — finds no
 * route there, and `waitForIdentities` refuses the wildcard's answer loudly: *"the edge
 * answered 200 with no X-Manifest-Instance … that is the edge's wildcard, not a
 * routed app"*. That loud refusal is what makes the port safe to get wrong.
 *
 * THE CERTIFICATE STILL VERIFIES. A port is not part of a certificate, the edge
 * serves one wildcard per zone from the platform CA, and `--cacert` is unchanged —
 * so this probe never needs `-k`, which would pass against the wrong certificate
 * (the thing P3 Task 14 paid for).
 */
export function edgeIdentityProbe(
  engine: EngineClient,
  hostname: string,
  healthPath: string,
  caCertPath: string,
  options: { network?: string; dnsServer?: string; port?: number } = {},
): () => Promise<IdentityProbeResult> {
  return async () => {
    const out = await curlThroughEdge(
      engine,
      caCertPath,
      `%{http_code}\n%header{${INSTANCE_HEADER.toLowerCase()}}\n`,
      `https://${probeAuthority(hostname, options.port)}${healthPath}`,
      options,
    )
    const [statusLine, identityLine] = out.split('\n')
    const code = Number.parseInt((statusLine ?? '').trim(), 10)
    const instance = (identityLine ?? '').trim()
    return {
      status: Number.isNaN(code) ? 0 : code,
      instance: instance === '' ? undefined : instance,
    }
  }
}
