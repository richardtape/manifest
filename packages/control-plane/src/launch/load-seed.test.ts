import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * infra/seed/build-vegeta.sh — the load generator's seed step (the load rehearsal plan's Task 2), with `--no-build`: fetch if
 * absent, verify against the lock AND vegeta's published checksums file, and stop before Docker. DB-free and offline: every
 * case has its own lock and its own cache in a temporary directory, and the one download it attempts goes to a closed port.
 */
const ROOT = new URL('../../../../', import.meta.url).pathname
const SCRIPT = join(ROOT, 'infra/seed/build-vegeta.sh')
const ARCHIVE = 'vegeta_9.9.9_linux_arm64.tar.gz'
const SUMS = 'vegeta_9.9.9_checksums.txt'
const CLOSED = 'http://127.0.0.1:9'

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function seed(opts: {
  archive?: string
  lockSha: string
  publishedSha?: string
  cached?: boolean
}) {
  const dir = mkdtempSync(join(tmpdir(), 'build-vegeta-'))
  dirs.push(dir)
  const cache = join(dir, 'cache')
  const lock = join(dir, 'vegeta.lock')
  writeFileSync(
    lock,
    [
      '# a test lock',
      'version\t9.9.9',
      `checksums\t${CLOSED}/${SUMS}`,
      `linux/arm64\t${CLOSED}/${ARCHIVE}\t${opts.lockSha}`,
      '',
    ].join('\n'),
  )
  if (opts.cached !== false) {
    spawnSync('mkdir', ['-p', cache])
    writeFileSync(join(cache, ARCHIVE), opts.archive ?? '')
    writeFileSync(join(cache, SUMS), `${opts.publishedSha ?? opts.lockSha}  ${ARCHIVE}\n`)
  }
  const run = spawnSync('bash', [SCRIPT, '--no-build'], {
    env: {
      ...process.env,
      VEGETA_LOCK: lock,
      VEGETA_CACHE: cache,
      VEGETA_ARCH: 'linux/arm64',
    },
    encoding: 'utf8',
  })
  return { ...run, cache }
}

describe('build-vegeta.sh --no-build — the archive is verified twice before anything is built', () => {
  it('accepts an archive whose sha256 is the lock’s AND the published one', () => {
    const archive = 'the real release'
    const run = seed({ archive, lockSha: sha256(archive) })
    expect(run.status).toBe(0)
    expect(run.stdout).toContain(
      `vegeta 9.9.9 (linux/arm64) verified: ${sha256(archive)}`,
    )
  })

  it('refuses an archive whose sha256 differs from the lock, naming both — and leaves it in place', () => {
    const archive = 'a tampered release'
    const pinned = sha256('the real release')
    const run = seed({ archive, lockSha: pinned, publishedSha: sha256(archive) })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain(`has sha256 ${sha256(archive)}, but`)
    expect(run.stderr).toContain(`pins ${pinned} for linux/arm64`)
    expect(run.stderr).toContain('nothing was built')
    expect(existsSync(join(run.cache, ARCHIVE))).toBe(true)
  })

  it('refuses an archive the lock names but vegeta’s published checksums file does not, naming both', () => {
    const archive = 'a release the lock was edited to match'
    const published = sha256('the real release')
    const run = seed({ archive, lockSha: sha256(archive), publishedSha: published })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain(
      `has sha256 ${sha256(archive)}, but vegeta's published checksums file says ${published}`,
    )
  })

  it('fails loudly — never a silent WARN — offline with nothing cached, and leaves no partial file', () => {
    const run = seed({ lockSha: sha256('x'), cached: false })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain(`${SUMS} is not cached`)
    expect(run.stderr).toContain('run `make seed` with the network on')
    expect(readdirSync(run.cache)).toEqual([])
  })
})
