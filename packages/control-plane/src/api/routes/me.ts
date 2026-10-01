import { eq } from 'drizzle-orm'
import { users } from '../../db/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { Me, toMe } from '../representations/me.js'

export const meRoutes = [
  defineRoute({
    operationId: 'getMe',
    credential: 'session',
    method: 'GET',
    path: '/v1/me',
    tag: 'identity',
    summary: 'The signed-in person',
    description:
      'The person this session belongs to, the platform role it is authorized as, and whether they may build (`mayBuild`); a client calls it first. Session only: a delegated token is refused (`TOKEN_CREDENTIAL_REFUSED`) — an agent calls `listProjects`, which answers exactly the project its token is scoped to.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The person.', schema: Me },
    errors: ['TOKEN_CREDENTIAL_REFUSED'],
    examples: {
      response: {
        id: '30d15229-d64b-4740-8d3e-9ef1f21650ab',
        puid: 'unrelated_user',
        displayName: 'Unrelated User',
        email: 'unrelated_user@example.ubc.ca',
        role: 'member',
        mayBuild: true,
      },
    },
    handler: async ({ deps, request }) => {
      // A `Me` carries `platformRole`, and a token has none by Decision 4 — not
      // "member", NONE. Answering a default here would be inventing an authority
      // level for a credential that deliberately has one.
      const actor = requireSession(request)
      const [user] = await deps.db.select().from(users).where(eq(users.id, actor.userId))
      // A valid signature over a user who no longer exists: authentication's answer.
      if (user === undefined)
        throw Object.assign(new Error('a credential is required'), { statusCode: 401 })
      return toMe(user, actor.platformRole)
    },
  }),
]
