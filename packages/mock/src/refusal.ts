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
  /** The production gate's checklist, as the platform's `409` carries it (`launchReadiness`). */
  readonly launchReadiness: unknown
  /** FE-29 (contract 1.6.0): a limit's facts (`limit`) or a started session's (`session`). */
  readonly facts: { limit?: unknown; session?: unknown }
  constructor(
    status: number,
    code: string,
    message: string,
    hint?: string,
    details?: unknown[],
    launchReadiness?: unknown,
    facts: { limit?: unknown; session?: unknown } = {},
  ) {
    super(message)
    this.name = 'MockRefusal'
    this.status = status
    this.code = code
    this.hint = hint
    this.details = details
    this.launchReadiness = launchReadiness
    this.facts = facts
  }
}

/**
 * THE PLATFORM'S DECODING of `Manifest-Admin-Reason`: percent-encoded UTF-8 is decoded, text that is
 * not a valid encoding is taken as sent, and it is trimmed — `null` when nothing is left. Here, beside
 * the refusal, since P11's Task 4: the demo fleet (`fleet.ts`) asks it as `server.ts` does.
 */
export function adminReasonOf(header: string | string[] | undefined): string | null {
  if (header === undefined) return null
  const raw = Array.isArray(header) ? header.join(', ') : header
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  const trimmed = decoded.trim()
  return trimmed === '' ? null : trimmed
}

/** The platform's `400 ADMIN_REASON_REQUIRED`, in its words — the reason it was given, when it was. */
export function assertAdminReason(reason: string | null): string {
  const hint =
    "Send why in the Manifest-Admin-Reason header — 1 to 500 characters, percent-encoded as UTF-8 when it is not plain ASCII. The project's people read it beside your name."
  if (reason === null)
    throw new MockRefusal(
      400,
      'ADMIN_REASON_REQUIRED',
      'you are a platform administrator and not a member of this project, so this needs a reason',
      hint,
    )
  if (reason.length > 500)
    throw new MockRefusal(
      400,
      'ADMIN_REASON_REQUIRED',
      `the reason is ${reason.length} characters; at most 500 are kept`,
      hint,
    )
  return reason
}

/** The platform's `403 STEP_UP_REQUIRED`, whose hint names the route that steps up. */
export const stepUpRefusal = (capability: string): MockRefusal =>
  new MockRefusal(
    403,
    'STEP_UP_REQUIRED',
    `'${capability}' needs a second authentication round trip`,
    'Navigate the browser to /auth/step-up?returnTo=<the page you are on>, complete the CWL prompt, and make this request again.',
  )
