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
  constructor(status: number, envelope: ErrorEnvelope | undefined, operation: string) {
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
  }
}
