import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import {
  createEngineClient,
  describeDocker,
  REPO_ROOT,
  resolveSocketPath,
} from '../runtime/testing.js'
import { GRYPE, SCANNER_ENV, scanImage } from './scan.js'

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
   *
   * **ON ANY DATE** (P6b sitting 2): this asserted `blocked: true` outright, which is
   * true only while the machine's vulnerability database is at most 7 days old — past
   * that, §12's staleness rule WARNS rather than blocks, by design and asserted below.
   * It went red on 2026-09-23 with a database built 2026-09-16T06:30:57Z (7.4 days),
   * a calendar failure with no code change behind it. The fail-closed half is that
   * every fixable finding is the APP'S once the base is unknown — which the previous
   * test's `appFindings: []` is the mirror of — and that holds whatever the database's
   * age; whether those findings then BLOCK is the staleness rule's to say.
   */
  it('blocks the identical image when the base is unknown', async () => {
    const result = await scanImage(engine, 'node:22-alpine')
    expect(result.baseImageKnown).toBe(false)
    expect(result.appFindings.length).toBeGreaterThan(0)
    expect(result.blocked).toBe(!result.stale)
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

  /**
   * §12: a stale database "warns rather than blocks". Grype has its own opinion —
   * `validate-age: true` and `max-allowed-built-age: 120h` by default — and on
   * 2026-09-14 it refused a 5.5-day-old database, failing every build on this
   * machine while `make doctor` called the database fresh: doctor asks `db status`,
   * which does not validate age. `assessScan`'s 7-day staleness record could never
   * be reached, because nothing older than five days ever loaded.
   *
   * The limit is forced to one second so this fails on a database of ANY age, not
   * only on a machine that has gone five days without `make seed`. It SCANS an
   * empty directory because loading the database is the claim under test.
   */
  it('scans with a database past grype’s own age limit, because §12 warns rather than blocks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mf-scan-age-'))
    try {
      const { stdout } = await run('docker', [
        'run',
        '--rm',
        '--network',
        'none',
        '-v',
        'manifest-grype-db:/db:ro',
        '-v',
        `${dir}:/scan:ro`,
        ...SCANNER_ENV.flatMap((entry) => ['-e', entry]),
        '-e',
        'GRYPE_DB_MAX_ALLOWED_BUILT_AGE=1s',
        GRYPE,
        'dir:/scan',
        '-o',
        'json',
      ]).catch((error: { stderr?: string }) => {
        throw new Error(
          `grype refused the database: ${
            (error.stderr ?? '')
              .split('\n')
              .filter((line) => line.includes('ERROR'))
              .join(' ') || error.stderr?.slice(-400)
          }`,
        )
      })
      // The shape, not the exit code: a database that LOADED reports when it was built.
      const report = JSON.parse(stdout) as {
        descriptor?: { db?: { status?: { built?: string } } }
      }
      expect(report.descriptor?.db?.status?.built).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
