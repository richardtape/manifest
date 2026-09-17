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
import { RateLimitedError } from './rate-limit.js'

export interface ErrorEnvelope {
  error: {
    code: string
    message: string
    hint?: string
    details?: ManifestError[]
  }
}

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
          'the request could not be read as sent: an empty or malformed body, or a malformed URL',
        hint: 'Send a well-formed JSON body with Content-Type: application/json.',
      },
    },
  }
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
