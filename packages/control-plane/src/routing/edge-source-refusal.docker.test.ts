import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'

const run = promisify(execFile)

/**
 * §12 and §21: **the edge's `@outside` refusal, and the proof that removing it is what
 * changes the answer.**
 *
 * WHY THIS SUITE EXISTS. `scripts/verify.sh` already asserts the refusal three ways and
 * S6 probe 15 asserts it a fourth, all of them green — but every one of those is the
 * POSITIVE direction. The one negative control P5a's acceptance specified, *"remove the
 * two `@outside` lines from `infra/caddy/Caddyfile`, `make up`, and watch `make verify`
 * fail"*, was never watched: it weakens the running edge for the length of the run, and
 * the session that tried it had the edit and the reload refused as *[Security Weaken]*
 * (ORIENTATION §8, P5a sitting 12 control (a)). So the causal link — that the matcher is
 * what refuses, rather than something else in the stack — stayed unproven.
 *
 * **This suite proves it without touching the running edge.** It starts a THROWAWAY
 * `manifest-caddy:local` on the platform network with a minimal config, twice: once with
 * the matcher and once without. `manifest-caddy` is never reloaded, `infra/caddy/Caddyfile`
 * is never edited, and nothing here can leave the platform weakened, because the only
 * config that ever omits the matcher belongs to a container this file created and removes.
 *
 * WHY A TEST RATHER THAN A DOCUMENTED MANUAL RUN. The manual procedure proves the link
 * once. This re-proves it on every `pnpm test:docker`, including after the next Caddyfile
 * refactor — and this repository already has the evidence that a manual step does not get
 * repeated: the offline acceptance has not been re-run since 2026-09-05 (`RUNBOOK.md`).
 *
 * WHAT IT DOES NOT CLAIM. It proves the MECHANISM: that `not remote_ip <gateway>/32`
 * refuses a container and admits the gateway. It does not re-prove that the real
 * Caddyfile's block is wired correctly — `verify.sh`'s three checks and S6 probe 15 do
 * that against the real edge, and P5a `[M2]` measured that `caddy adapt` compiles the real
 * block to a subroute whose FIRST route is this matcher.
 */
const NET = 'manifest-platform'
const IMAGE = 'manifest-caddy:local'
const PROBE = 'curlimages/curl:8.11.1'
/** Inside the 7100–7199 block, and not one of `infra/lib/common.sh`'s assigned ports. */
const HOST_PORT = 7131
const EDGE = 'manifest-edge-refusal-probe'
const REFUSAL = 'manifest: the control plane is not reachable from this network'
const ALLOWED = 'probe-edge: forwarded'

let workdir: string
let gateway: string

/**
 * The same two lines the real Caddyfile carries, over a `respond` that stands in for the
 * `reverse_proxy` — what is under test is the matcher, and a real upstream would add a
 * second reason for a request to fail.
 */
function config(withRefusal: boolean): string {
  const refusal = withRefusal
    ? `\t\t@outside not remote_ip ${gateway}/32\n\t\trespond @outside "${REFUSAL}" 403\n`
    : ''
  return `{\n\tadmin off\n\tauto_https off\n}\n\n:80 {\n\troute {\n${refusal}\t\trespond "${ALLOWED}" 200\n\t}\n}\n`
}

async function startEdge(withRefusal: boolean): Promise<void> {
  await writeFile(join(workdir, 'Caddyfile'), config(withRefusal), 'utf8')
  await run('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    EDGE,
    '--network',
    NET,
    '-p',
    `127.0.0.1:${HOST_PORT}:80`,
    '-v',
    `${join(workdir, 'Caddyfile')}:/etc/caddy/Caddyfile:ro`,
    IMAGE,
  ])
  // Caddy is serving once it answers at all; the assertions below read the BODY.
  for (let i = 0; i < 50; i++) {
    try {
      await run('curl', ['-sS', '-o', '/dev/null', `http://127.0.0.1:${HOST_PORT}/`])
      return
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  throw new Error(`the throwaway edge never answered on ${HOST_PORT}`)
}

async function stopEdge(): Promise<void> {
  await run('docker', ['rm', '-f', EDGE]).catch(() => undefined)
}

/**
 * From a container ON the platform network — a source the matcher must refuse. Returns
 * the BODY with its status, never the status alone: this platform's own lesson is that a
 * status assertion cannot tell a refusal from a fallback (`routes.docker.test.ts`).
 */
async function fromContainer(): Promise<string> {
  const { stdout } = await run('docker', [
    'run',
    '--rm',
    '--network',
    NET,
    PROBE,
    '-sS',
    '-w',
    ' [%{http_code}]',
    `http://${EDGE}:80/`,
  ])
  return stdout.trim()
}

/** From the HOST, which arrives as the network's gateway — the source the matcher admits. */
async function fromHost(): Promise<string> {
  const { stdout } = await run('curl', [
    '-sS',
    '-w',
    ' [%{http_code}]',
    `http://127.0.0.1:${HOST_PORT}/`,
  ])
  return stdout.trim()
}

describeDocker("the edge's @outside refusal (§12) — and what happens without it", () => {
  beforeAll(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'manifest-edge-refusal-'))
    const { stdout } = await run('docker', [
      'network',
      'inspect',
      NET,
      '--format',
      '{{(index .IPAM.Config 0).Gateway}}',
    ])
    gateway = stdout.trim()
    expect(gateway, `${NET} must exist — run \`make up\``).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    await stopEdge()
  }, 120_000)

  afterAll(async () => {
    await stopEdge()
    if (workdir) await rm(workdir, { recursive: true, force: true })
  })

  it('WITH the matcher, a container on the platform network is refused', async () => {
    await startEdge(true)
    expect(await fromContainer()).toBe(`${REFUSAL} [403]`)
  }, 120_000)

  it('WITH the matcher, the gateway is still forwarded — it does not refuse everyone', async () => {
    // The positive control. Without it, a config that refused every source would pass
    // the assertion above, which is the shape S6's header warns about.
    expect(await fromHost()).toBe(`${ALLOWED} [200]`)
    await stopEdge()
  }, 120_000)

  it('WITHOUT the matcher, THE SAME container reaches it — the matcher is what refuses', async () => {
    // THE NEGATIVE CONTROL, and the reason this file exists. Same image, same network,
    // same probe, same request: the only difference is the two lines.
    await startEdge(false)
    expect(await fromContainer()).toBe(`${ALLOWED} [200]`)
  }, 120_000)
})
