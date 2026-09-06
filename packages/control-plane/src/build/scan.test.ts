import { describe, expect, it } from 'vitest'
import {
  PLATFORM_OWNED_PACKAGE_TYPES,
  STALENESS_THRESHOLD_DAYS,
  assessScan,
  type Vulnerability,
} from './scan.js'

const app = (
  severity: Vulnerability['severity'],
  overrides: Partial<Vulnerability> = {},
): Vulnerability => ({
  id: 'CVE-2026-1',
  severity,
  package: 'left-pad',
  packageType: 'npm',
  fixAvailable: true,
  ...overrides,
})

const critical = [app('Critical')]

describe('scan assessment (§12)', () => {
  it('blocks on a critical finding with a fresh database', () => {
    const result = assessScan({ databaseAgeDays: 1, vulnerabilities: critical })
    expect(result.blocked).toBe(true)
    expect(result.stale).toBe(false)
  })

  it('passes a clean scan with a fresh database', () => {
    const result = assessScan({ databaseAgeDays: 1, vulnerabilities: [] })
    expect(result.blocked).toBe(false)
    expect(result.stale).toBe(false)
  })

  // The half that keeps C1 true: an offline laptop must still be able to deploy.
  it('WARNS rather than blocks once the database is older than 7 days', () => {
    const result = assessScan({ databaseAgeDays: 8, vulnerabilities: critical })
    expect(result.stale).toBe(true)
    expect(result.blocked).toBe(false)
    expect(result.reason).toContain('8')
  })

  it('puts the threshold at exactly 7 days, not 7-ish', () => {
    expect(STALENESS_THRESHOLD_DAYS).toBe(7)
    expect(assessScan({ databaseAgeDays: 7, vulnerabilities: critical }).blocked).toBe(
      true,
    )
    expect(assessScan({ databaseAgeDays: 7.01, vulnerabilities: critical }).blocked).toBe(
      false,
    )
  })

  // The other half: a stale scan must never be READ as a clean one. A clean result
  // from a stale database still carries `stale: true` so the Release records it.
  it('marks a CLEAN scan from a stale database as stale too', () => {
    const result = assessScan({ databaseAgeDays: 30, vulnerabilities: [] })
    expect(result.blocked).toBe(false)
    expect(result.stale).toBe(true)
    expect(result.reason).toMatch(/stale/i)
  })

  it('ignores low and medium severities', () => {
    expect(
      assessScan({ databaseAgeDays: 1, vulnerabilities: [app('Medium')] }).blocked,
    ).toBe(false)
  })

  /**
   * MEASURED, and the reason this rule exists at all. `alpine:3.22` scanned against
   * a database built the same day reports **4 Critical and 14 High**, every one of
   * them an `apk` package (`libcrypto3`, `libssl3`) fixed only by a newer base
   * image. The base image is platform-owned and digest-pinned by the blueprint
   * (D13), so no rebuild of an app can clear one — a blanket block on Critical+High
   * would have made the platform unable to deploy anything at all, on day one,
   * while looking like a working security gate.
   *
   * §20 says exactly this: "a vulnerability in the blueprint is a vulnerability in
   * every app", and its remedy is the fleet-wide rebuild, which is Phase 4+.
   */
  it('does NOT block on a base-image OS package, which no app rebuild can fix', () => {
    const osFinding = [app('Critical', { package: 'libcrypto3', packageType: 'apk' })]
    const result = assessScan({ databaseAgeDays: 1, vulnerabilities: osFinding })
    expect(result.blocked).toBe(false)
    // Recorded, never hidden: the Release carries it and §20's fleet rebuild acts on it.
    expect(result.reason).toMatch(/base image|platform-owned/i)
    expect(result.reason).toContain('1')
  })

  it('still blocks the app half of a mixed scan', () => {
    const result = assessScan({
      databaseAgeDays: 1,
      vulnerabilities: [
        app('Critical', { package: 'libssl3', packageType: 'apk' }),
        app('High', { id: 'CVE-2026-2', package: 'tar-fs' }),
      ],
    })
    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('CVE-2026-2')
  })

  it('names the OS package managers explicitly, so the rule is readable', () => {
    expect([...PLATFORM_OWNED_PACKAGE_TYPES].sort()).toEqual(['apk', 'deb', 'rpm'])
  })
})
