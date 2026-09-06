import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, expect, it } from 'vitest'
import { describeDocker } from './docker-tier.js'

const run = promisify(execFile)
const created: string[] = []

/**
 * A docker config carrying a pre-minted bearer token. NOTE the cli-plugins symlink:
 * setting DOCKER_CONFIG moves CLI plugin discovery with it, and without this line
 * `docker buildx` fails with `unknown flag: --builder`, which reads as a buildx
 * version problem and is not one.
 */
function dockerConfigWith(token: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mf-dockercfg-'))
  created.push(dir)
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({ auths: { '127.0.0.1:7107': { registrytoken: token } } }),
  )
  symlinkSync(join(homedir(), '.docker', 'cli-plugins'), join(dir, 'cli-plugins'))
  return dir
}

// Every temp directory this file makes is removed. P2 shipped a helper that
// mkdtemp'd per test with no teardown and accumulated 944 directories in one
// afternoon; it also violates CLAUDE.md's "leave the machine as you found it".
afterAll(async () => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
  await run('docker', ['rmi', '-f', '127.0.0.1:7107/local/scopetest:probe']).catch(
    () => undefined,
  )
  await run('docker', ['rmi', '-f', '127.0.0.1:7107/local/someone-else:probe']).catch(
    () => undefined,
  )
})

const mintFor = async (repository: string): Promise<string> =>
  (await run('node', ['infra/seed/mint-token.mjs', repository])).stdout

describeDocker('registry push scoping (§13)', () => {
  it('accepts a push to the repository the token names', async () => {
    const config = dockerConfigWith(await mintFor('local/scopetest'))
    await run('docker', ['tag', 'alpine:3.22', '127.0.0.1:7107/local/scopetest:probe'])
    await expect(
      run('docker', ['push', '127.0.0.1:7107/local/scopetest:probe'], {
        env: { ...process.env, DOCKER_CONFIG: config },
      }),
    ).resolves.toBeTruthy()
  })

  // THE CONTROL. Same credential, different repository path.
  it('REFUSES a push to any other repository with the same token', async () => {
    const config = dockerConfigWith(await mintFor('local/scopetest'))
    await run('docker', ['tag', 'alpine:3.22', '127.0.0.1:7107/local/someone-else:probe'])
    await expect(
      run('docker', ['push', '127.0.0.1:7107/local/someone-else:probe'], {
        env: { ...process.env, DOCKER_CONFIG: config },
      }),
    ).rejects.toThrow(/insufficient_scope|authorization failed|denied|unauthorized/i)
  })

  it('REFUSES an anonymous push', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-empty-cfg-'))
    created.push(dir)
    writeFileSync(join(dir, 'config.json'), '{}')
    await expect(
      run('docker', ['push', '127.0.0.1:7107/local/scopetest:probe'], {
        env: { ...process.env, DOCKER_CONFIG: dir },
      }),
    ).rejects.toThrow()
  })

  it('leaves no trace of the refused repository in the registry', async () => {
    const { stdout } = await run('curl', [
      '-sS',
      '-H',
      `Authorization: Bearer ${await mintFor('local/scopetest')}`,
      'http://127.0.0.1:7107/v2/local/someone-else/tags/list',
    ])
    expect(stdout).toMatch(/UNAUTHORIZED|NAME_UNKNOWN/)
  })
})
