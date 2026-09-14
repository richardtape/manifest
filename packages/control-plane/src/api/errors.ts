import { AuthorizationError, ProjectError } from '../projects/index.js'
import { ReleaseError } from '../releases/index.js'
import { SourceError } from '../source/index.js'
import { ConfigError } from '../config.js'
import { SamlError } from '../identity/index.js'
import { ZodError } from 'zod'
import type { ManifestError } from '../errors/index.js'
import { IdempotencyConflictError } from './idempotency.js'
import { AiError, CatalogueError } from '../ai/index.js'

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
 */
export function toErrorResponse(error: unknown): { status: number; body: ErrorEnvelope } {
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

  // The state-conflict family.
  if (
    error instanceof ProjectError ||
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
