import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import {
  createEngineClient,
  describeDocker,
  REPO_ROOT,
  resolveSocketPath,
} from '../runtime/testing.js'
import { scanImage } from './scan.js'

const run = promisify(execFile)
const engine = createEngineClient({ socketPath: resolveSocketPath() })

describeDocker('SBOM and vulnerability scanning (§12)', () => {
  it('produces an SBOM that actually lists packages', async () => {
    const result = await scanImage(engine, 'alpine:3.22')
    const sbom = JSON.parse(result.sbom) as { packages?: unknown[]; spdxVersion?: string }
    expect(sbom.spdxVersion).toMatch(/^SPDX-/)
    // The assertion that matters: "it returned an SBOM" and "it returned an SBOM of
    // this image" are different claims. Alpine has dozens of packages.
    expect(sbom.packages?.length ?? 0).toBeGreaterThan(5)
  })

  /**
   * The database age is what §12's whole staleness paragraph rests on, and grype
   * reports it at `descriptor.db.status.built` — NOT `descriptor.db.built`, which is
   * `undefined` and would make every scan Infinity days old, permanently stale, and
   * therefore permanently non-blocking. Asserting a FINITE, RECENT number is what
   * catches that; asserting "a number arrived" would not.
   */
  it('reports a real database age, not Infinity', async () => {
    const result = await scanImage(engine, 'alpine:3.22')
    expect(Number.isFinite(result.databaseAgeDays)).toBe(true)
    expect(result.databaseAgeDays).toBeGreaterThanOrEqual(0)
    if (!Number.isFinite(result.databaseAgeDays)) expect(result.stale).toBe(true)
  })

  /**
   * The rule that decides what blocks, against the image faculty apps actually run
   * on — and it is `node:22-alpine`, not `alpine`, because that is where the rule
   * this replaced fell over.
   *
   * Measured: `node:22-alpine` carries 4 Critical + 14 High `apk` findings AND 1
   * Critical + 10 High **`npm`** findings, the latter all inside
   * `/usr/local/lib/node_modules/npm/` — npm's own bundled tree, shipped in the
   * base image. Scanning an image against ITSELF as base must therefore attribute
   * every one of them to the base and block on nothing.
   */
  it('attributes every finding in the base image to the base image', async () => {
    const result = await scanImage(engine, 'node:22-alpine', {
      baseImageRef: 'node:22-alpine',
    })
    expect(result.baseImageKnown).toBe(true)
    expect(result.baseImageFindings.length).toBeGreaterThan(10)
    // The half that catches an ecosystem-based rule: npm findings live in the base
    // image too, and calling them the app's blocks every build.
    expect(result.baseImageFindings.some((v) => v.packageType === 'npm')).toBe(true)
    expect(result.baseImageFindings.some((v) => v.packageType === 'apk')).toBe(true)
    expect(result.appFindings).toEqual([])
    expect(result.blocked).toBe(false)
  })

  /**
   * FAILS CLOSED, against the same real image. Without a base to compare against,
   * those same findings are all the app's and the build is refused — a scan that
   * cannot tell what the build added must not answer "nothing to worry about".
   */
  it('blocks the identical image when the base is unknown', async () => {
    const result = await scanImage(engine, 'node:22-alpine')
    expect(result.baseImageKnown).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.reason).toMatch(/not identified/i)
  })

  /**
   * The path a real build takes: the image exists only in the registry, and the
   * daemon has to be given a scoped token to pull it. Exercising it here is what
   * makes `X-Registry-Auth` a tested code path rather than a hopeful one.
   */
  it('pulls an image out of the local registry with a scoped token, then scans it', async () => {
    await run('docker', ['rmi', '127.0.0.1:7107/base/alpine:3.22']).catch(() => undefined)
    const token = (
      await run('node', ['infra/seed/mint-token.mjs', 'base/alpine'], { cwd: REPO_ROOT })
    ).stdout
    const result = await scanImage(engine, '127.0.0.1:7107/base/alpine:3.22', {
      registryToken: token,
    })
    expect(JSON.parse(result.sbom).spdxVersion).toMatch(/^SPDX-/)
  })
})
