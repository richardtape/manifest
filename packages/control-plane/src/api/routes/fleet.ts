import { AuthorizationError, listFleet } from '../../projects/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { Fleet, toFleet } from '../representations/fleet.js'

/** §26 (P5a Task 16): the fleet, for platform administrators. */
export const fleetRoutes = [
  defineRoute({
    operationId: 'listFleet',
    credential: 'session',
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
    examples: {
      response: [
        {
          id: '7454ad83-e8c6-43da-a33e-6b0615e53263',
          slug: 'p-7e7d49b6',
          blueprint: 'fixture-node@1',
          starter: null,
          owner: {
            id: '0a418b8c-6d32-4e9f-bc77-24765feebf3b',
            displayName: 'Platform Admin',
            email: 'platform_admin@example.ubc.ca',
          },
          audience: {
            scale: 'solo',
            burst: 'steady',
            justification: null,
            setBy: '0a418b8c-6d32-4e9f-bc77-24765feebf3b',
            setAt: '2026-09-26T21:51:49.589Z',
          },
          createdAt: '2026-09-26T21:51:49.590Z',
          slugReserved: false,
          environments: [
            {
              kind: 'production',
              hostname: 'p-7e7d49b6.manifest.internal',
              state: null,
              releaseId: null,
              imageDigest: null,
              lastDeployAt: null,
              latestIncidentAt: null,
            },
            {
              kind: 'sandbox',
              hostname: 'p-7e7d49b6.sandbox.manifest.internal',
              state: null,
              releaseId: null,
              imageDigest: null,
              lastDeployAt: null,
              latestIncidentAt: null,
            },
          ],
        },
        {
          id: 'b94629a7-978e-4b18-817b-ad5cf979282f',
          slug: 'p-15e91afe',
          blueprint: 'fixture-node@1',
          starter: null,
          owner: {
            id: '30d15229-d64b-4740-8d3e-9ef1f21650ab',
            displayName: 'Unrelated User',
            email: 'unrelated_user@example.ubc.ca',
          },
          audience: {
            scale: 'solo',
            burst: 'steady',
            justification: null,
            setBy: '30d15229-d64b-4740-8d3e-9ef1f21650ab',
            setAt: '2026-09-26T21:51:49.144Z',
          },
          createdAt: '2026-09-26T21:51:49.145Z',
          slugReserved: false,
          environments: [
            {
              kind: 'production',
              hostname: 'p-15e91afe.manifest.internal',
              state: null,
              releaseId: null,
              imageDigest: null,
              lastDeployAt: null,
              latestIncidentAt: null,
            },
            {
              kind: 'sandbox',
              hostname: 'p-15e91afe.sandbox.manifest.internal',
              state: null,
              releaseId: null,
              imageDigest: null,
              lastDeployAt: null,
              latestIncidentAt: null,
            },
          ],
        },
      ],
    },
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
