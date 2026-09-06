import { describe, expect, it } from 'vitest'
import type { DriverCapabilities } from '../driver.js'
import { REQUIRED_CAPABILITY_KEYS, hardenedHostConfig } from './hardening.js'

const input = {
  resources: { cpu: 0.5, memoryMi: 256, pids: 128, diskMi: 2048 },
  networkName: 'mf-chem-labs-staging-net',
  dnsServer: '10.89.0.53',
  diskQuotaEnforceable: false,
}

describe('§12 container hardening baseline', () => {
  it('produces exactly the flag set S1 measured as enforcing', () => {
    const hc = hardenedHostConfig(input)
    expect(hc.CapDrop).toEqual(['ALL'])
    expect(hc.CapAdd).toEqual([])
    expect(hc.SecurityOpt).toEqual(['no-new-privileges'])
    expect(hc.ReadonlyRootfs).toBe(true)
    expect(hc.Tmpfs).toEqual({ '/tmp': 'rw,noexec,nosuid,size=16m' })
    expect(hc.PidsLimit).toBe(128)
    expect(hc.Memory).toBe(256 * 1024 * 1024)
    expect(hc.NanoCpus).toBe(500_000_000)
    expect(hc.Privileged).toBe(false)
    expect(hc.NetworkMode).toBe('mf-chem-labs-staging-net')
    expect(hc.Dns).toEqual(['10.89.0.53'])
  })

  // §12: "the default seccomp profile, never unconfined". Omitting the option IS
  // the default profile; naming `seccomp=unconfined` is the mistake, and it would
  // arrive as an extra SecurityOpt entry.
  it('never disables seccomp or apparmor', () => {
    const opts = hardenedHostConfig(input).SecurityOpt as string[]
    expect(opts.some((o) => o.includes('unconfined'))).toBe(false)
  })

  // §11: "Failures back off exponentially and surface as an Event; there is no
  // silent retry." A restart policy would turn a crash-loop into a healthy-looking
  // container that never serves.
  it('sets no restart policy, so a crash surfaces instead of looping', () => {
    expect(hardenedHostConfig(input).RestartPolicy).toEqual({ Name: 'no' })
  })

  it('omits StorageOpt when the daemon cannot enforce a disk quota', () => {
    expect(hardenedHostConfig(input).StorageOpt).toBeUndefined()
  })

  it('sets StorageOpt only where it is actually honoured', () => {
    const hc = hardenedHostConfig({ ...input, diskQuotaEnforceable: true })
    expect(hc.StorageOpt).toEqual({ size: '2048m' })
  })

  // The drift guard that replaces editing the shared contract suite. Adding a field
  // to DriverCapabilities without adding it here is a COMPILE error, not a silent
  // omission that a capabilities() consumer would read as "enforced".
  it('enumerates every DriverCapabilities key', () => {
    const keys = Object.keys(REQUIRED_CAPABILITY_KEYS).sort()
    expect(keys).toEqual(
      [
        'enforcesDiskQuota',
        'enforcesEgress',
        'enforcesUserNamespaceRemapping',
        'isolationLevel',
        'remoteTarget',
        'supportsExec',
        'supportsSnapshot',
      ].sort(),
    )
    const _typecheck: Record<keyof DriverCapabilities, true> = REQUIRED_CAPABILITY_KEYS
    expect(_typecheck).toBe(REQUIRED_CAPABILITY_KEYS)
  })
})
