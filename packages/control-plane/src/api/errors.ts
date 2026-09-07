import { AuthorizationError, ProjectError } from '../projects/index.js'
import { ReleaseError } from '../releases/index.js'
import { SourceError } from '../source/index.js'
import { ConfigError } from '../config.js'
import { DevAuthDisabledError, UnknownDevUserError } from '../identity/index.js'
import { ZodError } from 'zod'
import type { ManifestError } from '../errors/index.js'
import { IdempotencyConflictError } from './idempotency.js'

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

  // The state-conflict family. The two identity errors belong here and were
  // missing: an unknown dev PUID surfaced as 500 INTERNAL, so the one test that
  // pinned the shim's refusal was asserting against the wrong door.
  if (
    error instanceof ProjectError ||
    error instanceof ReleaseError ||
    error instanceof SourceError ||
    error instanceof ConfigError ||
    error instanceof DevAuthDisabledError ||
    error instanceof UnknownDevUserError
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
