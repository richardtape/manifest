import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { agentSessions, delegatedTokens, projectMembers, type Db } from '../db/index.js'
import {
  eventFrame,
  makeRedactor,
  publishEvent,
  recordEvent,
  type EventBus,
} from '../observability/index.js'
import {
  AuthorizationError,
  holdActiveProject,
  personName,
  type Actor,
} from '../projects/index.js'
import type { Classification } from '../spec/index.js'
import { tokenById } from '../tokens/index.js'
import {
  agentKeyAlias,
  ensurePersonBudget,
  mintAgentKey,
  narrowAgentKey,
  personSpend,
  revokeAgentKey,
  type BudgetSpend,
} from './agent-keys.js'
import {
  CATALOGUE_CODES,
  CatalogueError,
  type CatalogueSnapshot,
  type ModelCatalogue,
} from './catalogue.js'
import type { LiteLlmClient } from './client.js'
import { agentModelsFor, classificationFloor, type BuilderModels } from './models.js'

/**
 * §10's agent sessions outside a sandbox (Spec action 1; the front-end enablement plan's Task 10,
 * Decisions 20–25): a row per session, a key per row — named by the row's id and never stored —
 * charged to the person the agent works for, capped, D17-routed, and ended with its session, its
 * token, its project or that person's place on it. `api/routes/agents.ts` is the caller; Task 11's
 * archive, a token's revoke and a member's removal (the launch path plan's Task 8) call
 * `endSessionsOf` too.
 */

export type AgentSessionCode =
  | 'AGENT_SESSION_ALREADY_STARTED'
  | 'AGENT_BUDGET_EXHAUSTED'
  | 'AGENT_NO_MODEL_FOR_CLASSIFICATION'
  | 'INTAKE_SESSION_ALREADY_STARTED'
  | 'INTAKE_DAILY_LIMIT_REACHED'
  | 'INTAKE_BUDGET_EXHAUSTED'
  | 'INTAKE_MODEL_UNAVAILABLE'

/**
 * A model session's refusals — agent and intake — each raised BEFORE anything is minted (Decisions
 * 22–23; Spec action 5's intake bounds). Each code's status is the registry's (`api/error-codes.ts`).
 */
export class AgentSessionError extends Error {
  constructor(
    readonly code: AgentSessionCode,
    message: string,
  ) {
    super(message)
    this.name = 'AgentSessionError'
  }
}

export type AgentSessionRow = typeof agentSessions.$inferSelect

/**
 * Decision 25's written ends — and `models_withdrawn` (FE-36; the front-end enablement plan's Task 14a):
 * its project no longer allows ANY model it held — one that keeps a model it may use is narrowed instead
 * (the launch path plan's Task 7) — and `member_removed` (Spec action 2; the launch path plan's Task 8):
 * the person it works for was taken off the project. Running out — of time or of money — is READ, never
 * written.
 */
export type EndReason =
  | 'ended'
  | 'token_revoked'
  | 'project_archived'
  | 'project_deleted'
  | 'models_withdrawn'
  | 'member_removed'

/** `expired` is derived at read time: LiteLLM stops the key at its `duration`, and no timer runs here. */
export function sessionState(
  row: { endedAt: Date | null; expiresAt: Date },
  now: number = Date.now(),
): 'active' | 'ended' | 'expired' {
  if (row.endedAt !== null) return 'ended'
  return row.expiresAt.getTime() <= now ? 'expired' : 'active'
}

export interface AgentSessionDeps {
  db: Db
  bus: EventBus
  /** `undefined` under `MANIFEST_AI_ENABLED=0` — and the catalogue, read first, refuses then. */
  llm: LiteLlmClient | undefined
  catalogue: ModelCatalogue
  agent: { monthlyUsd: number; sessionCapUsd: number; builderModels: BuilderModels }
}

/** Who ended a session, for the event: the acting triple every event since Task 6 carries. */
export interface EndedBy {
  userId: string
  tokenId: string | null
}

/** The gateway, or the refusal a platform with AI switched off answers everywhere else. */
export function gatewayOf(deps: { llm: LiteLlmClient | undefined }): LiteLlmClient {
  if (deps.llm === undefined) {
    throw new CatalogueError(
      CATALOGUE_CODES.DISABLED,
      'AI is switched off on this control plane',
      'MANIFEST_AI_ENABLED=0: no model key can be issued or ended until it is switched back on.',
    )
  }
  return deps.llm
}

// ---------------------------------------------------------------- the month, read

/**
 * DECISION 24'S TEN SECONDS: one person's spend, cached per gateway client, so a list of fifty
 * sessions is one `/user/info` a person rather than fifty. A failure is NEVER cached — the next
 * read asks again — and a start or an end forgets the person, because each changes what the
 * gateway holds. `[M8]` measured spend landing 3–6 s after a call, so a read may lag a call by that.
 */
const SPEND_TTL_MS = 10_000
const spendCaches = new WeakMap<
  LiteLlmClient,
  Map<string, { at: number; value: BudgetSpend }>
>()

export async function cachedPersonSpend(
  llm: LiteLlmClient,
  userId: string,
): Promise<BudgetSpend> {
  let cache = spendCaches.get(llm)
  if (cache === undefined) {
    cache = new Map()
    spendCaches.set(llm, cache)
  }
  const hit = cache.get(userId)
  if (hit !== undefined && Date.now() - hit.at < SPEND_TTL_MS) return hit.value
  const value = await personSpend(llm, userId)
  cache.set(userId, { at: Date.now(), value })
  return value
}

function forgetSpend(llm: LiteLlmClient, userId: string): void {
  spendCaches.get(llm)?.delete(userId)
}

/**
 * Dollars to the cap column's SIX places, DOWN — a cap is never more than what remains. Six, not
 * four: a cap under a hundredth of a cent is a real request (the plan's own Docker case asks for
 * $0.00002), and four places floored it to $0 — refused as a spent month (sitting 7's finding).
 */
const toCap = (usd: number): number => Math.floor(usd * 1_000_000 + 1e-6) / 1_000_000

// ---------------------------------------------------------------- start

/** The credential's own end: a token's `expires_at`, or the signed-in session's (Spec actions 1 and 5). */
async function credentialExpiry(db: Db, actor: Actor): Promise<number> {
  if (actor.credential === 'session') return actor.expiresAt
  const token = await tokenById(db, actor.tokenId)
  // The credential hook authenticated this token a moment ago; a row gone since is the store's defect.
  if (token === undefined)
    throw new Error(`the token '${actor.tokenId}' that asked has no row`)
  return token.expiresAt.getTime()
}

/**
 * Starts one session: its models, its cap, its life, its row and its key — in that order, each
 * refusal BEFORE anything is minted, and the row and the key in ONE transaction so a failed mint
 * leaves no session and a session never exists without the key its alias names.
 */
export async function startAgentSession(
  deps: AgentSessionDeps,
  input: {
    actor: Actor
    projectId: string
    name: string
    capUsd?: number | undefined
    durationMinutes?: number | undefined
  },
): Promise<{ row: AgentSessionRow; key: string }> {
  // 1. D17, from the catalogue — read FIRST, so a platform with AI switched off, or a project no
  //    model may serve, is refused before the gateway is asked anything (Decision 23).
  const snapshot = await deps.catalogue.get()
  const llm = gatewayOf(deps)
  const modelsNow = async (db: Pick<Db, 'select'>): Promise<string[]> => {
    const floor = await classificationFloor(db, input.projectId)
    const allowed = agentModelsFor(snapshot, floor, deps.agent.builderModels)
    if (allowed.length === 0) {
      // An empty list would be EVERY model to LiteLLM (`[M7]`): refused, never minted.
      throw new AgentSessionError(
        'AGENT_NO_MODEL_FOR_CLASSIFICATION',
        `no model in the platform's catalogue is approved for ${floor} data, so no agent key can be issued for this project (D17)`,
      )
    }
    return allowed
  }
  let models = await modelsNow(deps.db)

  // 2. The month — the PERSON's (a token acts for its minter, D24), read FRESH: a start must not
  //    mint against spend a cached read had not seen yet.
  const person = input.actor.userId
  const monthly = deps.agent.monthlyUsd
  const { spentUsd } = await personSpend(llm, person)
  const remaining = toCap(monthly - spentUsd)
  // Decided on what REMAINS, never on the cap asked for: a small cap is not a spent month.
  if (remaining <= 0) {
    throw new AgentSessionError(
      'AGENT_BUDGET_EXHAUSTED',
      `this month's agent budget of $${monthly} is spent ($${spentUsd.toFixed(2)} so far)`,
    )
  }
  const capUsd = toCap(
    Math.min(
      input.capUsd ?? deps.agent.sessionCapUsd,
      deps.agent.sessionCapUsd,
      remaining,
    ),
  )

  // 3. The life — never past the credential that asks (Decision 22; Spec action 1's §6).
  const now = Date.now()
  const until = await credentialExpiry(deps.db, input.actor)
  const seconds = Math.min(
    (input.durationMinutes ?? 60) * 60,
    Math.floor((until - now) / 1000),
  )
  const tokenId = input.actor.credential === 'token' ? input.actor.tokenId : null

  // 4. The row and the key together. `minted` is set only once the key exists, so a transaction
  //    that fails AFTER the mint — its commit — is a live key with no row: revoked by its alias.
  let minted: { row: AgentSessionRow; key: string } | undefined
  try {
    await deps.db.transaction(async (tx) => {
      // THE TOKEN, HELD FOR THE LENGTH OF THE START (the whole-branch review's I1). It was
      // authenticated when the request arrived, and the mint below takes hundreds of milliseconds:
      // a `revokeToken` landing in between found no committed session to end, and this then
      // committed a live key for a revoked token. `FOR SHARE` conflicts with the revoke's UPDATE, so
      // either the revoke waits for this commit — and its `endSessionsOf` ends the session — or it
      // committed first and is seen here, and the start is refused as that token is everywhere else.
      // AND THE PROJECT, FOR THE SAME REASON (the front-end enablement plan's Task 11, carrying I1):
      // an archive landing during the mint found no committed session to end, and this then
      // committed a live key for a switched-off project. Held here, the archive's state change
      // waits for this commit — and its teardown ends the session — or it committed first, and the
      // start is refused `PROJECT_ARCHIVED`.
      await holdActiveProject(tx, input.projectId)
      // THE CLASSIFICATION, READ AGAIN UNDER THE PROJECT (FE-36; the front-end enablement plan's Task
      // 14a). The read above refuses early; this one is what the key is minted with. A commit raising
      // the classification while this start waited on the gateway — its spend read takes hundreds of
      // milliseconds — found no committed session to narrow, and this would then have minted the OLD
      // models. `withdrawWhatItNoLongerAllows`'s barrier takes this row FOR UPDATE after the new
      // manifest is recorded: it waits for this commit and `narrowSessionsHoldingMore` then narrows (or
      // ends) what it holds — or it went first, and this read sees the new manifest.
      models = await modelsNow(tx)
      // THE PERSON'S PLACE ON THE PROJECT, HELD FOR THE LENGTH OF THE START (Spec action 2; the launch
      // path plan's Task 8) — the token's hold below, for a session with no token. `assertCapability`
      // read the membership when the request arrived: a removal committing during the mint found no
      // committed session to end, and this then committed a live key for somebody no longer on the
      // project. `FOR SHARE` conflicts with the removal's DELETE, so either the removal waits for this
      // commit — and its `endSessionsOf` ends the session — or it committed first, and the start is
      // refused as a stranger is. An ADMINISTRATOR acts here without membership (§13), so none is
      // refused for having none; a membership they hold is held all the same.
      if (input.actor.credential === 'session') {
        const [member] = await tx
          .select({ role: projectMembers.role })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, input.projectId),
              eq(projectMembers.userId, person),
            ),
          )
          .for('share')
        if (member === undefined && input.actor.platformRole !== 'admin') {
          throw new AuthorizationError('NOT_FOUND', `no project '${input.projectId}'`)
        }
      }
      if (tokenId !== null) {
        const [held] = await tx
          .select({
            revokedAt: delegatedTokens.revokedAt,
            expiresAt: delegatedTokens.expiresAt,
          })
          .from(delegatedTokens)
          .where(eq(delegatedTokens.id, tokenId))
          .for('share')
        if (
          held === undefined ||
          held.revokedAt !== null ||
          held.expiresAt.getTime() <= Date.now()
        ) {
          throw Object.assign(
            new Error('the delegated token that asked is no longer valid'),
            {
              statusCode: 401,
            },
          )
        }
      }
      const [row] = await tx
        .insert(agentSessions)
        .values({
          projectId: input.projectId,
          userId: person,
          requestedByToken: tokenId,
          name: input.name,
          models,
          capUsd: String(capUsd),
          expiresAt: new Date(now + seconds * 1000),
        })
        .returning()
      await ensurePersonBudget(llm, { userId: person, monthlyUsd: monthly })
      const key = await mintAgentKey(llm, {
        sessionId: row!.id,
        userId: person,
        projectId: input.projectId,
        tokenId,
        models,
        capUsd,
        seconds,
      })
      minted = { row: row!, key }
    })
  } catch (error) {
    if (minted !== undefined) {
      const alias = agentKeyAlias(minted.row.id)
      console.error(
        `agent session ${minted.row.id}: its row did not commit after its key was minted — revoking ${alias}`,
      )
      await revokeAgentKey(llm, minted.row.id).catch((revokeError: unknown) => {
        // Named, never swallowed: the one outcome worse than a refusal is a live key nobody can end.
        console.error(
          `agent session ${minted!.row.id}: ${alias} could NOT be revoked and stays live until ${new Date(now + seconds * 1000).toISOString()}: ${String(revokeError)}`,
        )
      })
    }
    throw error
  }
  if (minted === undefined)
    throw new Error('an agent session’s transaction ended without a key')
  forgetSpend(llm, person)

  // 5. Published AFTER the commit — an event naming a session that does not exist is worse than none.
  const tokenName =
    tokenId === null ? null : ((await tokenById(deps.db, tokenId))?.name ?? null)
  const who = await personName(deps.db, person)
  await publishEvent(
    deps.db,
    deps.bus,
    {
      projectId: input.projectId,
      subject: `agent_session:${minted.row.id}`,
      type: 'agent_session.started',
      machineDetail: {
        sessionId: minted.row.id,
        models,
        capUsd,
        expiresAt: minted.row.expiresAt.toISOString(),
        via: tokenId === null ? 'session' : 'token',
        userId: person,
        tokenId,
      },
      humanMessage:
        `${who} started an agent session, '${input.name}', charged to them: up to $${capUsd} ` +
        `until ${minted.row.expiresAt.toISOString().slice(0, 16).replace('T', ' ')} UTC` +
        (tokenName === null ? '.' : `, asked for by the delegated token '${tokenName}'.`),
    },
    makeRedactor([]),
  )
  return minted
}

// ---------------------------------------------------------------- read

export async function agentSessionById(
  db: Db,
  sessionId: string,
): Promise<AgentSessionRow | undefined> {
  const [row] = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, sessionId))
  return row
}

/** A project's sessions, newest first — at most `limit`, and whether there were more. */
export async function agentSessionsOf(
  db: Db,
  projectId: string,
  limit: number,
): Promise<{ rows: AgentSessionRow[]; truncated: boolean }> {
  const rows = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.projectId, projectId))
    .orderBy(desc(agentSessions.createdAt), desc(agentSessions.id))
    .limit(limit + 1)
  return { rows: rows.slice(0, limit), truncated: rows.length > limit }
}

// ---------------------------------------------------------------- end

const endReasonWords: Record<EndReason, string> = {
  ended: 'ended',
  token_revoked: 'ended because the delegated token that started it was revoked',
  project_archived: 'ended because the project was switched off',
  project_deleted: 'ended because the project was deleted',
  models_withdrawn:
    'ended because its project no longer allows any of the models it held — its data classification was raised, or the platform now keeps a confidential project’s building agent on-premise',
  member_removed: 'ended because the person it works for was removed from the project',
}

/**
 * Ends ONE session: its spend read, its key revoked by alias, its row stamped — in that order.
 *
 * **THE REVOCATION COMES BEFORE THE ROW.** A revocation that fails leaves the row active, so a
 * retry finds it; stamping first and failing at the gateway would be a live key nothing points
 * at. It is an operator line and the gateway's refusal, never a swallowed catch (Decision 25).
 *
 * **THE SPEND IS READ BEFORE THE KEY GOES** (FE-23): LiteLLM deletes the key's row with it. A read
 * that fails is recorded as unknown — it must not stop the revocation, which is the control.
 * Idempotent: an ended session is answered as it is.
 *
 * **WITH AI SWITCHED OFF, AN EXPIRED SESSION IS STAMPED WITHOUT THE GATEWAY** (the front-end
 * enablement plan's Task 11 — sitting 7's review's deferred minor 3, decided): its key stopped
 * working at its own `duration`, which LiteLLM enforces (Task 9's control (a)), so there is nothing
 * a revocation would stop — and without this an archive, or a token's revoke, of a project that
 * ever ran a session could never finish while AI is off. What it spent is unknown, and says so. A
 * session whose key is still live is never stamped without the gateway: that is a live key nobody
 * could then end.
 */
export async function endAgentSession(
  deps: { db: Db; bus: EventBus; llm: LiteLlmClient | undefined },
  row: AgentSessionRow,
  reason: EndReason,
  by: EndedBy,
): Promise<AgentSessionRow> {
  if (row.endedAt !== null) return row
  let spent: number | null = null
  if (deps.llm !== undefined || row.expiresAt.getTime() > Date.now()) {
    const llm = gatewayOf(deps)
    try {
      spent =
        (await personSpend(llm, row.userId)).byAlias.get(agentKeyAlias(row.id)) ?? null
    } catch (error) {
      console.error(
        `agent session ${row.id}: what its key spent could not be read before it ended, so it is recorded as unknown: ${String(error)}`,
      )
      spent = null
    }
    try {
      await revokeAgentKey(llm, row.id)
    } catch (error) {
      console.error(
        `agent session ${row.id}: ${agentKeyAlias(row.id)} could NOT be revoked (${reason}); it stays live until ${row.expiresAt.toISOString()} or a retry ends it`,
      )
      throw error
    }
    forgetSpend(llm, row.userId)
  }
  const [ended] = await deps.db
    .update(agentSessions)
    .set({
      endedAt: new Date(),
      endReason: reason,
      spentUsd: spent === null ? null : String(spent),
    })
    .where(and(eq(agentSessions.id, row.id), isNull(agentSessions.endedAt)))
    .returning()
  // Another request ended it between the read and the write: answered as it is, published once.
  if (ended === undefined) return (await agentSessionById(deps.db, row.id)) ?? row
  await publishEvent(
    deps.db,
    deps.bus,
    {
      projectId: row.projectId,
      subject: `agent_session:${row.id}`,
      type: 'agent_session.ended',
      machineDetail: {
        sessionId: row.id,
        reason,
        via: by.tokenId === null ? 'session' : 'token',
        userId: by.userId,
        tokenId: by.tokenId,
      },
      humanMessage: `${await personName(deps.db, row.userId)}'s agent session '${row.name}' was ${endReasonWords[reason]}.`,
    },
    makeRedactor([]),
  )
  return ended
}

/**
 * Ends EVERY live session of a token, a project, or one person on a project (Decision 25: a revoked
 * token, an archived or a deleted project; Spec action 2: a person removed from it). Each is tried;
 * each that could not be ended is named in a line of its own WITH ITS CAUSE, then all of them in one
 * summary line, and the call fails — so the request that asked is answered an error and its retry,
 * which reaches here even when the token is already revoked or the person already removed, ends what
 * remains. Answers the ids it ended.
 *
 * **A PERSON'S TARGET IS TOLD FROM A PROJECT'S FIRST** (the launch path plan's Task 8): `{ projectId,
 * userId }` also has a `projectId`, and read as the project alone it would end every session on it — a
 * removal ending the colleagues' agents too. Token-started and browser-started alike: `user_id` is on
 * every session, and a browser-started one has no token for a revoke to reach.
 *
 * **THE ANSWER IS THE CAUSE WHEN THE CAUSE HAS A CODE** (the whole-branch review's I1): AI switched
 * off (`gatewayOf`'s `AI_CATALOGUE_DISABLED`) is rethrown as a `CatalogueError` of the same code, so
 * `revokeToken` and `removeMember` answer the code they declare, and an archive's operator line names
 * it; anything else is a plain `Error`, a `500`.
 */
export async function endSessionsOf(
  deps: { db: Db; bus: EventBus; llm: LiteLlmClient | undefined },
  target:
    { projectId: string; userId: string } | { projectId: string } | { tokenId: string },
  reason: EndReason,
  by: EndedBy,
  /**
   * Where each id is put AS its session ends — the answer is this array. For a caller that records
   * what it did even when the call then fails: `removeMember`'s `member.removed` is published whether
   * or not every session ended, and counts the ones that did.
   */
  ended: string[] = [],
): Promise<string[]> {
  const live = await deps.db
    .select()
    .from(agentSessions)
    .where(
      and(
        'tokenId' in target
          ? eq(agentSessions.requestedByToken, target.tokenId)
          : 'userId' in target
            ? and(
                eq(agentSessions.projectId, target.projectId),
                eq(agentSessions.userId, target.userId),
              )
            : eq(agentSessions.projectId, target.projectId),
        isNull(agentSessions.endedAt),
      ),
    )
  const failed: string[] = []
  let catalogue: CatalogueError | undefined
  for (const row of live) {
    try {
      await endAgentSession(deps, row, reason, by)
      ended.push(row.id)
    } catch (error) {
      // EACH WITH ITS CAUSE (the whole-branch review's M8, as `narrowSessionsHoldingMore`'s M3):
      // `endAgentSession` writes a line of its own only when the REVOCATION fails — a failure
      // before it (`gatewayOf`, AI switched off) or after it (the row's stamp, the event) would
      // otherwise be named below as a live key the gateway may already have revoked. `String`
      // of an `AiError` or a database error carries no key: a key is never in either.
      console.error(
        `agent session ${row.id}: its end (${reason}) did not complete — its key may or may not still be live: ${String(error)}`,
      )
      if (catalogue === undefined && error instanceof CatalogueError) catalogue = error
      failed.push(row.id)
    }
  }
  if (failed.length > 0) {
    const scope =
      'tokenId' in target
        ? `token ${target.tokenId}`
        : 'userId' in target
          ? `person ${target.userId} on project ${target.projectId}`
          : `project ${target.projectId}`
    console.error(
      `${failed.length} agent session(s) of ${scope} could not be ended after '${reason}': ${failed.join(', ')} — each line above says why; a key not revoked stays live until it expires or the request is retried`,
    )
    const words = `${failed.length} agent session(s) could not be ended, and a key not revoked stays live until it expires or this is retried`
    if (catalogue !== undefined)
      throw new CatalogueError(
        catalogue.code,
        `${words}: ${catalogue.message}`,
        catalogue.hint,
      )
    throw new Error(words)
  }
  return ended
}

// ---------------------------------------------------------------- withdrawn

/** `a`, `a and b`, `a, b and c` — model names inside a sentence. */
function inWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * WHY `withdrawn` LEFT A SESSION, for its sentence: a model the setting `capable` would still allow was
 * withdrawn by the builder SETTING (`on-premise`, read at a restart); any other by the project's
 * classification — its manifest, or the release production serves.
 */
function withdrawnBecause(
  snapshot: CatalogueSnapshot,
  floor: Classification,
  withdrawn: readonly string[],
): string {
  const underCapable = new Set(agentModelsFor(snapshot, floor, 'capable'))
  return [
    ...(withdrawn.some((m) => !underCapable.has(m))
      ? [`the project is now ${floor}`]
      : []),
    ...(withdrawn.some((m) => underCapable.has(m))
      ? ['the platform now keeps a confidential project’s building agent on-premise']
      : []),
  ].join(' and ')
}

/**
 * NARROWS ONE SESSION IN PLACE (§7 as Spec action 1 amended it; the launch path plan's Task 7, Decision 23):
 * its key to `kept` at the gateway, then its row's `models` and `agent_session.narrowed` in ONE
 * transaction, and the frame published only once that has committed.
 *
 * **THE GATEWAY FIRST, AND THE ROW ONLY AFTER IT ANSWERED.** A narrowing the gateway refuses throws before
 * anything is written: the session goes on, its row still names every model its key can call, and the
 * next sweep — every trigger, and the boot — finds it again. Written first, a failure would leave a key
 * holding models its row says it lost. A narrowing the gateway made and the transaction then failed to
 * record is the same row, found again: `/key/update` with the same list is answered as the first was.
 *
 * The row is written only while it is still what the sweep read — not ended, and holding the same list —
 * so two sweeps racing on one session publish one event, and an end that landed between the read and the
 * write is left as it is. Answers whether it recorded the narrowing.
 */
async function narrowAgentSession(
  deps: { db: Db; bus: EventBus; llm: LiteLlmClient | undefined },
  row: AgentSessionRow,
  change: { withdrawn: string[]; kept: string[]; because: string },
): Promise<boolean> {
  await narrowAgentKey(gatewayOf(deps), row.id, change.kept)
  const who = await personName(deps.db, row.userId)
  const recorded = await deps.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(agentSessions)
      .set({ models: change.kept })
      .where(
        and(
          eq(agentSessions.id, row.id),
          isNull(agentSessions.endedAt),
          eq(agentSessions.models, row.models),
        ),
      )
      .returning({ id: agentSessions.id })
    if (updated === undefined) return undefined
    return recordEvent(
      tx,
      {
        projectId: row.projectId,
        subject: `agent_session:${row.id}`,
        type: 'agent_session.narrowed',
        // Attributed as `models_withdrawn`'s end is: nobody asked, and the key is the person's.
        machineDetail: {
          sessionId: row.id,
          withdrawn: change.withdrawn,
          models: change.kept,
          via: 'session',
          userId: row.userId,
          tokenId: null,
        },
        humanMessage:
          `${who}'s agent session '${row.name}' can no longer use ${inWords(change.withdrawn)}, ` +
          `because ${change.because}; it keeps ${inWords(change.kept)}.`,
      },
      makeRedactor([]),
    )
  })
  if (recorded === undefined) return false
  deps.bus.publish(eventFrame(recorded))
  return true
}

/**
 * **FE-36 — A SESSION NEVER HOLDS MORE THAN ITS PROJECT NOW ALLOWS** (§7 and §10 as Spec actions 10 and 1
 * amended them; the front-end enablement plan's Task 14a, and the launch path plan's Task 7). Every ACTIVE
 * session — of one project, or of `every` project — whose key names a model the catalogue still serves and
 * that `agentModelsFor` no longer allows is NARROWED IN PLACE: its key keeps what the project still allows
 * and loses the rest at once, the session goes on, and `agent_session.narrowed` says what was withdrawn. It
 * is ENDED `models_withdrawn` only when nothing it may use is left — no model the project still allows (a
 * key is never narrowed to an empty list, which LiteLLM reads as every model). Its project's classification
 * was raised, or the builder setting was narrowed to `on-premise` (a restart). The classification rises
 * when a newer valid manifest is RECORDED — by a commit through the API, a build, `validateSpec`, or on
 * driver 2 a push its webhook reports — or when production comes to serve a release classified higher (a
 * production deploy, a rehearsal). **A push to driver 1's repository is recorded by none of these** (the
 * whole-branch review's M7): a new start and a live session both read the manifest last recorded, so they
 * agree with each other, but until one of those runs they hold what the manifest on `main` may no longer
 * allow. A name the catalogue no longer holds is not counted as withdrawn — the gateway serves nothing
 * under it — and is kept on the key, but it is nothing the session may USE: one left holding only such
 * names is ended. An expired session is not touched — its key stopped at its own `duration`.
 *
 * **Callers**: `api/spec-validation.ts`'s `withdrawWhatItNoLongerAllows` (behind its barrier) — after
 * every valid manifest `validateAndRecord` records, after a production deploy and after a rehearsal — and
 * the boot, over every project. Each failure is named in a line of its own with its cause, then all of
 * them in one summary line, and answered in `failed` — never thrown, because a commit that raised the
 * classification has already landed — and the next sweep (any trigger, and every boot) finishes it. **A
 * narrowing that failed is the trade the sweep has always made**: the session stays live, and its key
 * keeps the withdrawn models until then — the operator line says which. The person the session is charged
 * to is who it is attributed to: nobody asked for this, and they are the one whose key it was.
 *
 * Reads nothing from the gateway when no session is active, so a commit to a project nobody is building
 * with pays one query.
 */
export async function narrowSessionsHoldingMore(
  deps: {
    db: Db
    bus: EventBus
    llm: LiteLlmClient | undefined
    catalogue: ModelCatalogue
    agent: { builderModels: BuilderModels }
  },
  scope: { projectId: string } | 'every',
): Promise<{ ended: string[]; narrowed: string[]; failed: string[] }> {
  const live = await deps.db
    .select()
    .from(agentSessions)
    .where(
      and(
        isNull(agentSessions.endedAt),
        gt(agentSessions.expiresAt, new Date()),
        ...(scope === 'every' ? [] : [eq(agentSessions.projectId, scope.projectId)]),
      ),
    )
  if (live.length === 0) return { ended: [], narrowed: [], failed: [] }
  const snapshot = await deps.catalogue.get()
  const served = new Set([
    ...snapshot.models.map((m) => m.name),
    ...snapshot.unclassified,
  ])
  const projects = new Map<string, { floor: Classification; allowed: Set<string> }>()
  const ended: string[] = []
  const narrowed: string[] = []
  const failed: string[] = []
  for (const row of live) {
    let project = projects.get(row.projectId)
    if (project === undefined) {
      const floor = await classificationFloor(deps.db, row.projectId)
      project = {
        floor,
        allowed: new Set(agentModelsFor(snapshot, floor, deps.agent.builderModels)),
      }
      projects.set(row.projectId, project)
    }
    const { floor, allowed } = project
    const withdrawn = row.models.filter((m) => served.has(m) && !allowed.has(m))
    if (withdrawn.length === 0) continue
    const kept = row.models.filter((m) => allowed.has(m) || !served.has(m))

    if (!kept.some((m) => allowed.has(m))) {
      // NOTHING IT MAY USE IS LEFT: ended, as every withdrawal was before the launch path plan's Task 7.
      try {
        await endAgentSession(deps, row, 'models_withdrawn', {
          userId: row.userId,
          tokenId: null,
        })
        ended.push(row.id)
      } catch (error) {
        // EACH WITH ITS CAUSE (the review's M3): `endAgentSession` writes a line of its own only when
        // the REVOCATION fails; a failure after it — the row's stamp, the event — would otherwise be
        // named here as a live key the gateway had already revoked.
        console.error(
          `agent session ${row.id}: its end (models_withdrawn) did not complete — its key may or may not still be live; the next sweep tries again: ${String(error)}`,
        )
        failed.push(row.id)
      }
      continue
    }

    try {
      const recorded = await narrowAgentSession(deps, row, {
        withdrawn,
        kept,
        because: withdrawnBecause(snapshot, floor, withdrawn),
      })
      if (recorded) narrowed.push(row.id)
    } catch (error) {
      // Its own line, WITH ITS CAUSE — the gateway's refusal, AI switched off, or the record after a
      // narrowing the gateway made — and what its key may still hold. `String` of an `AiError`, a
      // `CatalogueError` or a database error carries no key: a key is never in any of them.
      console.error(
        `agent session ${row.id}: its narrowing did not complete — its key may still hold ${inWords(withdrawn)}, which its project no longer allows, until the next sweep narrows it: ${String(error)}`,
      )
      failed.push(row.id)
    }
  }
  if (failed.length > 0) {
    console.error(
      `${failed.length} agent session(s) hold models their project no longer allows and could not be narrowed or ended: ${failed.join(', ')} — each line above says why; ${narrowed.length} other(s) were narrowed and ${ended.length} ended; a key not narrowed or revoked keeps those models until it expires or the next sweep — a commit, a production deploy, a rehearsal or a boot — finishes it`,
    )
  }
  return { ended, narrowed, failed }
}
