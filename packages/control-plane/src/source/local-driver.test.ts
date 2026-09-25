import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { describeSourceDriver } from './driver-contract.js'
import type { RepoRef } from './git-driver.js'
import { SourceError, createLocalSourceDriver } from './local-driver.js'

const run = promisify(execFile)

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'manifest-source-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const seed = {
  'manifest.yaml':
    'manifest: 1\nname: chem-labs\nblueprint: fixture-node@1\nruntime:\n  port: 3000\n',
  'src/index.js': "console.log('hello')\n",
}

// D5's contract, which driver 2 runs identically against the fake (the D5 plan's Task 7).
describeSourceDriver('local', async () => {
  const repos = await mkdtemp(join(tmpdir(), 'manifest-source-'))
  return {
    driver: createLocalSourceDriver(repos),
    pushAsPerson: async (slug, files, message) =>
      pushByHand(join(repos, `${slug}.git`), files, message),
    cleanup: () => rm(repos, { recursive: true, force: true }),
  }
})

describe('the local bare-repo source driver (D5 driver 1)', () => {
  it('creates a bare repository seeded with the blueprint skeleton', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)

    expect(repo.projectSlug).toBe('chem-labs')
    const sha = await driver.headCommit(repo)
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
    // Driver 1's mirror IS the repository: the builder is handed the bare repo itself.
    const local = await driver.localGitDir(repo, sha)
    expect(local.gitDir).toBe(join(root, 'chem-labs.git'))
    expect((await stat(join(local.gitDir, 'HEAD'))).isFile()).toBe(true)

    expect(await driver.readFile(repo, sha, 'manifest.yaml')).toContain('name: chem-labs')
    expect(await driver.readFile(repo, sha, 'src/index.js')).toContain('hello')
  })

  it('returns null for a path that is not in the tree', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)
    const sha = await driver.headCommit(repo)
    expect(await driver.readFile(repo, sha, 'not-there.yaml')).toBeNull()
  })

  // Reads happen AT a commit. A driver that shelled out to the working tree would
  // pass every other test here and silently build the wrong source.
  it('reads a file as it was at an older commit, not as it is at HEAD', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)
    const first = await driver.headCommit(repo)

    await driver.commitFiles(
      repo,
      { 'manifest.yaml': 'manifest: 1\nname: renamed\n' },
      'edit',
    )
    const second = await driver.headCommit(repo)

    expect(second).not.toBe(first)
    expect(await driver.readFile(repo, first, 'manifest.yaml')).toContain(
      'name: chem-labs',
    )
    expect(await driver.readFile(repo, second, 'manifest.yaml')).toContain(
      'name: renamed',
    )
  })

  it('lists the default branch', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)
    expect(await driver.listBranches(repo)).toEqual(['main'])
  })

  it('refuses a slug that would escape the repository root', async () => {
    const driver = createLocalSourceDriver(root)
    for (const slug of ['../escape', 'a/b', '..', '.', 'Chem', 'has_underscore', '']) {
      await expect(driver.createRepository(slug, seed)).rejects.toThrow(SourceError)
    }
  })

  /**
   * Until the D5 plan's Task 2 a reference CARRIED a path, and this test handed the driver
   * `/etc` to prove it refused one it had not made (`SOURCE_FOREIGN_REPO`, now retired).
   * A reference has no path any more, so the property is that the driver never reads
   * one: whatever else an object carries, the repository is the slug's, under the root.
   */
  it('names a repository by its slug alone, so a reference cannot point it elsewhere', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)
    const head = await driver.headCommit(repo)
    const smuggled = { ...repo, path: '/etc', url: 'file:///etc' } as RepoRef
    expect(await driver.headCommit(smuggled)).toBe(head)
    expect((await driver.localGitDir(smuggled, head)).gitDir).toBe(
      join(root, 'chem-labs.git'),
    )
  })

  it('destroys a repository', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)
    await driver.destroyRepository(repo)
    await expect(stat(join(root, 'chem-labs.git'))).rejects.toThrow()
  })
})

/**
 * A PERSON's push: clone the bare repository, commit under an identity that is not
 * Manifest's, push `main` — what `scripts/demo-releases.sh` does. `add -A` rather than
 * `commit -a`, which would leave a NEW file out of the commit.
 */
async function pushByHand(
  bare: string,
  files: Record<string, string>,
  message: string,
): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'manifest-person-'))
  const git = async (...args: string[]) =>
    (await run('git', args, { cwd: work })).stdout.trim()
  try {
    await git('clone', '-q', bare, '.')
    for (const [relative, content] of Object.entries(files)) {
      await mkdir(dirname(join(work, relative)), { recursive: true })
      await writeFile(join(work, relative), content, 'utf8')
    }
    await git('add', '-A')
    await git(
      '-c',
      'user.name=person',
      '-c',
      'user.email=person@example.org',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      message,
    )
    await git('push', '-q', 'origin', 'HEAD:main')
    return await git('rev-parse', 'HEAD')
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
