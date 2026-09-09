import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { resetDatabase } from './db/testing.js'
import { buildServer } from './api/index.js'
import { loginAs, testDeps } from './api/testing.js'

beforeEach(resetDatabase)
// This file commits for real, so it clears up behind itself too.
afterAll(resetDatabase)

const key = () => ({ 'idempotency-key': randomUUID() })

describe('P2 acceptance: the full lifecycle against the fake driver', () => {
  it('goes from no project to a healthy staging instance, in under a second', async () => {
    // The harness's own setup is OUTSIDE the measured window, and that line
    // moved here deliberately. `testDeps()` mints two RSA-4096 keypairs for the
    // control plane's SAML fixtures (§9 — Manifest is its own SP), which is
    // ~500 ms of openssl that belongs to the test rather than to the platform:
    // measured 2026-09-09, it took `controlPlaneWork` from ~300 ms to 891 ms and
    // failed a budget about a lifecycle that had not changed. What the budget
    // holds is still every line of platform code this test runs — buildServer
    // and the whole §22 journey below.
    const deps = await testDeps()
    const started = performance.now()
    const app = await buildServer(deps)
    const afterBoot = performance.now()

    // 1. A session for §22 step 1. The real thing is a browser-mediated SAML
    //    round trip against the Manifest IdP, which needs a container and
    //    belongs to the Docker tier; what this file measures is the LIFECYCLE
    //    after login, so it signs the session directly rather than driving
    //    three HTTP hops it is not testing.
    const cookies = await loginAs(deps, 'bio_prof')

    // 2. Create a project (§22 step 2) — and 3, provisioning: repository created,
    //    manifest.yaml validated.
    const created = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { slug: 'chem-labs', blueprint: 'fixture-node@1' },
      cookies,
      headers: key(),
    })
    const afterCreate = performance.now()
    expect(created.statusCode).toBe(201)
    const project = created.json()
    expect(project.specValid).toBe(true)
    expect(project.specErrors).toEqual([])
    expect(project.commitSha).toMatch(/^[0-9a-f]{40}$/)
    expect(project.environments).toHaveLength(3)

    // The spec that was validated is the spec at that commit, read from a bare repo.
    const spec = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/spec`,
      cookies,
    })
    expect(spec.json().commitSha).toBe(project.commitSha)
    expect(spec.json().spec.name).toBe('chem-labs')

    // 4. Build (§22 step 4). Assert the digest, not that a build row came back.
    const build = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha },
      cookies,
      headers: key(),
    })
    expect(build.json().status).toBe('succeeded')
    expect(build.json().imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)

    // 5. Release — immutable: build + appspec + resolved config (§13).
    const release = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/releases`,
      payload: { buildId: build.json().id, summary: 'first release' },
      cookies,
      headers: key(),
    })
    expect(release.statusCode).toBe(201)
    expect(release.json().buildId).toBe(build.json().id)
    expect(release.json().resolvedConfig.staging.port).toBe(3000)
    expect(release.json().resolvedConfig.production.resources.memory).toBe('512Mi')

    // 6. Deploy to staging (§22 step 5) and reach healthy.
    const staging = project.environments.find(
      (e: { kind: string }) => e.kind === 'staging',
    )
    const deployed = await app.inject({
      method: 'POST',
      url: `/environments/${staging.id}/deploy`,
      payload: { releaseId: release.json().id },
      cookies,
      headers: key(),
    })
    expect(deployed.statusCode).toBe(200)
    expect(deployed.json().state).toBe('healthy')

    const environment = await app.inject({
      method: 'GET',
      url: `/environments/${staging.id}`,
      cookies,
    })
    expect(environment.json().hostname).toBe('chem-labs.staging.manifest.internal')
    expect(environment.json().instance.releaseId).toBe(release.json().id)

    // 7. Ask for production, and be told what is blocking (§22 step 7, §13 D19).
    const production = project.environments.find(
      (e: { kind: string }) => e.kind === 'production',
    )
    const blocked = await app.inject({
      method: 'POST',
      url: `/environments/${production.id}/deploy`,
      payload: { releaseId: release.json().id },
      cookies,
      headers: key(),
    })
    expect(blocked.statusCode).toBe(409)
    expect(
      blocked
        .json()
        .error.launchReadiness.filter((i: { blocking: boolean }) => i.blocking),
    ).toHaveLength(5)

    await app.close()

    const total = performance.now() - started
    const provisioning = afterCreate - afterBoot
    const controlPlaneWork = total - provisioning

    // §16's claim is "milliseconds, no Docker, no network", and this asserts it
    // where it is actually true. A single wall-clock budget over the whole test did
    // not: `createProject` shells out to `git` SEVEN times to seed a bare repo, and
    // measured 2026-09-05 that is 462-655 ms of a 586-813 ms run — 79% of it, and
    // all of the variance. On an idle machine the total was ~300 ms; at load average
    // 10.75 it was ~1150 ms and the 1000 ms assertion failed, for reasons that had
    // nothing to do with this code. A budget that fails on a busy laptop is a check
    // that gets deleted rather than read.
    //
    // So: the control plane's own work is held to a tight bound, and the total to a
    // loose one that still catches a real regression — a hang, or a lifecycle that
    // quietly grows to thirty seconds and stops being run.
    expect(controlPlaneWork).toBeLessThan(400)
    expect(total).toBeLessThan(5000)
  })
})
