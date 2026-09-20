import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { events } from '../db/index.js'
import type { StreamFrame } from '../observability/index.js'
import { resetDatabase } from '../db/testing.js'
import { createFakeDriver, type Driver } from '../runtime/index.js'
import { createBuildRunner, createRetirer } from '../releases/index.js'
import { buildServer } from './server.js'
import { loginAs, mutationHeaders, projectBody, testDeps } from './testing.js'
import type { TestUserPuid } from '../identity/testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

async function projectFor(puid: TestUserPuid, slug = 'chem-labs') {
  const deps = await testDeps()
  const app = await buildServer(deps)
  const cookies = await loginAs(deps, puid)
  const created = await app.inject({
    method: 'POST',
    url: '/v1/projects',
    payload: projectBody(slug),
    cookies,
    headers: mutationHeaders(deps),
  })
  return { app, deps, cookies, project: created.json() }
}

/** A build's present status, read the way a client reads it (R6). */
async function statusOf(
  app: Awaited<ReturnType<typeof buildServer>>,
  cookies: Record<string, string>,
  buildId: string,
): Promise<string> {
  return (
    await app.inject({ method: 'GET', url: `/v1/builds/${buildId}`, cookies })
  ).json().status
}

/**
 * `testDeps()` with another driver — and the background work built FROM it. Spreading a
 * driver over `testDeps()` alone leaves the build runner and the retirer holding the
 * harness's own fake, so a build would quietly run on a driver the test never chose.
 */
async function depsWithDriver(driver: Driver) {
  const deps = await testDeps()
  return {
    ...deps,
    driver,
    builds: createBuildRunner({ db: deps.db, driver, bus: deps.bus }),
    retirer: createRetirer({
      db: deps.db,
      driver,
      ai: deps.ai,
      appSecrets: deps.appSecrets,
      bus: deps.bus,
      drainMs: 0,
    }),
  }
}

/** A project with `n` builds started through the route and awaited to their end. */
async function projectWithBuilds(n: number) {
  const { app, deps, cookies, project } = await projectFor('bio_prof')
  const ids: string[] = []
  for (let i = 0; i < n; i += 1) {
    const started = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/builds`,
      payload: {},
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(started.statusCode, started.body).toBe(202)
    ids.push(started.json().id)
    await deps.builds.idle()
  }
  return { app, deps, cookies, project, ids }
}

/**
 * A project with one SUCCEEDED build (P5a Task 14). `env` is written into its
 * `manifest.yaml` and pushed, so the release below resolves a config with an env var
 * whose VALUE must not travel with it — the property Decision 22 exists for cannot be
 * tested against a manifest that declares none.
 */
async function builtProject(
  slug: string,
  options: { env?: { name: string; value: string }[] } = {},
) {
  // The slug reaches BOTH halves: the project this creates and the repository the manifest
  // below is committed to. Passing it to only one is a fixture that works for exactly one
  // name and fails confusingly for any other.
  const { app, deps, cookies, project } = await projectFor('bio_prof', slug)
  if (options.env !== undefined) {
    await deps.source.commitFiles(
      deps.source.repositoryFor(slug),
      {
        'manifest.yaml': [
          'manifest: 1',
          `name: ${slug}`,
          'blueprint: fixture-node@1',
          'runtime:',
          '  port: 3000',
          '  health: /healthz',
          'env:',
          ...options.env.map((e) => `  - { name: ${e.name}, value: ${e.value} }`),
          '',
        ].join('\n'),
      },
      'feat: an env var whose value is the app’s, not the contract’s',
    )
    const pushed = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/spec`,
      payload: {},
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(pushed.json().valid, pushed.body).toBe(true)
  }
  const started = await app.inject({
    method: 'POST',
    url: `/v1/projects/${project.id}/builds`,
    payload: {},
    cookies,
    headers: mutationHeaders(deps),
  })
  expect(started.statusCode, started.body).toBe(202)
  await deps.builds.idle()
  const build = (
    await app.inject({ method: 'GET', url: `/v1/builds/${started.json().id}`, cookies })
  ).json()
  expect(build.status, JSON.stringify(build)).toBe('succeeded')
  return { app, deps, cookies, project, build }
}

/** The same, released — and its staging environment, which is what a deploy names. */
async function releasedProject(
  slug: string,
  options: { env?: { name: string; value: string }[] } = {},
) {
  const built = await builtProject(slug, options)
  const created = await built.app.inject({
    method: 'POST',
    url: `/v1/projects/${built.project.id}/releases`,
    payload: { buildId: built.build.id },
    cookies: built.cookies,
    headers: mutationHeaders(built.deps),
  })
  expect(created.statusCode, created.body).toBe(201)
  const staging = built.project.environments.find(
    (e: { kind: string }) => e.kind === 'staging',
  )
  return { ...built, release: created.json(), staging }
}

describe('a build answers at once and finishes on the stream (R6, P5a Task 13)', () => {
  it('answers 202 while the build is still running, and GET tells the rest', async () => {
    const deps = await testDeps()
    // A driver whose build waits for the test to let it finish.
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const buildImage = deps.driver.buildImage.bind(deps.driver)
    deps.driver.buildImage = async (...args) => {
      await gate
      return buildImage(...args)
    }
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')
    const project = (
      await app.inject({
        method: 'POST',
        url: '/v1/projects',
        cookies,
        headers: mutationHeaders(deps),
        payload: projectBody('chem-labs'),
      })
    ).json()
    const frames: StreamFrame[] = []
    deps.bus.subscribe(project.id, (f) => frames.push(f))

    const started = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/builds`,
      cookies,
      headers: mutationHeaders(deps),
      payload: {},
    })
    expect(started.statusCode, started.body).toBe(202)
    expect(started.json()).toMatchObject({
      status: 'running',
      projectId: project.id,
      commitSha: project.spec.commitSha,
      imageDigest: null,
      scan: null,
    })
    expect(await statusOf(app, cookies, started.json().id)).toBe('running')
    // build.started is on the stream before the build ends; its end is not.
    const types = () => frames.flatMap((f) => (f.kind === 'event' ? [f.type] : []))
    expect(types()).toEqual(['build.started'])

    release()
    await deps.builds.idle()
    const done = (
      await app.inject({ method: 'GET', url: `/v1/builds/${started.json().id}`, cookies })
    ).json()
    expect(done).toMatchObject({
      id: started.json().id,
      status: 'succeeded',
      imageDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      error: null,
    })
    expect(done.scan).toMatchObject({
      scanner: 'fake',
      stale: false,
      fixable: { critical: 0, high: 0 },
    })
    // The repository half of the image is a build internal, and so is its log pointer.
    expect(Object.keys(done).sort()).toEqual([
      'commitSha',
      'createdAt',
      'error',
      'id',
      'imageDigest',
      'projectId',
      'scan',
      'status',
    ])
    expect(types()).toEqual(['build.started', 'build.succeeded'])
    await app.close()
  })

  it('replays the 202 as it was recorded for a repeated Idempotency-Key, and starts nothing', async () => {
    const { app, deps, cookies, project } = await projectFor('bio_prof')
    const headers = mutationHeaders(deps)
    const post = () =>
      app.inject({
        method: 'POST',
        url: `/v1/projects/${project.id}/builds`,
        cookies,
        headers,
        payload: {},
      })
    const first = await post()
    await deps.builds.idle()
    const again = await post()
    expect([again.statusCode, again.json()]).toEqual([202, first.json()])
    const list = await app.inject({
      method: 'GET',
      url: `/v1/projects/${project.id}/builds`,
      cookies,
    })
    expect(list.json()).toHaveLength(1)
    await app.close()
  })

  it('lists a project’s builds, newest first', async () => {
    const { app, cookies, project, ids } = await projectWithBuilds(2)
    const list = (
      await app.inject({
        method: 'GET',
        url: `/v1/projects/${project.id}/builds`,
        cookies,
      })
    ).json()
    expect(list.map((b: { id: string }) => b.id)).toEqual([...ids].reverse())
    expect(Date.parse(list[0].createdAt)).toBeGreaterThanOrEqual(
      Date.parse(list[1].createdAt),
    )
    await app.close()
  })

  it('refuses a commit that is not 40 hex characters as REQUEST_INVALID, naming the field', async () => {
    const { app, deps, cookies, project } = await projectFor('bio_prof')
    const refused = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/builds`,
      cookies,
      headers: mutationHeaders(deps),
      payload: { commitSha: 'main' },
    })
    expect([refused.statusCode, refused.json().error.code]).toEqual([
      400,
      'REQUEST_INVALID',
    ])
    expect(refused.json().error.message).toContain('commitSha')
    await app.close()
  })
})

describe('what the event stream carries (P4b Task 15)', () => {
  it('streams every event the delivery lifecycle records — and nothing it did not record', async () => {
    // The property `publishEvent` exists for, asserted by COUNTING rather than by
    // reading the source, so a future direct `bus.publish` of an event, or a bare
    // `recordEvent`, is caught wherever it is added. Both directions: every recorded row
    // was streamed, and every streamed event frame is a recorded row.
    const { app, deps, cookies, project } = await projectFor('bio_prof')
    const frames: StreamFrame[] = []
    deps.bus.subscribe(project.id, (f) => frames.push(f))
    const staging = project.environments.find(
      (e: { kind: string }) => e.kind === 'staging',
    )
    const post = (url: string, payload: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url,
        payload,
        cookies,
        headers: mutationHeaders(deps),
      })

    // A build that fails, then one that succeeds.
    vi.spyOn(deps.driver, 'buildImage').mockRejectedValueOnce(
      Object.assign(new Error('npm ci exited 1'), { code: 'BUILD_FAILED' }),
    )
    // Each build answers 202 while it runs (R6) and is awaited to its end before the next
    // step, so the recorded order below is the order things happened in.
    const failedBuild = await post(`/v1/projects/${project.id}/builds`, {
      commitSha: project.spec.commitSha,
    })
    await deps.builds.idle()
    expect(await statusOf(app, cookies, failedBuild.json().id)).toBe('failed')
    const build = await post(`/v1/projects/${project.id}/builds`, {
      commitSha: project.spec.commitSha,
    })
    await deps.builds.idle()
    expect(await statusOf(app, cookies, build.json().id)).toBe('succeeded')
    const release = await post(`/v1/projects/${project.id}/releases`, {
      buildId: build.json().id,
    })

    // A deploy that becomes healthy, then one whose instance the driver reports failed.
    const healthy = await post(`/v1/environments/${staging.id}/deploy`, {
      releaseId: release.json().id,
    })
    expect(healthy.json().state).toBe('healthy')
    vi.spyOn(deps.driver, 'status').mockResolvedValue({
      id: 'unused',
      state: 'failed',
      healthy: false,
    })
    const broken = await post(`/v1/environments/${staging.id}/deploy`, {
      releaseId: release.json().id,
    })
    expect(broken.json().state).toBe('failed')

    const rows = await deps.db
      .select()
      .from(events)
      .where(eq(events.projectId, project.id))
      .orderBy(asc(events.createdAt))
    expect(rows.map((r) => r.type)).toEqual([
      'project.created',
      'repository.seeded',
      'spec.validated',
      'build.started',
      'build.failed',
      'build.started',
      'build.succeeded',
      // Each deploy says it began before it says how it ended (P5a Task 14, §22 step 5).
      'instance.provisioning',
      'instance.starting',
      'instance.healthy',
      'instance.provisioning',
      'instance.starting',
      'instance.failed',
      'incident.opened',
    ])
    // Creation's three were recorded and streamed before this subscriber existed (P5a
    // Task 11; `projects.test.ts` holds creation to publishing them); every later row reached it.
    expect(frames.filter((f) => f.kind === 'event').map((f) => f.id)).toEqual(
      rows.slice(3).map((r) => r.id),
    )
    // And the build log reached the stream while it was written — the failed build's
    // reason line included — without a single line becoming an audit row.
    const logs = frames.filter((f) => f.kind === 'log')
    expect(logs.map((f) => f.kind === 'log' && f.buildId)).toEqual(
      expect.arrayContaining([failedBuild.json().id, build.json().id]),
    )
  })
})

describe('the delivery routes', () => {
  it('refuses to build an invalid spec as 422 SPEC_INVALID, with the errors — the status every route answers it with', async () => {
    // P5a Task 5. This refusal was `400 SPEC_INVALID` with no details while `GET …/spec`
    // answered the same code 422 with them, and no test built against an invalid spec,
    // so nothing could see the two disagree.
    const { app, deps, cookies, project } = await projectFor('bio_prof')
    await deps.source.commitFiles(
      deps.source.repositoryFor('chem-labs'),
      {
        'manifest.yaml':
          'manifest: 1\nname: not-this-project\nblueprint: fixture-node@1\n',
      },
      'feat: a manifest that names another project',
    )
    const pushed = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/spec`,
      payload: {},
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(pushed.json().valid).toBe(false)

    const build = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/builds`,
      payload: {},
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(build.statusCode).toBe(422)
    expect(build.json().error.code).toBe('SPEC_INVALID')
    expect(build.json().error.details.map((d: { code: string }) => d.code)).toEqual(
      pushed.json().errors.map((e: { code: string }) => e.code),
    )
    expect(build.json().error.details.length).toBeGreaterThan(0)

    // The same code, the same status, from the spec read.
    const read = await app.inject({
      method: 'GET',
      url: `/v1/projects/${project.id}/spec`,
      cookies,
    })
    expect([read.statusCode, read.json().error.code]).toEqual([422, 'SPEC_INVALID'])
    await app.close()
  })

  it('builds, releases and deploys to staging', async () => {
    const { app, deps, cookies, project } = await projectFor('bio_prof')

    const build = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/builds`,
      payload: { commitSha: project.spec.commitSha },
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(build.statusCode).toBe(202)
    await deps.builds.idle()
    const built = (
      await app.inject({ method: 'GET', url: `/v1/builds/${build.json().id}`, cookies })
    ).json()
    expect(built.status).toBe('succeeded')
    expect(built.imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)

    const release = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/releases`,
      payload: { buildId: build.json().id, summary: 'first' },
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(release.statusCode).toBe(201)

    const staging = project.environments.find(
      (e: { kind: string }) => e.kind === 'staging',
    )
    const deploy = await app.inject({
      method: 'POST',
      url: `/v1/environments/${staging.id}/deploy`,
      payload: { releaseId: release.json().id },
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(deploy.statusCode).toBe(200)
    expect(deploy.json().state).toBe('healthy')

    const environment = await app.inject({
      method: 'GET',
      url: `/v1/environments/${staging.id}`,
      cookies,
    })
    expect(environment.json().hostname).toBe('chem-labs.staging.manifest.internal')
    expect(environment.json().instance.state).toBe('healthy')
    await app.close()
  })

  it('reports the instance that SERVES, not the newest deploy (P4c Task 8)', async () => {
    // A failed deploy writes a newer `instances` row, and reporting that one told a
    // faculty member their app was failed while it was serving perfectly. §6's Route
    // record is what says which instance the hostname actually reaches.
    let sicken = false
    const base = createFakeDriver()
    const deps = await depsWithDriver({
      ...base,
      status: async (id: string) =>
        sicken ? ({ id, state: 'failed', healthy: false } as const) : base.status(id),
    })
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')
    const project = (
      await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: projectBody('chem-labs'),
        cookies,
        headers: mutationHeaders(deps),
      })
    ).json()
    const build = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/builds`,
      payload: { commitSha: project.spec.commitSha },
      cookies,
      headers: mutationHeaders(deps),
    })
    await deps.builds.idle()
    const release = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/releases`,
      payload: { buildId: build.json().id },
      cookies,
      headers: mutationHeaders(deps),
    })
    const staging = project.environments.find(
      (e: { kind: string }) => e.kind === 'staging',
    )
    const deploy = () =>
      app.inject({
        method: 'POST',
        url: `/v1/environments/${staging.id}/deploy`,
        payload: { releaseId: release.json().id },
        cookies,
        headers: mutationHeaders(deps),
      })
    const healthy = await deploy()
    expect(healthy.json().state).toBe('healthy')
    sicken = true
    const failed = await deploy()
    expect(failed.json().state).toBe('failed')
    // The newest row by `last_seen_at` is the failed one; the served one is the answer.
    const environment = await app.inject({
      method: 'GET',
      url: `/v1/environments/${staging.id}`,
      cookies,
    })
    expect(environment.json().instance.id).toBe(healthy.json().id)
    expect(environment.json().instance.state).toBe('healthy')
    await app.close()
  })

  it('refuses a release from a build that has not succeeded', async () => {
    const { app, deps, cookies, project } = await projectFor('bio_prof')
    const response = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/releases`,
      payload: { buildId: '00000000-0000-0000-0000-000000000000' },
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('RELEASE_BUILD_NOT_FOUND')
    await app.close()
  })

  it('refuses production with the SAME checklist GET /launch-readiness answers', async () => {
    const { deps, app, cookies, project, release } = await releasedProject('chem-labs')
    const production = project.environments.find(
      (e: { kind: string }) => e.kind === 'production',
    )
    const refused = await app.inject({
      method: 'POST',
      url: `/v1/environments/${production.id}/deploy`,
      cookies,
      headers: mutationHeaders(deps),
      payload: { releaseId: release.id },
    })
    expect(refused.statusCode, refused.body).toBe(409)
    expect(refused.json().error.code).toBe('RELEASE_PRODUCTION_GATE_UNAVAILABLE')
    // **THE PRESENCE OF THE CHECKLIST IS THE ASSERTION, not the status and not the code**
    // (P6a sitting 1's `[M2]`). Measured before Task 7: with the route's gate commented
    // out, a production deploy STILL answered `409 RELEASE_PRODUCTION_GATE_UNAVAILABLE` —
    // from a SECOND gate inside `deployRelease` — and the only difference on the wire was
    // that its envelope carried no `launchReadiness`. So a test asserting status and code
    // is green against a change that removed only one of the two.
    expect(
      Object.prototype.hasOwnProperty.call(refused.json().error, 'launchReadiness'),
    ).toBe(true)
    const read = await app.inject({
      method: 'GET',
      url: `/v1/projects/${project.id}/launch-readiness`,
      cookies,
    })
    expect(read.statusCode, read.body).toBe(200)
    expect(refused.json().error.launchReadiness).toEqual(read.json())
    // BYTE for byte, not only equal as values. `toEqual` above ignores key order, and key
    // order is exactly where the two paths diverged: the read is parsed through
    // `LaunchReadiness` and zod emits SCHEMA order, while the refusal was built by hand
    // and kept the literal's. Measured by `make demo-journey` 2026-09-17; `mapError`
    // parses the checklist now, so this holds by construction.
    expect(JSON.stringify(refused.json().error.launchReadiness)).toBe(
      JSON.stringify(read.json()),
    )
    // The constant this replaced stamped four items `deliveredBy: 'P4'` for things P4
    // never delivered (brief §2.2). Nothing computed says it.
    expect(JSON.stringify(read.json())).not.toContain('deliveredBy')
    await app.close()
  })

  /**
   * **THE POSITIVE CONTROL FOR THE GATE, AND IT CANNOT RUN YET — which is this task's
   * hardest honest fact** (P6a Task 7, Step 5). A refusal test beside no success test is
   * a test of a route that refuses everything (P5c sitting 9's F16), and the route's
   * success here needs EVERY blocking item met: an `active` IAM registration, an
   * `approved` PIA, a clean scan on the candidate — **and `rehearsal` and
   * `admin-approval`, which are `not_built` until Tasks 14 and 10.**
   *
   * The alternative was to force those two to `met` in a fixture, which would be a test
   * of a checklist the platform will never produce. A skipped test naming the task that
   * un-skips it is a promise a reader can check; a forced fixture is a claim nobody can.
   *
   * **Task 14's step 5 un-skips this**, and until then `assertLaunchable`'s returning
   * branch is asserted by nothing — recorded as a control that cannot fail rather than
   * discovered later.
   *
   * What DOES hold the route honest in the meantime is the staging deploy below: the same
   * registered route answers `200` for a collaborator deploying to staging, so this is not
   * a route that refuses everything.
   */
  it.skip('deploys to production when every blocking item is met — pending Tasks 10 and 14: admin-approval and rehearsal are not built', async () => {
    // Written when Task 14 lands: record an active IAM registration and an approved PIA,
    // complete the rehearsal, approve the digest, then deploy to production and expect
    // 200 with an instance — and assert `assertLaunchable` RETURNED the view it deployed
    // on, which is what Task 15 records.
  })

  it('a collaborator may deploy to staging and may not promote to production', async () => {
    // P5b Task 2. `release:deploy` and `release:promote` are different decisions (§13,
    // D24), and this is the outside view of the difference: one client, one release, two
    // environments, two answers. The owner's own production attempt reaches the launch
    // gate (the test above) — this one never gets that far.
    const { app, deps, project, release, staging } = await releasedProject('chem-labs')
    const production = project.environments.find(
      (e: { kind: string }) => e.kind === 'production',
    )
    // The §6 User row has to exist before the owner can add them (MEMBER_USER_NOT_FOUND),
    // which is what `loginAs` does on the way to a session.
    const collaborator = await loginAs(deps, 'bio_student')
    const added = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/members`,
      // The OWNER's session, STEPPED UP: `members:manage` is the owner's (§13), it is
      // one of D24's privileged four, and §20 guards it since P6a Task 9. This test's
      // subject is deploy-versus-promote, so it takes the claim from `loginAs` rather
      // than driving a SAML round trip to earn it.
      cookies: await loginAs(deps, 'bio_prof', { steppedUp: true }),
      headers: mutationHeaders(deps),
      payload: { puid: 'bio_student', role: 'collaborator' },
    })
    expect(added.statusCode, added.body).toBe(201)

    const toStaging = await app.inject({
      method: 'POST',
      url: `/v1/environments/${staging.id}/deploy`,
      cookies: collaborator,
      headers: mutationHeaders(deps),
      payload: { releaseId: release.id },
    })
    expect(toStaging.statusCode, toStaging.body).toBe(200)

    const toProduction = await app.inject({
      method: 'POST',
      url: `/v1/environments/${production.id}/deploy`,
      cookies: collaborator,
      headers: mutationHeaders(deps),
      payload: { releaseId: release.id },
    })
    // FORBIDDEN, not the launch gate's 409: the collaborator is refused before the
    // project's readiness is ever consulted. The CODE is asserted and not only the
    // status, because a new refusal in front of this one would otherwise keep the test
    // green for the wrong reason (ORIENTATION §4).
    expect(toProduction.statusCode, toProduction.body).toBe(403)
    expect(toProduction.json().error.code).toBe('FORBIDDEN')
    await app.close()
  })

  // The IDOR shape: a valid build id belonging to somebody else.
  it('hides another user’s build behind 404', async () => {
    const { app, deps, cookies, project } = await projectFor('bio_prof')
    const build = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/builds`,
      payload: { commitSha: project.spec.commitSha },
      cookies,
      headers: mutationHeaders(deps),
    })
    await deps.builds.idle()

    const otherCookies = await loginAs(deps, 'bio_student')
    const response = await app.inject({
      method: 'GET',
      url: `/v1/builds/${build.json().id}`,
      cookies: otherCookies,
    })
    expect(response.statusCode).toBe(404)

    // And the owner gets it. Without this the test passes against a server that
    // registers no /builds route at all — 404 alone cannot tell "hidden" from
    // "absent", which is the failure mode a stub already slipped past once.
    const mine = await app.inject({
      method: 'GET',
      url: `/v1/builds/${build.json().id}`,
      cookies,
    })
    expect(mine.statusCode).toBe(200)
    expect(mine.json().id).toBe(build.json().id)
    await app.close()
  })

  it('serves a build log to a reader of the project, and hides it from anyone else', async () => {
    const { app, deps, cookies, project } = await projectFor('bio_prof')
    const build = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/builds`,
      payload: { commitSha: project.spec.commitSha },
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(build.statusCode).toBe(202)
    await deps.builds.idle()

    const logs = await app.inject({
      method: 'GET',
      url: `/v1/builds/${build.json().id}/logs`,
      cookies,
    })
    expect(logs.statusCode).toBe(200)
    const lines = logs.json().lines as { seq: number; stream: string; text: string }[]
    // What the build WROTE, not merely a list: an empty array is also what a route
    // with no store behind it answers.
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0]).toMatchObject({ seq: 0, stream: 'stdout' })
    expect(lines[0]!.text).toContain('chem-labs')

    const tail = await app.inject({
      method: 'GET',
      url: `/v1/builds/${build.json().id}/logs?tail=1`,
      cookies,
    })
    expect(tail.json().lines.map((l: { seq: number }) => l.seq)).toEqual([
      lines.at(-1)!.seq,
    ])

    const nonsense = await app.inject({
      method: 'GET',
      url: `/v1/builds/${build.json().id}/logs?tail=0`,
      cookies,
    })
    expect([nonsense.statusCode, nonsense.json().error.code]).toEqual([
      400,
      'REQUEST_INVALID',
    ])

    // The IDOR shape again, on the route that returns the most text.
    const other = await app.inject({
      method: 'GET',
      url: `/v1/builds/${build.json().id}/logs`,
      cookies: await loginAs(deps, 'bio_student'),
    })
    expect(other.statusCode).toBe(404)
    await app.close()
  })

  it('lists a failed deploy’s Incident with its repair prompt, and hides it from anyone else (§14)', async () => {
    const deps = await depsWithDriver(createFakeDriver({ failInstances: true }))
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')
    const project = (
      await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: projectBody('chem-labs'),
        cookies,
        headers: mutationHeaders(deps),
      })
    ).json()
    const build = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/builds`,
      payload: { commitSha: project.spec.commitSha },
      cookies,
      headers: mutationHeaders(deps),
    })
    await deps.builds.idle()
    const release = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/releases`,
      payload: { buildId: build.json().id },
      cookies,
      headers: mutationHeaders(deps),
    })
    const staging = project.environments.find(
      (e: { kind: string }) => e.kind === 'staging',
    )
    const deploy = await app.inject({
      method: 'POST',
      url: `/v1/environments/${staging.id}/deploy`,
      payload: { releaseId: release.json().id },
      cookies,
      headers: mutationHeaders(deps),
    })
    // A failed deploy is a recorded outcome, not an error.
    expect(deploy.statusCode).toBe(200)
    expect(deploy.json().state).toBe('failed')

    const listed = await app.inject({
      method: 'GET',
      url: `/v1/environments/${staging.id}/incidents`,
      cookies,
    })
    expect(listed.statusCode).toBe(200)
    const body = listed.json() as {
      environmentId: string
      incidents: {
        instanceId: string
        releaseId: string
        failedCheck: string
        logTail: string
        prompt: string
      }[]
    }
    expect(body.environmentId).toBe(staging.id)
    // What the deploy RECORDED, not merely a list: an empty array is also what a route
    // with no store behind it answers.
    expect(body.incidents).toHaveLength(1)
    const [incident] = body.incidents
    expect(incident!.instanceId).toBe(deploy.json().id)
    expect(incident!.releaseId).toBe(release.json().id)
    expect(incident!.failedCheck).toBe(
      'health: GET /healthz on port 3000 — the driver reported the instance as failed',
    )
    expect(incident!.prompt).toContain('"chem-labs"')
    expect(incident!.prompt).toContain(incident!.failedCheck)
    expect(incident!.prompt).toContain(incident!.logTail)

    const other = await app.inject({
      method: 'GET',
      url: `/v1/environments/${staging.id}/incidents`,
      cookies: await loginAs(deps, 'bio_student'),
    })
    expect(other.statusCode).toBe(404)
    await app.close()
  })
})

describe('releases, deploys and incidents answer representations (P5a Task 14)', () => {
  it('a release shows its build’s digest and scan, and env var NAMES only', async () => {
    const { deps, app, cookies, project, build } = await builtProject('chem-labs', {
      // A manifest with an env var whose VALUE must not travel with the release.
      env: [{ name: 'COURSE_CODE', value: 'CHEM_121' }],
    })
    const res = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/releases`,
      cookies,
      headers: mutationHeaders(deps),
      payload: { buildId: build.id },
    })
    expect(res.statusCode, res.body).toBe(201)
    const release = res.json()
    expect(release).toMatchObject({
      buildId: build.id,
      imageDigest: build.imageDigest,
      scan: { scanner: 'fake' },
    })
    expect(release.config.staging.envNames).toEqual(['COURSE_CODE'])
    expect(JSON.stringify(release)).not.toContain('CHEM_121')
    expect(release).not.toHaveProperty('resolvedConfig')
    expect(
      (
        await app.inject({ method: 'GET', url: `/v1/releases/${release.id}`, cookies })
      ).json(),
    ).toEqual(release)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/v1/projects/${project.id}/releases`,
          cookies,
        })
      ).json(),
    ).toEqual([release])
    await app.close()
  })

  it('a deploy answers the instance without its driver or handle', async () => {
    const { deps, app, cookies, staging, release } = await releasedProject('chem-labs')
    const res = await app.inject({
      method: 'POST',
      url: `/v1/environments/${staging.id}/deploy`,
      cookies,
      headers: mutationHeaders(deps),
      payload: { releaseId: release.id },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(Object.keys(res.json()).sort()).toEqual([
      'environmentId',
      'id',
      'kind',
      'lastSeenAt',
      'releaseId',
      'state',
    ])
    expect(res.json().state).toBe('healthy')
    await app.close()
  })

  it('streams provisioning, starting and healthy for the instance, in that order (§22 step 5)', async () => {
    const { deps, app, cookies, project, staging, release } =
      await releasedProject('chem-labs')
    const frames: StreamFrame[] = []
    deps.bus.subscribe(project.id, (frame) => frames.push(frame))
    const instance = (
      await app.inject({
        method: 'POST',
        url: `/v1/environments/${staging.id}/deploy`,
        cookies,
        headers: mutationHeaders(deps),
        payload: { releaseId: release.id },
      })
    ).json()
    const forInstance = frames.flatMap((f) =>
      f.kind === 'event' &&
      (f.machineDetail as { instanceId?: string }).instanceId === instance.id
        ? [f.type]
        : [],
    )
    expect(forInstance.filter((t) => t.startsWith('instance.'))).toEqual([
      'instance.provisioning',
      'instance.starting',
      'instance.healthy',
    ])
    await app.close()
  })
})
