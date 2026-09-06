import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { demux, registryAuthHeader, type EngineClient } from '../runtime/index.js'

export const STALENESS_THRESHOLD_DAYS = 7
const BLOCKING_SEVERITIES = new Set(['Critical', 'High'])

/**
 * Grype's `artifact.type` for the OS package managers.
 *
 * A finding in one of these is in the **base image**, which is platform-owned and
 * digest-pinned by the blueprint (D13) — no rebuild of an app can clear it, and §20
 * says so outright: *"a vulnerability in the blueprint is a vulnerability in every
 * app"*, with the fleet-wide rebuild as its remedy in Phase 4+.
 *
 * Measured, and this is why the rule exists: `alpine:3.22` against a database built
 * the same morning reports **4 Critical and 14 High**, all of them `libcrypto3` and
 * `libssl3`. Blocking on those would have made the platform unable to deploy
 * anything at all while presenting as a working gate.
 */
export const PLATFORM_OWNED_PACKAGE_TYPES = new Set(['apk', 'deb', 'rpm'])

export interface Vulnerability {
  id: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Negligible' | 'Unknown'
  package: string
  /** Grype's `artifact.type`. `apk`/`deb`/`rpm` are the base image's; `npm` is the app's. */
  packageType: string
  /** Recorded for the owner report (§20), deliberately NOT part of the block rule. */
  fixAvailable: boolean
}

export interface ScanResult {
  sbom: string
  vulnerabilities: Vulnerability[]
  databaseAgeDays: number
  stale: boolean
  blocked: boolean
  reason: string
}

/**
 * §12, both halves. A stale database WARNS instead of blocking, so an offline
 * laptop can still deploy (C1) — and a clean result from a stale database is still
 * marked stale, so it can never be read as evidence there is nothing to find.
 */
export function assessScan(input: {
  databaseAgeDays: number
  vulnerabilities: Vulnerability[]
}): { stale: boolean; blocked: boolean; reason: string } {
  const stale = input.databaseAgeDays > STALENESS_THRESHOLD_DAYS
  const serious = input.vulnerabilities.filter((v) => BLOCKING_SEVERITIES.has(v.severity))
  const platform = serious.filter((v) => PLATFORM_OWNED_PACKAGE_TYPES.has(v.packageType))
  const actionable = serious.filter(
    (v) => !PLATFORM_OWNED_PACKAGE_TYPES.has(v.packageType),
  )
  const platformNote =
    platform.length > 0
      ? ` ${platform.length} more are in platform-owned base image packages ` +
        `(${[...new Set(platform.map((v) => v.package))].join(', ')}), which no rebuild of ` +
        'this app can clear — they are recorded for §20 fleet-wide rebuild, not blocked on.'
      : ''

  if (stale) {
    return {
      stale: true,
      blocked: false,
      reason:
        `the vulnerability database is ${input.databaseAgeDays.toFixed(1)} days old ` +
        `(threshold ${STALENESS_THRESHOLD_DAYS}); this scan is STALE and warns rather than blocks. ` +
        `${serious.length} high or critical finding(s) were reported by a database that may not be current.` +
        platformNote,
    }
  }
  return {
    stale: false,
    blocked: actionable.length > 0,
    reason:
      (actionable.length > 0
        ? `${actionable.length} high or critical finding(s) in this app's own dependencies: ` +
          actionable.map((v) => `${v.id} (${v.package})`).join(', ')
        : 'no high or critical findings in this app’s own dependencies') + platformNote,
  }
}

const SYFT = 'anchore/syft:v1.51.1'
const GRYPE = 'anchore/grype:v0.118.0'

export interface ScanOptions {
  /** A scoped pull token, when the image still has to come out of the registry. */
  registryToken?: string
}

/**
 * §12: "an SBOM is produced per build and retained with the Release". Transient
 * containers, per §21's inventory — the scanner's own dependency tree stays out of
 * the process that holds the Docker socket.
 */
export async function generateSbom(
  engine: EngineClient,
  imageRef: string,
  options: ScanOptions = {},
): Promise<string> {
  return withImageArchive(engine, imageRef, options, (dir) =>
    runScanner(engine, SYFT, ['docker-archive:/scan/image.tar', '-o', 'spdx-json'], dir),
  )
}

export async function scanImage(
  engine: EngineClient,
  imageRef: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  // ONE export, two scanners. Exporting twice would double the slowest step for
  // nothing, and would let the two tools disagree about which image they read.
  return withImageArchive(engine, imageRef, options, async (dir) => {
    const sbom = await runScanner(
      engine,
      SYFT,
      ['docker-archive:/scan/image.tar', '-o', 'spdx-json'],
      dir,
    )
    // NO `--fail-on none`: measured, grype refuses it with `bad --fail-on severity
    // value 'none'` — the accepted values are the five severities. Omitting the flag
    // IS the "never fail on findings" behaviour; this code decides what blocks.
    const raw = await runScanner(
      engine,
      GRYPE,
      ['--output', 'json', 'docker-archive:/scan/image.tar'],
      dir,
    )
    const parsed = JSON.parse(raw) as {
      matches: {
        vulnerability: { id: string; severity: string; fix?: { state?: string } }
        artifact: { name: string; type: string }
      }[]
      descriptor?: { db?: { status?: { built?: string } } }
    }
    const vulnerabilities: Vulnerability[] = parsed.matches.map((m) => ({
      id: m.vulnerability.id,
      severity: m.vulnerability.severity as Vulnerability['severity'],
      package: m.artifact.name,
      packageType: m.artifact.type,
      fixAvailable: m.vulnerability.fix?.state === 'fixed',
    }))
    /**
     * `descriptor.db.status.built`, NOT `descriptor.db.built`. Measured on grype
     * v0.118.0 / database schema v6: the latter is `undefined`, which would make
     * `databaseAgeDays` Infinity, mark EVERY scan stale, and — because a stale scan
     * warns rather than blocks — silently disable the gate for ever while every
     * test still passed.
     *
     * Absent still means stale rather than fresh: "cannot tell how old it is" is
     * not evidence of currency.
     */
    const built = parsed.descriptor?.db?.status?.built
    const databaseAgeDays =
      built === undefined
        ? Number.POSITIVE_INFINITY
        : (Date.now() - Date.parse(built)) / 86_400_000
    const assessed = assessScan({ databaseAgeDays, vulnerabilities })
    return { sbom, vulnerabilities, databaseAgeDays, ...assessed }
  })
}

export class ScanError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint: string,
  ) {
    super(message)
    this.name = 'ScanError'
  }
}

/**
 * The image is handed to the scanner as a **docker-archive on disk**, not as a
 * registry reference, and this is a design decision rather than an implementation
 * detail. Measured, in order:
 *
 *  * Reading it from the registry is impossible. `registry:2` advertises its token
 *    realm as `http://127.0.0.1:7100/…` (it has to: the buildx client on the host is
 *    the thing that exchanges the token), and go-containerregistry — what both Syft
 *    and Grype use — **refuses a realm whose host is a private or link-local
 *    address**, with or without a bearer token supplied.
 *  * Mounting the Docker socket into the scanner would work and is exactly what §12
 *    names as the primary container-escape path. Not done.
 *
 * So the daemon holds the image (it has to anyway — `ensureInstance` runs it), the
 * control plane exports it, and the scanner gets a read-only bind of one file with
 * **no network at all**.
 */
async function withImageArchive<T>(
  engine: EngineClient,
  imageRef: string,
  options: ScanOptions,
  fn: (scanDir: string) => Promise<T>,
): Promise<T> {
  await ensureImagePresent(engine, imageRef, options.registryToken)
  const dir = await mkdtemp(join(tmpdir(), 'mf-scan-'))
  try {
    const res = await engine.stream(`/images/${imageRef}/get`)
    if ((res.statusCode ?? 0) >= 400) {
      throw new ScanError(
        'SCAN_IMAGE_EXPORT_FAILED',
        `the daemon refused to export ${imageRef} (${res.statusCode})`,
        'The image must be in the daemon’s store. A build pushes to the registry ' +
          'without loading locally, so the pull above is what puts it there.',
      )
    }
    await pipeline(res, createWriteStream(join(dir, 'image.tar')))
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function ensureImagePresent(
  engine: EngineClient,
  imageRef: string,
  registryToken?: string,
): Promise<void> {
  if (await engine.get(`/images/${imageRef}/json`)) return
  // `fromImage` and the reference are separate query parameters: the daemon will
  // not accept `repo@sha256:…` as a bare fromImage.
  const at = imageRef.lastIndexOf('@')
  const colon = imageRef.lastIndexOf(':')
  const split = at >= 0 ? at : colon > imageRef.lastIndexOf('/') ? colon : -1
  const from = split >= 0 ? imageRef.slice(0, split) : imageRef
  const tag = split >= 0 ? imageRef.slice(split + 1) : 'latest'
  const res = await engine.stream(
    `/images/create?fromImage=${encodeURIComponent(from)}&tag=${encodeURIComponent(tag)}`,
    'POST',
    undefined,
    registryToken === undefined ? undefined : registryAuthHeader(registryToken),
  )
  // /images/create answers with newline-delimited progress JSON and reports failure
  // IN THE BODY with a 200 status, so the status code proves nothing at all.
  let body = ''
  for await (const chunk of res) body += chunk
  if (body.includes('"error"') || body.includes('"message"')) {
    throw new ScanError(
      'SCAN_IMAGE_PULL_FAILED',
      `cannot pull ${imageRef} for scanning: ${body.slice(-300)}`,
      'A push token is scoped to one repository (§13); the scan needs a pull scope on the ' +
        'same one. `failed to fetch anonymous token` means the credential did not reach the ' +
        'daemon — X-Registry-Auth must be PADDED base64.',
    )
  }
}

/**
 * §21's inventory: "Scanner + SBOM — transient, per build". No Docker socket, and
 * `NetworkMode: 'none'` — a scanner that cannot reach anything cannot phone home
 * with what it found, and it makes the offline behaviour §12 specifies structural
 * rather than configured.
 */
async function runScanner(
  engine: EngineClient,
  image: string,
  args: string[],
  scanDir: string,
): Promise<string> {
  const created = await engine.post<{ Id: string }>('/containers/create', {
    Image: image,
    Cmd: args,
    Env: [
      // Both tools check for a newer release of THEMSELVES on startup. With no
      // network that is an ERROR line on stderr and a wasted DNS timeout per scan.
      'SYFT_CHECK_FOR_APP_UPDATE=false',
      'GRYPE_CHECK_FOR_APP_UPDATE=false',
      // Load-bearing: without it Grype fetches a database on every run, which turns
      // an OFFLINE build into a slow failure rather than the stale-but-recorded
      // success §12 spends a paragraph requiring.
      'GRYPE_DB_AUTO_UPDATE=false',
      'GRYPE_DB_CACHE_DIR=/db',
    ],
    HostConfig: {
      NetworkMode: 'none',
      Binds: [`${scanDir}:/scan:ro`, 'manifest-grype-db:/db:ro'],
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Privileged: false,
      Memory: 1024 * 1024 * 1024,
      RestartPolicy: { Name: 'no' },
    },
  })
  if (!created) {
    throw new ScanError(
      'SCANNER_IMAGE_MISSING',
      `no such image: ${image}`,
      '`make seed` pulls the scanners and their database. They are pinned in infra/images.txt.',
    )
  }
  const id = created.Id
  try {
    await engine.post(`/containers/${id}/start`)
    const wait = await engine.post<{ StatusCode: number }>(`/containers/${id}/wait`)
    // stdout ONLY. Syft and Grype write progress to stderr, and mixing the two
    // produces JSON that does not parse — with an error that blames the parser.
    const stream = await engine.stream(`/containers/${id}/logs?stdout=true&stderr=true`)
    let out = ''
    let err = ''
    for await (const line of demux(stream as unknown as AsyncIterable<Buffer>)) {
      if (line.stream === 'stdout') out += line.text + '\n'
      else err += line.text + '\n'
    }
    if ((wait?.StatusCode ?? 1) !== 0) {
      throw new ScanError(
        'SCAN_FAILED',
        `scanner ${image} exited ${wait?.StatusCode}: ${err.slice(0, 400) || out.slice(0, 400)}`,
        'A bind mount that is not visible to the daemon shows up here as "no source providers ' +
          'were able to resolve the input" — check Docker Desktop’s file sharing settings.',
      )
    }
    return out
  } finally {
    await engine.del(`/containers/${id}?force=true&v=true`)
  }
}
