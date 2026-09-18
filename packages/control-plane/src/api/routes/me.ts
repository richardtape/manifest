import { eq } from 'drizzle-orm'
import { users } from '../../db/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { Me, toMe } from '../representations/me.js'

export const meRoutes = [
  defineRoute({
    operationId: 'getMe',
    method: 'GET',
    path: '/v1/me',
    tag: 'identity',
    summary: 'The signed-in person',
    description:
      'Who this session belongs to, and the platform role it is authorized as. Every client calls it first. Interactive sessions only: a delegated token carries no platform role at all (D24), so there is nothing truthful for this to answer it — an agent reads GET /v1/projects, which answers exactly the project it is scoped to.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The person.', schema: Me },
    errors: ['TOKEN_CREDENTIAL_REFUSED'],
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
