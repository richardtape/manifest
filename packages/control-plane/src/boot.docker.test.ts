import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { describeDocker, REPO_ROOT } from './runtime/testing.js'

const run = promisify(execFile)

/**
 * THE DEFECT THIS PROJECT HAS SHIPPED TWICE.
 *
 * P2 finished with nothing that had ever executed `src/index.ts`. P3's own
 * self-review then found the same shape in P3: no task wired the Docker driver
 * into the boot entry point, so `make demo` — the plan's entire acceptance —
 * would have passed against the in-memory fake, which answers every call happily.
 *
 * So this boots the REAL entry point, the compiled one, and reads back the single
 * fact the file decides. It asserts the VALUE rather than the presence of a line:
 * "expected no match" cannot tell a fake driver from a log line that never
 * printed, and the log line not printing is exactly what happened when it went
 * through `app.log.info` under `logger: false`.
 *
 * Verified to fail on demand 2026-09-06: putting `createFakeDriver()` back prints
 * `"driver":"fake"` and the control plane comes up and serves 401 on /auth/me
 * exactly as before — indistinguishable at every level above this file.
 */
describeDocker('the boot entry point', () => {
  it('constructs the DOCKER driver, not the fake one', async () => {
    await run('pnpm', ['--filter', '@manifest/control-plane', 'build'], {
      cwd: REPO_ROOT,
    })

    const child = spawn('node', ['packages/control-plane/dist/index.js'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        MANIFEST_ENV: 'development',
        MANIFEST_DEV_AUTH: '1',
        // A port of its own: the developer's own control plane may be on 7100.
        MANIFEST_PORT: '7188',
        MANIFEST_SESSION_SECRET: 'x'.repeat(32),
        MANIFEST_MASTER_SECRET: 'm'.repeat(32),
        MANIFEST_BLUEPRINTS_ROOT: `${REPO_ROOT}blueprints`,
        MANIFEST_REPOS_ROOT: `${REPO_ROOT}.manifest/repos`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      const line = await new Promise<string>((resolve, reject) => {
        let out = ''
        const timer = setTimeout(
          () => reject(new Error(`no boot line in 60s; output was:\n${out}`)),
          60_000,
        )
        const onData = (chunk: Buffer): void => {
          out += chunk.toString('utf8')
          const match = /\{"driver":"[^"]*"[^\n]*\}/.exec(out)
          if (match) {
            clearTimeout(timer)
            resolve(match[0])
          }
        }
        child.stdout.on('data', onData)
        child.stderr.on('data', onData)
        child.on('error', reject)
        child.on('exit', (code) => {
          clearTimeout(timer)
          reject(new Error(`the control plane exited with ${code}:\n${out}`))
        })
      })
      const boot = JSON.parse(line)
      expect(boot.driver).toBe('docker')
      // §12's scrub, asserted at the ONLY place it can be: the real process.
      // `runtime/docker/builder.ts` spawns `docker` with `{ ...process.env }`,
      // so anything still in the environment at that moment reaches the build —
      // and a build log is a place secrets end up. This spawn sets
      // MANIFEST_SESSION_SECRET and MANIFEST_MASTER_SECRET explicitly, so a
      // scrub that ran removed at least those two.
      expect(boot.secretsScrubbed).toBeGreaterThanOrEqual(2)
    } finally {
      child.kill('SIGTERM')
    }
  }, 120_000)
})
