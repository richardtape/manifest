import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, expect, it } from 'vitest'
import { DEFAULT_BUILD_LIMITS, runBuildxBuild, withEphemeralBuilder } from './builder.js'
import { describeDocker } from './docker-tier.js'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { REPO_ROOT } from './testing.js'

const run = promisify(execFile)
const engine = createEngineClient({ socketPath: resolveSocketPath() })

const contexts: string[] = []

function context(dockerfile: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mf-ctx-'))
  writeFileSync(join(dir, 'Dockerfile'), dockerfile)
  contexts.push(dir)
  return dir
}

/**
 * The REAL issuer's key, because the registry validates against the real
 * certificate. `cwd` is pinned to the repository root: `mint-token.mjs` reads
 * `infra/registry-auth/token.key` relative to it, and `pnpm test` and
 * `pnpm --filter … test` do not agree on what the working directory is.
 *
 * TWO repositories, not one. A `registrytoken` in a docker config is presented
 * verbatim for every scope — there is no per-scope negotiation with the realm the
 * way Task 15's build credential gets — so a token naming only the push target
 * cannot pull the base image the Dockerfile starts from.
 */
const mintFor = async (...repositories: string[]): Promise<string> =>
  (await run('node', ['infra/seed/mint-token.mjs', ...repositories], { cwd: REPO_ROOT }))
    .stdout

describeDocker('the ephemeral rootless builder (§12, D13)', () => {
  afterAll(async () => {
    for (const name of ['mf-builder-t1', 'mf-builder-t2']) {
      await engine.del(`/containers/${name}?force=true&v=true`).catch(() => undefined)
    }
    // One context directory per build, and nothing else removes them (P2 leaked
    // 944 of these before somebody counted).
    for (const dir of contexts) rmSync(dir, { recursive: true, force: true })
  })

  it('is rootless and NOT privileged', async () => {
    await withEphemeralBuilder(engine, 't1', DEFAULT_BUILD_LIMITS, async (name) => {
      const inspect = await engine.get<{
        Config: { User: string }
        HostConfig: { Privileged: boolean; CapAdd: string[] | null }
      }>(`/containers/${name}/json`)
      expect(inspect!.HostConfig.Privileged).toBe(false)
      expect(inspect!.Config.User).toBe('1000:1000')
      // Overriding the entrypoint to write the config file drops the image's own
      // ENTRYPOINT ["rootlesskit","buildkitd"] with it. Measured: without
      // rootlesskit the container exits 1 and this line is what says so.
      const ps = await run('docker', ['exec', name, 'ps', '-o', 'user,comm'])
      expect(ps.stdout).toContain('rootlesskit')
    })
  })

  /**
   * §12's "Bounded", asserted in the DAEMON rather than in the file we wrote.
   *
   * `buildctl debug workers -v` echoes the GC policy back, which makes this a
   * readback rather than a restatement. Measured: a buildkitd with no config of
   * ours reports **four** default rules (512MB/10GB/100GB, none of them `All:
   * true` alone); ours reports exactly one, `All: true` at 4 GiB. So the count is
   * as load-bearing as the number.
   */
  it('puts the cache bound in the RUNNING daemon, not merely in the file', async () => {
    await withEphemeralBuilder(engine, 't1', DEFAULT_BUILD_LIMITS, async (name) => {
      const workers = await run('docker', [
        'exec',
        name,
        'buildctl',
        'debug',
        'workers',
        '-v',
      ])
      const gc = workers.stdout.slice(workers.stdout.indexOf('GC Policy'))
      expect(gc.match(/GC Policy rule#/g)?.length).toBe(1)
      expect(gc).toMatch(/All:\s+true/)
      // 4GB as buildkitd prints it back: 4 * 1024^3 bytes rendered in decimal GB.
      expect(gc).toMatch(/Maximum used space:\s+4\.29\d*GB/)
    })
  })

  it('is destroyed even when the build throws — the timeout mechanism', async () => {
    await expect(
      withEphemeralBuilder(engine, 't2', DEFAULT_BUILD_LIMITS, async () => {
        throw new Error('simulated build failure')
      }),
    ).rejects.toThrow('simulated build failure')
    expect(await engine.get('/containers/mf-builder-t2/json')).toBeUndefined()
  })

  it('CANNOT reach the public internet, and CAN reach the mirror', async () => {
    await withEphemeralBuilder(engine, 't1', DEFAULT_BUILD_LIMITS, async (name) => {
      const egress = await run('docker', [
        'exec',
        name,
        'wget',
        '-q',
        '-T4',
        '-O-',
        'https://registry.npmjs.org/',
      ]).then(
        () => 'REACHED',
        () => 'BLOCKED',
      )
      expect(egress).toBe('BLOCKED')
      const mirror = await run('docker', [
        'exec',
        name,
        'wget',
        '-q',
        '-T4',
        '-O-',
        'http://manifest-verdaccio:4873/-/ping',
      ]).then(
        () => 'REACHED',
        () => 'BLOCKED',
      )
      expect(mirror).toBe('REACHED')
    })
  })

  it('builds and pushes, and yields a digest', async () => {
    const dir = context(
      'FROM manifest-registry:5000/base/alpine:3.22\nRUN echo built > /proof.txt\n',
    )
    const token = await mintFor('base/alpine', 'local/buildertest')
    const result = await withEphemeralBuilder(
      engine,
      't1',
      DEFAULT_BUILD_LIMITS,
      (name) =>
        runBuildxBuild({
          builder: name,
          contextDir: dir,
          imageRef: 'manifest-registry:5000/local/buildertest:probe',
          registryToken: token,
          registryHost: 'manifest-registry:5000',
          timeoutMs: DEFAULT_BUILD_LIMITS.timeoutMs,
        }),
    )
    expect(result.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  // The same control as Task 9, through the tool that actually builds. Task 9
  // proved it for `docker push`; this proves it for BuildKit, which pushes by a
  // different code path and fetches its token as a different client_id.
  it('REFUSES to push to a repository the token does not name', async () => {
    const dir = context('FROM manifest-registry:5000/base/alpine:3.22\nRUN true\n')
    const token = await mintFor('base/alpine', 'local/buildertest')
    await expect(
      withEphemeralBuilder(engine, 't1', DEFAULT_BUILD_LIMITS, (name) =>
        runBuildxBuild({
          builder: name,
          contextDir: dir,
          imageRef: 'manifest-registry:5000/local/not-mine:probe',
          registryToken: token,
          registryHost: 'manifest-registry:5000',
          timeoutMs: DEFAULT_BUILD_LIMITS.timeoutMs,
        }),
      ),
    ).rejects.toThrow(/insufficient_scope|authorization failed/)
  })
})
