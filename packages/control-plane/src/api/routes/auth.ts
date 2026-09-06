import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  devLogin,
  signSession,
} from '../../identity/index.js'
import { requireActor, type ServerDeps } from '../server.js'

const loginBody = z.object({ puid: z.string().min(1).max(64) })

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
): Promise<void> {
  // Not registered at all outside development. Task 12 refuses to boot in that
  // state anyway; this makes the route surface match the configuration.
  if (deps.config.devAuth) {
    app.post(
      '/auth/dev-login',
      { config: { idempotency: 'exempt' } },
      async (request, reply) => {
        const { puid } = loginBody.parse(request.body)
        // Not a hardcoded `true`. The route is only registered when devAuth is on,
        // so this is belt-and-braces — but with `true` here the registration guard
        // was the ONLY thing between this endpoint and an authentication bypass:
        // flipping that one condition made it mint real sessions (measured — it
        // answered 200, not the refusal the plan expected). Two independent reads of
        // the same setting is the point.
        const { user, session } = await devLogin(deps.db, puid, {
          devAuthEnabled: deps.config.devAuth,
        })
        reply.setCookie(SESSION_COOKIE, signSession(session, deps.config.sessionSecret), {
          httpOnly: true,
          sameSite: 'lax',
          secure: deps.config.env !== 'development',
          path: '/',
          maxAge: SESSION_TTL_MS / 1000,
        })
        return reply.status(200).send({
          id: user.id,
          puid: user.ubcCwlPuid,
          displayName: user.displayName,
          role: user.role,
        })
      },
    )
  }

  app.get('/auth/me', async (request) => {
    const actor = requireActor(request)
    return { id: actor.userId, puid: actor.puid, role: actor.platformRole }
  })

  app.post(
    '/auth/logout',
    { config: { idempotency: 'exempt' } },
    async (_request, reply) => {
      reply.clearCookie(SESSION_COOKIE, { path: '/' })
      return reply.status(204).send()
    },
  )
}
