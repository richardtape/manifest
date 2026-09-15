import { describe, expect, it } from 'vitest'
import { REDACTED } from '../../observability/index.js'
import type { LogLine } from '../driver.js'
import {
  DEFAULT_BUILD_LIMITS,
  DEFAULT_REGISTRY_INTERNAL_HOST,
  REDACTED_TOKEN,
  builderCommand,
  buildkitdToml,
  runStreamed,
  type StreamedCommand,
} from './builder.js'

describe('buildkitd configuration', () => {
  const toml = buildkitdToml(DEFAULT_BUILD_LIMITS, 'manifest-registry:5000')

  // BOTH stanzas are required and NEITHER is discoverable from the error message
  // it prevents (S1). Without [dns], `RUN npm install` fails with
  // `getaddrinfo ENOTFOUND manifest-verdaccio`, because BuildKit writes its own
  // resolv.conf for RUN steps.
  it("points RUN steps at Docker's embedded resolver", () => {
    expect(toml).toContain('[dns]')
    expect(toml).toContain('nameservers = ["127.0.0.11"]')
  })

  it('marks the local registry as plain HTTP, or offline builds cannot pull the mirrored base image', () => {
    expect(toml).toContain('[registry."manifest-registry:5000"]')
    expect(toml).toContain('http = true')
    expect(toml).toContain('insecure = true')
  })

  it('bounds steps in flight and cache size — the two bounds BuildKit does enforce', () => {
    expect(toml).toContain('max-parallelism = 4')
    expect(toml).toContain('gc = true')
    expect(toml).toContain('maxUsedSpace = "4GB"')
  })

  it('has no timeout setting, because BuildKit has none', () => {
    expect(toml).not.toMatch(/timeout/i)
    // The timeout is the ephemeral builder's lifetime instead.
    expect(DEFAULT_BUILD_LIMITS.timeoutMs).toBe(900_000)
  })

  // Task 15 passes the builder-facing registry host down from Config. The TOML has
  // to be generated from the SAME value, or `http = true` names a host the build
  // never talks to and the failure is an HTTPS handshake against a plain-HTTP
  // registry — which reads as a certificate problem.
  it('names whatever registry host it is given, not a hardcoded one', () => {
    expect(buildkitdToml(DEFAULT_BUILD_LIMITS, 'other-registry:6000')).toContain(
      '[registry."other-registry:6000"]',
    )
    expect(DEFAULT_REGISTRY_INTERNAL_HOST).toBe('manifest-registry:5000')
  })
})

describe('the builder entrypoint', () => {
  const command = builderCommand()

  /**
   * MEASURED, not assumed. `moby/buildkit:v0.32.2-rootless` has
   * ENTRYPOINT ["rootlesskit","buildkitd"], and overriding the entrypoint to write
   * the config file drops rootlesskit with it. `exec buildkitd …` on its own exits
   * **1** on this machine ("failed to configure the daemon"), so the builder never
   * starts and the failure surfaces later as a buildx connection error.
   */
  it('runs buildkitd under rootlesskit, which overriding the entrypoint would drop', () => {
    expect(command).toContain('exec rootlesskit buildkitd')
  })

  it('keeps --oci-worker-no-process-sandbox, which rootless BuildKit needs', () => {
    expect(command).toContain('--oci-worker-no-process-sandbox')
  })

  // `--addr tcp://…` makes the docker-container:// transport hang on
  // "waiting for connection: context deadline exceeded" (S1). Default socket only.
  it('does not move buildkitd off its default unix socket', () => {
    expect(command).not.toContain('--addr')
  })
})

/**
 * The line splitter every build streams through (P4b Task 11). Tested here with
 * `sh` rather than only through a real build, because each property below has a
 * failure that a real BuildKit run rarely shows: BuildKit writes almost everything
 * to stderr in whole lines, so a shared buffer, a lost last line or an unredacted
 * token would all pass the Docker tier on an ordinary day.
 */
describe('runStreamed — a build log is a stream, not a report', () => {
  const run = (script: string, extra: Partial<StreamedCommand> = {}) => {
    const lines: (LogLine & { receivedAt: number })[] = []
    const result = runStreamed({
      command: 'sh',
      args: ['-c', script],
      env: process.env,
      timeoutMs: 10_000,
      secrets: [],
      onLine: (line) => lines.push({ ...line, receivedAt: Date.now() }),
      ...extra,
    })
    return { lines, result }
  }

  it('delivers a line while the process is still running, not when it exits', async () => {
    // `execFile` buffers everything and hands it over at exit. A front-end that
    // receives nothing for two minutes and then everything at once has not
    // received a stream — so the assertion is on WHEN the first line arrived.
    const { lines, result } = run('echo first; sleep 1; echo second')
    const done = await result
    const finishedAt = Date.now()
    expect(done.exitCode).toBe(0)
    expect(lines.map((l) => l.text)).toEqual(['first', 'second'])
    expect(finishedAt - lines[0]!.receivedAt).toBeGreaterThan(700)
    expect(lines[0]!.at).toBeInstanceOf(Date)
  })

  it('keeps one partial-line buffer PER STREAM, so a stdout fragment never joins a stderr line', async () => {
    // The plan's first splitter shared one buffer between the two pipes: `out-a`
    // arrived with no newline, then stderr's `err-a\n` was appended to it and
    // emitted as a stderr line reading `out-aerr-a`.
    const { lines, result } = run(
      'printf out-a; sleep 0.2; printf "err-a\\n" >&2; sleep 0.2; printf "out-b\\n"',
    )
    await result
    expect(lines.map((l) => [l.stream, l.text])).toEqual([
      ['stderr', 'err-a'],
      ['stdout', 'out-aout-b'],
    ])
  })

  it('reads STDERR, which is where BuildKit writes its progress', async () => {
    const { lines, result } = run('echo "#1 [internal] load build definition" >&2')
    await result
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      stream: 'stderr',
      text: '#1 [internal] load build definition',
    })
  })

  it('flushes a last line that has no newline when the process exits', async () => {
    const { lines, result } = run('echo whole; printf "no newline at the end" >&2')
    await result
    expect(lines.map((l) => [l.stream, l.text])).toEqual([
      ['stdout', 'whole'],
      ['stderr', 'no newline at the end'],
    ])
  })

  it('replaces an exact secret in every line before anyone sees it — even one split across two chunks', async () => {
    // The build's registry JWT lives in the driver and nowhere else, so the driver
    // is where it has to come out (pre-flight 105). Redaction runs on WHOLE lines,
    // after the splitter has joined the fragments, or a token that straddles two
    // pipe reads is never matched.
    const { lines, result } = run(
      'echo "token=CANARY-REGISTRY-TOKEN"; printf "abc CANARY-REGI" >&2; sleep 0.2; ' +
        'printf "STRY-TOKEN xyz\\n" >&2; exit 3',
      { secrets: ['CANARY-REGISTRY-TOKEN'] },
    )
    const done = await result
    expect(done.exitCode).toBe(3)
    expect(lines.map((l) => l.text)).toEqual([`token=${REDACTED}`, `abc ${REDACTED} xyz`])
    // The tail becomes `builds.error`, which is persisted too.
    expect(done.tail.join('\n')).not.toContain('CANARY')
    expect(done.tail.join('\n')).toContain(REDACTED)
  })

  it('redacts a secret handed over with a trailing newline, the way a CLI prints a token', async () => {
    // Redaction is per line and a line has no newline in it, so the needle
    // `TOKEN\n` matched nothing at all — found by writing the Docker tier's test,
    // whose token comes from `mint-token.mjs` on stdout.
    const { lines, result } = run('echo "Bearer CANARY-REGISTRY-TOKEN"', {
      secrets: ['CANARY-REGISTRY-TOKEN\n'],
    })
    await result
    expect(lines.map((l) => l.text)).toEqual([`Bearer ${REDACTED}`])
  })

  it("redacts with observability's own marker, so a stored log has one spelling of it", () => {
    // runtime/ cannot import observability/ at run time — that would pull `db/`
    // into the driver, which §5 keeps out — so the constant is restated there, and
    // this is what stops the two drifting.
    expect(REDACTED_TOKEN).toBe(REDACTED)
  })

  it('keeps a BOUNDED tail, newest line last', async () => {
    const { result } = run(
      'i=0; while [ $i -lt 50 ]; do echo "line $i"; i=$((i+1)); done; exit 2',
      { tailLines: 5 },
    )
    const done = await result
    expect(done.exitCode).toBe(2)
    expect(done.tail).toEqual(['line 45', 'line 46', 'line 47', 'line 48', 'line 49'])
  })

  it('kills a process that outlives its timeout, and says it timed out', async () => {
    const started = Date.now()
    const { lines, result } = run('echo started; exec sleep 30', { timeoutMs: 300 })
    const done = await result
    expect(done.timedOut).toBe(true)
    expect(done.exitCode).toBeNull()
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(lines.map((l) => l.text)).toEqual(['started'])
  })

  it('kills the whole process GROUP, so a grandchild holding the pipe cannot keep the build alive', async () => {
    // Killing only the process we spawned leaves a grandchild holding both pipes
    // open, 'close' never fires, and a timed-out build hangs for as long as the
    // grandchild does. `sleep` here is that grandchild. `docker buildx` has this
    // shape — `docker` runs the plugin as a child — though Docker CLI 29.7.2 happens
    // to forward SIGTERM to it (measured 2026-09-14), so THIS is the test of the
    // mechanism, and the Docker tier's timeout test passes either way.
    const started = Date.now()
    const { result } = run('echo started; sleep 30; echo never', { timeoutMs: 300 })
    const done = await result
    expect(done.timedOut).toBe(true)
    expect(Date.now() - started).toBeLessThan(5_000)
  })
})
