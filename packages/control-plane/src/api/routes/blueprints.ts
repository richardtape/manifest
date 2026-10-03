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
  blueprintRef: z
    .string()
    .regex(/^[a-z][a-z0-9-]{2,38}@[1-9][0-9]*$/)
    .describe('The blueprint, `name@major` — its `ref` in `listBlueprints`.'),
})

export const blueprintRoutes = [
  defineRoute({
    operationId: 'listBlueprints',
    method: 'GET',
    path: '/v1/blueprints',
    tag: 'blueprints',
    summary: 'The blueprint catalogue',
    description:
      'The blueprints to choose from when creating a project, with the starters each offers.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description:
        'Every blueprint offered to people. One the platform keeps for its own tests is not listed, and `getBlueprint` still answers it.',
      schema: BlueprintList,
    },
    errors: [],
    examples: {
      response: [
        {
          ref: 'node-ts-mongo@1',
          name: 'node-ts-mongo',
          majorVersion: 1,
          language: 'typescript',
          defaultPort: 3000,
          healthPath: '/healthz',
          schemaVersions: [1],
          provides: { services: ['mongo'], authProviders: ['cwl', 'none'], ai: true },
          starters: [
            {
              name: 'proof-app',
              summary:
                'CWL sign-in, a private note, and a question answered from your notes',
            },
          ],
        },
      ],
    },
    // FE-31 (§25): only the blueprints meant for people. `resolve` is untouched, so an unlisted
    // one is still answered by `getBlueprint` and still builds.
    handler: async ({ deps }) =>
      deps.blueprints
        .list()
        .filter((d) => d.listed)
        .map(toBlueprint),
  }),
  defineRoute({
    operationId: 'getBlueprint',
    method: 'GET',
    path: '/v1/blueprints/{blueprintRef}',
    tag: 'blueprints',
    summary: 'A blueprint',
    description:
      'One blueprint by its `name@major`: what an app on it may declare — its services, sign-in providers and AI — and the starters `createProject` accepts for it. Any credential may read it.',
    params: RefParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The blueprint.', schema: Blueprint },
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        ref: 'node-ts-mongo@1',
        name: 'node-ts-mongo',
        majorVersion: 1,
        language: 'typescript',
        defaultPort: 3000,
        healthPath: '/healthz',
        schemaVersions: [1],
        provides: { services: ['mongo'], authProviders: ['cwl', 'none'], ai: true },
        starters: [
          {
            name: 'proof-app',
            summary:
              'CWL sign-in, a private note, and a question answered from your notes',
          },
        ],
      },
    },
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
      'The files that teach an agent this blueprint’s conventions without running inside the platform, versioned with the blueprint. Each file carries its sha256.',
    params: RefParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The pack.', schema: KnowledgePack },
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        blueprint: 'node-ts-mongo@1',
        files: [
          {
            path: 'AGENTS.md',
            mediaType: 'text/markdown',
            sha256: 'a0fe0e12674fbb6b8862ec2b7338cbd12b2e83b37608f94c42479933a567a136',
            content:
              '# node-ts-mongo@1 — knowledge pack\n\nYou are generating an application from this blueprint. This file is the whole of\nwhat you need to know about the platform; it is served over the Manifest API\nalongside the blueprint itself.\n\n**The stack is fixed.** Node 22 on Alpine, Expr …',
          },
        ],
      },
    },
    handler: async ({ deps, params }) => {
      const pack = deps.blueprints.knowledgePack(params.blueprintRef)
      if (pack === undefined) {
        throw new AuthorizationError('NOT_FOUND', `no blueprint '${params.blueprintRef}'`)
      }
      return toKnowledgePack(params.blueprintRef, pack)
    },
  }),
]
