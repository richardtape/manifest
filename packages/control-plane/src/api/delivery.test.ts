import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { resetDatabase } from '../db/testing.js'
import { createFakeDriver } from '../runtime/index.js'
import { buildServer } from './server.js'
import { loginAs, testDeps } from './testing.js'
import type { TestUserPuid } from '../identity/testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

const key = () => ({ 'idempotency-key': randomUUID() })

async function projectFor(puid: TestUserPuid) {
  const deps = await testDeps()
  const app = await buildServer(deps)
  const cookies = await loginAs(deps, puid)
  const created = await app.inject({
    method: 'POST',
    url: '/projects',
    payload: { slug: 'chem-labs', blueprint: 'fixture-node@1' },
    cookies,
    headers: key(),
  })
  return { app, deps, cookies, project: created.json() }
}

describe('the delivery routes', () => {
  it('builds, releases and deploys to staging', async () => {
    const { app, cookies, project } = await projectFor('bio_prof')

    const build = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha },
      cookies,
      headers: key(),
    })
    expect(build.statusCode).toBe(201)
    expect(build.json().status).toBe('succeeded')
    expect(build.json().imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)

    const release = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/releases`,
      payload: { buildId: build.json().id, summary: 'first' },
      cookies,
      headers: key(),
    })
    expect(release.statusCode).toBe(201)

    const staging = project.environments.find(
      (e: { kind: string }) => e.kind === 'staging',
    )
    const deploy = await app.inject({
      method: 'POST',
      url: `/environments/${staging.id}/deploy`,
      payload: { releaseId: release.json().id },
      cookies,
      headers: key(),
    })
    expect(deploy.statusCode).toBe(200)
    expect(deploy.json().state).toBe('healthy')

    const environment = await app.inject({
      method: 'GET',
      url: `/environments/${staging.id}`,
      cookies,
    })
    expect(environment.json().hostname).toBe('chem-labs.staging.manifest.internal')
    expect(environment.json().instance.state).toBe('healthy')
    await app.close()
  })

  it('refuses a release from a build that has not succeeded', async () => {
    const { app, cookies, project } = await projectFor('bio_prof')
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/releases`,
      payload: { buildId: '00000000-0000-0000-0000-000000000000' },
      cookies,
      headers: key(),
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('RELEASE_BUILD_NOT_FOUND')
    await app.close()
  })

  it('refuses production and says what is blocking it', async () => {
    const { app, cookies, project } = await projectFor('bio_prof')
    const build = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha },
      cookies,
      headers: key(),
    })
    const release = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/releases`,
      payload: { buildId: build.json().id },
      cookies,
      headers: key(),
    })
    const production = project.environments.find(
      (e: { kind: string }) => e.kind === 'production',
    )

    const response = await app.inject({
      method: 'POST',
      url: `/environments/${production.id}/deploy`,
      payload: { releaseId: release.json().id },
      cookies,
      headers: key(),
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
      url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha },
      cookies,
      headers: key(),
    })

    const otherCookies = await loginAs(deps, 'bio_student')
    const response = await app.inject({
      method: 'GET',
      url: `/builds/${build.json().id}`,
      cookies: otherCookies,
    })
    expect(response.statusCode).toBe(404)

    // And the owner gets it. Without this the test passes against a server that
    // registers no /builds route at all — 404 alone cannot tell "hidden" from
    // "absent", which is the failure mode a stub already slipped past once.
    const mine = await app.inject({
      method: 'GET',
      url: `/builds/${build.json().id}`,
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
      url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha },
      cookies,
      headers: key(),
    })
    expect(build.statusCode).toBe(201)

    const logs = await app.inject({
      method: 'GET',
      url: `/builds/${build.json().id}/logs`,
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
      url: `/builds/${build.json().id}/logs?tail=1`,
      cookies,
    })
    expect(tail.json().lines.map((l: { seq: number }) => l.seq)).toEqual([
      lines.at(-1)!.seq,
    ])

    const nonsense = await app.inject({
      method: 'GET',
      url: `/builds/${build.json().id}/logs?tail=0`,
      cookies,
    })
    expect(nonsense.statusCode).toBe(400)

    // The IDOR shape again, on the route that returns the most text.
    const other = await app.inject({
      method: 'GET',
      url: `/builds/${build.json().id}/logs`,
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
        url: '/projects',
        payload: { slug: 'chem-labs', blueprint: 'fixture-node@1' },
        cookies,
        headers: key(),
      })
    ).json()
    const build = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha },
      cookies,
      headers: key(),
    })
    const release = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/releases`,
      payload: { buildId: build.json().id },
      cookies,
      headers: key(),
    })
    const staging = project.environments.find(
      (e: { kind: string }) => e.kind === 'staging',
    )
    const deploy = await app.inject({
      method: 'POST',
      url: `/environments/${staging.id}/deploy`,
      payload: { releaseId: release.json().id },
      cookies,
      headers: key(),
    })
    // A failed deploy is a recorded outcome, not an error.
    expect(deploy.statusCode).toBe(200)
    expect(deploy.json().state).toBe('failed')

    const listed = await app.inject({
      method: 'GET',
      url: `/environments/${staging.id}/incidents`,
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
      url: `/environments/${staging.id}/incidents`,
      cookies: await loginAs(deps, 'bio_student'),
    })
    expect(other.statusCode).toBe(404)
    await app.close()
  })
})
