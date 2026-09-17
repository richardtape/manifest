import { AuthorizationError, listFleet } from '../../projects/index.js'
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
      '§26: the fleet, for platform administrators — an admin-scoped read on the one public API (D31), not a second API. Everyone else is refused 403.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The fleet, newest project first.',
      schema: Fleet,
    },
    errors: ['FORBIDDEN'],
    handler: async ({ deps, actor }) => {
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
