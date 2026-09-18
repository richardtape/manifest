import { createHash } from 'node:crypto'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { pendingActions, type Db } from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import { expirePendingActions } from './expiry.js'
import type { TokenCapabilityRefusedError } from '../projects/index.js'

/** §6's `PendingAction`, as stored. */
export type PendingAction = typeof pendingActions.$inferSelect

/** What was asked for — never the body itself. The column's `$type` states the same. */
export type ActionFingerprint = PendingAction['payload']

/**
 * How long a question waits for an answer before Task 10's sweeper expires it.
 *
 * A DECISION, not an inheritance. Long enough that a person who is not at their desk
 * when the agent asks can still answer after a night's sleep; short enough that a
 * confirmed action is confirmed against a project that still looks the way it did when
 * the question was asked. Twenty-four hours is the smallest span that satisfies the
 * first, and §26's queue is a screen somebody opens daily rather than hourly.
 */
export const PENDING_ACTION_TTL_MS = 86_400_000

/**
 * A stable SHA-256 of a request body, with object keys SORTED at every depth.
 *
 * Two agents sending the same fields in a different order are asking the same question,
 * and `JSON.stringify` preserves insertion order — so an unsorted hash would make a
 * retry of the identical action look like a new one, fill a person's queue with
 * duplicates, and (Task 7) fail to match the retry the human confirmed. Arrays keep
 * their order, because `[a, b]` and `[b, a]` are not the same request.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
  return `{${entries.join(',')}}`
}

export function bodySha256(body: unknown): string {
  return createHash('sha256')
    .update(canonical(body ?? null))
    .digest('hex')
}

/**
 * WHAT WAS ASKED FOR, as the row stores it: method, concrete path, a hash of the body,
 * and a sentence for the person who reads it in a queue (§26).
 *
 * The path is the CONCRETE one — `/v1/projects/<uuid>/members`, query string stripped —
 * not the route template, because the resource is part of the question: "may this agent
 * add a member to THIS project" is not the same question as one about another. The
 * summary is the route definition's own, so the queue and the OpenAPI document say the
 * same thing about an operation rather than two things kept in step by hand.
 */
export function fingerprintOf(input: {
  method: string
  url: string
  body: unknown
  summary: string
}): ActionFingerprint {
  return {
    method: input.method,
    path: input.url.split('?')[0]!,
    bodySha256: bodySha256(input.body),
    summary: input.summary,
  }
}

/**
 * A delegated token asked for one of D24's four; this is the row a human answers.
 *
 * **Its only caller is `api/contract/route.ts`'s wrapper** — the one layer that sees both
 * the refusal and the request that caused it (Decision 5). It is not exported through a
 * route, and no handler may call it: a second caller would be per-route enforcement,
 * which is the thing D24 forbids.
 *
 * **An identical ask REUSES its row rather than inserting a second.** An agent that
 * retries on a 403 — which is what a retry loop does — must not fill a person's queue
 * with one question asked forty times. "Identical" is this token, this fingerprint, still
 * `pending`, and not yet expired: an expired row is not an answerable question, so
 * reusing one would leave the agent waiting on something nobody can confirm.
 *
 * **AND THE DATABASE IS WHAT ENFORCES THAT, not the lookup below** (Task 10, from sitting
 * 5's F10). The lookup alone is a read-then-insert: five CONCURRENT identical asks read
 * no row and all five insert, which is measured, and which defeats the reuse rule for
 * exactly the agent that retries in parallel. `pending_actions_one_open_ask_idx` is a
 * partial unique index over the token and the fingerprint `WHERE state = 'pending'`, and
 * the loser of that race is handed the winner's row rather than an error.
 *
 * The index's own hazard is why the two halves of this function are in this order: a row
 * past its own `expiresAt` that still says `pending` satisfies the index's predicate but
 * not the lookup's, so it would block every future ask about the same thing — worse than
 * the duplicate. **This token's stale rows are therefore expired before the insert**, by
 * the same sweeper that runs at boot, scoped to the one token so that a request path
 * never writes another tenant's rows.
 */
export async function recordPendingAction(
  db: Db,
  bus: EventBus,
  input: {
    error: TokenCapabilityRefusedError
    fingerprint: ActionFingerprint
    now?: Date
  },
): Promise<PendingAction> {
  const now = input.now ?? new Date()
  const { error, fingerprint } = input

  /**
   * THE OPEN ASK, IF THERE IS ONE — stated once, because it is read twice: before the
   * insert, and again by whoever loses the race to it. Two copies of this predicate is
   * the shape ORIENTATION §9 names (*a guard whose enabling condition is written twice*),
   * and here the two copies would have to agree about expiry as well as identity.
   */
  const openAsk = async (): Promise<PendingAction | undefined> => {
    const [row] = await db
      .select()
      .from(pendingActions)
      .where(
        and(
          eq(pendingActions.requestedByToken, error.tokenId),
          eq(pendingActions.state, 'pending'),
          gt(pendingActions.expiresAt, now),
          // The three fields of the fingerprint, as jsonb text. Compared in SQL rather
          // than in JavaScript so that a token with many open questions does not read
          // them all back to find one.
          sql`${pendingActions.payload}->>'method' = ${fingerprint.method}`,
          sql`${pendingActions.payload}->>'path' = ${fingerprint.path}`,
          sql`${pendingActions.payload}->>'bodySha256' = ${fingerprint.bodySha256}`,
        ),
      )
    return row
  }

  const existing = await openAsk()
  if (existing !== undefined) return existing

  // Before the insert, never after: see the note above. Scoped to this token.
  await expirePendingActions(db, now, { tokenId: error.tokenId })

  const [row] = await db
    .insert(pendingActions)
    .values({
      projectId: error.projectId,
      requestedByToken: error.tokenId,
      action: error.capability,
      payload: fingerprint,
      expiresAt: new Date(now.getTime() + PENDING_ACTION_TTL_MS),
    })
    /**
     * No `target`: drizzle's `onConflictDoNothing` takes columns, and this index is over
     * jsonb EXPRESSIONS, which it cannot express. The only other unique constraint on
     * this table is the primary key over a `randomUUID()` default, so a conflict here is
     * the open-ask index or nothing.
     */
    .onConflictDoNothing()
    .returning()

  /**
   * THE LOSER OF THE RACE IS HANDED THE WINNER'S ROW. `onConflictDoNothing` returns no
   * row when another caller inserted between this one's sweep and its insert, and every
   * caller must come away with the question to wait on — four of five callers being told
   * "no row" would be the same defect as five rows, from the other direction.
   *
   * **It comes away empty in exactly one case, and that case is a defect above this
   * line**: the conflict was against a row the sweep should have expired and did not.
   * Otherwise it cannot — under READ COMMITTED the conflicting insert is committed by the
   * time the conflict is reported, and nothing inserts an already-stale row. So the throw
   * is not dead code, it is the diagnostic for the sweep going missing: P5b sitting 7's
   * control (d) removed the `expirePendingActions` call above and reached this line, which
   * named the credential and the request instead of answering a `403` that pointed at a
   * pending action nobody could find.
   */
  if (row === undefined) {
    const winner = await openAsk()
    if (winner === undefined) {
      throw new Error(
        `pending action for token ${error.tokenId} conflicted on ${fingerprint.method} ${fingerprint.path} and no open ask could be read back`,
      )
    }
    return winner
  }

  /**
   * §14: the event names the action and who asked, and carries NEITHER the body nor its
   * hash — a person reading the audit trail needs to know a question was asked, not what
   * was in it. The row is where the fingerprint lives.
   *
   * **Only the caller that WROTE the row publishes.** Reuse returns above without an
   * event, and so does the loser of a race: five concurrent asks are one question, and
   * five `pending_action.created` events for it would tell a person reading §14's trail
   * that five things happened.
   */
  await publishEvent(
    db,
    bus,
    {
      projectId: error.projectId,
      subject: `pending-action:${row.id}`,
      type: 'pending_action.created',
      machineDetail: {
        pendingActionId: row.id,
        tokenId: error.tokenId,
        action: error.capability,
      },
      humanMessage: `An agent asked to ${fingerprint.summary.toLowerCase()}, which D24 reserves to a person. It is waiting for someone to confirm or reject it.`,
    },
    makeRedactor([]),
  )

  return row
}

export async function pendingById(
  db: Db,
  id: string,
): Promise<PendingAction | undefined> {
  const [row] = await db.select().from(pendingActions).where(eq(pendingActions.id, id))
  return row
}

/**
 * §26's queue for one project, newest first (Task 8).
 *
 * **`tokenId` NARROWS IT TO ONE AGENT'S OWN QUESTIONS, and the caller decides whether to
 * pass it.** A person who may read the project reads the project's queue, because that is
 * what the screen is; a delegated token reads only what IT asked, because a token's
 * authority is its own (Decision 3) and one agent enumerating another's requests is a read
 * D24 grants nobody. Stating the rule as a parameter here — rather than filtering in the
 * route — keeps it one rule for both reads.
 *
 * Every state, not only `pending`: a queue that hides what was answered cannot show a
 * person what they decided, and `waitingSeconds` on a resolved row is how long it took.
 */
export async function pendingActionsFor(
  db: Db,
  projectId: string,
  tokenId?: string,
): Promise<PendingAction[]> {
  return db
    .select()
    .from(pendingActions)
    .where(
      tokenId === undefined
        ? eq(pendingActions.projectId, projectId)
        : and(
            eq(pendingActions.projectId, projectId),
            eq(pendingActions.requestedByToken, tokenId),
          ),
    )
    .orderBy(desc(pendingActions.createdAt))
}

/**
 * How a person answered THIS exact question from THIS token, if they have (Task 7).
 *
 * NOT `findConfirmedMatch`, which is what the plan called it: it has to distinguish "no
 * row" from "a row that was rejected", because a retry against a rejection is answered
 * `TOKEN_ACTION_REJECTED` rather than being asked again — and a function named for one of
 * the two answers it returns is how a cold reader ends up ignoring the other.
 *
 * **Keyed on the TOKEN as well as the fingerprint.** A confirmation grants one credential
 * one retry, so a second token asking the identical question gets its own row and its own
 * answer; matching on the fingerprint alone would let any holder spend somebody else's.
 *
 * **A spent confirmation and an expired one are both `none`**, which is what makes the
 * next ask a NEW question rather than a permanent grant. The expiry clause is the same
 * argument `PENDING_ACTION_TTL_MS` makes: a confirmation is given against a project that
 * looked a certain way, and one older than the row's own life is not an answer to the
 * project as it now is.
 */
export type ActionResolution =
  | { kind: 'none' }
  | { kind: 'confirmed'; row: PendingAction }
  | { kind: 'rejected'; row: PendingAction }

export async function resolutionFor(
  db: Db,
  tokenId: string,
  fingerprint: ActionFingerprint,
  now: Date = new Date(),
): Promise<ActionResolution> {
  const [row] = await db
    .select()
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.requestedByToken, tokenId),
        gt(pendingActions.expiresAt, now),
        // The three fields of the fingerprint, as jsonb text — compared in SQL for the
        // reason `recordPendingAction`'s lookup is: a token with many open questions must
        // not read them all back to find one.
        sql`${pendingActions.payload}->>'method' = ${fingerprint.method}`,
        sql`${pendingActions.payload}->>'path' = ${fingerprint.path}`,
        sql`${pendingActions.payload}->>'bodySha256' = ${fingerprint.bodySha256}`,
      ),
    )
    .orderBy(desc(pendingActions.createdAt))
  if (row === undefined) return { kind: 'none' }
  if (row.state === 'rejected') return { kind: 'rejected', row }
  if (row.state === 'confirmed' && row.consumedAt === null)
    return { kind: 'confirmed', row }
  return { kind: 'none' }
}

/**
 * A person's answer, applied — and applied ONLY to a row still waiting for one.
 *
 * The `state = 'pending'` clause is in the UPDATE rather than in a read-then-write, so two
 * people answering the same question at the same moment cannot both win: the second
 * updates no row and is told the question is already resolved. `undefined` means exactly
 * that, and the route turns it into `409 PENDING_ACTION_RESOLVED`.
 */
export async function resolveAction(
  db: Db,
  bus: EventBus,
  input: {
    pendingActionId: string
    resolvedBy: string
    state: 'confirmed' | 'rejected'
    /** The person's own words. Required for a rejection, absent for a confirmation. */
    reason?: string
    /** For the human sentence only — the row records the user id. */
    resolvedByPuid: string
    now?: Date
  },
): Promise<PendingAction | undefined> {
  const now = input.now ?? new Date()
  const [row] = await db
    .update(pendingActions)
    .set({
      state: input.state,
      resolvedBy: input.resolvedBy,
      resolvedAt: now,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    })
    .where(
      and(
        eq(pendingActions.id, input.pendingActionId),
        eq(pendingActions.state, 'pending'),
      ),
    )
    .returning()
  if (row === undefined) return undefined

  // §14: who answered, and what was asked — never the body, exactly as the `created`
  // event does not carry it. A rejection carries the person's sentence, because that
  // sentence is the whole of what the agent and the next reader are owed.
  await publishEvent(
    db,
    bus,
    {
      projectId: row.projectId,
      subject: `pending-action:${row.id}`,
      type:
        input.state === 'confirmed'
          ? 'pending_action.confirmed'
          : 'pending_action.rejected',
      machineDetail: {
        pendingActionId: row.id,
        tokenId: row.requestedByToken,
        action: row.action,
        resolvedBy: input.resolvedBy,
        ...(input.state === 'rejected' ? { reason: input.reason ?? '' } : {}),
      },
      humanMessage:
        input.state === 'confirmed'
          ? `${input.resolvedByPuid} confirmed an agent's request to ${row.payload.summary.toLowerCase()}. It may do it once.`
          : `${input.resolvedByPuid} refused an agent's request to ${row.payload.summary.toLowerCase()}: ${input.reason ?? ''}`,
    },
    makeRedactor([]),
  )
  return row
}

/**
 * The one-shot retry, SPENT — stamped after the handler has resolved, never before.
 *
 * A handler that throws is a failure the agent did not cause, and burning a person's
 * decision on one means asking them again for something they already answered. The cost
 * of that ordering is a window: two identical retries in flight at once can both pass the
 * check before either stamps. `WHERE consumed_at IS NULL` narrows it to the stamp itself
 * and does not close it, which is a deliberate trade recorded in P5b's sitting 5 — the
 * two requests are byte-identical by construction (the fingerprint is what matched), and
 * D23.6 tells a client to retry an action under ONE key, which serialises the ordinary
 * case through `replayOrStore`.
 */
export async function consumeAction(
  db: Db,
  pendingActionId: string,
  now: Date = new Date(),
): Promise<PendingAction | undefined> {
  const [row] = await db
    .update(pendingActions)
    .set({ consumedAt: now })
    .where(and(eq(pendingActions.id, pendingActionId), isNull(pendingActions.consumedAt)))
    .returning()
  return row
}

/**
 * The refusal as it leaves: the 403 D24 asks for, carrying the question a human answers.
 *
 * Thrown by the route wrapper once the row exists, and mapped by `api/errors.ts`. It is a
 * SECOND class rather than a field on `TokenCapabilityRefusedError` because the two say
 * different things: one is "the authorization layer refused this", which is true the
 * moment `assertCapability` throws, and the other is "and here is the pending action that
 * refusal created", which is only true after a row is written. Collapsing them would make
 * a recorded refusal indistinguishable from an unrecorded one — exactly the distinction
 * `mapError` fails closed on.
 */
export class PendingActionRequiredError extends Error {
  constructor(readonly pendingAction: PendingAction) {
    super(
      `a delegated token may never '${pendingAction.action}' (D24); a human must confirm this action`,
    )
    this.name = 'PendingActionRequiredError'
  }
}

/**
 * A person said NO to this exact request, and the agent is retrying it anyway (Task 7).
 *
 * A THIRD class beside `TokenCapabilityRefusedError` and `PendingActionRequiredError`, for
 * the reason those two are separate: this one means "the question was asked and answered",
 * which is a different thing from "it is waiting" and needs a different code, because a
 * client switches on the code and one of them is a loop that closes while the other is a
 * dead end it must stop retrying. It carries the row so the refusal can carry the reason.
 */
export class PendingActionRejectedError extends Error {
  constructor(readonly pendingAction: PendingAction) {
    super(
      `a person refused this request: ${pendingAction.reason ?? 'no reason was given'}`,
    )
    this.name = 'PendingActionRejectedError'
  }
}
