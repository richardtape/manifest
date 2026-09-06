import cookie from '@fastify/cookie'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import type { Db } from '../db/index.js'
import type { Config } from '../config.js'
import type { Driver } from '../runtime/index.js'
import type { SourceDriver } from '../source/index.js'
import type { BlueprintRegistry } from '../blueprints/index.js'
import { SESSION_COOKIE, verifySession } from '../identity/index.js'
import type { Actor } from '../projects/index.js'
import { BadRequestError, toErrorResponse } from './errors.js'
import { replayOrStore } from './idempotency.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerProjectRoutes } from './routes/projects.js'
import { registerDeliveryRoutes } from './routes/delivery.js'

export interface ServerDeps {
  db: Db
  config: Config
  driver: Driver
  source: SourceDriver
  blueprints: BlueprintRegistry
}

declare module 'fastify' {
  interface FastifyRequest {
    actor?: (Actor & { puid: string }) | undefined
  }
  interface FastifyContextConfig {
    /** `/auth/*` opts out: logging in twice is not a domain mutation. */
    idempotency?: 'exempt'
  }
  interface FastifyInstance {
    /** Wraps a mutating handler in its idempotency record. Decorated below. */
    idempotent(
      request: FastifyRequest,
      handler: () => Promise<{ status: number; body: unknown }>,
    ): Promise<{ status: number; body: unknown }>
    /** Every route registered, for Task 20's completeness check. */
    registeredRoutes: { method: string; url: string }[]
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function requireActor(request: FastifyRequest): Actor & { puid: string } {
  if (!request.actor) {
    throw Object.assign(new Error('a session is required'), { statusCode: 401 })
  }
  return request.actor
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(cookie)

  app.decorateRequest('actor', undefined)

  // Task 20's drift guard reads this. `onRoute` fires as routes register, so the
  // hook has to be added before the register* calls below, not after.
  const registered: { method: string; url: string }[] = []
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method]
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue
      registered.push({ method, url: route.url })
    }
  })
  app.decorate('registeredRoutes', registered)

  // One place turns a cookie into an actor. Routes never read the cookie.
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) return
    const session = verifySession(token, deps.config.sessionSecret)
    if (!session) return
    request.actor = {
      userId: session.userId,
      platformRole: session.role,
      puid: session.puid,
    }
  })

  // D23.6, applied by the framework rather than remembered per route.
  app.addHook('preHandler', async (request) => {
    if (!MUTATING.has(request.method)) return
    // A request that matched no route has no route options to opt out with, and
    // answering 400 here would mask the 404 — which is exactly what the "the
    // dev-login route is absent, not forbidden" test is checking for.
    if (request.routeOptions.url === undefined) return
    if (request.routeOptions.config?.idempotency === 'exempt') return
    const key = request.headers['idempotency-key']
    if (typeof key !== 'string' || key.length < 8) {
      throw new BadRequestError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'every mutating request needs an Idempotency-Key header of at least 8 characters',
        'Generate a UUID per user action and reuse it across retries of that action.',
      )
    }
  })

  app.setErrorHandler((error, request, reply) => {
    if ((error as { statusCode?: number }).statusCode === 401) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'a session is required',
          hint: 'Log in first.',
        },
      })
    }
    const { status, body } = toErrorResponse(error)
    if (status === 500) request.log.error({ err: error }, 'unhandled error')
    return reply.status(status).send(body)
  })

  /** Wraps a mutating handler in its idempotency record. */
  app.decorate(
    'idempotent',
    async (
      request: FastifyRequest,
      handler: () => Promise<{ status: number; body: unknown }>,
    ) => {
      const actor = requireActor(request)
      return replayOrStore(
        deps.db,
        {
          key: request.headers['idempotency-key'] as string,
          userId: actor.userId,
          route: `${request.method} ${request.routeOptions.url}`,
          body: request.body,
        },
        handler,
      )
    },
  )

  await registerAuthRoutes(app, deps)
  await registerProjectRoutes(app, deps)
  await registerDeliveryRoutes(app, deps)

  return app
}
