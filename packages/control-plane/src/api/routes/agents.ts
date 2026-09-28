import { z } from 'zod/v4'
import {
  AgentSessionError,
  agentKeyAlias,
  agentSessionById,
  agentSessionsOf,
  cachedPersonSpend,
  endAgentSession,
  startAgentSession,
  type AgentSessionRow,
} from '../../ai/index.js'
import type { Db } from '../../db/index.js'
import { assertCapability, AuthorizationError, personName } from '../../projects/index.js'
import { tokenById } from '../../tokens/index.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { PATH } from '../contract/schemas.js'
import {
  AgentBudget,
  AgentSession,
  AgentSessionList,
  AgentSessionStarted,
  StartAgentSessionRequest,
  toAgentSession,
} from '../representations/agents.js'
import type { ServerDeps } from '../server.js'

const ProjectParams = z.strictObject({ projectId: PATH.projectId })
const SessionParams = z.strictObject({ sessionId: PATH.sessionId })

/** Decision 4's cap on a list, as `listInstances` has. */
const SESSIONS_LISTED = 50

const UNKNOWN = {
  gateway:
    'the model gateway did not answer, so what it has spent is not known right now',
  keyGone:
    'the model gateway no longer holds this session’s key, so what it spent is not known',
  notRecorded: 'what it spent could not be read from the model gateway when it ended',
  aiOff: 'AI is switched off on this control plane',
} as const

/**
 * FE-23: what each session spent — one cached `/user/info` per PERSON, never a read per session,
 * and `null` with a reason whenever the number is not known (Decision 24's rule, never 0). An
 * ended session answers what was recorded when it ended: its key, and so its row at the gateway,
 * is gone.
 */
async function spendOf(
  deps: ServerDeps,
  rows: readonly AgentSessionRow[],
): Promise<Map<string, { usd: number | null; unavailable: string | null }>> {
  const byPerson = new Map<string, Map<string, number> | string>()
  for (const userId of new Set(
    rows.filter((r) => r.endedAt === null).map((r) => r.userId),
  )) {
    if (deps.llm === undefined) {
      byPerson.set(userId, UNKNOWN.aiOff)
      continue
    }
    try {
      byPerson.set(userId, new Map((await cachedPersonSpend(deps.llm, userId)).byAlias))
    } catch {
      // The reason is the answer (Decision 24); the gateway's own failure reached no field.
      byPerson.set(userId, UNKNOWN.gateway)
    }
  }
  const spent = new Map<string, { usd: number | null; unavailable: string | null }>()
  for (const row of rows) {
    if (row.endedAt !== null) {
      spent.set(
        row.id,
        row.spentUsd === null
          ? { usd: null, unavailable: UNKNOWN.notRecorded }
          : { usd: Number(row.spentUsd), unavailable: null },
      )
      continue
    }
    const known = byPerson.get(row.userId)
    if (typeof known === 'string') {
      spent.set(row.id, { usd: null, unavailable: known })
      continue
    }
    const usd = known?.get(agentKeyAlias(row.id))
    spent.set(
      row.id,
      usd === undefined
        ? { usd: null, unavailable: UNKNOWN.keyGone }
        : { usd, unavailable: null },
    )
  }
  return spent
}

/**
 * Rows as the API reads them: each person's and each token's name read once. `spent` is given
 * when it is already known — a session just started has spent nothing — so the answer does not
 * read the gateway, and does not put a month read before the start back into the cache.
 */
async function represent(
  deps: ServerDeps,
  rows: readonly AgentSessionRow[],
  known?: Map<string, { usd: number | null; unavailable: string | null }>,
) {
  const spent = known ?? (await spendOf(deps, rows))
  const people = new Map<string, string>()
  const tokens = new Map<string, string | null>()
  for (const row of rows) {
    if (!people.has(row.userId))
      people.set(row.userId, await personName(deps.db, row.userId))
    const token = row.requestedByToken
    if (token !== null && !tokens.has(token))
      tokens.set(token, (await tokenById(deps.db, token))?.name ?? null)
  }
  return rows.map((row) =>
    toAgentSession(row, {
      personName: people.get(row.userId)!,
      tokenName:
        row.requestedByToken === null ? null : (tokens.get(row.requestedByToken) ?? null),
      spent: spent.get(row.id)!,
    }),
  )
}

async function sessionOr404(db: Db, sessionId: string): Promise<AgentSessionRow> {
  const row = await agentSessionById(db, sessionId)
  if (row === undefined)
    throw new AuthorizationError('NOT_FOUND', `no agent session '${sessionId}'`)
  return row
}

// Captured from a run of `api/agents.test.ts`'s shape on the recording gateway, 2026-09-27: a
// token's session (`conversation-42`) and a person's, the second ended — the key replaced by a
// placeholder that is not one (Task 10 Step 5: never a captured key).
const MODELS = [
  'default-chat',
  'default-chat-onprem',
  'default-chat-reasoning',
  'default-chat-onprem-reasoning',
  'default-embed',
]
const EXAMPLE_PERSON = { id: 'faa3ced2-b2a9-4e6e-bc81-3f1b9aeec390', name: 'Bio Prof' }
const EXAMPLE_SESSION: z.input<typeof AgentSession> = {
  id: '860e32ca-5a3e-4698-8bd0-0510a63517f4',
  projectId: 'c58a9190-1c1b-42e0-a0a2-a79397d85bf5',
  name: 'Build the bulletin board',
  person: EXAMPLE_PERSON,
  via: { tokenId: '927eda69-f9bf-465f-8c16-5d6f4602a5c2', tokenName: 'conversation-42' },
  models: MODELS,
  capUsd: 2,
  expiresAt: '2026-09-28T02:27:48.266Z',
  state: 'active',
  endedAt: null,
  endReason: null,
  spentUsd: 0.4,
  spentUnavailable: null,
  createdAt: '2026-09-28T01:27:48.266Z',
}
const EXAMPLE_ENDED: z.input<typeof AgentSession> = {
  id: '7e3c8584-9d4f-45ca-a800-3de96167d7e0',
  projectId: 'c58a9190-1c1b-42e0-a0a2-a79397d85bf5',
  name: 'Fix the sign-in page',
  person: EXAMPLE_PERSON,
  via: null,
  models: MODELS,
  capUsd: 2,
  expiresAt: '2026-09-28T02:27:48.280Z',
  state: 'ended',
  endedAt: '2026-09-28T01:27:48.287Z',
  endReason: 'ended',
  spentUsd: 0.25,
  spentUnavailable: null,
  createdAt: '2026-09-28T01:27:48.279Z',
}

/**
 * §10's agent sessions over the API (the front-end enablement plan's Task 10; Spec action 1): a
 * model key for an agent OUTSIDE a sandbox, charged to the person it works for, answered once.
 * Their callers are the faculty front-end's server (one token per conversation) and, from Task 13,
 * the reference console; until then `api/agents.test.ts` and the journey's coverage name them.
 */
export const agentRoutes = [
  defineRoute({
    operationId: 'startAgentSession',
    method: 'POST',
    path: '/v1/projects/{projectId}/agent-sessions',
    tag: 'agents',
    summary: 'Give an agent a model key, charged to you',
    description:
      '§10: a model key for one agent working on this project — on the models the project’s data classification allows (D17), capped (`capUsd`, never more than the platform’s session cap or what remains of your month), and short-lived (`durationMinutes`, never past the credential that asks). **The key is in this answer and nowhere else**: Manifest keeps no copy, and a retry with the same Idempotency-Key answers `409 AGENT_SESSION_ALREADY_STARTED` naming the session rather than the key — end it and start another if the first answer was lost. Its spend is YOURS — a delegated token’s minter’s — against your monthly agent budget (`getAgentBudget`). The key calls models and nothing else; it is not a Manifest credential.',
    params: ProjectParams,
    query: NO_QUERY,
    body: StartAgentSessionRequest,
    success: {
      status: 201,
      description:
        'The session, and its key — the only time the key exists outside the gateway.',
      schema: AgentSessionStarted,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'AGENT_SESSION_ALREADY_STARTED',
      'AGENT_BUDGET_EXHAUSTED',
      'AGENT_NO_MODEL_FOR_CLASSIFICATION',
      'AI_CATALOGUE_DISABLED',
      'AI_BACKEND_UNAVAILABLE',
    ],
    // SHOWN ONCE (Decision 20; `mintToken`'s shape): the idempotency record keeps the session
    // WITHOUT its key, and a retry is told which session it started.
    withholdOnReplay: {
      stored: ({ session }) => ({ session }),
      refuse: (stored) => {
        const session = (stored as { session?: { id?: unknown; name?: unknown } } | null)
          ?.session
        if (typeof session?.id !== 'string' || typeof session.name !== 'string') {
          // A record with no session is the platform's defect — an honest 500, never a replay.
          return new Error('a start’s idempotency record holds no session to name')
        }
        return new AgentSessionError(
          'AGENT_SESSION_ALREADY_STARTED',
          `this request already started the agent session '${session.name}' (${session.id}); its key was answered then and is never shown again — end it with endAgentSession and start another if that answer was lost`,
        )
      },
    },
    examples: {
      request: { name: 'Build the bulletin board', capUsd: 2, durationMinutes: 60 },
      response: {
        session: { ...EXAMPLE_SESSION, spentUsd: 0 },
        key: 'sk-example-not-a-real-key',
        baseUrl: 'http://127.0.0.1:7106/v1',
      },
    },
    handler: async ({ deps, actor, params, body }) => {
      await assertCapability(deps.db, actor, params.projectId, 'agent:session')
      const { row, key } = await startAgentSession(
        {
          db: deps.db,
          bus: deps.bus,
          llm: deps.llm,
          catalogue: deps.catalogue,
          agent: deps.config.agent,
        },
        {
          actor,
          projectId: params.projectId,
          name: body.name,
          capUsd: body.capUsd,
          durationMinutes: body.durationMinutes,
        },
      )
      // A key just minted has spent nothing: a known zero, not the gateway's lag.
      const [session] = await represent(
        deps,
        [row],
        new Map([[row.id, { usd: 0, unavailable: null }]]),
      )
      return { session: session!, key, baseUrl: deps.config.agent.llmUrl }
    },
  }),
  defineRoute({
    operationId: 'listAgentSessions',
    method: 'GET',
    path: '/v1/projects/{projectId}/agent-sessions',
    tag: 'agents',
    summary: 'A project’s agent sessions',
    description:
      'Every agent session on this project, newest first, at most 50 — ended and expired ones included — each with what its key has spent (`spentUsd`, null with a reason when the gateway cannot say, never 0 for unknown). No key is in it.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The sessions, newest first.',
      schema: AgentSessionList,
    },
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        sessions: [EXAMPLE_ENDED, EXAMPLE_SESSION],
        truncated: false,
      },
    },
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const { rows, truncated } = await agentSessionsOf(
        deps.db,
        params.projectId,
        SESSIONS_LISTED,
      )
      return { sessions: await represent(deps, rows), truncated }
    },
  }),
  defineRoute({
    operationId: 'endAgentSession',
    method: 'DELETE',
    path: '/v1/agent-sessions/{sessionId}',
    tag: 'agents',
    summary: 'End an agent session',
    description:
      'Revokes the session’s key at the gateway, from the next call onwards, and records what it spent. A person may end any session on their project; a delegated token only the ones it started. Ending twice answers the session as it is.',
    params: SessionParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The session, ended.', schema: AgentSession },
    errors: ['NOT_FOUND', 'FORBIDDEN', 'AI_BACKEND_UNAVAILABLE'],
    examples: {
      response: EXAMPLE_ENDED,
    },
    handler: async ({ deps, actor, params }) => {
      // By the session id alone: the project is the ROW's, never the request's.
      const row = await sessionOr404(deps.db, params.sessionId)
      await assertCapability(deps.db, actor, row.projectId, 'agent:session')
      // Decision 25: a token ends only what it started — never a person's session, nor another
      // conversation's.
      if (actor.credential === 'token' && row.requestedByToken !== actor.tokenId) {
        throw new AuthorizationError(
          'FORBIDDEN',
          `agent session '${row.id}' was not started by this token, so it cannot end it`,
        )
      }
      const ended = await endAgentSession(deps, row, 'ended', {
        userId: actor.userId,
        tokenId: actor.credential === 'token' ? actor.tokenId : null,
      })
      const [session] = await represent(deps, [ended])
      return session!
    },
  }),
  defineRoute({
    operationId: 'getAgentBudget',
    method: 'GET',
    path: '/v1/agent-budget',
    tag: 'agents',
    summary: 'Your agent budget this month',
    description:
      'The monthly agent budget of the person the credential acts for — yours, or a delegated token’s minter’s — what their agents have spent across every project, and what remains. `spentUsd` is null with a reason when the model gateway does not answer: never 0 for unknown. Spend lands a few seconds after a call.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The budget.', schema: AgentBudget },
    errors: [],
    examples: {
      response: {
        monthlyUsd: 10,
        spentUsd: 0.65,
        remainingUsd: 9.35,
        resetsAt: '2026-10-01T00:00:00.000Z',
        unavailable: null,
      },
    },
    handler: async ({ deps, actor }) => {
      const monthlyUsd = deps.config.agent.monthlyUsd
      const unknown = (unavailable: string) => ({
        monthlyUsd,
        spentUsd: null,
        remainingUsd: null,
        resetsAt: null,
        unavailable,
      })
      if (deps.llm === undefined) return unknown(UNKNOWN.aiOff)
      try {
        const spend = await cachedPersonSpend(deps.llm, actor.userId)
        return {
          monthlyUsd,
          spentUsd: spend.spentUsd,
          remainingUsd: Math.max(
            0,
            Math.round((monthlyUsd - spend.spentUsd) * 1e6) / 1e6,
          ),
          resetsAt:
            spend.resetsAt === null ? null : new Date(spend.resetsAt).toISOString(),
          unavailable: null,
        }
      } catch {
        // Decision 24: null with a reason, never 0 — and nothing from the gateway in it.
        return unknown(UNKNOWN.gateway)
      }
    },
  }),
]
