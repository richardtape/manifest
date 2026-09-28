import { z } from 'zod/v4'
import {
  AgentSessionError,
  endIntakeSession,
  intakeSessionById,
  startIntakeSession,
} from '../../ai/index.js'
import { AuthorizationError } from '../../projects/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { PATH } from '../contract/schemas.js'
import {
  IntakeSession,
  IntakeSessionStarted,
  toIntakeSession,
} from '../representations/agents.js'

const IntakeParams = z.strictObject({ intakeSessionId: PATH.intakeSessionId })

// Written to the shape `api/intake.test.ts`'s answers have on the recording gateway (the default
// intake settings: one model, $0.25, 30 minutes) — the key a placeholder that is not one.
const EXAMPLE_INTAKE: z.input<typeof IntakeSession> = {
  id: '3c0d6b2e-51f4-4a8e-9d7a-2b6f0c1e4a90',
  model: 'default-chat',
  capUsd: 0.25,
  expiresAt: '2026-09-28T02:10:00.000Z',
  state: 'active',
  endedAt: null,
  createdAt: '2026-09-28T01:40:00.000Z',
}

/**
 * §10's INTAKE sessions over the API (Spec action 5, FE-1): a model before a project exists, paid
 * for by the platform. **SESSION ONLY** — a delegated token belongs to one project, and there is
 * none yet (D24). Their caller is the faculty front-end's server, for the person describing an app;
 * the reference console's is Task 13's.
 */
export const intakeRoutes = [
  defineRoute({
    operationId: 'startIntakeSession',
    credential: 'session',
    method: 'POST',
    path: '/v1/intake-sessions',
    tag: 'agents',
    summary: 'A model for describing an app, before it exists',
    description:
      '§10: a model key for a person describing an app they have not created yet — understanding what they asked for, proposing names (`checkSlug`), choosing the blueprint and starter. **The platform pays**: never your agent budget. One model, the platform’s (`session.model`), approved for internal data; a key of cents and minutes (never past your signed-in session); a few a person a day (`INTAKE_DAILY_LIMIT_REACHED`, until midnight in Vancouver) inside the platform’s monthly intake budget (`INTAKE_BUDGET_EXHAUSTED`). **The key is in this answer and nowhere else**, and a retry with the same Idempotency-Key answers `409 INTAKE_SESSION_ALREADY_STARTED` naming the session. Signed-in people only: a delegated token is refused, because intake belongs to no project.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 201,
      description:
        'The session, and its key — the only time the key exists outside the gateway.',
      schema: IntakeSessionStarted,
    },
    errors: [
      'TOKEN_CREDENTIAL_REFUSED',
      'INTAKE_SESSION_ALREADY_STARTED',
      'INTAKE_DAILY_LIMIT_REACHED',
      'INTAKE_BUDGET_EXHAUSTED',
      'INTAKE_MODEL_UNAVAILABLE',
      'AI_CATALOGUE_DISABLED',
      'AI_BACKEND_UNAVAILABLE',
    ],
    withholdOnReplay: {
      stored: ({ session }) => ({ session }),
      refuse: (stored) => {
        const session = (stored as { session?: { id?: unknown } } | null)?.session
        if (typeof session?.id !== 'string') {
          return new Error(
            'an intake start’s idempotency record holds no session to name',
          )
        }
        return new AgentSessionError(
          'INTAKE_SESSION_ALREADY_STARTED',
          `this request already started the intake session '${session.id}'; its key was answered then and is never shown again — end it with endIntakeSession and start another if that answer was lost`,
        )
      },
    },
    examples: {
      response: {
        session: EXAMPLE_INTAKE,
        key: 'sk-example-not-a-real-key',
        baseUrl: 'http://127.0.0.1:7106/v1',
      },
    },
    handler: async ({ deps, request }) => {
      const actor = requireSession(request)
      const { row, key } = await startIntakeSession(
        {
          db: deps.db,
          llm: deps.llm,
          catalogue: deps.catalogue,
          intake: deps.config.intake,
        },
        actor,
      )
      return { session: toIntakeSession(row), key, baseUrl: deps.config.agent.llmUrl }
    },
  }),
  defineRoute({
    operationId: 'endIntakeSession',
    credential: 'session',
    method: 'DELETE',
    path: '/v1/intake-sessions/{intakeSessionId}',
    tag: 'agents',
    summary: 'End an intake session',
    description:
      'Revokes the intake session’s key at the gateway, from the next call onwards. Only the person who started it may end it; anyone else is answered 404 — the answer an id that does not exist gets. Ending twice answers the session as it is.',
    params: IntakeParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The session, ended.', schema: IntakeSession },
    errors: ['NOT_FOUND', 'TOKEN_CREDENTIAL_REFUSED', 'AI_BACKEND_UNAVAILABLE'],
    examples: {
      response: {
        ...EXAMPLE_INTAKE,
        state: 'ended',
        endedAt: '2026-09-28T01:52:00.000Z',
      },
    },
    handler: async ({ deps, request, params }) => {
      const actor = requireSession(request)
      const row = await intakeSessionById(deps.db, params.intakeSessionId)
      // THE PERSON WHO STARTED IT, and nobody else — an administrator included: it is theirs, like
      // a token is its minter's, and the answer to anyone else is the stranger's.
      if (row === undefined || row.userId !== actor.userId) {
        throw new AuthorizationError(
          'NOT_FOUND',
          `no intake session '${params.intakeSessionId}'`,
        )
      }
      return toIntakeSession(await endIntakeSession(deps, row))
    },
  }),
]
