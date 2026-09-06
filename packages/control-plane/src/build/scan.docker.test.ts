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
   * The whole point of `PLATFORM_OWNED_PACKAGE_TYPES`, against the real database.
   * Alpine's `libcrypto3`/`libssl3` findings are Critical and High and cannot be
   * fixed by any app — if this blocked, nothing would ever deploy.
   */
  it('finds real OS findings in alpine and does not block on them', async () => {
    const result = await scanImage(engine, 'alpine:3.22')
    const serious = result.vulnerabilities.filter(
      (v) => v.severity === 'Critical' || v.severity === 'High',
    )
    expect(serious.length).toBeGreaterThan(0)
    expect(serious.every((v) => v.packageType === 'apk')).toBe(true)
    expect(result.blocked).toBe(false)
    expect(result.reason).toMatch(/base image/)
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
