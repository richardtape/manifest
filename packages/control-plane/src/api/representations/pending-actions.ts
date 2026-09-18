import { z } from 'zod/v4'
import type { PendingAction as PendingActionRow } from '../../tokens/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'

/**
 * §6's `PendingAction` on the wire: the question an agent's refused request put to a
 * person (D24, P5b Task 6).
 *
 * It reaches a client TWO ways, and that is why it is a registered representation rather
 * than a shape written into one refusal: `$ref`'d from `ErrorEnvelope`, so the 403 that
 * created it carries it (Decision 8), and — from Task 8 — as the body of §26's queue.
 * One schema, so the thing an agent waits for and the thing a person confirms are
 * described once.
 *
 * **It carries no body and never will.** `bodySha256` is in it deliberately: it lets an
 * agent recognise which of its own requests this answers, and a person reading the queue
 * sees `summary` instead. A refused request can carry anything, and this row is read on a
 * screen (§14, §26).
 */
export const PendingAction = representation(
  'PendingAction',
  z
    .object({
      id: Uuid,
      projectId: Uuid,
      /** The token that asked. A person confirming wants to know which agent. */
      tokenId: Uuid,
      action: z
        .string()
        .describe('The privileged capability that was refused — one of D24’s four.'),
      state: z.enum(['pending', 'confirmed', 'rejected', 'expired']),
      method: z.string(),
      path: z.string(),
      bodySha256: z
        .string()
        .describe(
          'SHA-256 of the canonical request body, so a client can match its own.',
        ),
      summary: z.string().describe('What was asked for, for the person who answers.'),
      expiresAt: Timestamp,
      createdAt: Timestamp,
      resolvedAt: Timestamp.nullable(),
      /**
       * Decision 7: confirmed-and-used, without a fifth state. Non-null means the
       * one-shot retry the confirmation granted has been spent (Task 7).
       */
      consumedAt: Timestamp.nullable(),
    })
    .describe(
      'D24: a delegated token asked for one of the privileged four. A person confirms or rejects it; a confirmation grants that one request a single retry.',
    ),
)

/**
 * **`PendingActionList` IS TASK 8'S, NOT THIS TASK'S.** It was written here first and
 * removed: `representation()` registers a schema, and `openApiDocument` emits EVERY
 * registered one as a component — so the published contract described a list no route
 * answers. A schema with no caller is the same defect as a module with no caller
 * (ORIENTATION §9, four times), and in a published contract it is worse: a client can
 * generate against it. §26's queue route brings its own.
 */

export function toPendingAction(row: PendingActionRow): z.input<typeof PendingAction> {
  return {
    id: row.id,
    projectId: row.projectId,
    tokenId: row.requestedByToken,
    action: row.action,
    state: row.state,
    method: row.payload.method,
    path: row.payload.path,
    bodySha256: row.payload.bodySha256,
    summary: row.payload.summary,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    consumedAt: row.consumedAt?.toISOString() ?? null,
  }
}
