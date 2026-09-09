/**
 * `sso/`'s failures, as one class with a stable code.
 *
 * Same shape as `SecretError`, `ReleaseError` and `ConfigError`: the code is what
 * a caller matches on and the message is what an operator reads. Registration
 * failures reach a faculty member through §14's incident text, so every message
 * here names the thing that is wrong rather than the library that noticed.
 */
export class SsoError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SsoError'
  }
}
