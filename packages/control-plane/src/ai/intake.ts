import { and, eq, gte, sql } from 'drizzle-orm'
import { intakeSessions, type Db } from '../db/index.js'
import type { SessionActor } from '../projects/index.js'
import { CLASSIFICATION_RANK } from '../spec/index.js'
import {
  ensureIntakeBudget,
  intakeKeyAlias,
  intakeSpend,
  mintIntakeKey,
  revokeIntakeKey,
} from './agent-keys.js'
import type { ModelCatalogue } from './catalogue.js'
import type { LiteLlmClient } from './client.js'
import { AgentSessionError, gatewayOf } from './sessions.js'

/**
 * §10's INTAKE key (Spec action 5, FE-1): a model before a project exists, paid for by the platform
 * — the front-end's agents that understand a description, propose names and choose the starter.
 * Bounded three ways, each a platform setting: a key's cap and life, a person's keys in a day, and
 * the platform's month. `api/routes/intake.ts` is the caller.
 */

export type IntakeSessionRow = typeof intakeSessions.$inferSelect

/**
 * THE DAY IS VANCOUVER'S (sitting 7's ruling): *"paused for today"* is read by a person in
 * Vancouver, and a UTC day would reopen at 16:00 or 17:00 local. The count is over this table's own
 * rows, so the zone costs nothing; the platform's MONTH stays LiteLLM's calendar month, in UTC.
 */
export const INTAKE_DAY_ZONE = 'America/Vancouver'

export interface IntakeDeps {
  db: Db
  llm: LiteLlmClient | undefined
  catalogue: ModelCatalogue
  intake: {
    model: string
    keyCapUsd: number
    keyMinutes: number
    dailyKeys: number
    monthlyUsd: number
  }
}

const toCap = (usd: number): number => Math.floor(usd * 1_000_000 + 1e-6) / 1_000_000

/**
 * Starts one intake session for a person in an interactive session — a token never reaches here
 * (`credential: 'session'`). Every refusal comes BEFORE anything is minted.
 */
export async function startIntakeSession(
  deps: IntakeDeps,
  actor: SessionActor,
): Promise<{ row: IntakeSessionRow; key: string }> {
  // 1. THE MODEL, checked at EVERY mint (Spec action 5): the setting must name a classified
  //    catalogue entry allowed for §7's default classification, `internal`. Lowered to `public`,
  //    unclassified, or gone, and intake PAUSES — never another model.
  const snapshot = await deps.catalogue.get()
  const llm = gatewayOf(deps)
  const model = deps.intake.model
  const entry = snapshot.models.find((m) => m.name === model)
  if (
    entry === undefined ||
    CLASSIFICATION_RANK[entry.maxClassification] < CLASSIFICATION_RANK.internal
  ) {
    throw new AgentSessionError(
      'INTAKE_MODEL_UNAVAILABLE',
      `the platform's intake model '${model}' is not a catalogue model approved for internal data, so intake is paused rather than sent anywhere else (D17)`,
    )
  }

  // 2. THE PLATFORM'S MONTH — the platform's own LiteLLM user, never the person's budget.
  const { spentUsd, resetsAt } = await intakeSpend(llm)
  const remaining = toCap(deps.intake.monthlyUsd - spentUsd)
  if (remaining <= 0) {
    throw new AgentSessionError(
      'INTAKE_BUDGET_EXHAUSTED',
      `the platform's monthly intake budget of $${deps.intake.monthlyUsd} is spent, so describing new apps is paused until the month resets`,
      // FE-29: the gateway's own reset, `null` when it reports none.
      {
        limit: {
          scope: 'platform',
          period: 'month',
          amountUsd: deps.intake.monthlyUsd,
          resetsAt,
        },
      },
    )
  }
  const capUsd = toCap(Math.min(deps.intake.keyCapUsd, remaining))

  // 3. THE LIFE — never past the signed-in session that asks (Spec action 5's §10 row).
  const now = Date.now()
  const seconds = Math.min(
    deps.intake.keyMinutes * 60,
    Math.floor((actor.expiresAt - now) / 1000),
  )

  // 4. THE PERSON'S DAY, counted and the row written under ONE per-person lock, so two starts at
  //    once cannot both see nine; the key is minted in the same transaction, so a failed mint
  //    leaves no row to count against them.
  let minted: { row: IntakeSessionRow; key: string } | undefined
  try {
    await deps.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`intake:${actor.userId}`}))`,
      )
      // The count AND the next midnight, in ONE statement (FE-29, Decision 5): one clock — the
      // database's, in the zone the count uses — decides both, so a refusal never says the day
      // lifts at a moment the count disagrees with (BC's clock rules against Node's tz data).
      const [today] = await tx
        .select({
          n: sql<number>`count(*)::int`,
          next: sql<
            Date | string
          >`(date_trunc('day', now() at time zone ${INTAKE_DAY_ZONE}) + interval '1 day') at time zone ${INTAKE_DAY_ZONE}`,
        })
        .from(intakeSessions)
        .where(
          and(
            eq(intakeSessions.userId, actor.userId),
            gte(
              intakeSessions.createdAt,
              sql`(date_trunc('day', now() at time zone ${INTAKE_DAY_ZONE}) at time zone ${INTAKE_DAY_ZONE})`,
            ),
          ),
        )
      if ((today?.n ?? 0) >= deps.intake.dailyKeys) {
        throw new AgentSessionError(
          'INTAKE_DAILY_LIMIT_REACHED',
          `you have started the ${deps.intake.dailyKeys} intake sessions a person may start in a day, so describing new apps is paused for today`,
          {
            limit: {
              scope: 'person',
              period: 'day',
              count: deps.intake.dailyKeys,
              resetsAt: today === undefined ? null : new Date(today.next).toISOString(),
            },
          },
        )
      }
      const [row] = await tx
        .insert(intakeSessions)
        .values({
          userId: actor.userId,
          model,
          capUsd: String(capUsd),
          expiresAt: new Date(now + seconds * 1000),
        })
        .returning()
      await ensureIntakeBudget(llm, { monthlyUsd: deps.intake.monthlyUsd })
      const key = await mintIntakeKey(llm, {
        sessionId: row!.id,
        userId: actor.userId,
        model,
        capUsd,
        seconds,
      })
      minted = { row: row!, key }
    })
  } catch (error) {
    if (minted !== undefined) {
      const alias = intakeKeyAlias(minted.row.id)
      console.error(
        `intake session ${minted.row.id}: its row did not commit after its key was minted — revoking ${alias}`,
      )
      await revokeIntakeKey(llm, minted.row.id).catch((revokeError: unknown) => {
        console.error(
          `intake session ${minted!.row.id}: ${alias} could NOT be revoked and stays live until ${new Date(now + seconds * 1000).toISOString()}: ${String(revokeError)}`,
        )
      })
    }
    throw error
  }
  if (minted === undefined)
    throw new Error('an intake session’s transaction ended without a key')
  return minted
}

export async function intakeSessionById(
  db: Db,
  sessionId: string,
): Promise<IntakeSessionRow | undefined> {
  const [row] = await db
    .select()
    .from(intakeSessions)
    .where(eq(intakeSessions.id, sessionId))
  return row
}

/**
 * Ends one intake session: the key revoked by its alias FIRST, then the row stamped — a revocation
 * that fails leaves the row open for a retry, an operator line, and the gateway's refusal.
 * Idempotent: an ended session is answered as it is.
 */
export async function endIntakeSession(
  deps: { db: Db; llm: LiteLlmClient | undefined },
  row: IntakeSessionRow,
): Promise<IntakeSessionRow> {
  if (row.endedAt !== null) return row
  const llm = gatewayOf(deps)
  try {
    await revokeIntakeKey(llm, row.id)
  } catch (error) {
    console.error(
      `intake session ${row.id}: ${intakeKeyAlias(row.id)} could NOT be revoked; it stays live until ${row.expiresAt.toISOString()} or a retry ends it`,
    )
    throw error
  }
  const [ended] = await deps.db
    .update(intakeSessions)
    .set({ endedAt: new Date() })
    .where(and(eq(intakeSessions.id, row.id), sql`${intakeSessions.endedAt} is null`))
    .returning()
  return ended ?? (await intakeSessionById(deps.db, row.id)) ?? row
}
