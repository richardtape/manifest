import type { DriverCapabilities, InstanceSpec } from '../driver.js'
import type { EngineClient } from './engine.js'

export interface HardeningInput {
  resources: InstanceSpec['resources']
  networkName: string
  /** §12: the resolver is per-container, not a network setting. dnsmasq-A's IP. */
  dnsServer: string
  diskQuotaEnforceable: boolean
}

/**
 * §12's baseline, as an Engine API HostConfig. Every value here was read back off a
 * real container in S1 and is read back again by the Docker-tier test beside this
 * file — the request body is what we asked for, and only the readback is evidence.
 */
export function hardenedHostConfig(input: HardeningInput): Record<string, unknown> {
  const { resources } = input
  return {
    CapDrop: ['ALL'],
    // The "minimal, documented add list" §12 allows. It is empty: nothing the
    // blueprint runs needs a capability, and an empty list is the documentation.
    CapAdd: [],
    SecurityOpt: ['no-new-privileges'],
    ReadonlyRootfs: true,
    Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=16m' },
    PidsLimit: resources.pids,
    Memory: resources.memoryMi * 1024 * 1024,
    NanoCpus: Math.round(resources.cpu * 1_000_000_000),
    Privileged: false,
    // §11 has no silent retry: a crash becomes `failed` and an Event, not a loop.
    RestartPolicy: { Name: 'no' },
    NetworkMode: input.networkName,
    Dns: [input.dnsServer],
    // Set ONLY where it is honoured. A quota the daemon ignores still appears in
    // `docker inspect`, where the next reader takes it for enforcement.
    ...(input.diskQuotaEnforceable
      ? { StorageOpt: { size: `${resources.diskMi}m` } }
      : {}),
  }
}

/**
 * What the daemon actually provides. Both answers feed `capabilities()` directly, so
 * the reported capability and the flag we set cannot disagree.
 */
export async function detectHostCapabilities(
  engine: EngineClient,
): Promise<{ userns: boolean; diskQuota: boolean }> {
  const info = await engine.get<{
    SecurityOptions?: string[]
    Driver?: string
    DriverStatus?: [string, string][]
  }>('/info')
  const security = info?.SecurityOptions ?? []
  const backing =
    (info?.DriverStatus ?? []).find(([k]) => k === 'Backing Filesystem')?.[1] ?? ''
  return {
    userns: security.some((o) => o.startsWith('name=userns')),
    // Project quotas need overlay2 over xfs with pquota, or btrfs/zfs. Docker
    // Desktop reports `overlayfs` (the containerd snapshotter) and no backing
    // filesystem, so this is false here — measured, not assumed.
    diskQuota:
      (info?.Driver === 'overlay2' && backing === 'xfs') ||
      info?.Driver === 'btrfs' ||
      info?.Driver === 'zfs',
  }
}

/**
 * Adding a field to DriverCapabilities without adding it here is a COMPILE error.
 * This exists so that the shared contract suite in `runtime/driver-contract.ts`
 * never has to be edited to pin a new capability — P3 imports that file unchanged.
 */
export const REQUIRED_CAPABILITY_KEYS: Record<keyof DriverCapabilities, true> = {
  enforcesEgress: true,
  isolationLevel: true,
  remoteTarget: true,
  supportsExec: true,
  supportsSnapshot: true,
  enforcesUserNamespaceRemapping: true,
  enforcesDiskQuota: true,
}
