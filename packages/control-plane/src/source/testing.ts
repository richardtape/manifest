import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { StartedFake } from '@manifest/github-fake/testing'
import type {
  MirrorAdvance,
  RepoRef,
  SourceDriver,
  SourceObserver,
} from './git-driver.js'
import { gitWithToken } from './github/git.js'

/**
 * TEST SUPPORT for D5's driver 2 — a PERSON acting on GitHub outside Manifest, and an
 * observer that records what the driver reported. Here, at the module's root, because
 * `api/` tests need them too and may reach another module only through its `index` or
 * `testing` (`module-boundaries.test.ts`). Moved out of `github/driver.test.ts` by Task 9.
 */

/** What a person needs to reach GitHub: an in-process fake, or the fake's container. */
type Github = Pick<StartedFake, 'gitUrl' | 'org' | 'developerToken'>

/** git as `faculty-dev`, a PERSON, with their own token — outside Manifest. */
const asPerson = (fake: Github, cwd: string) => ({ cwd, token: fake.developerToken })
const PERSON = [
  '-c',
  'user.name=person',
  '-c',
  'user.email=person@example.org',
  '-c',
  'commit.gpgsign=false',
]

/** A person pushing straight to GitHub. Returns the commit. */
export async function pushAsPerson(
  fake: Github,
  slug: string,
  files: Record<string, string>,
  message: string,
): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'person-'))
  const as = asPerson(fake, work)
  try {
    await gitWithToken(['clone', '-q', `${fake.gitUrl}/${fake.org}/${slug}.git`, '.'], as)
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(work, path)), { recursive: true })
      await writeFile(join(work, path), content)
    }
    await gitWithToken(['add', '-A'], as)
    await gitWithToken([...PERSON, 'commit', '-qm', message], as)
    await gitWithToken(['push', '-q', 'origin', 'HEAD:main'], as)
    return (await gitWithToken(['rev-parse', 'HEAD'], as)).trim()
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/**
 * A person pushing a SYMLINK straight to GitHub — `path` pointing at `target`, which may be
 * outside the repository or its own `.git` (the authoring API plan's *Read this first* 1).
 * Returns the commit.
 */
export async function pushSymlinkAsPerson(
  fake: Github,
  slug: string,
  path: string,
  target: string,
  message: string,
): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'person-'))
  const as = asPerson(fake, work)
  try {
    await gitWithToken(['clone', '-q', `${fake.gitUrl}/${fake.org}/${slug}.git`, '.'], as)
    await mkdir(dirname(join(work, path)), { recursive: true })
    await symlink(target, join(work, path))
    await gitWithToken(['add', '-A'], as)
    await gitWithToken([...PERSON, 'commit', '-qm', message], as)
    await gitWithToken(['push', '-q', 'origin', 'HEAD:main'], as)
    return (await gitWithToken(['rev-parse', 'HEAD'], as)).trim()
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/**
 * A person pushing a GITLINK straight to GitHub — a submodule entry at `path` naming `commit`,
 * which need not exist anywhere (git never follows one). Returns the commit.
 */
export async function pushGitlinkAsPerson(
  fake: Github,
  slug: string,
  path: string,
  commit: string,
  message: string,
): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'person-'))
  const as = asPerson(fake, work)
  try {
    await gitWithToken(['clone', '-q', `${fake.gitUrl}/${fake.org}/${slug}.git`, '.'], as)
    await gitWithToken(
      ['update-index', '--add', '--cacheinfo', `160000,${commit},${path}`],
      as,
    )
    await gitWithToken([...PERSON, 'commit', '-qm', message], as)
    await gitWithToken(['push', '-q', 'origin', 'HEAD:main'], as)
    return (await gitWithToken(['rev-parse', 'HEAD'], as)).trim()
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** Who a test's own commits are by — a person in the platform's zone, never a real mailbox. */
export const TEST_AUTHOR = { name: 'A Test', email: 'test@users.manifest.internal' }

/**
 * WHAT `commitFiles` WAS, over the one write path (the authoring API plan's Task 3): reads
 * `main`, writes `files` onto it, and answers the new commit. For the tests that need a
 * commit and are not about how one is made — and, with `author`, a commit made OUTSIDE the
 * API that claims to be somebody: git's author text is whatever the pusher's git said
 * (the authoring API plan's Decision 5).
 */
export async function writeFiles(
  driver: SourceDriver,
  repo: RepoRef,
  files: Record<string, string>,
  message: string,
  author: { name: string; email: string } = TEST_AUTHOR,
): Promise<string> {
  const base = await driver.headCommit(repo)
  const made = await driver.commit(repo, {
    base,
    changes: Object.entries(files).map(([path, content]) => ({
      op: 'write' as const,
      path,
      content,
    })),
    message,
    author,
  })
  return made.commitSha!
}

/**
 * A person REWRITING GitHub's `main` — an amend and a force-push, which a free organisation
 * cannot stop on a private repository (`[M10]`). Returns the rewritten head.
 */
export async function rewriteAsPerson(fake: Github, slug: string): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'person-'))
  const as = asPerson(fake, work)
  try {
    await gitWithToken(['clone', '-q', `${fake.gitUrl}/${fake.org}/${slug}.git`, '.'], as)
    await gitWithToken([...PERSON, 'commit', '-q', '--amend', '-m', 'rewritten'], as)
    await gitWithToken(['push', '-q', '--force', 'origin', 'HEAD:main'], as)
    return (await gitWithToken(['rev-parse', 'HEAD'], as)).trim()
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** What a person's push was answered: whether GitHub TOOK it, and what it said. */
export interface PersonPush {
  ok: boolean
  said: string
}

/**
 * A person force-pushing an amended `main` to GitHub — which branch protection refuses, and a
 * free organisation's private repository cannot stop (Task 12). Answers; never throws.
 */
export async function tryForcePushMainAsPerson(
  fake: Github,
  slug: string,
): Promise<PersonPush> {
  const work = await mkdtemp(join(tmpdir(), 'person-'))
  const as = asPerson(fake, work)
  try {
    await gitWithToken(['clone', '-q', `${fake.gitUrl}/${fake.org}/${slug}.git`, '.'], as)
    await gitWithToken([...PERSON, 'commit', '-q', '--amend', '-m', 'rewritten'], as)
    return await gitWithToken(['push', '-q', '--force', 'origin', 'HEAD:main'], as).then(
      () => ({ ok: true, said: '' }),
      (e: unknown) => ({ ok: false, said: String((e as Error).message) }),
    )
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** A person deleting `main` on GitHub (`git push origin :main`). Answers; never throws. */
export async function tryDeleteMainAsPerson(
  fake: Github,
  slug: string,
): Promise<PersonPush> {
  const work = await mkdtemp(join(tmpdir(), 'person-'))
  const as = asPerson(fake, work)
  try {
    await gitWithToken(['init', '-q'], as)
    return await gitWithToken(
      ['push', '-q', `${fake.gitUrl}/${fake.org}/${slug}.git`, ':refs/heads/main'],
      as,
    ).then(
      () => ({ ok: true, said: '' }),
      (e: unknown) => ({ ok: false, said: String((e as Error).message) }),
    )
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** A `SourceObserver` that keeps every advance it is handed — or fails, when told to. */
export function recordingObserver(): SourceObserver & {
  advances: MirrorAdvance[]
  fail(error: Error | undefined): void
} {
  const advances: MirrorAdvance[] = []
  let failing: Error | undefined
  return {
    advances,
    fail(error) {
      failing = error
    },
    async advanced(advance) {
      if (failing !== undefined) throw failing
      advances.push(advance)
    },
  }
}
