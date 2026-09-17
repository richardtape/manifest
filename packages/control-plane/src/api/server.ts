import { readFileSync } from 'node:fs'
import cookie from '@fastify/cookie'
import websocket from '@fastify/websocket'
import type { EventBus } from '../observability/index.js'
import { registerEventRoutes } from './routes/events.js'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import type { Db } from '../db/index.js'
import type { Config } from '../config.js'
import type { Driver } from '../runtime/index.js'
import type { SourceDriver } from '../source/index.js'
import type { BlueprintRegistry } from '../blueprints/index.js'
import type { ServiceCredentialResolver } from '../services/index.js'
import type { AppSecretResolver } from '../secrets/index.js'
import { SESSION_COOKIE, verifySession } from '../identity/index.js'
import type { Actor } from '../projects/index.js'
import { BadRequestError, toErrorResponse } from './errors.js'
import { replayOrStore } from './idempotency.js'
import { registerAuthRoutes } from './routes/auth.js'
import type { SsoRegistrar } from '../sso/index.js'
import type { SamlSp } from '../identity/index.js'
import type { AiKeyService, ModelCatalogue } from '../ai/index.js'
import type { Retirer } from '../releases/index.js'
import { registerProjectRoutes } from './routes/projects.js'
import { registerDeliveryRoutes } from './routes/delivery.js'
import { registryTokenRoutes } from './routes/registry-token.js'

export interface ServerDeps {
  db: Db
  config: Config
  driver: Driver
  source: SourceDriver
  blueprints: BlueprintRegistry
  /** §12's stored service credentials, with the master key already bound. */
  secrets: ServiceCredentialResolver
  /** §8's SESSION_SECRET, same shape and same reason as `secrets`. */
  appSecrets: AppSecretResolver
  /**
   * §9's SP registrar, with the IdP pool, the master key and the platform's
   * entity base already bound — so `api/` and `releases/` hold no key material
   * and no second connection. Same shape as `secrets` above, for the same reason.
   */
  sso: SsoRegistrar
  /**
   * §9's other half: Manifest's own Service Provider, with its entity, its
   * keypair and the IdP's certificate already bound. `/auth/login` and
   * `/auth/saml/callback` hold no key material and build no URLs.
   */
  samlSp: SamlSp
  /**
   * D17's catalogue, read from LiteLLM and cached (P4b Task 6). `enabled` is false
   * under `MANIFEST_AI_ENABLED=0`, and then it is never read — see `src/index.ts`.
   */
  catalogue: ModelCatalogue
  /**
   * §10's app-key lifecycle, with the LiteLLM client and the master keypair bound (P4b
   * Task 9), handed to `deployRelease`. `enabled` is false under
   * `MANIFEST_AI_ENABLED=0`, and then every step refuses, naming the setting.
   */
  ai: AiKeyService
  /**
   * D23.2's per-project fan-out (P4b Task 14): `WS /v1/projects/:projectId/events`
   * subscribes to it. ONE bus per process, built at boot, so every publisher and every
   * socket meet on the same instance.
   */
  bus: EventBus
  /**
   * THE CONTROL PLANE'S FIRST BACKGROUND WORK (P4c Task 7): what drains and removes
   * the instances a deploy replaced. ONE per process, like the bus, and built at boot
   * — a deploy calls `schedule` and returns (R3), and `idle()` is what the acceptance
   * and the Docker tier wait on.
   */
  retirer: Retirer
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
  // Before any route: its `onRoute` hook is what turns a route with a `wsHandler` into
  // one that can upgrade, and a hook added after a route never sees that route.
  await app.register(websocket)

  /**
   * Fastify does not parse `application/x-www-form-urlencoded` by default, and the
   * registry token realm receives exactly that: Docker 29 and BuildKit use the
   * OAuth2 POST form grant. Without a parser `request.body` is `undefined`, every
   * grant comes back empty, and the symptom is a scope refusal on a correct
   * credential — indistinguishable from the policy working.
   *
   * Written here rather than by adding `@fastify/formbody`. Six lines against a
   * dependency in the process that holds the Docker socket and mints registry push
   * tokens; Decision 1 makes that trade for the same reason one component down.
   */
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)))
    },
  )

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
    if (status === 500) {
      // `console.error`, NOT `request.log.error`. This server is built with
      // `logger: false`, under which `request.log.error` EXISTS, accepts the call
      // and writes nothing — the same trap the boot line hit with `app.log.info`
      // (Session 4). So the only record of an unexpected failure vanished: a
      // deploy answered 500 INTERNAL with nothing in the process output, nothing
      // in the database and nothing on the wire. Measured by `make demo` on
      // 2026-09-07, where the cause turned out to be three frames down a stack
      // nobody could see.
      //
      // The envelope stays deliberately opaque to the CLIENT (D23.7) — that is a
      // §20 decision and is not changed here. This is the OPERATOR's copy.
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'unhandled error',
          method: request.method,
          url: request.url,
          error: (error as Error).message,
        }),
      )
      console.error((error as Error).stack ?? error)
    }
    return reply.status(status).send(body)
  })

  /**
   * D23.7 for a path that matched nothing, too. Fastify's default answers
   * `{"message":"Route GET:/projects not found","error":"Not Found","statusCode":404}`,
   * which is a shape no client switches on — and after the `/v1` move (P5a Task 2) an
   * old path is exactly what a stale script or a stale bookmark will send. The path is
   * echoed without its query string and capped: it is the caller's own input.
   */
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `no route ${request.method} ${request.url.split('?')[0]!.slice(0, 200)}`,
        hint:
          'Every resource route is under /v1/ (D23.8). Signing in is /auth/login; ' +
          'the document at packages/contract/openapi.json lists every route.',
      },
    }),
  )

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

  /**
   * The PEMs are read once, here, and a missing file is a hard failure naming the
   * command that creates it. The alternative — registering the realm with empty
   * PEMs — produces a route that exists, answers, and mints tokens no registry will
   * ever accept, which is the kind of green this project keeps paying for.
   */
  const readIssuerPem = (path: string, which: string): string => {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      throw new Error(
        `cannot read the registry token ${which} at '${path}'. ` +
          'Run `make seed`, which generates infra/registry-auth/token.{key,crt}.',
      )
    }
  }
  await app.register(
    registryTokenRoutes({
      keyPem: readIssuerPem(deps.config.registryTokenKeyPath, 'key'),
      certPem: readIssuerPem(deps.config.registryTokenCertPath, 'certificate'),
      issuer: 'manifest-control-plane',
      service: 'manifest-registry',
      buildCredentialSecret: deps.config.buildCredentialSecret,
    }),
  )

  await registerAuthRoutes(app, deps)
  await registerProjectRoutes(app, deps)
  await registerDeliveryRoutes(app, deps)
  await registerEventRoutes(app, deps)

  return app
}
