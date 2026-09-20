import { AuthorizationError, SlugRefusedError } from '../projects/index.js'
import { ReleaseError } from '../releases/index.js'
import { SourceError } from '../source/index.js'
import { ConfigError } from '../config.js'
import { SamlError } from '../identity/index.js'
import { ZodError } from 'zod'
import type { ManifestError } from '../errors/index.js'
import { IdempotencyConflictError } from './idempotency.js'
import { CsrfRefusedError } from './csrf.js'
import { AiError, CatalogueError } from '../ai/index.js'
import { ERROR_CODES } from './error-codes.js'
import { RequestValidationError } from './contract/route.js'
import { TokenCredentialRefusedError } from './actor.js'
import { RateLimitedError } from './rate-limit.js'
import type { ErrorEnvelopeShape } from './representations/errors.js'
import { LaunchReadiness } from './representations/launch.js'
import {
  LaunchRecordError,
  LaunchTransitionError,
  // §13's gate moved to `launch/` in P6a Task 7, with `assertLaunchable` that throws it.
  // This file maps it by `instanceof`, exactly as it does `ReleaseError` and every other
  // domain module's wire class.
  ProductionGateError,
  type LaunchReadinessView,
} from '../launch/index.js'
import {
  PendingActionRejectedError,
  PendingActionRequiredError,
  type PendingAction,
} from '../tokens/index.js'
import { StepUpRequiredError, TokenCapabilityRefusedError } from '../projects/index.js'
import {
  PendingAction as PendingActionSchema,
  toPendingAction,
} from './representations/pending-actions.js'

/**
 * THE shape every failure leaves in, DERIVED from the schema the OpenAPI document is
 * generated from (P5a Task 15) — so `mapError` below cannot build a body the contract
 * does not describe.
 *
 * It was an independent `interface` until this task, held equal to the schema by nothing,
 * and sitting 10 measured what that cost: the document said the envelope admits exactly
 * `code`, `message`, `hint` and `details`, `additionalProperties: false`, while the
 * production refusal had carried a fifth key since P2. Every success body is parsed
 * through its representation on the way out (Decision 2); an error body is built by hand
 * here and parsed by nothing, so `tsc` against the schema is the only thing between the
 * two statements.
 */
export type ErrorEnvelope = ErrorEnvelopeShape

export class SpecInvalidError extends Error {
  readonly code = 'SPEC_INVALID'
  constructor(readonly details: ManifestError[]) {
    super('the manifest.yaml in this commit is not valid')
    this.name = 'SpecInvalidError'
  }
}

export class BadRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message)
    this.name = 'BadRequestError'
  }
}

/**
 * A pending action already has an answer (P5b Task 7). 409, because the request is
 * perfectly well formed and the STATE refuses it — the same shape as an idempotency
 * conflict, and the answer a second person gets when they open a queue item somebody
 * else has just resolved.
 */
export class PendingActionResolvedError extends Error {
  readonly code = 'PENDING_ACTION_RESOLVED'
  constructor(readonly state: 'confirmed' | 'rejected' | 'expired') {
    super(`this pending action was already ${state}`)
    this.name = 'PendingActionResolvedError'
  }
}

/**
 * §13: a project must always have an owner (P5b Task 8).
 *
 * 409 rather than 403: the caller holds `members:manage` and is allowed to do this — it
 * is the project's STATE that refuses, exactly as `PendingActionResolvedError` does. A
 * project with no owner is one nobody can grant access to, delete or deploy, and there is
 * no route back to an owner: the row would have to be repaired in the database.
 */
export class LastOwnerError extends Error {
  readonly code = 'PROJECT_LAST_OWNER'
  constructor() {
    super('a project must always have at least one owner (§13)')
    this.name = 'LastOwnerError'
  }
}

/**
 * Every failure leaves through here, so no route invents its own shape. D23.7:
 * stable codes plus remediation hints, "so an agent can correct itself rather than
 * surfacing a wall of text to its user".
 *
 * Every code it answers with is in `error-codes.ts` (P5a Task 5). The test is the gate;
 * the line below is the operator's copy for a code that reached the wire anyway.
 */
export function toErrorResponse(error: unknown): { status: number; body: ErrorEnvelope } {
  const response = mapError(error)
  if (!(response.body.error.code in ERROR_CODES)) {
    // The code only — never the message, which can quote the caller's input.
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'an error code is not in api/error-codes.ts',
        code: response.body.error.code,
      }),
    )
  }
  return response
}

/**
 * Fastify's OWN refusals of a request it could not read — a malformed or empty JSON
 * body, a body over its limit, a content type no route parses — carry an `FST_` code
 * and a 4xx `statusCode`. They were answered `500 INTERNAL` with an "unhandled error"
 * operator line until P5a Task 5 measured all four: the commonest client mistake there
 * is, reported as the control plane's own failure. One code per status, because a
 * client switches on the code; the messages are fixed, because Fastify's can quote the
 * caller's input (`FST_ERR_BAD_URL`).
 */
function frameworkRefusal(
  error: unknown,
): { status: number; body: ErrorEnvelope } | undefined {
  const { code, statusCode } = (error ?? {}) as { code?: unknown; statusCode?: unknown }
  if (typeof code !== 'string' || !code.startsWith('FST_')) return undefined
  if (typeof statusCode !== 'number' || statusCode < 400 || statusCode >= 500)
    return undefined
  if (statusCode === 413) {
    return {
      status: 413,
      body: {
        error: {
          code: 'REQUEST_BODY_TOO_LARGE',
          message: 'the request body is larger than the API accepts',
          hint: 'Send a smaller body. No API request needs more than 1 MiB.',
        },
      },
    }
  }
  if (statusCode === 415) {
    return {
      status: 415,
      body: {
        error: {
          code: 'REQUEST_MEDIA_TYPE_UNSUPPORTED',
          message: 'the request body is a content type this route does not read',
          hint: 'Send the body as JSON with Content-Type: application/json.',
        },
      },
    }
  }
  return {
    status: 400,
    body: {
      error: {
        code: 'REQUEST_INVALID',
        message:
          'the request could not be read as sent: an empty or malformed body, or a URL the router cannot read (malformed, or a path segment over 100 characters)',
        hint: 'Send a well-formed JSON body with Content-Type: application/json.',
      },
    },
  }
}

/**
 * §13's checklist, THROUGH ITS REPRESENTATION — the one field of an error body that is
 * parsed on the way out, for the reason every success body is (Decision 2).
 *
 * Measured by `make demo-journey` on 2026-09-17: the read answers the checklist parsed
 * through `LaunchReadiness`, and zod emits an object's keys in SCHEMA order, so the
 * hand-built refusal carrying the same value serialised `builtBy` before `why` and the
 * read serialised it after. Equal as values, different as bytes — and a client that
 * compares the two answers, or validates the envelope strictly, sees two shapes for one
 * thing. Parsing here makes the two answers identical by construction rather than by two
 * literals being kept in step.
 *
 * It FAILS CLOSED: a checklist that does not parse is dropped, and the operator hears
 * about it, rather than a body the document says is impossible being sent. The 409 and
 * its code still say what happened, which is what a client switches on. `mapError` is the
 * last thing between a failure and the wire, so it must not throw on its way there.
 */
function checklist(
  view: LaunchReadinessView,
): Pick<ErrorEnvelope['error'], 'launchReadiness'> {
  const parsed = LaunchReadiness.safeParse(view)
  if (parsed.success) return { launchReadiness: parsed.data }
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'the launch readiness checklist is not the shape LaunchReadiness describes; the refusal was sent without it',
      issues: parsed.error.issues.map((i) => i.path.join('.')),
    }),
  )
  return {}
}

/**
 * The pending action, THROUGH ITS REPRESENTATION — for the reason `checklist` above is,
 * and the reason every success body is (Decision 2): zod emits an object's keys in SCHEMA
 * order, so the copy `GET /v1/projects/{id}/pending-actions` answers (Task 8) and the copy
 * this refusal carries are identical by construction rather than by two literals being
 * kept in step.
 *
 * It FAILS CLOSED, and the failure is a refusal WITHOUT the question rather than a body
 * the document says is impossible: the 403 and its code still say what happened, which is
 * what a client switches on, and the operator hears what was dropped. `mapError` is the
 * last thing between a failure and the wire and must not throw on its way there.
 */
function question(row: PendingAction): Pick<ErrorEnvelope['error'], 'pendingAction'> {
  const parsed = PendingActionSchema.safeParse(toPendingAction(row))
  if (parsed.success) return { pendingAction: parsed.data }
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'a pending action is not the shape PendingAction describes; the refusal was sent without it',
      pendingActionId: row.id,
      issues: parsed.error.issues.map((i) => i.path.join('.')),
    }),
  )
  return {}
}

function mapError(error: unknown): { status: number; body: ErrorEnvelope } {
  const refusal = frameworkRefusal(error)
  if (refusal !== undefined) return refusal

  if (error instanceof AuthorizationError) {
    return {
      status: error.code === 'NOT_FOUND' ? 404 : 403,
      body: {
        error: {
          code: error.code,
          message: error.code === 'NOT_FOUND' ? 'not found' : error.message,
          ...(error.code === 'FORBIDDEN'
            ? { hint: 'Ask a project owner to grant you the role this action needs.' }
            : {}),
        },
      },
    }
  }

  /**
   * §20's STEP-UP (P6a Task 9). 403 and not 401 for the same reason as the two below:
   * the credential is valid, and this particular action needs re-proving.
   *
   * **THE HINT IS THE REMEDY**, and it names the route so a client does not have to know
   * the flow — D23.7: *"an agent corrects itself from the answer."* The console reads it
   * and navigates; a person reading the envelope can follow it by hand.
   */
  if (error instanceof StepUpRequiredError) {
    return {
      status: 403,
      body: {
        error: {
          // THE LITERAL LIVES HERE, and nowhere else. `StepUpRequiredError` carries no
          // code, exactly as `TokenCapabilityRefusedError` does — the class cannot then
          // be constructed with the wrong one, and `error-codes.test.ts`'s scan finds
          // this line under `api/` and registers the code for the `api` family.
          code: 'STEP_UP_REQUIRED',
          message: error.message,
          hint: 'Navigate the browser to /auth/step-up?returnTo=<the page you are on>, complete the CWL prompt, and make this request again.',
        },
      },
    }
  }

  // D24 (P5b Task 5). 403 and not 401: the credential is valid, and this action is not
  // one a token does. The message is the route's own, so it names what was refused.
  if (error instanceof TokenCredentialRefusedError) {
    return {
      status: 403,
      body: {
        error: {
          code: error.code,
          message: error.message,
          hint: 'Sign in to the console and do it there. An agent asks a human for the ones D24 makes pending.',
        },
      },
    }
  }

  /**
   * D24's CENTRAL REFUSAL (P5b Task 6), with the question it created. 403 and not 401 for
   * the same reason as above: the credential is valid, and this particular action is one
   * only a person may take — so the answer carries what the person must confirm.
   */
  if (error instanceof PendingActionRequiredError) {
    return {
      status: 403,
      body: {
        error: {
          code: 'TOKEN_ACTION_PENDING',
          message: error.message,
          hint: 'A person must confirm this in the console. Retry the identical request — same body, same Idempotency-Key — once they have; the confirmation grants it exactly one retry.',
          ...question(error.pendingAction),
        },
      },
    }
  }

  /**
   * THE SAME QUESTION, ALREADY ANSWERED — and the answer was no (P5b Task 7).
   *
   * A separate CODE from the one above, not a separate message: a client switches on the
   * code, and the difference between them is the difference between waiting and stopping.
   * The `pendingAction` carries the person's own reason, which is what D23.7 means by an
   * agent correcting itself rather than surfacing a wall of text to its user.
   */
  if (error instanceof PendingActionRejectedError) {
    return {
      status: 403,
      body: {
        error: {
          code: 'TOKEN_ACTION_REJECTED',
          message: error.message,
          hint: 'Do not retry this request. A person refused it; `pendingAction.reason` says why. Ask them, or ask for something else.',
          ...question(error.pendingAction),
        },
      },
    }
  }

  if (error instanceof LastOwnerError) {
    return {
      status: 409,
      body: {
        error: {
          code: error.code,
          message: error.message,
          hint: 'Make somebody else an owner first, then remove this one.',
        },
      },
    }
  }
  if (error instanceof PendingActionResolvedError) {
    return {
      status: 409,
      body: {
        error: {
          code: error.code,
          message: error.message,
          hint: 'Reload the queue: somebody has already answered this one.',
        },
      },
    }
  }

  /**
   * THE SAME REFUSAL, WITH NO QUESTION RECORDED — which means the route wrapper never saw
   * it, because the route was registered outside `registerRoutes` (`[M7]`: the event
   * stream is the one such route today, and its only capability is `project:read`, so
   * this branch is unreachable as the platform stands).
   *
   * It is here so that the day a privileged capability IS checked on such a route, the
   * answer is a loud refusal rather than a `500 INTERNAL` — and never a grant. The
   * operator line is what says the centrality assumption has been broken; the agent is
   * refused either way.
   */
  if (error instanceof TokenCapabilityRefusedError) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: "a privileged capability was refused to a token OUTSIDE the /v1 route wrapper, so no PendingAction was recorded — D24's central refusal assumes every capability check runs under registerRoutes",
        capability: error.capability,
        projectId: error.projectId,
      }),
    )
    return {
      status: 403,
      body: {
        error: {
          code: 'TOKEN_ACTION_PENDING',
          message: error.message,
          hint: 'A person must do this in the console. No pending action was recorded for it; the control plane’s log says why.',
        },
      },
    }
  }

  if (error instanceof SpecInvalidError) {
    return {
      status: 422,
      body: {
        error: {
          code: error.code,
          message: error.message,
          hint: 'Fix the listed paths in manifest.yaml and push again.',
          details: error.details,
        },
      },
    }
  }

  if (error instanceof IdempotencyConflictError) {
    return {
      status: 409,
      body: {
        error: {
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: error.message,
          hint: 'Use a fresh Idempotency-Key for a request with a different body.',
        },
      },
    }
  }

  // §20 (P5a Task 4). The hint names the origin: it is configuration, not a secret, and a
  // script author needs it to fix their request. The message echoes at most 100
  // characters of what arrived, which is the caller's own header.
  if (error instanceof CsrfRefusedError) {
    return {
      status: 403,
      body: {
        error: {
          code: error.code,
          message: error.message,
          hint: `Send Origin: ${error.expected}. A browser does this itself; a script sets the header.`,
        },
      },
    }
  }

  // §13 (P5a Task 14). The refusal carries the checklist, so a client that asked to launch
  // reads what is missing from the same answer rather than going to fetch it.
  if (error instanceof ProductionGateError) {
    return {
      status: 409,
      body: {
        error: {
          code: error.code,
          message: error.message,
          hint: 'These items have multi-week lead times and are tracked from project creation.',
          ...checklist(error.launchReadiness),
        },
      },
    }
  }

  if (error instanceof BadRequestError) {
    return {
      status: 400,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.hint === undefined ? {} : { hint: error.hint }),
        },
      },
    }
  }

  // A `/v1` request that its route's own schema refused (P5a Task 6). The zod 3 branch
  // below stays for the routes not yet converted: a v4 error is not a v3 ZodError (M1e).
  if (error instanceof RequestValidationError) {
    return {
      status: 400,
      body: {
        error: {
          code: error.code,
          message: error.message,
          hint: 'Correct the listed fields and send the request again.',
        },
      },
    }
  }

  // A body that is the wrong shape is the client's mistake, not ours. Without
  // this every `schema.parse(request.body)` left through the 500 branch below,
  // which tells a program nothing it can correct itself with (D23.7).
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'REQUEST_INVALID',
          message: error.issues
            .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`)
            .join('; '),
          hint: 'Correct the listed fields and send the request again.',
        },
      },
    }
  }

  /**
   * A refused assertion is 401, and the envelope says nothing about WHY.
   *
   * D23.7 keeps the client's copy opaque and §20 means it: the detail — which
   * signature failed, which audience was asserted — is a probing oracle for
   * anyone who can POST XML at the ACS. The route logs the reason for the
   * operator before rethrowing, so the information exists exactly once and on
   * the side that is entitled to it.
   *
   * It is mapped here rather than only in the route so that a SamlError raised
   * anywhere else still FAILS CLOSED at 401 rather than reaching the 500 branch,
   * where a stack trace would be printed for what is a routine refusal.
   */
  if (error instanceof SamlError) {
    return {
      status: 401,
      body: {
        error: {
          code: error.code,
          message: 'sign-in could not be completed',
          hint: 'Start again at /auth/login. If it keeps failing, the control plane’s log has the reason.',
        },
      },
    }
  }

  /**
   * The AI gateway could not answer, or answered with a catalogue the platform
   * refuses (P4b Task 6). 503, carrying the code and hint the failure already has —
   * both are built to be shown: an AiError never carries LiteLLM's body (§14), and a
   * CatalogueError names the setting to fix. Without this branch a gateway outage
   * during a spec push was `500 INTERNAL`, which tells an agent nothing it can
   * correct itself with (D23.7).
   */
  if (error instanceof AiError || error instanceof CatalogueError) {
    return {
      status: 503,
      body: { error: { code: error.code, message: error.message, hint: error.hint } },
    }
  }

  // §23 (P5a Task 9). The same codes, messages and hints the slug check reports, answered
  // at creation — a name the check refuses is refused with exactly that sentence.
  if (error instanceof SlugRefusedError) {
    return {
      status: error.code === 'SLUG_INVALID' ? 400 : 409,
      body: { error: { code: error.code, message: error.message, hint: error.hint } },
    }
  }

  // P5a Decision 26. `setErrorHandler` sets Retry-After from the same number.
  if (error instanceof RateLimitedError) {
    return {
      status: 429,
      body: {
        error: {
          code: error.code,
          message: error.message,
          hint: `Wait ${error.retryAfterSeconds} s; Retry-After says the same.`,
        },
      },
    }
  }

  /**
   * §9's arrows, refused (P6a Task 5). A state conflict, so 409 — and it carries a hint
   * because the refusal's whole value to an administrator is *what this record can become
   * instead*, which the message already says and a hint makes actionable at a glance.
   */
  if (error instanceof LaunchTransitionError) {
    return {
      status: 409,
      body: {
        error: {
          code: error.code,
          message: error.message,
          hint: 'Move the record along the states §9 gives it, one at a time.',
        },
      },
    }
  }

  /**
   * The other `launch/` refusal (P6a Task 6), and a 400 rather than a 409: nothing about
   * the record's STATE is in conflict — the request's own fields cannot be accepted. Two
   * codes, two statuses, because a client switches on the code and these need different
   * behaviour: one is "move it a step at a time", the other is "send different fields".
   */
  if (error instanceof LaunchRecordError) {
    return {
      status: 400,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.hint === undefined ? {} : { hint: error.hint }),
        },
      },
    }
  }

  // The state-conflict family.
  if (
    error instanceof ReleaseError ||
    error instanceof SourceError ||
    error instanceof ConfigError
  ) {
    return { status: 409, body: { error: { code: error.code, message: error.message } } }
  }

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL',
        message: 'the control plane failed to handle this request',
      },
    },
  }
}
