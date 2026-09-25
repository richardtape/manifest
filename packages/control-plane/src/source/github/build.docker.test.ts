import { readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { appSpecs, users } from '../../db/index.js'
import { withRollback } from '../../db/testing.js'
import { loadConfig } from '../../config.js'
import { createEventBus } from '../../observability/index.js'
import { createProject } from '../../projects/index.js'
import { testAudience, testReservedLabels } from '../../projects/testing.js'
import { buildToEnd } from '../../releases/testing.js'
import type { Driver } from '../../runtime/index.js'
import { describeDocker, dockerDriverForTests } from '../../runtime/testing.js'
import type { SeedFiles } from '../git-driver.js'
import { createGithubSourceDriver } from './driver.js'
import { startFakeContainer, type FakeContainer } from './testing.js'

/**
 * A REAL BUILDKIT BUILD FROM DRIVER 2'S MIRROR, AND C1 ON DRIVER 2 (the D5 plan's Task 8).
 * The repository lives in the fake's IMAGE; the builder is handed the mirror by
 * `localGitDir`, exactly as the build route hands it over. Then GitHub goes away
 * (`docker stop`), and the SAME commit builds again — to the same digest (§13's *same source
 * → same digest*) — while `headCommit`, which needs GitHub NOW, is `SOURCE_UNREACHABLE`
 * rather than the mirror's last answer (Decision 18).
 *
 * Seeded from `fixtures/fixture-app` — what `fixtureBareRepo` builds, so this is the app the
 * rest of the Docker tier already proves builds.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const FIXTURE = join(REPO_ROOT, 'fixtures/fixture-app')
const SLUG = 'gh-build'
const bus = createEventBus()
const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
  MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
  MANIFEST_SESSION_SECRET: 'k'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

function treeOf(dir: string): SeedFiles {
  const files: Record<string, string> = {}
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name)
      if (statSync(full).isDirectory()) walk(full)
      else files[relative(dir, full)] = readFileSync(full, 'utf8')
    }
  }
  walk(dir)
  return files
}

let fake: FakeContainer
let driver: Driver
let mirrorRoot = ''

describeDocker(
  'driver 2 builds from its mirror, and builds again with GitHub gone',
  () => {
    beforeAll(async () => {
      fake = await startFakeContainer()
      driver = await dockerDriverForTests()
      mirrorRoot = await mkdtemp(join(tmpdir(), 'mf-mirror-'))
    }, 120_000)
    afterAll(async () => {
      await fake.remove()
      await rm(mirrorRoot, { recursive: true, force: true })
    }, 60_000)

    it('builds from the mirror, and builds the same commit again with GitHub gone', async () => {
      const source = createGithubSourceDriver({ mirrorRoot, ...fake.options })
      const repo = await source.createRepository(SLUG, treeOf(FIXTURE))
      const sha = await source.headCommit(repo)
      await withRollback(async (db) => {
        const [user] = await db
          .insert(users)
          .values({
            ubcCwlPuid: `puid-${SLUG}`,
            email: `${SLUG}@ubc.ca`,
            displayName: 'O',
            role: 'member',
          })
          .returning()
        const { project } = await createProject(db, config, await testReservedLabels(), {
          slug: SLUG,
          ownerId: user!.id,
          blueprintRef: 'fixture-node@1',
          starter: null,
          audience: testAudience(user!.id),
        })
        const [appSpec] = await db
          .insert(appSpecs)
          .values({
            projectId: project.id,
            commitSha: sha,
            parsed: {},
            schemaVersion: 1,
            valid: true,
          })
          .returning()
        const build = async () =>
          buildToEnd(
            { db, driver, bus },
            {
              projectId: project.id,
              projectSlug: SLUG,
              appSpecId: appSpec!.id,
              commitSha: sha,
              blueprintRef: 'fixture-node@1',
              repoPath: (await source.localGitDir(repo, sha)).gitDir,
            },
          )
        const online = await build()
        expect(online.status, online.error ?? '').toBe('succeeded')
        await fake.stop() // docker stop — GitHub is gone
        const offline = await build()
        expect(offline.status, offline.error ?? '').toBe('succeeded')
        expect(offline.imageDigest).toBe(online.imageDigest) // §13: same source, same digest
        await expect(source.headCommit(repo)).rejects.toMatchObject({
          code: 'SOURCE_UNREACHABLE',
        })
        // A commit the mirror never had is not a build and not "no such commit": GitHub
        // might have it (Decision 18).
        await expect(source.localGitDir(repo, 'e'.repeat(40))).rejects.toMatchObject({
          code: 'SOURCE_UNREACHABLE',
        })
      })
    }, 600_000)
  },
)
