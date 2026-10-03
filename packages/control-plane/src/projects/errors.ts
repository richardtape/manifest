/**
 * WHO ASKED was refused — `FORBIDDEN` for a member who lacks the capability, `NOT_FOUND` for anybody
 * with no business knowing the project exists (`assertCapability`). In its own file so `state.ts`,
 * which `authz.ts` imports, can answer a DELETED project's `NOT_FOUND` too (the front-end enablement
 * plan's Task 12) without the two importing each other.
 */
export class AuthorizationError extends Error {
  constructor(
    readonly code: 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
    /**
     * What a refused person can do instead, when it is not the wire's default — today, that a
     * platform administrator does what no project role can (the launch path plan's Task 1, `[M8]`).
     */
    readonly hint?: string,
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

/**
 * AN ADMINISTRATOR ACTING ON ANOTHER PERSON'S PROJECT GAVE NO REASON (§26's non-repudiation, as Spec
 * action 1 worded it; the faculty-ready plan's Task 10) — or one longer than `ADMIN_REASON_MAX`.
 * Thrown by `assertCapability`, the one place that knows both the project and whether the person is
 * a member of it; answered `400 ADMIN_REASON_REQUIRED` by `api/errors.ts`. Not an
 * `AuthorizationError`: the person MAY do this, and the request is missing what doing it needs.
 */
export class AdminReasonRequiredError extends Error {
  constructor(
    message: string,
    /** The remedy — which header, and its limit. */
    readonly hint: string,
  ) {
    super(message)
    this.name = 'AdminReasonRequiredError'
  }
}
