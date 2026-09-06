import { afterAll, beforeAll, expect, it } from 'vitest'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { detectHostCapabilities, hardenedHostConfig } from './hardening.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const NAME = 'mf-hardening-probe-staging-app'

async function startProbe(overrides: Record<string, unknown> = {}): Promise<void> {
  await engine.del(`/containers/${NAME}?force=true&v=true`)
  const hostConfig = {
    ...hardenedHostConfig({
      resources: { cpu: 0.5, memoryMi: 256, pids: 128, diskMi: 2048 },
      networkName: 'bridge',
      dnsServer: '127.0.0.11',
      diskQuotaEnforceable: false,
    }),
    ...overrides,
  }
  await engine.post(`/containers/create?name=${NAME}`, {
    // alpine:3.22, NOT 3.20. P1's infra/images.txt mirrors 3.22 into the local
    // registry and `make seed` pulls it; 3.20 is in neither, so this step would
    // fail the moment the network is off — which is this plan's own demo.
    Image: 'alpine:3.22',
    User: '10001:10001',
    Cmd: ['sleep', '120'],
    HostConfig: hostConfig,
  })
  await engine.post(`/containers/${NAME}/start`)
}

const readFile = async (path: string): Promise<string> => {
  const exec = await engine.post<{ Id: string }>(`/containers/${NAME}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: ['cat', path],
  })
  const res = await engine.stream(`/exec/${exec!.Id}/start`, 'POST', {
    Detach: false,
    Tty: true,
  })
  let out = ''
  for await (const chunk of res) out += String(chunk)
  return out
}

describeDocker('§12 hardening, read back off a real container', () => {
  // Started ONCE, in a hook, not as a side effect of the first `it`. Three tests
  // sharing a container created by the first of them is the ordering dependence
  // that produced five of P2's 27 defects; a hook also fails all three loudly if
  // the container cannot start, instead of failing two of them confusingly.
  beforeAll(async () => {
    await startProbe()
  })

  afterAll(async () => {
    await engine.del(`/containers/${NAME}?force=true&v=true`)
  })

  it('drops every capability, forbids privilege escalation and keeps seccomp on', async () => {
    const status = await readFile('/proc/1/status')
    // CapBnd — the BOUNDING set — is what CapDrop:["ALL"] actually clears, and it
    // is the only field here that distinguishes a hardened container from an
    // unhardened one. Measured on this machine, alpine:3.22, Docker 29.7.2:
    //   --cap-drop ALL --user 10001  -> CapBnd 0000000000000000
    //   --cap-add NET_ADMIN --user 10001 -> CapBnd 00000000a80435fb
    // CapEff is 0 for ANY non-root process, so asserting it proves only that the
    // probe is not root — it passes identically with the baseline removed.
    expect(status).toMatch(/CapBnd:\s+0000000000000000/)
    // Kept as a second, weaker assertion: the process is genuinely unprivileged.
    expect(status).toMatch(/CapEff:\s+0000000000000000/)
    expect(status).toMatch(/NoNewPrivs:\s+1/)
    // 2 = filtered by a seccomp profile. 0 would mean unconfined.
    expect(status).toMatch(/Seccomp:\s+2/)
  })

  it('runs non-root with a read-only root and a writable /tmp', async () => {
    const inspect = await engine.get<{
      Config: { User: string }
      HostConfig: {
        ReadonlyRootfs: boolean
        PidsLimit: number
        Memory: number
        Privileged: boolean
      }
    }>(`/containers/${NAME}/json`)
    expect(inspect!.Config.User).toBe('10001:10001')
    expect(inspect!.HostConfig.ReadonlyRootfs).toBe(true)
    expect(inspect!.HostConfig.PidsLimit).toBe(128)
    expect(inspect!.HostConfig.Memory).toBe(268_435_456)
    expect(inspect!.HostConfig.Privileged).toBe(false)
  })

  it('reports the two baseline items this daemon cannot deliver', async () => {
    const caps = await detectHostCapabilities(engine)
    // Not asserted as `false`: this is a fact about the machine, and on a Linux
    // host with userns-remap and xfs pquota both would be true. What must hold is
    // that the driver REPORTS what it found, which Task 15 pins against this.
    expect(typeof caps.userns).toBe('boolean')
    expect(typeof caps.diskQuota).toBe('boolean')
    // On Docker Desktop, `docker info` names only seccomp and cgroupns.
    if (process.platform === 'darwin') expect(caps.userns).toBe(false)
  })
})
