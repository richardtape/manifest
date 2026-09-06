import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BUILD_LIMITS,
  DEFAULT_REGISTRY_INTERNAL_HOST,
  builderCommand,
  buildkitdToml,
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
