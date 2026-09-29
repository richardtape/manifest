import { and, asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { startFake, type StartedFake } from '@manifest/github-fake/testing'
import { db, events } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { buildServer, type ServerDeps } from './index.js'
import {
  githubTestDeps,
  loginAs,
  mutationHeaders,
  projectBody,
  testDeps,
} from './testing.js'

/**
 * WHERE A PROJECT'S CODE LIVES, FOR A CLIENT (the D5 plan's Task 12, Decision 15) — and whether
 * `main` is protected there, RECORDED HONESTLY where the host would not protect it (Decision
 * 13): GitHub will not protect a PRIVATE repository's branch on a free organisation, and the
 * project says so, with GitHub's own words and one Event, rather than claiming a protection
 * GitHub refused.
 */

const FREE_PLAN_WORDS =
  'Upgrade to GitHub Pro or make this repository public to enable this feature.'

interface Ctx {
  deps: ServerDeps
  app: FastifyInstance
  fake?: StartedFake
}
let open: Ctx | undefined
afterEach(async () => {
  if (open === undefined) return
  await open.deps.sourceSync.idle()
  await open.app.close()
  await open.fake?.stop()
  open = undefined
})

async function serverOn(
  driver: 'local' | 'github',
  plan: 'free' | 'team' = 'team',
  quirks: { refusePrivatize?: boolean } = {},
) {
  await resetDatabase()
  const fake = driver === 'github' ? await startFake({ plan, quirks }) : undefined
  const deps = fake === undefined ? await testDeps() : await githubTestDeps(fake)
  const app = await buildServer(deps)
  open = { deps, app, ...(fake === undefined ? {} : { fake }) }
  return open
}

async function create(ctx: Ctx, slug: string) {
  const cookies = await loginAs(ctx.deps, 'bio_prof')
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/projects',
    payload: projectBody(slug),
    cookies,
    headers: mutationHeaders(ctx.deps),
  })
  expect(res.statusCode, res.body).toBe(201)
  const got = await ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${res.json().id}`,
    cookies,
  })
  expect(got.statusCode, got.body).toBe(200)
  return { created: res.json(), read: got.json() }
}

/**
 * The project's events in the order they were WRITTEN. `created_at` is each insert's own
 * `now()` — separate statements, not one transaction — so a later publish never reads earlier;
 * two in one microsecond would tie, which `>=` below tolerates rather than flakes on.
 */
const typesOf = (projectId: string) =>
  db
    .select({ type: events.type, at: events.createdAt })
    .from(events)
    .where(eq(events.projectId, projectId))
    .orderBy(asc(events.createdAt))

describe('Project.repository — where the code lives, and whether main is protected (Task 12)', () => {
  it('driver 1: a repository on this machine — no address, main protected by git', async () => {
    const ctx = await serverOn('local')
    const { created, read } = await create(ctx, 'link-app')
    const link = {
      provider: 'local',
      fullName: 'link-app',
      webUrl: null,
      mainProtected: true,
      protectionDetail: null,
      // Task 12, minor 3: a repository on this machine has no visibility.
      visibility: null,
    }
    expect(read.repository).toEqual(link)
    expect(created.repository).toEqual(link)
  })

  it('driver 2, a team organisation: GitHub’s name and address, main protected — and no event says otherwise', async () => {
    const ctx = await serverOn('github', 'team')
    const { read } = await create(ctx, 'link-app')
    expect(read.repository).toEqual({
      provider: 'github',
      fullName: `${ctx.fake!.org}/link-app`,
      webUrl: expect.stringMatching(/\/link-app$/),
      mainProtected: true,
      protectionDetail: null,
      visibility: 'private',
    })
    // WHICH GitHub is the platform's own bookkeeping (the launch path plan's Task 2), never
    // published: `toEqual` above would already refuse it, and this names why.
    expect(read.repository).not.toHaveProperty('apiHost')
    expect((await typesOf(read.id)).map((e) => e.type)).not.toContain(
      'repository.protection_unavailable',
    )
  })

  it('driver 2, a FREE organisation: main NOT protected, GitHub’s own words — and ONE repository.protection_unavailable, after the creation’s own events', async () => {
    const ctx = await serverOn('github', 'free')
    const { read } = await create(ctx, 'link-app')
    expect(read.repository).toEqual({
      provider: 'github',
      fullName: `${ctx.fake!.org}/link-app`,
      webUrl: expect.stringMatching(/\/link-app$/),
      mainProtected: false,
      protectionDetail: FREE_PLAN_WORDS,
      visibility: 'private',
    })
    const written = await typesOf(read.id)
    const unavailable = written.filter(
      (e) => e.type === 'repository.protection_unavailable',
    )
    expect(unavailable).toHaveLength(1)
    // LAST, with the creation's other events (sitting 5's F3): after the rows that can fail.
    const at = (type: string) => written.find((e) => e.type === type)!.at.getTime()
    expect(unavailable[0]!.at.getTime()).toBeGreaterThanOrEqual(at('project.created'))
    expect(unavailable[0]!.at.getTime()).toBeGreaterThanOrEqual(at('repository.seeded'))
    expect(unavailable[0]!.at.getTime()).toBeGreaterThanOrEqual(at('spec.validated'))
    const [event] = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.projectId, read.id),
          eq(events.type, 'repository.protection_unavailable'),
        ),
      )
    // Manifest's own words in the event — GitHub's body stays on the project's link.
    expect(event!.machineDetail).toEqual({
      ref: 'refs/heads/main',
      detail: expect.stringContaining('main'),
    })
    expect(JSON.stringify(event!.machineDetail)).not.toContain(FREE_PLAN_WORDS)
  })
})

/**
 * WHAT A CLIENT IS TOLD OF THE REPOSITORY'S VISIBILITY (the authoring API plan's Task 12, the D5
 * plan's final review's minor 3): the mirror's LAST READ — the console's Code line said
 * *private* whatever GitHub last said.
 */
describe('Project.repository.visibility — what Manifest last read on GitHub (Task 12)', () => {
  it('says PUBLIC once a sync has read it public and GitHub refused the revert — and private again after', async () => {
    const quirks = { refusePrivatize: true }
    const ctx = await serverOn('github', 'team', quirks)
    const { read } = await create(ctx, 'link-app')
    expect(read.repository.visibility).toBe('private') // the positive control
    const res = await fetch(`${ctx.fake!.apiUrl}/repos/${ctx.fake!.org}/link-app`, {
      method: 'PATCH',
      headers: {
        authorization: `token ${ctx.fake!.developerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ private: false }),
    })
    expect(res.status).toBe(200)
    const repo = ctx.deps.source.repositoryFor('link-app')
    expect((await ctx.deps.source.sync(repo)).visibility?.result).toBe('still-public')
    const cookies = await loginAs(ctx.deps, 'bio_prof')
    const again = await ctx.app.inject({
      method: 'GET',
      url: `/v1/projects/${read.id}`,
      cookies,
    })
    expect(again.json().repository.visibility).toBe('public')
    // The organisation's policy lifted: the next sync makes it private, and the project says so.
    quirks.refusePrivatize = false
    await ctx.deps.source.sync(repo)
    const last = await ctx.app.inject({
      method: 'GET',
      url: `/v1/projects/${read.id}`,
      cookies,
    })
    expect(last.json().repository.visibility).toBe('private')
  })
})
