import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SourceError, createLocalSourceDriver } from './local-driver.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'manifest-source-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const seed = {
  'manifest.yaml': 'manifest: 1\nname: chem-labs\nblueprint: fixture-node@1\nruntime:\n  port: 3000\n',
  'src/index.js': "console.log('hello')\n",
}

describe('the local bare-repo source driver (D5 driver 1)', () => {
  it('creates a bare repository seeded with the blueprint skeleton', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)

    expect(repo.projectSlug).toBe('chem-labs')
    expect((await stat(join(repo.path, 'HEAD'))).isFile()).toBe(true)

    const sha = await driver.headCommit(repo)
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
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

    await driver.commitFiles(repo, { 'manifest.yaml': 'manifest: 1\nname: renamed\n' }, 'edit')
    const second = await driver.headCommit(repo)

    expect(second).not.toBe(first)
    expect(await driver.readFile(repo, first, 'manifest.yaml')).toContain('name: chem-labs')
    expect(await driver.readFile(repo, second, 'manifest.yaml')).toContain('name: renamed')
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

  it('refuses to open a repository it did not create', async () => {
    const driver = createLocalSourceDriver(root)
    await expect(
      driver.headCommit({ projectSlug: 'ghost', path: '/etc', url: 'file:///etc' }),
    ).rejects.toThrow(SourceError)
  })

  it('destroys a repository', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)
    await driver.destroyRepository(repo)
    await expect(stat(repo.path)).rejects.toThrow()
  })
})
