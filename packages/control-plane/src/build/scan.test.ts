import { describe, expect, it } from 'vitest'
import { STALENESS_THRESHOLD_DAYS, assessScan, type Vulnerability } from './scan.js'

const BASE = new Set(['sha256:base1', 'sha256:base2'])

const finding = (
  severity: Vulnerability['severity'],
  overrides: Partial<Vulnerability> = {},
): Vulnerability => ({
  id: 'CVE-2026-1',
  severity,
  package: 'left-pad',
  packageType: 'npm',
  layerIds: ['sha256:app1'],
  fixAvailable: true,
  ...overrides,
})

const critical = [finding('Critical')]

describe('scan assessment (§12)', () => {
  /**
   * §12's gate blocks on what a rebuild can CLEAR, which is the same principle the
   * base-image split already applies one level up. A Critical with no published fix
   * cannot be cleared by any action the person deploying can take, so blocking on it
   * does not make the app safer — it makes the app undeployable.
   *
   * MEASURED, and this is why the rule changed: `passport-ubcshib@0.1.6` — the
   * library §9 builds the whole platform's identity on — depends on `passport-saml`,
   * which is npm-deprecated with a CRITICAL signature-verification advisory
   * (GHSA-4mxg-3p6v-xgq3) at range `*`, and on `@xmldom/xmldom@0.7.13` with five
   * HIGHs. None has a fix. The old rule blocked EVERY CWL application, which is
   * every application this platform exists to deploy. Rich's call, 2026-09-08.
   *
   * The gate keeps its teeth for what it was built for: a hallucinated or malicious
   * dependency, and any finding somebody could actually act on.
   */
  it('blocks a critical the app can fix, and only that one', () => {
    const result = assessScan({
      databaseAgeDays: 1,
      vulnerabilities: [
        finding('Critical', { id: 'CVE-FIXABLE', fixAvailable: true }),
        finding('Critical', { id: 'CVE-NO-FIX', fixAvailable: false }),
      ],
      baseLayerIds: BASE,
    })
    expect(result.blocked).toBe(true)
    expect(result.appFindings.map((v) => v.id)).toEqual(['CVE-FIXABLE'])
    expect(result.unfixableFindings.map((v) => v.id)).toEqual(['CVE-NO-FIX'])
  })

  it('does not block on a critical with no fix, and says so', () => {
    const result = assessScan({
      databaseAgeDays: 1,
      vulnerabilities: [
        finding('Critical', {
          id: 'GHSA-4mxg-3p6v-xgq3',
          package: 'passport-saml',
          fixAvailable: false,
        }),
        finding('High', {
          id: 'GHSA-2v35-w6hq-6mfw',
          package: '@xmldom/xmldom',
          fixAvailable: false,
        }),
      ],
      baseLayerIds: BASE,
    })
    expect(result.blocked).toBe(false)
    expect(result.appFindings).toEqual([])
    expect(result.unfixableFindings).toHaveLength(2)
    // Recorded on the Release and named in the reason — never silently dropped.
    // "not blocked" and "not reported" are different things and §20's fleet-wide
    // rebuild is what consumes the difference.
    expect(result.reason).toMatch(/no published fix/i)
    expect(result.reason).toContain('passport-saml')
  })

  it('still attributes an unfixable BASE-image finding to the base, not the app', () => {
    // The two rules are independent and both apply. A finding can be the base's
    // AND unfixable; it must not be counted twice or reported as the app's.
    const result = assessScan({
      databaseAgeDays: 1,
      vulnerabilities: [
        finding('Critical', {
          id: 'CVE-BASE',
          layerIds: ['sha256:base1'],
          fixAvailable: false,
        }),
      ],
      baseLayerIds: BASE,
    })
    expect(result.blocked).toBe(false)
    expect(result.baseImageFindings.map((v) => v.id)).toEqual(['CVE-BASE'])
    expect(result.unfixableFindings).toEqual([])
  })

  it('blocks on a critical finding with a fresh database', () => {
    const result = assessScan({
      databaseAgeDays: 1,
      vulnerabilities: critical,
      baseLayerIds: BASE,
    })
    expect(result.blocked).toBe(true)
    expect(result.stale).toBe(false)
  })

  it('passes a clean scan with a fresh database', () => {
    const result = assessScan({
      databaseAgeDays: 1,
      vulnerabilities: [],
      baseLayerIds: BASE,
    })
    expect(result.blocked).toBe(false)
    expect(result.stale).toBe(false)
  })

  // The half that keeps C1 true: an offline laptop must still be able to deploy.
  it('WARNS rather than blocks once the database is older than 7 days', () => {
    const result = assessScan({
      databaseAgeDays: 8,
      vulnerabilities: critical,
      baseLayerIds: BASE,
    })
    expect(result.stale).toBe(true)
    expect(result.blocked).toBe(false)
    expect(result.reason).toContain('8')
  })

  it('puts the threshold at exactly 7 days, not 7-ish', () => {
    expect(STALENESS_THRESHOLD_DAYS).toBe(7)
    const at = (databaseAgeDays: number) =>
      assessScan({ databaseAgeDays, vulnerabilities: critical, baseLayerIds: BASE })
        .blocked
    expect(at(7)).toBe(true)
    expect(at(7.01)).toBe(false)
  })

  // The other half: a stale scan must never be READ as a clean one. A clean result
  // from a stale database still carries `stale: true` so the Release records it.
  it('marks a CLEAN scan from a stale database as stale too', () => {
    const result = assessScan({
      databaseAgeDays: 30,
      vulnerabilities: [],
      baseLayerIds: BASE,
    })
    expect(result.blocked).toBe(false)
    expect(result.stale).toBe(true)
    expect(result.reason).toMatch(/stale/i)
  })

  it('ignores low and medium severities', () => {
    expect(
      assessScan({
        databaseAgeDays: 1,
        vulnerabilities: [finding('Medium')],
        baseLayerIds: BASE,
      }).blocked,
    ).toBe(false)
  })
})

/**
 * MEASURED, and the reason the rule is about LAYERS rather than package ecosystems.
 *
 * `alpine:3.22` carries 4 Critical and 14 High, all of them `apk`. But
 * `node:22-alpine` — what faculty apps actually run on — carries those **plus** 1
 * Critical and 10 High `npm` findings, every one inside
 * `/usr/local/lib/node_modules/npm/`: npm's own bundled dependency tree, shipped in
 * the base image. A rule that called OS packages the platform's and npm the app's
 * would read as correct and block every build there is.
 *
 * The base image is platform-owned and digest-pinned by the blueprint (D13), so no
 * rebuild of an app can clear any of them; §20 makes the fleet-wide rebuild the
 * remedy, in Phase 4+.
 */
describe('who owns a finding (§20)', () => {
  const baseFinding = finding('Critical', {
    package: 'libcrypto3',
    packageType: 'apk',
    layerIds: ['sha256:base1'],
  })

  it('does not block on a finding the base image already carried', () => {
    const result = assessScan({
      databaseAgeDays: 1,
      vulnerabilities: [baseFinding],
      baseLayerIds: BASE,
    })
    expect(result.blocked).toBe(false)
    expect(result.baseImageFindings).toHaveLength(1)
    expect(result.appFindings).toHaveLength(0)
    expect(result.reason).toMatch(/base image/i)
  })

  it('does not block on a BUNDLED NPM package in the base image either', () => {
    const npmInBase = finding('Critical', { package: 'tar', layerIds: ['sha256:base2'] })
    expect(
      assessScan({ databaseAgeDays: 1, vulnerabilities: [npmInBase], baseLayerIds: BASE })
        .blocked,
    ).toBe(false)
  })

  it('still blocks the app half of a mixed scan', () => {
    const result = assessScan({
      databaseAgeDays: 1,
      vulnerabilities: [
        baseFinding,
        finding('High', { id: 'CVE-2026-2', package: 'tar-fs' }),
      ],
      baseLayerIds: BASE,
    })
    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('CVE-2026-2')
  })

  // A package present in BOTH the base and an app layer is the app's: the app layer
  // is what put that copy of it there, and a rebuild can change it.
  it('treats a finding spanning a base and an app layer as the app’s', () => {
    const spanning = finding('High', { layerIds: ['sha256:base1', 'sha256:app1'] })
    const result = assessScan({
      databaseAgeDays: 1,
      vulnerabilities: [spanning],
      baseLayerIds: BASE,
    })
    expect(result.blocked).toBe(true)
  })

  /**
   * FAILS CLOSED. A scan that cannot tell what this build added does not get to
   * call a finding somebody else's problem — and it says so, so the Release records
   * which of the two happened.
   */
  it('attributes EVERYTHING to the app when the base image is unknown', () => {
    const result = assessScan({ databaseAgeDays: 1, vulnerabilities: [baseFinding] })
    expect(result.baseImageKnown).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.reason).toMatch(/not identified/i)
  })

  it('records the base image findings even while not blocking on them', () => {
    const result = assessScan({
      databaseAgeDays: 1,
      vulnerabilities: [baseFinding],
      baseLayerIds: BASE,
    })
    expect(result.baseImageFindings.map((v) => v.package)).toEqual(['libcrypto3'])
  })
})
