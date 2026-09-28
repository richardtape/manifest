import { and, eq, lte } from 'drizzle-orm'
import { pendingActions, type Db } from '../db/index.js'

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
 * **NO EVENT IS PUBLISHED, deliberately.** §14's events record what somebody did, and
 * every other `pending_action.*` event names the actor who caused it — the token that
 * asked, the person who answered. Expiry is a clock passing, with no actor, and a boot
 * sweep of a month's backlog would publish a burst of events nobody asked for. An agent
 * learns its question died the way D23.7 says it should: by asking again and being handed
 * a new one. The row's own `state` is the record.
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
  db: Db,
  now: Date = new Date(),
  scope?: { tokenId: string } | { projectId: string },
): Promise<number> {
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
    .returning({ id: pendingActions.id })
  return swept.length
}

/**
 * The clock §11's archive expires a project's questions by: past every expiry there is. The last
 * instant of the year 9999 — NOT JavaScript's own last instant (the year 275760), which
 * `toISOString` writes as `+275760-…` and Postgres refuses to parse (`22009`, measured).
 */
export const EVERY_QUESTION = new Date('9999-12-31T23:59:59.999Z')
