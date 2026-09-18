import { AuthorizationError, listFleet } from '../../projects/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { Fleet, toFleet } from '../representations/fleet.js'

/** §26 (P5a Task 16): the fleet, for platform administrators. */
export const fleetRoutes = [
  defineRoute({
    operationId: 'listFleet',
    method: 'GET',
    path: '/v1/fleet',
    tag: 'administration',
    summary: 'Every app on the platform',
    description:
      '§26: the fleet, for platform administrators — an admin-scoped read on the one public API (D31), not a second API. Everyone else is refused 403, and so is every delegated token however it was minted (D24): this is cross-tenant data and a token is scoped to one project.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The fleet, newest project first.',
      schema: Fleet,
    },
    errors: ['FORBIDDEN', 'TOKEN_CREDENTIAL_REFUSED'],
    handler: async ({ deps, request }) => {
      // INTERACTIVE ONLY (P5b Decision 4), and then an administrator. Two independent
      // rules, both of which apply: §26's fleet is cross-tenant data, and a leaked
      // project-scoped token must not become a read of every project on the platform.
      // `requireSession` is what makes this a type error to get wrong rather than a
      // remembered check — `actor.platformRole` does not exist on a token.
      const actor = requireSession(request)
      // The SESSION's role: a person made an administrator reads the fleet once they sign in again.
      if (actor.platformRole !== 'admin') {
        throw new AuthorizationError(
          'FORBIDDEN',
          'the fleet is a platform administrator’s read (§26)',
        )
      }
      return toFleet(await listFleet(deps.db, deps.reservedLabels))
    },
  }),
]
