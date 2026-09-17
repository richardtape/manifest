import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { events } from '../db/index.js'
import type { StreamFrame } from '../observability/index.js'
import { resetDatabase } from '../db/testing.js'
import { createFakeDriver } from '../runtime/index.js'
import { buildServer } from './server.js'
import { loginAs, mutationHeaders, projectBody, testDeps } from './testing.js'
import type { TestUserPuid } from '../identity/testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

async function projectFor(puid: TestUserPuid) {
  const deps = await testDeps()
  const app = await buildServer(deps)
  const cookies = await loginAs(deps, puid)
  const created = await app.inject({
    method: 'POST',
    url: '/v1/projects',
    payload: projectBody('chem-labs'),
    cookies,
    headers: mutationHeaders(deps),
  })
  return { app, deps, cookies, project: created.json() }
}

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
    const failedBuild = await post(`/v1/projects/${project.id}/builds`, {
      commitSha: project.spec.commitSha,
    })
    expect(failedBuild.json().status).toBe('failed')
    const build = await post(`/v1/projects/${project.id}/builds`, {
      commitSha: project.spec.commitSha,
    })
    expect(build.json().status).toBe('succeeded')
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
      'instance.healthy',
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
    expect(build.statusCode).toBe(201)
    expect(build.json().status).toBe('succeeded')
    expect(build.json().imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)

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
    const deps = {
      ...(await testDeps()),
      driver: {
        ...base,
        status: async (id: string) =>
          sicken ? ({ id, state: 'failed', healthy: false } as const) : base.status(id),
      },
    }
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

  it('refuses production and says what is blocking it', async () => {
    const { app, deps, cookies, project } = await projectFor('bio_prof')
    const build = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/builds`,
      payload: { commitSha: project.spec.commitSha },
      cookies,
      headers: mutationHeaders(deps),
    })
    const release = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/releases`,
      payload: { buildId: build.json().id },
      cookies,
      headers: mutationHeaders(deps),
    })
    const production = project.environments.find(
      (e: { kind: string }) => e.kind === 'production',
    )

    const response = await app.inject({
      method: 'POST',
      url: `/v1/environments/${production.id}/deploy`,
      payload: { releaseId: release.json().id },
      cookies,
      headers: mutationHeaders(deps),
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('RELEASE_PRODUCTION_GATE_UNAVAILABLE')
    expect(response.json().error.launchReadiness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item: 'IamRegistration', blocking: true }),
        expect.objectContaining({ item: 'PrivacyAssessment', blocking: true }),
      ]),
    )
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
    expect(build.statusCode).toBe(201)

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
    expect(nonsense.statusCode).toBe(400)

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
    const deps = {
      ...(await testDeps()),
      driver: createFakeDriver({ failInstances: true }),
    }
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
