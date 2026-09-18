import { z } from 'zod/v4'
import {
  assertCapability,
  AuthorizationError,
  CAPABILITIES,
} from '../../projects/index.js'
import { pendingById, resolveAction } from '../../tokens/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_QUERY } from '../contract/route.js'
import { EmptyRequest } from '../contract/schemas.js'
import { PendingActionResolvedError } from '../errors.js'
import {
  PendingAction,
  RejectPendingActionRequest,
  toPendingAction,
} from '../representations/pending-actions.js'
import type { PendingAction as PendingActionRow } from '../../tokens/index.js'
import type { ServerDeps } from '../server.js'
import type { FastifyRequest } from 'fastify'

const PendingActionParams = z.strictObject({ pendingActionId: z.uuid() })

/**
 * D24's loop closing: a person answers the question a refused agent asked (P5b Task 7).
 *
 * **BOTH ROUTES ARE INTERACTIVE ONLY, and that is the entire point of D24.** If a token
 * could confirm its own pending action the mechanism would be a loop with no human in it
 * — a privileged capability with extra steps. Since Task 5 it is a TYPE ERROR rather than
 * a remembered check: `requireSession` returns a `SessionActor`, and `puid` — which the
 * event's human sentence needs — does not exist on a token actor, so reverting either
 * route to `requireActor` stops compiling.
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
  if (row.state !== 'pending') {
    throw new PendingActionResolvedError(row.state)
  }
  return { row, userId: actor.userId, puid: actor.puid }
}

export const pendingActionRoutes = [
  defineRoute({
    operationId: 'confirmPendingAction',
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
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'PENDING_ACTION_RESOLVED',
    ],
    handler: async ({ deps, request, params }) => {
      const { row, userId, puid } = await answerable(
        deps,
        request,
        params.pendingActionId,
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
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'PENDING_ACTION_RESOLVED',
    ],
    handler: async ({ deps, request, params, body }) => {
      const { row, userId, puid } = await answerable(
        deps,
        request,
        params.pendingActionId,
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
