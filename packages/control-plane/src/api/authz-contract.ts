import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { resetDatabase } from '../db/testing.js'
import { buildServer, type ServerDeps } from './server.js'

type Actor = 'owner' | 'collaborator' | 'stranger' | 'admin' | 'anonymous'

/** What each actor should get. `pass` means "not an authorization failure". */
type Expectation = 'pass' | 403 | 404 | 401

interface RouteCase {
  method: string
  /** The registered Fastify URL, so the completeness check can match on it. */
  url: string
  /**
   * Fills path params and body from the fixture.
   *
   * `payload` is an object, not `unknown`: `unknown` is not assignable to
   * Fastify's InjectPayload, and the failed overload made `app.inject` resolve to
   * its chainable form, so `response.statusCode` stopped existing. Three type
   * errors in the file the whole plan leans on, and no test could see them.
   */
  request(fixture: Fixture): { url: string; payload?: Record<string, unknown> }
  expect: Record<Actor, Expectation>
}

interface Fixture {
  projectId: string
  environmentId: { staging: string; production: string }
  buildId: string
  releaseId: string
  commitSha: string
}

const ALL_ACTORS: Actor[] = ['owner', 'collaborator', 'stranger', 'admin', 'anonymous']

/**
 * Every route, and what each actor is owed. `404` for a stranger is deliberate and
 * asserted rather than being folded into "refused": answering 403 would confirm the
 * resource exists and turn the id space into an enumeration oracle across tenants.
 */
const ROUTES: RouteCase[] = [
  {
    method: 'GET',
    url: '/auth/me',
    request: () => ({ url: '/auth/me' }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    method: 'POST',
    url: '/auth/logout',
    request: () => ({ url: '/auth/logout' }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 'pass',
    },
  },
  {
    method: 'POST',
    url: '/auth/dev-login',
    request: () => ({ url: '/auth/dev-login', payload: { puid: 'bio_prof' } }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 'pass',
    },
  },
  {
    method: 'POST',
    url: '/projects',
    request: () => ({
      url: '/projects',
      payload: { slug: `p-${randomUUID().slice(0, 8)}`, blueprint: 'fixture-node@1' },
    }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    method: 'GET',
    url: '/projects',
    request: () => ({ url: '/projects' }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    method: 'GET',
    url: '/projects/:projectId',
    request: (f) => ({ url: `/projects/${f.projectId}` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    method: 'GET',
    url: '/projects/:projectId/spec',
    request: (f) => ({ url: `/projects/${f.projectId}/spec` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    // The only route requiring `members:manage`, and so the only place a
    // collaborator is refused while a stranger is hidden. 403 and 404 in one row.
    // The payload re-adds a member who is already a collaborator: addMember is
    // idempotent, so running this case as owner and as admin does not change the
    // membership graph the other cases depend on.
    method: 'POST',
    url: '/projects/:projectId/members',
    request: (f) => ({
      url: `/projects/${f.projectId}/members`,
      payload: { puid: 'bio_student', role: 'collaborator' },
    }),
    expect: {
      owner: 'pass',
      collaborator: 403,
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    method: 'POST',
    url: '/projects/:projectId/builds',
    request: (f) => ({
      url: `/projects/${f.projectId}/builds`,
      payload: { commitSha: f.commitSha },
    }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    method: 'GET',
    url: '/builds/:buildId',
    request: (f) => ({ url: `/builds/${f.buildId}` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    method: 'POST',
    url: '/projects/:projectId/releases',
    request: (f) => ({
      url: `/projects/${f.projectId}/releases`,
      payload: { buildId: f.buildId },
    }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    method: 'POST',
    url: '/environments/:environmentId/deploy',
    request: (f) => ({
      url: `/environments/${f.environmentId.staging}/deploy`,
      payload: { releaseId: f.releaseId },
    }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    method: 'GET',
    url: '/environments/:environmentId',
    request: (f) => ({ url: `/environments/${f.environmentId.staging}` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  /**
   * The registry token realm. Unlike every other route in this table it carries NO
   * session: its caller is BuildKit or the Docker daemon speaking the distribution
   * token protocol, and it authenticates with the short-lived build credential in
   * the request itself. `requireActor` is never called, so every actor — anonymous
   * included — passes here, and the authorization that matters is the credential
   * check inside `issue()`, covered by runtime/docker/registry-auth.test.ts.
   *
   * Recorded as a decision rather than an oversight: these endpoints mint registry
   * PUSH credentials, and P2's completeness guard refused to let them ship unnamed.
   */
  {
    method: 'POST',
    url: '/internal/registry/token',
    request: () => ({
      url: '/internal/registry/token',
      payload: { scope: '', username: '', password: '' },
    }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 'pass',
    },
  },
  {
    method: 'GET',
    url: '/internal/registry/token',
    request: () => ({ url: '/internal/registry/token' }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 'pass',
    },
  },
]

export function describeAuthorizationContract(
  name: string,
  factory: () => Promise<ServerDeps>,
): void {
  describe(`authorization contract (${name})`, () => {
    let app: FastifyInstance
    let fixture: Fixture
    const cookies: Partial<Record<Actor, Record<string, string>>> = {}

    async function login(puid: string): Promise<Record<string, string>> {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/dev-login',
        payload: { puid },
      })
      return {
        manifest_session: response.cookies.find((c) => c.name === 'manifest_session')!
          .value,
      }
    }

    beforeAll(async () => {
      // The suite asserts the stranger is a member of nothing, and that only holds
      // from a clean slate. Reset here rather than in the caller: P3 imports this
      // suite unchanged and points it at a Docker-backed server, and a shared
      // artefact that silently depends on test-file ordering is one that will be
      // green for the wrong reason exactly once.
      await resetDatabase()
      app = await buildServer(await factory())
      // Four distinct identities for §16's four tiers. Reusing one for two tiers is
      // how a suite comes to assert nothing: a "collaborator" who is not a member
      // makes every collaborator expectation indistinguishable from the stranger's.
      cookies.owner = await login('bio_prof')
      cookies.collaborator = await login('bio_student')
      cookies.stranger = await login('unrelated_user')
      cookies.admin = await login('platform_admin')

      const project = await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { slug: 'authz-fixture', blueprint: 'fixture-node@1' },
        cookies: cookies.owner,
        headers: { 'idempotency-key': randomUUID() },
      })
      const body = project.json()

      const build = await app.inject({
        method: 'POST',
        url: `/projects/${body.id}/builds`,
        payload: { commitSha: body.commitSha },
        cookies: cookies.owner,
        headers: { 'idempotency-key': randomUUID() },
      })
      const release = await app.inject({
        method: 'POST',
        url: `/projects/${body.id}/releases`,
        payload: { buildId: build.json().id },
        cookies: cookies.owner,
        headers: { 'idempotency-key': randomUUID() },
      })

      fixture = {
        projectId: body.id,
        commitSha: body.commitSha,
        buildId: build.json().id,
        releaseId: release.json().id,
        environmentId: {
          staging: body.environments.find((e: { kind: string }) => e.kind === 'staging')
            .id,
          production: body.environments.find(
            (e: { kind: string }) => e.kind === 'production',
          ).id,
        },
      }

      // Make the collaborator an actual member of the fixture project. Without
      // this line every "collaborator → pass" expectation below is a lie that
      // still goes green, because 404 is not 'pass' and the test would fail — but
      // the reverse mistake (a stranger who is secretly a member) fails silently.
      await app.inject({
        method: 'POST',
        url: `/projects/${body.id}/members`,
        payload: { puid: 'bio_student', role: 'collaborator' },
        cookies: cookies.owner,
        headers: { 'idempotency-key': randomUUID() },
      })

      // The stranger must be a member of nothing. Assert it rather than assume it.
      const strangerView = await app.inject({
        method: 'GET',
        url: '/projects',
        cookies: cookies.stranger,
      })
      expect(strangerView.json()).toEqual([])
    })

    afterAll(resetDatabase)

    // The drift guard. A route added without an entry here fails the build.
    it('covers every route the server registers', () => {
      const covered = new Set(ROUTES.map((route) => `${route.method} ${route.url}`))
      const registered = app.registeredRoutes.map(
        (route) => `${route.method} ${route.url}`,
      )
      const uncovered = registered.filter((route) => !covered.has(route))
      expect(uncovered).toEqual([])
    })

    for (const route of ROUTES) {
      for (const actor of ALL_ACTORS) {
        const expected = route.expect[actor]
        it(`${route.method} ${route.url} as ${actor} → ${expected}`, async () => {
          const { url, payload } = route.request(fixture)
          const actorCookies = actor === 'anonymous' ? undefined : cookies[actor]
          // Built conditionally: under exactOptionalPropertyTypes an explicit
          // `payload: undefined` is not assignable to InjectOptions' optional
          // `payload`, and the failed overload silently turned `response` into
          // fastify's chainable type — so `response.statusCode` did not exist.
          const response = await app.inject({
            method: route.method as 'GET',
            url,
            headers: { 'idempotency-key': randomUUID() },
            ...(payload === undefined ? {} : { payload }),
            ...(actorCookies === undefined ? {} : { cookies: actorCookies }),
          })

          if (expected === 'pass') {
            expect(response.statusCode).toBeLessThan(400)
          } else {
            expect(response.statusCode).toBe(expected)
          }
        })
      }
    }
  })
}
