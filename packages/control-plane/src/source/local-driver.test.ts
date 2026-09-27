import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { SAMPLE_SECRETS } from '../build/testing.js'
import { describeSourceDriver } from './driver-contract.js'
import type { RepoRef } from './git-driver.js'
import { SourceError, createLocalSourceDriver } from './local-driver.js'
import { writeFiles } from './testing.js'

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
    forcePushMainAsPerson: async (slug) => forcePushByHand(join(repos, `${slug}.git`)),
    deleteMainAsPerson: async (slug) => deleteMainByHand(join(repos, `${slug}.git`)),
    pushSymlinkAsPerson: async (slug, path, target, message) =>
      pushSymlinkByHand(join(repos, `${slug}.git`), path, target, message),
    cleanup: () => rm(repos, { recursive: true, force: true }),
  }
})

describe('the local bare-repo source driver (D5 driver 1)', () => {
  it('creates a bare repository seeded with the blueprint skeleton', async () => {
    const driver = createLocalSourceDriver(root)
    const { ref: repo } = await driver.createRepository('chem-labs', seed)

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
    const { ref: repo } = await driver.createRepository('chem-labs', seed)
    const sha = await driver.headCommit(repo)
    expect(await driver.readFile(repo, sha, 'not-there.yaml')).toBeNull()
  })

  // Reads happen AT a commit. A driver that shelled out to the working tree would
  // pass every other test here and silently build the wrong source.
  it('reads a file as it was at an older commit, not as it is at HEAD', async () => {
    const driver = createLocalSourceDriver(root)
    const { ref: repo } = await driver.createRepository('chem-labs', seed)
    const first = await driver.headCommit(repo)

    await writeFiles(
      driver,
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
    const { ref: repo } = await driver.createRepository('chem-labs', seed)
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
    const { ref: repo } = await driver.createRepository('chem-labs', seed)
    const head = await driver.headCommit(repo)
    const smuggled = { ...repo, path: '/etc', url: 'file:///etc' } as RepoRef
    expect(await driver.headCommit(smuggled)).toBe(head)
    expect((await driver.localGitDir(smuggled, head)).gitDir).toBe(
      join(root, 'chem-labs.git'),
    )
  })

  it('destroys a repository', async () => {
    const driver = createLocalSourceDriver(root)
    const { ref: repo } = await driver.createRepository('chem-labs', seed)
    await driver.destroyRepository(repo)
    await expect(stat(join(root, 'chem-labs.git'))).rejects.toThrow()
  })
})

/**
 * §20, as applied: *a push to a driver-1 repository is refused by that repository's own hook*
 * (the D5 plan's Task 11, Decision 14 (b)). The hook is rendered from THE list at creation,
 * and re-rendered at every boot by `prepare()` — so a repository made before this task, or
 * before a rule was added, has the current list once the control plane has started.
 */
describe('driver 1 refuses a secret in a PERSON’s push, by the repository’s own hook (Task 11)', () => {
  const hookOf = (slug: string) => join(root, `${slug}.git`, 'hooks', 'pre-receive')
  const key = SAMPLE_SECRETS['an AWS access key id']

  it('installs the hook at creation, and a person’s push of a key is refused by it — a clean one lands', async () => {
    const driver = createLocalSourceDriver(root)
    const { ref: repo } = await driver.createRepository('chem-labs', seed)
    expect((await stat(hookOf('chem-labs'))).mode & 0o777).toBe(0o755)
    const head = await driver.headCommit(repo)
    const refused = await pushByHand(
      join(root, 'chem-labs.git'),
      { 'config/aws.js': `module.exports = '${key}'\n` },
      'a key',
    ).then(
      () => '',
      (e: unknown) => String((e as { stderr?: unknown }).stderr ?? e),
    )
    expect(refused).toContain(
      'Manifest refused this push (§20): config/aws.js:1 looks like an AWS access key id',
    )
    expect(refused).not.toContain(key)
    expect(await driver.headCommit(repo)).toBe(head)
    // The positive control: the hook refuses a KEY, not every push.
    const pushed = await pushByHand(
      join(root, 'chem-labs.git'),
      { 'b.txt': 'b\n' },
      'clean',
    )
    expect(await driver.headCommit(repo)).toBe(pushed)
  })

  it('prepare() gives every repository of ITS OWN the current hook, and leaves a driver-2 mirror’s refusing hook alone', async () => {
    const driver = createLocalSourceDriver(root)
    await driver.createRepository('chem-labs', seed)
    await driver.createRepository('bio-labs', seed)
    // A repository from before this task: no hook at all.
    await rm(hookOf('bio-labs'))
    // A driver-2 MIRROR in the same root (a laptop that switched drivers — Decision 3): its
    // hook refuses EVERY push, because a commit pushed into a mirror is one GitHub never saw.
    const mirror = join(root, 'gh-app.git')
    await run('git', ['init', '-q', '--bare', '-b', 'main', mirror])
    await run('git', [
      '--git-dir',
      mirror,
      'config',
      'manifest.fullName',
      'manifest-apps/gh-app',
    ])
    const refuseAll = '#!/bin/sh\necho mirror >&2\nexit 1\n'
    await writeFile(join(mirror, 'hooks', 'pre-receive'), refuseAll, { mode: 0o755 })
    // Not a repository at all: ignored.
    await mkdir(join(root, 'notes'))

    expect(await driver.prepare()).toEqual({ repositories: 2 })
    expect((await stat(hookOf('bio-labs'))).mode & 0o777).toBe(0o755)
    expect(await readFile(hookOf('bio-labs'), 'utf8')).toBe(
      await readFile(hookOf('chem-labs'), 'utf8'),
    )
    expect(await readFile(join(mirror, 'hooks', 'pre-receive'), 'utf8')).toBe(refuseAll)
    // Idempotent: a second boot changes nothing and counts the same.
    expect(await driver.prepare()).toEqual({ repositories: 2 })
  })

  it('prepare() on a machine with no repositories yet answers none, and creates nothing', async () => {
    const driver = createLocalSourceDriver(join(root, 'never-made'))
    expect(await driver.prepare()).toEqual({ repositories: 0 })
    await expect(stat(join(root, 'never-made'))).rejects.toThrow()
  })

  it('has no visibility: a repository on this machine is nobody’s to publish (the authoring API plan’s Task 12)', async () => {
    const driver = createLocalSourceDriver(root)
    const { ref: repo } = await driver.createRepository('chem-labs', seed)
    expect(await driver.lastVisibility(repo)).toBeNull()
  })

  it('syncs to an advance with no findings: this repository IS the source, and its hook is the scan', async () => {
    const driver = createLocalSourceDriver(root)
    const { ref: repo } = await driver.createRepository('chem-labs', seed)
    expect(await driver.sync(repo)).toEqual({
      projectSlug: 'chem-labs',
      updated: [],
      rewritten: [],
      visibility: null,
      findings: [],
      unscannable: [],
    })
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

/**
 * A PERSON pushing a SYMLINK — `path` → `target` — into the bare repository, through its own
 * hook (the authoring API plan's Task 3). A symlink's content is its target, which the hook
 * scans as an added line; a path is not secret-shaped.
 */
async function pushSymlinkByHand(
  bare: string,
  path: string,
  target: string,
  message: string,
): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'manifest-person-'))
  const git = async (...args: string[]) =>
    (await run('git', args, { cwd: work })).stdout.trim()
  try {
    await git('clone', '-q', bare, '.')
    await mkdir(dirname(join(work, path)), { recursive: true })
    await symlink(target, join(work, path))
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

/** git as a PERSON, answering whether the bare repository TOOK it and what it said. */
async function tried(
  cwd: string,
  args: string[],
): Promise<{ ok: boolean; said: string }> {
  return run('git', args, { cwd }).then(
    () => ({ ok: true, said: '' }),
    (e: unknown) => ({
      ok: false,
      said: String((e as { stderr?: unknown }).stderr ?? e),
    }),
  )
}

/** A PERSON rewriting `main` — an amend, force-pushed — into the bare repository (Task 12). */
async function forcePushByHand(bare: string): Promise<{ ok: boolean; said: string }> {
  const work = await mkdtemp(join(tmpdir(), 'manifest-person-'))
  try {
    await run('git', ['clone', '-q', bare, '.'], { cwd: work })
    await run(
      'git',
      [
        '-c',
        'user.name=person',
        '-c',
        'user.email=person@example.org',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-q',
        '--amend',
        '-m',
        'rewritten',
      ],
      { cwd: work },
    )
    return await tried(work, ['push', '-q', '--force', 'origin', 'HEAD:main'])
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** A PERSON deleting `main` in the bare repository (`git push <bare> :main`). */
async function deleteMainByHand(bare: string): Promise<{ ok: boolean; said: string }> {
  const work = await mkdtemp(join(tmpdir(), 'manifest-person-'))
  try {
    await run('git', ['init', '-q'], { cwd: work })
    return await tried(work, ['push', '-q', bare, ':refs/heads/main'])
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
