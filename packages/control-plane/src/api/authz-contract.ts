import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { resetDatabase } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { buildServer, type ServerDeps } from './server.js'
import {
  addMember,
  TokenCapabilityRefusedError,
  type Capability,
} from '../projects/index.js'
import { fingerprintOf, recordPendingAction } from '../tokens/index.js'
import { mintTestToken } from '../tokens/testing.js'
import { loginAs, mutationHeaders, projectBody } from './testing.js'
import type { ErrorCode } from './error-codes.js'

/** A person in a browser. Five, because §16 names five. */
type SessionActor = 'owner' | 'collaborator' | 'stranger' | 'admin' | 'anonymous'

/**
 * AN AGENT HOLDING A DELEGATED TOKEN (D24, P5b Task 11) — the second dimension every
 * route now has. Four, each answering a different question:
 *
 * | Actor | What it proves |
 * |---|---|
 * | `token-capable` | a token holding the route's capability gets the answer an owner does — the build loop works on a token |
 * | `token-incapable` | a token minted without it is `403 FORBIDDEN`, not `404`: it can address the project |
 * | `token-other-project` | `404 NOT_FOUND` on EVERY project-scoped route, which is the only way to be sure no route reads the project id from somewhere other than the path (Decision 3) |
 * | `token-privileged` | `403 TOKEN_ACTION_PENDING` on the privileged routes — a token that HOLDS one of `PRIVILEGED` is still refused, which is D24's *"regardless of how it was minted"* |
 */
type TokenActor =
  'token-capable' | 'token-incapable' | 'token-other-project' | 'token-privileged'

type Actor = SessionActor | TokenActor

/** Every status a refusal in this table may carry. */
type RefusalStatus = 400 | 401 | 403 | 404 | 409 | 426

/**
 * What each actor should get. `pass` means "not an authorization failure".
 *
 * `400` was added for `/auth/saml/callback`, and it is a claim rather than a
 * convenience: the route refuses a malformed body IDENTICALLY for all five
 * actors, which is the authorization statement about a route whose credential
 * is a signed assertion rather than a session. Expecting `pass` there would have
 * meant sending a valid assertion, which this suite cannot mint — and expecting
 * 401 would have made a body error indistinguishable from a refused login.
 *
 * **A BARE STATUS IS NO LONGER ENOUGH, and that is P5b Task 11's first change.** Until
 * the token actors arrived, one status meant one code — `REFUSAL_CODE` below is that
 * mapping — but D24 answers a token asking for a privileged action `403
 * TOKEN_ACTION_PENDING` and a token on a session-only route `403
 * TOKEN_CREDENTIAL_REFUSED`, which are the same status as `403 FORBIDDEN` and mean
 * something a client must act on differently. So an expectation may also be an explicit
 * (status, code) pair. **The shorthand is kept deliberately**: every row written before
 * this change still means exactly what it meant, and the default mapping stays the
 * documented rule rather than becoming 360 restatements of it.
 */
type Expectation = 'pass' | RefusalStatus | { status: RefusalStatus; code: ErrorCode }

/**
 * THE CODE each refusal must carry, not only its status (P5a sitting 6). A stranger's
 * `404` was asserted by status alone, and `404 ROUTE_NOT_FOUND` — the answer for a route
 * that does not exist — satisfied it: both of Task 8's new rows passed "hidden from a
 * stranger" before either route was written. `NOT_FOUND` is the authorization answer;
 * `ROUTE_NOT_FOUND` is no route at all.
 */
const REFUSAL_CODE: Record<RefusalStatus, ErrorCode> = {
  400: 'REQUEST_INVALID',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  // §13's launch gate (P5a Task 15), reached only by the production deploy row below —
  // the one route in the table that authorizes `release:promote`.
  409: 'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
  426: 'EVENTS_UPGRADE_REQUIRED',
}

/**
 * D24's answer to an agent asking for one of `PRIVILEGED`: refused, with a question a
 * person confirms. **The same status as `FORBIDDEN` and a different meaning** — this one
 * is a loop that closes, that one is a dead end — which is why `Expectation` had to grow
 * a code (sitting 4's F1 is the measurement of what a status-only assertion misses here).
 */
const PENDING = { status: 403, code: 'TOKEN_ACTION_PENDING' } as const

/** A route D24 reserves to a person: `requireSession` refuses the credential class. */
const SESSION_ONLY = { status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' } as const

/**
 * §20's step-up: a person who may do this and has not re-proved themselves recently
 * enough (P6a Task 9). **THE FIFTH `403` IN THIS FILE**, after `FORBIDDEN`,
 * `TOKEN_CREDENTIAL_REFUSED`, `TOKEN_ACTION_PENDING` and `TOKEN_ACTION_REJECTED` — so a
 * bare `403` in a row below would be green against a route answering any of the other
 * four, which is control (e) and the fifth demonstration of P5a sitting 6's lesson here.
 *
 * **The sessions this table builds are NOT stepped up**, deliberately: `loginAs` without
 * the option. So `STEP_UP` is the honest expectation for every guarded route, and a row
 * that says `pass` after Task 9 is a row testing a guard that is not there.
 */
const STEP_UP = { status: 403, code: 'STEP_UP_REQUIRED' } as const

function refusalOf(expected: Exclude<Expectation, 'pass'>): {
  status: RefusalStatus
  code: ErrorCode
} {
  return typeof expected === 'object'
    ? expected
    : { status: expected, code: REFUSAL_CODE[expected] }
}

/** For the test's own name, so a `403` row says WHICH `403` it means. */
function describeExpectation(expected: Expectation): string {
  if (expected === 'pass') return 'pass'
  const { status, code } = refusalOf(expected)
  return `${status} ${code}`
}

function codeOf(body: string): unknown {
  try {
    return (JSON.parse(body) as { error?: { code?: unknown } }).error?.code
  } catch {
    return undefined
  }
}

interface RouteCase {
  method: string
  /** The registered Fastify URL, so the completeness check can match on it. */
  url: string
  /**
   * Distinguishes two rows that exercise ONE registered route differently — the deploy
   * route is the first, because `POST /v1/environments/{id}/deploy` authorizes
   * `release:deploy` for a staging environment and `release:promote` for a production
   * one, and those are two different authorization statements (P5b Task 2). It is part
   * of the test's NAME only; the completeness check keys on method and url, where the
   * duplicate collapses harmlessly.
   */
  label?: string
  /**
   * Fills path params and body from the fixture.
   *
   * `payload` is an object, not `unknown`: `unknown` is not assignable to
   * Fastify's InjectPayload, and the failed overload made `app.inject` resolve to
   * its chainable form, so `response.statusCode` stopped existing. Three type
   * errors in the file the whole plan leans on, and no test could see them.
   */
  /**
   * `actor` is here since P5b Task 7, and only the pending-action rows use it: confirming
   * RESOLVES the row, so one row shared across the five actors would answer the fourth of
   * them `409 PENDING_ACTION_RESOLVED` — a state refusal wearing an authorization
   * expectation's clothes. Each actor gets its own question, so this table measures who
   * may answer and never what has already been answered.
   */
  request(
    fixture: Fixture,
    actor: Actor,
  ): { url: string; payload?: Record<string, unknown> }
  expect: Record<Actor, Expectation>
}

interface Fixture {
  projectId: string
  /**
   * A SECOND project, owned by the same person, that `token-other-project` is scoped to.
   * Decision 3's scope rule is only observable against a project that really exists: a
   * token pointed at a random uuid would get its `404` from the row's absence, which is
   * the answer a non-existent project gets rather than the answer the scope rule gives.
   */
  otherProjectId: string
  environmentId: { staging: string; production: string }
  buildId: string
  releaseId: string
  commitSha: string
  /** A delegated token the OWNER minted (P5b Task 4) — what the revoke row is aimed at. */
  tokenId: string
  /** One PENDING question per route and per actor (P5b Task 7); see `request` above. */
  pendingActionId: Record<'confirm' | 'reject', Record<Actor, string>>
  /**
   * `platform_admin`'s `users.id`, made a COLLABORATOR of the fixture project purely so
   * the removal row has somebody to remove (P5b Task 8).
   *
   * Not `bio_student`: every `collaborator: 'pass'` expectation in this table depends on
   * that membership, and the owner's case here would take it away. `platform_admin`
   * passes everywhere by their platform ROLE, not by membership, so removing them changes
   * no other row — and the admin's own case is then the idempotent second removal, which
   * is the same shape the `POST .../members` row above relies on.
   */
  removableUserId: string
}

const SESSION_ACTORS: SessionActor[] = [
  'owner',
  'collaborator',
  'stranger',
  'admin',
  'anonymous',
]

const TOKEN_ACTORS: TokenActor[] = [
  'token-capable',
  'token-incapable',
  'token-other-project',
  'token-privileged',
]

/**
 * **THE TOKEN ACTORS COME LAST, and the order is load-bearing.** Two rows in this table
 * MUTATE — `DELETE …/members/:userId` really removes `platform_admin` on the owner's
 * case and repeats it idempotently on the admin's, and `POST …/members` re-adds
 * `bio_student` — so the five session actors must keep running in the order they always
 * have. None of the four token cases changes the membership graph (each is refused), but
 * appending rather than interleaving is what makes that a fact about the order rather
 * than a fact about the expectations.
 */
const ALL_ACTORS: Actor[] = [...SESSION_ACTORS, ...TOKEN_ACTORS]

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
      // Decision 4: a token carries no platform role and no `puid`, so every route
      // that reads either takes a `SessionActor` and `tsc` refuses the union.
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
    },
  },
  {
    // §9's SLO endpoint. Open to every actor for the same reason the POST is: the
    // IdP is the caller and it carries no Manifest credential at all. What guards
    // it is the SIGNATURE on the LogoutRequest, checked against `idpCert`, not the
    // authorization layer — so `pass` here means "reaches the handler", and the
    // handler refuses an unverifiable request `400 SAML_LOGOUT_REJECTED`.
    method: 'GET',
    url: '/auth/logout',
    request: () => ({ url: '/auth/logout' }),
    // EVERY actor gets the same answer, and that is the claim worth asserting:
    // authorization is IRRELEVANT on this route. What guards §9's SLO endpoint is
    // the SIGNATURE on the LogoutRequest, checked against `idpCert` — so a request
    // carrying none is `400 SAML_LOGOUT_REJECTED` for an owner, a stranger and an
    // anonymous caller alike. **Asserted by CODE, never by status alone**: this row
    // is the guard that would have caught F11. **Measured, because the first draft of
    // this comment overstated it**: a DELETED route answers `404 ROUTE_NOT_FOUND`, which
    // a status-only row catches anyway on the status. What a status-only row does NOT
    // catch is a different `400` moving in front — swapping this code for
    // `REQUEST_INVALID` leaves the status at 400 and was watched turning all nine rows
    // red only because the code is asserted.
    expect: {
      owner: { status: 400, code: 'SAML_LOGOUT_REJECTED' } as const,
      collaborator: { status: 400, code: 'SAML_LOGOUT_REJECTED' } as const,
      stranger: { status: 400, code: 'SAML_LOGOUT_REJECTED' } as const,
      admin: { status: 400, code: 'SAML_LOGOUT_REJECTED' } as const,
      anonymous: { status: 400, code: 'SAML_LOGOUT_REJECTED' } as const,
      'token-capable': { status: 400, code: 'SAML_LOGOUT_REJECTED' } as const,
      'token-incapable': { status: 400, code: 'SAML_LOGOUT_REJECTED' } as const,
      'token-other-project': { status: 400, code: 'SAML_LOGOUT_REJECTED' } as const,
      'token-privileged': { status: 400, code: 'SAML_LOGOUT_REJECTED' } as const,
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
      'token-capable': 'pass',
      'token-incapable': 'pass',
      'token-other-project': 'pass',
      'token-privileged': 'pass',
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
      'token-capable': 'pass',
      'token-incapable': 'pass',
      'token-other-project': 'pass',
      'token-privileged': 'pass',
    },
  },
  {
    /**
     * §20's STEP-UP (P6a Task 8). The one `/auth/` route with an authorization answer:
     * `/auth/login` is unauthenticated by definition and the ACS's credential is the
     * assertion, but stepping up is **re-proving a person who is already here** — so it
     * needs a session, and a delegated token can never have one.
     *
     * **`pass` here means the 302 to the IdP**, not that a step-up completed; the claim
     * is only stamped by the callback, and `auth.test.ts` is what proves that.
     *
     * THIS ROW IS WHY THE DRIFT GUARD EXISTS. Task 8's own *Files* list does not name
     * this table at all, and *"covers every route the server registers"* is what put it
     * here — the nine actors then come for free, including the token refusal Task 8's
     * step 6 asks for by name.
     */
    method: 'GET',
    url: '/auth/step-up',
    request: () => ({ url: '/auth/step-up' }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      // A STRANGER PASSES, and that is correct rather than a hole: stepping up proves
      // who you are, and it authorizes nothing by itself. Every guarded route asks
      // `assertCapability` first and `assertStepUp` second (Task 9).
      stranger: 'pass',
      admin: 'pass',
      anonymous: 401,
      // D24, through `requireSession`: a token has no session to step up, and a route
      // that let it start one would be minting a browser flow for an agent.
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
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
      // The same 400 as every session: this route's credential is the assertion.
      'token-capable': 400,
      'token-incapable': 400,
      'token-other-project': 400,
      'token-privileged': 400,
    },
  },
  {
    method: 'POST',
    url: '/v1/projects',
    request: () => ({
      url: '/v1/projects',
      payload: projectBody(`p-${randomUUID().slice(0, 8)}`),
    }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 401,
      // Decision 13: a token is scoped to ONE project, so a token creating a second
      // would make something it cannot then address. Decision 12a rests on this — it
      // is how §24's audience question stays human-only, since `audience` is set
      // here and nowhere else.
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
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
      // Decision 12: it answers a token exactly its own project — scoping behaving
      // correctly rather than a refusal a client must special-case.
      // `token-other-project` passes too, and sees its own one.
      'token-capable': 'pass',
      'token-incapable': 'pass',
      'token-other-project': 'pass',
      'token-privileged': 'pass',
    },
  },
  {
    // §23 (P5a Task 9): any signed-in person may ask, and the answer says nothing about a
    // holder — so there is no stranger to hide anything from.
    method: 'GET',
    url: '/v1/slugs/:slug',
    request: () => ({ url: '/v1/slugs/journey-app' }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 'pass',
      'token-other-project': 'pass',
      'token-privileged': 'pass',
    },
  },
  {
    // §25, D25 (P5a Task 10): a blueprint belongs to no project, so every signed-in
    // person may read it and there is no stranger to hide it from.
    method: 'GET',
    url: '/v1/blueprints',
    request: () => ({ url: '/v1/blueprints' }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 'pass',
      'token-other-project': 'pass',
      'token-privileged': 'pass',
    },
  },
  {
    // §25, D25 (P5a Task 10): a blueprint belongs to no project, so every signed-in
    // person may read it and there is no stranger to hide it from.
    method: 'GET',
    url: '/v1/blueprints/:blueprintRef',
    request: () => ({ url: '/v1/blueprints/fixture-node@1' }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 'pass',
      'token-other-project': 'pass',
      'token-privileged': 'pass',
    },
  },
  {
    // §25, D25 (P5a Task 10): a blueprint belongs to no project, so every signed-in
    // person may read it and there is no stranger to hide it from.
    method: 'GET',
    url: '/v1/blueprints/:blueprintRef/knowledge-pack',
    request: () => ({ url: '/v1/blueprints/fixture-node@1/knowledge-pack' }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 'pass',
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 'pass',
      'token-other-project': 'pass',
      'token-privileged': 'pass',
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
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
    },
  },
  {
    // P5a Task 8. The environments a project holds — the same capability as the project.
    method: 'GET',
    url: '/v1/projects/:projectId/environments',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/environments` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
    },
  },
  {
    // P5a Task 8. Reading who is a member is `project:read`; CHANGING it stays `members:manage`.
    method: 'GET',
    url: '/v1/projects/:projectId/members',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/members` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
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
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
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
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
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
      // **STEP_UP SINCE P6a TASK 9, WHERE BOTH WERE `pass`.** §20 names member
      // management, and these sessions are ordinary ones — so the route is reached,
      // `assertCapability` lets them through on role, and `assertStepUp` refuses. The
      // capability answer and the freshness answer are two different refusals with two
      // different remedies, and this row asserts which one arrives.
      //
      // A consequence worth knowing: **neither of this table's two mutating rows mutates
      // any more.** The note above `ALL_ACTORS` says the token actors come last because
      // the owner's case here really adds and the removal below really removes; both are
      // now refused before they touch the graph, and the fixture's own setup is what
      // makes `bio_student` a collaborator (see it, above — it steps up, and asserts).
      owner: STEP_UP,
      // The capability check runs FIRST, so a collaborator is still `FORBIDDEN` and
      // never learns that a step-up would have been the next obstacle. Order asserted
      // by two rows rather than stated in a comment.
      collaborator: 403,
      stranger: 404,
      admin: STEP_UP,
      anonymous: 401,
      // **ALL THREE SCOPED TOKENS GET THE SAME ANSWER, and that is D24's sentence.**
      // `assertCapability` checks scope, then the privileged rule, then the token's
      // own set — so whether a token was minted holding `members:manage`
      // (`token-privileged`, which no route would mint) or without it
      // (`token-capable`) makes no difference: both are refused regardless of how
      // it was minted, with a question a person confirms. Asserted by CODE, because
      // `403 FORBIDDEN` is also a `403` and would satisfy a status-only expectation
      // while D24's loop could not start at all (sitting 4's F1).
      'token-capable': PENDING,
      'token-incapable': PENDING,
      'token-other-project': 404,
      'token-privileged': PENDING,
    },
  },
  {
    /**
     * D24's fourth privileged action, and the first route written AFTER the rule was made
     * central (P5b Task 8). A collaborator is refused and a stranger is hidden, exactly as
     * on `POST .../members`, because it is the same capability.
     *
     * The owner's case is a real removal; the admin's is the idempotent repeat of it. A
     * removal that finds nobody answers the same way — `api/delegation.test.ts` asserts
     * that behaviour, this table asserts only who may ask.
     */
    method: 'DELETE',
    url: '/v1/projects/:projectId/members/:userId',
    request: (f) => ({
      url: `/v1/projects/${f.projectId}/members/${f.removableUserId}`,
    }),
    expect: {
      // The same capability, so the same guard (P6a Task 9, Decision 9) — and because
      // both are refused, `removableUserId` is no longer removed by this table at all.
      owner: STEP_UP,
      collaborator: 403,
      stranger: 404,
      admin: STEP_UP,
      anonymous: 401,
      // The same capability, so the same answer — and this is the route written
      // AFTER the rule was made central (Task 8), which is why it is here without
      // having done anything about tokens itself.
      'token-capable': PENDING,
      'token-incapable': PENDING,
      'token-other-project': 404,
      'token-privileged': PENDING,
    },
  },
  {
    // §26's queue. Reading it is `project:read` — a collaborator watches the queue even
    // though answering a question needs the capability the question is about.
    method: 'GET',
    url: '/v1/projects/:projectId/pending-actions',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/pending-actions` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
    },
  },
  {
    /**
     * One question, read. `confirm.anonymous` is the row deliberately: it is the one no
     * actor in this table ever resolves — anonymous is answered 401 by the confirm row
     * above — so this case cannot depend on whether it has run yet. A read does not
     * consume, so `request` ignores the actor.
     */
    method: 'GET',
    url: '/v1/pending-actions/:pendingActionId',
    request: (f) => ({
      url: `/v1/pending-actions/${f.pendingActionId.confirm.anonymous}`,
    }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      // **A TOKEN READS ONLY THE QUESTIONS IT ASKED** (Task 8), and every row in this
      // fixture was asked by a different token — so all four are answered `404`,
      // exactly as a stranger is and for the same enumeration reason. That a token
      // CAN read its own is `api/delegation.test.ts`'s *shows the token only ITS OWN
      // questions*; this table asserts the half that hides another agent's.
      'token-capable': 404,
      'token-incapable': 404,
      'token-other-project': 404,
      'token-privileged': 404,
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
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
    },
  },
  {
    // P5a Task 13: a reader of the project may list its builds; the project comes from the
    // path, so a stranger is hidden exactly as the project itself hides them.
    method: 'GET',
    url: '/v1/projects/:projectId/builds',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/builds` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
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
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
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
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
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
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
    },
  },
  {
    // P5a Task 14: a reader of the project may read one of its releases. The project comes
    // from the release ROW, so a stranger gets the 404 the project itself gives them.
    method: 'GET',
    url: '/v1/releases/:releaseId',
    request: (f) => ({ url: `/v1/releases/${f.releaseId}` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
    },
  },
  {
    method: 'GET',
    url: '/v1/projects/:projectId/releases',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/releases` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
    },
  },
  /**
   * **P6a TASK 10: `release:approve`'s FIRST THREE ROUTES, and its first caller ever.**
   *
   * **NO ACTOR PASSES `approve` OR `reject`, AND THAT IS THE HONEST TABLE RATHER THAN A
   * GAP.** `admin` is the only actor who holds `release:approve`, and §20 guards it — so
   * the answer to an ordinary admin session is `STEP_UP_REQUIRED`, which is what this
   * table's sessions are. A tenth, stepped-up actor would be a dimension every route pays
   * for (P5b added the ninth); **the stepped-up path is asserted in `approval.test.ts`,
   * which is where the positive control for these two routes lives.** The fixture below
   * approves the release once, with a stepped-up admin whose 201 it asserts — so this file
   * does hold a positive control, and `getApproval` has something to answer.
   *
   * `owner` and `collaborator` are `FORBIDDEN` and not `STEP_UP_REQUIRED`: the capability
   * is checked BEFORE the freshness, so somebody who may not approve is told that rather
   * than sent on a round trip that would not help them.
   *
   * The four token rows are `TOKEN_CREDENTIAL_REFUSED`, identically, for Task 6's measured
   * reason: `requireSession` runs before the release is read, so the answer is the same for
   * every release id and a token learns nothing about which releases exist. **`release:approve`
   * is NOT one of D24's four**, so `token-privileged` gets no pending action either — and
   * asserting the CODE is the only way to see that.
   */
  {
    method: 'POST',
    url: '/v1/releases/:releaseId/approve',
    request: (f) => ({ url: `/v1/releases/${f.releaseId}/approve`, payload: {} }),
    expect: {
      owner: 403,
      collaborator: 403,
      stranger: 404,
      admin: STEP_UP,
      anonymous: 401,
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
    },
  },
  {
    method: 'POST',
    url: '/v1/releases/:releaseId/reject',
    request: (f) => ({
      // A REASON, because the schema requires one (D23.7) — without it every row would be
      // `400 REQUEST_INVALID` and this table would say nothing about who may reject.
      url: `/v1/releases/${f.releaseId}/reject`,
      payload: { reason: 'not for this table to say' },
    }),
    expect: {
      owner: 403,
      collaborator: 403,
      stranger: 404,
      admin: STEP_UP,
      anonymous: 401,
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
    },
  },
  {
    // **`project:read`, NOT `release:approve`** — an owner must be able to see why their
    // release was rejected, in the administrator's own words. So this row looks like
    // `GET /v1/releases/:releaseId`'s and not like the two above it, which is the whole
    // authorization statement: deciding is the administrator's, reading the decision is
    // the project's.
    method: 'GET',
    url: '/v1/releases/:releaseId/approval',
    request: (f) => ({ url: `/v1/releases/${f.releaseId}/approval` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
    },
  },
  {
    // §13 (P5a Task 15): a project read, not a deploy one — a collaborator who cannot
    // deploy can still see what a first launch will need.
    method: 'GET',
    url: '/v1/projects/:projectId/launch-readiness',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/launch-readiness` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
    },
  },
  {
    // §9 and D19: readable by the PROJECT, not only by an administrator — §13 surfaces the
    // checklist "the moment a project is created", and an owner who cannot see whether
    // their PIA is in has no way to chase it.
    method: 'GET',
    url: '/v1/projects/:projectId/launch-records',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/launch-records` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
    },
  },
  /**
   * **THE TOKEN ROWS ARE THIS TASK'S AUTHORIZATION STORY** (P6a Decision 4). `launch:record`
   * is NOT one of D24's privileged four, so `assertCapability` would let a token holding it
   * straight through — and a platform administrator can mint one, because the mint route
   * refuses only `PRIVILEGED`. The control is `requireSession` on the route, and it runs
   * FIRST, before the capability and before the project is read.
   *
   * That order is why all four token actors get the same answer, including
   * `token-other-project`: the refusal is about the CREDENTIAL CLASS and is identical for
   * every project id, so a token learns nothing about which projects exist. **A token that
   * could satisfy the platform's own launch gate is D14 exactly inverted.**
   */
  {
    method: 'POST',
    url: '/v1/projects/:projectId/launch-records/iam-registration',
    request: (f) => ({
      url: `/v1/projects/${f.projectId}/launch-records/iam-registration`,
      payload: {
        entityId: 'https://manifest.internal/sp/authz/production',
        acsUrl: 'https://authz.manifest.internal/auth/saml/callback',
        sloUrl: 'https://authz.manifest.internal/auth/logout',
        registeredAttributes: ['displayName', 'mail'],
        state: 'submitted',
        externalTicketRef: 'IAM-AUTHZ-1',
      },
    }),
    expect: {
      // A faculty member cannot assert that their own PIA was approved (Decision 4).
      owner: 403,
      collaborator: 403,
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      // Refused for the credential class BEFORE any capability is read — and
      // `token-capable` holds `launch:record`, which is what makes this row mean anything.
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      // **MEASURED, AND THE PLAN'S OWN TABLE SAID `404 NOT_FOUND` HERE.** It does not:
      // `requireSession` runs before `assertCapability`, so the project is never read and
      // the answer is identical for every id. That is the RIGHT order — the alternative
      // answers `404` for another project and `TOKEN_CREDENTIAL_REFUSED` for this one,
      // which tells a token which projects exist.
      'token-other-project': SESSION_ONLY,
      // NOT `TOKEN_ACTION_PENDING`: `launch:record` is not one of D24's four, so no
      // pending action is ever created — and asserting the CODE is the only way to see it.
      'token-privileged': SESSION_ONLY,
    },
  },
  {
    method: 'POST',
    url: '/v1/projects/:projectId/launch-records/privacy-assessment',
    request: (f) => ({
      url: `/v1/projects/${f.projectId}/launch-records/privacy-assessment`,
      payload: { state: 'submitted', externalTicketRef: 'PIA-AUTHZ-1' },
    }),
    expect: {
      owner: 403,
      collaborator: 403,
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
    },
  },
  {
    method: 'POST',
    url: '/v1/environments/:environmentId/deploy',
    label: 'staging',
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
      // **STAGING, so this is `release:deploy` and NOT privileged** — which is the
      // point of separating the two capabilities (Task 2, `[M2]`): an agent must be
      // able to run the build loop to staging on its own authority. The row below
      // is the same registered route authorizing `release:promote` instead.
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
    },
  },
  /**
   * **THE SAME REGISTERED ROUTE, AUTHORIZING `release:promote` INSTEAD** (P5b Task 11).
   *
   * `POST /v1/environments/{id}/deploy` asserts `release:deploy` for a sandbox or a
   * staging environment and `release:promote` when the environment's `kind` is
   * production, BEFORE §13's launch gate (Task 2). Until this row the suite deployed only
   * to staging, so **the one route in the platform that authorizes D24's second privileged
   * capability had no case here at all** — and `token-privileged` would have had a single
   * capability (`members:manage`) behind all of its `TOKEN_ACTION_PENDING` expectations.
   *
   * The `409` is §13's gate, and it is the right `pass`-equivalent for a person: the
   * owner's and admin's cases prove the authorization passed and the GATE stopped them,
   * not that they were refused. The day readiness can be met this row goes red, which is
   * a contract suite doing its job.
   *
   * **THIS ROW'S MEANING CHANGED IN P6a TASK 7 AND ITS VALUES DID NOT, WHICH IS EXACTLY
   * HOW A SUITE STOPS TESTING WHAT IT CLAIMS.** Until that task the route refused every
   * production deploy UNCONDITIONALLY — the `409` was a statement that the gate was shut,
   * full stop. Now `assertLaunchable` evaluates the checklist, and this `409` says
   * something narrower: **the project in this fixture has no IAM registration and no PIA
   * recorded, and `rehearsal` and `admin-approval` are not built**, so `ready` is `false`
   * and the gate refuses for a reason. Both readings produce the same two `409`s.
   *
   * **SO THIS ROW IS NOT COVERAGE FOR TASK 7** (`[M8]`, measured): 370 tests stayed green
   * on both sides of the change, INCLUDING a version that left `assertLaunchable` throwing
   * unconditionally. The gate's own behaviour is asserted in `launch/readiness.test.ts`
   * and in `delivery.test.ts`, where the refusal's `launchReadiness` is the assertion.
   *
   * A collaborator holds `release:deploy` and NOT `release:promote` (§13, Task 2), so
   * theirs is the `403` that separates the two capabilities — the only assertion anywhere
   * that a collaborator may deploy to staging and may not promote.
   */
  {
    method: 'POST',
    url: '/v1/environments/:environmentId/deploy',
    label: 'production',
    request: (f) => ({
      url: `/v1/environments/${f.environmentId.production}/deploy`,
      payload: { releaseId: f.releaseId },
    }),
    expect: {
      // **STEP_UP SINCE P6a TASK 15, WHERE BOTH WERE `409`** — §20's sentence made true of
      // the deploy as well as of the decision (Rich, 2026-09-20). `release:promote` has
      // been in `STEP_UP_GUARDED` since sitting 6 with no route asking for it; now the
      // production branch asks, and an ordinary session never reaches §13's gate. **The
      // two rows are the only thing in the suite that can see that call site**: removing
      // it turns both back into the `409` this row used to expect, which is the plan's
      // control (e).
      owner: STEP_UP,
      collaborator: 403,
      stranger: 404,
      admin: STEP_UP,
      anonymous: 401,
      // Privileged, so every scoped token is refused with a question a person answers —
      // whatever its own capability set says, and before the launch gate is consulted.
      'token-capable': PENDING,
      'token-incapable': PENDING,
      'token-other-project': 404,
      'token-privileged': PENDING,
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
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
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
      'token-capable': 'pass',
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 'pass',
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
      // The stream authorizes with `requireActor` and `project:read`, so a token
      // reaches the same `426` a person does. It is registered OUTSIDE
      // `registerRoutes` (`[M7]`), so a privileged capability checked here would
      // escape the wrapper that records a `PendingAction` — harmless while the
      // capability is `project:read`, and `api/errors.ts` fails closed with an
      // operator line the day it is not.
      'token-capable': 426,
      'token-incapable': 403,
      'token-other-project': 404,
      'token-privileged': 426,
    },
  },
  {
    // §26 (P5a Task 16): platform administrators only. 403, not 404 — there is no tenant's
    // resource to hide, and "you are not an administrator" is the true answer.
    method: 'GET',
    url: '/v1/fleet',
    request: () => ({ url: '/v1/fleet' }),
    expect: {
      owner: 403,
      collaborator: 403,
      stranger: 403,
      admin: 'pass',
      anonymous: 401,
      // Decision 4: §26's fleet is cross-tenant, and a leaked project-scoped token
      // must not become a read of every project on the platform.
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
    },
  },
  /**
   * D24's delegated tokens (P5b Task 4). Minting is a `project:write`, so a collaborator
   * may mint one — bounded by what they hold themselves, which `api/tokens.test.ts`
   * asserts; listing is a `project:read`; and both hide the project from a stranger.
   */
  {
    method: 'POST',
    url: '/v1/projects/:projectId/tokens',
    request: (f) => ({
      url: `/v1/projects/${f.projectId}/tokens`,
      payload: { name: 'authz', capabilities: ['project:read'], expiresInDays: 30 },
    }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      // D24: a token is minted *in an interactive session*. An agent minting its own
      // successor is how a scoped credential escapes its scope and its expiry.
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
    },
  },
  {
    method: 'GET',
    url: '/v1/projects/:projectId/tokens',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/tokens` }),
    expect: {
      owner: 'pass',
      collaborator: 'pass',
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
    },
  },
  {
    // ONLY THE MINTER, and everyone else gets the answer a token id that does not exist
    // gets — including the platform admin, who is not exempt from it. 404 rather than
    // 403 for the same reason a stranger's project read is: a 403 would confirm the id.
    method: 'DELETE',
    url: '/v1/tokens/:tokenId',
    request: (f) => ({ url: `/v1/tokens/${f.tokenId}` }),
    expect: {
      owner: 'pass',
      collaborator: 404,
      stranger: 404,
      admin: 404,
      anonymous: 401,
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
    },
  },
  /**
   * D24's loop closing (P5b Task 7). A confirmation is not a read of the queue — it lets a
   * delegated token past the rule D24 makes central — so the person answering must hold
   * the capability THEMSELVES: a collaborator who may not manage members may not wave one
   * through either, which is the `403` below, and a stranger is told the question does not
   * exist. A token gets `TOKEN_CREDENTIAL_REFUSED` from `requireSession` and is not in
   * this table's five actors; `api/delegation.test.ts` asserts it.
   */
  {
    method: 'POST',
    url: '/v1/pending-actions/:pendingActionId/confirm',
    request: (f, actor) => ({
      url: `/v1/pending-actions/${f.pendingActionId.confirm[actor]}/confirm`,
      payload: {},
    }),
    expect: {
      // **STEP_UP SINCE P6a SITTING 6's F12, WHERE BOTH WERE `pass`.** Confirming one of
      // D24's privileged four is doing it by proxy — `assertCapability` two lines up
      // already requires the person to hold it themselves — so §20 holds it to the same
      // freshness. **The REJECT row below is deliberately still `pass`**, and the pair is
      // the whole statement: the safe direction stays free.
      owner: STEP_UP,
      collaborator: 403,
      stranger: 404,
      admin: STEP_UP,
      anonymous: 401,
      // A token confirming its own pending action would be a loop with no human in
      // it, which is the whole of what D24 asks for (Task 7).
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
    },
  },
  {
    method: 'POST',
    url: '/v1/pending-actions/:pendingActionId/reject',
    request: (f, actor) => ({
      url: `/v1/pending-actions/${f.pendingActionId.reject[actor]}/reject`,
      payload: { reason: 'not this term' },
    }),
    expect: {
      owner: 'pass',
      collaborator: 403,
      stranger: 404,
      admin: 'pass',
      anonymous: 401,
      'token-capable': SESSION_ONLY,
      'token-incapable': SESSION_ONLY,
      'token-other-project': SESSION_ONLY,
      'token-privileged': SESSION_ONLY,
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
      // No `requireActor`: its caller is BuildKit speaking the distribution token
      // protocol, and the credential is in the request. A bearer changes nothing.
      'token-capable': 'pass',
      'token-incapable': 'pass',
      'token-other-project': 'pass',
      'token-privileged': 'pass',
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
      'token-capable': 'pass',
      'token-incapable': 'pass',
      'token-other-project': 'pass',
      'token-privileged': 'pass',
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
    /** The four token actors' plaintexts, sent as `Authorization: Bearer`. */
    const bearers: Partial<Record<TokenActor, string>> = {}

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
        payload: projectBody('authz-fixture'),
        cookies: cookies.owner,
        headers: mutationHeaders(deps),
      })
      const body = project.json()

      const build = await app.inject({
        method: 'POST',
        url: `/v1/projects/${body.id}/builds`,
        payload: { commitSha: body.spec.commitSha },
        cookies: cookies.owner,
        headers: mutationHeaders(deps),
      })
      // A build answers 202 and runs in the background (R6); a release needs it ended.
      await deps.builds.idle()
      const release = await app.inject({
        method: 'POST',
        url: `/v1/projects/${body.id}/releases`,
        payload: { buildId: build.json().id },
        cookies: cookies.owner,
        headers: mutationHeaders(deps),
      })

      const token = await app.inject({
        method: 'POST',
        url: `/v1/projects/${body.id}/tokens`,
        payload: {
          name: 'authz-fixture',
          capabilities: ['project:read'],
          expiresInDays: 30,
        },
        cookies: cookies.owner,
        headers: mutationHeaders(deps),
      })

      /**
       * THE SECOND PROJECT, and the four delegated tokens (P5b Task 11).
       *
       * All four are written with `mintTestToken` rather than through
       * `POST /v1/projects/{id}/tokens`, and that is a decision: `token-privileged` holds
       * one of `PRIVILEGED`, which the mint route refuses by name — a state no route can
       * produce and the only state in which D24's *"regardless of how it was minted"* is
       * observable (sitting 4's F1). Minting three through the route and one past it
       * would leave the four actors differing in two ways at once. **What the route would
       * and would not accept is `api/tokens.test.ts`'s subject; this table is about what
       * a token may DO.**
       *
       * `token-capable`'s set is nonetheless exactly what the route WOULD mint for this
       * owner: every capability `OWNER` holds that is not one of `PRIVILEGED`.
       *
       * **The rate limit is far above the case count on purpose** (§7e): since sitting 6
       * every route can answer a token `429`, and the suite fires each actor at every
       * route in one window — so a token on the 600-a-minute default would, if this table
       * ever grew past it, start refusing later routes for a reason `Expectation` cannot
       * express and the failures would read as authorization defects.
       */
      const otherProject = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: projectBody(`authz-other-${randomUUID().slice(0, 8)}`),
        cookies: cookies.owner,
        headers: mutationHeaders(deps),
      })
      const otherProjectId = otherProject.json().id as string

      const CAPABLE: Capability[] = [
        'project:read',
        'project:write',
        'project:delete',
        'build:create',
        'release:create',
        'release:deploy',
        // P6a Task 6: `token-capable` must HOLD `launch:record` for the two record rows to
        // mean anything — a token refused for not holding it would prove nothing about the
        // credential-class rule. It is mintable, because it is not one of D24's four, and
        // no other row's expectation moves: a token holding one more capability is still
        // capable of everything it was.
        'launch:record',
      ]
      const tokenFor = async (
        actor: TokenActor,
        scope: string,
        capabilities: Capability[],
      ): Promise<void> => {
        const { plaintext } = await mintTestToken(deps.db, {
          userId: (await ensureTestUser(deps.db, 'bio_prof')).id,
          projectId: scope,
          capabilities,
          name: actor,
          rateLimit: 100_000,
        })
        bearers[actor] = plaintext
      }
      await tokenFor('token-capable', body.id, CAPABLE)
      // `project:delete` is a `Capability` NO route asserts (nothing deletes a project),
      // which is what makes this actor incapable of every route while still able to
      // address the project — the `403`-not-`404` distinction the row is for. An empty
      // set would do the same and is a state the mint route refuses (`min(1)`).
      await tokenFor('token-incapable', body.id, ['project:delete'])
      await tokenFor('token-other-project', otherProjectId, CAPABLE)
      await tokenFor('token-privileged', body.id, [
        ...CAPABLE,
        'members:manage',
        'release:promote',
      ])

      /**
       * TEN pending questions — one per route, per actor — recorded the way the platform
       * records them, through `recordPendingAction`, with a fingerprint that differs per
       * actor so the reuse lookup gives each its own row rather than handing back the
       * first. They are `pending` and stay that way for every actor but the two expected
       * to resolve one.
       */
      const askFor = async (how: 'confirm' | 'reject', actor: Actor): Promise<string> => {
        const row = await recordPendingAction(deps.db, deps.bus, {
          error: new TokenCapabilityRefusedError(
            'members:manage',
            body.id,
            token.json().token.id,
          ),
          fingerprint: fingerprintOf({
            method: 'POST',
            url: `/v1/projects/${body.id}/members`,
            body: { puid: 'bio_student', role: 'collaborator', who: `${how}:${actor}` },
            summary: 'Add or change a member',
          }),
        })
        return row.id
      }
      const questions = async (how: 'confirm' | 'reject') =>
        Object.fromEntries(
          await Promise.all(ALL_ACTORS.map(async (a) => [a, await askFor(how, a)])),
        ) as Record<Actor, string>

      // The removal row's target: a member whose going changes no other expectation.
      const removable = await ensureTestUser(deps.db, 'platform_admin')
      await addMember(deps.db, body.id, removable.id, 'collaborator')

      fixture = {
        projectId: body.id,
        otherProjectId,
        removableUserId: removable.id,
        tokenId: token.json().token.id,
        pendingActionId: {
          confirm: await questions('confirm'),
          reject: await questions('reject'),
        },
        commitSha: body.spec.commitSha,
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

      /**
       * Make the collaborator an actual member of the fixture project. Without this
       * line every "collaborator → pass" expectation below is a lie that still goes
       * green, because 404 is not 'pass' and the test would fail — but the reverse
       * mistake (a stranger who is secretly a member) fails silently.
       *
       * **A STEPPED-UP OWNER, AND ITS ANSWER IS ASSERTED** (P6a Task 9). §20's guard
       * now refuses `members:manage` from an ordinary session, so this setup call was
       * refused `403 STEP_UP_REQUIRED` — and because nothing read its status, the
       * failure arrived as **29 unrelated `collaborator → pass` rows answering 404**,
       * in every part of the table but this one. The plan predicted four red rows and
       * measured thirty-three. **The fixture is not what this table tests**, so it
       * steps up; the ROWS keep ordinary sessions, because a row reading `pass` on a
       * guarded route is a row testing a guard that is not there.
       */
      const madeCollaborator = await app.inject({
        method: 'POST',
        url: `/v1/projects/${body.id}/members`,
        payload: { puid: 'bio_student', role: 'collaborator' },
        cookies: await loginAs(deps, 'bio_prof', { steppedUp: true }),
        headers: mutationHeaders(deps),
      })
      expect({
        status: madeCollaborator.statusCode,
        code: codeOf(madeCollaborator.body),
      }).toEqual({ status: 201, code: undefined })

      /**
       * **THE POSITIVE CONTROL FOR THE THREE APPROVAL ROWS ABOVE** (P6a Task 10), and what
       * gives `GET …/approval` something to answer — `pass` asserts a status below 400, and
       * a release nobody has decided on answers `404 NOT_FOUND`.
       *
       * A STEPPED-UP ADMIN, and its 201 is ASSERTED, for the reason the member call above
       * records in full: a setup call whose answer nothing reads turns a guard into
       * twenty-nine unrelated rows failing somewhere else. **The ROWS keep ordinary
       * sessions** — a row reading `pass` on a step-up-guarded route is a row testing a
       * guard that is not there.
       *
       * It leaves `admin-approval` MET for this project, which moves no expectation:
       * `rehearsal` is still `not_built`, so the production deploy row's `409` stands.
       */
      const approved = await app.inject({
        method: 'POST',
        url: `/v1/releases/${release.json().id}/approve`,
        payload: { reason: 'the authorization fixture needs a decision to read' },
        cookies: await loginAs(deps, 'platform_admin', { steppedUp: true }),
        headers: mutationHeaders(deps),
      })
      expect({ status: approved.statusCode, code: codeOf(approved.body) }).toEqual({
        status: 201,
        code: undefined,
      })

      // The stranger must be a member of nothing. Assert it rather than assume it.
      const strangerView = await app.inject({
        method: 'GET',
        url: '/v1/projects',
        cookies: cookies.stranger,
      })
      expect(strangerView.json()).toEqual([])
    })

    // The owner's, collaborator's and admin's `startBuild` cases each leave a build running
    // in the background; truncating under one would fail it for a reason no test asked about.
    afterAll(async () => {
      await deps.builds.idle()
      await resetDatabase()
    })

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
        const label = route.label === undefined ? '' : ` (${route.label})`
        it(`${route.method} ${route.url}${label} as ${actor} → ${describeExpectation(expected)}`, async () => {
          const { url, payload } = route.request(fixture, actor)
          const actorCookies = actor === 'anonymous' ? undefined : cookies[actor]
          /**
           * ONE CREDENTIAL, NEVER TWO. A request carrying both a session cookie and a
           * bearer token is `400 CREDENTIAL_AMBIGUOUS`, refused before either is read
           * (Task 5), so a token actor must send no cookie — which is why `bearers` is a
           * separate map rather than a field on `cookies`.
           *
           * **`mutationHeaders(deps)` is reused unchanged, `Origin` and all.**
           * `assertSameOrigin` returns early unless a session COOKIE is present
           * (`csrf.ts`), so the console's origin on a bearer request is neither required
           * nor refused — which is what let Task 5 add the credential class with no change
           * to CSRF at all. §3's *"and a bearer request must not"* means *is not required
           * to*, not *is refused if it does*.
           */
          const bearer = bearers[actor as TokenActor]
          // Built conditionally: under exactOptionalPropertyTypes an explicit
          // `payload: undefined` is not assignable to InjectOptions' optional
          // `payload`, and the failed overload silently turned `response` into
          // fastify's chainable type — so `response.statusCode` did not exist.
          const response = await app.inject({
            method: route.method as 'GET',
            url,
            headers: {
              ...mutationHeaders(deps),
              ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
            },
            ...(payload === undefined ? {} : { payload }),
            ...(bearer !== undefined || actorCookies === undefined
              ? {}
              : { cookies: actorCookies }),
          })

          if (expected === 'pass') {
            expect(response.statusCode).toBeLessThan(400)
          } else {
            expect({ status: response.statusCode, code: codeOf(response.body) }).toEqual(
              refusalOf(expected),
            )
          }
        })
      }
    }
  })
}
