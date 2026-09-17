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
    summary: 'Would this project name work?',
    description:
      '§23: answers exactly what project creation will, so a client can tell a person while they type. Always 200 — the answer is about the name, and a 4xx would make "taken" indistinguishable from "not allowed to ask". Says nothing about a holder. 60 a minute per person.',
    // Deliberately NOT §7's rule, and no length bound: a name that breaks the rule — a long
    // one included — is a 200 saying SLUG_INVALID and why (§23: "a 200 either way"), which
    // a 400 REQUEST_INVALID would not. `checkSlug` quotes at most 64 characters of it.
    params: z.strictObject({ slug: z.string().min(1) }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The verdict.', schema: SlugCheck },
    errors: ['RATE_LIMITED'],
    handler: async ({ deps, actor, params }) => {
      deps.limits.slugCheck.take(actor.userId)
      return checkSlug(deps.db, deps.reservedLabels, params.slug)
    },
  }),
]
