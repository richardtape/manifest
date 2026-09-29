import { z } from 'zod/v4'
import {
  assertCapability,
  assertStepUp,
  AuthorizationError,
  CAPABILITIES,
  isPrivileged,
} from '../../projects/index.js'
import { pendingActionsFor, pendingById, resolveAction } from '../../tokens/index.js'
import { requireActor, requireSession } from '../actor.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { EmptyRequest, PATH } from '../contract/schemas.js'
import { PendingActionResolvedError } from '../errors.js'
import {
  PendingAction,
  PendingActionList,
  RejectPendingActionRequest,
  toPendingAction,
} from '../representations/pending-actions.js'
import type { PendingAction as PendingActionRow } from '../../tokens/index.js'
import type { ServerDeps } from '../server.js'
import type { FastifyRequest } from 'fastify'

const PendingActionParams = z.strictObject({ pendingActionId: PATH.pendingActionId })

/**
 * What answering a question asserts: the question's OWN capability (`answerable` below) — and a
 * question is only ever recorded for one of D24's privileged capabilities, the refusal
 * `assertCapability` raises in its privileged branch alone. The routes' `capability`, for the
 * document (`document.ts`, the whole-branch review's I1).
 */
const QUESTION_CAPABILITIES = CAPABILITIES.filter(isPrivileged)

/**
 * D24's loop closing: a person answers the question a refused agent asked (P5b Task 7).
 *
 * **BOTH ROUTES ARE INTERACTIVE ONLY, and that is the entire point of D24.** If a token
 * could confirm its own pending action the mechanism would be a loop with no human in it
 * — a privileged capability with extra steps. Since Task 5 it is a TYPE ERROR rather than
 * a remembered check: `requireSession` returns a `SessionActor`, and `puid` — which
 * `resolveAction` requires, though its sentence names the person (the authoring API plan's
 * Task 12) — does not exist on a token actor, so reverting either route to `requireActor`
 * stops compiling.
 *
 * **Confirming does NOT replay the request.** It grants that one request a single retry,
 * which the agent then makes itself, through its normal route with its normal validation
 * (Decision 6). The wrapper in `api/contract/route.ts` is what matches the retry to this
 * row and stamps it spent; nothing here executes anything on the agent's behalf.
 */

/**
 * The row, and the right to answer it — in that order, and the order is the security
 * property.
 *
 * 1. **No row, no answer**, and a `404` that says nothing about whether the id exists
 *    somewhere else.
 * 2. **The person must hold the capability THEMSELVES.** `assertCapability` against the
 *    row's own project and its own action, so a collaborator cannot wave through the
 *    `members:manage` they could not perform, and a stranger gets the stranger's `404`
 *    rather than learning that the project — or the question — exists.
 * 3. **Only then the state.** A `409` for an already-answered question is a fact about
 *    the row, and telling it to somebody with no business seeing the row would be the
 *    enumeration oracle §13's 404-versus-403 rule exists to close.
 */
async function answerable(
  deps: ServerDeps,
  request: FastifyRequest,
  pendingActionId: string,
  decision: 'confirmed' | 'rejected',
): Promise<{ row: PendingActionRow; userId: string; puid: string }> {
  const actor = requireSession(request)
  const row = await pendingById(deps.db, pendingActionId)
  if (row === undefined) {
    throw new AuthorizationError('NOT_FOUND', `no pending action '${pendingActionId}'`)
  }
  /**
   * `CAPABILITIES.find` rather than a cast: the column is text, and `PRIVILEGED` is a
   * SUPERSET of `Capability` — `secret:read` is in D24's list and in no role, so a row
   * naming it could be confirmed by nobody. Unreachable as the platform stands (no route
   * asks for it), and refused rather than cast, so the day it is reachable the answer is
   * a refusal and never a grant.
   */
  const action = CAPABILITIES.find((capability) => capability === row.action)
  if (action === undefined) {
    throw new AuthorizationError(
      'FORBIDDEN',
      `'${row.action}' is not a capability any role holds, so nobody may confirm it`,
    )
  }
  await assertCapability(deps.db, actor, row.projectId, action)
  /**
   * **AND §20's STEP-UP, ON CONFIRM ONLY** (P6a sitting 6's F12; Rich, 2026-09-20).
   *
   * Without this the guard is ASYMMETRIC: a person doing one of the privileged four in
   * the console must re-prove themselves, while the same person authorizing an AGENT to
   * do it need not — and §20's threat is *"a stolen admin session must not be sufficient
   * to put an app on the public internet."* A stolen session needs no second credential
   * to reach this line: it only needs a question already sitting in the queue, which is
   * the normal state of the system for up to `PENDING_ACTION_TTL_MS`. The attacker
   * cannot choose the action — only say yes to one an agent already asked for — which is
   * why this was raised rather than assumed, and then decided.
   *
   * **NEVER ON REJECT.** Rejecting is the safe direction: it grants nothing and stops an
   * agent. Charging a round trip for it would make the safe action as expensive as the
   * dangerous one and turn "stop my runaway agent" into the slow path.
   *
   * After `assertCapability` and before the state check, which is the order every other
   * step-up call site uses. The cost is that confirming an ALREADY-ANSWERED question
   * sends the person on a round trip before telling them so; that is rare, harmless, and
   * worth one consistent rule about where freshness is asked.
   */
  if (decision === 'confirmed') assertStepUp(actor, action)
  if (row.state !== 'pending') {
    throw new PendingActionResolvedError(row.state)
  }
  /**
   * **AND NOT PAST ITS OWN LIFE.** Task 10 builds the sweeper that moves an expired row to
   * `expired`, which the line above then refuses; until it exists — and, afterwards, in
   * the window between a row expiring and the sweep noticing — a stale question is still
   * `pending`. Without this check a person would be told "confirmed" for an answer that
   * can never be spent: `resolutionFor` will not match an expired row, deliberately and
   * for the same reason `PENDING_ACTION_TTL_MS` exists. Refusing here makes the answer the
   * person gets true, rather than merely harmless.
   */
  if (row.expiresAt <= new Date()) {
    throw new PendingActionResolvedError('expired')
  }
  return { row, userId: actor.userId, puid: actor.puid }
}

const ProjectParams = z.strictObject({ projectId: PATH.projectId })

/**
 * §26's queue, as two reads (Task 8) — *"The primary screen is the queue ... Not the fleet
 * list."* P5c builds the screen; these are what it is built on, and they are also how an
 * agent finds out whether its question was answered without guessing when to retry.
 *
 * **BOTH CREDENTIAL CLASSES MAY READ, AND THEY SEE DIFFERENT SETS.** Anyone who can read
 * the project reads the project's queue, because that is what the screen is about; a
 * delegated token reads only the questions IT asked. A token's authority is its own
 * (Decision 3), and one agent reading another agent's requests — what it tried to do, on
 * which resource, and when — is a read D24 grants nobody. The rule is stated once, in
 * `pendingActionsFor`'s `tokenId` parameter, and both routes apply it.
 *
 * **`404`, NEVER `403`, for a row the caller may not see**, exactly as §13's stranger rule
 * has it: a refusal that confirms the row exists turns the id space into an enumeration
 * oracle, and a pending action names a project, an agent and an action.
 */
export const pendingActionReads = [
  defineRoute({
    operationId: 'listPendingActions',
    method: 'GET',
    path: '/v1/projects/{projectId}/pending-actions',
    tag: 'pending-actions',
    summary: 'The questions agents are waiting on',
    description:
      '§26’s queue for one project, newest first. A person who can read the project sees every question; a delegated token sees only the ones it asked itself. Answered and expired questions stay in the list — `waitingSeconds` on a resolved row is how long the agent waited for its answer.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The project’s pending actions, newest first.',
      schema: PendingActionList,
    },
    capability: 'project:read',
    errors: ['NOT_FOUND'],
    examples: {
      response: [
        {
          id: 'afaea8b7-7d62-4f32-a644-a7c3fbf7f77e',
          projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
          tokenId: '2164b084-a859-4fdf-bdc1-1a8518348f21',
          action: 'members:manage',
          state: 'pending',
          method: 'DELETE',
          path: '/v1/projects/29f9e50b-1ded-4f9e-ab2e-085a4f560188/members/0a418b8c-6d32-4e9f-bc77-24765feebf3b',
          bodySha256: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
          summary: 'Remove a member',
          expiresAt: '2026-09-27T21:51:54.279Z',
          createdAt: '2026-09-26T21:51:54.280Z',
          resolvedAt: null,
          waitingSeconds: 0,
          reason: null,
          consumedAt: null,
        },
        {
          id: '56a3aeec-a04f-4d76-b4dc-f2dc2025576a',
          projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
          tokenId: '10ce2f9b-1577-4a3a-be7d-d72acc9bd876',
          action: 'members:manage',
          state: 'pending',
          method: 'DELETE',
          path: '/v1/projects/29f9e50b-1ded-4f9e-ab2e-085a4f560188/members/0a418b8c-6d32-4e9f-bc77-24765feebf3b',
          bodySha256: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
          summary: 'Remove a member',
          expiresAt: '2026-09-27T21:51:54.270Z',
          createdAt: '2026-09-26T21:51:54.271Z',
          resolvedAt: null,
          waitingSeconds: 0,
          reason: null,
          consumedAt: null,
        },
      ],
    },
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const now = new Date()
      const rows = await pendingActionsFor(
        deps.db,
        params.projectId,
        actor.credential === 'token' ? actor.tokenId : undefined,
      )
      return rows.map((row) => toPendingAction(row, now))
    },
  }),
  defineRoute({
    operationId: 'getPendingAction',
    method: 'GET',
    path: '/v1/pending-actions/{pendingActionId}',
    tag: 'pending-actions',
    summary: 'One pending action',
    description:
      'What an agent asked for, and what a person decided. An agent polls its own question here rather than retrying a refused request to find out; anyone who can read the project reads the project’s. A question the caller may not see is answered 404, the same as one that does not exist.',
    params: PendingActionParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The pending action.', schema: PendingAction },
    capability: 'project:read',
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        id: '45103737-568d-4db0-8137-ba1b00f161e3',
        projectId: '71fa56ac-c7dc-4368-ba62-32696fa50bfb',
        tokenId: 'bad42919-d270-4d8e-b74c-89802f381f93',
        action: 'members:manage',
        state: 'pending',
        method: 'POST',
        path: '/v1/projects/71fa56ac-c7dc-4368-ba62-32696fa50bfb/members',
        bodySha256: '63dbcbcf12502ef9e6d588c38dc66a2d68f50df9bf7c802d5faac5a52b5bbe5b',
        summary: 'Add or change a member',
        expiresAt: '2026-09-27T21:48:16.729Z',
        createdAt: '2026-09-26T21:48:16.730Z',
        resolvedAt: null,
        waitingSeconds: 0,
        reason: null,
        consumedAt: null,
      },
    },
    handler: async ({ deps, request, params }) => {
      const actor = requireActor(request)
      const row = await pendingById(deps.db, params.pendingActionId)
      // ONE `404` for "no such row" and for "not yours". Read before either check so the
      // two are indistinguishable to a caller, which is the whole of the enumeration
      // argument — a timing difference here is not one a client can act on.
      const hidden = new AuthorizationError(
        'NOT_FOUND',
        `no pending action '${params.pendingActionId}'`,
      )
      if (row === undefined) throw hidden
      if (actor.credential === 'token') {
        // ITS OWN, and nothing else. `assertCapability` would let any token holding
        // `project:read` on this project read every agent's questions.
        if (row.requestedByToken !== actor.tokenId) throw hidden
        return toPendingAction(row)
      }
      await assertCapability(deps.db, actor, row.projectId, 'project:read')
      return toPendingAction(row)
    },
  }),
]

export const pendingActionRoutes = [
  defineRoute({
    operationId: 'confirmPendingAction',
    credential: 'session',
    method: 'POST',
    path: '/v1/pending-actions/{pendingActionId}/confirm',
    tag: 'pending-actions',
    summary: 'Confirm a pending action',
    description:
      'D24: lets the agent’s refused request through, ONCE. It grants that exact request — this token, this method, this path, this body — a single retry, which the agent makes itself; nothing is executed here on its behalf, and the retry is validated by its own route as any request is. Only a person who holds the capability themselves may confirm, and only in an interactive session.',
    params: PendingActionParams,
    query: NO_QUERY,
    // A mutation that takes no fields still takes a JSON object (P5a Decision 4). This is
    // `EmptyRequest`'s first caller: it was registered — and therefore published in the
    // contract — with no route answering it, which is sitting 4's F4 shape.
    body: EmptyRequest,
    success: {
      status: 200,
      description: 'The pending action, confirmed. `consumedAt` is null until the retry.',
      schema: PendingAction,
    },
    capability: QUESTION_CAPABILITIES,
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'PENDING_ACTION_RESOLVED',
      // §20's step-up, on CONFIRM and not on reject (P6a sitting 6, F12). Authorizing an
      // agent to do one of D24's privileged four is doing it by proxy, so it is held to
      // the same freshness as doing it directly.
      'STEP_UP_REQUIRED',
    ],
    examples: {
      request: {},
      response: {
        id: 'd2438330-fdfd-435c-afc5-8cf2cef778f8',
        projectId: '20f75cbb-0bd7-4fba-b648-3fd43e9640ff',
        tokenId: 'a2221a13-2bc9-4944-8311-4a5340fc12b9',
        action: 'members:manage',
        state: 'confirmed',
        method: 'DELETE',
        path: '/v1/projects/20f75cbb-0bd7-4fba-b648-3fd43e9640ff/members/303c35ad-8966-44a0-96a1-29e39b453258',
        bodySha256: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
        summary: 'Remove a member',
        expiresAt: '2026-09-27T21:48:26.880Z',
        createdAt: '2026-09-26T21:48:26.881Z',
        resolvedAt: '2026-09-26T21:48:26.885Z',
        waitingSeconds: 0,
        reason: null,
        consumedAt: null,
      },
    },
    handler: async ({ deps, request, params }) => {
      const { row, userId, puid } = await answerable(
        deps,
        request,
        params.pendingActionId,
        'confirmed',
      )
      const confirmed = await resolveAction(deps.db, deps.bus, {
        pendingActionId: row.id,
        resolvedBy: userId,
        resolvedByPuid: puid,
        state: 'confirmed',
      })
      // `undefined` means somebody answered it between the read above and this write —
      // the state clause lives in the UPDATE, so two people cannot both win.
      if (confirmed === undefined) throw new PendingActionResolvedError('confirmed')
      return toPendingAction(confirmed)
    },
  }),
  defineRoute({
    operationId: 'rejectPendingAction',
    credential: 'session',
    method: 'POST',
    path: '/v1/pending-actions/{pendingActionId}/reject',
    tag: 'pending-actions',
    summary: 'Reject a pending action',
    description:
      'D24: refuses the agent’s request, in the person’s own words. A retry of that exact request is then answered TOKEN_ACTION_REJECTED carrying the reason, so the agent stops asking rather than looping — which is what D23.7 means by an error an agent can correct itself from.',
    params: PendingActionParams,
    query: NO_QUERY,
    body: RejectPendingActionRequest,
    success: {
      status: 200,
      description: 'The pending action, rejected, with the reason it carries.',
      schema: PendingAction,
    },
    capability: QUESTION_CAPABILITIES,
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'PENDING_ACTION_RESOLVED',
    ],
    examples: {
      request: { reason: 'not something an agent should be doing' },
      response: {
        id: '7d034c5b-ea3a-4f28-95c5-4f6824f04f9f',
        projectId: 'ef7b2d4a-e4a3-4f11-b0d9-dddbc1b1a3bd',
        tokenId: '290c71b2-2173-49a7-91a1-ad42fa895029',
        action: 'members:manage',
        state: 'rejected',
        method: 'POST',
        path: '/v1/projects/ef7b2d4a-e4a3-4f11-b0d9-dddbc1b1a3bd/members',
        bodySha256: '63dbcbcf12502ef9e6d588c38dc66a2d68f50df9bf7c802d5faac5a52b5bbe5b',
        summary: 'Add or change a member',
        expiresAt: '2026-09-27T21:48:29.860Z',
        createdAt: '2026-09-26T21:48:29.861Z',
        resolvedAt: '2026-09-26T21:48:29.865Z',
        waitingSeconds: 0,
        reason: 'not something an agent should be doing',
        consumedAt: null,
      },
    },
    handler: async ({ deps, request, params, body }) => {
      const { row, userId, puid } = await answerable(
        deps,
        request,
        params.pendingActionId,
        'rejected',
      )
      const rejected = await resolveAction(deps.db, deps.bus, {
        pendingActionId: row.id,
        resolvedBy: userId,
        resolvedByPuid: puid,
        state: 'rejected',
        reason: body.reason,
      })
      if (rejected === undefined) throw new PendingActionResolvedError('rejected')
      return toPendingAction(rejected)
    },
  }),
]
