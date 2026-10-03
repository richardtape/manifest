import { and, eq, lte } from 'drizzle-orm'
import { pendingActions, type Db } from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import { personName } from '../projects/index.js'

/**
 * §6's fourth `PendingAction` state, applied — the one state change with no actor behind
 * it (P5b Task 10).
 *
 * **WHAT THIS IS AND IS NOT.** It is not the control that stops an expired question being
 * answered: `answerable` in `api/routes/pending-actions.ts` already refuses a row past its
 * own `expiresAt` (`409 PENDING_ACTION_RESOLVED`), and `resolutionFor` already declines to
 * match one, both keyed on the timestamp rather than on the state — so a row this sweep
 * has not reached yet is harmless. What it does is make the **stored state honest**, which
 * two things need:
 *
 *  1. §26's queue is a read of `state` (Task 8). A question nobody answered in time should
 *     read `expired` there rather than as one still waiting for somebody.
 *  2. **The partial unique index this task adds depends on it.** One open ask per token
 *     and fingerprint is enforced `WHERE state = 'pending'`, and a stale row still marked
 *     `pending` would therefore block a fresh question about the same thing for ever —
 *     worse than the duplicates the index exists to stop (sitting 5's F10). That is why
 *     `recordPendingAction` calls this, scoped to its own token, immediately before it
 *     inserts: the window between a row expiring and a sweep noticing is closed exactly
 *     where it would otherwise cause a refusal.
 *
 * **NO EVENT IS PUBLISHED HERE, deliberately.** §14's events record what somebody did, and
 * every other `pending_action.*` event names the actor who caused it — the token that
 * asked, the person who answered. Expiry is a clock passing, with no actor, and a boot
 * sweep of a month's backlog would publish a burst of events nobody asked for. An agent
 * learns its question died the way D23.7 says it should: by asking again and being handed
 * a new one. The row's own `state` is the record.
 *
 * **A PERSON'S ACT THAT ENDS A TOKEN DOES PUBLISH** (FE-52; the faculty-ready plan's Task 13,
 * Decision 17): a revoke, a minter's removal and an archive each pass `EVERY_QUESTION` here,
 * inside the transaction that ends the token, and then — after it commits — hand the rows this
 * answers to `publishQuestionsEnded`, which names the person. So this answers the rows it
 * expired, not a count.
 *
 * `scope` narrows it to one token's rows, or one project's. The rule is stated once, as a
 * parameter — the same shape `pendingActionsFor`'s `tokenId` uses for the same reason (sitting
 * 6's F4): two callers with two filters is two statements of one rule.
 *
 * **§11's archive passes `EVERY_QUESTION` as `now`** (the front-end enablement plan's Task 11,
 * Decision 28's third step): a project switched off is the clock running out for every question
 * about it, whatever expiry each was given — so it is the same rule, with the clock the archive
 * says it is, rather than a second function that expires without looking at the clock.
 */
export async function expirePendingActions(
  // `update` alone, so the archive can expire inside the transaction that archives (sitting 8).
  db: Pick<Db, 'update'>,
  now: Date = new Date(),
  scope?: { tokenId: string } | { projectId: string },
): Promise<ExpiredQuestion[]> {
  const expirable = and(
    eq(pendingActions.state, 'pending'),
    // `<=`, not `<`: `answerable` refuses a row at exactly `expiresAt`, so a sweep that
    // left that instant `pending` would disagree with the route about the same row.
    lte(pendingActions.expiresAt, now),
    ...(scope === undefined
      ? []
      : 'tokenId' in scope
        ? [eq(pendingActions.requestedByToken, scope.tokenId)]
        : [eq(pendingActions.projectId, scope.projectId)]),
  )
  const swept = await db
    .update(pendingActions)
    .set({ state: 'expired' })
    // The `state = 'pending'` clause is in the UPDATE and not in a read before it, for the
    // reason `resolveAction`'s is: a person confirming a question at the moment a sweep
    // reaches it must not have their decision overwritten. The writer that matches no row
    // is the one that loses.
    .where(expirable)
    .returning({
      id: pendingActions.id,
      projectId: pendingActions.projectId,
      tokenId: pendingActions.requestedByToken,
      action: pendingActions.action,
      payload: pendingActions.payload,
    })
  return swept.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    tokenId: row.tokenId,
    action: row.action,
    summary: row.payload.summary,
  }))
}

/** A question `expirePendingActions` ended — what its event names, and never the body or its hash. */
export interface ExpiredQuestion {
  id: string
  projectId: string
  /** The token that asked. */
  tokenId: string
  /** The privileged capability it asked to use. */
  action: string
  /** What it asked for, in the route definition's own words (`fingerprintOf`). */
  summary: string
}

/** Which act of a person ended a token, and so its questions. */
export type QuestionsEndedCause = 'token_revoked' | 'member_removed' | 'project_archived'

/**
 * ONE `pending_action.expired` PER QUESTION A PERSON'S ACT ENDED (FE-52; Decision 17), naming them.
 *
 * **CALLED AFTER THE COMMIT, NEVER INSIDE ONE** — for the reason the event streams close after it: an
 * event that announced a rollback would be false. Its three callers are the act's own: `revokeToken`,
 * a member's removal and the archive. The clock's sweep never calls it (above: expiry has no actor).
 *
 * `by` is the person whose act it was — for a removal by a delegated token, the person who minted
 * it. The sentence names them, and the question by its summary; never the body.
 */
export async function publishQuestionsEnded(
  deps: { db: Db; bus: EventBus },
  rows: readonly ExpiredQuestion[],
  input: { cause: QuestionsEndedCause; by: string },
): Promise<void> {
  if (rows.length === 0) return
  const who = await personName(deps.db, input.by)
  for (const row of rows) {
    await publishEvent(
      deps.db,
      deps.bus,
      {
        projectId: row.projectId,
        subject: `pending-action:${row.id}`,
        type: 'pending_action.expired',
        machineDetail: {
          pendingActionId: row.id,
          tokenId: row.tokenId,
          action: row.action,
          cause: input.cause,
          by: input.by,
        },
        humanMessage: `${ENDED_BY[input.cause](who)}, so an agent's question — to ${row.summary.toLowerCase()} — expired unanswered: nothing can retry it now.`,
      },
      makeRedactor([]),
    )
  }
}

const ENDED_BY: Record<QuestionsEndedCause, (who: string) => string> = {
  token_revoked: (who) => `${who} revoked the delegated token that asked`,
  member_removed: (who) =>
    `${who} took the person who minted the asking token off the project, which revoked it`,
  project_archived: (who) => `${who} switched the project off, which revoked every token`,
}

/**
 * The clock §11's archive expires a project's questions by: past every expiry there is. The last
 * instant of the year 9999 — NOT JavaScript's own last instant (the year 275760), which
 * `toISOString` writes as `+275760-…` and Postgres refuses to parse (`22009`, measured).
 */
export const EVERY_QUESTION = new Date('9999-12-31T23:59:59.999Z')
