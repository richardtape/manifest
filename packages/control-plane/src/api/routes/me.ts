import { eq } from 'drizzle-orm'
import { users } from '../../db/index.js'
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
      'Who this session belongs to, and the platform role it is authorized as. Every client calls it first.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The person.', schema: Me },
    errors: [],
    handler: async ({ deps, actor }) => {
      const [user] = await deps.db.select().from(users).where(eq(users.id, actor.userId))
      // A valid signature over a user who no longer exists: authentication's answer.
      if (user === undefined)
        throw Object.assign(new Error('a session is required'), { statusCode: 401 })
      return toMe(user, actor.platformRole)
    },
  }),
]
