import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startFake, type StartedFake } from '@manifest/github-fake/testing'
import { buildServer, type ServerDeps } from '../api/index.js'
import {
  githubTestDeps,
  loginAs,
  mutationHeaders,
  projectBody,
  refusal,
  testDeps,
} from '../api/testing.js'
import { db, projects, sourceRepositories } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import type { RepositoryLink, SourceProvider } from '../source/index.js'
import { recordRepository, repositoryOf } from './source-repositories.js'

/**
 * EVERY PROJECT RECORDS ITS PROVIDER, AND A MISMATCH IS REFUSED (the D5 plan's Decision 3,
 * Task 8). One database, two control planes: driver 1's and driver 2's — which is exactly the
 * laptop that switched `MANIFEST_SOURCE_DRIVER` and restarted.
 */

const DRIZZLE = fileURLToPath(new URL('../../drizzle', import.meta.url))

async function create(deps: ServerDeps, slug: string) {
  const app = await buildServer(deps)
  const cookies = await loginAs(deps, 'bio_prof')
  const res = await app.inject({
    method: 'POST',
    url: '/v1/projects',
    payload: projectBody(slug),
    cookies,
    headers: mutationHeaders(deps),
  })
  return { app, cookies, res }
}

async function rowOf(projectId: string) {
  const [row] = await db
    .select({
      provider: sourceRepositories.provider,
      fullName: sourceRepositories.fullName,
      webUrl: sourceRepositories.webUrl,
    })
    .from(sourceRepositories)
    .where(eq(sourceRepositories.projectId, projectId))
  return row
}

/** Which GitHub the row says made the project's repository (the launch path plan's Task 2). */
async function apiHostOf(projectId: string) {
  const [row] = await db
    .select({ apiHost: sourceRepositories.apiHost })
    .from(sourceRepositories)
    .where(eq(sourceRepositories.projectId, projectId))
  return row?.apiHost
}

describe('the provider on every project (Decision 3)', () => {
  let fake: StartedFake
  beforeEach(async () => {
    await resetDatabase()
    fake = await startFake()
  })
  afterEach(async () => {
    await fake.stop()
  })

  it('records a driver-1 project as local, with no web address', async () => {
    const { app, res } = await create(await testDeps(), 'chem-labs')
    try {
      expect(res.statusCode, res.body).toBe(201)
      expect(await rowOf(res.json().id)).toEqual({
        provider: 'local',
        fullName: 'chem-labs',
        webUrl: null,
      })
      expect(await apiHostOf(res.json().id)).toBeNull() // on no GitHub
    } finally {
      await app.close()
    }
  })

  it('records a driver-2 project as GitHub named it — full name and html_url from its answer', async () => {
    const { app, res } = await create(await githubTestDeps(fake), 'chem-labs')
    try {
      expect(res.statusCode, res.body).toBe(201)
      expect(await rowOf(res.json().id)).toEqual({
        provider: 'github',
        fullName: 'manifest-apps/chem-labs',
        webUrl: `${fake.url}/manifest-apps/chem-labs`,
      })
      // WHICH GitHub (the launch path plan's Task 2): the API's host — and never on the wire.
      expect(await apiHostOf(res.json().id)).toBe(new URL(fake.apiUrl).host)
      expect(res.json().repository).not.toHaveProperty('apiHost')
    } finally {
      await app.close()
    }
  })

  /**
   * A PROJECT ANOTHER GITHUB MADE (the launch path plan's Task 2, *Read this first* 14): both are
   * provider `github`, so before `api_host` a project made against the fake raised no mismatch on
   * a control plane restarted onto the real App — and its delete removed the mirror and left the
   * fake's repository. Two fakes, one database: the laptop that switched GitHubs.
   */
  it('refuses a project another GitHub made — naming both hosts — and answers its own', async () => {
    const other = await startFake()
    try {
      const theirs = await create(await githubTestDeps(other), 'chem-labs')
      await theirs.app.close()
      expect(theirs.res.statusCode, theirs.res.body).toBe(201)
      const github = await githubTestDeps(fake)
      const mine = await create(github, 'bio-labs')
      try {
        expect(mine.res.statusCode, mine.res.body).toBe(201)
        const validate = (id: string) =>
          mine.app.inject({
            method: 'POST',
            url: `/v1/projects/${id}/spec`,
            payload: {},
            cookies: mine.cookies,
            headers: mutationHeaders(github),
          })
        const refused = await validate((theirs.res.json() as { id: string }).id)
        expect(refusal(refused)).toEqual({
          status: 409,
          code: 'SOURCE_PROVIDER_MISMATCH',
        })
        expect(refused.json().error.message).toContain(new URL(other.apiUrl).host)
        expect(refused.json().error.message).toContain(new URL(fake.apiUrl).host)
        // THE POSITIVE CONTROL: the same server, its own project, the same call.
        const own = await validate((mine.res.json() as { id: string }).id)
        expect(own.statusCode, own.body).toBe(201)
      } finally {
        await github.sourceSync.idle()
        await mine.app.close()
      }
    } finally {
      await other.stop()
    }
  })

  it('refuses a driver-1 project on a driver-2 control plane — builds and spec both — and builds its own', async () => {
    const localDeps = await testDeps()
    const local = await create(localDeps, 'chem-labs')
    await local.app.close()
    expect(local.res.statusCode, local.res.body).toBe(201)
    const theirs = local.res.json() as { id: string; spec: { commitSha: string } }

    // ONE repository root, as on a laptop that switched drivers: driver 1's bare repository
    // is exactly where driver 2 would keep its mirror, and holds the commit. Without the
    // check, driver 2 would take it for a mirror and build it.
    const github = await githubTestDeps(fake, { reposRoot: localDeps.config.reposRoot })
    const mine = await create(github, 'bio-labs')
    try {
      expect(mine.res.statusCode, mine.res.body).toBe(201)
      const call = (url: string) =>
        mine.app.inject({
          method: 'POST',
          url,
          payload: {},
          cookies: mine.cookies,
          headers: mutationHeaders(github),
        })
      for (const url of [
        `/v1/projects/${theirs.id}/builds`,
        `/v1/projects/${theirs.id}/spec`,
      ]) {
        const res = await call(url)
        expect(refusal(res), url).toEqual({
          status: 409,
          code: 'SOURCE_PROVIDER_MISMATCH',
        })
        expect(res.json().error.message).toMatch(/local/)
        expect(res.json().error.message).toMatch(/github/)
      }
      // THE POSITIVE CONTROL: the same server, its own project, the same two calls.
      const own = (mine.res.json() as { id: string }).id
      expect((await call(`/v1/projects/${own}/spec`)).statusCode).toBe(201)
      const started = await call(`/v1/projects/${own}/builds`)
      expect(started.statusCode, started.body).toBe(202)
      await github.builds.idle()
    } finally {
      await mine.app.close()
    }
  })

  it("backfills a project that predates the table as local — the migration's own statement", async () => {
    const owner = await ensureTestUser(db, 'bio_prof')
    const [project] = await db
      .insert(projects)
      .values({
        slug: 'old-labs',
        name: 'old-labs',
        ownerId: owner.id,
        blueprintRef: 'fixture-node@1',
      })
      .returning()
    expect(await rowOf(project!.id)).toBeUndefined() // as a pre-0024 project was
    await db.execute(sql.raw(backfillStatement()))
    expect(await rowOf(project!.id)).toEqual({
      provider: 'local',
      fullName: 'old-labs',
      webUrl: null,
    })
    // Idempotent: a second run is ON CONFLICT DO NOTHING, never a failed migration.
    await db.execute(sql.raw(backfillStatement()))
    expect(await rowOf(project!.id)).toMatchObject({ provider: 'local' })
  })
})

/**
 * THE GITHUB A PROJECT LIVES ON (the launch path plan's Task 2, Decision 4): `repositoryOf`
 * compares the row's `api_host` with the running driver's, and only when BOTH are known. A row
 * written before migration 0040 has none, and is answered by any GitHub — refusing it would strand
 * every driver-2 project made before the column existed.
 */
describe('repositoryOf and the GitHub a project lives on (the launch path plan’s Task 2)', () => {
  let projectId: string
  beforeEach(async () => {
    await resetDatabase()
    const owner = await ensureTestUser(db, 'bio_prof')
    const [project] = await db
      .insert(projects)
      .values({
        slug: 'lp-hosts',
        name: 'lp-hosts',
        ownerId: owner.id,
        blueprintRef: 'fixture-node@1',
      })
      .returning()
    projectId = project!.id
  })

  const link = (apiHost: string | null): RepositoryLink => ({
    provider: 'github',
    fullName: 'manifest-apps/lp-hosts',
    webUrl: 'http://127.0.0.1:7110/manifest-apps/lp-hosts',
    mainProtected: false,
    protectionDetail: null,
    apiHost,
  })

  /** A running driver that names itself and counts every time it is asked for the reference. */
  function running(name: SourceProvider, apiHost: string | null) {
    const asked: string[] = []
    return {
      asked,
      source: {
        name,
        identity: () => ({ name, apiHost }),
        repositoryFor: (projectSlug: string) => {
          asked.push(projectSlug)
          return { projectSlug, provider: name }
        },
      },
    }
  }

  it('refuses a project made on another GitHub before GitHub is asked, naming both hosts', async () => {
    await recordRepository(db, projectId, link('127.0.0.1:7110'))
    const real = running('github', 'api.github.com')
    const refused = repositoryOf(
      { db, source: real.source },
      { id: projectId, slug: 'lp-hosts' },
    )
    await expect(refused).rejects.toMatchObject({ code: 'SOURCE_PROVIDER_MISMATCH' })
    const message = await refused.catch((e: Error) => e.message)
    expect(message).toContain('127.0.0.1:7110')
    expect(message).toContain('api.github.com')
    expect(real.asked).toEqual([]) // no reference was made — nothing downstream could reach GitHub
    // THE POSITIVE CONTROL: the GitHub that made it is answered.
    const same = running('github', '127.0.0.1:7110')
    await expect(
      repositoryOf({ db, source: same.source }, { id: projectId, slug: 'lp-hosts' }),
    ).resolves.toEqual({ projectSlug: 'lp-hosts', provider: 'github' })
  })

  it('a row with no host (made before api_host existed) is answered by any host of the same provider', async () => {
    await recordRepository(db, projectId, link(null))
    for (const host of ['api.github.com', '127.0.0.1:7110']) {
      const any = running('github', host)
      await expect(
        repositoryOf({ db, source: any.source }, { id: projectId, slug: 'lp-hosts' }),
      ).resolves.toEqual({ projectSlug: 'lp-hosts', provider: 'github' })
    }
    // The provider is still checked: a host that is unknown is not a provider that is unknown.
    const local = running('local', null)
    await expect(
      repositoryOf({ db, source: local.source }, { id: projectId, slug: 'lp-hosts' }),
    ).rejects.toMatchObject({ code: 'SOURCE_PROVIDER_MISMATCH' })
  })
})

/** The backfill as the migration file has it — so removing it from the file turns this red. */
function backfillStatement() {
  // `.sql` only: `drizzle/` also holds `meta/`, a DIRECTORY — read as a file it is EISDIR,
  // which made this helper crash rather than say "no migration backfills" (control (c)).
  const file = readdirSync(DRIZZLE)
    .filter((f) => f.endsWith('.sql'))
    .find((f) =>
      readFileSync(join(DRIZZLE, f), 'utf8').includes(
        'INSERT INTO "source_repositories"',
      ),
    )
  if (file === undefined) throw new Error('no migration backfills source_repositories')
  const statement = readFileSync(join(DRIZZLE, file), 'utf8')
    .split('--> statement-breakpoint')
    .find((s) => s.includes('INSERT INTO "source_repositories"'))!
  return statement
}
