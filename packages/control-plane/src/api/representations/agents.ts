import { z } from 'zod/v4'
import {
  sessionState,
  type AgentSessionRow,
  type IntakeSessionRow,
} from '../../ai/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'

/**
 * §10's agent sessions over the API (the front-end enablement plan's Task 10; Spec action 1). A
 * session is one person's agent on one project, holding a model key charged to that person.
 *
 * **`AgentSession` HAS NO `key` FIELD** — not an optional one: the key is in `AgentSessionStarted`,
 * the start's answer, and nowhere else, as a token's secret is in `MintedToken` alone.
 */
export const StartAgentSessionRequest = request(
  'StartAgentSessionRequest',
  z
    .strictObject({
      name: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .describe(
          'A label a person reads in the list of sessions — the task the agent is on.',
        ),
      capUsd: z
        .number()
        .min(0.000001)
        .max(1000)
        .optional()
        .describe(
          'The most this session may spend, in US dollars: the platform’s session cap when absent — and never more than it, nor than what remains of your month.',
        ),
      durationMinutes: z
        .number()
        .int()
        .min(1)
        .max(480)
        .optional()
        .describe(
          'How long the key lives: 60 minutes by default, at most 480 — and never past the expiry of the credential that asks (a delegated token, or your signed-in session).',
        ),
    })
    .describe(
      'What an agent session is for, and — optionally — less than the platform’s cap or life.',
    ),
)

export const AgentSession = representation(
  'AgentSession',
  z
    .object({
      id: Uuid.describe('The session — what `endAgentSession` names.'),
      projectId: Uuid.describe('The one project its agent works on.'),
      name: z.string().describe('The label it was started with.'),
      person: z
        .object({
          id: Uuid.describe('Their user id.'),
          name: z.string().describe('Their display name.'),
        })
        .describe('Who the session works for, and is charged to.'),
      via: z
        .object({
          tokenId: Uuid.describe('The token — `listTokens` names it.'),
          tokenName: z.string().describe('The label its minter gave it.'),
        })
        .nullable()
        .describe(
          'The delegated token that started it; null when a person started it in their session.',
        ),
      models: z
        .array(z.string())
        .describe(
          'The logical models the key may call — the ones the project’s data classification allows (D17), and never fewer restrictions than production’s release has. When the project stops allowing some of them, the key loses those at once and keeps the rest (`agent_session.narrowed`), and this list is what it holds now.',
        ),
      capUsd: z
        .number()
        .describe(
          'The most the key may spend, in US dollars. The gateway refuses it past this.',
        ),
      expiresAt: Timestamp.describe(
        'When the key stops working, whatever anybody does — the gateway enforces it.',
      ),
      state: z
        .enum(['active', 'ended', 'expired'])
        .describe(
          '`expired` is read from `expiresAt`: the key stopped working then, whether or not anybody ended it.',
        ),
      endedAt: Timestamp.nullable().describe(
        'When it was ended; null while it has not been.',
      ),
      endReason: z
        .enum([
          'ended',
          'token_revoked',
          'project_archived',
          'project_deleted',
          'models_withdrawn',
        ])
        .nullable()
        .describe(
          'Why it ended: `endAgentSession`, the token that started it revoked, its project switched off or deleted, or `models_withdrawn` — its project no longer allows any of the models it held (its data classification was raised, or the platform now keeps a confidential project’s building agent on-premise); a session that keeps any model it may still use is narrowed instead, and goes on. Null while it has not been ended; a session that ran out of time or money is never ended by that.',
        ),
      spentUsd: z
        .number()
        .nullable()
        .describe(
          'What this session’s key has spent, in US dollars — for an ended session, what the gateway had recorded when it ended (a call in its last seconds may not be counted). Null, never 0, when it is not known: `spentUnavailable` says why.',
        ),
      spentUnavailable: z
        .string()
        .nullable()
        .describe('Why `spentUsd` is null, when it is.'),
      createdAt: Timestamp.describe('When it was started.'),
    })
    .describe('One agent’s model session: its key’s bounds, and what it has spent.'),
)

export const AgentSessionStarted = representation(
  'AgentSessionStarted',
  z
    .object({
      session: AgentSession,
      key: z
        .string()
        .describe(
          'THE MODEL KEY. Shown in this answer and never again — Manifest keeps no copy. Send it as `Authorization: Bearer <key>` to `baseUrl`. It calls models, and nothing else: it is not a Manifest credential.',
        ),
      baseUrl: z
        .string()
        .url()
        .describe(
          'Where the key is used: an OpenAI-compatible API (`/chat/completions`, `/embeddings`, `/models`).',
        ),
    })
    .describe(
      'A started session, and its key — the only time the key exists outside the gateway.',
    ),
)

export const AgentSessionList = representation(
  'AgentSessionList',
  z
    .object({
      sessions: z
        .array(AgentSession)
        .describe(
          'The project’s agent sessions, newest first — ended and expired ones included; at most 50.',
        ),
      truncated: z.boolean().describe('Whether there were more than the 50 answered.'),
    })
    .describe('A project’s agent sessions.'),
)

export const AgentBudget = representation(
  'AgentBudget',
  z
    .object({
      monthlyUsd: z
        .number()
        .describe(
          'Your monthly budget for agent sessions, in US dollars, across every project.',
        ),
      spentUsd: z
        .number()
        .nullable()
        .describe(
          'This month’s spend across every session of yours, or null when the model gateway did not answer — never 0 for "unknown".',
        ),
      remainingUsd: z
        .number()
        .nullable()
        .describe('What is left this month; null when `spentUsd` is.'),
      resetsAt: Timestamp.nullable().describe(
        'When the month resets — the first of the next month, 00:00 UTC — or null before your first session.',
      ),
      unavailable: z.string().nullable().describe('Why `spentUsd` is null, when it is.'),
    })
    .describe(
      'The agent budget of the person a credential acts for — a delegated token’s minter.',
    ),
)

/** What one row reads as, given what the gateway said about its key (FE-23). */
export function toAgentSession(
  row: AgentSessionRow,
  context: {
    personName: string
    tokenName: string | null
    spent: { usd: number | null; unavailable: string | null }
  },
): z.input<typeof AgentSession> {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    person: { id: row.userId, name: context.personName },
    via:
      row.requestedByToken === null
        ? null
        : {
            tokenId: row.requestedByToken,
            tokenName: context.tokenName ?? '(unnamed token)',
          },
    models: row.models,
    capUsd: Number(row.capUsd),
    expiresAt: row.expiresAt.toISOString(),
    state: sessionState(row),
    endedAt: row.endedAt?.toISOString() ?? null,
    endReason: (row.endReason as z.input<typeof AgentSession>['endReason']) ?? null,
    spentUsd: context.spent.usd,
    spentUnavailable: context.spent.unavailable,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * §10's INTAKE session (Spec action 5, FE-1): a model for a person describing an app before any
 * project exists, paid for by the platform. No project, no token, no spend of the person's —
 * and, as `AgentSession`, NO `key` field: the key is in `IntakeSessionStarted` alone.
 */
export const IntakeSession = representation(
  'IntakeSession',
  z
    .object({
      id: Uuid.describe('The intake session — what `endIntakeSession` names.'),
      model: z
        .string()
        .describe(
          'The ONE logical model its key may call — the platform’s intake model, the same for everyone.',
        ),
      capUsd: z
        .number()
        .describe(
          'The most the key may spend, in US dollars — the platform’s money, not yours.',
        ),
      expiresAt: Timestamp.describe(
        'When the key stops working, whatever anybody does: 30 minutes by default, and never past your signed-in session.',
      ),
      state: z
        .enum(['active', 'ended', 'expired'])
        .describe('`expired` is read from `expiresAt`: the key stopped working then.'),
      endedAt: Timestamp.nullable().describe(
        'When it was ended; null while it has not been.',
      ),
      createdAt: Timestamp.describe('When it was started.'),
    })
    .describe(
      'One intake session: a model key for describing an app, before the app exists.',
    ),
)

export const IntakeSessionStarted = representation(
  'IntakeSessionStarted',
  z
    .object({
      session: IntakeSession,
      key: z
        .string()
        .describe(
          'THE MODEL KEY. Shown in this answer and never again — Manifest keeps no copy. Send it as `Authorization: Bearer <key>` to `baseUrl`, naming `session.model`. It calls that model and nothing else, and it is not a Manifest credential.',
        ),
      baseUrl: z
        .string()
        .url()
        .describe(
          'Where the key is used: an OpenAI-compatible API (`/chat/completions`, `/embeddings`, `/models`).',
        ),
    })
    .describe(
      'A started intake session, and its key — the only time the key exists outside the gateway.',
    ),
)

export function toIntakeSession(row: IntakeSessionRow): z.input<typeof IntakeSession> {
  return {
    id: row.id,
    model: row.model,
    capUsd: Number(row.capUsd),
    expiresAt: row.expiresAt.toISOString(),
    state: sessionState(row),
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}
