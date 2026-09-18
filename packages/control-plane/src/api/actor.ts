import type { FastifyRequest } from 'fastify'
import type { Actor, SessionActor } from '../projects/index.js'

export type { Actor, SessionActor, TokenActor } from '../projects/index.js'

/**
 * A delegated token asked for something D24 reserves to an interactive session.
 *
 * 403, not 401: the credential is perfectly valid and is being told that this particular
 * action is not one a token does — which is a different thing from "who are you", and a
 * client switches on the code (D23.7).
 */
export class TokenCredentialRefusedError extends Error {
  readonly code = 'TOKEN_CREDENTIAL_REFUSED'
  constructor(what: string) {
    super(what)
    this.name = 'TokenCredentialRefusedError'
  }
}

/**
 * Its own file so `api/contract/route.ts` can use it without importing `server.ts`, which
 * imports the route definitions — a cycle that works only until something reads a value
 * at module load (P5a Task 6).
 */
export function requireActor(request: FastifyRequest): Actor {
  if (!request.actor) {
    throw Object.assign(new Error('a credential is required'), { statusCode: 401 })
  }
  return request.actor
}

/**
 * For a route D24 reserves to an interactive session.
 *
 * **THE RETURN TYPE IS THE POINT** (Decision 2): a handler that needs `platformRole` or
 * `puid` has to call this to get them, so "interactive only" is something `tsc` enforces
 * at the call site rather than something a reviewer says in a comment. Reverting a route
 * to `requireActor` does not merely weaken a check — it stops compiling.
 */
export function requireSession(request: FastifyRequest): SessionActor {
  const actor = requireActor(request)
  if (actor.credential !== 'session') {
    throw new TokenCredentialRefusedError(
      'this action is only available in an interactive session (D24)',
    )
  }
  return actor
}
