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
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}
