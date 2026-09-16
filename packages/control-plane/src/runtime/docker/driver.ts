import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BuildGateError,
  assembleContext,
  loadBlueprintDescriptor,
  runMandatoryGates,
  scanImage,
  sourceDateEpoch,
} from '../../build/index.js'
import {
  applyRoute,
  edgeIdentityProbe,
  removeRoute,
  restoreRouteTo,
  servingRoute,
  waitForIdentity,
  waitForReady,
  type RoutingDeps,
} from '../../routing/index.js'
import type {
  BuildOpts,
  Driver,
  DriverCapabilities,
  ExecOpts,
  ExecStream,
  ImageRef,
  InstanceHandle,
  InstanceSpec,
  LogLine,
  LogOpts,
  ServiceBinding,
  ServiceHandle,
  SnapshotRef,
  SourceRef,
} from '../driver.js'
import { InstanceNotReadyError } from '../driver.js'
import {
  DEFAULT_BUILD_LIMITS,
  type BuildLimits,
  runBuildxBuild,
  withEphemeralBuilder,
} from './builder.js'
import { createBuildQueue } from './concurrency.js'
import { createKeyedMutex } from './keyed-mutex.js'
import { privateProbe } from './probes.js'
import { ensureEgressProxy } from './egress.js'
import { EngineError, registryAuthHeader, type EngineClient } from './engine.js'
import { containerExec } from './exec.js'
import { detectHostCapabilities } from './hardening.js'
import {
  destroyInstanceContainer,
  ensureInstanceContainer,
  instanceStatus,
  stopInstanceContainer,
} from './instances.js'
import { containerLogs } from './logs.js'
import { appNetwork, instanceAlias } from './names.js'
import { AI_GATEWAY_NEIGHBOUR, EDGE_NEIGHBOUR, ensureAppNetwork } from './networks.js'
import { mintRegistryToken } from './registry-auth.js'
import { destroyServiceContainer, ensureServiceContainer } from './services.js'

export function dockerCapabilities(host: {
  userns: boolean
  diskQuota: boolean
}): DriverCapabilities {
  return {
    // §12's internal network plus the forced per-app proxy. Task 4 and Task 5 each
    // carry a negative control showing the denial is real.
    enforcesEgress: true,
    // §21, divergence 6: the weakest level. S6 (Task 18) is what decides whether it
    // is acceptable for sandboxes, and saying `container` is what makes that a
    // decision rather than a discovery.
    isolationLevel: 'container',
    remoteTarget: false,
    supportsExec: true,
    // §12's nightly production snapshots are a Phase 2 job; the operation is not
    // implemented, and claiming it would be worse than not having it.
    supportsSnapshot: false,
    enforcesUserNamespaceRemapping: host.userns,
    enforcesDiskQuota: host.diskQuota,
  }
}

export interface DockerDriverOptions {
  engine: EngineClient
  masterSecret: string
  /**
   * Where a blueprint REFERENCE resolves to its directory — `fixture-node@1` ->
   * `<root>/blueprints/fixture-node`. A function, not a path, for two reasons that
   * were both live defects:
   *
   *  * `buildImage` takes `spec.blueprintRef` and used to IGNORE it, building
   *    every project from one fixed directory. With one blueprint in the registry
   *    that is invisible; the moment P4 adds `node-ts-mongo@1` it silently builds
   *    every project with the wrong Dockerfile, base image and health path.
   *  * The boot entry point passed `config.blueprintsRoot` — the directory
   *    HOLDING the blueprints — so every build through the running control plane
   *    died with `no blueprint.yaml in .../blueprints`. Measured by `make demo` on
   *    2026-09-07; the Docker tier could not see it because its own driver is
   *    constructed with a single blueprint's directory.
   *
   * P2's registry already exposes exactly this as `pathOf(ref)`, described there
   * as "the builder needs it for the Dockerfile". Injecting it keeps §5 intact:
   * `runtime/` does not learn to read `blueprints/`.
   */
  blueprintDirFor: (blueprintRef: string) => string
  /** dnsmasq-A's platform-network address. §12 makes the resolver per-container. */
  dnsServer: string
  /** What the BUILDER calls the registry. */
  registryHost: string
  /** What the DAEMON calls the registry. Different name, same content, by digest. */
  registryPublicHost: string
  /**
   * §13's token issuer, in PEM. The daemon has to pull two images the control
   * plane pushed — the built one, to export it for scanning, and the blueprint's
   * base image, to attribute findings — and it CANNOT reach the token realm to
   * negotiate its own: from inside the Docker Desktop VM `127.0.0.1:7100` is the
   * VM's own loopback, and the pull fails `failed to fetch oauth token …
   * connection refused` (measured). So the control plane mints the token itself
   * and hands it over as `X-Registry-Auth`.
   */
  registryTokenKeyPem: string
  registryTokenCertPem: string
  routing: RoutingDeps
  limits?: BuildLimits
  /**
   * The platform CA, for the readiness probe. `curlimages/curl` trusts no private
   * root and the edge serves a certificate from this one, so without it every
   * probe is `curl: (60)` and `http_code` 000 — measured 2026-09-06.
   */
  caCertPath: string
  /** How long `ensureInstance` waits for the app to answer at its hostname. */
  readinessTimeoutMs?: number
}

/**
 * A deploy's patience with an app that is starting. Covers a cold Node runtime
 * and a database connection as well as DNS, the route and the listener.
 */
const DEFAULT_READINESS_TIMEOUT_MS = 90_000

/**
 * How long the edge gets to start answering as the new instance after the route has
 * moved in place.
 *
 * SHORT, and separate from readiness, because at this point the instance is already
 * answering on its own network: the only things left are Caddy's own handling of one
 * `PATCH /id/<route>` and the probe's round trip. Task 1 measured a move taking
 * effect between two requests 25 ms apart, 20 times out of 20. A long bound here
 * would turn a route that will never be right into a deploy that hangs.
 */
const IDENTITY_TIMEOUT_MS = 15_000

/** Matches `registry:2`'s configured issuer and service (infra/compose.yaml). */
const TOKEN_ISSUER = 'manifest-control-plane'
const TOKEN_SERVICE = 'manifest-registry'

export async function createDockerDriver(options: DockerDriverOptions): Promise<Driver> {
  const { engine } = options
  const limits = options.limits ?? DEFAULT_BUILD_LIMITS
  const queue = createBuildQueue(limits)
  /**
   * ONE CALLER AT A TIME PER APP NETWORK (Decision 13).
   *
   * `ensureAppNetwork` attaches §10's gateway and then the container is created with
   * its alias on that network; Task 5's retire decides whether the gateway is still
   * needed and detaches it. Interleave those and an AI app comes up with no route to
   * its models — P4b measured that as a student waiting 611 s (finding 181).
   */
  const perNetwork = createKeyedMutex()
  // Read once at construction: it is a property of the daemon, not of a call, and
  // re-reading it per container would make `capabilities()` async.
  const host = await detectHostCapabilities(engine)

  /**
   * A pull token for the DAEMON. Defect 34's lesson applies: a `registrytoken` is
   * presented verbatim for every scope with no per-scope negotiation, so one token
   * has to carry every repository the pull will touch.
   */
  const pullToken = (repositories: string[]): string =>
    mintRegistryToken(options.registryTokenKeyPem, options.registryTokenCertPem, {
      issuer: TOKEN_ISSUER,
      service: TOKEN_SERVICE,
      subject: 'manifest-control-plane',
      access: repositories.map((name) => ({
        type: 'repository',
        name,
        actions: ['pull'],
      })),
      ttlSeconds: 900,
    })

  /** `manifest-registry:5000/base/node@sha…` -> `127.0.0.1:7107/base/node@sha…`. */
  const asDaemonRef = (ref: string): string =>
    ref.startsWith(`${options.registryHost}/`)
      ? `${options.registryPublicHost}/${ref.slice(options.registryHost.length + 1)}`
      : ref

  /** The repository half of a daemon-facing reference, for a token's scope. */
  const repositoryOf = (daemonRef: string): string =>
    daemonRef.slice(options.registryPublicHost.length + 1).replace(/[@:][^/]*$/, '')

  return {
    name: 'docker',

    async buildImage(src: SourceRef, spec, opts: BuildOpts = {}): Promise<ImageRef> {
      const repository = `local/${spec.projectSlug}`
      return queue.run(spec.projectSlug, async () => {
        const workDir = await mkdtemp(join(tmpdir(), 'mf-build-'))
        try {
          const blueprintDir = options.blueprintDirFor(spec.blueprintRef)
          const contextDir = await assembleContext({
            repoPath: src.repoPath,
            commitSha: src.commitSha,
            blueprintDir,
            workDir,
          })
          // §12: platform-mandatory, before anything is built. A gate that runs
          // after the build has already let the malicious postinstall run.
          const findings = await runMandatoryGates(contextDir, {
            lockfile: 'package-lock.json',
          })
          if (findings.length > 0) {
            throw new BuildGateError(
              findings,
              'These gates are platform-mandatory and cannot be waived (§12). Remove the ' +
                'secret, or commit the lockfile, and push again.',
            )
          }

          const buildId = `${spec.projectSlug}-${src.commitSha.slice(0, 8)}-${Date.now().toString(36)}`
          const descriptor = await loadBlueprintDescriptor(blueprintDir)
          const baseImageRef = asDaemonRef(descriptor.runtime.base_image)
          const baseRepository = repositoryOf(baseImageRef)
          const epoch = await sourceDateEpoch(src.repoPath, src.commitSha)

          /**
           * A MINTED REGISTRY JWT, not the HMAC build credential.
           *
           * `runBuildxBuild` writes the value into the docker config as
           * `registrytoken`, and a `registrytoken` is presented to the registry
           * VERBATIM with no realm exchange (defect 34) — so an HMAC credential
           * arrives at registry:2 as a malformed bearer token and every push is
           * 401. The realm route Task 9 built stays: it serves a builder that
           * cannot hold the issuer key. This driver can, it runs in the same
           * process that owns it, and minting here removes an HTTP round-trip
           * from the control plane to itself during its own boot-time work.
           *
           * The scope carries the base repository too, for the same reason
           * defect 34 records: one token, every scope the build touches, or
           * `FROM …/base/node` fails `pull access denied … insufficient_scope`.
           */
          const buildToken = mintRegistryToken(
            options.registryTokenKeyPem,
            options.registryTokenCertPem,
            {
              issuer: TOKEN_ISSUER,
              service: TOKEN_SERVICE,
              subject: buildId,
              access: [
                { type: 'repository', name: repository, actions: ['push', 'pull'] },
                { type: 'repository', name: baseRepository, actions: ['pull'] },
              ],
              ttlSeconds: Math.ceil(limits.timeoutMs / 1000) + 120,
            },
          )
          const { digest } = await withEphemeralBuilder(
            engine,
            buildId,
            limits,
            (builder) =>
              runBuildxBuild({
                builder,
                contextDir,
                imageRef: `${options.registryHost}/${repository}:${src.commitSha.slice(0, 12)}`,
                registryToken: buildToken,
                registryHost: options.registryHost,
                timeoutMs: limits.timeoutMs,
                sourceDateEpoch: epoch,
                // §14's stream. `runBuildxBuild` removes `buildToken` from every
                // line before this sees it: the token is minted above and exists
                // nowhere outside this driver, so nothing downstream could.
                ...(opts.onLog === undefined ? {} : { onLog: opts.onLog }),
              }),
            // The FIFTH argument. The buildkitd TOML and buildx must name the
            // registry identically; if they diverge the failure is an HTTPS
            // handshake against a plain-HTTP registry, which reads as a
            // certificate problem (defect 36).
            options.registryHost,
          )

          // §12: an SBOM per build, retained with the Release; the staleness
          // travels with it. A blocked scan throws; a stale one does not (Task 12).
          //
          // The reference is the DAEMON's, never the builder's — the daemon cannot
          // resolve `manifest-registry:5000`. And `baseImageRef` is not optional in
          // practice: without it the scan attributes every base-image finding to
          // the app and blocks every build on findings no app can fix (defect 45).
          const daemonRef = `${options.registryPublicHost}/${repository}@${digest}`
          const scan = await scanImage(engine, daemonRef, {
            registryToken: pullToken([repository, baseRepository]),
            baseImageRef,
          })
          if (scan.blocked) {
            throw new EngineError(
              'BUILD_SCAN_BLOCKED',
              scan.reason,
              'Update the dependency and rebuild.',
            )
          }
          /**
           * NOT BLOCKING IS NOT THE SAME AS NOT REPORTING. Since 2026-09-08 a
           * Critical or High with no published fix does not block (scan.ts part 4),
           * and this build path DISCARDS the scan result otherwise — so without
           * this line a critical advisory in an app's dependency tree would pass in
           * complete silence, which is a worse outcome than the gate we replaced.
           *
           * `console.error`, not a logger: `request.log.error` writes nothing under
           * `Fastify({ logger: false })` and this runs outside a request anyway.
           * Persisting these on the Release row is owed and is `releases/`'s to do.
           */
          if (scan.unfixableFindings.length > 0) {
            console.error(`[build] ${repository}@${digest}: ${scan.reason}`)
          }
          return { repository: `${options.registryPublicHost}/${repository}`, digest }
        } finally {
          // Defect 35's class: one temp tree per build, never removed.
          await rm(workDir, { recursive: true, force: true })
        }
      })
    },

    async ensureService(binding: ServiceBinding): Promise<ServiceHandle> {
      const kind = kindFromServiceName(binding.name)
      // NO extra neighbours, deliberately: a database has no business reaching the
      // model gateway, and the app's own `ensureInstance` attaches it a moment later
      // when the release declares models (P4b Task 8).
      await ensureAppNetwork(engine, binding.projectSlug, kind)
      return ensureServiceContainer(engine, binding, kind)
    },

    /**
     * §11's Redeploys, in one call: BESIDE, PRIVATELY READY, MOVED ONCE, VERIFIED.
     *
     * The guarantee lives HERE rather than in `deployRelease`, so Phase 5's UBC
     * driver inherits it rather than having to re-derive it — which is R6, and is
     * why the contract suite has a continuity block every driver must pass.
     *
     * What this replaces: `applyRoute` used to run BEFORE the readiness wait, so
     * the hostname pointed at a container that had not started yet and the edge
     * answered an empty 502 until it did. Measured 2026-09-15 over three runs of
     * `make demo-redeploy`: a window of empty 502s 1.0-1.9 s long, starting
     * 0.2-0.4 s into every redeploy, on an app that boots in about a second.
     */
    async ensureInstance(spec: InstanceSpec): Promise<InstanceHandle> {
      const network = appNetwork(spec.projectSlug, spec.environmentKind)
      // What the EDGE dials. Never the container name: with the instance in the name
      // (§11) a long slug gives 72 characters, and a 72-character name does not
      // resolve — measured 2026-09-15 (Decision 2).
      const upstream = `${instanceAlias(spec.instanceId)}:${spec.port}`

      // The network, the proxy, the image and the container, with nothing else
      // touching this network meanwhile (Decision 13).
      const handle = await perNetwork(network, async () => {
        // §10's gateway joins the network only for an app that declares models (P4b
        // Task 8, Decision 5). S6 probe 13 asserts both halves from inside the network.
        await ensureAppNetwork(
          engine,
          spec.projectSlug,
          spec.environmentKind,
          spec.needsAiGateway ? [AI_GATEWAY_NEIGHBOUR] : [],
        )
        const proxy = await ensureEgressProxy(engine, {
          slug: spec.projectSlug,
          kind: spec.environmentKind,
          allow: spec.egressAllow,
        })
        // The daemon does not have the image just because the builder pushed it:
        // buildx `--push` writes to the registry and never loads into the daemon's
        // store. Deploying a release built in an earlier process — a promotion, a
        // redeploy, anything after `make reset` — would otherwise fail
        // `no such image` at create time.
        await ensureImagePulled(engine, spec.image, pullToken, options.registryPublicHost)
        return ensureInstanceContainer(engine, spec, {
          networkName: network,
          dnsServer: options.dnsServer,
          proxyUrl: proxy.url,
          diskQuotaEnforceable: host.diskQuota,
        })
      })

      /**
       * 1. READY, WITHOUT TOUCHING THE ROUTE.
       *
       * Whatever serves this hostname keeps serving it while the new instance
       * starts. The probe runs INSIDE THE EDGE against the instance's own network
       * alias, which is both the position Caddy will dial from and the only way to
       * ask the question without the public hostname — a status-only probe of a
       * hostname gets 200 from the edge's wildcard whether an app is there or not
       * (P4b finding 193).
       */
      const readiness = await waitForReady({
        url: `http://${upstream}${spec.healthPath}`,
        probe: privateProbe(engine, EDGE_NEIGHBOUR, upstream, spec.healthPath),
        timeoutMs: options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS,
        intervalMs: 1000,
      })
      if (!readiness.ready) {
        // THE INSTANCE STAYS. §14's Incident is read through this handle — the exit
        // code and the last 200 log lines — and §11 has the CALLER remove it once
        // that is captured (Decision 10). A driver that removed it first would hand
        // the Incident nothing, which is the commonest real failure: an app that
        // crashes as it starts.
        throw new InstanceNotReadyError(
          handle,
          `readiness: GET ${spec.healthPath} on ${upstream} from the edge — ` +
            `${readiness.reason} (${readiness.attempts} attempts)`,
          `${handle.name} started and never answered 200 at ${spec.healthPath} — ` +
            `${readiness.reason} (${readiness.attempts} attempts)`,
          `The route did not move, so whatever served ${spec.hostname} still does. ` +
            `\`docker logs ${handle.name}\` is the next thing to read.`,
        )
      }

      /**
       * 2. ONE IN-PLACE MOVE.
       *
       * `applyRoute` PATCHes the route by `@id` where one exists. Delete-then-insert
       * leaves a window with no route, which the edge's wildcard answers 200 —
       * measured 2026-09-15: 4 wildcard answers in 320 requests across 20 such
       * moves, 0 in 330 across 20 PATCHes.
       */
      const previous = await servingRoute(options.routing, spec.hostname)
      await applyRoute(options.routing, {
        hostname: spec.hostname,
        upstream,
        kind: spec.environmentKind,
        instanceId: spec.instanceId,
      })

      /**
       * 3. AND THE EDGE MUST SAY SO ITSELF.
       *
       * Not a status — the wildcard answers 200 for a hostname with no route at all,
       * for any path — but THIS instance's own identity, off the header the route
       * sets and nothing else sets (Decision 7).
       */
      const verified = await waitForIdentity({
        url: handle.url,
        expected: spec.instanceId,
        probe: edgeIdentityProbe(
          engine,
          spec.hostname,
          spec.healthPath,
          options.caCertPath,
          {
            dnsServer: options.dnsServer,
          },
        ),
        timeoutMs: IDENTITY_TIMEOUT_MS,
        intervalMs: 500,
      })
      if (!verified.ready) {
        // PUT IT BACK. The previous instance is still running and still healthy;
        // leaving the hostname on a move we could not confirm is the outage this
        // refuses. `restoreRouteTo(undefined, …)` removes the route, which is what
        // "what served before" means when nothing did.
        await restoreRouteTo(
          options.routing,
          previous,
          spec.hostname,
          spec.environmentKind,
        )
        throw new InstanceNotReadyError(
          handle,
          `identity: GET ${spec.healthPath} at ${handle.url} through the edge did not ` +
            `answer as ${spec.instanceId} — ${verified.reason}`,
          `${handle.name} is ready, and ${spec.hostname} did not reach it`,
          'The route was put back to what served before. The edge, its route and DNS ' +
            'are what to look at; the container itself answered on its own network.',
        )
      }
      return handle
    },

    /**
     * Tasks 4 and 5 implement these four. Refusing loudly — naming the task that
     * supplies it — beats a plausible-looking answer: `servingInstance` returning
     * `undefined` would read as "nothing serves", which is exactly the state
     * Decision 12 refuses to act on, and a retirer acting on it would remove the
     * live app.
     *
     * The contract suite skips its continuity block for this driver meanwhile, with
     * the reason in the block's name, because `runtime/docker/testing.ts` supplies no
     * `continuity` fixtures until Task 5.
     */
    retireInstance: () => {
      throw new EngineError(
        'DRIVER_UNSUPPORTED',
        'retireInstance is P4c Task 5',
        'The Docker driver gains it in Task 5; until then the contract suite skips the continuity block for this driver.',
      )
    },

    servingInstance: () => {
      throw new EngineError(
        'DRIVER_UNSUPPORTED',
        'servingInstance is P4c Task 5',
        'The Docker driver gains it in Task 5; until then the contract suite skips the continuity block for this driver.',
      )
    },

    listInstances: () => {
      throw new EngineError(
        'DRIVER_UNSUPPORTED',
        'listInstances is P4c Task 5',
        'The Docker driver gains it in Task 5; until then the contract suite skips the continuity block for this driver.',
      )
    },

    restoreRoute: () => {
      throw new EngineError(
        'DRIVER_UNSUPPORTED',
        'restoreRoute is P4c Task 5',
        'The Docker driver gains it in Task 5; until then the contract suite skips the continuity block for this driver.',
      )
    },

    stopInstance: (id) => stopInstanceContainer(engine, id),

    async destroyInstance(id: string): Promise<void> {
      // THE ROUTE GOES WITH THE CONTAINER. `ensureInstance` applies it, so
      // `destroyInstance` has to remove it — otherwise the edge keeps a route
      // pointing at a container that no longer exists (a permanent 502 on the
      // app's own hostname), and the next instance to take that hostname inherits
      // a stale upstream instead of getting a fresh one.
      //
      // The slug and kind come from the container's OWN labels rather than from
      // parsing its name: `instanceName` joins them with `-` and a slug may
      // contain `-`, so the name is not decomposable. Labels are written at
      // create time by `ensureInstanceContainer`.
      const inspect = await engine.get<{ Config: { Labels: Record<string, string> } }>(
        `/containers/${id}/json`,
      )
      const labels = inspect?.Config.Labels
      const kind = labels?.['manifest.environment'] as InstanceSpec['environmentKind']
      // THE HOSTNAME OFF THE CONTAINER'S OWN LABEL (P4c Task 2), not re-derived from the
      // slug: the driver no longer knows how a hostname is built, and a container from
      // before this label carries none — for which there is nothing to remove.
      const hostname = labels?.['manifest.hostname']
      if (hostname !== undefined && kind !== undefined) {
        await removeRoute(options.routing, hostname, kind).catch(() => undefined)
      }
      await destroyInstanceContainer(engine, id)
    },

    destroyService: (id, opts) => destroyServiceContainer(engine, id, opts),
    status: (id) => instanceStatus(engine, id),
    logs: (id, opts: LogOpts): AsyncIterable<LogLine> => containerLogs(engine, id, opts),
    exec: (id, cmd, opts: ExecOpts): ExecStream => containerExec(engine, id, cmd, opts),

    async snapshotService(_id: string): Promise<SnapshotRef> {
      // §12's nightly production snapshots are a Phase 2 job. `capabilities()`
      // reports `supportsSnapshot: false`, and this throws rather than returning a
      // plausible-looking ref that nothing can restore.
      throw new EngineError(
        'DRIVER_UNSUPPORTED',
        'snapshotService is not implemented by the Docker driver',
        'capabilities().supportsSnapshot is false. Production backups land in Phase 2 (§12).',
      )
    },

    capabilities: () => dockerCapabilities(host),
  }
}

/**
 * Puts the image in the daemon's store if it is not already there. Exported for
 * the test that proves it: `docker rmi` the image, deploy, and without this the
 * create call answers `no such image` for a release that built perfectly.
 */
export async function ensureImagePulled(
  engine: EngineClient,
  image: ImageRef,
  mint: (repositories: string[]) => string,
  registryPublicHost: string,
): Promise<void> {
  const ref = `${image.repository}@${image.digest}`
  if (await engine.get(`/images/${ref}/json`)) return
  const repository = image.repository.startsWith(`${registryPublicHost}/`)
    ? image.repository.slice(registryPublicHost.length + 1)
    : image.repository
  const query = new URLSearchParams({ fromImage: image.repository, tag: image.digest })
  const res = await engine.stream(
    `/images/create?${query.toString()}`,
    'POST',
    undefined,
    // PADDED base64, which is what `registryAuthHeader` exists to guarantee: Node's
    // 'base64url' drops the `=` and the daemon SILENTLY falls back to anonymous,
    // blaming the token realm for a connection it never needed to make.
    registryAuthHeader(mint([repository])),
  )
  // TWO ways this fails and NEITHER throws on its own. The daemon answers a plain
  // **404** for an image the registry does not hold — measured 2026-09-06,
  // `{"message":"pull access denied for local/chem-labs, repository does not
  // exist"}` — and `stream` does not reject on status; and when it does answer 200
  // it can still report a mid-pull failure inside the ndjson body. A pull that
  // reports success and did nothing is the shape this project keeps paying for, so
  // both are checked.
  let body = ''
  for await (const chunk of res as unknown as AsyncIterable<Buffer>)
    body += chunk.toString('utf8')
  const status = res.statusCode ?? 0
  if (status < 200 || status >= 300 || /"error"/.test(body)) {
    throw new EngineError(
      'IMAGE_PULL_FAILED',
      `the daemon could not pull ${ref} (${status}): ${body.trim().split('\n').at(-1) ?? body}`,
      'The image is pushed by the builder to the registry; the daemon reaches it at ' +
        `${registryPublicHost}. Check that \`make up\` has the registry healthy.`,
    )
  }
}

/** `serviceName` is `<slug>-<kind>-<declared>` (P2). The kind is the second field. */
function kindFromServiceName(name: string): InstanceSpec['environmentKind'] {
  for (const kind of ['sandbox', 'staging', 'production'] as const) {
    if (name.includes(`-${kind}-`)) return kind
  }
  throw new EngineError(
    'SERVICE_NAME_UNPARSEABLE',
    `cannot read an environment kind out of service name '${name}'`,
    'Service names come from runtime/driver.ts serviceName(project, environment, declared).',
  )
}
