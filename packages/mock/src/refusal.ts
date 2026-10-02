/**
 * THE PLATFORM'S REFUSAL, AS THE MOCK THROWS IT: a status, a code, a person's message and a hint —
 * D23.7's envelope, which `server.ts` writes. Its own module since the launch path plan's Task 13,
 * so `launch.ts` throws the same class `server.ts` catches without the two importing each other.
 */
export class MockRefusal extends Error {
  // FIELDS, NOT PARAMETER PROPERTIES (FE-26 (b)): the mock starts from source under Node's own
  // type stripping, which refuses a constructor parameter property.
  readonly status: number
  readonly code: string
  readonly hint: string | undefined
  /** On `SPEC_INVALID`: each problem, as the platform's envelope carries them. */
  readonly details: unknown[] | undefined
  constructor(
    status: number,
    code: string,
    message: string,
    hint?: string,
    details?: unknown[],
  ) {
    super(message)
    this.name = 'MockRefusal'
    this.status = status
    this.code = code
    this.hint = hint
    this.details = details
  }
}
