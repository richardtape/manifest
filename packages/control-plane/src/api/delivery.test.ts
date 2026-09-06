import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { resetDatabase } from '../db/testing.js'
import { buildServer } from './server.js'
import { testDeps } from './testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

const key = () => ({ 'idempotency-key': randomUUID() })

async function projectFor(puid: string) {
  const app = await buildServer(await testDeps({ devAuth: true }))
  const login = await app.inject({ method: 'POST', url: '/auth/dev-login', payload: { puid } })
  const session = login.cookies.find((c) => c.name === 'manifest_session')!.value
  const cookies = { manifest_session: session }
  const created = await app.inject({
    method: 'POST', url: '/projects',
    payload: { slug: 'chem-labs', blueprint: 'fixture-node@1' },
    cookies, headers: key(),
  })
  return { app, cookies, project: created.json() }
}

describe('the delivery routes', () => {
  it('builds, releases and deploys to staging', async () => {
    const { app, cookies, project } = await projectFor('bio_prof')

    const build = await app.inject({
      method: 'POST', url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha }, cookies, headers: key(),
    })
    expect(build.statusCode).toBe(201)
    expect(build.json().status).toBe('succeeded')
    expect(build.json().imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)

    const release = await app.inject({
      method: 'POST', url: `/projects/${project.id}/releases`,
      payload: { buildId: build.json().id, summary: 'first' }, cookies, headers: key(),
    })
    expect(release.statusCode).toBe(201)

    const staging = project.environments.find((e: { kind: string }) => e.kind === 'staging')
    const deploy = await app.inject({
      method: 'POST', url: `/environments/${staging.id}/deploy`,
      payload: { releaseId: release.json().id }, cookies, headers: key(),
    })
    expect(deploy.statusCode).toBe(200)
    expect(deploy.json().state).toBe('healthy')

    const environment = await app.inject({
      method: 'GET', url: `/environments/${staging.id}`, cookies,
    })
    expect(environment.json().hostname).toBe('chem-labs.staging.manifest.internal')
    expect(environment.json().instance.state).toBe('healthy')
    await app.close()
  })

  it('refuses a release from a build that has not succeeded', async () => {
    const { app, cookies, project } = await projectFor('bio_prof')
    const response = await app.inject({
      method: 'POST', url: `/projects/${project.id}/releases`,
      payload: { buildId: '00000000-0000-0000-0000-000000000000' }, cookies, headers: key(),
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('RELEASE_BUILD_NOT_FOUND')
    await app.close()
  })

  it('refuses production and says what is blocking it', async () => {
    const { app, cookies, project } = await projectFor('bio_prof')
    const build = await app.inject({
      method: 'POST', url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha }, cookies, headers: key(),
    })
    const release = await app.inject({
      method: 'POST', url: `/projects/${project.id}/releases`,
      payload: { buildId: build.json().id }, cookies, headers: key(),
    })
    const production = project.environments.find((e: { kind: string }) => e.kind === 'production')

    const response = await app.inject({
      method: 'POST', url: `/environments/${production.id}/deploy`,
      payload: { releaseId: release.json().id }, cookies, headers: key(),
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
    const { app, cookies, project } = await projectFor('bio_prof')
    const build = await app.inject({
      method: 'POST', url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha }, cookies, headers: key(),
    })

    const other = await app.inject({
      method: 'POST', url: '/auth/dev-login', payload: { puid: 'bio_student' },
    })
    const otherCookies = {
      manifest_session: other.cookies.find((c) => c.name === 'manifest_session')!.value,
    }
    const response = await app.inject({
      method: 'GET', url: `/builds/${build.json().id}`, cookies: otherCookies,
    })
    expect(response.statusCode).toBe(404)

    // And the owner gets it. Without this the test passes against a server that
    // registers no /builds route at all — 404 alone cannot tell "hidden" from
    // "absent", which is the failure mode a stub already slipped past once.
    const mine = await app.inject({
      method: 'GET', url: `/builds/${build.json().id}`, cookies,
    })
    expect(mine.statusCode).toBe(200)
    expect(mine.json().id).toBe(build.json().id)
    await app.close()
  })
})
