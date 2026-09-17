import { z } from 'zod/v4'
import { computeLaunchReadiness } from '../../launch/index.js'
import { assertCapability } from '../../projects/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { LaunchReadiness } from '../representations/launch.js'

/** §22 step 7 (P5a Task 15): what a first production launch still needs. */
export const launchRoutes = [
  defineRoute({
    operationId: 'getLaunchReadiness',
    method: 'GET',
    path: '/v1/projects/{projectId}/launch-readiness',
    tag: 'launch',
    summary: 'What a first production launch still needs',
    description:
      '§13 and §22 step 7: the checklist, computed from what exists, surfaced from the moment a project exists. Read-only in Phase 1.',
    params: z.strictObject({ projectId: z.uuid() }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The checklist.', schema: LaunchReadiness },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      return computeLaunchReadiness(deps.db, params.projectId)
    },
  }),
]
