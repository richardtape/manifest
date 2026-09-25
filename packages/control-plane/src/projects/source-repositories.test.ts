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
    } finally {
      await app.close()
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
      .values({ slug: 'old-labs', ownerId: owner.id, blueprintRef: 'fixture-node@1' })
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
