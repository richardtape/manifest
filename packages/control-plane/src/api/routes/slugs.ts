import { z } from 'zod/v4'
import { checkSlug } from '../../projects/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { SlugCheck } from '../representations/slugs.js'

export const slugRoutes = [
  defineRoute({
    operationId: 'checkSlug',
    method: 'GET',
    path: '/v1/slugs/{slug}',
    tag: 'projects',
    summary: 'Would this slug work?',
    description:
      '§23: answers exactly what project creation will, so a client can tell a person while they type. Always 200 — the answer is about the slug, and a 4xx would make "taken" indistinguishable from "not allowed to ask". Says nothing about a holder. 60 a minute per person.',
    // Deliberately NOT §7's rule, and no length bound: a name that breaks the rule — a long
    // one included — is a 200 saying SLUG_INVALID and why (§23: "a 200 either way"), which
    // a 400 REQUEST_INVALID would not. `checkSlug` quotes at most 64 characters of it.
    params: z.strictObject({
      slug: z
        .string()
        .min(1)
        .describe(
          'The slug to check, as it would be given to `createProject` — never the name people read, which is separate and need not be unique.',
        ),
    }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The verdict.', schema: SlugCheck },
    errors: ['RATE_LIMITED'],
    examples: {
      response: {
        slug: 'chem',
        available: false,
        reasons: [
          {
            code: 'SLUG_RESERVED',
            message:
              "'chem' is reserved — UBC Okanagan course subject code CHEM (Chemistry); UBC Vancouver course subject code CHEM (Chemistry).",
            hint: "A UBC faculty, school, department or course subject — or its abbreviation. A hostname made of one reads as that unit's own official service, whoever built it. Choose another name.",
          },
        ],
      },
    },
    handler: async ({ deps, actor, params }) => {
      deps.limits.slugCheck.take(actor.userId)
      return checkSlug(deps.db, deps.reservedLabels, params.slug)
    },
  }),
]
