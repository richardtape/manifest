import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LogLine } from '../driver.js'
import type { ConcurrencyLimits } from './concurrency.js'
import type { EngineClient } from './engine.js'
import { EngineError } from './engine.js'
import { containerExec } from './exec.js'
import { containerLogs } from './logs.js'

export interface BuildLimits extends ConcurrencyLimits {
  /** Enforced by destroying the builder. BuildKit has no timeout of its own. */
  timeoutMs: number
  /** `[[worker.oci.gcpolicy]] maxUsedSpace`. Reclaims the cache AFTER a build. */
  maxUsedSpace: string
  /** `max-parallelism`. Bounds steps in flight inside this build. */
  maxParallelism: number
}

export const DEFAULT_BUILD_LIMITS: BuildLimits = {
  // 15 minutes. §21 budgets ~0.5 GB per app environment on a 16 GB laptop; a build
  // that has not finished in fifteen minutes is stuck, not slow.
  timeoutMs: 900_000,
  maxUsedSpace: '4GB',
  // Half of a 12-core machine, so a build cannot make the rest of the platform
  // unresponsive. Measured to work: at 1 it serializes two builds from 25 s to 50 s.
  maxParallelism: 4,
  globalConcurrency: 2,
  perProjectConcurrency: 1,
}

/**
 * What a container on `manifest-build-internal` calls the registry. The daemon and
 * the control plane use the published `127.0.0.1:7107` instead — the same registry
 * under two names, which is why P1 dual-homes it.
 *
 * A default rather than a literal buried in the TOML: Task 15 passes Config's
 * `registryInternalUrl` down, and a hardcoded copy here would silently disagree
 * with it the moment it is changed.
 */
export const DEFAULT_REGISTRY_INTERNAL_HOST = 'manifest-registry:5000'

export function buildkitdToml(limits: BuildLimits, registryHost: string): string {
  return [
    '# Generated per build by the Manifest Docker driver.',
    '',
    '# BuildKit writes its own resolv.conf for RUN steps, so Docker service names do',
    '# not resolve without this. The symptom is npm reporting',
    '#   getaddrinfo ENOTFOUND manifest-verdaccio',
    '[dns]',
    '  nameservers = ["127.0.0.11"]',
    '',
    '# The local registry is plain HTTP. Without this the builder refuses the',
    '# mirrored base images `make seed` pushed, and offline builds fail.',
    `[registry."${registryHost}"]`,
    '  http = true',
    '  insecure = true',
    '',
    '[worker.oci]',
    `  max-parallelism = ${limits.maxParallelism}`,
    '  gc = true',
    '  [[worker.oci.gcpolicy]]',
    '    all = true',
    `    maxUsedSpace = "${limits.maxUsedSpace}"`,
    '',
  ].join('\n')
}

/**
 * The shell the builder container runs.
 *
 * The entrypoint has to be overridden so the generated TOML can be written from
 * INSIDE the container — the control plane is a host process and the daemon runs in
 * a VM, so a host bind mount is not guaranteed to be visible. The cost is that
 * `moby/buildkit:*-rootless`'s own ENTRYPOINT, `["rootlesskit","buildkitd"]`, goes
 * with it. Measured on v0.32.2: `exec buildkitd …` without rootlesskit exits **1**,
 * and the container is gone before buildx ever connects to it.
 */
export function builderCommand(): string {
  return (
    'mkdir -p /home/user/.config/buildkit && ' +
    'printf "%s" "$BUILDKITD_TOML" > /home/user/.config/buildkit/buildkitd.toml && ' +
    // Default unix socket ONLY. `--addr tcp://...` makes the
    // docker-container:// transport hang on "waiting for connection" (S1).
    'exec rootlesskit buildkitd --oci-worker-no-process-sandbox'
  )
}

const builderName = (buildId: string) => `mf-builder-${buildId}`

/**
 * One `buildctl du` inside the builder. Returns `undefined` when the daemon
 * answered, and otherwise why it did not.
 *
 * Both streams are drained, and every failure is caught: `containerExec` routes an
 * engine error to `exitCode` AND to both stream drains (Task 8), so awaiting one
 * without the others turns a retryable probe into a thrown exception on the first
 * attempt.
 */
async function probeBuildctl(
  engine: EngineClient,
  name: string,
): Promise<string | undefined> {
  const probe = containerExec(engine, name, ['buildctl', 'du'], {})
  const failed = (error: unknown) => (error as Error).message
  const stderr: string[] = []
  const code = await probe.exitCode.catch(() => -1)
  try {
    for await (const _line of probe.stdout) void _line
    for await (const line of probe.stderr) stderr.push(line)
  } catch (error) {
    return failed(error)
  }
  return code === 0
    ? undefined
    : `buildctl exited ${code}: ${stderr.join(' ').slice(0, 200)}`
}

async function builderLogTail(engine: EngineClient, name: string): Promise<string> {
  try {
    const lines: string[] = []
    for await (const line of containerLogs(engine, name, { tail: 10 }))
      lines.push(line.text)
    return lines.join(' | ').slice(0, 400)
  } catch {
    return '(no logs; the container is already gone)'
  }
}

/**
 * The daemon has to be ANSWERING, not merely started.
 *
 * Measured: a malformed `buildkitd.toml` does not degrade to defaults on v0.32.2 —
 * buildkitd prints `failed to parse config` and the container exits 1. So does
 * dropping `rootlesskit` from the command. Without this poll either arrives later
 * as a buildx transport error naming neither the config nor the container, and the
 * same shape — returning as soon as the container had STARTED — was defect 17 in
 * `services.ts`.
 *
 * An exited container is failed IMMEDIATELY rather than polled forty times: waiting
 * cannot revive it, and the exit code is the evidence.
 */
async function awaitBuilderReady(
  engine: EngineClient,
  name: string,
  attempts = 40,
): Promise<void> {
  let why = 'the probe never ran'
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const inspect = await engine.get<{ State: { Status: string; ExitCode: number } }>(
      `/containers/${name}/json`,
    )
    if (inspect === undefined || inspect.State.Status !== 'running') {
      why = `the container is ${inspect?.State.Status ?? 'gone'} (exit ${inspect?.State.ExitCode ?? '?'})`
      break
    }
    const failure = await probeBuildctl(engine, name)
    if (failure === undefined) return
    why = failure
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new EngineError(
    'BUILDER_NOT_READY',
    `the builder ${name} never answered buildctl: ${why}`,
    'buildkitd refuses to start on a malformed buildkitd.toml rather than falling back to ' +
      "defaults, and it exits immediately if rootlesskit is not in front of it. The daemon's " +
      `own last words: ${await builderLogTail(engine, name)}`,
  )
}

/**
 * §12: ephemeral per build, created and destroyed by the driver. The `finally` is
 * the build timeout — BuildKit has none, and a client-side deadline needs the
 * control plane to be alive to send it.
 */
export async function withEphemeralBuilder<T>(
  engine: EngineClient,
  buildId: string,
  limits: BuildLimits,
  fn: (builder: string) => Promise<T>,
  registryHost: string = DEFAULT_REGISTRY_INTERNAL_HOST,
): Promise<T> {
  const name = builderName(buildId)
  const toml = buildkitdToml(limits, registryHost)
  await engine.del(`/containers/${name}?force=true&v=true`)
  await engine.post(`/containers/create?name=${name}`, {
    Image: 'moby/buildkit:v0.32.2-rootless',
    // The config is written from inside the container: the control plane is a host
    // process and the daemon runs in a VM, so a host bind mount is not guaranteed
    // to be visible. Same reasoning as the per-app egress proxy.
    Entrypoint: ['/bin/sh', '-c'],
    Cmd: [builderCommand()],
    Env: [`BUILDKITD_TOML=${toml}`],
    HostConfig: {
      // INTERNAL NETWORK ONLY. This is the network restriction §12 and §20 call a
      // control; the registry and mirror are dual-homed so they stay reachable.
      NetworkMode: 'manifest-build-internal',
      // Rootless BuildKit needs exactly these three. It does NOT need --privileged,
      // and §12 forbids it — buildx's own docker-container driver would add it.
      SecurityOpt: ['seccomp=unconfined', 'apparmor=unconfined'],
      Devices: [
        {
          PathOnHost: '/dev/fuse',
          PathInContainer: '/dev/fuse',
          CgroupPermissions: 'rwm',
        },
      ],
      Privileged: false,
      RestartPolicy: { Name: 'no' },
    },
    Labels: { 'manifest.build': buildId },
  })
  await engine.post(`/containers/${name}/start`)
  try {
    await awaitBuilderReady(engine, name)
    return await fn(name)
  } finally {
    // The bound. Not best-effort cleanup: this is what stops a runaway build.
    await engine.del(`/containers/${name}?force=true&v=true`)
  }
}

/**
 * `observability/`'s `REDACTED`, restated. `runtime/` cannot import `observability/`
 * at run time — its index pulls in `db/`, which §5 keeps out of the driver — and a
 * stored log should carry one spelling of the marker. `builder.test.ts` holds the
 * two equal.
 */
export const REDACTED_TOKEN = '[REDACTED]'

export interface StreamedCommand {
  command: string
  args: readonly string[]
  env: NodeJS.ProcessEnv
  /** The process GROUP is killed when this passes; see `runStreamed`. */
  timeoutMs: number
  /** Called once per complete line, in arrival order, already redacted. */
  onLine: (line: LogLine) => void
  /**
   * Exact values replaced with `[REDACTED]` in every line — before `onLine`, and
   * before the tail that becomes a failed build's persisted error.
   */
  secrets: readonly string[]
  /** How many trailing lines to keep for a failure message. Default 40. */
  tailLines?: number
}

export interface StreamedResult {
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  /** The last `tailLines` lines of both streams, in arrival order, redacted. */
  tail: string[]
}

const DEFAULT_TAIL_LINES = 40
/** `observability/redact.ts`'s `MIN_SECRET_LENGTH`, for the same reason. */
const MIN_SECRET_PIECE = 6
/** A group that ignores SIGTERM this long is killed outright. */
const KILL_GRACE_MS = 5_000
/**
 * The longest partial line held before it is emitted as a line anyway. `execFile`
 * bounded memory with a 32 MiB `maxBuffer`; streaming holds only the partial line,
 * and this bounds that. BuildKit's plain progress is newline-terminated, so nothing
 * real comes near it — and it is large so that a secret straddling the cut, which
 * would escape exact-match redaction, stays theoretical.
 */
const MAX_PARTIAL_LINE = 1024 * 1024

/**
 * Runs a command and hands over its output LINE BY LINE while it runs.
 *
 * `spawn`, not `execFile`: `execFile` buffers everything and hands it over at exit,
 * which is a report and not a stream (§14). What that takes on, each tested in
 * `builder.test.ts`:
 *
 *  * **One partial-line buffer per stream.** BuildKit writes its progress to
 *    STDERR; a shared buffer glues a stdout fragment onto the next stderr line.
 *  * **The last line is flushed on close**, newline or not.
 *  * **Redaction runs on WHOLE lines**, after the fragments are joined, so a secret
 *    split across two pipe reads is still matched.
 *  * **The timeout kills the process GROUP.** A grandchild that shares the pipes
 *    keeps `close` from ever arriving if only the spawned process is killed.
 *    `docker buildx` has exactly that shape — `docker` runs the `docker-buildx`
 *    plugin as a child — but measured 2026-09-14 on Docker CLI 29.7.2 with buildx
 *    v0.36.1, the CLI forwards SIGTERM to the plugin, and killing `docker` alone
 *    stopped a real build. So the group kill is defence in depth, for a CLI that
 *    does not forward, and `builder.test.ts` proves it with `sh`. `detached: true`
 *    makes the child a group leader so `process.kill(-pid)` reaches all of it; the
 *    cost is that a Ctrl-C in the control plane's own terminal no longer reaches an
 *    in-flight build, which then runs to its own end.
 *  * **An `onLine` that throws stops the command** and rejects with that error,
 *    rather than surfacing as an uncaught exception from a stream listener.
 *
 * Resolves with the exit status — deciding what a non-zero exit means is the
 * caller's — and rejects only when the command could not be run at all.
 */
export function runStreamed(input: StreamedCommand): Promise<StreamedResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, [...input.args], {
      env: input.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })
    const tailLimit = input.tailLines ?? DEFAULT_TAIL_LINES
    // One needle per LINE of each secret, because redaction runs per line and a line
    // never contains a newline: a token handed over the way a CLI prints it — with a
    // trailing newline, as `infra/seed/mint-token.mjs` does — would otherwise match
    // nothing, silently. The floor is `makeRedactor`'s: a one-character piece would
    // redact every occurrence of that character. Longest first, also for its reason:
    // a short secret inside a long one would leave the long one's tail behind.
    const secrets = [...new Set(input.secrets.flatMap((secret) => secret.split(/\r?\n/)))]
      .filter((piece) => piece.length >= MIN_SECRET_PIECE)
      .sort((a, b) => b.length - a.length)
    const tail: string[] = []
    const partial = { stdout: '', stderr: '' }
    let settled = false
    let timedOut = false
    let callbackFailure: { error: unknown } | undefined
    let grace: NodeJS.Timeout | undefined

    const killGroup = (signal: NodeJS.Signals): void => {
      if (child.pid === undefined) return
      try {
        process.kill(-child.pid, signal)
      } catch (error) {
        // ESRCH is the group already being gone, which is what was wanted. Anything
        // else falls back to the one process this function does own.
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill(signal)
      }
    }

    const emit = (stream: 'stdout' | 'stderr', raw: string): void => {
      let text = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      for (const secret of secrets) text = text.split(secret).join(REDACTED_TOKEN)
      tail.push(text)
      if (tail.length > tailLimit) tail.shift()
      if (callbackFailure !== undefined) return
      try {
        input.onLine({ at: new Date(), stream, text })
      } catch (error) {
        callbackFailure = { error }
        killGroup('SIGKILL')
      }
    }

    for (const stream of ['stdout', 'stderr'] as const) {
      const readable = child[stream]
      // A decoder per stream, so a multi-byte character split across two reads is
      // joined rather than turned into two replacement characters.
      readable.setEncoding('utf8')
      readable.on('data', (chunk: string) => {
        const lines = (partial[stream] + chunk).split('\n')
        partial[stream] = lines.pop() ?? ''
        for (const line of lines) emit(stream, line)
        if (partial[stream].length > MAX_PARTIAL_LINE) {
          emit(stream, partial[stream])
          partial[stream] = ''
        }
      })
    }

    const timer = setTimeout(() => {
      timedOut = true
      killGroup('SIGTERM')
      grace = setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS)
    }, input.timeoutMs)

    child.on('error', (error) => {
      clearTimeout(timer)
      if (grace !== undefined) clearTimeout(grace)
      if (settled) return
      settled = true
      reject(error)
    })

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer)
      if (grace !== undefined) clearTimeout(grace)
      for (const stream of ['stdout', 'stderr'] as const) {
        if (partial[stream] !== '') emit(stream, partial[stream])
        partial[stream] = ''
      }
      if (settled) return
      settled = true
      if (callbackFailure !== undefined) reject(callbackFailure.error)
      else resolve({ exitCode, signal, timedOut, tail })
    })
  })
}

export interface BuildxInput {
  /**
   * Each line of BuildKit's output as the build runs, with `registryToken` already
   * removed from it (P4b Task 11).
   */
  onLog?: (line: LogLine) => void
  builder: string
  contextDir: string
  imageRef: string
  registryToken: string
  registryHost: string
  timeoutMs: number
  /**
   * Unix seconds every timestamp in the image is pinned to. The COMMIT's own time
   * is the right value: it is a property of the source, so the same source is the
   * same digest, and a rebuild months later still is.
   */
  sourceDateEpoch: number
}

/**
 * Shells out to buildx (Decision 2). `--metadata-file` is the only source of
 * `containerimage.digest`, which is what §13 binds an approval to.
 *
 * NOTE the cli-plugins symlink. Setting DOCKER_CONFIG moves CLI plugin discovery
 * with it, so without it `docker buildx` fails with `unknown flag: --builder` —
 * which reads as a buildx version problem and is not one.
 */
export async function runBuildxBuild(input: BuildxInput): Promise<{ digest: string }> {
  const configDir = await mkdtemp(join(tmpdir(), 'mf-buildcfg-'))
  try {
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({
        auths: { [input.registryHost]: { registrytoken: input.registryToken } },
      }),
    )
    await symlink(
      join(homedir(), '.docker', 'cli-plugins'),
      join(configDir, 'cli-plugins'),
    )
    const metadataFile = join(configDir, 'metadata.json')

    // ONE environment for both calls, and exactly this one (sitting 6's note on
    // Task 11). The throwaway DOCKER_CONFIG is where the build's scoped registry
    // token lives, so `process.env` alone drops the token the build pushes with; it
    // also carries no `credsStore`, so the developer's credential helper — which hung
    // on this machine on 2026-09-14 and stopped `make seed` — never enters a build.
    const env = { ...process.env, DOCKER_CONFIG: configDir }

    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        'docker',
        [
          'buildx',
          'create',
          '--name',
          input.builder,
          '--driver',
          'remote',
          `docker-container://${input.builder}`,
        ],
        // `buildx create` prints no progress, so it stays a buffered call.
        { env },
        (error) => (error ? reject(error) : resolve()),
      )
      child.on('error', reject)
    })

    // STREAMED (§14). `runStreamed` says what that takes; the token is removed from
    // every line here, because the driver is the only place that holds it.
    const run = await runStreamed({
      command: 'docker',
      args: [
        'buildx',
        '--builder',
        input.builder,
        'build',
        // REPRODUCIBILITY. §13 binds an approval to a digest and P2's driver
        // contract asserts "the same source builds to the same digest" — and a
        // default BuildKit build does not: the image config carries a `created`
        // timestamp and every layer carries file mtimes, so two builds of
        // identical source produced two digests (measured 2026-09-06,
        // `sha256:a3bcc26…` vs `sha256:17b6691…`).
        //
        // SOURCE_DATE_EPOCH fixes the config timestamp and
        // `rewrite-timestamp=true` rewrites the layers to match. Both are
        // needed; either alone still moves the digest.
        '--build-arg',
        `SOURCE_DATE_EPOCH=${input.sourceDateEpoch}`,
        // NO PROVENANCE ATTESTATION. buildx attaches one by default, it records
        // build start and end times, and it is therefore never reproducible —
        // which moves the INDEX digest even when the image itself is identical.
        // Measured 2026-09-06: two builds produced the same arm64 image manifest
        // (`sha256:4c9606b8…` both times) and two different attestation
        // manifests, so `containerimage.digest` differed and §13's "promote the
        // exact digest" had nothing stable to bind to.
        //
        // Nothing here consumes it: §12's supply-chain record is the Syft SBOM
        // and the Grype scan this driver runs and retains with the Release. If
        // attestations are ever wanted, the digest binding has to move to the
        // per-platform image manifest first.
        '--provenance=false',
        '--output',
        `type=image,name=${input.imageRef},push=true,rewrite-timestamp=true`,
        '--metadata-file',
        metadataFile,
        input.contextDir,
      ],
      env,
      timeoutMs: input.timeoutMs,
      secrets: [input.registryToken],
      onLine: (line) => input.onLog?.(line),
    })
    if (run.timedOut || run.exitCode !== 0) {
      // The TAIL, not the whole output: this becomes `builds.error`, and the whole
      // log is in the build log store now. `execFile` put every byte of stderr here.
      throw new EngineError(
        'BUILD_FAILED',
        run.timedOut
          ? `build timed out after ${input.timeoutMs} ms and was stopped: ${run.tail.join('\n')}`
          : `build failed (exit ${run.exitCode ?? run.signal}): ${run.tail.join('\n')}`,
        "The message is BuildKit's. Check the blueprint Dockerfile, the lockfile and the mirror first.",
      )
    }

    const metadata = JSON.parse(await readFile(metadataFile, 'utf8')) as {
      'containerimage.digest'?: string
    }
    const digest = metadata['containerimage.digest']
    if (digest === undefined) {
      throw new EngineError(
        'BUILD_NO_DIGEST',
        'the build produced no containerimage.digest',
        'A build without a digest cannot become a Release (§13). Check that --push was used: ' +
          'the digest is only produced when the image is pushed.',
      )
    }
    return { digest }
  } finally {
    // One temp directory per build, holding a live push token. P2 leaked 944 of
    // these from `api/testing.ts` and Task 9 leaked one per Docker test; this is
    // the same class, in the path that runs on every real build.
    await rm(configDir, { recursive: true, force: true })
  }
}
