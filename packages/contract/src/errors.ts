import type { components } from './schema.js'

export type ErrorEnvelope = components['schemas']['ErrorEnvelope']
export type ErrorCode = components['schemas']['ErrorCode']

/**
 * A refusal, carrying the D23.7 envelope (§20: a stable code and a hint). `code` is what a
 * client switches on; `UNPARSEABLE` means the body was not an envelope at all — Caddy's
 * empty 502 when the control plane is down, or the edge's refusal from an app network.
 */
export class ManifestApiError extends Error {
  readonly code: ErrorCode | 'UNPARSEABLE'
  // FIELDS, NOT CONSTRUCTOR PARAMETER PROPERTIES (FE-18): a consumer compiling this source with
  // `erasableSyntaxOnly` — recent Vite templates set it — refuses the parameter-property form.
  readonly status: number
  readonly envelope: ErrorEnvelope | undefined
  readonly operation: string
  /**
   * The request's id (contract 1.6.0, FE-30) — the reference a person quotes, which finds the
   * platform's own line for the request. From the envelope, else the answer's `x-request-id`
   * header, which is the only id an `UNPARSEABLE` answer can carry; `null` when neither has one
   * (an edge's own 502 carries no id).
   */
  readonly requestId: string | null
  constructor(
    status: number,
    envelope: ErrorEnvelope | undefined,
    operation: string,
    headerRequestId?: string | null,
  ) {
    super(
      envelope?.error === undefined
        ? `${operation} failed with ${status} and no error envelope`
        : `${operation} failed with ${status} ${envelope.error.code}: ${envelope.error.message}`,
    )
    this.name = 'ManifestApiError'
    this.status = status
    this.envelope = envelope
    this.operation = operation
    this.code = envelope?.error?.code ?? 'UNPARSEABLE'
    this.requestId = envelope?.error?.requestId ?? headerRequestId ?? null
  }
}
