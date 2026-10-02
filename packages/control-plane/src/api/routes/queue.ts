import { listQueue } from '../../launch/index.js'
import { AuthorizationError } from '../../projects/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { Queue, toQueue } from '../representations/queue.js'

/**
 * THE ADMINISTRATORS' QUEUE (Spec action 5; the launch path plan's Task 12): everything waiting on a
 * platform administrator, derived from what exists, oldest first.
 */
export const queueRoutes = [
  defineRoute({
    operationId: 'listQueue',
    credential: 'session',
    method: 'GET',
    path: '/v1/queue',
    tag: 'administration',
    summary: 'Everything waiting on an administrator',
    description:
      'Everything waiting on a platform administrator, oldest first, each item saying since when it has waited: a release someone asked them to sign off (`requestApproval`), with the asker’s note; the staging and production registrations sent to UBC IAM, and the change requests filed with it, whose answers an administrator records; and the privacy assessments sent to the Privacy Office. A registration UBC IAM sent back to its owner with questions is the owner’s to answer, and is not here. `oldestSince` is the age of the oldest item. For platform administrators: anyone else is refused `403 FORBIDDEN`, and a delegated token `403 TOKEN_CREDENTIAL_REFUSED` however it was minted.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'Everything waiting, oldest first.',
      schema: Queue,
    },
    errors: ['FORBIDDEN', 'TOKEN_CREDENTIAL_REFUSED'],
    examples: {
      response: {
        items: [
          {
            kind: 'privacy-assessment',
            project: {
              id: '50215560-1c3d-4ba3-b10d-051cf9c4c8ba',
              slug: 'fixture-ad799ea7',
              name: 'fixture-ad799ea7',
              state: 'active',
            },
            subjectId: '2576d1c4-1d11-4823-9579-fc8fcba37558',
            environment: null,
            requestedBy: {
              id: '338713d6-02c6-411c-8816-c30821e69e07',
              displayName: 'Bio Prof',
            },
            since: '2026-09-29T19:00:00.000Z',
            summary:
              'The privacy assessment was sent to the UBC Privacy Office on September 29, 2026 (ticket PIA-2026-0088): record its answer, with the PIA number, when it comes.',
            note: null,
          },
          {
            kind: 'release-approval',
            project: {
              id: '50215560-1c3d-4ba3-b10d-051cf9c4c8ba',
              slug: 'fixture-ad799ea7',
              name: 'fixture-ad799ea7',
              state: 'active',
            },
            subjectId: '1b8cc68f-ce0d-4677-b3e8-e627872802ed',
            environment: null,
            requestedBy: {
              id: '338713d6-02c6-411c-8816-c30821e69e07',
              displayName: 'Bio Prof',
            },
            since: '2026-10-02T01:29:32.635Z',
            summary:
              'Bio Prof asked for the release serving staging to be approved for the app’s first production launch.',
            note: 'Week 3 — students start Monday',
          },
        ],
        oldestSince: '2026-09-29T19:00:00.000Z',
        truncated: false,
      },
    },
    handler: async ({ deps, request }) => {
      // INTERACTIVE ONLY, and then an administrator — the fleet's two rules: the queue is cross-project
      // data, and a project-scoped token must not become a read of every project's waits.
      const actor = requireSession(request)
      // The SESSION's role: a person made an administrator reads the queue once they sign in again.
      if (actor.platformRole !== 'admin') {
        throw new AuthorizationError(
          'FORBIDDEN',
          'the queue is a platform administrator’s read',
        )
      }
      return toQueue(await listQueue(deps.db))
    },
  }),
]
