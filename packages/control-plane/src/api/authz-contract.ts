import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { resetDatabase } from '../db/testing.js'
import { buildServer, type ServerDeps } from './server.js'
import { loginAs, mutationHeaders } from './testing.js'

type Actor = 'owner' | 'collaborator' | 'stranger' | 'admin' | 'anonymous'

/**
 * What each actor should get. `pass` means "not an authorization failure".
 *
 * `400` was added for `/auth/saml/callback`, and it is a claim rather than a
 * convenience: the route refuses a malformed body IDENTICALLY for all five
 * actors, which is the authorization statement about a route whose credential
 * is a signed assertion rather than a session. Expecting `pass` there would have
 * meant sending a valid assertion, which this suite cannot mint — and expecting
 * 401 would have made a body error indistinguishable from a refused login.
 */
type Expectation = 'pass' | 400 | 403 | 404 | 401 | 426

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
    url: '/v1/me',
    request: () => ({ url: '/v1/me' }),
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
    method: 'GET',
    url: '/auth/login',
    request: () => ({ url: '/auth/login' }),
    // Unauthenticated by definition: this is where a person with no session
    // goes. `pass` means "not an authorization failure" — the 302 to the IdP.
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
    url: '/auth/saml/callback',
    // No SAMLResponse, so every actor gets 400 REQUEST_INVALID — and that
    // SAMENESS is the point. This route has no authorization: its credential is
    // a signed assertion, not a session, so a session must make no difference to
    // its answer. Signature, audience and replay validation are proved in
    // `auth.test.ts`, against assertions this suite has no key to mint.
    request: () => ({ url: '/auth/saml/callback', payload: {} }),
    expect: {
      owner: 400,
      collaborator: 400,
      stranger: 400,
      admin: 400,
      anonymous: 400,
    },
  },
  {
    method: 'POST',
    url: '/v1/projects',
    request: () => ({
      url: '/v1/projects',
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
    url: '/v1/projects',
    request: () => ({ url: '/v1/projects' }),
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
    url: '/v1/projects/:projectId',
    request: (f) => ({ url: `/v1/projects/${f.projectId}` }),
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
    url: '/v1/projects/:projectId/spec',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/spec` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    // Re-validates manifest.yaml at a commit. `project:write`, so a collaborator
    // passes and a stranger is hidden — the same shape as every other write on a
    // project. Idempotent for the suite's purposes: it appends an AppSpec row for
    // the SAME commit with the same result, which no other case reads.
    method: 'POST',
    url: '/v1/projects/:projectId/spec',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/spec`, payload: {} }),
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
    url: '/v1/projects/:projectId/members',
    request: (f) => ({
      url: `/v1/projects/${f.projectId}/members`,
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
    url: '/v1/projects/:projectId/builds',
    request: (f) => ({
      url: `/v1/projects/${f.projectId}/builds`,
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
    url: '/v1/builds/:buildId',
    request: (f) => ({ url: `/v1/builds/${f.buildId}` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  {
    // §14's build log. Authorized exactly like the build it belongs to — the
    // project comes from the build row, never from the request — because P2
    // measured the alternative on the route above: an IDOR answering 200.
    method: 'GET',
    url: '/v1/builds/:buildId/logs',
    request: (f) => ({ url: `/v1/builds/${f.buildId}/logs` }),
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
    url: '/v1/projects/:projectId/releases',
    request: (f) => ({
      url: `/v1/projects/${f.projectId}/releases`,
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
    url: '/v1/environments/:environmentId/deploy',
    request: (f) => ({
      url: `/v1/environments/${f.environmentId.staging}/deploy`,
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
    url: '/v1/environments/:environmentId',
    request: (f) => ({ url: `/v1/environments/${f.environmentId.staging}` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  // §14's Incidents (P4b Task 13): a failed app's last 200 log lines, so a stranger's
  // 404 matters here as much as on the build log.
  {
    method: 'GET',
    url: '/v1/environments/:environmentId/incidents',
    request: (f) => ({ url: `/v1/environments/${f.environmentId.staging}/incidents` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
    },
  },
  /**
   * D23.2's event stream (P4b Task 14). A plain GET is what this suite can send, and the
   * route answers it with the SAME authorization hook the upgrade goes through — so 426
   * is the pass here, and it is spelled out rather than folded into `pass`: `pass` means
   * below 400, and a 200 from an upgrade endpoint would mean the guard ran and the
   * stream did not. That the upgrade itself is refused is `api/events.test.ts`'s, which
   * needs a listening server.
   */
  {
    method: 'GET',
    url: '/v1/projects/:projectId/events',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/events` }),
    expect: {
      owner: 426,
      collaborator: 426,
      stranger: 404,
      admin: 426,
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
    let deps: ServerDeps
    let fixture: Fixture
    const cookies: Partial<Record<Actor, Record<string, string>>> = {}

    beforeAll(async () => {
      // The suite asserts the stranger is a member of nothing, and that only holds
      // from a clean slate. Reset here rather than in the caller: P3 imports this
      // suite unchanged and points it at a Docker-backed server, and a shared
      // artefact that silently depends on test-file ordering is one that will be
      // green for the wrong reason exactly once.
      await resetDatabase()
      deps = await factory()
      app = await buildServer(deps)
      // Four distinct identities for §16's four tiers. Reusing one for two tiers is
      // how a suite comes to assert nothing: a "collaborator" who is not a member
      // makes every collaborator expectation indistinguishable from the stranger's.
      cookies.owner = await loginAs(deps, 'bio_prof')
      cookies.collaborator = await loginAs(deps, 'bio_student')
      cookies.stranger = await loginAs(deps, 'unrelated_user')
      cookies.admin = await loginAs(deps, 'platform_admin')

      const project = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: { slug: 'authz-fixture', blueprint: 'fixture-node@1' },
        cookies: cookies.owner,
        headers: mutationHeaders(deps),
      })
      const body = project.json()

      const build = await app.inject({
        method: 'POST',
        url: `/v1/projects/${body.id}/builds`,
        payload: { commitSha: body.commitSha },
        cookies: cookies.owner,
        headers: mutationHeaders(deps),
      })
      const release = await app.inject({
        method: 'POST',
        url: `/v1/projects/${body.id}/releases`,
        payload: { buildId: build.json().id },
        cookies: cookies.owner,
        headers: mutationHeaders(deps),
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
        url: `/v1/projects/${body.id}/members`,
        payload: { puid: 'bio_student', role: 'collaborator' },
        cookies: cookies.owner,
        headers: mutationHeaders(deps),
      })

      // The stranger must be a member of nothing. Assert it rather than assume it.
      const strangerView = await app.inject({
        method: 'GET',
        url: '/v1/projects',
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
            headers: mutationHeaders(deps),
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
