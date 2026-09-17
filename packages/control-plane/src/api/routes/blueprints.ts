import { z } from 'zod/v4'
import { AuthorizationError } from '../../projects/index.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import {
  Blueprint,
  BlueprintList,
  KnowledgePack,
  toBlueprint,
  toKnowledgePack,
} from '../representations/blueprints.js'

/** `name@major`, as a manifest pins it — the descriptor's name rule and a positive major. */
const RefParams = z.strictObject({
  blueprintRef: z.string().regex(/^[a-z][a-z0-9-]{2,38}@[1-9][0-9]*$/),
})

export const blueprintRoutes = [
  defineRoute({
    operationId: 'listBlueprints',
    method: 'GET',
    path: '/v1/blueprints',
    tag: 'blueprints',
    summary: 'The blueprint catalogue',
    description:
      '§22 step 2: what a person chooses from, with the starters each offers (§25).',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'Every published blueprint.',
      schema: BlueprintList,
    },
    errors: [],
    handler: async ({ deps }) => deps.blueprints.list().map(toBlueprint),
  }),
  defineRoute({
    operationId: 'getBlueprint',
    method: 'GET',
    path: '/v1/blueprints/{blueprintRef}',
    tag: 'blueprints',
    summary: 'A blueprint',
    description: 'One blueprint by `name@major`.',
    params: RefParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The blueprint.', schema: Blueprint },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, params }) => {
      const descriptor = deps.blueprints.resolve(params.blueprintRef)
      if (descriptor === undefined) {
        throw new AuthorizationError('NOT_FOUND', `no blueprint '${params.blueprintRef}'`)
      }
      return toBlueprint(descriptor)
    },
  }),
  defineRoute({
    operationId: 'getKnowledgePack',
    method: 'GET',
    path: '/v1/blueprints/{blueprintRef}/knowledge-pack',
    tag: 'blueprints',
    summary: 'A blueprint’s knowledge pack',
    description:
      'D25: served over the API and versioned with its blueprint, so an agent learns the conventions without running inside the platform. Each file carries its sha256.',
    params: RefParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The pack.', schema: KnowledgePack },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, params }) => {
      const pack = deps.blueprints.knowledgePack(params.blueprintRef)
      if (pack === undefined) {
        throw new AuthorizationError('NOT_FOUND', `no blueprint '${params.blueprintRef}'`)
      }
      return toKnowledgePack(params.blueprintRef, pack)
    },
  }),
]
