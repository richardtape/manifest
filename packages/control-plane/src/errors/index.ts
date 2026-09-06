/**
 * Every error Manifest surfaces to a client — human or program — carries a stable
 * code and a remediation hint (§20, D23.7). Codes are permanent API surface: rename
 * one and you break an agent that was correcting itself against it.
 */
export interface ManifestError {
  code: string
  path: string
  message: string
  hint: string
}

export class ManifestValidationError extends Error {
  constructor(readonly errors: ManifestError[]) {
    super(errors.map((e) => `${e.path}: ${e.message}`).join('; '))
    this.name = 'ManifestValidationError'
  }
}
