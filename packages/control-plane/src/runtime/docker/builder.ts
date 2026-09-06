import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
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

export interface BuildxInput {
  builder: string
  contextDir: string
  imageRef: string
  registryToken: string
  registryHost: string
  timeoutMs: number
}

/**
 * Shells out to buildx (Decision 2). `--metadata-file` is the only source of
 * `containerimage.digest`, which is what §13 binds an approval to.
 *
 * NOTE the cli-plugins symlink. Setting DOCKER_CONFIG moves CLI plugin discovery
 * with it, so without it `docker buildx` fails with `unknown flag: --builder` —
 * which reads as a buildx version problem and is not one.
 */
export async function runBuildxBuild(
  input: BuildxInput,
): Promise<{ digest: string; log: string }> {
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
        { env: { ...process.env, DOCKER_CONFIG: configDir } },
        (error) => (error ? reject(error) : resolve()),
      )
      child.on('error', reject)
    })

    const log = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        'docker',
        [
          'buildx',
          '--builder',
          input.builder,
          'build',
          '--push',
          '-t',
          input.imageRef,
          '--metadata-file',
          metadataFile,
          input.contextDir,
        ],
        {
          env: { ...process.env, DOCKER_CONFIG: configDir },
          timeout: input.timeoutMs,
          maxBuffer: 32 * 1024 * 1024,
        },
        (error, stdout, stderr) =>
          error
            ? reject(
                new EngineError(
                  'BUILD_FAILED',
                  `build failed: ${stderr || stdout || error.message}`,
                  "The message is BuildKit's. Check the blueprint Dockerfile, the lockfile and the mirror first.",
                ),
              )
            : resolve(`${stdout}\n${stderr}`),
      )
      child.on('error', reject)
    })

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
    return { digest, log }
  } finally {
    // One temp directory per build, holding a live push token. P2 leaked 944 of
    // these from `api/testing.ts` and Task 9 leaked one per Docker test; this is
    // the same class, in the path that runs on every real build.
    await rm(configDir, { recursive: true, force: true })
  }
}
